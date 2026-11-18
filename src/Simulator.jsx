import { useState } from 'react'
import { ArrowRight, FlaskConical } from 'lucide-react'
import { money, monthLabel, parseMoney, projectCommitment, simulate, validMonth } from './budget.js'
import { MonthField } from './editors.jsx'
import { CashFlowChart } from './CashFlowChart.jsx'

function ScenarioResult({ result, scenario, provisional }) {
  const { before, after, headroom } = result
  const tightest = after && monthLabel(after.month, 'long')
  let headline
  if (result.missing) headline = 'Set income for ' + monthLabel(result.missing, 'long') + ' to complete this scenario.'
  else if (before.remaining < 0) headline = `${tightest} already has a shortfall. The new instalment widens it by ${money(scenario.amount)}.`
  else if (result.status === 'deficit') headline = `The new instalment creates a shortfall in ${tightest}, the tightest month.`
  else if (result.status === 'tight') headline = `The new instalment leaves ${tightest} below your buffer.`
  else headline = 'On the entered figures, the scenario meets your monthly buffer.'

  const comparison = [
    ['First month below buffer', column => column.firstBelow ? monthLabel(column.firstBelow) : 'None'],
    ['Tightest month', column => `${monthLabel(column.month)} · ${money(column.remaining)}`],
    ['Months below buffer', column => `${column.belowCount} of ${scenario.duration}`],
  ]

  const tone = result.status === 'fits' && !result.unconfirmedCount ? 'fits' : result.status === 'deficit' ? 'deficit' : 'tight'
  return <div className={'scenario ' + tone} aria-live="polite">
    <strong>{headline}</strong>
    {after && <>
      <p>{headroom < 0 ? money(-headroom) + ' below your buffer in ' + tightest + '.'
        : headroom > 0 ? money(headroom) + ' above your buffer in ' + tightest + '.' : 'Meets your buffer exactly in ' + tightest + '.'}</p>
      {result.unconfirmedCount > 0 && <p><strong>Forecast incomplete.</strong> Spending is unconfirmed in {result.unconfirmedCount} of {scenario.duration} months.</p>}
      <div className="scenario-comparison-scroll">
        <table className="scenario-comparison">
          <thead><tr><td /><th scope="col">Before new instalment</th><th scope="col">After new instalment</th></tr></thead>
          <tbody>{comparison.map(([label, value]) => <tr key={label}>
            <th scope="row">{label}</th><td>{value(before)}</td><td>{value(after)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
    {provisional && <p>Some commitment schedules are provisional.</p>}
    {result.arrears > 0 && <p>Both scenarios include {money(result.arrears)} in earlier missed payments in the first month.</p>}
  </div>
}

function ScenarioMonths({ entries, buffer }) {
  const balanceCell = value => <td className={value != null && value < buffer ? 'cash-negative' : undefined}>{money(value)}</td>
  return <section className="panel map-panel" aria-labelledby="scenario-months-title">
    <div className="panel-heading"><div><h2 id="scenario-months-title">Monthly comparison</h2>
      <p>Monthly buffer {money(buffer)}. Values below the buffer are highlighted.</p></div></div>
    <div className="scenario-months-scroll" role="region" aria-label="Monthly instalment comparison" tabIndex={0}>
      <table className="scenario-months">
        <thead><tr><th scope="col">Month</th><th scope="col">Before new instalment</th>
          <th scope="col">New instalment</th><th scope="col">After new instalment</th></tr></thead>
        <tbody>{entries.map(entry => <tr key={entry.month}>
          <th scope="row">{monthLabel(entry.month)}</th>
          {balanceCell(entry.baseline)}<td>{money(entry.proposed)}</td>{balanceCell(entry.balance)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>
}

export function Simulator({ data, month, today }) {
  const [scenario, setScenario] = useState(null)
  const [error, setError] = useState('')
  const projection = scenario && projectCommitment(data, scenario, today)
  const result = scenario && simulate(data, scenario, today, projection)
  function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = parseMoney(form.get('amount'))
    const buffer = parseMoney(form.get('buffer'))
    const start = form.get('start')
    const duration = Number(form.get('duration'))
    if (amount == null || amount <= 0 || buffer == null || !validMonth(start)
      || start < today.slice(0, 7) || !Number.isInteger(duration) || duration < 1 || duration > 120) {
      setError('Enter a positive monthly amount, a valid start month, 1–120 months and a buffer of RM 0 or more.')
      setScenario(null)
      return
    }
    setError('')
    setScenario({ start, duration, amount, buffer })
  }
  return <>
    <section id="simulator" className="panel map-panel simulator-panel" aria-labelledby="sim-title">
      <div className="panel-heading">
        <div><div className="section-title"><FlaskConical size={19} /><h1 id="sim-title">Commitment simulator</h1></div>
          <p>Compare your monthly result before and after a new instalment.</p></div>
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
      {result && <ScenarioResult result={result} scenario={scenario} provisional={data.commitments.some(item => item.provisional)} />}
    </section>
    {projection && <>
      <CashFlowChart title="Scenario projection" projected
        months={projection.months.map(entry => entry.month)} summaries={projection.months} month={scenario.start} />
      <ScenarioMonths entries={projection.months} buffer={scenario.buffer} />
    </>}
  </>
}
