import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { checkSupabase } from '../scripts/supabase-keep-alive.js'

const env = {
  SUPABASE_URL: 'https://exampleproject.supabase.co',
  SUPABASE_KEEP_ALIVE_KEY: 'sb_publishable_test-fixture',
}
const healthRow = () => Response.json([{ ready: true }])
const jwt = role => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'fixture'].join('.')

function run(responses, config = env) {
  const requests = []
  const waits = []
  const result = checkSupabase(config, {
    fetchImpl: async (url, options) => {
      requests.push({ url, ...options })
      const response = responses[requests.length - 1]
      if (response instanceof Error) throw response
      return response
    },
    sleep: async ms => { waits.push(ms) },
  })
  return { result, requests, waits }
}

test('accepts the expected REST response and sends a publishable key in the apikey header', async () => {
  const { result, requests, waits } = run([healthRow()])
  await result
  assert.equal(requests.length, 1)
  const [request] = requests
  assert.equal(request.url.href, env.SUPABASE_URL + '/rest/v1/keep_alive_health?select=ready&limit=1')
  assert.equal(request.method, 'GET')
  assert.equal(request.redirect, 'manual')
  assert.equal(request.headers.apikey, env.SUPABASE_KEEP_ALIVE_KEY)
  assert.equal(request.headers.Authorization, undefined)
  assert.deepEqual(waits, [])
})

test('uses a legacy anon JWT for both API headers', async () => {
  const key = jwt('anon')
  const { result, requests } = run([healthRow()], { ...env, SUPABASE_KEEP_ALIVE_KEY: key })
  await result
  assert.equal(requests[0].headers.apikey, key)
  assert.equal(requests[0].headers.Authorization, 'Bearer ' + key)
})

test('fails before requesting for missing config, unsafe URLs, or elevated keys', async () => {
  for (const config of [
    {},
    { ...env, SUPABASE_URL: ' ' },
    { ...env, SUPABASE_KEEP_ALIVE_KEY: '' },
    { ...env, SUPABASE_URL: 'https://exampleproject.supabase.co@elsewhere.invalid' },
    { ...env, SUPABASE_URL: 'http://exampleproject.supabase.co' },
    { ...env, SUPABASE_KEEP_ALIVE_KEY: 'sb_secret_fixture' },
    { ...env, SUPABASE_KEEP_ALIVE_KEY: jwt('service_role') },
  ]) {
    const { result, requests, waits } = run([], config)
    await assert.rejects(result, /Set SUPABASE|canonical HTTPS|legacy anon key/)
    assert.equal(requests.length, 0)
    assert.deepEqual(waits, [])
  }
  const cli = spawnSync(process.execPath, ['scripts/supabase-keep-alive.js'], {
    env: { ...process.env, SUPABASE_URL: '', SUPABASE_KEEP_ALIVE_KEY: '' },
    encoding: 'utf8',
  })
  assert.equal(cli.status, 1)
  assert.match(cli.stderr, /Set SUPABASE_URL/)
  assert.equal(cli.stdout, '')
})

test('fails on empty, malformed or unexpected results without retrying', async () => {
  for (const response of [
    Response.json([]),
    Response.json({ ready: true }),
    Response.json([{ ready: false }]),
    Response.json([{ ready: true, extra: 'must not be logged' }]),
    Response.json([{ ready: true }, { ready: true }]),
    new Response('<html>private fixture</html>'),
  ]) {
    const { result, requests, waits } = run([response])
    await assert.rejects(result, /^Error: Health endpoint returned (an unexpected row or no row|malformed JSON)\.$/)
    assert.equal(requests.length, 1)
    assert.deepEqual(waits, [])
  }
})

test('fails once on HTTP 401, 403, missing table, redirects and a paused project', async () => {
  for (const status of [401, 403, 404, 302, 540]) {
    const { result, requests, waits } = run([new Response('private fixture', { status })])
    await assert.rejects(result, new RegExp('HTTP ' + status))
    assert.equal(requests.length, 1)
    assert.deepEqual(waits, [])
  }
})

test('retries 429 and 5xx with bounded backoff and honours Retry-After', async () => {
  const { result, requests, waits } = run([
    new Response(null, { status: 429, headers: { 'Retry-After': '3' } }),
    new Response(null, { status: 503 }),
    healthRow(),
  ])
  await result
  assert.equal(requests.length, 3)
  assert.deepEqual(waits, [3000, 2000])

  const longWait = run([new Response(null, { status: 429, headers: { 'Retry-After': '60' } })])
  await assert.rejects(longWait.result, /Retry-After exceeds/)
  assert.equal(longWait.requests.length, 1)
  assert.deepEqual(longWait.waits, [])
})

test('stops after three transient HTTP or network failures without printing private details', async () => {
  for (const [status, error] of [[503, /HTTP 503 after 3 attempts/], [429, /HTTP 429 after 3 attempts/],
    [null, /^Error: Network request failed after 3 attempts\.$/]]) {
    const { result, requests, waits } = run(Array.from({ length: 3 }, () => status
      ? new Response('private fixture', { status })
      : new TypeError('sensitive transport fixture')))
    await assert.rejects(result, error)
    assert.equal(requests.length, 3)
    assert.deepEqual(waits, [1000, 2000])
  }
})

test('times out while reading a stalled response body and retries with fresh signals', async () => {
  const signals = []
  // AbortSignal.timeout uses an unreferenced timer. A real open HTTP socket keeps Node alive.
  const keepAlive = setInterval(() => {}, 1000)
  try {
    await assert.rejects(checkSupabase(env, {
      timeoutMs: 10,
      sleep: async () => {},
      fetchImpl: async (_url, { signal }) => {
        signals.push(signal)
        return {
          status: 200,
          json: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
        }
      },
    }), /Request timed out after 3 attempts/)
    assert.equal(new Set(signals).size, 3)
    assert.ok(signals.every(signal => signal.aborted))
  } finally {
    clearInterval(keepAlive)
  }
})
