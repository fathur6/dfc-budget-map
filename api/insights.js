import { insightTypes, validInsightPlan, validInsightTypes } from '../src/insights.js'

const cooldownMs = 15_000
const lastRequest = new Map()

function json(payload, status = 200, headers = {}) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  })
}

const prompt = `You prioritize verified cash-flow facts for a monthly household budget dashboard.
Return only a JSON object with the keys "lead" and "review". Each value must be a supplied fact ID.
Example JSON: {"lead":"loan_covers_shortfall","review":"moved_to_later_month"}.
"lead" is the fact that best explains this month's position. A shortfall before borrowing
matters more than the positive result after borrowing. Missing income takes precedence.
"review" is the most useful fact to inspect next. Consider future shortfalls, transfers and missing spending.
You may choose the same ID twice if it is clearly the priority or the only fact.`

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' })

    const authorization = request.headers.get('authorization')
    if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization ?? '')) {
      return json({ error: 'sign_in_required' }, 401)
    }

    const manual = Boolean(process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    const authUrl = manual ? process.env.VITE_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
    const authKey = manual ? process.env.VITE_SUPABASE_PUBLISHABLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
    if (!authUrl || !authKey || !deepseekKey) return json({ error: 'not_configured' }, 503)

    const contentLength = request.headers.get('content-length')
    if (Number(contentLength) > 512) return json({ error: 'invalid_facts' }, 400)
    const types = await request.json().then(body => body?.types).catch(() => null)
    if (!validInsightTypes(types)) return json({ error: 'invalid_facts' }, 400)

    let user
    try {
      const auth = await fetch(new URL('/auth/v1/user', authUrl), {
        headers: { apikey: authKey, authorization },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      })
      if (auth.status === 401 || auth.status === 403) return json({ error: 'sign_in_required' }, 401)
      if (!auth.ok) return json({ error: 'auth_unavailable' }, 503)
      user = await auth.json()
    } catch {
      return json({ error: 'auth_unavailable' }, 503)
    }
    if (!user?.id || user.is_anonymous) return json({ error: 'sign_in_required' }, 401)

    const now = Date.now()
    for (const [id, previous] of lastRequest) {
      if (now - previous >= cooldownMs) lastRequest.delete(id)
    }
    if (lastRequest.has(user.id)) return json({ error: 'try_again' }, 429, { 'Retry-After': String(cooldownMs / 1000) })
    lastRequest.set(user.id, now)

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + deepseekKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-flash',
          thinking: { type: 'disabled' },
          max_tokens: 128,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: JSON.stringify(Object.fromEntries(types.map(type => [type, insightTypes[type]]))) },
          ],
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) return json({ error: 'provider_unavailable' }, 502)
      const completion = (await response.json()).choices?.[0]
      if (completion?.finish_reason !== 'stop') return json({ error: 'provider_unavailable' }, 502)
      const plan = JSON.parse(completion.message.content)
      if (!validInsightPlan(plan, types)) return json({ error: 'provider_unavailable' }, 502)
      return json({ lead: plan.lead, review: plan.review })
    } catch {
      return json({ error: 'provider_unavailable' }, 502)
    }
  },
}
