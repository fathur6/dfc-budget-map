import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import handler from '../api/feature-requests.js'

const app = 'https://app.example'
const secret = 'test-secret-for-feature-requests-only'
const script = readFileSync(new URL('../integrations/apps-script/FeatureRequests.gs', import.meta.url), 'utf8')
const testVersion = /^v\d+\.\d+\.\d+ \(Build \d+\)$/

function browserRequest(data, origin = app) {
  return new Request(app + '/api/feature-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin, 'x-vercel-forwarded-for': '192.0.2.42' },
    body: JSON.stringify(data),
  })
}

test('accepts only verified feature submissions, writes plain text, and returns retry receipts', async (context) => {
  const priorSecret = process.env.FEATURE_REQUESTS_SECRET
  const priorUrl = process.env.FEATURE_REQUESTS_WEB_APP_URL
  const restoreEnv = (name, value) => {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  context.after(() => {
    restoreEnv('FEATURE_REQUESTS_SECRET', priorSecret)
    restoreEnv('FEATURE_REQUESTS_WEB_APP_URL', priorUrl)
  })
  const endpoint = 'https://script.google.com/macros/s/test/exec'
  process.env.FEATURE_REQUESTS_SECRET = secret
  process.env.FEATURE_REQUESTS_WEB_APP_URL = endpoint
  const config = {
    FEATURE_REQUESTS_SECRET: secret,
    FEATURE_REQUESTS_SPREADSHEET_ID: 'test-sheet',
    FEATURE_REQUESTS_SHEET_ID: '17',
  }
  const rows = []
  const cache = new Map()
  let incoming
  let locked = false
  const sheet = {
    getSheetId: () => 17,
    getLastRow: () => rows.length + 1,
    appendRow(row) { assert.ok(locked); rows.push(row) },
    getRange(_, column) {
      assert.equal(column, 7)
      return { createTextFinder: id => ({ matchEntireCell: () => ({ findNext: () => rows.some(row => row[6] === id) }) }) }
    },
  }
  const post = runInNewContext(script + '\ndoPost', {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => config[key] }) },
    SpreadsheetApp: { openById(id) { assert.equal(id, 'test-sheet'); return { getSheets: () => [sheet] } }, flush() {} },
    Utilities: { Charset: { UTF_8: 'UTF_8' }, computeHmacSha256Signature: (payload, key) => [...createHmac('sha256', key).update(payload).digest()] },
    LockService: { getScriptLock: () => ({
      tryLock() { assert.equal(locked, false); locked = true; return true },
      releaseLock() { locked = false },
    }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: body => ({ setMimeType: () => body }) },
  })
  const receiver = body => JSON.parse(post({ postData: { contents: body } }))
  context.mock.method(globalThis, 'fetch', async (url, { body }) => {
    assert.equal(url, endpoint)
    incoming = JSON.parse(body)
    return Response.json(receiver(body))
  })

  const request = { id: randomUUID(), suggestion: '=1+1', language: 'ms', email: '', cashInflow: 500 }
  assert.equal((await handler.fetch(browserRequest(request, 'https://elsewhere.example'))).status, 403)
  assert.equal((await handler.fetch(browserRequest({ ...request, email: 'invalid' }))).status, 400)
  assert.equal((await handler.fetch(browserRequest({ ...request, website: 'bot' }))).status, 400)
  assert.equal(incoming, undefined)

  const response = await handler.fetch(browserRequest(request))
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), { id: request.id })
  assert.deepEqual(Array.from(rows[0].slice(1, 5)), ['', "'=1+1", 'New', 'Malay'])
  assert.match(rows[0][5], testVersion)
  assert.equal(rows[0][6], request.id)
  assert.equal(JSON.parse(incoming.payload).cashInflow, undefined)
  assert.equal(incoming.payload.includes('192.0.2.42'), false)

  const tampered = { ...incoming, payload: incoming.payload.replace('=1+1', '=2+2') }
  assert.deepEqual(receiver(JSON.stringify(tampered)), { error: 'forbidden' })
  assert.equal((await handler.fetch(browserRequest(request))).status, 201)
  assert.equal(rows.length, 1)
  assert.equal((await handler.fetch(browserRequest({ ...request, id: randomUUID() }))).status, 429)
})
