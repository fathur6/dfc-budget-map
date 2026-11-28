import { createHash, createHmac } from 'node:crypto'
import manifest from '../package.json' with { type: 'json' }

const { version, buildNumber, versionStartBuild } = manifest
const releaseVersion = version.split('.').slice(0, 2).concat(buildNumber - versionStartBuild).join('.')
const locales = new Set(['en', 'ms', 'id', 'th'])
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(payload, status = 200, headers = {}) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' })
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'forbidden' }, 403)
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')
      || Number(request.headers.get('content-length')) > 8192) return json({ error: 'invalid_request' }, 400)

    const endpoint = process.env.FEATURE_REQUESTS_WEB_APP_URL?.trim()
    const secret = process.env.FEATURE_REQUESTS_SECRET?.trim()
    if (!secret || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint ?? '')) {
      return json({ error: 'not_configured' }, 503)
    }

    const body = await request.text().catch(() => '')
    let data
    try { data = body.length <= 8192 && JSON.parse(body) } catch { return json({ error: 'invalid_request' }, 400) }
    const suggestion = typeof data?.suggestion === 'string' ? data.suggestion.trim() : ''
    const email = typeof data?.email === 'string' ? data.email.trim() : ''
    if (!suggestion || suggestion.length > 1500 || email.length > 254 || (email && !emailPattern.test(email))
      || typeof data?.id !== 'string' || !uuid.test(data.id) || !locales.has(data.language) || data.website) {
      return json({ error: 'invalid_request' }, 400)
    }

    const sender = request.headers.get('x-vercel-forwarded-for') ?? 'unknown'
    const payload = JSON.stringify({
      id: data.id, suggestion, email, language: data.language, sentAt: Date.now(),
      version: `v${releaseVersion} (Build ${buildNumber})`,
      sender: createHash('sha256').update(sender).digest('hex'),
    })
    const signature = createHmac('sha256', secret).update(payload).digest('hex')

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, signature }),
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) return json({ error: 'unavailable' }, 502)
      const receipt = await response.json()
      if (receipt.ok === true && receipt.id === data.id) return json({ id: receipt.id }, 201)
      if (receipt.error === 'rate_limited') return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' })
      return json({ error: 'unavailable' }, 502)
    } catch {
      return json({ error: 'unavailable' }, 502)
    }
  },
}
