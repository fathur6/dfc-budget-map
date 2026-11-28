import { t } from './preferences.js'
import { useState } from 'react'
import { ArrowRight, FlaskConical } from 'lucide-react'
import { money, monthLabel, parseMoney, projectCommitment, simulate, validMonth } from './budget.js'
import { MonthField } from './editors.jsx'
import { CashFlowChart } from './CashFlowChart.jsx'
import { projectSavingsSupport } from './savings.js'

function ScenarioResult({ result, scenario, provisional }) {
  const { before, after, headroom } = result
  const tightest = after && monthLabel(after.month, 'long')
  let headline
  if (result.missing) headline = t('Set income for {month} to complete this scenario.', { month: monthLabel(result.missing, 'long') })
  else if (before.remaining < 0) headline = t('{month} already has a shortfall. The new instalment widens it by {amount}.', { month: tightest, amount: money(scenario.amount) })
  else if (result.status === 'deficit') headline = t('The new instalment creates a shortfall in {month}, the tightest month.', { month: tightest })
  else if (result.status === 'tight') headline = t('The new instalment leaves {month} below your buffer.', { month: tightest })
  else headline = t('On the entered figures, the scenario meets your monthly buffer.')

  const comparison = [
    ['First month below buffer', column => column.firstBelow ? monthLabel(column.firstBelow) : t('None')],
    ['Tightest month', column => `${monthLabel(column.month)} · ${money(column.remaining)}`],
    ['Months below buffer', column => t('{count} of {total}', { count: column.belowCount, total: scenario.duration })],
  ]

  const tone = result.status === 'fits' && !result.unconfirmedCount ? 'fits' : result.status === 'deficit' ? 'deficit' : 'tight'
  return <div className={'scenario ' + tone} aria-live="polite">
    <strong>{headline}</strong>
    {after && <>
      <p>{headroom < 0 ? t('{amount} below your buffer in {month}.', { amount: money(-headroom), month: tightest })
        : headroom > 0 ? t('{amount} above your buffer in {month}.', { amount: money(headroom), month: tightest }) : t("Meets your buffer exactly in ") + tightest + '.'}</p>
      {result.unconfirmedCount > 0 && <p><strong>{t("Forecast incomplete.")}</strong> {t("Spending is unconfirmed in")} {result.unconfirmedCount} {t("of")} {scenario.duration} {t("months.")}</p>}
      <div className="scenario-comparison-scroll">
        <table className="scenario-comparison">
          <thead><tr><td /><th scope="col">{t("Before new instalment")}</th><th scope="col">{t("After new instalment")}</th></tr></thead>
          <tbody>{comparison.map(([label, value]) => <tr key={label}>
            <th scope="row">{t(label)}</th><td>{value(before)}</td><td>{value(after)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
    {provisional && <p>{t("Some commitment schedules are provisional.")}</p>}
    {result.arrears > 0 && <p>{t("Both scenarios include")} {money(result.arrears)} {t("in earlier missed payments in the first month.")}</p>}
  </div>
}

function ScenarioMonths({ entries, buffer }) {
  const balanceCell = value => <td className={value != null && value < buffer ? 'cash-negative' : undefined}>{money(value)}</td>
  return <section className="panel map-panel" aria-labelledby="scenario-months-title">
    <div className="panel-heading"><div><h2 id="scenario-months-title">{t("Monthly comparison")}</h2>
      <p>{t("Monthly buffer")} {money(buffer)}{t(". Values below the buffer are highlighted.")}</p></div></div>
    <div className="scenario-months-scroll" role="region" aria-label={t("Monthly instalment comparison")} tabIndex={0}>
      <table className="scenario-months">
        <thead><tr><th scope="col">{t("Month")}</th><th scope="col">{t("Before new instalment")}</th>
          <th scope="col">{t("New instalment")}</th><th scope="col">{t("After new instalment")}</th></tr></thead>
        <tbody>{entries.map(entry => <tr key={entry.month}>
          <th scope="row">{monthLabel(entry.month)}</th>
          {balanceCell(entry.baseline)}<td>{money(entry.proposed)}</td>{balanceCell(entry.balance)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>
}

function SavingsSupport({ support }) {
  const { before, after } = support
  const uncovered = after.impacts.reduce((total, month) => total + month.shortfall, 0)
  const additional = after.used - before.used
  return <section className="panel map-panel" aria-labelledby="savings-support-title">
    <div className="panel-heading"><div><h2 id="savings-support-title">{t('Use savings to cover shortfalls')}</h2>
      <p>{t('Uses confirmed jar balances above their minimums to cover monthly shortfalls up to RM 0.')}</p></div></div>
    <p className="savings-support-summary">{t('{amount} drawn from savings with the new instalment.', { amount: money(after.used) })}
      {additional > 0 && <> {t('{amount} more than before the new instalment.', { amount: money(additional) })}</>}
      {uncovered > 0 && <> <strong className="cash-negative">{t('{amount} in shortfalls remains.', { amount: money(uncovered) })}</strong></>}</p>
    <div className="scenario-months-scroll" role="region" aria-label={t('Monthly jar withdrawals')} tabIndex={0}>
      <table className="scenario-months savings-scenario-table"><thead><tr>
        <th scope="col">{t('Month')}</th><th scope="col">{t('Shortfall before jar draw')}</th>
        <th scope="col">{t('Draw from jars')}</th><th scope="col">{t('Shortfall remaining')}</th>
      </tr></thead><tbody>{after.impacts.map(impact => <tr key={impact.month}>
        <th scope="row">{monthLabel(impact.month)}</th><td>{money(-impact.cash)}</td>
        <td>{impact.draws.length ? impact.draws.map(draw => <div key={draw.id}>{draw.name} · {money(draw.amount)}</div>) : money(0)}</td>
        <td className={impact.shortfall > 0 ? 'cash-negative' : ''}>{money(impact.shortfall)}</td>
      </tr>)}</tbody></table>
    </div>
    <dl className="savings-support-balances">{after.jars.map(jar => <div key={jar.id}>
      <dt>{jar.name}</dt><dd>{t('{used} used · {balance} left', { used: money(jar.used), balance: money(jar.balance) })}</dd>
    </div>)}</dl>
  </section>
}

export function Simulator({ data, month, today, compact }) {
  const [scenario, setScenario] = useState(null)
  const [error, setError] = useState('')
  const projection = scenario && projectCommitment(data, scenario, today)
  const result = scenario && simulate(data, scenario, today, projection)
  const savings = projection && projectSavingsSupport(data.savingsJars ?? [], projection.months, today)
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
        <div><div className="section-title"><FlaskConical size={19} /><h1 id="sim-title">{t("Commitment simulator")}</h1></div>
          <p>{t("Compare your monthly result before and after a new instalment.")}</p></div>
      </div>
      <form className="sim-form" onSubmit={submit} onInput={() => { setScenario(null); setError('') }}>
        <div className="form-grid">
          <label className="field"><span>{t("New monthly payment")}</span><div className="money-input"><span>RM</span><input name="amount" inputMode="decimal" placeholder="0.00" required /></div></label>
          <MonthField label={t("Start month")} name="start" value={month > today.slice(0, 7) ? month : today.slice(0, 7)} min={today.slice(0, 7)} />
          <label className="field"><span>{t("Term (months)")}</span><input type="number" name="duration" min="1" max="120" defaultValue="12" required /></label>
          <label className="field"><span>{t("Minimum monthly buffer")}</span><div className="money-input"><span>RM</span><input name="buffer" inputMode="decimal" defaultValue="0.00" required /></div></label>
        </div>
        <button className="button primary" type="submit">{t("Run scenario")} <ArrowRight size={16} /></button>
        {error && <p className="form-error" role="alert">{t(error)}</p>}
      </form>
      {result && <ScenarioResult result={result} scenario={scenario} provisional={data.commitments.some(item => item.provisional)} />}
    </section>
    {!!savings?.after.impacts.length && <SavingsSupport support={savings} />}
    {projection && <>
      <CashFlowChart title={t("Scenario projection")} projected compact={compact}
        months={projection.months.map(entry => entry.month)} summaries={projection.months} month={scenario.start} />
      <ScenarioMonths entries={projection.months} buffer={scenario.buffer} />
    </>}
  </>
}
