import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Clock3, Plus, X } from 'lucide-react'
import { active, addMonths, categoryMonth, dueDate, incomeSourceTypes, inputMoney, installment, money, monthLabel, parseMoney, paymentKey } from './budget.js'
import { readBackup } from './backup.js'

export const statuses = {
  paid: { label: 'Paid', icon: Check },
  scheduled: { label: 'Scheduled', icon: Clock3 },
  missed: { label: 'Missed', icon: AlertTriangle },
}

export function Modal({ title, children, close, busy = false }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current.showModal()
  }, [])
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title"
    onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <header className="modal-head">
      <h2 id="modal-title">{title}</h2>
      <button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={close}><X size={19} /></button>
    </header>
    {children}
  </dialog>
}

export function MoneyField({ label, name, value, required = true, placeholder = '0.00' }) {
  return <label className="field"><span>{label}</span><div className="money-input"><span>RM</span>
    <input name={name} inputMode="decimal" pattern="[0-9]{1,7}(\.[0-9]{1,2})?" placeholder={placeholder}
      defaultValue={inputMoney(value)} required={required} />
  </div></label>
}

export const categories = ['Housing', 'Transport', 'Utilities', 'Financing', 'Insurance', 'Subscriptions', 'Other']
const monthPattern = '(20[0-9]{2}|2100)-(0[1-9]|1[0-2])'
export function MonthField({ label, name, value, required = true, min = '2000-01', max = '2100-12' }) {
  return <label className="field"><span>{label}</span>
    <input type="month" name={name} defaultValue={value} min={min} max={max} pattern={monthPattern}
      placeholder="YYYY-MM" required={required} />
  </label>
}

function readMonth(value, optional = false) {
  if (optional && !value) return ''
  if (!new RegExp('^' + monthPattern + '$').test(value)) throw new Error('Enter a valid month from 2000 to 2100.')
  return value
}

function readAmount(value, { optional = false, positive = false } = {}) {
  if (optional && !value) return null
  const amount = parseMoney(value)
  if (amount == null || (positive && amount === 0)) throw new Error('Enter a valid ringgit amount with up to two decimal places.')
  return amount
}

function readName(value) {
  const name = value.trim()
  if (!name) throw new Error('Enter a name.')
  return name
}

function removeEntries(map, id) {
  return Object.fromEntries(Object.entries(map).filter(([key]) => !key.startsWith(id + ':')))
}

