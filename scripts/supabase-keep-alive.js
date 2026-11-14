import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const maxAttempts = 3
const maxBackoffMs = 10_000

function configure(env) {
  const url = env.SUPABASE_URL?.trim()
  const key = env.SUPABASE_KEEP_ALIVE_KEY?.trim()
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_KEEP_ALIVE_KEY.')

  // Restrict the key to the canonical hosted project origin.
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
    throw new Error('SUPABASE_URL must be the canonical HTTPS Supabase project URL.')
  }
  const headers = { apikey: key, Accept: 'application/json', 'Cache-Control': 'no-cache' }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    let role
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
      try {
        role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'))?.role
      } catch {
        // A malformed token is handled as invalid configuration below.
      }
    }
    if (role !== 'anon') throw new Error('Use a Supabase publishable key or legacy anon key.')
    headers.Authorization = 'Bearer ' + key
  }
  const endpoint = new URL('/rest/v1/keep_alive_health?select=ready&limit=1', url)
  return { endpoint, headers }
}

function retryAfterMs(value) {
  if (!value) return 0
  if (/^\d+$/.test(value)) return Number(value) * 1000
  return Math.max(0, Date.parse(value) - Date.now()) || 0
}

export async function checkSupabase(env, { fetchImpl = fetch, sleep = delay, timeoutMs = 8_000 } = {}) {
  const { endpoint, headers } = configure(env)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const signal = AbortSignal.timeout(timeoutMs)
    let response
    let rows
    let failure
    let retryAfter = 0
    try {
      response = await fetchImpl(endpoint, { method: 'GET', headers, signal, redirect: 'manual' })
      if (response.status === 200) rows = await response.json()
    } catch (error) {
      if (signal.aborted) failure = 'Request timed out'
      else if (error instanceof SyntaxError) throw new Error('Health endpoint returned malformed JSON.')
      else failure = 'Network request failed'
    }

    if (!failure && response.status === 200) {
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.ready !== true || Object.keys(rows[0]).length !== 1) {
        throw new Error('Health endpoint returned an unexpected row or no row.')
      }
      return
    }

    if (!failure) {
      if (response.body) await response.body.cancel().catch(() => {})
      const { status } = response
      if (status === 540) throw new Error('Supabase project is paused (HTTP 540). Resume it in the Supabase Dashboard.')
      if (status === 401 || status === 403) throw new Error('Supabase rejected anonymous access (HTTP ' + status + ').')
      if (status !== 429 && (status < 500 || status >= 600)) {
        throw new Error('Health endpoint returned HTTP ' + status + '.')
      }
      failure = 'Health endpoint returned HTTP ' + status
      retryAfter = retryAfterMs(response.headers.get('Retry-After'))
    }

    if (attempt === maxAttempts) throw new Error(failure + ' after ' + maxAttempts + ' attempts.')
    if (retryAfter > maxBackoffMs) throw new Error(failure + '. Retry-After exceeds the job’s retry window.')
    await sleep(Math.max(1000 * 2 ** (attempt - 1), retryAfter))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkSupabase(process.env)
    console.log('Supabase health row verified.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
