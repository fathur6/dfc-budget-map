import { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowDownLeft, ArrowRight, CalendarDays, CarFront, Check, ChevronLeft,
  ChevronRight, CircleHelp, CreditCard, Database, Download, ExternalLink, FileUp, FlaskConical, GripVertical, Grid2X2, HeartHandshake, House, KeyRound, Layers3, Lightbulb, LogIn,
  ListChecks, LogOut, Menu, Pencil, PiggyBank, Plus, Settings2, ShieldCheck, Wallet, Zap,
} from 'lucide-react'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import {
  active, addMonths, categoryMonth, dateLabel, emptyBudget, installment, installmentParts, money, monthLabel, monthSummary,
  paymentKey, projectClosingCash, remainingInstallment, salaryChecklistMonth, todayMYT, validMonth,
} from './budget.js'
import { Editor, Modal, MonthField, SetPassword, SignIn, statuses } from './editors.jsx'
import { incompleteConfig, loadBudget, saveBudget, supabase } from './storage.js'
import { downloadBackup } from './backup.js'
import { CashFlowChart } from './CashFlowChart.jsx'
import { CommitmentChart } from './CommitmentChart.jsx'
import { SpendingChart } from './SpendingChart.jsx'
import { OverviewInsights } from './OverviewInsights.jsx'
import { CashProjectionNote, OpeningCashEditor, SpendingReview } from './Forecast.jsx'
import { Simulator } from './Simulator.jsx'
import { MonthlyTransfer } from './MonthlyTransfer.jsx'
import { SavingsEditor, SavingsJars } from './SavingsJars.jsx'
import { PaymentAllocation } from './PaymentAllocation.jsx'
import { FeatureRequest, Settings } from './UserPanels.jsx'
import { applyPreferences, readPreferences, savePreferences, t } from './preferences.js'
import './styles.css'
import './light.css'
import './mobile.css'


const nav = [
  ['overview', 'Overview', Grid2X2], ['commitments', 'Commitment map', Layers3],
  ['spending', 'Monthly spending', Wallet], ['savings-jars', 'Savings Jars', PiggyBank],
  ['simulator', 'Simulator', FlaskConical],
]
const transferPage = ['monthly-transfer', 'Monthly Transfer', ListChecks]
const savingsEditors = ['savings-jar', 'savings-plan', 'savings-entry']
const mobileNav = [
  ['overview', 'Overview', Grid2X2], ['commitments', 'Commitments', Layers3],
  ['spending', 'Spending', Wallet], ['monthly-transfer', 'Transfer', ListChecks],
]
const utilityActions = [
  ['help', 'How it works', CircleHelp],
  ['support', 'Support development', HeartHandshake],
  ['feature-request', 'Request a feature', Lightbulb],
  ['settings', 'Settings', Settings2],
]
const narrowScreen = window.matchMedia('(max-width: 600px)')
function subscribeToWidth(change) {
  narrowScreen.addEventListener('change', change)
  return () => narrowScreen.removeEventListener('change', change)
}
const isNarrowScreen = () => narrowScreen.matches
const supportCurrencies = [
  ['MYR', 'my'], ['USD', 'us'], ['SGD', 'sg'], ['IDR', 'id'], ['THB', 'th'],
]

function sectionFromHash() {
  const [id] = window.location.hash.slice(1).split('/')
  return id === transferPage[0] || nav.some(([section]) => section === id) ? id : 'overview'
}

function checklistMonthFromHash() {
  const [id, month] = window.location.hash.slice(1).split('/')
  return id === transferPage[0] && validMonth(month) ? month : null
}

const icons = { Housing: House, Transport: CarFront, Utilities: Zap, Financing: CreditCard }
const rangeOffsets = [-1, 0, 1, 2, 3, 4]
const amountFormatter = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Amount({ value }) {
  if (value == null) return <span className="amount">—</span>
  return <span className="amount"><span className="ringgit">{value < 0 ? '−RM' : 'RM'}</span> {amountFormatter.format(Math.abs(value) / 100)}</span>
}

function Metric({ icon: Icon, label, value, tone = '', note, onEdit, children }) {
  return <article className={'metric ' + tone}>
    <div className="metric-heading"><span className="metric-icon"><Icon size={18} /></span><span>{label}</span>
      {onEdit && <button className="icon-button metric-edit" onClick={onEdit} aria-label={t("Edit ") + label}><Pencil size={14} /></button>}
    </div>
    <Amount value={value} />
    <div className="metric-note">{note}</div>
    {children}
  </article>
}

function MonthGrid({ rowHeading, label, months, month, current, chooseMonth, totalLabel, totals, renderTotal = money, closingCash, singleMonth, children }) {
  const scrollRef = useRef(null)
  useEffect(() => {
    const container = scrollRef.current
    const monthColumn = container.querySelector('thead th:nth-child(3)')
    const labelColumn = container.querySelector('thead th:first-child')
    container.scrollLeft = monthColumn ? monthColumn.offsetLeft - labelColumn.offsetWidth : 0
  }, [month, singleMonth])
  return <div className={singleMonth ? 'table-scroll one-month-table' : 'table-scroll'} ref={scrollRef} tabIndex={0} role="region" aria-label={label}>
    <table className="map-table">
      <thead><tr>
        <th scope="col">{rowHeading}</th>
        {months.map(value => <th key={value} scope="col" className={value === month ? 'selected-col' : ''}>
          <button className="month-column" aria-pressed={value === month} onClick={() => chooseMonth(value)}
            disabled={value < '2000-01' || value > '2100-12'}>
            <strong>{monthLabel(value)}</strong>
            {value === current && <span>{t("Current")}</span>}
            {value === addMonths(current, 1) && <span>{t("Next")}</span>}
          </button>
        </th>)}
      </tr></thead>
      <tbody>{children}</tbody>
      <tfoot>
        <tr><th scope="row">{totalLabel}</th>{totals.map((total, index) =>
          <td key={months[index]} className={months[index] === month ? 'selected-col' : ''}>{renderTotal(total)}</td>)}</tr>
        {closingCash && <tr className="closing-cash-row"><th scope="row">{t("Projected closing cash")}</th>{closingCash.map((amount, index) =>
          <td key={months[index]} className={(months[index] === month ? 'selected-col ' : '') + (amount < 0 ? 'cash-negative' : '')}>
            {money(amount)}</td>)}</tr>}
      </tfoot>
    </table>
  </div>
}

