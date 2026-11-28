import { t } from './preferences.js'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, Clock3, Plus, ReceiptText, X } from 'lucide-react'
import { active, addMonths, categoryMonth, commitmentCategories, dateLabel, dueDate, incomeSourceTypes, inputMoney, installment, money, monthLabel, parseMoney, paymentKey, remainingInstallment, spendingCategories, validDate, validMonth } from './budget.js'
import { readBackup } from './backup.js'
import { allocationRows } from './transfers.js'
import { convertSpendingToCommitment, isSpendingHistory, spendingConversionPlan } from './spendingConversion.js'

export const statuses = {
  paid: { label: 'Paid', icon: Check },
  scheduled: { label: 'Scheduled', icon: Clock3 },
  missed: { label: 'Missed', icon: AlertTriangle },
  recorded: { label: 'Recorded spending', icon: ReceiptText },
}

export function Modal({ title, children, close, busy = false }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current.showModal()
    ref.current.querySelector('[data-initial-focus]')?.focus()
  }, [])
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title"
    onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <header className="modal-head">
      <h2 id="modal-title">{title}</h2>
      <button type="button" className="icon-button" aria-label={t("Close dialog")} disabled={busy} onClick={close}><X size={19} /></button>
    </header>
    {children}
  </dialog>
}

export function MoneyField({ label, name, value, required = true, placeholder = '0.00' }) {
  return <label className="field"><span>{label}</span><div className="money-input"><span>RM</span>
    <input name={name} inputMode="decimal" pattern="[0-9]{1,7}(\.[0-9]{1,2})?" placeholder={placeholder}
      defaultValue={inputMoney(value)} required={required} />
  </div></label>
}

const monthPattern = '(20[0-9]{2}|2100)-(0[1-9]|1[0-2])'
export function MonthField({ label, name, value, required = true, min = '2000-01', max = '2100-12', onInput }) {
  return <label className="field"><span>{label}</span>
    <input type="month" name={name} defaultValue={value} min={min} max={max} pattern={monthPattern}
      placeholder="YYYY-MM" required={required} onInput={onInput} />
  </label>
}

function readMonth(value, optional = false) {
  if (optional && !value) return ''
  if (!new RegExp('^' + monthPattern + '$').test(value)) throw new Error('Enter a valid month from 2000 to 2100.')
  return value
}

function readAmount(value, { optional = false, positive = false } = {}) {
  if (optional && !value) return null
  const amount = parseMoney(value)
  if (amount == null || (positive && amount === 0)) throw new Error('Enter a valid ringgit amount with up to two decimal places.')
  return amount
}

function readPaidDate(value, today) {
  if (value && (!validDate(value) || value > today)) throw new Error('Enter a payment date of today or earlier.')
  return value
}

function readName(value) {
  const name = value.trim()
  if (!name) throw new Error('Enter a name.')
  return name
}

function removeEntries(map, id) {
  return Object.fromEntries(Object.entries(map).filter(([key]) => !key.startsWith(id + ':')))
}

