import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, CarFront, ChevronLeft,
  ChevronRight, CircleHelp, CreditCard, Database, Download, FileUp, FlaskConical, Grid2X2, House, KeyRound, Layers3, LogIn,
  LogOut, Pencil, Plus, ShieldCheck, Wallet, Zap,
} from 'lucide-react'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import {
  active, addMonths, categoryMonth, emptyBudget, installment, money, monthLabel, monthSummary,
  outstandingBefore, parseMoney, paymentKey, simulate, todayMYT,
} from './budget.js'
import { Editor, Modal, MonthField, SetPassword, SignIn, statuses } from './editors.jsx'
import { incompleteConfig, loadBudget, saveBudget, supabase } from './storage.js'
import { downloadBackup } from './backup.js'
import './styles.css'

const nav = [
  ['overview', 'Overview', Grid2X2], ['commitments', 'Commitment map', Layers3],
  ['spending', 'Monthly spending', Wallet], ['simulator', 'Simulator', FlaskConical],
]
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

function MonthGrid({ rowHeading, label, months, month, current, chooseMonth, totalLabel, totals, renderTotal = money, children }) {
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
      <tfoot><tr><th scope="row">{totalLabel}</th>{totals.map((total, index) =>
        <td key={months[index]} className={months[index] === month ? 'selected-col' : ''}>{renderTotal(total)}</td>)}</tr></tfoot>
    </table>
  </div>
}

function BalanceCell({ balance }) {
  if (balance == null) return <span aria-label="Income not entered">—</span>
  const status = balance > 0 ? 'Surplus' : balance < 0 ? 'Deficit' : 'Break-even'
  return <span className={'monthly-balance ' + status.toLowerCase()}>
    <span>{money(balance)}</span>
    <small>{status}</small>
  </span>
}

function MonthlySummary({ months, month, current, summaries, chooseMonth }) {
  const rows = [
    { label: 'Income', field: 'income' },
    { label: 'Commitment', field: 'committed' },
    { label: 'Spending', field: 'spendingForecast' },
  ]
  return <section className="panel map-panel monthly-summary" aria-labelledby="monthly-summary-title">
    <div className="panel-heading">
      <div><div className="section-title"><Grid2X2 size={20} /><h2 id="monthly-summary-title">Monthly summary</h2></div>
        <p>Spending uses the higher of the budget and recorded amount for each category.</p>
      </div>
    </div>
    <MonthGrid rowHeading="Cash flow" label="Cash flow across six months" months={months} month={month}
      current={current} chooseMonth={chooseMonth} totalLabel="Balance"
      totals={summaries.map(entry => entry.balance)} renderTotal={balance => <BalanceCell balance={balance} />}>
      {rows.map(({ label, field }) => <tr key={field}>
        <th scope="row">{label}</th>
        {summaries.map((entry, index) => <td key={months[index]}
          className={months[index] === month ? 'selected-col' : ''}>{money(entry[field])}</td>)}
      </tr>)}
    </MonthGrid>
  </section>
}

