import { t } from './preferences.js'
import { useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowDownLeft, ArrowLeftRight, Check, CreditCard, Pencil, Wallet } from 'lucide-react'
import { addMonths, appendIncomeSource, dateLabel, money, monthLabel, parseMoney, todayMYT } from './budget.js'
import { MoneyField } from './editors.jsx'
import { SavingsTransfers } from './SavingsJars.jsx'
import { checklistProgress, commitmentChecklist, isOutstandingArrears, markCommitmentPaid, spendingChecklist } from './transfers.js'

const transferIncomeTypes = ['Loan proceeds', 'Incentive', 'Gift', 'Freelance']

function AdditionalIncome({ data, month, saving, update, open }) {
  const [error, setError] = useState('')
  const entries = data.incomeSourcesByMonth?.[month] ?? []

  async function addSource(event) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const type = fields.get('source')
    const amount = parseMoney(fields.get('source-amount'))
    if (await update(() => appendIncomeSource(data, month, type, amount), setError)) form.reset()
  }

  return <section className="transfer-extra-income" aria-labelledby="transfer-extra-income-title">
    <div className="transfer-extra-heading">
      <h3 id="transfer-extra-income-title">{t("Additional income")}</h3>
      {entries.length > 0 && <button type="button" className="link-button" disabled={saving}
        onClick={() => open({ type: 'income', month })}>{t("Edit sources")}</button>}
    </div>
    <form onSubmit={addSource}>
      <fieldset className="transfer-source-fields" aria-labelledby="transfer-extra-income-title" disabled={saving}>
        <label className="field"><span>{t("Source")}</span>
          <select name="source" defaultValue="" required>
            <option value="" disabled>{t("Choose source")}</option>
            {transferIncomeTypes.map(type => <option key={type} value={type}>{type === 'Loan proceeds' ? t("Loan") : t(type)}</option>)}
          </select>
        </label>
        <MoneyField label={t("Amount")} name="source-amount" />
        <button type="submit" className="button secondary">{t("Add income")}</button>
      </fieldset>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
    </form>
    {entries.length > 0 && <ul className="transfer-source-list" aria-label={t("Saved income sources")}>
      {entries.map(({ type, name, amount }, index) => <li key={index}>
        <span>{t(type)}{name && <small>{name}</small>}</span><strong>{money(amount)}</strong>
      </li>)}
    </ul>}
  </section>
}

function TransferProgress({ title, icon: Icon, progress, done, pending, pendingTone, onArrears }) {
  const { total, completedAmount, remaining, arrears } = progress
  const percentage = total ? Math.round(completedAmount / total * 1000) / 10 : 0
  const displayed = remaining > 0 && percentage === 100 ? 99.9 : percentage
  const detail = `${done} ${money(completedAmount)}, ${pending.toLowerCase()} ${money(remaining)}`
    + (arrears > 0 ? ', ' + t('{amount} in arrears', { amount: money(arrears) }) : '')
  return <div className="transfer-progress-card">
    <div className="transfer-progress-head">
      <h3><Icon size={15} aria-hidden="true" />{title}</h3>
      <strong>{total ? displayed + '%' : '—'}</strong>
    </div>
    <div className="transfer-progress-track" role="progressbar" aria-label={title + t(" by amount")} aria-valuenow={displayed}
      aria-valuetext={total ? detail : t("No amounts on this checklist")}>
      {completedAmount > 0 && <span className="progress-done" style={{ flexGrow: completedAmount }} />}
      {remaining > arrears && <span className={pendingTone} style={{ flexGrow: remaining - arrears }} />}
      {arrears > 0 && <span className="progress-arrears" style={{ flexGrow: arrears }} />}
    </div>
    <dl className="transfer-progress-values">
      <div><dt><i className="progress-done" />{done}</dt><dd>{money(completedAmount)}</dd></div>
      <div><dt><i className={pendingTone} />{pending}</dt><dd>{money(remaining)}</dd></div>
    </dl>
    {arrears > 0 && <button className="transfer-progress-arrears" type="button" onClick={onArrears} aria-controls="transfer-arrears">
      <i className="progress-arrears" aria-hidden="true" />{t("Includes")} {money(arrears)} {t("in arrears")} <ArrowDown size={12} aria-hidden="true" />
    </button>}
  </div>
}

function Checklist({ id, title, icon: Icon, rows, progress, verb, empty, arrearsRows = [], arrearsHeading, hidden, children }) {
  const renderRows = (entries, className) => <ul className={className}>{entries.map(row => <li key={row.key}>{children(row)}</li>)}</ul>
  return <section className="panel transfer-checklist" id={'panel-' + id} aria-labelledby={id} hidden={hidden}>
    <div className="panel-heading">
      <div><div className="section-title"><Icon size={18} /><h2 id={id}>{title}</h2></div>
        <p>{progress.completed} {t("of")} {progress.count} {verb} · {money(progress.remaining)} {t("remaining")}</p>
      </div>
    </div>
    {arrearsRows.length > 0 && <>{arrearsHeading}{renderRows(arrearsRows, 'transfer-rows transfer-arrears-rows')}</>}
    {rows.length > 0 && renderRows(rows, 'transfer-rows')}
    {!rows.length && !arrearsRows.length && <p className="transfer-empty">{empty}</p>}
  </section>
}