export function Editor({ editor, close, snapshot, month, today, save, reload, open }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const { type, item } = editor
  const data = snapshot.budget
  const converting = type === 'convert-spending'
  const conversion = item && (type === 'category' || converting) ? spendingConversionPlan(data, item, today) : null
  const [transferMode, setTransferMode] = useState(conversion?.currentAvailable ? 'current' : 'first')
  const [customMonth, setCustomMonth] = useState(conversion?.currentAvailable ? conversion.current : conversion?.first)
  const [transferDay, setTransferDay] = useState('')
  const [renewalDate, setRenewalDate] = useState('')
  const transferStart = transferMode === 'custom' ? customMonth : conversion?.[transferMode]
  const transferInRange = converting && validMonth(transferStart) && transferStart >= item.start && transferStart <= conversion.latest
  const [commitmentCategory, setCommitmentCategory] = useState(() =>
    commitmentCategories.includes(item?.category) ? item.category : 'Other')
  const [frequency, setFrequency] = useState(item?.frequency ?? 'monthly')
  const showFrequency = commitmentCategory === 'Subscriptions' || item?.frequency === 'yearly'
  const yearly = showFrequency && frequency === 'yearly'
  const billingFrequency = yearly ? 'yearly' : 'monthly'
  const firstRenewal = type === 'commitment' && dueDate(item?.start ?? month, item?.day ?? 1)
  const earliestRenewal = transferInRange && transferStart > conversion.current ? transferStart + '-01' : today
  const latestRenewal = item?.end ? dueDate(item.end, 31) : '2100-12-31'
  const renewalInRange = validDate(renewalDate) && renewalDate >= earliestRenewal && renewalDate <= latestRenewal
  const renewalMonth = yearly && renewalInRange ? renewalDate.slice(0, 7) : undefined
  const dueDay = conversion?.linked?.day ?? (yearly ? Number(renewalDate.slice(-2)) : Number(transferDay))
  const history = transferInRange ? conversion.entries.filter(entry => entry.spent != null
    && entry.month >= transferStart && entry.month <= conversion.latest
    && isSpendingHistory(conversion, entry, today, dueDay, renewalMonth)) : []
  const renewalRecorded = history.some(entry => entry.month === renewalMonth)
  const spendingStays = transferInRange && conversion.entries.some(entry => entry.spent != null && entry.month < transferStart)
  const commitmentCategoryField = <label className="field"><span>{converting ? t("Commitment category") : t("Category")}</span>
    <select name="category" value={commitmentCategory} onChange={event => setCommitmentCategory(event.currentTarget.value)}>
      {commitmentCategories.map(category => <option key={category} value={category}>{t(category)}</option>)}
    </select>
  </label>
  const frequencyField = showFrequency && <label className="field"><span>{t("Billing frequency")}</span>
    <select value={frequency} onChange={event => setFrequency(event.currentTarget.value)}>
      <option value="monthly">{t("Monthly")}</option><option value="yearly">{t("Yearly")}</option>
    </select>
  </label>
  const linkedSpending = item?.spendingSourceId && data.categories.find(source => source.id === item.spendingSourceId)
  const [incomeRows, setIncomeRows] = useState(() => (type === 'income' ? data.incomeSourcesByMonth?.[month] ?? [] : [])
    .map((source, index) => ({ ...source, key: String(index) })))
  const newIncomeRow = useRef(null)
  const key = item && paymentKey(item.id, month)
  const copying = type === 'copy-spending'
  const [targetMonth, setTargetMonth] = useState(editor.month ?? '')
  const sourceAmount = copying ? categoryMonth(data, item, editor.sourceMonth)?.spent : null
  const targetAmount = copying && targetMonth && targetMonth !== editor.sourceMonth
    ? categoryMonth(data, item, targetMonth)?.spent : null
  const payment = data.payments[key]
  const entry = type === 'payment' ? installment(data, item, month, today) : null
  const oneOff = type === 'payment' && (!entry || payment?.oneOff === true)
  const [paymentDay, setPaymentDay] = useState(payment?.day ?? item?.day ?? 1)
  const [paymentStatus, setPaymentStatus] = useState(payment?.partial ? 'partial' : payment?.status ?? 'auto')
  const [carrySettled, setCarrySettled] = useState(Boolean(payment?.partial?.settled))
  const day = Number(paymentDay)
  const validDay = Number.isInteger(day) && day >= 1 && day <= 31
  const due = type === 'payment' ? dueDate(month, validDay ? day : item.day) : null
  const expired = due && due < today && !item?.provisional
  const titles = {
    income: t('Income for ') + monthLabel(month, 'long'), commitment: t(item ? 'Edit commitment' : 'Add commitment'),
    payment: entry ? item?.name : t('Add payment for ') + item?.name,
    category: t(item ? 'Edit spending item' : 'Add spending item'),
    'convert-spending': t('Transfer as commitment'),
    spending: item?.name, 'copy-spending': t('Copy spending value?'), import: t('Import a budget'), reset: t('Start a fresh budget'),
  }
  const allocationMonth = editor.allocationMonth ?? month
  const payableRows = type === 'payment' ? allocationRows(data, item, allocationMonth, today) : []
  const allocationBalance = payableRows.reduce((total, row) => total + (row.remaining ?? row.amount), 0)
  const oldest = payableRows[0]
  const paidUsesAllocation = oldest && entry && remainingInstallment(entry) > 0
  const openAllocation = initialAmount => open({ type: 'allocate-payment', item, month: allocationMonth, initialAmount })
  const recordAmountOption = allocationBalance > 0 && <div className="payment-record-option">
    <div><strong>{monthLabel(allocationMonth, 'long')} {t("budget ·")} {money(allocationBalance)} {t("outstanding")}</strong>
      <p>{t("Apply the payment to the oldest outstanding instalment first.")}</p></div>
    <button type="button" className="button primary" disabled={busy} data-initial-focus
      onClick={() => openAllocation()}>{t("Record amount")} <ArrowRight size={15} aria-hidden="true" />
    </button>
  </div>

  if (type === 'payment' && entry?.partial?.allocations) {
    const remaining = remainingInstallment(entry)
    return <Modal title={item.name} close={close}>
      <div className="editor">
        <p className="muted form-note">{monthLabel(month, 'long')} {t("instalment ·")} {money(entry.amount - remaining)} {t("paid ·")} {money(remaining)} {t("remaining")}</p>
        {recordAmountOption}
        <dl className="transfer-breakdown">
          {entry.partial.paid > 0 && <div><dt>{t("Previously recorded")}</dt><dd>{money(entry.partial.paid)}</dd></div>}
          {entry.partial.allocations.map((payment, index) => <div key={index}>
            <dt>{dateLabel(payment.date)}<small>{monthLabel(payment.month)} {t("budget")}</small></dt><dd>{money(payment.amount)}</dd>
          </div>)}
        </dl>
        <footer className="modal-actions"><div className="spacer" />
          <button type="button" className="button secondary" onClick={close}>{t("Done")}</button>
        </footer>
      </div>
    </Modal>
  }

  if (entry?.status === 'recorded' || entry?.spendingTransferred) {
    return <Modal title={item.name} close={close}>
      <div className="editor">
        <p className="form-note">{monthLabel(month, 'long')} · <strong>{money(entry.amount)}</strong></p>
        <p className="muted form-note">{entry.spendingTransferred ? t("Paid · From Monthly Spending") : t("Moved from Monthly Spending.")}</p>
        {recordAmountOption}
        <footer className="modal-actions"><div className="spacer" />
          <button type="button" className="button secondary" onClick={close}>{t("Done")}</button>
        </footer>
      </div>
    </Modal>
  }

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const get = name => String(form.get(name) ?? '')
    const next = structuredClone(data)
    setError('')
    setBusy(true)
    try {
      if (converting) {
        await save(convertSpendingToCommitment(data, {
          itemId: item.id, start: readMonth(transferMode === 'custom' ? get('start') : transferStart),
          ...(!conversion.linked && { amount: readAmount(get('amount'), { positive: true }),
            day: Number(get('day')), category: get('category'), frequency: billingFrequency, renewalDate: get('renewalDate') }),
        }, today))
        return
      }
      if (type === 'import') {
        const file = form.get('backup')
        if (!file?.size || file.size > 1048576) throw new Error('Choose a budget backup under 1 MB.')
        await save(readBackup(await file.text()), false)
        return
      }
      if (type === 'reset') {
        await save(null, false)
        return
      }
      if (type === 'income') {
        next.income = readAmount(get('income'), { optional: true })
        const income = readAmount(get('override'), { optional: true })
        if (form.has('unknown')) next.incomeByMonth[month] = null
        else if (income == null) delete next.incomeByMonth[month]
        else next.incomeByMonth[month] = income
        const sources = incomeRows.map(({ key }) => ({
          type: get('source-type-' + key),
          name: get('source-name-' + key).trim(),
          amount: readAmount(get('source-amount-' + key), { positive: true }),
        }))
        if (sources.length) (next.incomeSourcesByMonth ??= {})[month] = sources
        else if (next.incomeSourcesByMonth) delete next.incomeSourcesByMonth[month]
      }
      if (type === 'commitment' || type === 'category') {
        const collection = type === 'commitment' ? 'commitments' : 'categories'
        const isDelete = event.nativeEvent.submitter?.value === 'delete'
        if (isDelete) {
          next[collection] = next[collection].filter(record => record.id !== item.id)
          if (type === 'commitment') next.payments = removeEntries(next.payments, item.id)
          else next.spending = removeEntries(next.spending, item.id)
        } else {
          const annual = type === 'commitment' && yearly
          const renewal = get('renewalDate')
          if (annual && !validDate(renewal)) throw new Error('Enter a valid first renewal date.')
          const start = annual ? renewal.slice(0, 7) : readMonth(get('start'))
          const day = annual ? (renewal === firstRenewal && item ? item.day : Number(renewal.slice(-2))) : Number(get('day'))
          const end = readMonth(get('end'), true)
          if (end && end < start) throw new Error('The end month must be on or after the start month.')
          if (type === 'category' && conversion?.linked && (!end || end >= conversion.linkedFrom)) {
            throw new Error(t('End this spending item before ') + monthLabel(conversion.linkedFrom, 'long') + t(', when the linked commitment takes over.'))
          }
          if (type === 'commitment' && linkedSpending && (!linkedSpending.end || start <= linkedSpending.end)) {
            throw new Error('Start this commitment after the linked spending item ends.')
          }
          const overrides = type === 'commitment' ? data.payments : data.spending
          if (item && Object.entries(overrides).some(([key, entry]) => {
            const [id, month] = key.split(':')
            if (type === 'category' && entry.spent == null) return false
            return id === item.id && !(type === 'commitment' && entry.oneOff) && !active({ start, end }, month)
          })) throw new Error('The schedule must include all months with recorded entries.')
          const common = { id: item?.id ?? crypto.randomUUID(), name: readName(get('name')), start, end }
          const record = type === 'commitment'
            ? { ...common, category: get('category'), provisional: form.has('provisional'), amount: readAmount(get('amount'), { positive: true }), day,
              ...(yearly && { frequency: billingFrequency }),
              ...(item?.spendingSourceId && { spendingSourceId: item.spendingSourceId, spendingSourceFrom: item.spendingSourceFrom ?? item.start }),
              ...(item?.scheduleFrom && { scheduleFrom: item.scheduleFrom }) }
            : { ...common, ...(get('spendingCategory') && { category: get('spendingCategory') }) }
          if (type === 'category' && item) {
            for (const [key, entry] of Object.entries(next.spending)) {
              if (key.startsWith(item.id + ':') && entry.spent == null) delete next.spending[key]
            }
          }
          next[collection] = item ? next[collection].map(old => old.id === item.id ? record : old) : [...next[collection], record]
        }
      }
      if (type === 'payment') {
        const status = get('status')
        const remove = event.nativeEvent.submitter?.value === 'remove-payment'
        if (remove) {
          delete next.payments[key]
        } else {
          if (oneOff && linkedSpending && active(linkedSpending, month)) {
            throw new Error('This month belongs to the linked spending item.')
          }
          const amount = readAmount(get('amount'), { optional: !oneOff })
          const paidDate = status === 'paid' ? readPaidDate(get('paidDate'), today) : ''
          const paymentMonth = ['missed', 'partial'].includes(status) ? ''
            : paidDate ? paidDate.slice(0, 7) : readMonth(get('paymentMonth'), true)
          if (status === 'paid' && (paymentMonth || month) > today.slice(0, 7)
            && !(payment?.status === 'paid' && !payment?.paymentMonth && !paymentMonth)) {
            throw new Error('Choose the month the payment was made, or select Planned for a future payment.')
          }
          let partial
          if (status === 'partial') {
            const paid = readAmount(get('partialPaid'), { positive: true })
            const carryMonth = readMonth(get('carryMonth'))
            const settled = form.has('carrySettled')
            const paidDate = settled ? readPaidDate(get('carryPaidDate'), today) : ''
            const paidMonth = settled ? paidDate ? paidDate.slice(0, 7) : readMonth(get('carryPaidMonth'), true) : ''
            const current = today.slice(0, 7)
            if (month > current || (settled && (paidMonth || carryMonth) > current)) throw new Error('Paid amounts must be recorded in the current month or earlier.')
            if (paidMonth && paidMonth < month) throw new Error('The remaining balance cannot be settled before the original payment month.')
            if (paid >= (amount ?? item.amount)) throw new Error('Partial payment must be less than the total amount due.')
            if (carryMonth <= month) throw new Error('Choose a later month for the remaining balance.')
            partial = { paid, month: carryMonth, settled, ...(paidMonth && paidMonth !== carryMonth && { paidMonth }), ...(paidDate && { paidDate }) }
          }
          const day = get('day') && validDay ? Number(get('day')) : null
          const keepAmount = oneOff || status === 'paid' || partial || (amount != null && amount !== item.amount)
          if (!keepAmount && day == null && status === 'auto' && !paymentMonth) delete next.payments[key]
          else {
            const checklistMonth = payment?.checklistMonth ?? (payment?.status !== 'paid' ? payment?.paymentMonth : null)
            next.payments[key] = {
              ...(oneOff && { oneOff: true }),
              ...(!partial && status !== 'auto' && { status }),
              ...(status === 'paid' && checklistMonth && { checklistMonth }),
              ...(partial && { partial }),
              ...(keepAmount && { amount: amount ?? item.amount }),
              ...(day != null && { day }),
              ...(paymentMonth && { paymentMonth }),
              ...(paidDate && { paidDate }),
            }
          }
        }
      }
      if (type === 'spending' || copying) {
        const destination = copying ? readMonth(editor.month || get('targetMonth')) : month
        if (copying && (sourceAmount == null || destination === editor.sourceMonth || !active(item, destination))) {
          throw new Error('Choose another active month for this category.')
        }
        const destinationKey = paymentKey(item.id, destination)
        const spent = copying ? sourceAmount : readAmount(get('spent'), { optional: true })
        if (spent == null) delete next.spending[destinationKey]
        else if (next.spending[destinationKey]?.spent !== spent) next.spending[destinationKey] = { spent }
      }
      await save(next)
    } catch (failure) {
      setError(failure.message || 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  return <Modal title={titles[type]} close={close} busy={busy}>
    <form className="editor" onSubmit={submit}>
      {type === 'income' && <>
        <MoneyField label={t("Default monthly take-home income")} name="income" value={data.income} required={false} placeholder={t("Enter income")} />
        <MoneyField label={t("Base income override (optional)")} name="override" value={data.incomeByMonth[month]} required={false} placeholder={t("Use default")} />
        <label className="check-field"><input type="checkbox" name="unknown" defaultChecked={data.incomeByMonth[month] === null} /> {t("Base income is unknown this month")}</label>
        <p className="muted form-note">{t("Enter RM 0 as the override if this month has only additional sources.")}</p>
        <fieldset className="income-sources">
          <legend>{t("Additional sources")}</legend>
          {incomeRows.map((source, index) => <fieldset className="income-source" key={source.key}>
            <legend>{t("Source")} {index + 1}</legend>
            <label className="field"><span>{t("Type")}</span>
              <select name={'source-type-' + source.key} defaultValue={source.type} ref={element => {
                if (element && newIncomeRow.current === source.key) {
                  newIncomeRow.current = null
                  element.focus()
                }
              }}>
                {incomeSourceTypes.map(type => <option key={type} value={type}>{t(type)}</option>)}
              </select>
            </label>
            <MoneyField label={t("Amount")} name={'source-amount-' + source.key} value={source.amount} />
            <label className="field income-source-name"><span>{t("Description (optional)")}</span>
              <input name={'source-name-' + source.key} defaultValue={source.name} maxLength={65} />
            </label>
            <button type="button" className="icon-button" aria-label={t("Remove source ") + (index + 1)} disabled={busy}
              onClick={() => setIncomeRows(rows => rows.filter(row => row.key !== source.key))}><X size={17} /></button>
          </fieldset>)}
          <button type="button" className="button secondary" disabled={busy} onClick={() => {
            const key = crypto.randomUUID()
            newIncomeRow.current = key
            setIncomeRows(rows => [...rows, { key, type: 'Gift' }])
          }}><Plus size={16} /> {t("Add source")}</button>
          <p className="muted form-note">{t("Loan proceeds increase this month’s cash balance. Record repayments in the Commitment Map. The simulator excludes loan proceeds.")}</p>
        </fieldset>
      </>}
      {(type === 'commitment' || type === 'category') && <>
        {type === 'category' && editor.unavailableMonth && <p className="form-note">
          {monthLabel(editor.unavailableMonth, 'long')} {t("is outside this item’s active months. Update the first or last month to include it, then reopen its spending cell.")}</p>}
        <label className="field"><span>{t("Name")}</span><input name="name" defaultValue={item?.name} maxLength={65} required /></label>
        {type === 'category' && <label className="field"><span>{t("Category")}</span>
          <select name="spendingCategory" defaultValue={item?.category ?? ''}>
            <option value="">{t("Uncategorized")}</option>
            {spendingCategories.map(category => <option key={category} value={category}>{t(category)}</option>)}
          </select>
        </label>}
        {type === 'commitment' ? <div className="form-grid">
          <MoneyField label={yearly ? t("Yearly amount") : t("Monthly amount")} name="amount" value={item?.amount} />
          {commitmentCategoryField}
          {frequencyField}
          {!yearly && <label className="field"><span>{t("Due day each month")}</span>
            <input type="number" name="day" min="1" max="31" step="1" defaultValue={item?.day ?? 1} required />
          </label>}
          <label className="check-field"><input type="checkbox" name="provisional" defaultChecked={item?.provisional} /> {t("Schedule needs verification")}</label>
        </div> : null}
        <div className="form-grid">
          {type === 'commitment' && yearly
            ? <label className="field"><span>{t("First renewal date")}</span>
              <input type="date" name="renewalDate" min="2000-01-01" max="2100-12-31" defaultValue={firstRenewal} required />
            </label>
            : <MonthField label={t("First month")} name="start" value={item?.start ?? month} />}
          <MonthField label={t("Last month (optional)")} name="end" value={item?.end} required={false} />
        </div>
        {type === 'commitment' && yearly
          ? <p className="muted form-note">{t("Enter the full renewal charge. Saved amounts for individual renewals still apply.")}</p>
          : item && <p className="muted form-note">{t("To record a monthly amount, open its cell.")}</p>}
        {type === 'category' && item && <details className="spending-advanced">
          <summary>{t("Advanced")}</summary>
          {conversion.linked && <p className="muted form-note">{t("Linked to")} {conversion.linked.name} {t("in Commitment Map.")}</p>}
          {conversion.available && <button type="button" className="button secondary" disabled={busy}
              onClick={() => open({ type: 'convert-spending', item })}>{t("Transfer as commitment")} <ArrowRight size={15} aria-hidden="true" /></button>
          }
        </details>}
      </>}
      {converting && <>
        <p className="form-note">{t("Move")} <strong>{item.name}</strong> {t("to Commitment Map.")}</p>
        <div className={transferMode === 'custom' ? 'form-grid' : undefined}>
          <label className="field"><span>{t("Transfer from")}</span>
            <select value={transferMode} onChange={event => setTransferMode(event.currentTarget.value)}>
              <option value="first">{t("From first recorded month ·")} {monthLabel(conversion.first)}</option>
              <option value="current" disabled={!conversion.currentAvailable}>{t("From current month ·")} {monthLabel(conversion.current)}</option>
              <option value="custom">{t("Custom month")}</option>
            </select>
          </label>
          {transferMode === 'custom' && <MonthField label={t("Start month")} name="start" value={customMonth}
            min={item.start} max={conversion.latest} onInput={event => setCustomMonth(event.currentTarget.value)} />}
        </div>
        {!conversion.linked && <div className="form-grid">
          {frequencyField}
          {commitmentCategoryField}
          <MoneyField key={billingFrequency} label={yearly ? t("Yearly amount") : t("Monthly amount")} name="amount" value={yearly ? null : conversion.amount} />
          {yearly ? <label className="field"><span>{t("Next renewal date")}</span>
            <input type="date" name="renewalDate" min={earliestRenewal} max={latestRenewal} defaultValue={renewalDate} required
              onInput={event => setRenewalDate(event.currentTarget.value)} />
          </label> : <label className="field"><span>{t("Due day each month")}</span>
            <input type="number" name="day" min="1" max="31" step="1" required
              value={transferDay} onChange={event => setTransferDay(event.currentTarget.value)} /></label>}
        </div>}
        {transferInRange && <div className="spending-conversion-preview">
          <p><strong>{t("Monthly Spending")}</strong> {spendingStays ? t("keeps entries before {month}.", { month: monthLabel(transferStart, 'long') }) : t("removes this item.")}</p>
          <p><strong>{t("Commitment Map")}</strong> {conversion.linked ? t("adds entries to the existing commitment from") : t("takes over from")} {monthLabel(transferStart, 'long')}.</p>
          {history.some(entry => entry.transferred) && <p>{t("Transferred amounts become Paid in their original month.")}</p>}
          {history.some(entry => !entry.transferred) && <p>{t("Other past and confirmed amounts stay in their original month as recorded spending.")}</p>}
          {!conversion.linked && yearly && <p>{renewalInRange
            ? <>{t("Renews yearly from")} <strong>{dateLabel(renewalDate)}</strong>.</>
            : t("Choose the date of the next annual charge.")}</p>}
          {renewalRecorded && <p>{t("The recorded amount for")} {monthLabel(renewalMonth)} {t("is kept. The new charge applies from the following renewal.")}</p>}
          {!conversion.linked && yearly && <p>{t("The annual schedule replaces unconfirmed future spending estimates.")}</p>}
        </div>}
      </>}
      {type === 'payment' && <>
        <p className="muted form-note">{monthLabel(month, 'long')} {t("· due")} {dateLabel(due)}</p>
        {oneOff && <p className="muted form-note">{t("One-off instalment originally due in")} {monthLabel(month, 'long')}.</p>}
        {recordAmountOption}
        <fieldset className="status-picker"><legend>{t("Payment status")}</legend>
          {paidUsesAllocation && <button type="button" className="status-action paid" disabled={busy}
            onClick={() => openAllocation(oldest.remaining ?? oldest.amount)}>
            <span><Check size={16} aria-hidden="true" />{t("Paid")}</span>
          </button>}
          {[...(paidUsesAllocation ? [] : [['paid', 'Paid', Check]]),
            ...(payment?.partial || !allocationBalance ? [['partial', 'Partially paid', Clock3]] : []),
            ['auto', 'Planned', Clock3], ['missed', 'Missed', AlertTriangle]]
            .map(([value, label, Icon]) => <label className={['auto', 'partial'].includes(value) ? 'scheduled' : value} key={value}>
              <input type="radio" name="status" value={value} checked={paymentStatus === value} onChange={() => setPaymentStatus(value)} />
              <span><Icon size={16} />{t(label)}</span>
            </label>)}
        </fieldset>
        {!['missed', 'partial'].includes(paymentStatus) && <>
          {paymentStatus === 'paid' && <label className="field"><span>{t("Date paid (optional)")}</span>
            <input name="paidDate" type="date" min="2000-01-01" max={today} defaultValue={payment?.paidDate} />
          </label>}
          <MonthField key={paymentStatus} label={paymentStatus === 'paid' ? t("Month paid if date is unknown") : t("Planned payment month (optional)")}
            name="paymentMonth" value={paymentStatus === 'paid' && payment?.status !== 'paid' ? undefined : payment?.paymentMonth} required={false}
            max={paymentStatus === 'paid' ? today.slice(0, 7) : undefined} />
          <p className="muted form-note">{paymentStatus === 'paid'
            ? t("Enter the actual date to apply the salary rule. Leave both blank to use the original month.")
            : t("Leave blank to use the original month. Choose a different month to charge its budget.")}</p>
        </>}
        {paymentStatus === 'partial' && <>
          <MoneyField label={t("Amount paid in original month")} name="partialPaid" value={payment?.partial?.paid} />
          <MonthField label={t("Carry balance to")} name="carryMonth" min={addMonths(month, 1)}
            value={payment?.partial?.month ?? addMonths(month, 1)} />
          <label className="check-field"><input type="checkbox" name="carrySettled" checked={carrySettled}
            onChange={event => setCarrySettled(event.target.checked)} /> {t("Remaining balance paid")}</label>
          {carrySettled && <>
            <label className="field"><span>{t("Date balance paid (optional)")}</span>
              <input type="date" name="carryPaidDate" min={month + '-01'} max={today} defaultValue={payment?.partial?.paidDate} />
            </label>
            <MonthField label={t("Month paid if date is unknown")} name="carryPaidMonth" min={month}
              max={today.slice(0, 7)} value={payment?.partial?.paidMonth ?? ''} required={false} />
          </>}
        </>}
        <div className="form-grid">
          <MoneyField label={paymentStatus === 'partial' ? t("Total amount due") : oneOff ? t("Amount for this month") : t("Amount for this month (optional)")} name="amount" value={payment?.amount}
            required={oneOff} placeholder={oneOff ? '0.00' : inputMoney(item.amount)} />
          <label className="field"><span>{t("Due day (optional)")}</span>
            <input type="number" name="day" min="1" max="31" step="1" defaultValue={payment?.day}
              placeholder={String(item.day)} onChange={event => setPaymentDay(event.target.value)} />
          </label>
        </div>
        <p className="muted form-note">{item.provisional ? t("This schedule is provisional. Confirm its dates in the commitment editor to enable automatic overdue status.") : expired ? t("The original due date has passed.") : t("Unpaid instalments turn red after their due date in Malaysia time.")} {t("Mark an instalment paid once it is fully settled.")}</p>
      </>}
      {type === 'spending' && <>
        <p className="muted form-note">{monthLabel(month, 'long')}</p>
        <MoneyField label={t("Total spent this month")} name="spent" value={data.spending[key]?.spent} required={false} placeholder={t("Enter monthly total")} />
        {data.spending[key]?.spent != null && <p className="muted form-note">{t("Clear the amount and save to remove this month’s total.")}</p>}
      </>}
      {copying && <>
        <p className="form-note">{t("Copy")} <strong>{money(sourceAmount)}</strong> {t("for")} <strong>{item.name}</strong> {t("from")} {monthLabel(editor.sourceMonth, 'long')}?</p>
        {editor.month ? <p className="form-note">{t("Destination")} <strong>{monthLabel(editor.month, 'long')}</strong></p>
          : <label className="field"><span>{t("Copy to month")}</span>
            <input type="month" name="targetMonth" min={item.start} max={item.end || '2100-12'}
              pattern={monthPattern} placeholder="YYYY-MM" required onInput={event => setTargetMonth(event.currentTarget.value)} />
          </label>}
        {targetAmount != null && <p className="form-note">{t("This will replace the destination amount of")} <strong>{money(targetAmount)}</strong>.</p>}
      </>}
      {type === 'import' && <>
        <p className="muted form-note">{t("Import replaces the budget in this workspace. Export the existing budget first if you want to keep a copy.")}</p>
        <label className="field"><span>{t("Budget backup file")}</span><input name="backup" type="file" accept="application/json,.json" required /></label>
      </>}
      {type === 'reset' && <p className="muted form-note">{t("This replaces the demo and any changes made to it in this browser with an empty budget.")}</p>}
      {error && <div className="form-error" role="alert">{t(error)} <button type="button" className="link-button" onClick={reload}>{t("Reload saved budget")}</button></div>}
      {confirm && <p className="form-error" role="status">{t("Delete this")} {type === 'category' ? t("spending item") : type} {t("and all its monthly entries?")}</p>}
      <footer className="modal-actions">
        {type === 'spending' && data.spending[key]?.spent != null &&
          <button type="button" className="button secondary" disabled={busy}
            onClick={() => open({ type: 'copy-spending', item, sourceMonth: month })}>{t("Copy to month")}</button>}
        {type === 'payment' && payment?.oneOff && <button type="submit" value="remove-payment" formNoValidate disabled={busy} className="button danger">{t("Remove monthly entry")}</button>}
        {item && ['commitment', 'category'].includes(type) && (confirm
          ? <button type="submit" value="delete" formNoValidate disabled={busy} className="button danger">{t("Confirm delete")}</button>
          : <button type="button" onClick={() => setConfirm(true)} disabled={busy} className="button danger">{t("Delete")}</button>)}
        <div className="spacer" />
        <button type="button" className="button secondary" disabled={busy} onClick={close}>{t("Cancel")}</button>
        <button type="submit" className="button primary" disabled={busy || (converting && !transferInRange)} data-initial-focus={copying && editor.month ? "" : undefined}>{busy ? t("Saving…") : copying ? t("Copy value") : converting ? t("Transfer as commitment") : type === 'reset' ? t("Start fresh") : type === 'import' ? t("Import and replace") : t("Save changes")}</button>
      </footer>
    </form>
  </Modal>
}

export function SignIn({ supabase, close }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [usePassword, setUsePassword] = useState(() =>
    matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  )
  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const email = String(form.get('email')).trim()
      const { error: failure } = usePassword
        ? await supabase.auth.signInWithPassword({ email, password: String(form.get('password')) })
        : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
      if (failure) throw failure
      if (usePassword) close()
      else setSent(true)
    } catch (failure) {
      setError(failure.message || 'Sign-in could not be completed.')
    } finally {
      setBusy(false)
    }
  }
  return <Modal title={t("Sign in to your budget")} close={close} busy={busy}>
    {sent ? <div className="editor">
      <p className="form-note" role="status">{t("Check your inbox for the sign-in link. Open it on the device where you want to use the budget.")}</p>
      <footer className="modal-actions"><div className="spacer" /><button className="button secondary" onClick={close}>{t("Done")}</button></footer>
    </div> : <form className="editor" onSubmit={submit}>
      <label className="field"><span>{t("Email")}</span><input name="email" type="email" autoComplete="email" required /></label>
      {usePassword && <label className="field"><span>{t("Password")}</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>}
      {usePassword && <p className="muted form-note">{t("Set a password from the Data menu in a browser where you’re already signed in.")}</p>}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <footer className="modal-actions">
        <button type="button" className="button secondary" disabled={busy}
          onClick={() => { setUsePassword(value => !value); setError('') }}>{usePassword ? t("Use email link") : t("Use password")}</button>
        <div className="spacer" />
        <button className="button primary" disabled={busy}>{usePassword ? (busy ? t("Signing in…") : t("Sign in")) : (busy ? t("Sending…") : t("Email sign-in link"))}</button>
      </footer>
    </form>}
  </Modal>
}

export function SetPassword({ supabase, close, saved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    if (password !== form.get('confirm')) {
      setError('The passwords don’t match.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { error: failure } = await supabase.auth.updateUser({ password })
      if (failure) throw failure
      saved()
    } catch (failure) {
      setError(failure.message || 'The password could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  return <Modal title={t("Set sign-in password")} close={close} busy={busy}>
    <form className="editor" onSubmit={submit}>
      <p className="muted form-note">{t("Use this password with your existing email to sign in from the iPhone Home Screen app.")}</p>
      <label className="field"><span>{t("New password (12 characters or more)")}</span>
        <input name="password" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      <label className="field"><span>{t("Confirm password")}</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <footer className="modal-actions">
        <div className="spacer" /><button className="button primary" disabled={busy}>{busy ? t("Saving…") : t("Save password")}</button>
      </footer>
    </form>
  </Modal>
}
