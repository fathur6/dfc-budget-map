import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowDownLeft, ArrowRight, CalendarDays, CarFront, ChevronLeft,
  ChevronRight, CircleHelp, CreditCard, Database, Download, FileUp, FlaskConical, GripVertical, Grid2X2, House, KeyRound, Layers3, LogIn,
  ListChecks, LogOut, Pencil, Plus, ShieldCheck, Wallet, Zap,
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
import { PaymentAllocation } from './PaymentAllocation.jsx'
import './styles.css'

const nav = [
  ['overview', 'Overview', Grid2X2], ['commitments', 'Commitment map', Layers3],
  ['spending', 'Monthly spending', Wallet], ['simulator', 'Simulator', FlaskConical],
]
const transferPage = ['monthly-transfer', 'Monthly Transfer', ListChecks]

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
      {onEdit && <button className="icon-button metric-edit" onClick={onEdit} aria-label={'Edit ' + label.toLowerCase()}><Pencil size={14} /></button>}
    </div>
    <Amount value={value} />
    <div className="metric-note">{note}</div>
    {children}
  </article>
}

function MonthGrid({ rowHeading, label, months, month, current, chooseMonth, totalLabel, totals, renderTotal = money, closingCash, children }) {
  const scrollRef = useRef(null)
  useEffect(() => {
    const container = scrollRef.current
    const monthColumn = container.querySelector('thead th:nth-child(3)')
    const labelColumn = container.querySelector('thead th:first-child')
    container.scrollLeft = monthColumn.offsetLeft - labelColumn.offsetWidth
  }, [month])
  return <div className="table-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label={label}>
    <table className="map-table">
      <thead><tr>
        <th scope="col">{rowHeading}</th>
        {months.map(value => <th key={value} scope="col" className={value === month ? 'selected-col' : ''}>
          <button className="month-column" aria-pressed={value === month} onClick={() => chooseMonth(value)}
            disabled={value < '2000-01' || value > '2100-12'}>
            <strong>{monthLabel(value)}</strong>
            {value === current && <span>Current</span>}
            {value === addMonths(current, 1) && <span>Next</span>}
          </button>
        </th>)}
      </tr></thead>
      <tbody>{children}</tbody>
      <tfoot>
        <tr><th scope="row">{totalLabel}</th>{totals.map((total, index) =>
          <td key={months[index]} className={months[index] === month ? 'selected-col' : ''}>{renderTotal(total)}</td>)}</tr>
        {closingCash && <tr className="closing-cash-row"><th scope="row">Projected closing cash</th>{closingCash.map((amount, index) =>
          <td key={months[index]} className={(months[index] === month ? 'selected-col ' : '') + (amount < 0 ? 'cash-negative' : '')}>
            {money(amount)}</td>)}</tr>}
      </tfoot>
    </table>
  </div>
}

function BalanceCell({ balance }) {
  if (balance == null) return <span aria-label="Balance unavailable">—</span>
  const status = balance > 0 ? 'Surplus' : balance < 0 ? 'Deficit' : 'Break-even'
  return <span className={'monthly-balance ' + status.toLowerCase()}>
    <span>{money(balance)}</span>
    <small>{status}</small>
  </span>
}

