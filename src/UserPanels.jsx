import { useRef, useState } from 'react'
import { ExternalLink, Send } from 'lucide-react'
import { Modal } from './editors.jsx'
import { languages, t } from './preferences.js'

const guide = 'https://github.com/fathur6/dfc-budget-map/blob/main/docs/getting-started.md'
const errorMessages = {
  not_configured: 'Feature requests are not configured for this deployment.',
  rate_limited: 'Please wait a minute before sending another request.',
  invalid_request: 'Check the suggestion and email address before sending.',
}
const requestFailure = 'Could not send the request. Please try again.'

export function FeatureRequest({ close, language }) {
  const [suggestion, setSuggestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState('')
  const requestId = useRef(null)

  async function send(event) {
    event.preventDefault()
    if (busy || !suggestion.trim()) return
    const form = new FormData(event.currentTarget)
    requestId.current ??= crypto.randomUUID()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requestId.current, suggestion, language, email: form.get('email'), website: form.get('website') }),
        signal: AbortSignal.timeout(15000),
      })
      const result = await response.json().catch(() => ({}))
      if (response.ok && result.id === requestId.current) setReceipt(result.id)
      else setError(errorMessages[result.error] ?? (response.status === 404 ? errorMessages.not_configured : requestFailure))
    } catch {
      setError(requestFailure)
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={t("Request a feature")} close={close} busy={busy}>
    {receipt ? <div className="editor">
      <p className="form-note" role="status">{t('Thanks. Your feature request was sent.')}</p>
      <p className="muted form-note">{t('Request ID')} <code>{receipt}</code></p>
      <footer className="modal-actions"><div className="spacer" />
        <button type="button" className="button secondary" onClick={close}>{t('Done')}</button>
      </footer>
    </div> : <form className="editor" onSubmit={send}>
      <p className="form-note">{t('Tell us what would make Budget Map work better for you.')}</p>
      <label className="field"><span>{t('Your suggestion')}</span>
        <textarea required rows={5} maxLength={1500} placeholder={t('Describe your idea…')} value={suggestion} disabled={busy}
          data-initial-focus onChange={event => { setSuggestion(event.target.value); requestId.current = null }} />
      </label>
      <label className="field"><span>{t('Contact email (optional)')}</span>
        <input type="email" name="email" maxLength={254} autoComplete="email" disabled={busy}
          onChange={() => { requestId.current = null }} />
      </label>
      <div className="feature-honeypot" aria-hidden="true">
        <input name="website" tabIndex={-1} autoComplete="off" aria-label={t("Website")} />
      </div>
      <p className="muted form-note">{t('The suggestion and any email you enter go to the Budget Map maintainer. Leave out financial details and passwords.')}</p>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <footer className="modal-actions"><div className="spacer" />
        <button type="submit" className="button primary" disabled={busy || !suggestion.trim()}>
          <Send size={15} aria-hidden="true" /> {t(busy ? 'Sending…' : 'Send request')}
        </button>
      </footer>
    </form>}
  </Modal>
}

export function Settings({ close, preferences, change, supabase }) {
  const integrations = [
    ['Vercel', 'Hosting and deployment', __APP_SERVICES__.vercel ? 'Hosted' : 'Local preview', '#1-create-your-app-on-vercel'],
    ['Supabase', 'Private sign-in and budget sync', supabase ? 'Configured' : 'Browser storage', '#connect-an-existing-supabase-project'],
    ['DeepSeek', 'Optional monthly insights', __APP_SERVICES__.deepseek ? 'Configured' : 'Not configured', '#enable-deepseek-insights'],
  ]
  return <Modal title={t("Settings")} close={close}>
    <div className="editor settings-panel">
      <div className="form-grid">
        <label className="field"><span>{t('Language')}</span>
          <select value={preferences.language} onChange={event => change({ ...preferences, language: event.target.value })}>
            {languages.map(([code, label]) => <option key={code} value={code} lang={code}>{label}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('Appearance')}</span>
          <select value={preferences.theme} onChange={event => change({ ...preferences, theme: event.target.value })}>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
      </div>
      <h3>{t('Integrations')}</h3>
      <ul className="settings-integrations" role="list">
        {integrations.map(([name, description, status, anchor]) => <li key={name}>
          <div><strong>{name}</strong><p>{t(description)}</p></div>
          <div className="settings-service-action">
            <span>{t(status)}</span>
            <a href={guide + anchor} target="_blank" rel="noopener noreferrer" className="icon-button"
              aria-label={t('{service} setup guide', { service: name })}><ExternalLink size={15} aria-hidden="true" /></a>
          </div>
        </li>)}
      </ul>
    </div>
  </Modal>
}