function MobileMapRange({ singleMonth, change }) {
  return <div className="mobile-map-range mobile-segmented" role="group" aria-label={t("Months to show")}>
    <button type="button" aria-pressed={singleMonth} onClick={() => change(false)}>{t("Selected month")}</button>
    <button type="button" aria-pressed={!singleMonth} onClick={() => change(true)}>{t("6-month view")}</button>
  </div>
}

function BalanceCell({ balance }) {
  if (balance == null) return <span aria-label={t("Balance unavailable")}>—</span>
  const status = balance > 0 ? 'Surplus' : balance < 0 ? 'Deficit' : 'Break-even'
  return <span className={'monthly-balance ' + status.toLowerCase()}>
    <span>{money(balance)}</span>
    <small>{t(status)}</small>
  </span>
}

function MonthlySummary({ data, months, month, current, today, summaries, chooseMonth, open, save }) {
  const projection = data.openingCash && projectClosingCash(data, months, summaries, today)
  const rows = [
    { label: 'Income', value: (entry, value) => <button type="button" className="summary-detail-button"
      aria-label={t("Edit income for ") + monthLabel(value, 'long') + ', ' + money(entry.income)}
      disabled={value < '2000-01' || value > '2100-12'} onClick={() => open({ type: 'income', month: value })}>
      {money(entry.income)} <Pencil size={12} aria-hidden="true" />
    </button> },
    ...(summaries.some(entry => entry.loanProceeds > 0)
      ? [{ label: 'Loan proceeds', value: entry => money(entry.loanProceeds || null) }] : []),
    { label: 'Commitment', value: (entry, value) => entry.movedIn.length || entry.movedOut.length
      ? <button type="button" className="summary-detail-button"
        aria-label={t("Commitment breakdown for ") + monthLabel(value, 'long') + ', ' + money(entry.committed)}
        onClick={() => open({ type: 'commitment-breakdown', month: value })}>
        {money(entry.committed)}<small>{t("View transfers")}</small>
      </button>
      : money(entry.committed) },
    { label: 'Spending', value: entry => money(entry.hasSpending ? entry.spent : null) },
    ...(summaries.some(entry => entry.loanProceeds > 0)
      ? [{ label: 'Before loan proceeds', value: entry => money(entry.beforeLoans) }] : []),
  ]
  return <section className="panel map-panel monthly-summary" aria-labelledby="monthly-summary-title">
    <div className="panel-heading">
      <div><div className="section-title"><Grid2X2 size={20} /><h2 id="monthly-summary-title">{t("Monthly summary")}</h2></div>
        <p>{t("Monthly results use entered spending. Empty spending cells count as zero.")}</p>
      </div>
      <button type="button" className="button secondary" onClick={() => open({ type: 'opening-cash' })}>
        {data.openingCash ? t("Edit opening cash") : t("Set opening cash")}
      </button>
    </div>
    <SpendingReview data={data} month={month} confirmed={summaries[months.indexOf(month)].spendingConfirmed} save={save} />
    <CashProjectionNote opening={data.openingCash} projection={projection} />
    <MonthGrid rowHeading={t("Cash flow")} label={t("Cash flow across six months")} months={months} month={month}
      current={current} chooseMonth={chooseMonth} totalLabel={t("Monthly result")} closingCash={projection?.balances}
      totals={summaries.map(entry => entry.balance)} renderTotal={balance => <BalanceCell balance={balance} />}>
      {rows.map(({ label, value }) => <tr key={label}>
        <th scope="row">{t(label)}</th>
        {summaries.map((entry, index) => <td key={months[index]}
          className={months[index] === month ? 'selected-col' : ''}>{value(entry, months[index])}</td>)}
      </tr>)}
    </MonthGrid>
  </section>
}

function CommitmentBreakdown({ month, summary, close }) {
  return <Modal title={t("Commitments for ") + monthLabel(month, 'long')} close={close}>
    <div className="editor">
      <dl className="transfer-breakdown">
        <div><dt>{t("Originally due")}</dt><dd>{money(summary.scheduledCommitment)}</dd></div>
        {summary.recordedTotal > 0 && <div><dt>{t("Recorded spending")}</dt><dd>{money(summary.recordedTotal)}</dd></div>}
        {summary.movedIn.map(entry => <div key={'in:' + paymentKey(entry.id, entry.dueMonth) + ':' + (entry.allocationIndex ?? 'balance')}>
          <dt>{entry.name}<small>{entry.status === 'paid'
            ? entry.paidDate ? t("Paid on ") + dateLabel(entry.paidDate) : t("Paid") : entry.autoCarried ? t("Carried forward") : t("Planned")} {t("· Due")} {monthLabel(entry.dueMonth)}
            {entry.partial?.paid > 0 && t(" · Carried from a partial payment")}</small></dt>
          <dd className="transfer-in">+{money(entry.amount)}</dd>
        </div>)}
        {summary.movedOut.map(entry => <div key={'out:' + paymentKey(entry.id, entry.dueMonth) + ':' + (entry.allocationIndex ?? 'balance')}>
          <dt>{entry.name}<small>{entry.status === 'paid'
            ? (entry.paidDate ? t("Paid on ") + dateLabel(entry.paidDate) : t("Paid in ") + monthLabel(entry.paidMonth ?? entry.paymentMonth))
            : (entry.autoCarried ? t("Carried to ") : t("Planned for ")) + monthLabel(entry.paymentMonth)}
            {entry.paidMonth && entry.paidMonth !== entry.paymentMonth && ' · ' + monthLabel(entry.paymentMonth) + t(" budget")}
            {entry.partial?.paid > 0 && t(" · Carried from a partial payment")}</small></dt>
          <dd className="transfer-out">{money(-entry.amount)}</dd>
        </div>)}
        <div><dt>{t("Total for this month")}</dt><dd>{money(summary.committed)}</dd></div>
      </dl>
      <footer className="modal-actions"><div className="spacer" /><button className="button secondary" onClick={close}>{t("Done")}</button></footer>
    </div>
  </Modal>
}

