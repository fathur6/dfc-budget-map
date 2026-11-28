import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyBudget, monthSummary } from '../src/budget.js'
import { readBackup } from '../src/backup.js'
import { projectSavingsSupport, removeSavingsEntry, saveSavingsEntry, saveSavingsJar, savingsBalance,
  savingsFlow, savingsTransferRows } from '../src/savings.js'

const today = '2026-11-28'
const jarSettings = {
  id: 'emergency', name: 'Emergency fund', bank: 'Example Bank', account: 'Shared savings', purpose: 'Urgent expenses',
  startMonth: '2026-11', goal: 150000, monthlyAmount: 20000, reserve: 20000,
  simulatorEnabled: true, archived: false, entries: [], plans: {},
}
const opening = { id: 'opening', type: 'opening', date: '2026-11-01', amount: 80000 }
const deposit = { id: 'deposit', type: 'deposit', month: '2026-12', date: '2026-11-25', amount: 12500 }
const budget = (jar = {}) => saveSavingsJar(emptyBudget(), { ...jarSettings, ...jar })
const backup = data => JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: data })

test('applies a confirmed transfer once and keeps its actual date and selected budget month', () => {
  const original = budget({ entries: [opening] })
  const before = monthSummary(original, '2026-12', today)
  const recorded = saveSavingsEntry(original, 'emergency', deposit, today)
  const retried = saveSavingsEntry(recorded, 'emergency', deposit, today)
  assert.deepEqual(retried, recorded)
  assert.equal(savingsBalance(recorded.savingsJars[0], today), 92500)
  const [row] = savingsTransferRows(recorded.savingsJars, '2026-12', today)
  assert.deepEqual([row.planned, row.deposited, row.remaining], [20000, 12500, 7500])
  assert.equal(savingsFlow(recorded.savingsJars, '2026-12', today), -12500)
  assert.equal(savingsFlow(recorded.savingsJars, '2026-11', today), 0)
  assert.deepEqual(monthSummary(recorded, '2026-12', today), before)
  assert.deepEqual(readBackup(backup(recorded)), recorded)
})

test('preserves legacy backups and validates jar IDs and nonnegative ledger history', () => {
  assert.deepEqual(readBackup(backup(emptyBudget())), emptyBudget())
  const data = budget({ entries: [opening] })
  const withdrawal = { id: 'withdrawal', date: today, type: 'withdrawal', month: '2026-11', amount: 10000 }
  const withWithdrawal = saveSavingsEntry(data, 'emergency', withdrawal, today)
  assert.throws(() => removeSavingsEntry(withWithdrawal, withWithdrawal.savingsJars[0], opening.id), /negative/)
  assert.throws(() => saveSavingsEntry(data, 'emergency', { ...withdrawal, amount: 90000 }, today), /negative/)
  assert.throws(() => saveSavingsEntry(data, 'emergency', { ...deposit, date: '2026-11-29' }, today), /today or earlier/)
  const [jar] = data.savingsJars
  assert.throws(() => readBackup(backup({ ...data, savingsJars: [jar, jar] })), /valid DFC Budget Map backup/)
  assert.throws(() => readBackup(backup({ ...data, savingsJars: [{ ...jar, entries: [withdrawal] }] })), /valid DFC Budget Map backup/)
  const corrected = removeSavingsEntry(withWithdrawal, withWithdrawal.savingsJars[0], withdrawal.id)
  assert.deepEqual(corrected, data)
})

test('supports zero monthly overrides and preserves deposits when archiving a jar', () => {
  const data = budget({ entries: [opening, deposit], plans: { '2026-12': 0 } })
  const [row] = savingsTransferRows(data.savingsJars, '2026-12', today)
  assert.deepEqual([row.planned, row.deposited, row.remaining], [0, 12500, 0])
  const archived = saveSavingsJar(data, { ...row.jar, archived: true })
  assert.equal(savingsTransferRows(archived.savingsJars, '2026-12', today)[0].deposited, 12500)
  assert.deepEqual(savingsTransferRows(archived.savingsJars, '2027-01', today), [])
  assert.equal(projectSavingsSupport(archived.savingsJars, [{ month: '2027-01', baseline: 0, balance: -2000 }], today), null)
})

test('depletes eligible savings month by month, keeps the reserve and reports incremental impact', () => {
  const data = budget({ entries: [opening] })
  const jars = [...data.savingsJars, { ...data.savingsJars[0], id: 'car', simulatorEnabled: false }]
  const months = [{ month: '2027-01', baseline: -10000, balance: -40000 },
    { month: '2027-02', baseline: 5000, balance: -25000 }]
  const result = projectSavingsSupport(jars, months, today)
  assert.equal(result.before.used, 10000)
  assert.equal(result.after.used, 60000)
  assert.equal(result.after.used - result.before.used, 50000)
  assert.deepEqual(result.after.impacts.map(month => [month.draws[0].amount, month.shortfall]), [[40000, 0], [20000, 5000]])
  assert.deepEqual(result.after.jars.map(jar => jar.balance), [20000])
  assert.equal(savingsBalance(jars[0], today), 80000)
})

test('uses confirmed withdrawals and ignores future contributions and missing income in the simulator', () => {
  const withdrawal = { id: 'withdrawal', type: 'withdrawal', amount: 10000, date: today, month: '2026-12' }
  const data = budget({ entries: [opening, withdrawal], plans: { '2026-12': 45000 } })
  const month = { month: '2026-12', baseline: -30000, balance: -40000 }
  const result = projectSavingsSupport(data.savingsJars, [month], today)
  assert.equal(result.before.used, 20000)
  assert.equal(result.after.used, 30000)
  assert.equal(result.after.jars[0].balance, 40000)
  assert.equal(projectSavingsSupport(data.savingsJars, [{ ...month, balance: null }], today), null)
})