function MonthlySummary({ data, months, month, current, today, summaries, chooseMonth, open, save }) {
  const projection = data.openingCash && projectClosingCash(data, months, summaries, today)
  const rows = [
    { label: 'Income', value: (entry, value) => <button type="button" className="summary-detail-button"
      aria-label={'Edit income for ' + monthLabel(value, 'long') + ', ' + money(entry.income)}
      disabled={value < '2000-01' || value > '2100-12'} onClick={() => open({ type: 'income', month: value })}>
      {money(entry.income)} <Pencil size={12} aria-hidden="true" />
    </button> },
    ...(summaries.some(entry => entry.loanProceeds > 0)
      ? [{ label: 'Loan proceeds', value: entry => money(entry.loanProceeds || null) }] : []),
    { label: 'Commitment', value: (entry, value) => entry.movedIn.length || entry.movedOut.length
      ? <button type="button" className="summary-detail-button"
        aria-label={'Commitment breakdown for ' + monthLabel(value, 'long') + ', ' + money(entry.committed)}
        onClick={() => open({ type: 'commitment-breakdown', month: value })}>
        {money(entry.committed)}<small>View transfers</small>
      </button>
      : money(entry.committed) },
    { label: 'Spending', value: entry => money(entry.hasSpending ? entry.spent : null) },
    ...(summaries.some(entry => entry.loanProceeds > 0)
      ? [{ label: 'Before loan proceeds', value: entry => money(entry.beforeLoans) }] : []),
  ]
  return <section className="panel map-panel monthly-summary" aria-labelledby="monthly-summary-title">
    <div className="panel-heading">
      <div><div className="section-title"><Grid2X2 size={20} /><h2 id="monthly-summary-title">Monthly summary</h2></div>
        <p>Monthly results use entered spending. Empty spending cells count as zero.</p>
      </div>
      <button type="button" className="button secondary" onClick={() => open({ type: 'opening-cash' })}>
        {data.openingCash ? 'Edit opening cash' : 'Set opening cash'}
      </button>
    </div>
    <SpendingReview data={data} month={month} confirmed={summaries[months.indexOf(month)].spendingConfirmed} save={save} />
    <CashProjectionNote opening={data.openingCash} projection={projection} />
    <MonthGrid rowHeading="Cash flow" label="Cash flow across six months" months={months} month={month}
      current={current} chooseMonth={chooseMonth} totalLabel="Monthly result" closingCash={projection?.balances}
      totals={summaries.map(entry => entry.balance)} renderTotal={balance => <BalanceCell balance={balance} />}>
      {rows.map(({ label, value }) => <tr key={label}>
        <th scope="row">{label}</th>
        {summaries.map((entry, index) => <td key={months[index]}
          className={months[index] === month ? 'selected-col' : ''}>{value(entry, months[index])}</td>)}
      </tr>)}
    </MonthGrid>
  </section>
}

function CommitmentBreakdown({ month, summary, close }) {
  return <Modal title={'Commitments for ' + monthLabel(month, 'long')} close={close}>
    <div className="editor">
      <dl className="transfer-breakdown">
        <div><dt>Originally due</dt><dd>{money(summary.scheduledCommitment)}</dd></div>
        {summary.movedIn.map(entry => <div key={'in:' + paymentKey(entry.id, entry.dueMonth) + ':' + (entry.allocationIndex ?? 'balance')}>
          <dt>{entry.name}<small>{entry.status === 'paid'
            ? entry.paidDate ? 'Paid on ' + dateLabel(entry.paidDate) : 'Paid' : entry.autoCarried ? 'Carried forward' : 'Planned'} · Due {monthLabel(entry.dueMonth)}
            {entry.partial?.paid > 0 && ' · Carried from a partial payment'}</small></dt>
          <dd className="transfer-in">+{money(entry.amount)}</dd>
        </div>)}
        {summary.movedOut.map(entry => <div key={'out:' + paymentKey(entry.id, entry.dueMonth) + ':' + (entry.allocationIndex ?? 'balance')}>
          <dt>{entry.name}<small>{entry.status === 'paid'
            ? (entry.paidDate ? 'Paid on ' + dateLabel(entry.paidDate) : 'Paid in ' + monthLabel(entry.paidMonth ?? entry.paymentMonth))
            : (entry.autoCarried ? 'Carried to ' : 'Planned for ') + monthLabel(entry.paymentMonth)}
            {entry.paidMonth && entry.paidMonth !== entry.paymentMonth && ' · ' + monthLabel(entry.paymentMonth) + ' budget'}
            {entry.partial?.paid > 0 && ' · Carried from a partial payment'}</small></dt>
          <dd className="transfer-out">{money(-entry.amount)}</dd>
        </div>)}
        <div><dt>Total for this month</dt><dd>{money(summary.committed)}</dd></div>
      </dl>
      <footer className="modal-actions"><div className="spacer" /><button className="button secondary" onClick={close}>Done</button></footer>
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
      disabled={savingOrder} aria-label={'Reorder ' + item.name + ' with Up or Down'}
      title="Drag to reorder or press Up or Down"
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
      <GripVertical size={16} /> Reorder rows
    </button>
  return { reordering, orderError, rowProps, handle, toggle }
}