function useRowReorder(data, collection, rows, save) {
  const [reordering, setReordering] = useState(false)
  const [draggedRow, setDraggedRow] = useState(null)
  const [dropRow, setDropRow] = useState(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderError, setOrderError] = useState('')
  function clearDrag() {
    setDraggedRow(null)
    setDropRow(null)
  }

  async function moveRow(from, to, after) {
    clearDrag()
    if (!reordering || savingOrder || from === to) return
    const item = data[collection].find(entry => entry.id === from)
    const ordered = data[collection].filter(entry => entry.id !== from)
    const target = ordered.findIndex(entry => entry.id === to)
    if (!item || target < 0) return
    ordered.splice(target + Number(after), 0, item)
    setSavingOrder(true)
    setOrderError('')
    try {
      await save({ ...data, [collection]: ordered })
    } catch (failure) {
      setOrderError(failure.message || 'Could not save the row order.')
    } finally {
      setSavingOrder(false)
    }
  }

  function afterMidpoint(event) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientY > bounds.top + bounds.height / 2
  }

  function rowProps(item) {
    return {
      className: dropRow?.id === item.id ? (dropRow.after ? 'drop-after' : 'drop-before') : undefined,
      onDragOver: event => {
        if (!draggedRow || draggedRow === item.id || savingOrder) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setDropRow({ id: item.id, after: afterMidpoint(event) })
      },
      onDragLeave: event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDropRow(null)
      },
      onDrop: event => {
        if (!draggedRow || draggedRow === item.id || savingOrder) return
        event.preventDefault()
        void moveRow(draggedRow, item.id, afterMidpoint(event))
      },
    }
  }

  function handle(item, index) {
    return reordering && <button type="button" className="icon-button row-grip" draggable={!savingOrder}
      disabled={savingOrder} aria-label={t("Reorder ") + item.name + t(" with Up or Down")}
      title={t("Drag to reorder or press Up or Down")}
      onDragStart={event => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', 'Budget row')
        setDraggedRow(item.id)
      }}
      onDragEnd={clearDrag}
      onKeyDown={event => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        const after = event.key === 'ArrowDown'
        const target = rows[index + (after ? 1 : -1)]
        if (target) void moveRow(item.id, target.id, after)
      }}><GripVertical size={16} /></button>
  }

  const toggle = <button type="button" className={'button ' + (reordering ? 'primary' : 'secondary')}
      aria-pressed={reordering} disabled={savingOrder || (!reordering && rows.length < 2)}
      onClick={() => { clearDrag(); setReordering(!reordering) }}>
      <GripVertical size={16} /> {t("Reorder rows")}</button>
  return { reordering, orderError, rowProps, handle, toggle }
}

