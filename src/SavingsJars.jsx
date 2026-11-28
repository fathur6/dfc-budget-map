import { useRef, useState } from 'react'
import { Check, Pencil, PiggyBank, Plus } from 'lucide-react'
import { dateLabel, money, monthLabel, parseMoney, validDate } from './budget.js'
import { Modal, MoneyField, MonthField } from './editors.jsx'
import { t } from './preferences.js'
import { removeSavingsEntry, saveSavingsEntry, saveSavingsJar, savingsBalance, savingsFlow, savingsTransferRows } from './savings.js'
import './savings.css'

const entryLabels = { opening: 'Opening balance', deposit: 'Deposit', withdrawal: 'Withdrawal' }
const accountLabel = jar => [jar.bank, jar.account].filter(Boolean).join(' · ')

export function SavingsJars({ data, month, today, open }) {
  const jars = data.savingsJars ?? []
  const total = jars.reduce((sum, jar) => sum + savingsBalance(jar, today), 0)
  return <section id="savings-jars" className="savings-page" aria-labelledby="savings-title">
    <header className="page-heading">
      <div><h1 id="savings-title">{t('Savings Jars')}</h1>
        <p className="page-description">{t('Set money aside for a goal and track it by bank account.')}</p></div>
      <button className="button primary" onClick={() => open({ type: 'savings-jar', month })}><Plus size={16} /> {t('Add jar')}</button>
    </header>
    {jars.length === 0 ? <div className="panel map-panel savings-empty"><PiggyBank size={24} aria-hidden="true" />
      <p>{t('Create a jar for a goal such as car insurance, school fees or an emergency fund.')}</p></div>
      : <>
        <div className="panel savings-total"><span>{t('Total saved across jars')}</span><strong>{money(total)}</strong></div>
        <div className="savings-grid">
          {jars.map(jar => {
            const balance = savingsBalance(jar, today)
            const percent = Math.min(100, balance / jar.goal * 100)
            const history = jar.entries.slice().reverse().sort((a, b) => b.date.localeCompare(a.date))
            return <article className="panel savings-card" key={jar.id}>
              <div className="savings-card-heading">
                <div className="row-icon"><PiggyBank size={17} aria-hidden="true" /></div>
                <div><h2>{jar.name}</h2><p>{accountLabel(jar)}</p></div>
                <button className="icon-button" aria-label={t('Edit jar settings') + ' · ' + jar.name}
                  onClick={() => open({ type: 'savings-jar', id: jar.id, month })}><Pencil size={16} /></button>
              </div>
              {jar.purpose && <p className="savings-purpose">{jar.purpose}</p>}
              <div className="savings-goal"><strong>{money(balance)}</strong>
                <span>{t('of {amount} goal', { amount: money(jar.goal) })}</span></div>
              <div className="savings-progress" role="progressbar" aria-label={jar.name + ' · ' + t('Savings goal')}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(percent)}
                aria-valuetext={t('{saved} of {goal} saved', { saved: money(balance), goal: money(jar.goal) })}>
                <span style={{ width: `${percent}%` }} />
              </div>
              <div className="savings-meta">
                <span>{balance >= jar.goal ? t('Goal reached') : t('{amount} to goal', { amount: money(jar.goal - balance) })}</span>
                {(jar.archived || jar.simulatorEnabled) && <span>{t(jar.archived ? 'Archived' : 'Available in Simulator')}</span>}
              </div>
              {!jar.archived && <div className="savings-actions">
                <button className="button secondary" onClick={() => open({ type: 'savings-entry', id: jar.id, kind: 'deposit', month: today.slice(0, 7) })}>{t('Record deposit')}</button>
                <button className="button secondary" disabled={balance <= 0}
                  onClick={() => open({ type: 'savings-entry', id: jar.id, kind: 'withdrawal', month: today.slice(0, 7) })}>{t('Record withdrawal')}</button>
              </div>}
              <details className="savings-history"><summary>{t('Transaction history')} <small>{history.length}</small></summary>
                {history.length === 0 ? <p>{t('No transactions yet.')}</p> : <ul>{history.map(entry => <li key={entry.id}>
                  <div><strong>{t(entryLabels[entry.type])}</strong><small>{dateLabel(entry.date)}
                    {entry.month && ` · ${t('{month} budget', { month: monthLabel(entry.month) })}`}</small></div>
                  <span className={entry.type === 'withdrawal' ? '' : 'savings-positive'}>{money(entry.type === 'withdrawal' ? -entry.amount : entry.amount)}</span>
                  <button type="button" className="icon-button" aria-label={t('Edit transaction') + ' · ' + dateLabel(entry.date)}
                    onClick={() => open({ type: 'savings-entry', id: jar.id, entryId: entry.id })}><Pencil size={14} /></button>
                </li>)}</ul>}
              </details>
            </article>
          })}
        </div>
      </>}
  </section>
}

