import { BarChart3, PieChart, Target } from 'lucide-react'
import { money, monthLabel } from './budget.js'

function BreakdownRing({ segments, total, emptyLabel }) {
  let runningTotal = 0
  const slices = segments.filter(segment => segment.amount > 0).map(segment => {
    const start = runningTotal / total * 100
    runningTotal += segment.amount
    const end = runningTotal / total * 100
    return { ...segment, range: `${start}% ${end}%` }
  })
  const gradient = tone => slices.length > 1
    ? `conic-gradient(${slices.map(slice => `${slice[tone]} ${slice.range}`).join(', ')})`
    : slices[0]?.[tone] ?? 'var(--line)'

  return <div className="breakdown-ring" style={{ '--ring-light': gradient('color'), '--ring-dark': gradient('shade') }}>
    <div><span>{total || !emptyLabel ? 'Total' : emptyLabel}</span><strong>{money(total)}</strong></div>
  </div>
}

export function MonthlyBreakdownChart({
  entries, series, month, chooseMonth, title, description, overallTitle, totalLabel,
  highlightsTitle = 'Key highlights', emptyLabel,
}) {
  const max = Math.max(400, ...entries.map(entry => entry.total))
  const unit = 10 ** Math.floor(Math.log10(max / 4))
  const step = Math.ceil(max / 4 / unit) * unit
  const scale = step * 4
  const segments = series.map((item, index) => ({
    ...item, amount: entries.reduce((sum, entry) => sum + entry.amounts[index], 0),
  }))
  const total = segments.reduce((sum, segment) => sum + segment.amount, 0)
  const points = entries.map((entry, index) => `${index * 100 + 50},${100 - entry.total / scale * 100}`).join(' ')

  return <div className="breakdown-insights">
    <section className="breakdown-insight">
      <div className="section-title"><BarChart3 size={19} /><h3>{title}</h3></div>
      <p>{description} Select a month to focus its column in the table.</p>
      <div className="breakdown-chart-scroll" role="region" aria-label={title} tabIndex={0}>
        <div className="breakdown-plot">
          {[4, 3, 2, 1, 0].map(tick => <div key={tick} className="breakdown-axis"
            style={{ top: (4 - tick) * 25 + '%' }} aria-hidden="true">
            <span>{money(tick * step).replace(/\.00$/, '')}</span>
          </div>)}
          <div className="breakdown-columns">
            {entries.map(({ month: value, total: amount, amounts }) => {
              const detail = series.map(({ label }, index) => label + ' ' + money(amounts[index])).join(' · ')
              return <button type="button" className="breakdown-month" key={value}
                disabled={value < '2000-01' || value > '2100-12'} aria-pressed={value === month}
                aria-label={[monthLabel(value, 'long'), 'total ' + money(amount), detail].filter(Boolean).join(', ')}
                title={detail || emptyLabel} onClick={() => chooseMonth(value)}>
                <span className="breakdown-stack chart-rounded-top" aria-hidden="true"
                  style={{ height: amount / scale * 100 + '%' }}>
                  {series.map(({ label, color, shade }, index) => amounts[index] > 0 && <span key={label}
                    style={{ height: amounts[index] / amount * 100 + '%', background: `linear-gradient(${color}, ${shade})` }}
                    title={label + ' ' + money(amounts[index])} />)}
                </span>
                <span className="breakdown-point" style={{ top: (1 - amount / scale) * 100 + '%' }} aria-hidden="true" />
                <span className="breakdown-month-label" aria-hidden="true">{monthLabel(value)}<strong>{money(amount)}</strong></span>
              </button>
            })}
          </div>
          <svg className="breakdown-trend-line" viewBox={`0 0 ${entries.length * 100} 100`} preserveAspectRatio="none" aria-hidden="true">
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>
      <div className="legend breakdown-chart-legend">
        {series.map(({ label, color }) => <span key={label}><i style={{ background: color }} />{label}</span>)}
        <span><i className="breakdown-line-key" />{totalLabel}</span>
      </div>
    </section>
    <div className="breakdown-overall">
      <section className="breakdown-insight">
        <div className="section-title"><PieChart size={19} /><h3>{overallTitle}</h3></div>
        <p>{monthLabel(entries[0].month)} – {monthLabel(entries.at(-1).month)}</p>
        <BreakdownRing segments={segments} total={total} emptyLabel={emptyLabel} />
      </section>
      {segments.length > 0 && <section className="breakdown-insight">
        <div className="section-title"><Target size={19} /><h3>{highlightsTitle}</h3></div>
        <dl className="breakdown-highlights">
          {segments.map(({ label, color, amount }) => <div key={label}>
            <dt><i style={{ background: color }} />{label}</dt>
            <dd><strong style={{ color }}>{total ? (amount / total * 100).toFixed(1) + '%' : '—'}</strong><span>{money(amount)}</span></dd>
          </div>)}
        </dl>
      </section>}
    </div>
  </div>
}
