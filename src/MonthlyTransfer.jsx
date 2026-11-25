import { useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowDownLeft, ArrowLeftRight, Check, CreditCard, Wallet } from 'lucide-react'
import { addMonths, dateLabel, money, monthLabel, parseMoney, todayMYT } from './budget.js'
import { MoneyField } from './editors.jsx'
import { checklistProgress, commitmentChecklist, isOutstandingArrears, markCommitmentPaid, spendingChecklist } from './transfers.js'

function TransferProgress({ title, icon: Icon, progress, done, pending, pendingTone, onArrears }) {
  const { total, completedAmount, remaining, arrears } = progress
  const percentage = total ? Math.round(completedAmount / total * 1000) / 10 : 0
  const displayed = remaining > 0 && percentage === 100 ? 99.9 : percentage
  const detail = `${done} ${money(completedAmount)}, ${pending.toLowerCase()} ${money(remaining)}`
    + (arrears > 0 ? `, including ${money(arrears)} in arrears` : '')
  return <div className="transfer-progress-card">
    <div className="transfer-progress-head">
      <h3><Icon size={15} aria-hidden="true" />{title}</h3>
      <strong>{total ? displayed + '%' : '—'}</strong>
    </div>
    <div className="transfer-progress-track" role="progressbar" aria-label={title + ' by amount'} aria-valuenow={displayed}
      aria-valuetext={total ? detail : 'No amounts on this checklist'}>
      {completedAmount > 0 && <span className="progress-done" style={{ flexGrow: completedAmount }} />}
      {remaining > arrears && <span className={pendingTone} style={{ flexGrow: remaining - arrears }} />}
      {arrears > 0 && <span className="progress-arrears" style={{ flexGrow: arrears }} />}
    </div>
    <dl className="transfer-progress-values">
      <div><dt><i className="progress-done" />{done}</dt><dd>{money(completedAmount)}</dd></div>
      <div><dt><i className={pendingTone} />{pending}</dt><dd>{money(remaining)}</dd></div>
    </dl>
    {arrears > 0 && <button className="transfer-progress-arrears" type="button" onClick={onArrears} aria-controls="transfer-arrears">
      <i className="progress-arrears" aria-hidden="true" />Includes {money(arrears)} in arrears <ArrowDown size={12} aria-hidden="true" />
    </button>}
  </div>
}

function Checklist({ id, title, icon: Icon, rows, progress, verb, empty, arrearsRows = [], arrearsHeading, children }) {
  const renderRows = (entries, className) => <ul className={className}>{entries.map(row => <li key={row.key}>{children(row)}</li>)}</ul>
  return <section className="panel transfer-checklist" aria-labelledby={id}>
    <div className="panel-heading">
      <div><div className="section-title"><Icon size={18} /><h2 id={id}>{title}</h2></div>
        <p>{progress.completed} of {progress.count} {verb} · {money(progress.remaining)} remaining</p>
      </div>
    </div>
    {arrearsRows.length > 0 && <>{arrearsHeading}{renderRows(arrearsRows, 'transfer-rows transfer-arrears-rows')}</>}
    {rows.length > 0 && renderRows(rows, 'transfer-rows')}
    {!rows.length && !arrearsRows.length && <p className="transfer-empty">{empty}</p>}
  </section>
}