function CommitmentMap({ data, months, month, current, today, summaries, chooseMonth, open, save }) {
  const carriedByMonth = new Map(months.map((value, index) => [
    value, summaries[index].movedIn.filter(entry => entry.dueMonth < value || entry.partial),
  ]))
  const rows = data.commitments.filter(item => months.some(value =>
    active(item, value) || data.payments[paymentKey(item.id, value)]?.oneOff
    || carriedByMonth.get(value).some(entry => entry.id === item.id)
  ))
  const { reordering, orderError, rowProps, handle, toggle } = useRowReorder(data, 'commitments', rows, save)

  return <section id="commitments" className="panel map-panel" aria-labelledby="map-title">
    <div className="panel-heading">
      <div><div className="section-title"><Layers3 size={20} /><h2 id="map-title">Commitment map</h2></div>
        <p>{reordering ? 'Drag a row by its handle or use the arrow keys.' : 'Select a cell to add or update a payment.'}</p></div>
      <div className="map-heading-actions">
        {toggle}
        <button className="button secondary" onClick={() => open({ type: 'commitment' })}><Plus size={17} /> Add commitment</button>
      </div>
    </div>
    {orderError && <p className="form-error" role="alert">{orderError}</p>}
    <CommitmentChart months={months} summaries={summaries} month={month} chooseMonth={chooseMonth} />
    <MonthGrid rowHeading="Commitment" label="Commitments across six months" months={months} month={month}
      current={current} chooseMonth={chooseMonth} totalLabel="Originally due" totals={summaries.map(entry => entry.scheduledCommitment)}>
      {rows.map((item, index) => {
        const Icon = icons[item.category] ?? CreditCard
        return <tr key={item.id} {...rowProps(item)}>
          <th scope="row"><div className="commitment-row-label">
            {handle(item, index)}
            <button className="row-label" onClick={() => open({ type: 'commitment', item })} aria-label={'Edit ' + item.name}>
            <span className="row-icon"><Icon size={16} /></span><span><strong>{item.name}</strong><small>{item.provisional ? 'Verify schedule' : item.category} · due {item.day}</small></span>
          </button></div></th>
          {months.map(value => {
            const entry = installment(data, item, value, today)
            const carried = carriedByMonth.get(value).filter(payment => payment.id === item.id)
            const carriedTotal = carried.reduce((sum, payment) => sum + payment.amount, 0)
            const parts = entry ? installmentParts(data, entry, value, today) : []
            const partsInCell = part => (part.budgetMonth ?? part.paymentMonth ?? value) === value
            const ownParts = parts.filter(partsInCell)
            const movedBalance = parts.find(part => part.status !== 'paid' && !partsInCell(part))
            const assigned = movedBalance?.paymentMonth ?? value
            const ownAmount = ownParts.reduce((sum, part) => sum + part.amount, 0)
            const shownAmount = carriedTotal ? ownAmount + carriedTotal : entry?.amount
            const remaining = entry?.partial ? remainingInstallment(entry) : null
            const status = entry?.partial
              ? { ...(remaining === 0 ? statuses.paid : statuses.scheduled), label: remaining === 0 ? 'Settled' : 'Partially paid' }
              : entry && statuses[entry.status]
            const tone = carriedTotal
              ? ([...carried, ...ownParts].every(payment => payment.status === 'paid') ? 'paid' : 'scheduled')
              : entry?.partial ? (remaining === 0 ? 'paid' : 'scheduled') : entry?.status
            const StatusIcon = carriedTotal ? statuses[tone].icon : status?.icon
            const carryNote = carriedTotal ? money(carriedTotal) + ' carried in' : ''
            const pooled = carriedTotal > 0 || entry?.partial?.allocations
            const cellRemaining = carriedTotal
              ? [...carried, ...ownParts].filter(part => part.status !== 'paid').reduce((sum, part) => sum + part.amount, 0)
              : remaining
            const paidAmount = shownAmount - cellRemaining
            const remainingNote = movedBalance && !carriedTotal ? ' carried to ' + monthLabel(assigned) : ' remaining'
            const movement = pooled
              ? (paidAmount > 0 ? money(paidAmount) + ' paid · ' : '')
                + (cellRemaining ? money(cellRemaining) + remainingNote : 'Settled')
              : entry?.partial
              ? money(entry.partial.paid) + ' paid · ' + money(entry.amount - entry.partial.paid)
                + (entry.partial.settled ? (entry.partial.paidDate ? ' paid on ' + dateLabel(entry.partial.paidDate)
                  : ' paid in ' + monthLabel(entry.partial.paidMonth ?? entry.partial.month)) : ' carried to ' + monthLabel(assigned))
              : entry?.status === 'paid' && (entry.paidDate || entry.paymentMonth !== undefined)
                ? (entry.budgetMonth ? 'On time · ' : '') + (entry.paidDate ? 'Paid on ' + dateLabel(entry.paidDate) : 'Paid in ' + monthLabel(entry.paymentMonth))
                : movedBalance ? (movedBalance.autoCarried ? 'Carried to ' : 'Planned for ') + monthLabel(assigned) : ''
            return <td key={value} className={value === month ? 'selected-col' : ''}>
              {entry || carriedTotal ? <button className={'tile ' + tone + (movement || carryNote ? ' moved-payment' : '')}
                aria-label={[item.name, monthLabel(value, 'long'), money(shownAmount), carryNote, carriedTotal ? statuses[tone].label : status?.label, movement].filter(Boolean).join(', ')}
                onClick={() => open({ type: 'payment', item, month: entry ? value : carried[0].dueMonth, allocationMonth: carriedTotal ? value : assigned })}>
                <span className="payment-amount"><StatusIcon size={14} strokeWidth={2.3} />{money(shownAmount)}</span>
                {carryNote && <small>{carryNote}</small>}
                {movement && <small>{movement}</small>}
                {carriedTotal > 0 && movedBalance && <small>{money(movedBalance.amount)} carried to {monthLabel(assigned)}</small>}
              </button> : value >= '2000-01' && value <= '2100-12'
                ? <button type="button" className="inactive-tile"
                  aria-label={'Add payment for ' + item.name + ', ' + monthLabel(value, 'long')}
                  title="Add payment for this month"
                  onClick={() => open({ type: 'payment', item, month: value })}>—</button>
                : <span className="inactive-tile">—</span>}
            </td>
          })}
        </tr>
      })}
      {!rows.length && <tr><td colSpan={months.length + 1} className="empty-row">No commitments in this period.</td></tr>}
    </MonthGrid>
    <div className="map-footer">
      <div className="legend">{Object.entries(statuses).map(([key, { label }]) =>
        <span key={key}><i className={key} />{label}</span>)}</div>
      <span className="month-range">{monthLabel(months[0])} — {monthLabel(months.at(-1))}</span>
    </div>
  </section>
}

