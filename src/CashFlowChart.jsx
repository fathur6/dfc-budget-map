import { t } from './preferences.js'
import { useRef, useState } from 'react'
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react'
import { money, monthLabel } from './budget.js'

const baseSeries = [
  { key: 'cashInflow', label: 'Income', color: '#4cdbb1' },
  { key: 'committed', label: 'Commitments', color: '#f7bb62' },
  { key: 'spent', label: 'Spending', color: '#83b9fa' },
  { key: 'balance', label: 'Balance', color: 'linear-gradient(90deg, #4cdbb1 50%, #ff8299 50%)' },
]

export function CashFlowChart({ months, summaries, month, title = 'Six-month cash flow', projected = false, compact }) {
  const fitWidth = compact && months.length <= 6
  const scrollRef = useRef(null)
  const [scrollEdges, setScrollEdges] = useState({ start: true, end: false })
  function scrollMonths(direction) {
    const viewport = scrollRef.current
    const plot = viewport.querySelector('.cash-plot')
    const step = plot.offsetWidth / months.length
    const visibleMonths = Math.max(1, Math.floor((viewport.clientWidth - 86) / step + 0.01))
    viewport.scrollBy({ left: direction * visibleMonths * step })
  }

  const [inspectedMonth, inspect] = useState(null)
  const [hidden, setHidden] = useState([])
  const includesLoans = !projected && summaries.some(entry => entry.loanProceeds > 0)
  const inflowSeries = { ...baseSeries[0], label: includesLoans ? 'Cash inflow' : 'Income' }
  const series = [inflowSeries, ...baseSeries.slice(1, -1),
    ...(projected ? [{ key: 'proposed', label: 'New payment', color: '#bd9bfa' }] : []),
    { ...baseSeries.at(-1), label: projected ? 'After new instalment' : 'Monthly result' },
  ]
  const visible = series.filter(({ key }) => !hidden.includes(key))
  const values = summaries.flatMap(({ cashInflow, committed, spent, proposed = 0 }) => {
    const start = cashInflow ?? 0
    return [start, start - committed - spent - proposed]
  })
  const peak = Math.max(100, ...values.map(Math.abs))
  const magnitude = 10 ** Math.floor(Math.log10(peak / 4))
  const step = Math.ceil(peak / 4 / magnitude) * magnitude
  const top = Math.max(step, Math.ceil(Math.max(...values) / step) * step)
  const bottom = Math.floor(Math.min(0, ...values) / step) * step
  const percent = number => 100 * (top - number) / (top - bottom)
  const ticks = Array.from({ length: (top - bottom) / step + 1 }, (_, index) => top - index * step)
  const isVisible = key => !hidden.includes(key)
  const band = (from, to) => ({
    top: percent(Math.max(from, to)) + '%',
    height: Math.abs(percent(from) - percent(to)) + '%',
  })
  const selected = months.includes(inspectedMonth) ? inspectedMonth : month
  const details = summaries[months.indexOf(selected)]

  return <section className="panel map-panel" aria-labelledby="cash-flow-title">
    <div className="panel-heading">
      <div><div className="section-title"><Activity size={19} /><h2 id="cash-flow-title">{t(title)}</h2></div>
        <p>{projected
          ? t("Income excludes loan proceeds. Select a month for exact amounts.")
          : (includesLoans ? t("Cash inflow includes loan proceeds and other income. ") : '') + t("Commitments and spending step down to the monthly result. Select a month to see exact amounts.")}{projected && months.length > 6 && t(" Scroll for later months.")}</p></div>
    </div>
    <div className="cash-chart">
      <div className="cash-legend" role="group" aria-label={t("Chart series")}>
        {series.map(({ key, label, color }) => <button type="button" key={key} className="button secondary"
          aria-pressed={!hidden.includes(key)} disabled={visible.length === 1 && visible[0].key === key}
          onClick={() => setHidden(hidden.includes(key) ? hidden.filter(item => item !== key) : [...hidden, key])}>
          <i style={{ background: color }} />{t(label)}
        </button>)}
      </div>
      {projected && months.length > 6 && <div className="cash-navigation">
        <button type="button" className="button secondary" disabled={scrollEdges.start}
          onClick={() => scrollMonths(-1)}><ChevronLeft size={16} /> {t("Earlier months")}</button>
        <button type="button" className="button secondary" disabled={scrollEdges.end}
          onClick={() => scrollMonths(1)}>{t("Later months")} <ChevronRight size={16} /></button>
      </div>}
      <div className="cash-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label={t(title) + t(" chart")}
        onScroll={event => {
          const { scrollLeft, scrollWidth, clientWidth } = event.currentTarget
          setScrollEdges({ start: scrollLeft <= 1, end: scrollLeft + clientWidth >= scrollWidth - 1 })
        }}>
        <div className={'cash-plot' + (fitWidth ? ' fit-chart' : '')}
          style={!fitWidth ? { minWidth: months.length * 90 + 'px', width: months.length > 6 ? `calc(${months.length / 6 * 100}% - ${months.length / 6 * 86}px)` : undefined } : undefined}>
          {ticks.map(tick => <div key={tick} className={'cash-axis' + (tick === 0 ? ' zero' : '')}
            style={{ top: percent(tick) + '%' }} aria-hidden="true"><span>{money(tick).replace(/\.00$/, '')}</span></div>)}
          <div className="cash-months" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
            {months.map((value, index) => {
              const { cashInflow, committed, spent, proposed = 0, balance } = summaries[index]
              const start = cashInflow ?? 0
              const afterCommitments = start - committed
              const afterSpending = afterCommitments - spent
              const segments = [
                { key: 'committed', label: 'Commitments', from: start, to: afterCommitments },
                { key: 'spent', label: 'Spending', from: afterCommitments, to: afterSpending },
                { key: 'proposed', label: 'New payment', from: afterSpending, to: afterSpending - proposed },
              ].filter(({ key, from, to }) => from !== to && isVisible(key))
              return <button type="button" className="cash-month" key={value}
                aria-label={t("Inspect ") + monthLabel(value, 'long')} aria-pressed={selected === value}
                onClick={() => inspect(value)}>
                <span className="cash-bars" aria-hidden="true">
                  {cashInflow != null && isVisible('cashInflow') && <>
                    <span className="cash-bar cash-income chart-rounded-top" title={t(inflowSeries.label) + ' ' + money(cashInflow)} style={band(0, cashInflow)} />
                    <span className="cash-connector" style={{ top: percent(cashInflow) + '%' }} />
                  </>}
                  {segments.map(({ key, label, from, to }, segmentIndex) => <span key={key}
                    className={'cash-bar cash-outflow ' + key + (segmentIndex === 0 ? ' chart-rounded-top' : '')}
                    title={t(label) + ' ' + money(from - to)} style={band(from, to)} />)}
                  {balance != null && balance !== 0 && isVisible('balance') &&
                    <span className={'cash-balance ' + (balance < 0 ? 'deficit' : 'surplus')}
                      style={band(0, balance)}>
                      <span className="cash-balance-hover" title={(balance < 0 ? t("Deficit ") : t("Surplus ")) + money(balance)} />
                    </span>}
                </span>
                <span className="cash-month-label">{monthLabel(value, 'short', !fitWidth)}</span>
              </button>
            })}
          </div>
        </div>
      </div>
      <div className="cash-details" aria-live="polite">
        <strong>{monthLabel(selected, 'long')}</strong>
        <dl>{(projected ? [...series.slice(0, -1), { key: 'baseline', label: 'Before new instalment' }, series.at(-1)] : series).map(({ key, label }) => <div key={key}><dt>{t(label)}</dt>
          <dd className={details[key] < 0 ? 'cash-negative' : undefined}>{money(details[key])}{key === 'balance' && details.balance != null &&
            <small> {details.balance < 0 ? t("Deficit") : details.balance > 0 ? t("Surplus") : t("Break-even")}</small>}</dd></div>)}</dl>
      </div>
    </div>
  </section>
}
