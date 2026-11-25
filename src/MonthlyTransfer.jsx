import { useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, Check, CreditCard, Wallet } from 'lucide-react'
import { addMonths, dateLabel, money, monthLabel, parseMoney, todayMYT } from './budget.js'
import { MoneyField } from './editors.jsx'
import { commitmentChecklist, markCommitmentPaid, spendingChecklist } from './transfers.js'

function Checklist({ id, title, icon: Icon, rows, isComplete, verb, empty, children }) {
  const actionable = rows.filter(row => row.amount > 0)
  const pending = actionable.filter(row => !isComplete(row))
  return <section className="panel transfer-checklist" aria-labelledby={id}>
    <div className="panel-heading">
      <div><div className="section-title"><Icon size={18} /><h2 id={id}>{title}</h2></div>
        <p>{actionable.length - pending.length} of {actionable.length} {verb} · {money(pending.reduce((sum, row) => sum + (row.remaining ?? row.amount), 0))} remaining</p>
      </div>
    </div>
    {rows.length ? <ul className="transfer-rows">{rows.map(row => <li key={row.key}>{children(row)}</li>)}</ul>
      : <p className="transfer-empty">{empty}</p>}
  </section>
}

export function MonthlyTransfer({ data, month, today, summary, save, open }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const commitments = commitmentChecklist(data, month, today)
  const firstPayable = new Map()
  for (const row of commitments) {
    if (row.status !== 'paid' && row.dueMonth <= month && !firstPayable.has(row.item.id)) {
      firstPayable.set(row.item.id, row.key)
    }
  }
  const spending = spendingChecklist(data, month)
  const current = today.slice(0, 7)
  const baseIncome = Object.hasOwn(data.incomeByMonth, month) ? data.incomeByMonth[month] : data.income
  const additional = summary.otherIncome + summary.loanProceeds
  const salaryReceived = data.salaryReceipts?.[month]
  const canRecordReceipt = month === current || month === addMonths(current, 1)

  async function update(change) {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await save(change())
    } catch (failure) {
      setError(failure.message || 'Could not save the checklist.')
    } finally {
      setSaving(false)
    }
  }

  function saveIncome(event) {
    event.preventDefault()
    const income = parseMoney(new FormData(event.currentTarget).get('income'))
    if (income == null) {
      setError('Enter a valid amount with up to two decimal places.')
      return
    }
    const received = event.nativeEvent.submitter?.value === 'received'
    const paymentDate = todayMYT()
    const receivedMonth = paymentDate.slice(0, 7)
    if (received && month !== receivedMonth && month !== addMonths(receivedMonth, 1)) {
      setError('Select the current or next budget month to record salary received.')
      return
    }
    return update(() => ({
      ...data,
      incomeByMonth: { ...data.incomeByMonth, [month]: income },
      ...(received && { salaryReceipts: { ...data.salaryReceipts, [month]: paymentDate } }),
    }))
  }

  function toggleTransfer(row) {
    const entry = { ...data.spending[row.key] }
    if (row.transferred) delete entry.transferred
    else entry.transferred = true
    return update(() => ({
      ...data,
      spending: { ...data.spending, [row.key]: entry },
    }))
  }

  return <div id="monthly-transfer" className="monthly-transfer">
    <section className="panel transfer-income" aria-labelledby="transfer-income-title">
      <div className="panel-heading">
        <div><div className="section-title"><ArrowDownLeft size={19} /><h2 id="transfer-income-title">Cash inflow</h2></div>
          <p>{salaryReceived ? `Salary received on ${dateLabel(salaryReceived)} · ${monthLabel(month, 'long')} budget`
            : `Save the take-home salary for ${monthLabel(month, 'long')}.`}</p></div>
        <div className="transfer-inflow-value"><strong>{money(summary.cashInflow)}</strong>
          {additional > 0 && <small>Includes {money(additional)} in other inflows</small>}</div>
      </div>
      <form className="transfer-income-form" onSubmit={saveIncome}>
        <MoneyField key={baseIncome} name="income" label="Take-home salary" value={baseIncome} placeholder="Enter monthly salary" />
        <button type="submit" className={canRecordReceipt && !salaryReceived ? 'button secondary' : 'button primary'} disabled={saving}>Save income</button>
        {canRecordReceipt && !salaryReceived && <button type="submit" value="received" className="button primary" disabled={saving}>Salary received</button>}
      </form>
    </section>
    <p className="transfer-instruction">Tick each item after completing it in your banking app. Payments for next month count toward that budget from the 21st, or from an earlier salary receipt. Spending transfers use the month shown.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="transfer-checklists" aria-busy={saving}>
      <Checklist id="checklist-commitments" title="Commitment payments" icon={CreditCard} rows={commitments}
        verb="paid" isComplete={row => row.status === 'paid'} empty="No commitment payments on this checklist.">
        {row => <>
          <div className="transfer-row-description">
            <button type="button" className="transfer-row-name"
              onClick={() => open({ type: 'payment', item: row.item, month: row.dueMonth, allocationMonth: month })} disabled={saving}>{row.item.name}</button>
            <small>{row.portion === 'remainder' ? 'Carried balance · ' : row.portion === 'partial' ? 'Partial payment · ' : ''}
              Due {Number(row.due.slice(-2))} {monthLabel(row.dueMonth)}
              {row.paidDate ? ' · Paid on ' + dateLabel(row.paidDate)
                : row.paidMonth && row.paidMonth !== month && ' · Paid in ' + monthLabel(row.paidMonth)}</small>
            {row.remaining > 0 && row.remaining < row.amount && <small>
              {money(row.amount - row.remaining)} paid · {money(row.remaining)} remaining</small>}
            {firstPayable.get(row.item.id) === row.key && <button type="button" className="transfer-allocation-link" disabled={saving}
              aria-label={'Record amount for ' + row.item.name}
              onClick={() => open({ type: 'allocate-payment', item: row.item, month })}>Record amount</button>}
          </div>
          <strong className="transfer-row-amount">{money(row.remaining > 0 ? row.remaining : row.amount)}</strong>
          {row.status === 'paid' ? <span className="transfer-complete"><Check size={14} /> Paid</span>
            : <button type="button" className="button secondary" aria-label={'Mark ' + row.item.name + (row.portion === 'remainder' ? ' carried balance' : '') + ' paid'}
              disabled={saving} onClick={() => update(() => markCommitmentPaid(data, row, month, todayMYT()))}>Mark paid</button>}
        </>}
      </Checklist>
      <Checklist id="checklist-spending" title="Spending transfers" icon={Wallet} rows={spending}
        verb="transferred" isComplete={row => row.transferred} empty="No spending items for this month.">
        {row => <>
          <div className="transfer-row-description">
            <button type="button" className="transfer-row-name"
              onClick={() => open({ type: 'spending', item: row.item, month })} disabled={saving}>{row.item.name}</button>
            {row.item.category && <small>{row.item.category}</small>}
          </div>
          <strong className="transfer-row-amount">{money(row.amount)}</strong>
          {row.amount == null ? <button type="button" className="button secondary" disabled={saving}
            aria-label={'Set amount for ' + row.item.name} onClick={() => open({ type: 'spending', item: row.item, month })}>Set amount</button>
            : <button type="button" className={row.transferred ? 'button transfer-complete' : 'button secondary'}
              aria-pressed={row.transferred} aria-label={(row.transferred ? 'Undo transfer for ' : 'Transfer for ') + row.item.name} disabled={saving}
              onClick={() => toggleTransfer(row)}>
              {row.transferred ? <><Check size={14} /> Transferred</> : <><ArrowLeftRight size={14} /> Transfer</>}
            </button>}
        </>}
      </Checklist>
    </div>
  </div>
}
