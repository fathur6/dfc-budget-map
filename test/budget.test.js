import test from 'node:test'
import assert from 'node:assert/strict'
import { addMonths, demoBudget, dueDate, emptyBudget, installment, monthSummary, outstandingBefore, parseMoney, simulate, todayMYT } from '../src/budget.js'
import { readBackup } from '../src/backup.js'

const today = '2026-11-13'
const data = demoBudget(today)

test('uses MYT midnight and handles short months and year boundaries', () => {
  assert.equal(todayMYT(new Date('2026-11-12T16:00:00Z')), today)
  assert.equal(addMonths('2026-12', 1), '2027-01')
  assert.equal(dueDate('2028-02', 31), '2028-02-29')
  assert.equal(dueDate('2027-02', 31), '2027-02-28')
  assert.equal(parseMoney('231.32'), 23132)
  assert.equal(parseMoney('231.321'), null)
})

test('counts all commitments in the forecast and isolates unpaid balances', () => {
  const now = monthSummary(data, '2026-11', today)
  assert.equal(now.committed, 313000)
  assert.equal(now.paidTotal, 243000)
  assert.equal(now.outstanding, 70000)
  assert.equal(now.balance, 232000)
  assert.equal(monthSummary(data, '2027-01', today).committed, 281500)
})

test('supports payment overrides, due-day grace, one-off bills and provisional schedules', () => {
  const electric = data.commitments[2]
  assert.equal(installment(data, electric, '2026-11', '2026-11-20').status, 'scheduled')
  assert.equal(installment(data, electric, '2026-11', '2026-11-21').status, 'missed')
  assert.equal(installment(data, { ...electric, provisional: true }, '2026-11', '2026-11-21').status, 'scheduled')
  const oneOff = { ...electric, start: '2026-12', end: '2026-12' }
  assert.equal(installment(data, oneOff, '2027-01', today), null)
  const changed = { ...data, payments: { 'electric:2026-11': { amount: 40545, status: 'paid' } } }
  assert.equal(installment(changed, electric, '2026-11', '2026-11-21').amount, 40545)
  assert.equal(installment(changed, electric, '2026-11', '2026-11-21').status, 'paid')
})

test('uses higher of spending or budget for each category and allows zero income', () => {
  const changed = structuredClone(data)
  changed.spending['food:2026-11'] = { spent: 200000 }
  changed.incomeByMonth['2026-11'] = 0
  const result = monthSummary(changed, '2026-11', today)
  assert.equal(result.spendingForecast, 345000)
  assert.equal(result.income, 0)
  assert.equal(result.balance, -658000)
  assert.equal(monthSummary(emptyBudget(), '2026-11', today).balance, null)
})

test('tests the whole term, the user buffer and earlier missed payments once', () => {
  const changed = structuredClone(data)
  changed.incomeByMonth['2027-01'] = 640000
  assert.equal(outstandingBefore(changed, '2026-11', today), 22000)
  const run = options => simulate(changed, { start: '2026-11', duration: 3, amount: 40000, buffer: 20000, ...options }, today)
  assert.deepEqual(run(), { month: '2027-01', remaining: 13500, arrears: 22000, status: 'tight', headroom: -6500 })
  assert.equal(run({ amount: 20000 }).status, 'fits')
  assert.equal(run({ amount: 60000 }).status, 'deficit')
  assert.equal(run({ duration: 1, amount: 200000 }).remaining, 10000)
  assert.equal(simulate(emptyBudget(), { start: '2026-11', duration: 1, amount: 40000, buffer: 0 }, today).missing, '2026-11')
})

test('backups round-trip and reject invalid money and orphan monthly records', () => {
  const serialize = budget => JSON.stringify({ format: 'dfc-budget-map', version: 1, budget })
  assert.deepEqual(readBackup(serialize(data)), data)
  assert.throws(() => readBackup(serialize({ ...data, income: 1.23 })), /valid DFC/)
  assert.throws(() => readBackup(serialize({ ...data, payments: { 'unknown:2026-11': { status: 'paid' } } })), /valid DFC/)
})