function CommitmentMap({ data, months, month, current, today, summaries, chooseMonth, open, save, compact }) {
  const [sixMonths, setSixMonths] = useState(false)
  const singleMonth = compact && !sixMonths
  const visibleMonths = singleMonth ? [month] : months
  const carriedByMonth = new Map(months.map((value, index) => [
    value, summaries[index].movedIn.filter(entry => entry.dueMonth < value || entry.partial),
  ]))
  const rows = data.commitments.filter(item => visibleMonths.some(value =>
    (singleMonth ? installment(data, item, value, today) : active(item, value) || data.payments[paymentKey(item.id, value)]?.oneOff)
    || carriedByMonth.get(value).some(entry => entry.id === item.id)
  ))
  const { reordering, orderError, rowProps, handle, toggle } = useRowReorder(data, 'commitments', rows, save)

  return <section id="commitments" className="panel map-panel" aria-labelledby="map-title">
    <div className="panel-heading">
      <div><div className="section-title"><Layers3 size={20} /><h2 id="map-title">{t("Commitment map")}</h2></div>
        <p>{reordering ? t("Drag a row by its handle or use the arrow keys.") : t("Select a cell to add or update a payment.")}</p></div>
      <div className="map-heading-actions">
        {toggle}
        <button className="button secondary" onClick={() => open({ type: 'commitment' })}><Plus size={17} /> {t("Add commitment")}</button>
      </div>
    </div>
    {orderError && <p className="form-error" role="alert">{t(orderError)}</p>}
    {compact && <MobileMapRange singleMonth={singleMonth} change={setSixMonths} />}
    {!singleMonth && <CommitmentChart months={months} summaries={summaries} month={month} chooseMonth={chooseMonth} compact={compact} />}
    <MonthGrid rowHeading={t("Commitment")} label={t(singleMonth ? "Commitments for selected month" : "Commitments across six months")}
      months={visibleMonths} month={month} singleMonth={singleMonth}
      current={current} chooseMonth={chooseMonth} totalLabel={t("Originally due")}
      totals={visibleMonths.map(value => summaries[months.indexOf(value)].scheduledCommitment)}>
      {rows.map((item, index) => {
        const Icon = icons[item.category] ?? CreditCard
        return <tr key={item.id} {...rowProps(item)}>
          <th scope="row"><div className="commitment-row-label">
            {handle(item, index)}
            <button className="row-label" onClick={() => open({ type: 'commitment', item })} aria-label={t("Edit ") + item.name}>
            <span className="row-icon"><Icon size={16} /></span><span><strong>{item.name}</strong>
              <small>{item.provisional ? t("Verify schedule") : t(item.category)}{item.frequency === 'yearly' ? t(" · Yearly") : ''} {t("· due")} {item.day}</small></span>
          </button></div></th>
          {visibleMonths.map(value => {
            const entry = installment(data, item, value, today)
            const carried = carriedByMonth.get(value).filter(payment => payment.id === item.id)
            const carriedTotal = carried.reduce((sum, payment) => sum + payment.amount, 0)
            const parts = entry ? installmentParts(data, entry, value, today) : []
            const partsInCell = part => (part.budgetMonth ?? part.paymentMonth ?? value) === value
            const ownParts = parts.filter(partsInCell)
            const movedBalance = parts.find(part => part.status !== 'paid' && !partsInCell(part))
            const assigned = movedBalance?.paymentMonth ?? value
            const ownAmount = ownParts.reduce((sum, part) => sum + part.amount, 0)
            const total = carriedTotal ? ownAmount + carriedTotal : entry?.amount
            const cellParts = [...carried, ...ownParts]
            const recordedAmount = entry?.status === 'recorded' ? entry.amount : 0
            const cellRemaining = carriedTotal
              ? cellParts.filter(part => part.status !== 'paid' && part.status !== 'recorded').reduce((sum, part) => sum + part.amount, 0)
              : entry && remainingInstallment(entry)
            const tone = carriedTotal
              ? (cellParts.every(part => part.status === 'paid') ? 'paid' : recordedAmount && cellRemaining === 0 ? 'recorded' : 'scheduled')
              : entry?.partial ? (cellRemaining === 0 ? 'paid' : 'scheduled') : entry?.status
            const StatusIcon = statuses[tone]?.icon
            const showRemaining = tone === 'scheduled' || tone === 'missed'
            const headline = money(showRemaining ? cellRemaining : total)
            const carryNote = carriedTotal ? t('{amount} carried in', { amount: money(carriedTotal) }) : ''
            const hasBreakdown = carriedTotal > 0 || Boolean(entry?.partial)
            const paidAmount = total - cellRemaining - recordedAmount
            const movement = carriedTotal > 0 || entry?.partial?.allocations
              ? [
                  paidAmount > 0 && money(paidAmount) + ' ' + t("paid"),
                  recordedAmount > 0 && t("{amount} recorded", { amount: money(recordedAmount) }),
                ].filter(Boolean).join(' · ')
              : entry?.partial
              ? [
                  entry.partial.paid > 0 && money(entry.partial.paid) + ' ' + t("paid"),
                  entry.partial.settled && money(entry.amount - entry.partial.paid)
                    + (entry.partial.paidDate ? t(" paid on ") + dateLabel(entry.partial.paidDate)
                      : t(" paid in ") + monthLabel(entry.partial.paidMonth ?? entry.partial.month)),
                ].filter(Boolean).join(' · ')
              : entry?.status === 'paid' && (entry.paidDate || entry.paymentMonth !== undefined)
                ? (entry.budgetMonth === value ? t("On time · ") : '')
                  + (entry.paidDate ? t("Paid on ") + dateLabel(entry.paidDate) : t("Paid in ") + monthLabel(entry.paymentMonth))
                  + (entry.budgetMonth && entry.budgetMonth !== value ? ' · ' + monthLabel(entry.budgetMonth) + t(" budget") : '')
                : entry?.spendingTransferred ? t("Paid · From Monthly Spending")
                : entry?.status === 'recorded' ? t("From Monthly Spending")
                : movedBalance ? (movedBalance.autoCarried ? t("Carried to ") : t("Planned for ")) + monthLabel(assigned) : ''
            const carryOutNote = hasBreakdown && movedBalance
              ? money(movedBalance.amount) + ' ' + t("carried to") + ' ' + monthLabel(assigned) : ''
            const totalNote = hasBreakdown ? t("Total") + ' ' + money(total) : ''
            return <td key={value} className={value === month ? 'selected-col' : ''}>
              {entry || carriedTotal ? <button className={'tile ' + tone + (hasBreakdown || movement ? ' moved-payment' : '')}
                aria-label={[item.name, monthLabel(value, 'long'), t(statuses[tone].label),
                  showRemaining ? headline + t(" remaining") : headline, carryNote, movement, carryOutNote, totalNote].filter(Boolean).join(', ')}
                onClick={() => open({ type: 'payment', item, month: entry ? value : carried[0].dueMonth, allocationMonth: carriedTotal ? value : assigned })}>
                <span className="payment-amount"><StatusIcon size={14} strokeWidth={2.3} aria-hidden="true" />{headline}</span>
                {carryNote && <small>{carryNote}</small>}
                {movement && <small>{movement}</small>}
                {carryOutNote && <small>{carryOutNote}</small>}
                {totalNote && <small className="payment-total">{totalNote}</small>}
              </button> : value >= '2000-01' && value <= '2100-12'
                ? <button type="button" className="inactive-tile"
                  aria-label={t("Add payment for ") + item.name + ', ' + monthLabel(value, 'long')}
                  title={t("Add payment for this month")}
                  onClick={() => open({ type: 'payment', item, month: value })}>—</button>
                : <span className="inactive-tile">—</span>}
            </td>
          })}
        </tr>
      })}
      {!rows.length && <tr><td colSpan={visibleMonths.length + 1} className="empty-row">{t("No commitments in this period.")}</td></tr>}
    </MonthGrid>
    <div className="map-footer">
      <div className="legend">{Object.entries(statuses).filter(([key]) => key !== 'recorded' || summaries.some(summary => summary.recordedTotal > 0))
        .map(([key, { label }]) => <span key={key}><i className={key} />{t(label)}</span>)}</div>
      <span className="month-range">{singleMonth ? monthLabel(month, 'long') : monthLabel(months[0]) + ' — ' + monthLabel(months.at(-1))}</span>
    </div>
  </section>
}