export function MonthlyTransfer({ data, month, today, summary, save, open, compact }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checklist, setChecklist] = useState('commitments')
  const [editingIncome, setEditingIncome] = useState(false)
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
  const regularCommitments = commitments.filter(row => !isArrears(row))
  const spendingRows = compact ? [...spending].sort((a, b) => Number(a.transferred) - Number(b.transferred)) : spending
  if (compact) regularCommitments.sort((a, b) => Number(a.status === 'paid') - Number(b.status === 'paid'))
  const showCommitments = !compact || checklist === 'commitments'
  const showSpending = !compact || checklist === 'spending'
  const current = today.slice(0, 7)
  const baseIncome = Object.hasOwn(data.incomeByMonth, month) ? data.incomeByMonth[month] : data.income
  const additional = summary.otherIncome + summary.loanProceeds
  const salaryReceived = data.salaryReceipts?.[month]
  const canRecordReceipt = month === current || month === addMonths(current, 1)

  async function update(change, reportError = setError) {
    if (saving) return false
    setSaving(true)
    reportError('')
    try {
      await save(change())
      return true
    } catch (failure) {
      reportError(failure.message || 'Could not save the budget.')
      return false
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

  const instructions = t("Record payments after completing them in your banking app. Overdue balances roll into the next budget from the 21st. Use Record amount to apply a payment to the oldest instalment first. Spending transfers use the month shown.")

  return <div id="monthly-transfer" className="monthly-transfer">
    <section className="panel transfer-income" aria-labelledby="transfer-income-title">
      <div className="panel-heading">
        <div><div className="section-title"><ArrowDownLeft size={19} /><h2 id="transfer-income-title">{t("Cash inflow")}</h2></div>
          {(!compact || editingIncome) && <p>{salaryReceived ? t("Salary received on {date} · {month} budget", { date: dateLabel(salaryReceived), month: monthLabel(month, 'long') })
            : t("Save the take-home salary for {month}.", { month: monthLabel(month, 'long') })}</p>}</div>
        <div className="transfer-inflow-value" aria-live="polite"><strong>{money(summary.cashInflow ?? (additional || null))}</strong>
          {additional > 0 && <small>{summary.cashInflow == null ? t("Recorded inflows · salary unknown")
            : t("Includes {amount} in other inflows", { amount: money(additional) })}</small>}</div>
        {compact && <button type="button" className="icon-button transfer-edit-income" aria-expanded={editingIncome}
          aria-label={t(editingIncome ? "Hide cash inflow editor" : "Edit cash inflow")}
          aria-controls="transfer-cash-inputs" disabled={saving} onClick={() => setEditingIncome(value => !value)}>
          <Pencil size={16} aria-hidden="true" />
        </button>}
      </div>
      <div className="transfer-income-body" hidden={compact && !editingIncome}>
        <div className="transfer-income-inputs" id="transfer-cash-inputs">
          <form className="transfer-income-form" onSubmit={saveIncome}>
            <MoneyField key={baseIncome} name="income" label={t("Take-home salary")} value={baseIncome} placeholder={t("Enter monthly salary")} />
            <button type="submit" className={canRecordReceipt && !salaryReceived ? 'button secondary' : 'button primary'} disabled={saving}>{t("Save income")}</button>
            {canRecordReceipt && !salaryReceived && <button type="submit" value="received" className="button primary" disabled={saving}>{t("Salary received")}</button>}
          </form>
          <AdditionalIncome data={data} month={month} saving={saving} update={update} open={open} />
        </div>
        {!compact && <div className="transfer-progress-grid">
          <TransferProgress title={t("Commitment payments")} icon={CreditCard} progress={commitmentProgress}
            done={t("Paid")} pending={t("Unpaid")} pendingTone="progress-unpaid" onArrears={showArrears} />
          <TransferProgress title={t("Spending transfers")} icon={Wallet} progress={spendingProgress}
            done={t("Transferred")} pending={t("Not transferred")} pendingTone="progress-untransferred" />
        </div>}
      </div>
    </section>
    <SavingsTransfers data={data} month={month} today={today} summary={summary} open={open} disabled={saving} />
    {compact ? <div className="transfer-mobile-progress">
      {showCommitments ? <TransferProgress title={t("Commitment payments")} icon={CreditCard} progress={commitmentProgress}
        done={t("Paid")} pending={t("Unpaid")} pendingTone="progress-unpaid" onArrears={showArrears} />
        : <TransferProgress title={t("Spending transfers")} icon={Wallet} progress={spendingProgress}
          done={t("Transferred")} pending={t("Not transferred")} pendingTone="progress-untransferred" />}
      <div className="mobile-segmented" role="group" aria-label={t("Payment checklists")}>
        <button type="button" aria-pressed={showCommitments} aria-controls="panel-checklist-commitments"
          onClick={() => setChecklist('commitments')}>{t("Commitments")}</button>
        <button type="button" aria-pressed={showSpending} aria-controls="panel-checklist-spending"
          onClick={() => setChecklist('spending')}>{t("Spending")}</button>
      </div>
    </div> : <p className="transfer-instruction">{instructions}</p>}
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <div className="transfer-checklists" aria-busy={saving}>
      <Checklist id="checklist-commitments" title={t("Commitment payments")} icon={CreditCard} rows={regularCommitments} hidden={!showCommitments}
        progress={commitmentProgress} verb={t("paid")} empty={t("No commitment payments on this checklist.")} arrearsRows={arrearsRows}
        arrearsHeading={<div className="transfer-arrears-heading">
          <h3 id="transfer-arrears" ref={arrearsHeading} tabIndex={-1}><AlertTriangle size={15} aria-hidden="true" />{t("Outstanding arrears")}</h3>
          <strong>{money(commitmentProgress.arrears)}</strong>
        </div>}>
        {row => <>
          <div className="transfer-row-description">
            <button type="button" className="transfer-row-name"
              onClick={() => open({ type: 'payment', item: row.item, month: row.dueMonth, allocationMonth: month })} disabled={saving}>{row.item.name}</button>
            <small>{row.spendingTransferred ? t("From Monthly Spending") : <>
              {row.portion === 'remainder' ? t("Carried balance · ") : isArrears(row) ? t("Overdue · ") : row.portion === 'partial' ? t("Partial payment · ") : ''}{t("Due")} {Number(row.due.slice(-2))} {monthLabel(row.dueMonth)}
              {row.paidDate ? ' · ' + t('Paid on ') + dateLabel(row.paidDate)
                : row.paidMonth && row.paidMonth !== month && ' · ' + t('Paid in ') + monthLabel(row.paidMonth)}
            </>}</small>
            {row.remaining > 0 && row.remaining < row.amount && <small>
              {money(row.amount - row.remaining)} {t("paid ·")} {money(row.remaining)} {t("remaining")}</small>}
            {firstPending.get(row.item.id) === row.key && row.dueMonth <= month && <button type="button" className="transfer-allocation-link" disabled={saving}
              aria-label={t("Record amount for ") + row.item.name}
              onClick={() => open({ type: 'allocate-payment', item: row.item, month })}>{t("Record amount")}</button>}
          </div>
          <strong className="transfer-row-amount">{money(row.remaining > 0 ? row.remaining : row.amount)}</strong>
          {row.status === 'paid' ? <span className="transfer-complete"><Check size={14} /> {t("Paid")}</span>
            : <button type="button" className="button secondary" aria-label={t("Mark {name}, due {date}, paid", { name: row.item.name, date: dateLabel(row.due) })}
              disabled={saving || firstPending.get(row.item.id) !== row.key}
              onClick={() => update(() => markCommitmentPaid(data, row, month, todayMYT()))}>{t("Mark paid")}</button>}
        </>}
      </Checklist>
      <Checklist id="checklist-spending" title={t("Spending transfers")} icon={Wallet} rows={spendingRows} hidden={!showSpending}
        progress={spendingProgress} verb={t("transferred")} empty={t("No spending items for this month.")}>
        {row => <>
          <div className="transfer-row-description">
            <button type="button" className="transfer-row-name"
              onClick={() => open({ type: 'spending', item: row.item, month })} disabled={saving}>{row.item.name}</button>
            {row.item.category && <small>{t(row.item.category)}</small>}
          </div>
          <strong className="transfer-row-amount">{money(row.amount)}</strong>
          {row.amount == null ? <button type="button" className="button secondary" disabled={saving}
            aria-label={t("Set amount for ") + row.item.name} onClick={() => open({ type: 'spending', item: row.item, month })}>{t("Set amount")}</button>
            : <button type="button" className={row.transferred ? 'button transfer-complete' : 'button secondary'}
              aria-pressed={row.transferred} aria-label={(row.transferred ? t("Undo transfer for ") : t("Transfer for ")) + row.item.name} disabled={saving}
              onClick={() => toggleTransfer(row)}>
              {row.transferred ? <><Check size={14} /> {t("Transferred")}</> : <><ArrowLeftRight size={14} /> {t("Transfer")}</>}
            </button>}
        </>}
      </Checklist>
    </div>
    {compact && <details className="transfer-instruction mobile-transfer-instructions">
      <summary>{t("How transfers work")}</summary>
      <p>{instructions}</p>
    </details>}
  </div>
}
