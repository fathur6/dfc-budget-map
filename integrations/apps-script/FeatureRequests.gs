const FEATURE_REQUEST_HEADERS = [
  'Timestamp', 'User Email', 'Suggested Feature', 'Status', 'Language', 'App version', 'Request ID',
]
const FEATURE_REQUEST_LANGUAGES = { en: 'English', ms: 'Malay', id: 'Indonesian', th: 'Thai' }

// Run once from the script editor after setting the three script properties.
function setupFeatureRequests() {
  const sheet = getFeatureRequestSheet_(PropertiesService.getScriptProperties())
  const existing = sheet.getRange(1, 1, 1, FEATURE_REQUEST_HEADERS.length).getDisplayValues()[0]
  if (existing.some((value, index) => value && value !== FEATURE_REQUEST_HEADERS[index])) {
    throw new Error('The selected tab already has different headers. Check the tab ID.')
  }
  const lastRow = sheet.getLastRow()
  if (lastRow > 1 && (existing.slice(0, 3).some((value, index) => value !== FEATURE_REQUEST_HEADERS[index])
    || existing.slice(3).some((value, index) => !value && !sheet.getRange(2, index + 4, lastRow - 1, 1).isBlank()))) {
    throw new Error('The selected tab already contains unrelated rows.')
  }
  sheet.getRange(1, 1, 1, FEATURE_REQUEST_HEADERS.length).setValues([FEATURE_REQUEST_HEADERS]).setFontWeight('bold')
  sheet.setFrozenRows(Math.max(sheet.getFrozenRows(), 1))
  sheet.setColumnWidth(1, 160)
  sheet.setColumnWidth(2, 210)
  sheet.setColumnWidth(3, 380)
  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss')
    sheet.getRange(2, 3, sheet.getMaxRows() - 1, 1).setWrap(true)
  }
}

function doPost(event) {
  try {
    const config = PropertiesService.getScriptProperties()
    const key = config.getProperty('FEATURE_REQUESTS_SECRET')
    const body = event?.postData?.contents ?? ''
    if (!key || !body || body.length > 20000) return featureRequestReply_({ error: 'forbidden' })
    const { payload, signature } = JSON.parse(body)
    if (typeof payload !== 'string' || !/^[a-f0-9]{64}$/.test(signature ?? '')
      || !featureRequestSignatureMatches_(payload, signature, key)) return featureRequestReply_({ error: 'forbidden' })

    const request = JSON.parse(payload)
    if (!Number.isFinite(request.sentAt) || Math.abs(Date.now() - request.sentAt) > 60000
      || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(request.id)
      || !Object.prototype.hasOwnProperty.call(FEATURE_REQUEST_LANGUAGES, request.language)
      || typeof request.suggestion !== 'string' || !request.suggestion.trim() || request.suggestion.length > 1500
      || typeof request.email !== 'string' || request.email.length > 254
      || typeof request.version !== 'string' || request.version.length > 40
      || !/^[a-f0-9]{64}$/.test(request.sender)) return featureRequestReply_({ error: 'invalid_request' })

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(3000)) return featureRequestReply_({ error: 'busy' })
    try {
      const sheet = getFeatureRequestSheet_(config)
      const last = sheet.getLastRow()
      if (last < 1) return featureRequestReply_({ error: 'not_configured' })
      const prior = last > 1 && sheet.getRange(2, 7, last - 1, 1).createTextFinder(request.id).matchEntireCell(true).findNext()
      if (prior) return featureRequestReply_({ ok: true, id: request.id })
      const cache = CacheService.getScriptCache()
      const senderKey = 'feature-request:' + request.sender
      const minuteKey = 'feature-requests:' + Math.floor(Date.now() / 60000)
      const count = Number(cache.get(minuteKey) ?? 0)
      if (cache.get(senderKey) || count >= 20) return featureRequestReply_({ error: 'rate_limited' })

      // Plain text prevents suggestions or email addresses from becoming spreadsheet formulas.
      sheet.appendRow([new Date(), featureRequestText_(request.email), featureRequestText_(request.suggestion),
        'New', FEATURE_REQUEST_LANGUAGES[request.language], request.version, request.id])
      SpreadsheetApp.flush()
      cache.put(senderKey, '1', 60)
      cache.put(minuteKey, String(count + 1), 60)
      return featureRequestReply_({ ok: true, id: request.id })
    } finally {
      lock.releaseLock()
    }
  } catch {
    return featureRequestReply_({ error: 'unavailable' })
  }
}

function featureRequestSignatureMatches_(payload, signature, key) {
  const expected = Utilities.computeHmacSha256Signature(payload, key, Utilities.Charset.UTF_8)
    .map(byte => (byte & 255).toString(16).padStart(2, '0')).join('')
  let differences = 0
  for (let index = 0; index < expected.length; index++) {
    differences |= expected.charCodeAt(index) ^ signature.charCodeAt(index)
  }
  return differences === 0
}

function getFeatureRequestSheet_(config) {
  const spreadsheet = config.getProperty('FEATURE_REQUESTS_SPREADSHEET_ID')
  const tab = config.getProperty('FEATURE_REQUESTS_SHEET_ID')
  if (!spreadsheet || !/^\d+$/.test(tab ?? '')) throw new Error('Set the spreadsheet ID and tab ID in Script Properties.')
  const sheet = SpreadsheetApp.openById(spreadsheet).getSheets().find(item => String(item.getSheetId()) === tab)
  if (!sheet) throw new Error('The configured tab was not found.')
  return sheet
}

function featureRequestText_(text) {
  return /^[\s]*[=+@-]/.test(text) ? "'" + text : text
}

function featureRequestReply_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)
}
