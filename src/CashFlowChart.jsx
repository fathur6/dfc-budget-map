import { useState } from 'react'
import { Activity } from 'lucide-react'
import { money, monthLabel } from './budget.js'

const baseSeries = [
  { key: 'cashInflow', label: 'Income', color: '#4cdbb1' },
  { key: 'committed', label: 'Commitments', color: '#f7bb62' },
  { key: 'spent', label: 'Spending', color: '#83b9fa' },
  { key: 'balance', label: 'Balance', color: 'linear-gradient(90deg, #4cdbb1 50%, #ff8299 50%)' },
]

export function CashFlowChart({ months, summaries, month, title = 'Six-month cash flow', projected = false }) {
  const [inspectedMonth, inspect] = useState(null)
  const [hidden, setHidden] = useState([])
  const series = projected ? [...baseSeries.slice(0, -1), { key: 'proposed', label: 'New payment', color: '#bd9bfa' }, baseSeries.at(-1)] : baseSeries
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
      <div><div className="section-title"><Activity size={19} /><h2 id="cash-flow-title">{title}</h2></div>
        <p>{projected
          ? 'Income excludes loan proceeds. Select a month for exact amounts.'
          : 'Income includes additional inflows. Commitments and spending step down to the balance. Select a month to see exact amounts.'}{projected && months.length > 6 && ' Scroll for later months.'}</p></div>
    </div>
    <div className="cash-chart">
      <div className="cash-legend" role="group" aria-label="Chart series">
        {series.map(({ key, label, color }) => <button type="button" key={key} className="button secondary"
          aria-pressed={!hidden.includes(key)} disabled={visible.length === 1 && visible[0].key === key}
          onClick={() => setHidden(hidden.includes(key) ? hidden.filter(item => item !== key) : [...hidden, key])}>
          <i style={{ background: color }} />{label}
        </button>)}
      </div>
      <div className="cash-scroll" tabIndex={0} role="region" aria-label={title + ' chart'}>
        <div className="cash-plot" style={{ minWidth: months.length * 90 + 'px', width: months.length > 6 ? `calc((100% - 86px) * ${months.length / 6})` : undefined }}>
          {ticks.map(tick => <div key={tick} className={'cash-axis' + (tick === 0 ? ' zero' : '')}
            style={{ top: percent(tick) + '%' }} aria-hidden="true"><span>{money(tick).replace(/\.00$/, '')}</span></div>)}
          <div className="cash-months" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
            {months.map((value, index) => {
              const { cashInflow, committed, spent, proposed = 0, balance } = summaries[index]
              const start = cashInflow ?? 0
              const afterCommitments = start - committed
              return <button type="button" className="cash-month" key={value}
                aria-label={'Inspect ' + monthLabel(value, 'long')} aria-pressed={selected === value}
                onClick={() => inspect(value)}>
                <span className="cash-bars" aria-hidden="true">
                  {cashInflow != null && isVisible('cashInflow') && <>
                    <span className="cash-bar cash-income" title={'Income ' + money(cashInflow)} style={band(0, cashInflow)} />
                    <span className="cash-connector" style={{ top: percent(cashInflow) + '%' }} />
                  </>}
                  {isVisible('committed') && <span className="cash-bar cash-outflow" title={'Commitments ' + money(committed)}
                    style={{ ...band(start, afterCommitments), background: series[1].color }} />}
                  {isVisible('spent') && <span className="cash-bar cash-outflow" title={'Spending ' + money(spent)}
                    style={{ ...band(afterCommitments, afterCommitments - spent), background: series[2].color }} />}
                  {projected && isVisible('proposed') && <span className="cash-bar cash-outflow" title={'New payment ' + money(proposed)}
                    style={{ ...band(afterCommitments - spent, afterCommitments - spent - proposed), background: series[3].color }} />}
                  {balance != null && balance !== 0 && isVisible('balance') &&
                    <span className={'cash-balance ' + (balance < 0 ? 'deficit' : 'surplus')}
                      style={band(0, balance)}>
                      <span className="cash-balance-hover" title={(balance < 0 ? 'Deficit ' : 'Surplus ') + money(balance)} />
                    </span>}
                </span>
                <span className="cash-month-label">{monthLabel(value)}</span>
              </button>
            })}
          </div>
        </div>
      </div>
      <div className="cash-details" aria-live="polite">
        <strong>{monthLabel(selected, 'long')}</strong>
        <dl>{series.map(({ key, label }) => <div key={key}><dt>{label}</dt>
          <dd className={details[key] < 0 ? 'cash-negative' : undefined}>{money(details[key])}{key === 'balance' && details.balance != null &&
            <small> {details.balance < 0 ? 'Deficit' : details.balance > 0 ? 'Surplus' : 'Break-even'}</small>}</dd></div>)}</dl>
      </div>
    </div>
  </section>
}