function CommitmentMap({ data, months, month, current, today, summaries, chooseMonth, open }) {
  const rows = data.commitments.filter(item => months.some(value =>
    active(item, value) || data.payments[paymentKey(item.id, value)]?.oneOff
  ))
  return <section id="commitments" className="panel map-panel" aria-labelledby="map-title">
    <div className="panel-heading">
      <div><div className="section-title"><Layers3 size={20} /><h2 id="map-title">Commitment map</h2></div>
        <p>Select a cell to add or update a payment.</p></div>
      <button className="button secondary" onClick={() => open({ type: 'commitment' })}><Plus size={17} /> Add commitment</button>
    </div>
    <MonthGrid rowHeading="Commitment" label="Commitments across six months" months={months} month={month}
      current={current} chooseMonth={chooseMonth} totalLabel="Monthly total" totals={summaries.map(entry => entry.committed)}>
      {rows.map(item => {
        const Icon = icons[item.category] ?? CreditCard
        return <tr key={item.id}>
          <th scope="row"><button className="row-label" onClick={() => open({ type: 'commitment', item })} aria-label={'Edit ' + item.name}>
            <span className="row-icon"><Icon size={16} /></span><span><strong>{item.name}</strong><small>{item.provisional ? 'Verify schedule' : item.category} · due {item.day}</small></span>
          </button></th>
          {months.map(value => {
            const entry = installment(data, item, value, today)
            const status = entry && statuses[entry.status]
            const StatusIcon = status?.icon
            return <td key={value} className={value === month ? 'selected-col' : ''}>
              {entry ? <button className={'tile ' + entry.status}
                aria-label={item.name + ', ' + monthLabel(value, 'long') + ', ' + status.label + ', ' + money(entry.amount)}
                onClick={() => open({ type: 'payment', item, month: value })}>
                <StatusIcon size={14} strokeWidth={2.3} /><span>{money(entry.amount)}</span>
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

function Spending({ data, months, month, current, summaries, chooseMonth, open }) {
  const categories = data.categories.filter(item => months.some(value => active(item, value)))
  return <section id="spending" className="panel map-panel" aria-labelledby="spending-title">
    <div className="panel-heading">
      <div><div className="section-title"><Wallet size={19} /><h2 id="spending-title">Monthly spending</h2></div>
        <p>Record one spending total per category each month.</p></div>
      <button className="button secondary" onClick={() => open({ type: 'category' })}><Plus size={17} /> Add category</button>
    </div>
    <MonthGrid rowHeading="Category" label="Spending across six months" months={months} month={month}
      current={current} chooseMonth={chooseMonth} totalLabel="Total recorded"
      totals={summaries.map(entry => entry.hasSpending ? entry.spent : null)}>
      {categories.map(item => <tr key={item.id}>
        <th scope="row"><button className="row-label" onClick={() => open({ type: 'category', item })}
          aria-label={'Edit category ' + item.name}>
          <span className="row-icon"><Wallet size={16} /></span><strong>{item.name}</strong>
        </button></th>
        {months.map(value => {
          const entry = categoryMonth(data, item, value)
          const recorded = entry?.spent != null
          const label = item.name + ', ' + monthLabel(value, 'long')
          return <td key={value} className={value === month ? 'selected-col' : ''}>
            {entry && value >= '2000-01' && value <= '2100-12'
              ? <button type="button" className={recorded ? 'tile recorded-spend' : 'inactive-tile'}
                aria-label={recorded ? 'Edit spending for ' + label + ', ' + money(entry.spent) : 'Add spending for ' + label}
                onClick={() => open({ type: 'spending', item, month: value })}>
                {money(entry.spent)}
              </button>
              : <span className="inactive-tile" title="Category inactive this month">—</span>}
          </td>
        })}
      </tr>)}
      {!categories.length && <tr><td colSpan={months.length + 1} className="empty-row">Add a category to record monthly spending.</td></tr>}
    </MonthGrid>
  </section>
}

function Simulator({ data, month, today }) {
  const [scenario, setScenario] = useState(null)
  const [error, setError] = useState('')
  const result = scenario && simulate(data, scenario, today)
  function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = parseMoney(form.get('amount'))
    const buffer = parseMoney(form.get('buffer'))
    const start = form.get('start')
    const duration = Number(form.get('duration'))
    if (amount == null || amount <= 0 || buffer == null || !/^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$/.test(start)
      || start < today.slice(0, 7) || !Number.isInteger(duration) || duration < 1 || duration > 120) {
      setError('Enter a positive monthly amount, a valid start month, 1–120 months and a buffer of RM 0 or more.')
      setScenario(null)
      return
    }
    setError('')
    setScenario({ start, duration, amount, buffer })
  }
  return <section id="simulator" className="panel map-panel simulator-panel" aria-labelledby="sim-title">
    <div className="panel-heading">
      <div><div className="section-title"><FlaskConical size={19} /><h2 id="sim-title">Commitment simulator</h2></div>
        <p>See whether a new payment fits across its full term.</p></div>
    </div>
    <form className="sim-form" onSubmit={submit} onInput={() => { setScenario(null); setError('') }}>
      <div className="form-grid">
        <label className="field"><span>New monthly payment</span><div className="money-input"><span>RM</span><input name="amount" inputMode="decimal" placeholder="0.00" required /></div></label>
        <MonthField label="Start month" name="start" value={month > today.slice(0, 7) ? month : today.slice(0, 7)} min={today.slice(0, 7)} />
        <label className="field"><span>Term (months)</span><input type="number" name="duration" min="1" max="120" defaultValue="12" required /></label>
        <label className="field"><span>Minimum monthly buffer</span><div className="money-input"><span>RM</span><input name="buffer" inputMode="decimal" defaultValue="0.00" required /></div></label>
      </div>
      <button className="button primary" type="submit">Run scenario <ArrowRight size={16} /></button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
    {result && <div className={'scenario ' + (result.status ?? 'tight')} role="status">
      {result.missing ? <strong>Set income for {monthLabel(result.missing, 'long')} to run this scenario.</strong> : <>
        <strong>{result.status === 'fits' ? 'Fits the entered budget and buffer' : result.status === 'deficit' ? 'Would cause a deficit' : 'Falls below the buffer'}</strong>
        <p>Tightest month: {monthLabel(result.month, 'long')} · {money(result.remaining)} after the new payment.</p>
        <p>{result.headroom < 0 ? money(-result.headroom) + ' below your buffer.' : money(result.headroom) + ' above your buffer.'}</p>
      </>}
      {data.commitments.some(item => item.provisional) && <p>Some commitment schedules are provisional. Verify their amounts and dates before relying on this result.</p>}
      {result.arrears > 0 && <p>Includes {money(result.arrears)} in earlier missed payments in the first month.</p>}
    </div>}
  </section>
}

function App() {
  const [today, setToday] = useState(todayMYT)
  const current = today.slice(0, 7)
  const [month, setMonth] = useState(current)
  const [section, setSection] = useState('overview')
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
    setSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const data = snapshot?.budget
  const months = rangeOffsets.map(offset => addMonths(month, offset))
  const summaries = data && months.map(value => monthSummary(data, value, today))
  const summary = summaries?.[1]
  const arrears = data && month >= current ? outstandingBefore(data, month, today) : 0
  const balance = summary?.balance ?? null
  const paidPercent = summary?.count ? Math.round(summary.paidCount * 100 / summary.count) : 0

  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#overview" onClick={event => { event.preventDefault(); navigate('overview') }}>
        <span className="brand-icon"><Activity size={23} strokeWidth={2.4} /></span>
        <span>DFC <strong>Budget Map</strong></span>
      </a>
      <nav aria-label="Dashboard sections">
        {nav.map(([id, label, Icon]) => <button key={id} className={section === id ? 'active' : ''}
          aria-current={section === id ? 'location' : undefined} onClick={() => navigate(id)}><Icon size={18} />{label}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="help" onClick={() => setEditor({ type: 'help' })}><CircleHelp size={17} /> How it works</button>
        <span className="sidebar-meta"><span className="live-dot" /> MYR <span>·</span> Malaysia time</span>
      </div>
    </aside>

    <main className="main" id="overview">
      <header className="topbar">
        <span className="breadcrumb"><Grid2X2 size={15} /> Dashboard</span>
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
        {data && <>
          <section className="page-heading" aria-labelledby="page-title">
            <div>
              <p className="eyebrow"><span className="live-dot" /> Monthly overview</p>
              <h1 id="page-title">{monthLabel(month, 'long')}</h1>
              <p className="page-description">See what’s committed, what’s paid, and what’s left.</p>
            </div>
            <div className="month-controls">
              <button className="button secondary this-month" onClick={() => setMonth(current)} disabled={month === current}>This month</button>
              <div className="month-switcher">
                <button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} disabled={month <= '2000-01'}><ChevronLeft size={17} /></button>
                <button className="choose-month" aria-label="Choose month" onClick={() => setEditor({ type: 'month' })}><CalendarDays size={15} /> {monthLabel(month)}</button>
                <button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= '2100-12'}><ChevronRight size={17} /></button>
              </div>
            </div>
          </section>

          {data.notes?.length > 0 && <details className="source-notes">
            <summary>Screenshot import assumptions</summary>
            <ul>{data.notes.map(note => <li key={note}>{note}</li>)}</ul>
          </details>}
          <div className="metrics">
            <Metric icon={ArrowDownLeft} label="Take-home income" value={summary.income} onEdit={() => setEditor({ type: 'income' })}
              note={summary.income == null ? 'Set income to calculate your balance' : data.incomeByMonth[month] == null ? 'Default monthly income' : 'Using this month’s override'} />
            <Metric icon={CreditCard} label="Commitments" value={summary.committed} tone="amber"
              note={<><strong>{money(summary.outstanding)}</strong> unpaid this month</>} />
            <Metric icon={Wallet} label="Spending budget" value={summary.planned} tone="blue"
              note={<><strong>{money(summary.spent)}</strong> recorded this month</>} />
            <Metric icon={balance < 0 ? ArrowDownLeft : ArrowUpRight}
              label={balance < 0 ? 'Projected deficit' : balance == null ? 'Projected balance' : balance === 0 ? 'Projected balance' : 'Projected surplus'} value={balance}
              tone={balance < 0 ? 'red' : 'green'} note={arrears > 0 ? <>{money(arrears)} in earlier missed payments</> : 'After commitments and forecast spending'} />
          </div>

          {summary.count > 0 && <div className="completion">
            <span className="completion-icon"><ShieldCheck size={18} /></span>
            <div className="completion-label"><strong>Payments cleared</strong><span>{summary.paidCount} of {summary.count} paid</span></div>
            <div className="progress" role="progressbar" aria-label="Payments cleared" aria-valuemin={0} aria-valuemax={100} aria-valuenow={paidPercent}>
              <span style={{ width: paidPercent + '%' }} />
            </div>
            <strong className="percent">{paidPercent}%</strong>
            {summary.missedCount > 0 && <span className="missed-count">{summary.missedCount} missed</span>}
          </div>}

          <MonthlySummary months={months} month={month} current={current} summaries={summaries} chooseMonth={setMonth} />
          <CommitmentMap data={data} months={months} month={month} current={current} today={today}
            summaries={summaries} chooseMonth={setMonth} open={setEditor} />
          <Spending data={data} months={months} month={month} current={current}
            summaries={summaries} chooseMonth={setMonth} open={setEditor} />
          <Simulator key={month} data={data} month={month} today={today} />
        </>}
      </div>
    </main>

    {editor?.type === 'sign-in' && <SignIn supabase={supabase} close={() => setEditor(null)} />}
    {editor?.type === 'password' && user && <SetPassword supabase={supabase} close={() => setEditor(null)}
      saved={() => { setEditor(null); setNotice('Sign-in password saved') }} />}
    {editor?.type === 'help' && <Modal title="How it works" close={() => setEditor(null)}>
      <div className="editor help-copy">
        <p>Enter take-home income, recurring commitments and spending categories. Set a first and last month for instalments or use the same month twice for a one-off bill.</p>
        <p>Each commitment cell is one monthly payment. Unpaid cells with verified schedules turn red after their due date in Malaysia time. Due days after the last day of a month are treated as month-end.</p>
        <p>Projected balance equals income minus all commitments and forecast spending. Each category uses whichever is higher, its budget or recorded spending.</p>
        <p>The simulator tests each month of the proposed term against your buffer. It charges earlier missed payments to the first month. Earlier missed payments are shown separately on the dashboard.</p>
        <p>Browser budgets stay on this device. Signing in opens a separate Supabase budget.</p>
      </div>
    </Modal>}
    {editor?.type === 'month' && <Modal title="Choose a month" close={() => setEditor(null)}>
      <form className="editor" onSubmit={event => {
        event.preventDefault()
        const value = new FormData(event.currentTarget).get('month')
        if (!/^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$/.test(value)) return
        setMonth(value)
        setEditor(null)
      }}>
        <MonthField label="Month to display" name="month" value={month} />
        <footer className="modal-actions"><div className="spacer" /><button className="button primary" type="submit">Show month <ArrowRight size={16} /></button></footer>
      </form>
    </Modal>}
    {editor && !['sign-in', 'password', 'help', 'month'].includes(editor.type) && snapshot && <Editor
      key={identity} editor={editor} close={() => setEditor(null)} snapshot={snapshot} month={editor.month ?? month}
      today={today} save={save} reload={refresh} />}
    {notice && <div className="toast" role="status"><ShieldCheck size={18} /> {notice}</div>}
  </div>
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
