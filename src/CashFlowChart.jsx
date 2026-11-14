import { useState } from 'react'
import { Activity } from 'lucide-react'
import { money, monthLabel } from './budget.js'

const series = [
  { key: 'cashInflow', label: 'Income', color: '#4cdbb1' },
  { key: 'committed', label: 'Commitments', color: '#f7bb62' },
  { key: 'spent', label: 'Spending', color: '#83b9fa' },
  { key: 'balance', label: 'Balance', color: '#c4a5f5' },
]

export function CashFlowChart({ months, summaries, month }) {
  const [inspectedMonth, inspect] = useState(null)
  const [hidden, setHidden] = useState([])
  const visible = series.filter(({ key }) => !hidden.includes(key))
  const values = summaries.flatMap(summary => visible.map(({ key }) => summary[key] ?? 0))
  const peak = Math.max(100, ...values.map(Math.abs))
  const magnitude = 10 ** Math.floor(Math.log10(peak / 4))
  const step = Math.ceil(peak / 4 / magnitude) * magnitude
  const top = Math.max(step, Math.ceil(Math.max(...values) / step) * step)
  const bottom = Math.floor(Math.min(0, ...values) / step) * step
  const percent = number => 100 * (top - number) / (top - bottom)
  const ticks = Array.from({ length: (top - bottom) / step + 1 }, (_, index) => top - index * step)
  const selected = months.includes(inspectedMonth) ? inspectedMonth : month
  const details = summaries[months.indexOf(selected)]

  return <section className="panel map-panel" aria-labelledby="cash-flow-title">
    <div className="panel-heading">
      <div><div className="section-title"><Activity size={19} /><h2 id="cash-flow-title">Six-month cash flow</h2></div>
        <p>Income includes gifts, loan proceeds and other inflows. Select a month to inspect its totals.</p></div>
    </div>
    <div className="cash-chart">
      <div className="cash-legend" role="group" aria-label="Chart series">
        {series.map(({ key, label, color }) => <button type="button" key={key} className="button secondary"
          aria-pressed={!hidden.includes(key)} disabled={visible.length === 1 && visible[0].key === key}
          onClick={() => setHidden(hidden.includes(key) ? hidden.filter(item => item !== key) : [...hidden, key])}>
          <i style={{ background: color }} />{label}
        </button>)}
      </div>
      <div className="cash-scroll">
        <div className="cash-plot">
          {ticks.map(tick => <div key={tick} className={'cash-axis' + (tick === 0 ? ' zero' : '')}
            style={{ top: percent(tick) + '%' }} aria-hidden="true"><span>{money(tick).replace(/\.00$/, '')}</span></div>)}
          <div className="cash-months">
            {months.map((value, index) => <button type="button" className="cash-month" key={value}
              aria-label={'Inspect ' + monthLabel(value, 'long')} aria-pressed={selected === value}
              onClick={() => inspect(value)}>
              <span className="cash-bars" aria-hidden="true">
                {visible.map(({ key, color }) => {
                  const amount = summaries[index][key]
                  return <span className="cash-bar-slot" key={key}>{amount != null && <span className="cash-bar"
                    style={{ top: percent(Math.max(0, amount)) + '%', height: Math.abs(percent(amount) - percent(0)) + '%', background: amount < 0 ? '#ff8299' : color }} />}</span>
                })}
              </span>
              <span className="cash-month-label">{monthLabel(value)}</span>
            </button>)}
          </div>
        </div>
      </div>
      <div className="cash-details" aria-live="polite">
        <strong>{monthLabel(selected, 'long')}</strong>
        <dl>{series.map(({ key, label }) => <div key={key}><dt>{label}</dt>
          <dd className={details[key] < 0 ? 'cash-negative' : undefined}>{money(details[key])}</dd></div>)}</dl>
      </div>
    </div>
  </section>
}
