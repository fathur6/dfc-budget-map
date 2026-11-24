import assert from 'node:assert/strict'
import test from 'node:test'
import { readBackup } from '../src/backup.js'
import { emptyBudget, installment, monthSummary, salaryChecklistMonth } from '../src/budget.js'
import { commitmentChecklist, markCommitmentPaid, spendingChecklist } from '../src/transfers.js'

const today = '2026-11-24'
const november = '2026-11'
const december = '2026-12'

function budgetWithTransfers() {
  const budget = emptyBudget()
  budget.commitments = [
    { id: 'bill', name: 'December bill', start: december, amount: 10000 },
    { id: 'planned', name: 'Planned for December', start: november, amount: 45000 },
    { id: 'partial', name: 'Partial payment', start: november, amount: 223000 },
    { id: 'early', name: 'Already paid early', start: december, amount: 44500 },
    { id: 'deferred', name: 'Moved out', start: december, amount: 20500 },
  ].map(item => ({ ...item, category: 'Financing', day: 20, end: item.start }))
  budget.payments = {
    'planned:2026-11': { paymentMonth: december },
    'partial:2026-11': { amount: 223000, partial: { paid: 99000, month: december, settled: false } },
    'early:2026-12': { status: 'paid', paymentMonth: november },
    'deferred:2026-12': { paymentMonth: '2027-01' },
  }
  return budget
}

test('retains early payments and planned carry-ins on the selected checklist', () => {
  const budget = budgetWithTransfers()
  const checklist = commitmentChecklist(budget, december, today)
  assert.deepEqual(checklist.map(row => [row.item.id, row.amount, row.paidMonth]), [
    ['bill', 10000, null], ['planned', 45000, null], ['partial', 124000, null], ['early', 44500, november],
  ])
  const updated = checklist.filter(row => !row.paidMonth)
    .reduce((data, row) => markCommitmentPaid(data, row, december, today), budget)

  assert.ok(commitmentChecklist(updated, december, today).every(row => row.status === 'paid' && row.paidMonth === november))
  assert.equal(commitmentChecklist(updated, november, today).length, 1)
  assert.equal(monthSummary(updated, november, today).paidTotal, 143500)
  assert.equal(monthSummary(updated, december, today).paidTotal, 179000)
  assert.equal(monthSummary(updated, december, today).committed, 179000)
  assert.equal(updated.payments['bill:2026-12'].paidDate, today)
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: updated })), updated)
})

test('applies the salary cutoff precisely and keeps earlier explicitly received salary with the next budget', () => {
  const budget = budgetWithTransfers()
  const bill = budget.commitments[0]
  const paymentKey = 'bill:2026-12'
  budget.payments[paymentKey] = { status: 'paid', paymentMonth: november, paidDate: '2026-11-20' }
  assert.equal(installment(budget, bill, december, today).budgetMonth, undefined)
  assert.equal(salaryChecklistMonth(budget, november, '2026-11-20'), november)
  assert.equal(salaryChecklistMonth(budget, november, '2026-11-21'), december)
  for (const day of [21, 22, 25]) {
    budget.payments[paymentKey].paidDate = '2026-11-' + day
    assert.equal(installment(budget, bill, december, today).budgetMonth, december)
  }
  budget.salaryReceipts = { [december]: '2026-11-19' }
  assert.equal(salaryChecklistMonth(budget, november, '2026-11-19'), december)
  assert.equal(salaryChecklistMonth(budget, '2027-01', today), '2027-01')
  budget.payments[paymentKey].paidDate = '2026-11-18'
  assert.equal(installment(budget, bill, december, today).budgetMonth, undefined)
  budget.payments[paymentKey].paidDate = '2026-11-19'
  assert.equal(installment(budget, bill, december, today).budgetMonth, december)
  assert.equal(monthSummary(budget, december, today).paidTotal, 10000)
  assert.equal(monthSummary(budget, november, today).paidTotal, 143500)
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget })), budget)
})

test('retains explicit legacy checklist intent without guessing a date for other older payments', () => {
  const budget = budgetWithTransfers()
  const original = budget.payments['early:2026-12']
  assert.equal(monthSummary(budget, december, today).paidTotal, 0)
  original.checklistMonth = december
  assert.equal(monthSummary(budget, december, today).paidTotal, 44500)
  assert.equal(original.paidDate, undefined)

  const partial = budget.payments['partial:2026-11'].partial
  Object.assign(partial, { settled: true, paidMonth: november })
  assert.equal(monthSummary(budget, december, today).paidTotal, 168500)
  partial.paidDate = '2026-11-20'
  assert.equal(monthSummary(budget, december, today).paidTotal, 44500)
})

test('keeps the outstanding amount separate when a carried balance lands in a different month', () => {
  const budget = budgetWithTransfers()
  const row = commitmentChecklist(budget, december, today).find(entry => entry.portion === 'remainder')
  const updated = markCommitmentPaid(budget, row, december, '2027-01-01')
  assert.equal(updated.payments[row.key].partial.paidMonth, '2027-01')
  assert.equal(monthSummary(updated, november, today).paidTotal, 143500)
  assert.equal(monthSummary(updated, '2027-01', '2027-01-01').paidTotal, 124000)
  assert.equal(commitmentChecklist(updated, december, today).find(entry => entry.portion === 'remainder').paidMonth, '2027-01')
})

test('keeps spending transfer status scoped to the selected month without changing the amount', () => {
  const budget = emptyBudget()
  budget.categories = [
    { id: 'food', name: 'Food', start: november, end: '' },
    { id: 'fuel', name: 'Fuel', start: november, end: '' },
    { id: 'zero', name: 'Zero', start: december, end: '' },
  ]
  budget.spending = {
    'food:2026-11': { spent: 150000 },
    'food:2026-12': { spent: 150000, transferred: true },
    'zero:2026-12': { spent: 0 },
  }
  assert.deepEqual(spendingChecklist(budget, december).map(row => [row.item.id, row.amount, row.transferred]), [
    ['food', 150000, true], ['fuel', null, false],
  ])
  assert.equal(spendingChecklist(budget, november)[0].transferred, false)
  assert.equal(monthSummary(budget, december, today).spent, 150000)
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget })), budget)
})
