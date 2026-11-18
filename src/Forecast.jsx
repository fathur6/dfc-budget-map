import { useState } from 'react'
import { inputMoney, money, monthLabel, parseMoney, spendingReviewKey, validMonth } from './budget.js'
import { Modal, MonthField } from './editors.jsx'

export function SpendingReview({ data, month, confirmed, save }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function toggleConfirmation() {
    setBusy(true)
    setError('')
    const spendingConfirmations = { ...data.spendingConfirmations }
    if (confirmed) delete spendingConfirmations[month]
    else spendingConfirmations[month] = spendingReviewKey(data, month)
    try {
      await save({ ...data, spendingConfirmations })
    } catch (failure) {
      setError(failure.message || 'Could not save the spending review.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="spending-review">
    <div><strong>{monthLabel(month, 'long')} spending</strong>
      <p>{confirmed ? 'Confirmed. Edits to spending or active items require a new review.' : 'Confirm when the amounts entered for this month are complete.'}</p>
    </div>
    <button type="button" className="button secondary" onClick={toggleConfirmation} disabled={busy || !validMonth(month)}>
      {busy ? 'Saving…' : confirmed ? 'Undo confirmation' : 'Confirm spending for this month'}
    </button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>
}

export function OpeningCashEditor({ openingCash, month, close, save, data }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const next = { ...data }
    if (event.nativeEvent.submitter?.value === 'remove') {
      delete next.openingCash
    } else {
      const month = values.get('opening-month')
      const raw = String(values.get('opening-amount') ?? '').trim()
      const magnitude = parseMoney(raw.startsWith('-') ? raw.slice(1) : raw)
      if (!validMonth(month) || magnitude == null) {
        setError('Enter a valid month and cash balance with up to two decimal places.')
        return
      }
      next.openingCash = { month, amount: raw.startsWith('-') ? -magnitude : magnitude }
    }

    setError('')
    setBusy(true)
    try {
      await save(next)
    } catch (failure) {
      setError(failure.message || 'Could not save the opening cash balance.')
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Opening cash balance" close={close} busy={busy}>
    <form className="editor" onSubmit={submit}>
      <p className="muted form-note">Enter the cash available at the start of the selected month, before that month’s income or payments. Use a negative amount for an overdraft.</p>
      <MonthField label="Opening month" name="opening-month" value={openingCash?.month ?? month} />
      <label className="field"><span>Opening cash balance</span><div className="money-input">
        <span>RM</span><input name="opening-amount" inputMode="decimal" pattern="-?[0-9]{1,7}(\.[0-9]{1,2})?"
          placeholder="0.00" defaultValue={inputMoney(openingCash?.amount)} required />
      </div></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-actions">
        {openingCash && <button type="submit" value="remove" className="button secondary" formNoValidate disabled={busy}>Remove opening balance</button>}
        <div className="spacer" />
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save opening balance'}</button>
      </footer>
    </form>
  </Modal>
}

export function CashProjectionNote({ opening, projection }) {
  if (!opening) return null
  return <div className="cash-projection-note">
    <p><strong>Opening cash</strong> {money(opening.amount)} at the start of {monthLabel(opening.month, 'long')}.</p>
    {projection.incomplete && <p className="forecast-incomplete">First month with unconfirmed spending: {monthLabel(projection.incomplete, 'long')}.</p>}
    {projection.missingIncome && <p className="forecast-incomplete">Set income for {monthLabel(projection.missingIncome, 'long')} to continue the cash projection.</p>}
  </div>
}
