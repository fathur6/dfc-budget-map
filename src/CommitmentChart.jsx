import { BarChart3, PieChart, Target } from 'lucide-react'
import { money, monthLabel } from './budget.js'
import { statuses } from './editors.jsx'

const buckets = [
  ['paidTotal', 'paid'],
  ['scheduledTotal', 'scheduled'],
  ['missedTotal', 'missed'],
]

export function CommitmentChart({ months, summaries, month, chooseMonth }) {
  const max = Math.max(1, ...summaries.map(entry => entry.committed))
  const unit = 10 ** Math.floor(Math.log10(max / 4))
  const step = Math.ceil(max / 4 / unit) * unit
  const scale = step * 4
  const totals = buckets.map(([key]) => summaries.reduce((sum, entry) => sum + entry[key], 0))
  const total = totals.reduce((sum, amount) => sum + amount, 0)
  const shares = totals.map(amount => total ? amount / total * 100 : 0)
  const [paid, scheduled] = shares
  const ring = total ? `conic-gradient(var(--green) 0 ${paid}%, var(--amber) ${paid}% ${paid + scheduled}%, var(--red) ${paid + scheduled}% 100%)` : 'var(--line)'
  const points = summaries.map((entry, index) => `${index * 100 + 50},${100 - entry.committed / scale * 100}`).join(' ')

  return <div className="commitment-insights">
    <section className="commitment-insight commitment-trend">
      <div className="section-title"><BarChart3 size={19} /><h3>Monthly commitment vs. payment</h3></div>
      <p>Amounts follow the payment month. Select a month to focus its column in the table.</p>
      <div className="commitment-chart-scroll" role="region" aria-label="Monthly commitment chart" tabIndex={0}>
        <div className="commitment-plot">
          {[4, 3, 2, 1, 0].map(tick => <div key={tick} className="commitment-axis"
            style={{ top: (4 - tick) * 25 + '%' }} aria-hidden="true">
            <span>{money(tick * step).replace(/\.00$/, '')}</span>
          </div>)}
          <div className="commitment-columns">
            {summaries.map((entry, index) => {
              const value = months[index]
              const detail = buckets.map(([key, status]) => statuses[status].label + ' ' + money(entry[key])).join(' · ')
              return <button type="button" className="commitment-month" key={value}
                disabled={value < '2000-01' || value > '2100-12'} aria-pressed={value === month}
                aria-label={monthLabel(value, 'long') + ', total ' + money(entry.committed) + ', ' + detail}
                title={detail} onClick={() => chooseMonth(value)}>
                <span className="commitment-stack chart-rounded-top" aria-hidden="true"
                  style={{ height: entry.committed / scale * 100 + '%' }}>
                  {buckets.filter(([key]) => entry[key] > 0).map(([key, status]) => <span key={key} className={'commitment-color ' + status}
                    style={{ height: entry[key] / entry.committed * 100 + '%' }}
                    title={statuses[status].label + ' ' + money(entry[key])} />)}
                </span>
                <span className="commitment-point" style={{ top: (1 - entry.committed / scale) * 100 + '%' }} aria-hidden="true" />
                <span className="commitment-month-label" aria-hidden="true">{monthLabel(value)}<strong>{money(entry.committed)}</strong></span>
              </button>
            })}
          </div>
          <svg className="commitment-trend-line" viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>
      <div className="legend commitment-chart-legend">
        {buckets.map(([, status]) => <span key={status}><i className={status} />{statuses[status].label}</span>)}
        <span><i className="commitment-line-key" />Total commitment</span>
      </div>
    </section>
    <div className="commitment-overall">
      <section className="commitment-insight">
        <div className="section-title"><PieChart size={19} /><h3>Overall commitment</h3></div>
        <p>{monthLabel(months[0])} – {monthLabel(months.at(-1))}</p>
        <div className="commitment-ring" style={{ background: ring }}>
          <div><span>Total</span><strong>{money(total)}</strong></div>
        </div>
      </section>
      <section className="commitment-insight">
        <div className="section-title"><Target size={19} /><h3>Key highlights</h3></div>
        <dl className="commitment-highlights">
          {buckets.map(([, status], index) => <div key={status} className={status}>
            <dt><i className={'commitment-color ' + status} />{statuses[status].label}</dt>
            <dd><strong>{total ? shares[index].toFixed(1) + '%' : '—'}</strong><span>{money(totals[index])}</span></dd>
          </div>)}
        </dl>
      </section>
    </div>
  </div>
}