export function SavingsTransfers({ data, month, today, summary, open, disabled }) {
  const jars = data.savingsJars ?? []
  const rows = savingsTransferRows(jars, month, today)
  const flow = savingsFlow(jars, month, today)
  if (!rows.length && !flow) return null
  const pending = rows.reduce((sum, row) => sum + row.remaining, 0)
  const available = summary.balance == null ? null : summary.balance + flow - pending
  return <section className="panel savings-transfers" aria-labelledby="savings-transfers-title">
    <div className="panel-heading"><div><div className="section-title"><PiggyBank size={19} />
      <h2 id="savings-transfers-title">{t('Savings transfers')}</h2></div>
      <p>{t('Confirm deposits after transferring the money in your banking app.')}</p></div>
      <div className="savings-transfer-total"><span>{t('Available after planned savings')}</span>
        <strong className={available < 0 ? 'cash-negative' : ''}>{money(available)}</strong></div>
    </div>
    {available < 0 && <p className="savings-transfer-note">{t('These transfers would leave this budget month short by {amount}.', { amount: money(-available) })}</p>}
    {rows.map(({ jar, planned, deposited, remaining }) => <div className="savings-transfer-row" key={jar.id}>
      <div><strong>{jar.name}</strong><small>{accountLabel(jar)}</small></div>
      <div className="savings-transfer-amount"><strong>{money(remaining || deposited)}</strong>
        {!!remaining && !!deposited && <small>{t('{amount} transferred', { amount: money(deposited) })}</small>}</div>
      <div className="savings-actions">
        {!jar.archived && <button className="button secondary" disabled={disabled}
          onClick={() => open({ type: 'savings-plan', id: jar.id, month, amount: planned })}>{t('Plan amount')}</button>}
        {deposited > 0 && !remaining ? <span className="savings-transferred"><Check size={16} /> {t('Transferred')}</span>
          : !jar.archived && <button className="button secondary" disabled={disabled}
            onClick={() => open({ type: 'savings-entry', id: jar.id, kind: 'deposit', month, amount: remaining || undefined, fromTransfer: true })}>
            {t(remaining ? 'Mark transferred' : 'Record deposit')}</button>}
      </div>
    </div>)}
  </section>
}

