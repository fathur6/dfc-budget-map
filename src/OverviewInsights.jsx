import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { money, monthLabel } from './budget.js'
import { Modal } from './editors.jsx'
import { demoInsightFacts, monthlyInsightFacts, validInsightPlan } from './insights.js'

const unavailable = 'DeepSeek is temporarily unavailable. The dashboard summary is shown below.'
const responseMessages = {
  not_configured: 'DeepSeek is not enabled for this deployment. The dashboard summary is shown below.',
  sign_in_required: 'Sign in again to use DeepSeek.',
  try_again: 'Please wait a moment before requesting another explanation.',
}

function factText(fact) {
  const month = monthLabel(fact.month, 'long')
  if (fact.type === 'income_missing') return `Enter income to calculate the monthly result for ${month}.`
  if (fact.type === 'spending_missing') return `No spending is entered for ${month}. Empty spending cells count as zero.`
  if (fact.type === 'moved_to_later_month') {
    const destination = fact.destination ? monthLabel(fact.destination, 'long') : 'later months'
    return `${money(fact.amount)} originally due in ${month} was allocated to ${destination}.`
  }
  if (fact.type === 'upcoming_shortfall') {
    return `${month} shows a projected shortfall of ${money(fact.amount)} based on the entered figures.`
  }

  const amount = money(Math.abs(fact.beforeLoans))
  const before = fact.beforeLoans < 0 ? `${amount} shortfall` : fact.beforeLoans > 0 ? `${amount} surplus` : 'Break-even'
  const result = fact.balance < 0 ? `${money(-fact.balance)} shortfall` : fact.balance > 0
    ? `${money(fact.balance)} surplus` : 'break-even'
  return <><strong>{before} before loan proceeds in {month}.</strong>
    {fact.loanProceeds > 0 && <> With {money(fact.loanProceeds)} in loan proceeds, the monthly result is {result}.</>}</>
}

function reviewLabel(fact) {
  if (fact.type === 'moved_to_later_month') return 'View transfers'
  if (fact.type === 'upcoming_shortfall') return 'Review ' + monthLabel(fact.month)
  if (fact.type === 'spending_missing') return 'Review monthly spending'
  return 'Review income and loan proceeds'
}

export function OverviewInsights({ months, summaries, month, current, supabase, signedIn, chooseMonth, open, navigate }) {
  const [confirm, setConfirm] = useState(false)
  const [run, setRun] = useState(null)
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])

  const monthFacts = monthlyInsightFacts(months, summaries, month, current)
  const facts = run?.demo ? demoInsightFacts : monthFacts
  const plan = run?.plan
  const lead = facts.find(fact => fact.type === plan?.lead) ?? facts[0]
  const review = facts.find(fact => fact.type === plan?.review)
  const transfers = facts.find(fact => fact.type === 'moved_to_later_month')

  function reviewFact(fact) {
    if (fact.type === 'moved_to_later_month') open({ type: 'commitment-breakdown', month: fact.month })
    else if (fact.type === 'upcoming_shortfall') chooseMonth(fact.month)
    else if (fact.type === 'spending_missing') navigate('spending')
    else open({ type: 'income', month: fact.month })
  }

  async function explain(demo) {
    if (controller.current) return
    const abort = new AbortController()
    controller.current = abort
    setConfirm(false)
    setRun({ demo, pending: true })
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.access_token) {
        setRun({ demo, message: 'Sign in again to use DeepSeek.' })
        return
      }
      const types = (demo ? demoInsightFacts : monthFacts).map(fact => fact.type)
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ types }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]),
      })
      const result = await response.json()
      if (response.ok && validInsightPlan(result, types)) {
        setRun({ demo, plan: result })
        return
      }
      const message = Object.hasOwn(responseMessages, result?.error) ? responseMessages[result.error] : unavailable
      setRun({ demo, message })
    } catch {
      if (!abort.signal.aborted) setRun({ demo, message: unavailable })
    } finally {
      controller.current = null
    }
  }

  return <section className="panel map-panel overview-insights" aria-labelledby="overview-insights-title">
    <div className="panel-heading">
      <div>
        <div className="section-title"><Sparkles size={19} /><h2 id="overview-insights-title">Monthly insights</h2></div>
        <p>{run?.demo ? 'Fictional demo · November 2026' : monthLabel(month, 'long')}{plan && ' · Prioritized by DeepSeek'}</p>
      </div>
      <div className="overview-insights-actions">
        {run?.demo && <button type="button" className="button secondary" disabled={run.pending} onClick={() => setRun(null)}>Back to my month</button>}
        {signedIn && !plan && <button type="button" className="button secondary" disabled={run?.pending}
          onClick={() => setConfirm(true)}>{run?.pending ? 'Generating…' : 'Explain this month'}</button>}
      </div>
    </div>
    <div className="overview-insights-content" aria-live="polite">
      {run?.message && <p className="overview-insights-message">{run.message}</p>}
      <p className={'insight-lead' + (lead.beforeLoans < 0 ? ' deficit' : '')}>{factText(lead)}</p>
      {facts.length > 1 && <ul>
        {facts.filter(fact => fact !== lead).map(fact => <li key={fact.type}>{factText(fact)}</li>)}
      </ul>}
      {!run?.demo && (review || transfers) && <div className="overview-insights-actions">
        {review && <button className="button secondary" type="button" onClick={() => reviewFact(review)}>{reviewLabel(review)}</button>}
        {transfers && review !== transfers && <button className="button secondary" type="button" onClick={() => reviewFact(transfers)}>View transfers</button>}
      </div>}
    </div>
    {confirm && <Modal title="Explain this month with DeepSeek" close={() => setConfirm(false)}>
      <div className="editor overview-insights-dialog">
        <p>DeepSeek receives general patterns such as a shortfall or payments moved to a later month. Budget Map inserts your dates and amounts here.</p>
        <footer className="modal-actions">
          <button type="button" className="button secondary" onClick={() => explain(true)}>Try with demo data</button>
          <button type="button" className="button primary" onClick={() => explain(false)}>Explain my month</button>
        </footer>
      </div>
    </Modal>}
  </section>
}