function Spending({ data, months, month, current, summaries, chooseMonth, open, save, compact }) {
  const [dragged, setDragged] = useState(null)
  const [sixMonths, setSixMonths] = useState(false)
  const singleMonth = compact && !sixMonths
  const visibleMonths = singleMonth ? [month] : months
  const categories = data.categories.filter(item => visibleMonths.some(value => active(item, value)))
  const { reordering, orderError, rowProps, handle, toggle } = useRowReorder(data, 'categories', categories, save)
  return <section id="spending" className="panel map-panel" aria-labelledby="spending-title">
    <div className="panel-heading">
      <div><div className="section-title"><Wallet size={19} /><h2 id="spending-title">{t("Monthly spending")}</h2></div>
        <p>{reordering ? t("Drag a row by its handle or use the arrow keys.") : compact
          ? t("Tap an amount to edit or copy it.")
          : t("Select an empty cell to record spending. Drag a recorded amount to copy it within the same row.")}</p></div>
      <div className="map-heading-actions">
        {toggle}
        <button className="button secondary" onClick={() => open({ type: 'category' })}><Plus size={17} /> {t("Add item")}</button>
      </div>
    </div>
    {orderError && <p className="form-error" role="alert">{t(orderError)}</p>}
    <SpendingReview data={data} month={month} confirmed={summaries[months.indexOf(month)].spendingConfirmed} save={save} />
    {compact && <MobileMapRange singleMonth={singleMonth} change={setSixMonths} />}
    {!singleMonth && <SpendingChart months={months} summaries={summaries} month={month} chooseMonth={chooseMonth} compact={compact} />}
    <MonthGrid rowHeading={t("Item")} label={t(singleMonth ? "Spending for selected month" : "Spending across six months")}
      months={visibleMonths} month={month} singleMonth={singleMonth}
      current={current} chooseMonth={chooseMonth} totalLabel={t("Total recorded")}
      totals={visibleMonths.map(value => {
        const summary = summaries[months.indexOf(value)]
        return summary.hasSpending ? summary.spent : null
      })}>
      {categories.map((item, index) => <tr key={item.id} {...rowProps(item)}>
        <th scope="row"><div className="commitment-row-label">{handle(item, index)}
          <button className="row-label" onClick={() => open({ type: 'category', item })}
          aria-label={t("Edit item ") + item.name}>
          <span className="row-icon"><Wallet size={16} /></span>
          <span><strong>{item.name}</strong>{item.category && <small>{t(item.category)}</small>}</span>
        </button></div></th>
        {visibleMonths.map(value => {
          const entry = categoryMonth(data, item, value)
          const recorded = entry?.spent != null
          const tileClass = entry?.transferred ? 'tile recorded-spend transferred-spend' : 'tile recorded-spend'
          const label = item.name + ', ' + monthLabel(value, 'long')
          const editable = entry && value >= '2000-01' && value <= '2100-12'
          const canDrop = editable && dragged?.id === item.id && dragged.month !== value
          return <td key={value} className={value === month ? 'selected-col' : ''}>
            {editable
              ? <button type="button" className={(recorded ? tileClass : 'inactive-tile') + (canDrop ? ' spending-drop-target' : '')}
                aria-label={recorded ? t("Edit spending for ") + label + ', ' + money(entry.spent) + (entry.transferred ? t(", transferred") : '')
                  : t("Add spending for ") + label}
                draggable={recorded}
                onDragStart={recorded ? event => {
                  event.dataTransfer.effectAllowed = 'copy'
                  event.dataTransfer.setData('text/plain', 'Monthly spending')
                  setDragged({ id: item.id, month: value })
                } : undefined}
                onDragEnd={() => setDragged(null)}
                onDragOver={canDrop ? event => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                } : undefined}
                onDrop={canDrop ? event => {
                  event.preventDefault()
                  open({ type: 'copy-spending', item, sourceMonth: dragged.month, month: value })
                  setDragged(null)
                } : undefined}
                onClick={() => open({ type: 'spending', item, month: value })}>
                {recorded && entry.transferred && <Check size={14} aria-hidden="true" />}{money(entry.spent)}
              </button>
              : !entry && value >= '2000-01' && value <= '2100-12'
                ? <button type="button" className="inactive-tile"
                  aria-label={t("Edit item dates for ") + label + t(" (outside active months)")}
                  title={t("Outside the item’s active months. Click to edit its dates.")}
                  onClick={() => open({ type: 'category', item, unavailableMonth: value })}>—</button>
                : <span className="inactive-tile">—</span>}
          </td>
        })}
      </tr>)}
      {!categories.length && <tr><td colSpan={visibleMonths.length + 1} className="empty-row">{t("Add an item to record monthly spending.")}</td></tr>}
    </MonthGrid>
  </section>
}

function OverviewDetails({ title, icon: Icon, children }) {
  const [expanded, setExpanded] = useState(false)
  return <details className="overview-details" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary><Icon size={17} /><strong>{title}</strong><ChevronRight size={16} className="details-chevron" /></summary>
    {expanded && children}
  </details>
}

