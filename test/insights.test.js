import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../api/insights.js'
import { emptyBudget, monthSummary } from '../src/budget.js'
import { demoInsightFacts, monthlyInsightFacts } from '../src/insights.js'

test('uses existing budget math for funding, transfers and the next shortfall', () => {
  const budget = emptyBudget()
  budget.income = 1180000
  budget.incomeSourcesByMonth['2026-11'] = [{ type: 'Loan proceeds', amount: 240000 }]
  budget.commitments = [
    { id: 'nov', start: '2026-11', end: '2026-11', amount: 946304, day: 15 },
    { id: 'dec', start: '2026-12', end: '2026-12', amount: 1183599, day: 15 },
    { id: 'late', start: '2026-11', end: '2026-11', amount: 189500, day: 15 },
    { id: 'early', start: '2026-11', end: '2026-11', amount: 1000, day: 15 },
  ]
  budget.payments = {
    'late:2026-11': { paymentMonth: '2026-12' },
    'early:2026-11': { status: 'paid', paymentMonth: '2026-10' },
  }
  budget.categories = [{ id: 'spend', start: '2026-11' }]
  budget.spending['spend:2026-11'] = { spent: 459200 }
  const months = ['2026-10', '2026-11', '2026-12']
  const summaries = months.map(month => monthSummary(budget, month, '2026-11-18'))

  assert.deepEqual(monthlyInsightFacts(months, summaries, '2026-11', '2026-11'), demoInsightFacts)
  assert.equal(monthlyInsightFacts(months, summaries, '2026-11', '2027-01').length, 2)
})

test('shows unknown income and distinguishes an explicit zero from missing spending', () => {
  const budget = emptyBudget()
  budget.categories = [{ id: 'spend', start: '2026-11' }]
  const month = '2026-11'
  const facts = () => monthlyInsightFacts([month], [monthSummary(budget, month, '2026-11-18')], month, month)
  assert.deepEqual(facts().map(({ type }) => type), ['income_missing', 'spending_missing'])
  budget.spending['spend:2026-11'] = { spent: 0 }
  assert.deepEqual(facts().map(({ type }) => type), ['income_missing'])
})

test('DeepSeek requests require sign-in and forward only predefined facts', async t => {
  const env = {
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
  }
  for (const [key, value] of Object.entries(env)) {
    const original = process.env[key]
    process.env[key] = value
    t.after(() => {
      if (original === undefined) delete process.env[key]
      else process.env[key] = original
    })
  }
  const calls = []
  let providerPlan = { lead: 'loan_covers_shortfall', review: 'moved_to_later_month', extra: 'ignored' }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).endsWith('/auth/v1/user')) {
      if (options.headers.authorization === 'Bearer invalid') return Response.json({}, { status: 401 })
      if (options.headers.authorization === 'Bearer anonymous') return Response.json({ id: 'anon', is_anonymous: true })
      return Response.json({ id: options.headers.authorization })
    }
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(providerPlan) } }],
    })
  })

  const types = demoInsightFacts.map(({ type }) => type)
  const request = (body, authorization) => handler.fetch(new Request('https://budget.example/api/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorization && { authorization }) },
    body: JSON.stringify(body),
  }))
  assert.equal((await request({ types })).status, 401)
  assert.equal((await request({ types: ['private name or custom prompt'] }, 'Bearer valid')).status, 400)
  assert.equal(calls.length, 0)
  for (const user of ['invalid', 'anonymous']) {
    assert.equal((await request({ types }, 'Bearer ' + user)).status, 401)
  }
  assert.equal(calls.length, 2)
  const response = await request({ types, unwanted: 'My private item 2255.04' }, 'Bearer valid')
  assert.deepEqual(await response.json(), { lead: 'loan_covers_shortfall', review: 'moved_to_later_month' })
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(calls.length, 4)
  const provider = calls[3]
  assert.equal(provider.url, 'https://api.deepseek.com/chat/completions')
  const body = JSON.parse(provider.options.body)
  assert.equal(body.model, 'deepseek-flash')
  assert.deepEqual(Object.keys(JSON.parse(body.messages.at(-1).content)), types)
  assert.doesNotMatch(provider.options.body, /private item|2255\.04|Bearer valid/)
  assert.equal((await request({ types }, 'Bearer valid')).status, 429)
  assert.equal(calls.length, 5)
  assert.match(calls[4].url, /\/auth\/v1\/user$/)

  providerPlan = { lead: 'unverified-recommendation', review: 'income_missing' }
  assert.equal((await request({ types }, 'Bearer other-user')).status, 502)
  delete process.env.DEEPSEEK_API_KEY
  assert.equal((await request({ types }, 'Bearer valid')).status, 503)
})