function Spending({ data, months, month, current, summaries, chooseMonth, open, save }) {
  const [dragged, setDragged] = useState(null)
  const categories = data.categories.filter(item => months.some(value => active(item, value)))
  const { reordering, orderError, rowProps, handle, toggle } = useRowReorder(data, 'categories', categories, save)
  return <section id="spending" className="panel map-panel" aria-labelledby="spending-title">
    <div className="panel-heading">
      <div><div className="section-title"><Wallet size={19} /><h2 id="spending-title">Monthly spending</h2></div>
        <p>{reordering ? 'Drag a row by its handle or use the arrow keys.' : 'Select an empty cell to record spending. Drag a recorded amount to copy it within the same row.'}</p></div>
      <div className="map-heading-actions">
        {toggle}
        <button className="button secondary" onClick={() => open({ type: 'category' })}><Plus size={17} /> Add item</button>
      </div>
    </div>
    {orderError && <p className="form-error" role="alert">{orderError}</p>}
    <SpendingReview data={data} month={month} confirmed={summaries[months.indexOf(month)].spendingConfirmed} save={save} />
    <SpendingChart months={months} summaries={summaries} month={month} chooseMonth={chooseMonth} />
    <MonthGrid rowHeading="Item" label="Spending across six months" months={months} month={month}
      current={current} chooseMonth={chooseMonth} totalLabel="Total recorded"
      totals={summaries.map(entry => entry.hasSpending ? entry.spent : null)}>
      {categories.map((item, index) => <tr key={item.id} {...rowProps(item)}>
        <th scope="row"><div className="commitment-row-label">{handle(item, index)}
          <button className="row-label" onClick={() => open({ type: 'category', item })}
          aria-label={'Edit item ' + item.name}>
          <span className="row-icon"><Wallet size={16} /></span>
          <span><strong>{item.name}</strong>{item.category && <small>{item.category}</small>}</span>
        </button></div></th>
        {months.map(value => {
          const entry = categoryMonth(data, item, value)
          const recorded = entry?.spent != null
          const label = item.name + ', ' + monthLabel(value, 'long')
          const editable = entry && value >= '2000-01' && value <= '2100-12'
          const canDrop = editable && dragged?.id === item.id && dragged.month !== value
          return <td key={value} className={value === month ? 'selected-col' : ''}>
            {editable
              ? <button type="button" className={(recorded ? 'tile recorded-spend' : 'inactive-tile') + (canDrop ? ' spending-drop-target' : '')}
                aria-label={recorded ? 'Edit spending for ' + label + ', ' + money(entry.spent) : 'Add spending for ' + label}
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
                {money(entry.spent)}
              </button>
              : !entry && value >= '2000-01' && value <= '2100-12'
                ? <button type="button" className="inactive-tile"
                  aria-label={'Edit item dates for ' + label + ' (outside active months)'}
                  title="Outside the item’s active months. Click to edit its dates."
                  onClick={() => open({ type: 'category', item, unavailableMonth: value })}>—</button>
                : <span className="inactive-tile">—</span>}
          </td>
        })}
      </tr>)}
      {!categories.length && <tr><td colSpan={months.length + 1} className="empty-row">Add an item to record monthly spending.</td></tr>}
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

  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#overview" onClick={event => { event.preventDefault(); navigate('overview') }}>
        <span className="brand-icon"><Activity size={23} strokeWidth={2.4} /></span>
        <span>DFC <strong>Budget Map</strong></span>
      </a>
      <nav aria-label="Main menu">
        {nav.map(([id, label, Icon]) => <button key={id} className={section === id ? 'active' : ''}
          aria-current={section === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={18} />{label}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="help" onClick={() => setEditor({ type: 'help' })}><CircleHelp size={17} /> How it works</button>
        <span className="sidebar-meta"><span className="live-dot" /> MYR <span>·</span> Malaysia time</span>
        <span className="app-version">{__APP_VERSION_LABEL__}</span>
      </div>
    </aside>

    <main className="main" id="overview">
      <header className="topbar">
        <span className="breadcrumb"><PageIcon size={15} /> {pageLabel}</span>
        <div className="workspace-actions">
          <span className={'mode ' + (user ? 'cloud' : '')}><Database size={13} /> {user ? 'Supabase' : snapshot?.demo ? 'Demo · browser' : 'Browser storage'}</span>
          {supabase && user !== undefined && (user
            ? <button className="button secondary" onClick={signOut}><LogOut size={15} /> Sign out</button>
            : <button className="button secondary" onClick={() => setEditor({ type: 'sign-in' })}><LogIn size={15} /> Sign in</button>)}
          {snapshot && <details className="data-menu">
            <summary className="button secondary">Data</summary>
            <div className="data-options">
              {user && <button onClick={event => { event.currentTarget.closest('details').open = false; setEditor({ type: 'password' }) }}><KeyRound size={15} /> Set sign-in password</button>}
              <button onClick={event => { event.currentTarget.closest('details').open = false; setEditor({ type: 'import' }) }}><FileUp size={15} /> Import budget</button>
              <button onClick={event => { event.currentTarget.closest('details').open = false; downloadBackup(data) }}><Download size={15} /> Export backup</button>
            </div>
          </details>}
          {snapshot?.demo && <button className="button secondary" onClick={() => setEditor({ type: 'reset' })}>Start fresh</button>}
        </div>
      </header>
      <div className="content">
        {(incompleteConfig || authError) && <div className="form-error" role="alert">{authError || 'Cloud setup is incomplete. Set both Supabase environment variables to enable sign-in.'}</div>}
        {error && <div className="panel loading" role="alert">{error} <button className="button secondary" onClick={refresh}>Retry</button></div>}
        {!data && !error && <div className="panel loading" role="status">Loading budget…</div>}
        {data && simulatorPage && <Simulator key={month} data={data} month={month} today={today} />}
        {data && !simulatorPage && <>
          <section className="page-heading" aria-labelledby="page-title">
            <div>
              {overviewPage && <p className="eyebrow"><span className="live-dot" /> Monthly overview</p>}
              <h1 id="page-title">{overviewPage ? monthLabel(month, 'long') : pageLabel}</h1>
              <p className="page-description">{overviewPage ? 'See what’s committed, what’s paid, and what’s left.' : monthLabel(month, 'long')}</p>
            </div>
            <div className="month-controls">
              <button className="button secondary this-month" onClick={() => chooseMonth(current)} disabled={month === current}>This month</button>
              {transferPageActive
                ? <button className="button secondary" onClick={() => navigate('overview')}>Back to Overview</button>
                : <button className="button secondary" onClick={() => navigate(transferPage[0] + '/' + salaryChecklistMonth(data, month, today))}><ListChecks size={16} /> Monthly Transfer</button>}
              <div className="month-switcher">
                <button aria-label="Previous month" onClick={() => chooseMonth(addMonths(month, -1))} disabled={month <= '2000-01'}><ChevronLeft size={17} /></button>
                <button className="choose-month" aria-label="Choose month" onClick={() => setEditor({ type: 'month' })}><CalendarDays size={15} /> {monthLabel(month)}</button>
                <button aria-label="Next month" onClick={() => chooseMonth(addMonths(month, 1))} disabled={month >= '2100-12'}><ChevronRight size={17} /></button>
              </div>
            </div>
          </section>

          {transferPageActive && <MonthlyTransfer key={identity + ':' + month} data={data}
            month={month} today={today} summary={summary} save={save} open={setEditor} />}
          {overviewPage && <>
          <OverviewInsights key={identity + ':' + month + ':' + today + ':' + snapshot.revision}
            months={months} summaries={summaries} month={month} current={current} supabase={supabase} signedIn={Boolean(user)}
            chooseMonth={setMonth} open={setEditor} navigate={navigate} />
          <div className="metrics">
            <Metric icon={ArrowDownLeft} label="Cash inflow" value={summary.cashInflow} onEdit={() => setEditor({ type: 'income' })}
              note={summary.income == null ? 'Set base income to calculate your balance'
                : summary.loanProceeds ? <>{money(summary.loanProceeds)} in loan proceeds</>
                : summary.otherIncome ? <>{money(summary.otherIncome)} in additional income</>
                : data.incomeByMonth[month] == null ? 'Default monthly income' : 'Using this month’s override'} />
            <Metric icon={CreditCard} label="Commitments" value={summary.committed} tone="amber"
              note={<><strong>{money(summary.outstanding)}</strong> unpaid among payments allocated here</>} />
            <Metric icon={Wallet} label="Recorded spending" value={summary.hasSpending ? summary.spent : null} tone="blue"
              note={summary.spendingConfirmed ? 'Confirmed for this month' : 'Spending review pending'} />
          </div>

          <CashFlowChart months={months} summaries={summaries} month={month} />
          <MonthlySummary data={data} months={months} month={month} current={current} today={today}
            summaries={summaries} chooseMonth={setMonth} open={setEditor} save={save} />
          <OverviewDetails title="Commitment map" icon={Layers3}>
            <CommitmentMap data={data} months={months} month={month} current={current} today={today}
              summaries={summaries} chooseMonth={setMonth} open={setEditor} save={save} />
          </OverviewDetails>
          <OverviewDetails title="Monthly spending" icon={Wallet}>
            <Spending data={data} months={months} month={month} current={current}
              summaries={summaries} chooseMonth={setMonth} open={setEditor} save={save} />
          </OverviewDetails>
          </>}
          {section === 'commitments' && <CommitmentMap data={data} months={months} month={month} current={current} today={today}
            summaries={summaries} chooseMonth={setMonth} open={setEditor} save={save} />}
          {section === 'spending' && <Spending data={data} months={months} month={month} current={current}
            summaries={summaries} chooseMonth={setMonth} open={setEditor} save={save} />}
        </>}
      </div>
    </main>

    {editor?.type === 'sign-in' && <SignIn supabase={supabase} close={() => setEditor(null)} />}
    {editor?.type === 'password' && user && <SetPassword supabase={supabase} close={() => setEditor(null)}
      saved={() => { setEditor(null); setNotice('Sign-in password saved') }} />}
    {editor?.type === 'help' && <Modal title="How it works" close={() => setEditor(null)}>
      <div className="editor help-copy">
        <p>Open an income cell to enter base income and additional sources for that month. Record loan proceeds there and add repayments in the Commitment Map. Set the same first and last month for a one-off bill.</p>
        <p>Commitment cells keep their original due dates. From the 21st (Malaysia time), overdue balances roll into the next budget month. Use Record amount to pay the oldest instalment first and View transfers to see how amounts moved.</p>
        <p>Record Salary received in Monthly Transfer for the intended budget month. Payments for next month count toward that budget from the 21st, or from an earlier recorded salary receipt. Spending transfers use the selected month.</p>
        <p>Unpaid cells with verified schedules turn red after their due date in Malaysia time. Due days after the last day of a month are treated as month-end.</p>
        <p>The Overview and Monthly Summary balances use income plus loan proceeds, minus commitments and recorded spending. The simulator also uses recorded spending. Empty spending cells count as zero.</p>
        <p>Confirm spending once you have reviewed a month. An opening cash balance adds a projection of closing cash to Monthly Summary.</p>
        <p>The simulator excludes loan proceeds and follows the payment months you choose. It charges earlier missed payments that still need to be covered to the first month of the scenario.</p>
        <p>Browser budgets stay on this device. Signing in opens a separate Supabase budget.</p>
      </div>
    </Modal>}
    {editor?.type === 'month' && <Modal title="Choose a month" close={() => setEditor(null)}>
      <form className="editor" onSubmit={event => {
        event.preventDefault()
        const value = new FormData(event.currentTarget).get('month')
        if (!validMonth(value)) return
        chooseMonth(value)
        setEditor(null)
      }}>
        <MonthField label="Month to display" name="month" value={month} />
        <footer className="modal-actions"><div className="spacer" /><button className="button primary" type="submit">Show month <ArrowRight size={16} /></button></footer>
      </form>
    </Modal>}
    {editor?.type === 'commitment-breakdown' && data && <CommitmentBreakdown month={editor.month}
      summary={monthSummary(data, editor.month, today)} close={() => setEditor(null)} />}
    {editor?.type === 'opening-cash' && data && <OpeningCashEditor data={data} openingCash={data.openingCash}
      month={month} close={() => setEditor(null)} save={save} />}
    {editor?.type === 'allocate-payment' && data && <PaymentAllocation key={editor.item.id + ':' + editor.month}
      data={data} item={editor.item} month={editor.month} today={today} close={() => setEditor(null)} save={save} />}
    {editor && !['sign-in', 'password', 'help', 'month', 'commitment-breakdown', 'opening-cash', 'allocate-payment'].includes(editor.type) && snapshot && <Editor
      key={identity + ':' + editor.type} editor={editor} close={() => setEditor(null)} snapshot={snapshot} month={editor.month ?? month}
      today={today} save={save} reload={refresh} open={setEditor} />}
    {notice && <div className="toast" role="status"><ShieldCheck size={18} /> {notice}</div>}
  </div>
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