export function Editor({ editor, close, snapshot, month, today, save, reload, open }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const { type, item } = editor
  const data = snapshot.budget
  const [incomeRows, setIncomeRows] = useState(() => (type === 'income' ? data.incomeSourcesByMonth?.[month] ?? [] : [])
    .map((source, index) => ({ ...source, key: String(index) })))
  const newIncomeRow = useRef(null)
  const key = item && paymentKey(item.id, month)
  const copying = type === 'copy-spending'
  const [targetMonth, setTargetMonth] = useState(editor.month ?? '')
  const sourceAmount = copying ? categoryMonth(data, item, editor.sourceMonth)?.spent : null
  const targetAmount = copying && targetMonth && targetMonth !== editor.sourceMonth
    ? categoryMonth(data, item, targetMonth)?.spent : null
  const payment = data.payments[key]
  const entry = type === 'payment' ? installment(data, item, month, today) : null
  const oneOff = type === 'payment' && (!active(item, month) || payment?.oneOff === true)
  const [paymentDay, setPaymentDay] = useState(payment?.day ?? item?.day ?? 1)
  const [paymentStatus, setPaymentStatus] = useState(payment?.partial ? 'partial' : payment?.status ?? 'auto')
  const day = Number(paymentDay)
  const validDay = Number.isInteger(day) && day >= 1 && day <= 31
  const due = type === 'payment' ? dueDate(month, validDay ? day : item.day) : null
  const expired = due && due < today && !item?.provisional
  const titles = {
    income: 'Income for ' + monthLabel(month, 'long'), commitment: item ? 'Edit commitment' : 'Add commitment',
    payment: entry ? item?.name : 'Add payment for ' + item?.name,
    category: item ? 'Edit spending category' : 'Add spending category',
    spending: item?.name, 'copy-spending': 'Copy spending value?', import: 'Import a budget', reset: 'Start a fresh budget',
  }
  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const get = name => String(form.get(name) ?? '')
    const next = structuredClone(data)
    setError('')
    setBusy(true)
    try {
      if (type === 'import') {
        const file = form.get('backup')
        if (!file?.size || file.size > 1048576) throw new Error('Choose a budget backup under 1 MB.')
        await save(readBackup(await file.text()), false)
        return
      }
      if (type === 'reset') {
        await save(null, false)
        return
      }
      if (type === 'income') {
        next.income = readAmount(get('income'), { optional: true })
        const income = readAmount(get('override'), { optional: true })
        if (form.has('unknown')) next.incomeByMonth[month] = null
        else if (income == null) delete next.incomeByMonth[month]
        else next.incomeByMonth[month] = income
        const sources = incomeRows.map(({ key }) => ({
          type: get('source-type-' + key),
          name: get('source-name-' + key).trim(),
          amount: readAmount(get('source-amount-' + key), { positive: true }),
        }))
        if (sources.length) (next.incomeSourcesByMonth ??= {})[month] = sources
        else if (next.incomeSourcesByMonth) delete next.incomeSourcesByMonth[month]
      }
      if (type === 'commitment' || type === 'category') {
        const collection = type === 'commitment' ? 'commitments' : 'categories'
        const isDelete = event.nativeEvent.submitter?.value === 'delete'
        if (isDelete) {
          next[collection] = next[collection].filter(record => record.id !== item.id)
          if (type === 'commitment') next.payments = removeEntries(next.payments, item.id)
          else next.spending = removeEntries(next.spending, item.id)
        } else {
          const start = readMonth(get('start'))
          const end = readMonth(get('end'), true)
          if (end && end < start) throw new Error('The end month must be on or after the start month.')
          const overrides = type === 'commitment' ? data.payments : data.spending
          if (item && Object.entries(overrides).some(([key, entry]) => {
            const [id, month] = key.split(':')
            if (type === 'category' && entry.spent == null) return false
            return id === item.id && !(type === 'commitment' && entry.oneOff) && !active({ start, end }, month)
          })) throw new Error('The schedule must include all months with recorded entries.')
          const common = { id: item?.id ?? crypto.randomUUID(), name: readName(get('name')), start, end }
          const record = type === 'commitment'
            ? { ...common, category: get('category'), provisional: form.has('provisional'), amount: readAmount(get('amount'), { positive: true }), day: Number(get('day')) }
            : common
          if (type === 'category' && item) {
            for (const [key, entry] of Object.entries(next.spending)) {
              if (key.startsWith(item.id + ':') && entry.spent == null) delete next.spending[key]
            }
          }
          next[collection] = item ? next[collection].map(old => old.id === item.id ? record : old) : [...next[collection], record]
        }
      }
      if (type === 'payment') {
        const status = get('status')
        const remove = event.nativeEvent.submitter?.value === 'remove-payment'
        if (remove) {
          delete next.payments[key]
        } else {
          const amount = readAmount(get('amount'), { optional: !oneOff })
          const paymentMonth = ['missed', 'partial'].includes(status) ? '' : readMonth(get('paymentMonth'), true)
          if (status === 'paid' && (paymentMonth || month) > today.slice(0, 7)
            && !(payment?.status === 'paid' && !payment?.paymentMonth && !paymentMonth)) {
            throw new Error('Choose the month the payment was made, or select Planned for a future payment.')
          }
          let partial
          if (status === 'partial') {
            const paid = readAmount(get('partialPaid'), { positive: true })
            const carryMonth = readMonth(get('carryMonth'))
            const settled = form.has('carrySettled')
            const current = today.slice(0, 7)
            if (month > current || (settled && carryMonth > current)) throw new Error('Paid amounts must be recorded in the current month or earlier.')
            if (paid >= (amount ?? item.amount)) throw new Error('Partial payment must be less than the total amount due.')
            if (carryMonth <= month) throw new Error('Choose a later month for the remaining balance.')
            partial = { paid, month: carryMonth, settled }
          }
          const day = get('day') && validDay ? Number(get('day')) : null
          const keepAmount = oneOff || status === 'paid' || partial || (amount != null && amount !== item.amount)
          if (!keepAmount && day == null && status === 'auto' && !paymentMonth) delete next.payments[key]
          else next.payments[key] = {
            ...(oneOff && { oneOff: true }),
            ...(!partial && status !== 'auto' && { status }),
            ...(partial && { partial }),
            ...(keepAmount && { amount: amount ?? item.amount }),
            ...(day != null && { day }),
            ...(paymentMonth && { paymentMonth }),
          }
        }
      }
      if (type === 'spending' || copying) {
        const destination = copying ? readMonth(editor.month || get('targetMonth')) : month
        if (copying && (sourceAmount == null || destination === editor.sourceMonth || !active(item, destination))) {
          throw new Error('Choose another active month for this category.')
        }
        const destinationKey = paymentKey(item.id, destination)
        const spent = copying ? sourceAmount : readAmount(get('spent'), { optional: true })
        if (spent == null) delete next.spending[destinationKey]
        else next.spending[destinationKey] = { spent }
      }
      await save(next)
    } catch (failure) {
      setError(failure.message || 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  return <Modal title={titles[type]} close={close} busy={busy}>
    <form className="editor" onSubmit={submit}>
      {type === 'income' && <>
        <MoneyField label="Default monthly take-home income" name="income" value={data.income} required={false} placeholder="Enter income" />
        <MoneyField label="Base income override (optional)" name="override" value={data.incomeByMonth[month]} required={false} placeholder="Use default" />
        <label className="check-field"><input type="checkbox" name="unknown" defaultChecked={data.incomeByMonth[month] === null} /> Base income is unknown this month</label>
        <p className="muted form-note">Enter RM 0 as the override if this month has only additional sources.</p>
        <fieldset className="income-sources">
          <legend>Additional sources</legend>
          {incomeRows.map((source, index) => <fieldset className="income-source" key={source.key}>
            <legend>Source {index + 1}</legend>
            <label className="field"><span>Type</span>
              <select name={'source-type-' + source.key} defaultValue={source.type} ref={element => {
                if (element && newIncomeRow.current === source.key) {
                  newIncomeRow.current = null
                  element.focus()
                }
              }}>
                {incomeSourceTypes.map(type => <option key={type}>{type}</option>)}
              </select>
            </label>
            <MoneyField label="Amount" name={'source-amount-' + source.key} value={source.amount} />
            <label className="field income-source-name"><span>Description (optional)</span>
              <input name={'source-name-' + source.key} defaultValue={source.name} maxLength={65} />
            </label>
            <button type="button" className="icon-button" aria-label={'Remove source ' + (index + 1)} disabled={busy}
              onClick={() => setIncomeRows(rows => rows.filter(row => row.key !== source.key))}><X size={17} /></button>
          </fieldset>)}
          <button type="button" className="button secondary" disabled={busy} onClick={() => {
            const key = crypto.randomUUID()
            newIncomeRow.current = key
            setIncomeRows(rows => [...rows, { key, type: 'Gift' }])
          }}><Plus size={16} /> Add source</button>
          <p className="muted form-note">Loan proceeds increase this month’s cash balance. Record repayments in the Commitment Map. The simulator excludes loan proceeds.</p>
        </fieldset>
      </>}
      {(type === 'commitment' || type === 'category') && <>
        <label className="field"><span>Name</span><input name="name" defaultValue={item?.name} maxLength={65} required /></label>
        {type === 'commitment' ? <div className="form-grid">
          <MoneyField label="Monthly amount" name="amount" value={item?.amount} />
          <label className="field"><span>Category</span><select name="category" defaultValue={item?.category ?? 'Other'}>
            {categories.map(category => <option key={category}>{category}</option>)}
          </select></label>
          <label className="field"><span>Due day each month</span>
            <input type="number" name="day" min="1" max="31" step="1" defaultValue={item?.day ?? 1} required />
          </label>
          <label className="check-field"><input type="checkbox" name="provisional" defaultChecked={item?.provisional} /> Schedule needs verification</label>
        </div> : null}
        <div className="form-grid">
          <MonthField label="First month" name="start" value={item?.start ?? month} />
          <MonthField label="Last month (optional)" name="end" value={item?.end} required={false} />
        </div>
        {item && <p className="muted form-note">Changes to defaults apply to all months that use them. To record a monthly amount, open its cell.</p>}
      </>}
      {type === 'payment' && <>
        <p className="muted form-note">{monthLabel(month, 'long')} · due {new Intl.DateTimeFormat('en-MY', {
          day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
        }).format(new Date(due + 'T00:00:00Z'))}</p>
        {oneOff && <p className="muted form-note">One-off instalment originally due in {monthLabel(month, 'long')}.</p>}
        <fieldset className="status-picker"><legend>Payment status</legend>
          {[['paid', 'Paid', Check], ['partial', 'Partially paid', Clock3], ['auto', 'Planned', Clock3], ['missed', 'Missed', AlertTriangle]]
            .map(([value, label, Icon]) => <label className={['auto', 'partial'].includes(value) ? 'scheduled' : value} key={value}>
              <input type="radio" name="status" value={value} checked={paymentStatus === value} onChange={() => setPaymentStatus(value)} />
              <span><Icon size={16} />{label}</span>
            </label>)}
        </fieldset>
        {!['missed', 'partial'].includes(paymentStatus) && <>
          <MonthField label={paymentStatus === 'paid' ? 'Month paid (optional)' : 'Planned payment month (optional)'}
            name="paymentMonth" value={payment?.paymentMonth} required={false}
            max={paymentStatus === 'paid' ? today.slice(0, 7) : undefined} />
          <p className="muted form-note">Leave blank to use the original month. Choose a different month to charge its budget.</p>
        </>}
        {paymentStatus === 'partial' && <>
          <MoneyField label="Amount paid in original month" name="partialPaid" value={payment?.partial?.paid} />
          <MonthField label="Carry balance to" name="carryMonth" min={addMonths(month, 1)}
            value={payment?.partial?.month ?? addMonths(month, 1)} />
          <label className="check-field"><input type="checkbox" name="carrySettled" defaultChecked={payment?.partial?.settled} /> Remaining balance paid in selected month</label>
        </>}
        <div className="form-grid">
          <MoneyField label={paymentStatus === 'partial' ? 'Total amount due' : oneOff ? 'Amount for this month' : 'Amount for this month (optional)'} name="amount" value={payment?.amount}
            required={oneOff} placeholder={oneOff ? '0.00' : inputMoney(item.amount)} />
          <label className="field"><span>Due day (optional)</span>
            <input type="number" name="day" min="1" max="31" step="1" defaultValue={payment?.day}
              placeholder={String(item.day)} onChange={event => setPaymentDay(event.target.value)} />
          </label>
        </div>
        <p className="muted form-note">{item.provisional ? 'This schedule is provisional. Confirm its dates in the commitment editor to enable automatic overdue status.' : expired ? 'The original due date has passed.' : 'Unpaid instalments turn red after their due date in Malaysia time.'} Mark an instalment paid once it is fully settled.</p>
      </>}
      {type === 'spending' && <>
        <p className="muted form-note">{monthLabel(month, 'long')}</p>
        <MoneyField label="Total spent this month" name="spent" value={data.spending[key]?.spent} required={false} placeholder="Enter monthly total" />
        {data.spending[key]?.spent != null && <p className="muted form-note">Clear the amount and save to remove this month’s total.</p>}
      </>}
      {copying && <>
        <p className="form-note">Copy <strong>{money(sourceAmount)}</strong> for <strong>{item.name}</strong> from {monthLabel(editor.sourceMonth, 'long')}?</p>
        {editor.month ? <p className="form-note">Destination <strong>{monthLabel(editor.month, 'long')}</strong></p>
          : <label className="field"><span>Copy to month</span>
            <input type="month" name="targetMonth" min={item.start} max={item.end || '2100-12'}
              pattern={monthPattern} placeholder="YYYY-MM" required onInput={event => setTargetMonth(event.currentTarget.value)} />
          </label>}
        {targetAmount != null && <p className="form-note">This will replace the destination amount of <strong>{money(targetAmount)}</strong>.</p>}
      </>}
      {type === 'import' && <>
        <p className="muted form-note">Import replaces the budget in this workspace. Export the existing budget first if you want to keep a copy.</p>
        <label className="field"><span>Budget backup file</span><input name="backup" type="file" accept="application/json,.json" required /></label>
      </>}
      {type === 'reset' && <p className="muted form-note">This replaces the demo and any changes made to it in this browser with an empty budget.</p>}
      {error && <div className="form-error" role="alert">{error} <button type="button" className="link-button" onClick={reload}>Reload saved budget</button></div>}
      {confirm && <p className="form-error" role="status">Delete this {type} and all its monthly entries?</p>}
      <footer className="modal-actions">
        {type === 'spending' && data.spending[key]?.spent != null &&
          <button type="button" className="button secondary" disabled={busy}
            onClick={() => open({ type: 'copy-spending', item, sourceMonth: month })}>Copy to month</button>}
        {type === 'payment' && payment?.oneOff && <button type="submit" value="remove-payment" formNoValidate disabled={busy} className="button danger">Remove monthly entry</button>}
        {item && ['commitment', 'category'].includes(type) && (confirm
          ? <button type="submit" value="delete" formNoValidate disabled={busy} className="button danger">Confirm delete</button>
          : <button type="button" onClick={() => setConfirm(true)} disabled={busy} className="button danger">Delete</button>)}
        <div className="spacer" />
        <button type="button" className="button secondary" disabled={busy} onClick={close}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy} autoFocus={copying && Boolean(editor.month)}>{busy ? 'Saving…' : copying ? 'Copy value' : type === 'reset' ? 'Start fresh' : type === 'import' ? 'Import and replace' : 'Save changes'}</button>
      </footer>
    </form>
  </Modal>
}

export function SignIn({ supabase, close }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [usePassword, setUsePassword] = useState(() =>
    matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  )
  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const email = String(form.get('email')).trim()
      const { error: failure } = usePassword
        ? await supabase.auth.signInWithPassword({ email, password: String(form.get('password')) })
        : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
      if (failure) throw failure
      if (usePassword) close()
      else setSent(true)
    } catch (failure) {
      setError(failure.message || 'Sign-in could not be completed.')
    } finally {
      setBusy(false)
    }
  }
  return <Modal title="Sign in to your budget" close={close} busy={busy}>
    {sent ? <div className="editor">
      <p className="form-note" role="status">Check your inbox for the sign-in link. Open it on the device where you want to use the budget.</p>
      <footer className="modal-actions"><div className="spacer" /><button className="button secondary" onClick={close}>Done</button></footer>
    </div> : <form className="editor" onSubmit={submit}>
      <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
      {usePassword && <label className="field"><span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>}
      {usePassword && <p className="muted form-note">Set a password from the Data menu in a browser where you’re already signed in.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-actions">
        <button type="button" className="button secondary" disabled={busy}
          onClick={() => { setUsePassword(value => !value); setError('') }}>{usePassword ? 'Use email link' : 'Use password'}</button>
        <div className="spacer" />
        <button className="button primary" disabled={busy}>{usePassword ? (busy ? 'Signing in…' : 'Sign in') : (busy ? 'Sending…' : 'Email sign-in link')}</button>
      </footer>
    </form>}
  </Modal>
}

export function SetPassword({ supabase, close, saved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    if (password !== form.get('confirm')) {
      setError('The passwords don’t match.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { error: failure } = await supabase.auth.updateUser({ password })
      if (failure) throw failure
      saved()
    } catch (failure) {
      setError(failure.message || 'The password could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  return <Modal title="Set sign-in password" close={close} busy={busy}>
    <form className="editor" onSubmit={submit}>
      <p className="muted form-note">Use this password with your existing email to sign in from the iPhone Home Screen app.</p>
      <label className="field"><span>New password (12 characters or more)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      <label className="field"><span>Confirm password</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-actions">
        <div className="spacer" /><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </footer>
    </form>
  </Modal>
}
