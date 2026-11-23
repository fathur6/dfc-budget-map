import { useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, Check, CreditCard, Wallet } from 'lucide-react'
import { money, monthLabel, parseMoney } from './budget.js'
import { MoneyField } from './editors.jsx'
import { commitmentChecklist, markCommitmentPaid, spendingChecklist } from './transfers.js'

function Checklist({ id, title, icon: Icon, rows, isComplete, verb, empty, children }) {
  const actionable = rows.filter(row => row.amount > 0)
  const pending = actionable.filter(row => !isComplete(row))
  return <section className="panel transfer-checklist" aria-labelledby={id}>
    <div className="panel-heading">
      <div><div className="section-title"><Icon size={18} /><h2 id={id}>{title}</h2></div>
        <p>{actionable.length - pending.length} of {actionable.length} {verb} · {money(pending.reduce((sum, row) => sum + row.amount, 0))} remaining</p>
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
  const spending = spendingChecklist(data, month)
  const current = today.slice(0, 7)
  const baseIncome = Object.hasOwn(data.incomeByMonth, month) ? data.incomeByMonth[month] : data.income
  const additional = summary.otherIncome + summary.loanProceeds

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
    return update(() => ({ ...data, incomeByMonth: { ...data.incomeByMonth, [month]: income } }))
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
          <p>Save the take-home salary for {monthLabel(month, 'long')}.</p></div>
        <div className="transfer-inflow-value"><strong>{money(summary.cashInflow)}</strong>
          {additional > 0 && <small>Includes {money(additional)} in other inflows</small>}</div>
      </div>
      <form className="transfer-income-form" onSubmit={saveIncome}>
        <MoneyField key={baseIncome} name="income" label="Take-home salary" value={baseIncome} placeholder="Enter monthly salary" />
        <button type="submit" className="button primary" disabled={saving}>Save income</button>
      </form>
    </section>
    <p className="transfer-instruction">Tick each item after completing it in your banking app. Payments marked today use {monthLabel(current)} for cash flow.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="transfer-checklists" aria-busy={saving}>
      <Checklist id="checklist-commitments" title="Commitment payments" icon={CreditCard} rows={commitments}
        verb="paid" isComplete={row => row.status === 'paid'} empty="No commitment payments on this checklist.">
        {row => <>
          <div className="transfer-row-description">
            <button type="button" className="transfer-row-name"
              onClick={() => open({ type: 'payment', item: row.item, month: row.dueMonth })} disabled={saving}>{row.item.name}</button>
            <small>{row.portion === 'remainder' ? 'Carried balance · ' : row.portion === 'partial' ? 'Partial payment · ' : ''}
              Due {Number(row.due.slice(-2))} {monthLabel(row.dueMonth)}
              {row.paidMonth && row.paidMonth !== month && ' · Paid in ' + monthLabel(row.paidMonth)}</small>
          </div>
          <strong className="transfer-row-amount">{money(row.amount)}</strong>
          {row.status === 'paid' ? <span className="transfer-complete"><Check size={14} /> Paid</span>
            : <button type="button" className="button secondary" aria-label={'Mark ' + row.item.name + (row.portion === 'remainder' ? ' carried balance' : '') + ' paid'}
              disabled={saving} onClick={() => update(() => markCommitmentPaid(data, row, month, today))}>Mark paid</button>}
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