function App() {
  const compact = useSyncExternalStore(subscribeToWidth, isNarrowScreen)
  const [preferences, setPreferences] = useState(readPreferences)
  const [today, setToday] = useState(todayMYT)
  const current = today.slice(0, 7)
  const [month, setMonth] = useState(() => checklistMonthFromHash() ?? current)
  const [section, setSection] = useState(sectionFromHash)
  const [editor, setEditor] = useState(null)
  const [user, setUser] = useState(supabase ? undefined : null)
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState('')
  const identity = user?.id ?? (user === undefined ? undefined : 'local')
  const snapshot = loaded?.identity === identity ? loaded?.snapshot : null

  useEffect(() => {
    const update = () => setToday(todayMYT())
    const id = setInterval(update, 30000)
    window.addEventListener('focus', update)
    return () => { clearInterval(id); window.removeEventListener('focus', update) }
  }, [])
  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!identity) return
    let cancelled = false
    loadBudget(identity === 'local' ? null : { id: identity }, todayMYT()).then(snapshot => {
      if (!cancelled) setLoaded({ identity, snapshot })
    }).catch(failure => {
      if (!cancelled) setError(failure.message || 'The saved budget could not be loaded.')
    })
    return () => { cancelled = true }
  }, [identity, reload])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 2500)
    return () => clearTimeout(timer)
  }, [notice])

  function refresh() {
    setEditor(null)
    setError('')
    setLoaded(null)
    setReload(count => count + 1)
  }
  async function save(data, demo) {
    const next = await saveBudget(user, snapshot, data ?? emptyBudget(), demo)
    setLoaded({ identity, snapshot: next })
    setEditor(null)
    setNotice('Budget saved')
  }
  async function signOut() {
    setAuthError('')
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(error.message)
    else { setError(''); setEditor(null); setNotice('Signed out') }
  }
  function navigate(id) {
    if (sectionFromHash() !== id) window.location.hash = id
    else document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }

  const data = snapshot?.budget
  const hasBudget = Boolean(data)
  const simulatorPage = section === 'simulator'
  const savingsPage = section === 'savings-jars'
  const overviewPage = section === 'overview'
  const transferPageActive = section === transferPage[0]
  const [, pageLabel, PageIcon] = transferPageActive ? transferPage : nav.find(([id]) => id === section)

  function chooseMonth(value) {
    setMonth(value)
    if (transferPageActive) window.location.hash = transferPage[0] + '/' + value
  }

  useEffect(() => {
    const syncSection = () => {
      setSection(sectionFromHash())
      const checklistMonth = checklistMonthFromHash()
      if (checklistMonth) setMonth(checklistMonth)
    }
    window.addEventListener('hashchange', syncSection)
    return () => window.removeEventListener('hashchange', syncSection)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [section, hasBudget])

  const months = rangeOffsets.map(offset => addMonths(month, offset))
  const summaries = data && months.map(value => monthSummary(data, value, today))
  const summary = summaries?.[1]
  const showTransfer = () => transferPageActive
    ? window.scrollTo(0, 0)
    : navigate(transferPage[0] + '/' + salaryChecklistMonth(data, month, today))
  const closeEditor = () => setEditor(null)
  const openSimulator = () => { closeEditor(); navigate('simulator') }
  const openSavings = () => { closeEditor(); navigate('savings-jars') }
  const storageStatus = user ? 'Supabase' : snapshot?.demo ? t("Demo · browser") : t("Browser storage")
  const dataActions = [
    ...(user ? [['password', 'Set sign-in password', KeyRound, () => setEditor({ type: 'password' })]] : []),
    ['import', 'Import budget', FileUp, () => setEditor({ type: 'import' })],
    ['export', 'Export backup', Download, () => downloadBackup(data)],
  ]

  return <div className="shell">
    {!compact && <aside className="sidebar">
      <a className="brand" href="#overview" onClick={event => { event.preventDefault(); navigate('overview') }}>
        <span className="brand-icon"><Activity size={23} strokeWidth={2.4} /></span>
        <span>DFC <strong>Budget Map</strong></span>
      </a>
      <nav aria-label={t("Main menu")}>
        {nav.map(([id, label, Icon]) => <button key={id} className={section === id ? 'active' : ''}
          aria-current={section === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={18} />{t(label)}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-actions">
          {utilityActions.map(([type, label, Icon]) => <button key={type} className={type === 'support' ? 'help support-button' : 'help'}
            onClick={() => setEditor({ type })}><Icon size={17} aria-hidden="true" /> {t(label)}</button>)}
        </div>
        <span className="sidebar-meta"><span className="live-dot" /> MYR <span>·</span> {t("Malaysia time")}</span>
        <span className="app-version">{__APP_VERSION_LABEL__}</span>
      </div>
    </aside>}

    <main className="main" id="overview">
      {compact ? <header className="mobile-topbar">
        <a className="brand" href="#overview" onClick={event => { event.preventDefault(); navigate('overview') }}>
          <span className="brand-icon"><Activity size={20} strokeWidth={2.4} aria-hidden="true" /></span>
          <span>DFC <strong>Budget Map</strong></span>
        </a>
        <button type="button" className="icon-button" aria-label={t("More options")} aria-haspopup="dialog"
          onClick={() => setEditor({ type: 'mobile-menu' })}><Menu size={22} aria-hidden="true" /></button>
      </header> : <header className="topbar">
        <span className="breadcrumb"><PageIcon size={15} /> {t(pageLabel)}</span>
        <div className="workspace-actions">
          <span className={'mode ' + (user ? 'cloud' : '')}><Database size={13} /> {storageStatus}</span>
          {supabase && user !== undefined && (user
            ? <button className="button secondary" onClick={signOut}><LogOut size={15} /> {t("Sign out")}</button>
            : <button className="button secondary" onClick={() => setEditor({ type: 'sign-in' })}><LogIn size={15} /> {t("Sign in")}</button>)}
          {snapshot && <details className="data-menu">
            <summary className="button secondary">{t("Data")}</summary>
            <div className="data-options">
              {dataActions.map(([key, label, Icon, run]) => <button key={key} onClick={event => {
                event.currentTarget.closest('details').open = false
                run()
              }}><Icon size={15} /> {t(label)}</button>)}
            </div>
          </details>}
          {snapshot?.demo && <button className="button secondary" onClick={() => setEditor({ type: 'reset' })}>{t("Start fresh")}</button>}
        </div>
      </header>}
      <div className="content">
        {(incompleteConfig || authError) && <div className="form-error" role="alert">{authError ? t(authError) : t("Cloud setup is incomplete. Set both Supabase environment variables to enable sign-in.")}</div>}
        {error && <div className="panel loading" role="alert">{t(error)} <button className="button secondary" onClick={refresh}>{t("Retry")}</button></div>}
        {!data && !error && <div className="panel loading" role="status">{t("Loading budget…")}</div>}
        {data && simulatorPage && <Simulator key={month} data={data} month={month} today={today} compact={compact} />}
        {data && savingsPage && <SavingsJars data={data} month={month} today={today} open={setEditor} />}
        {data && !simulatorPage && !savingsPage && <>
          <section className="page-heading" aria-labelledby="page-title">
            <div>
              {overviewPage && !compact && <p className="eyebrow"><span className="live-dot" /> {t("Monthly overview")}</p>}
              <h1 id="page-title">{overviewPage ? monthLabel(month, 'long') : t(pageLabel)}</h1>
              {!compact && <p className="page-description">{overviewPage ? t("See what’s committed, what’s paid, and what’s left.") : monthLabel(month, 'long')}</p>}
            </div>
            <div className="month-controls">
              <button className="button secondary this-month" onClick={() => chooseMonth(current)} disabled={month === current}>{t("This month")}</button>
              {!compact && (transferPageActive
                ? <button className="button secondary" onClick={() => navigate('overview')}>{t("Back to Overview")}</button>
                : <button className="button secondary" onClick={showTransfer}><ListChecks size={16} /> {t("Monthly Transfer")}</button>)}
              <div className="month-switcher">
                <button aria-label={t("Previous month")} onClick={() => chooseMonth(addMonths(month, -1))} disabled={month <= '2000-01'}><ChevronLeft size={17} /></button>
                <button className="choose-month" aria-label={t("Choose month")} onClick={() => setEditor({ type: 'month' })}><CalendarDays size={15} /> {monthLabel(month)}</button>
                <button aria-label={t("Next month")} onClick={() => chooseMonth(addMonths(month, 1))} disabled={month >= '2100-12'}><ChevronRight size={17} /></button>
              </div>
            </div>
          </section>

          {transferPageActive && <MonthlyTransfer key={identity + ':' + month} data={data}
            month={month} today={today} summary={summary} save={save} open={setEditor} compact={compact} />}
          {overviewPage && <>
          <OverviewInsights key={identity + ':' + month + ':' + today + ':' + snapshot.revision}
            months={months} summaries={summaries} month={month} current={current} supabase={supabase} signedIn={Boolean(user)}
            chooseMonth={setMonth} open={setEditor} navigate={navigate} />
          <div className="metrics">
            <Metric icon={ArrowDownLeft} label={t("Cash inflow")} value={summary.cashInflow} onEdit={() => setEditor({ type: 'income' })}
              note={summary.income == null ? t("Set base income to calculate your balance")
                : summary.loanProceeds ? <>{money(summary.loanProceeds)} {t("in loan proceeds")}</>
                : summary.otherIncome ? <>{money(summary.otherIncome)} {t("in additional income")}</>
                : t(data.incomeByMonth[month] == null ? "Default monthly income" : "Using this month’s override")} />
            <Metric icon={CreditCard} label={t("Commitments")} value={summary.committed} tone="amber"
              note={<><strong>{money(summary.outstanding)}</strong> {t("unpaid among payments allocated here")}</>} />
            <Metric icon={Wallet} label={t("Recorded spending")} value={summary.hasSpending ? summary.spent : null} tone="blue"
              note={t(summary.spendingConfirmed ? "Confirmed for this month" : "Spending review pending")} />
          </div>

          <CashFlowChart months={months} summaries={summaries} month={month} compact={compact} />
          <MonthlySummary data={data} months={months} month={month} current={current} today={today}
            summaries={summaries} chooseMonth={setMonth} open={setEditor} save={save} />
          <OverviewDetails title={t("Commitment map")} icon={Layers3}>
            <CommitmentMap data={data} months={months} month={month} current={current} today={today}
              summaries={summaries} chooseMonth={setMonth} open={setEditor} save={save} compact={compact} />
          </OverviewDetails>
          <OverviewDetails title={t("Monthly spending")} icon={Wallet}>
            <Spending data={data} months={months} month={month} current={current}
              summaries={summaries} chooseMonth={setMonth} open={setEditor} save={save} compact={compact} />
          </OverviewDetails>
          </>}
          {section === 'commitments' && <CommitmentMap data={data} months={months} month={month} current={current} today={today}
            summaries={summaries} chooseMonth={setMonth} open={setEditor} save={save} compact={compact} />}
          {section === 'spending' && <Spending data={data} months={months} month={month} current={current}
            summaries={summaries} chooseMonth={setMonth} open={setEditor} save={save} compact={compact} />}
        </>}
      </div>
    </main>

    {compact && <nav className="mobile-nav" aria-label={t("Main menu")}>
      {mobileNav.map(([id, label, Icon]) => <button key={id} type="button"
        aria-current={section === id ? 'page' : undefined}
        disabled={id === transferPage[0] && !hasBudget}
        onClick={id === transferPage[0] ? showTransfer : () => navigate(id)}>
        <Icon size={20} aria-hidden="true" /><span>{t(label)}</span>
      </button>)}
    </nav>}
    {editor?.type === 'mobile-menu' && <Modal title={t("More options")} close={closeEditor}>
      <div className="editor mobile-menu">
        <div className="mobile-menu-status">
          <span className={'mode ' + (user ? 'cloud' : '')}><Database size={13} /> {storageStatus}</span>
          <span className="app-version">{__APP_VERSION_LABEL__}</span>
        </div>
        <div className="mobile-menu-items">
          <button type="button" onClick={openSavings}><PiggyBank size={17} /> {t("Savings Jars")}</button>
          <button type="button" onClick={openSimulator}><FlaskConical size={17} /> {t("Simulator")}</button>
          {utilityActions.map(([type, label, Icon]) => <button key={type} type="button" onClick={() => setEditor({ type })}>
            <Icon size={17} /> {t(label)}
          </button>)}
        </div>
        <div className="mobile-menu-items">
          {supabase && user !== undefined && (user
            ? <button type="button" onClick={signOut}><LogOut size={17} /> {t("Sign out")}</button>
            : <button type="button" onClick={() => setEditor({ type: 'sign-in' })}><LogIn size={17} /> {t("Sign in")}</button>)}
          {snapshot && dataActions.map(([key, label, Icon, run]) => <button key={key} type="button" onClick={() => {
            if (key === 'export') closeEditor()
            run()
          }}><Icon size={17} /> {t(label)}</button>)}
          {snapshot?.demo && <button type="button" onClick={() => setEditor({ type: 'reset' })}><FileUp size={17} /> {t("Start fresh")}</button>}
        </div>
      </div>
    </Modal>}
    {editor?.type === 'sign-in' && <SignIn supabase={supabase} close={() => setEditor(null)} />}
    {editor?.type === 'password' && user && <SetPassword supabase={supabase} close={() => setEditor(null)}
      saved={() => { setEditor(null); setNotice('Sign-in password saved') }} />}
    {editor?.type === 'help' && <Modal title={t("How it works")} close={() => setEditor(null)}>
      <div className="editor help-copy">
        <p>{t("Open an income cell to enter base income and additional sources for that month. Record loan proceeds there and add repayments in the Commitment Map. Set the same first and last month for a one-off bill.")}</p>
        <p>{t("Commitment cells keep their original due dates. From the 21st (Malaysia time), overdue balances roll into the next budget month. Use Record amount to pay the oldest instalment first and View transfers to see how amounts moved.")}</p>
        <p>{t("Record Salary received in Monthly Transfer for the intended budget month. Payments for next month count toward that budget from the 21st, or from an earlier recorded salary receipt. Spending transfers use the selected month.")}</p>
        <p>{t("Unpaid cells with verified schedules turn red after their due date in Malaysia time. Due days after the last day of a month are treated as month-end.")}</p>
        <p>{t("The Overview and Monthly Summary balances use income plus loan proceeds, minus commitments and recorded spending. The simulator also uses recorded spending. Empty spending cells count as zero.")}</p>
        <p>{t("Confirm spending once you have reviewed a month. An opening cash balance adds a projection of closing cash to Monthly Summary.")}</p>
        <p>{t("The simulator excludes loan proceeds and follows the payment months you choose. It charges earlier missed payments that still need to be covered to the first month of the scenario.")}</p>
        <p>{t("Browser budgets stay on this device. Signing in opens a separate Supabase budget.")}</p>
      </div>
    </Modal>}
    {editor?.type === 'support' && <Modal title={t("Support development")} close={() => setEditor(null)}>
      <div className="editor support-dialog">
        <p className="form-note">{t("Voluntary contributions help maintain DFC Budget Map and fund new features.")}</p>
        <div className="support-payment">
          <img src="/wise-support-qr.png" width="148" height="148" alt={t("QR code for the Wise payment link")} />
          <div className="support-recipient">
            <div><p className="muted">Wisetag</p><strong>@fathurrahmanl</strong></div>
            <a className="button primary" href="https://wise.com/pay/me/fathurrahmanl" target="_blank" rel="noopener noreferrer">{t("Open in Wise")} <ExternalLink size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className="support-currency-options">
          <p className="muted form-note">{t("This Wisetag link requires a Wise account. Check which currencies are available for your location on Wise.")}</p>
          <ul className="support-currencies" role="list" aria-label={t("Currencies to check on Wise")}>
            {supportCurrencies.map(([currency, country]) => <li key={currency}>
              <img src={`/icons/flags/${country}.png`} alt="" width="22" height="14" />
              {currency}
            </li>)}
          </ul>
        </div>
        <p className="muted form-note">{t("Bank transfer without a Wise account requires a separate payment request from the recipient.")}</p>
      </div>
    </Modal>}
    {editor?.type === 'month' && <Modal title={t("Choose a month")} close={() => setEditor(null)}>
      <form className="editor" onSubmit={event => {
        event.preventDefault()
        const value = new FormData(event.currentTarget).get('month')
        if (!validMonth(value)) return
        chooseMonth(value)
        setEditor(null)
      }}>
        <MonthField label={t("Month to display")} name="month" value={month} />
        <footer className="modal-actions"><div className="spacer" /><button className="button primary" type="submit">{t("Show month")} <ArrowRight size={16} /></button></footer>
      </form>
    </Modal>}
    {editor?.type === 'commitment-breakdown' && data && <CommitmentBreakdown month={editor.month}
      summary={monthSummary(data, editor.month, today)} close={() => setEditor(null)} />}
    {editor?.type === 'opening-cash' && data && <OpeningCashEditor data={data} openingCash={data.openingCash}
      month={month} close={() => setEditor(null)} save={save} />}
    {editor?.type === 'allocate-payment' && data && <PaymentAllocation key={editor.item.id + ':' + editor.month}
      data={data} item={editor.item} month={editor.month} today={today} initialAmount={editor.initialAmount} close={() => setEditor(null)} save={save} />}
    {savingsEditors.includes(editor?.type) && data && <SavingsEditor key={identity + ':' + editor.type}
      editor={editor} data={data} save={save} close={closeEditor} today={today} reload={refresh} />}
    {editor?.type === 'feature-request' && <FeatureRequest close={() => setEditor(null)} language={preferences.language} />}
    {editor?.type === 'settings' && <Settings close={() => setEditor(null)} preferences={preferences} supabase={supabase}
      change={value => { savePreferences(value); setPreferences(value) }} />}
    {editor && !['sign-in', 'password', 'help', 'support', 'feature-request', 'settings', 'mobile-menu', 'month', 'commitment-breakdown', 'opening-cash', 'allocate-payment', ...savingsEditors].includes(editor.type) && snapshot && <Editor
      key={identity + ':' + editor.type} editor={editor} close={() => setEditor(null)} snapshot={snapshot} month={editor.month ?? month}
      today={today} save={save} reload={refresh} open={setEditor} />}
    {notice && <div className="toast" role="status"><ShieldCheck size={18} /> {t(notice)}</div>}
  </div>
}

applyPreferences(readPreferences())
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