export function MonthlyTransfer({ data, month, today, summary, save, open }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const arrearsHeading = useRef(null)
  const commitments = commitmentChecklist(data, month, today)
  const isArrears = row => isOutstandingArrears(row, month, today)
  const arrearsRows = commitments.filter(isArrears).sort((a, b) => a.due.localeCompare(b.due))
  const commitmentProgress = checklistProgress(commitments, row => row.status === 'paid' ? 0 : row.remaining ?? row.amount, isArrears)
  const firstPending = new Map()
  for (const row of commitments) {
    if (row.status !== 'paid' && !firstPending.has(row.item.id)) firstPending.set(row.item.id, row.key)
  }
  const spending = spendingChecklist(data, month)
  const spendingProgress = checklistProgress(spending, row => row.transferred ? 0 : row.amount)
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

  function showArrears() {
    arrearsHeading.current?.scrollIntoView({ block: 'start' })
    arrearsHeading.current?.focus({ preventScroll: true })
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
      <div className="transfer-income-body">
        <form className="transfer-income-form" onSubmit={saveIncome}>
          <MoneyField key={baseIncome} name="income" label="Take-home salary" value={baseIncome} placeholder="Enter monthly salary" />
          <button type="submit" className={canRecordReceipt && !salaryReceived ? 'button secondary' : 'button primary'} disabled={saving}>Save income</button>
          {canRecordReceipt && !salaryReceived && <button type="submit" value="received" className="button primary" disabled={saving}>Salary received</button>}
        </form>
        <div className="transfer-progress-grid">
          <TransferProgress title="Commitment payments" icon={CreditCard} progress={commitmentProgress}
            done="Paid" pending="Unpaid" pendingTone="progress-unpaid" onArrears={showArrears} />
          <TransferProgress title="Spending transfers" icon={Wallet} progress={spendingProgress}
            done="Transferred" pending="Not transferred" pendingTone="progress-untransferred" />
        </div>
      </div>
    </section>
    <p className="transfer-instruction">Record payments after completing them in your banking app. Overdue balances roll into the next budget from the 21st. Use Record amount to apply a payment to the oldest instalment first. Spending transfers use the month shown.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="transfer-checklists" aria-busy={saving}>
      <Checklist id="checklist-commitments" title="Commitment payments" icon={CreditCard} rows={commitments.filter(row => !isArrears(row))}
        progress={commitmentProgress} verb="paid" empty="No commitment payments on this checklist." arrearsRows={arrearsRows}
        arrearsHeading={<div className="transfer-arrears-heading">
          <h3 id="transfer-arrears" ref={arrearsHeading} tabIndex={-1}><AlertTriangle size={15} aria-hidden="true" />Outstanding arrears</h3>
          <strong>{money(commitmentProgress.arrears)}</strong>
        </div>}>
        {row => <>
          <div className="transfer-row-description">
            <button type="button" className="transfer-row-name"
              onClick={() => open({ type: 'payment', item: row.item, month: row.dueMonth, allocationMonth: month })} disabled={saving}>{row.item.name}</button>
            <small>{row.portion === 'remainder' ? 'Carried balance · ' : isArrears(row) ? 'Overdue · ' : row.portion === 'partial' ? 'Partial payment · ' : ''}
              Due {Number(row.due.slice(-2))} {monthLabel(row.dueMonth)}
              {row.paidDate ? ' · Paid on ' + dateLabel(row.paidDate)
                : row.paidMonth && row.paidMonth !== month && ' · Paid in ' + monthLabel(row.paidMonth)}</small>
            {row.remaining > 0 && row.remaining < row.amount && <small>
              {money(row.amount - row.remaining)} paid · {money(row.remaining)} remaining</small>}
            {firstPending.get(row.item.id) === row.key && row.dueMonth <= month && <button type="button" className="transfer-allocation-link" disabled={saving}
              aria-label={'Record amount for ' + row.item.name}
              onClick={() => open({ type: 'allocate-payment', item: row.item, month })}>Record amount</button>}
          </div>
          <strong className="transfer-row-amount">{money(row.remaining > 0 ? row.remaining : row.amount)}</strong>
          {row.status === 'paid' ? <span className="transfer-complete"><Check size={14} /> Paid</span>
            : <button type="button" className="button secondary" aria-label={`Mark ${row.item.name}, due ${dateLabel(row.due)}, paid`}
              disabled={saving || firstPending.get(row.item.id) !== row.key}
              onClick={() => update(() => markCommitmentPaid(data, row, month, todayMYT()))}>Mark paid</button>}
        </>}
      </Checklist>
      <Checklist id="checklist-spending" title="Spending transfers" icon={Wallet} rows={spending}
        progress={spendingProgress} verb="transferred" empty="No spending items for this month.">
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
