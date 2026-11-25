import { useState } from 'react'
import { inputMoney, money, monthLabel, parseMoney, paymentBudgetMonth, validDate } from './budget.js'
import { Modal } from './editors.jsx'
import { allocationRows, recordAllocatedPayment, splitPayment } from './transfers.js'

export function PaymentAllocation({ data, item, month, today, initialAmount, close, save }) {
  const [amountInput, setAmountInput] = useState(() => inputMoney(initialAmount))
  const [date, setDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rows = allocationRows(data, item, month, today)
  const due = rows.reduce((sum, row) => sum + (row.remaining ?? row.amount), 0)
  const amount = parseMoney(amountInput)
  const plan = splitPayment(rows, amount)
  const exceedsBalance = amount > due
  const dateAllowed = validDate(date) && date <= today
  const cashFlowMonth = dateAllowed ? paymentBudgetMonth(data, date.slice(0, 7), month, date) : null

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await save(recordAllocatedPayment(data, item, month, amount, date, today))
    } catch (failure) {
      setError(failure.message || 'Could not save the payment.')
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={'Record payment for ' + item.name} close={close} busy={busy}>
    <form className="editor" onSubmit={submit}>
      <p className="muted form-note">{monthLabel(month, 'long')} budget · {money(due)} outstanding. The oldest instalment on this checklist is paid first.</p>
      <div className="form-grid">
        <label className="field"><span>Amount paid</span><div className="money-input"><span>RM</span>
          <input inputMode="decimal" placeholder="0.00" data-initial-focus value={amountInput}
            onChange={event => setAmountInput(event.target.value)} required />
        </div></label>
        <label className="field"><span>Date paid</span><input type="date" min="2000-01-01" max={today}
          value={date} onChange={event => setDate(event.target.value)} required /></label>
      </div>
      {cashFlowMonth && <p className="muted form-note" role="status">Counts toward {monthLabel(cashFlowMonth, 'long')} cash flow.
        {amount > 0 && !exceedsBalance && <> {money(due - amount)} remains after this payment.</>}</p>}
      {plan.length > 0 && <div className="payment-allocation-scroll">
        <table className="payment-allocation-table">
          <thead><tr><th scope="col">Instalment due</th><th scope="col">Apply</th><th scope="col">Remaining</th></tr></thead>
          <tbody>{plan.map(slice => <tr key={slice.row.key}>
            <th scope="row">{monthLabel(slice.row.dueMonth)}</th>
            <td>{money(slice.amount)}</td><td>{money(slice.remaining)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {(error || exceedsBalance) && <p className="form-error" role="alert">{error || 'The payment exceeds the outstanding balance.'}</p>}
      <footer className="modal-actions"><div className="spacer" />
        <button type="button" className="button secondary" onClick={close} disabled={busy}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy || !amount || exceedsBalance || !dateAllowed}>
          {busy ? 'Saving…' : 'Record payment'}
        </button>
      </footer>
    </form>
  </Modal>
}