export function SavingsEditor({ editor, data, save, close, today, reload }) {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(false)
  const jar = data.savingsJars?.find(jar => jar.id === editor.id)
  const entry = jar?.entries.find(entry => entry.id === editor.entryId)
  const settings = editor.type === 'savings-jar'
  const plan = editor.type === 'savings-plan'
  const kind = entry?.type ?? editor.kind
  const title = settings ? (jar ? 'Edit jar settings' : 'Add jar')
    : plan ? 'Plan amount' : entry ? 'Edit transaction' : kind === 'withdrawal' ? 'Record withdrawal'
      : editor.fromTransfer && editor.amount ? 'Mark transferred' : 'Record deposit'

  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const action = event.nativeEvent.submitter?.value
    const text = name => form.get(name)?.trim() ?? ''
    const amount = (name, optional = false) => parseMoney(text(name) || (optional ? '0' : ''))
    try {
      let updated
      if (action === 'archive' && jar) {
        updated = saveSavingsJar(data, { ...jar, archived: !jar.archived })
      } else if (action === 'remove' && entry && removing) {
        updated = removeSavingsEntry(data, jar, entry.id)
      } else if (settings) {
        const opening = jar ? 0 : amount('opening', true)
        const date = text('date')
        if (opening == null || (opening > 0 && (!validDate(date) || date > today))) {
          throw new Error('Enter a valid opening balance and a date of today or earlier.')
        }
        updated = saveSavingsJar(data, {
          id: jar?.id ?? crypto.randomUUID(), startMonth: jar?.startMonth ?? editor.month,
          name: text('name'), purpose: text('purpose'), bank: text('bank'), account: text('account'),
          goal: amount('goal'), monthlyAmount: amount('monthly', true), reserve: amount('reserve', true),
          simulatorEnabled: form.has('simulator'), archived: jar?.archived ?? false, plans: jar?.plans ?? {},
          entries: jar?.entries ?? (opening > 0 ? [{ id: crypto.randomUUID(), type: 'opening', amount: opening, date }] : []),
        })
      } else if (plan) {
        if (!jar || jar.archived) throw new Error('Restore this jar to add a transaction.')
        updated = saveSavingsJar(data, { ...jar, plans: { ...jar.plans, [editor.month]: amount('amount') } })
      } else {
        updated = saveSavingsEntry(data, editor.id, {
          id: entry?.id ?? crypto.randomUUID(), type: kind, amount: amount('amount'), date: text('date'),
          ...(kind !== 'opening' && { month: text('month') }),
        }, today)
      }
      await save(updated)
    } catch (failure) {
      setError(failure.message || 'Could not save the budget.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const dateField = (label, value, required = true) => <label className="field"><span>{t(label)}</span>
    <input type="date" name="date" min="2000-01-01" max={today} defaultValue={value ?? today} required={required} /></label>
  return <Modal title={t(title)} close={close} busy={busy}>
    <form className="editor" onSubmit={submit} aria-busy={busy}>
      {settings ? <>
        <div className="form-grid">
          <label className="field"><span>{t('Jar name')}</span><input name="name" maxLength={65} defaultValue={jar?.name} required data-initial-focus /></label>
          <MoneyField name="goal" label={t('Savings goal')} value={jar?.goal} />
        </div>
        <label className="field"><span>{t('Purpose (optional)')}</span><input name="purpose" maxLength={180} defaultValue={jar?.purpose} /></label>
        <div className="form-grid">
          <label className="field"><span>{t('Bank name')}</span><input name="bank" maxLength={65} defaultValue={jar?.bank} required /></label>
          <label className="field"><span>{t('Account label (optional)')}</span><input name="account" maxLength={65} defaultValue={jar?.account} /></label>
          <MoneyField name="monthly" label={t('Monthly savings target (optional)')} value={jar?.monthlyAmount} required={false} />
          <MoneyField name="reserve" label={t('Minimum balance to keep (optional)')} value={jar?.reserve} required={false} />
        </div>
        <label className="savings-checkbox"><input type="checkbox" name="simulator" defaultChecked={jar?.simulatorEnabled} />{t('Allow Simulator to use this jar')}</label>
        {!jar && <div className="form-grid">
          <MoneyField name="opening" label={t('Opening balance (optional)')} required={false} />
          {dateField('Opening balance date', today, false)}
        </div>}
      </> : <>
        <p className="editor-note">{jar?.name} · {jar && accountLabel(jar)}{plan && ` · ${monthLabel(editor.month, 'long')}`}</p>
        <MoneyField name="amount" label={t(plan ? 'Planned savings' : 'Amount')} value={entry?.amount ?? editor.amount} />
        {plan ? <p className="editor-note">{t('Enter RM 0 to skip a planned deposit for this month.')}</p> : <div className="form-grid">
          {dateField('Transaction date', entry?.date)}
          {kind !== 'opening' && <MonthField name="month" label={t('Budget month')} value={entry?.month ?? editor.month} />}
        </div>}
      </>}
      {error && <div className="form-error" role="alert">{t(error)} <button type="button" className="text-button" onClick={reload}>{t('Reload saved budget')}</button></div>}
      {removing && <p className="editor-note" role="status">{t('Remove this transaction from the jar history?')}</p>}
      <div className="modal-actions">
        {settings && jar && <button type="submit" className="button secondary" value="archive" formNoValidate disabled={busy}>{t(jar.archived ? 'Restore jar' : 'Archive jar')}</button>}
        {entry && !removing && <button type="button" className="button secondary" disabled={busy} onClick={() => setRemoving(true)}>{t('Remove transaction')}</button>}
        <button type="button" className="button secondary" disabled={busy} onClick={close}>{t('Cancel')}</button>
        {removing ? <button className="button danger" type="submit" value="remove" formNoValidate disabled={busy}>{t('Remove transaction')}</button>
          : <button className="button primary" type="submit" disabled={busy}>{t(title === 'Mark transferred' ? title : 'Save changes')}</button>}
      </div>
    </form>
  </Modal>
}
