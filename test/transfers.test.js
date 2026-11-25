import assert from 'node:assert/strict'
import test from 'node:test'
import { readBackup } from '../src/backup.js'
import { emptyBudget, installment, monthSummary, outstandingBefore, salaryChecklistMonth } from '../src/budget.js'
import { allocationRows, checklistProgress, commitmentChecklist, isOutstandingArrears, markCommitmentPaid, recordAllocatedPayment, spendingChecklist, splitPayment } from '../src/transfers.js'

const today = '2026-11-24'
const november = '2026-11'
const december = '2026-12'

test('allocates RM2300 to the carried November balance and then December, with no double count', () => {
  const budget = emptyBudget()
  const item = { id: 'akpk', name: 'AKPK', start: november, end: '', amount: 223000, category: 'Financing', day: 20 }
  budget.commitments = [item]
  budget.payments['akpk:2026-11'] = { amount: 230000, partial: { paid: 79000, month: december, settled: false } }
  const rows = allocationRows(budget, item, december, today)
  assert.deepEqual(splitPayment(rows, 230000).map(slice => [slice.row.dueMonth, slice.amount, slice.remaining]), [
    [november, 151000, 0], [december, 79000, 144000],
  ])
  assert.throws(() => recordAllocatedPayment(budget, item, december, 374001, today, today), /outstanding balance/)
  assert.throws(() => recordAllocatedPayment(budget, item, december, 230000, '2026-11-25', today), /today or earlier/)
  const updated = recordAllocatedPayment(budget, item, december, 230000, today, today)
  const summary = monthSummary(updated, december, today)
  assert.equal(summary.committed, 374000)
  assert.equal(summary.paidTotal, 230000)
  assert.equal(summary.outstanding, 144000)
  assert.equal(monthSummary(updated, november, today).paidTotal, 79000)
  const decemberChecklist = commitmentChecklist(updated, december, today)
  assert.equal(decemberChecklist.find(row => row.dueMonth === november).status, 'paid')
  assert.equal(decemberChecklist.find(row => row.dueMonth === december).remaining, 144000)
  assert.equal(outstandingBefore(updated, '2027-01', '2026-12-25'), 0)
  assert.equal(outstandingBefore(updated, '2027-02', '2026-12-25'), 144000)

  const partialAgain = recordAllocatedPayment(updated, item, december, 44000, today, today)
  const closingRow = commitmentChecklist(partialAgain, december, today).find(row => row.dueMonth === december)
  assert.equal(closingRow.remaining, 100000)
  const fullyPaid = markCommitmentPaid(partialAgain, closingRow, december, today)
  assert.equal(monthSummary(fullyPaid, december, today).paidTotal, 374000)
  assert.equal(monthSummary(fullyPaid, december, today).outstanding, 0)
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: fullyPaid })), fullyPaid)
})

test('allocates a smaller payment entirely against the oldest outstanding instalment', () => {
  const budget = budgetWithTransfers()
  const item = budget.commitments.find(item => item.id === 'partial')
  const updated = recordAllocatedPayment(budget, item, december, 15000, today, today)
  const row = commitmentChecklist(updated, december, today).find(row => row.item.id === item.id)
  assert.equal(row.remaining, 109000)
  assert.equal(row.status, 'scheduled')
  assert.equal(monthSummary(updated, december, today).paidTotal, 15000)
})

test('records a full October instalment against the December budget using the actual November payment date', () => {
  const budget = emptyBudget()
  const october = '2026-10'
  const paidDate = '2026-11-25'
  const item = { id: 'insurance', name: 'Insurance', category: 'Insurance', start: october, end: '', day: 1, amount: 15400 }
  budget.commitments = [item]
  const updated = recordAllocatedPayment(budget, item, december, 15400, paidDate, paidDate)

  assert.deepEqual(updated.payments['insurance:2026-10'].partial.allocations, [
    { amount: 15400, date: paidDate, month: december, checklistMonth: december },
  ])
  assert.deepEqual(allocationRows(updated, item, december, paidDate).map(row => row.dueMonth), [november, december])
  assert.equal(monthSummary(updated, november, paidDate).paidTotal, 0)
  assert.equal(monthSummary(updated, december, paidDate).paidTotal, 15400)
  assert.equal(monthSummary(updated, december, paidDate).outstanding, 30800)
})

test('rolls insurance arrears into the next budget and allocates oldest first across cutoffs', () => {
  const budget = emptyBudget()
  const october = '2026-10'
  const january = '2027-01'
  const item = { id: 'insurance', name: 'Takaful', category: 'Insurance', start: october, end: '', day: 1, amount: 13850 }
  budget.commitments = [item]
  const checklist = (month, date) => commitmentChecklist(budget, month, date).map(row => row.dueMonth)
  assert.deepEqual(checklist(november, '2026-11-20'), [october, november])
  assert.deepEqual(checklist(december, '2026-11-20'), [december])
  assert.deepEqual(checklist(december, '2026-11-21'), [october, november, december])
  assert.equal(monthSummary(budget, october, today).scheduledCommitment, 13850)
  assert.equal(monthSummary(budget, november, today).committed, 0)
  assert.equal(monthSummary(budget, december, today).outstanding, 41550)
  assert.equal(monthSummary(budget, january, today).outstanding, 13850)
  assert.equal(outstandingBefore(budget, december, today), 0)

  // Existing manual plans for the same month must not add a second copy of either balance.
  budget.payments['insurance:2026-10'] = { paymentMonth: december }
  budget.payments['insurance:2026-11'] = { paymentMonth: december }
  const rows = allocationRows(budget, item, december, today)
  assert.deepEqual(rows.map(row => row.dueMonth), [october, november, december])
  assert.equal(monthSummary(budget, december, today).outstanding, 41550)
  assert.throws(() => markCommitmentPaid(budget, rows[2], december, today), /oldest outstanding/)
  const updated = recordAllocatedPayment(budget, item, december, 20000, today, today)
  assert.equal(monthSummary(updated, december, today).outstanding, 21550)
  assert.equal(monthSummary(updated, december, today).paidTotal, 20000)

  const nextDate = '2026-12-21'
  assert.equal(monthSummary(updated, december, nextDate).outstanding, 0)
  assert.equal(monthSummary(updated, january, nextDate).outstanding, 35400)
  assert.deepEqual(commitmentChecklist(updated, december, nextDate).map(row => [row.dueMonth, row.amount, row.status]), [
    [october, 13850, 'paid'], [november, 6150, 'paid'],
  ])
  const again = recordAllocatedPayment(updated, item, january, 10000, nextDate, nextDate)
  assert.equal(monthSummary(again, december, nextDate).paidTotal, 20000)
  assert.equal(monthSummary(again, january, nextDate).outstanding, 25400)
  assert.deepEqual(again.payments['insurance:2026-11'].partial.allocations.map(entry => [entry.amount, entry.checklistMonth]),
    [[6150, december], [7700, january]])
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: again })), again)
})

test('waits for a late due date and honours an explicit future payment plan', () => {
  const budget = emptyBudget()
  const january = '2027-01'
  budget.commitments = [{ id: 'late', name: 'Late-month bill', category: 'Other', start: november, end: december, day: 28, amount: 20000 }]
  budget.payments['late:2026-12'] = { paymentMonth: january }
  assert.equal(commitmentChecklist(budget, december, '2026-11-28').length, 0)
  assert.deepEqual(commitmentChecklist(budget, december, '2026-11-29').map(row => row.dueMonth), [november])
  assert.deepEqual(commitmentChecklist(budget, january, '2026-11-29').map(row => row.dueMonth), [december])
  assert.equal(monthSummary(budget, december, '2026-11-29').outstanding, 20000)
  assert.equal(monthSummary(budget, january, '2026-11-29').outstanding, 20000)
})

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
  const january = '2027-01'
  const date = '2027-01-01'
  const original = commitmentChecklist(budget, december, today).find(entry => entry.item.id === 'partial')
  assert.throws(() => markCommitmentPaid(budget, original, december, date), /balance has changed/)
  const row = commitmentChecklist(budget, january, date).find(entry => entry.item.id === 'partial')
  const updated = markCommitmentPaid(budget, row, january, date)
  assert.equal(updated.payments[row.key].partial.allocations[0].date, date)
  assert.equal(monthSummary(updated, november, today).paidTotal, 143500)
  assert.equal(monthSummary(updated, january, date).paidTotal, 124000)
  assert.equal(commitmentChecklist(updated, january, date).find(entry => entry.item.id === 'partial').paidMonth, january)
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

test('shows partial payments in completed value and counts only outstanding arrears', () => {
  const budget = emptyBudget()
  const item = { id: 'insurance', name: 'Insurance', category: 'Insurance', start: '2026-10', end: '', day: 1, amount: 13850 }
  budget.commitments = [item]
  const updated = recordAllocatedPayment(budget, item, december, 20000, today, today)
  const rows = commitmentChecklist(updated, december, today)
  const isArrears = row => isOutstandingArrears(row, december, today)

  assert.deepEqual(rows.filter(isArrears).map(row => row.dueMonth), [november])
  assert.deepEqual(checklistProgress(rows, row => row.status === 'paid' ? 0 : row.remaining ?? row.amount, isArrears), {
    total: 41550, remaining: 21550, arrears: 7700, count: 3, completed: 1, completedAmount: 20000,
  })
  assert.equal(isOutstandingArrears({ due: '2026-12-01', dueMonth: december, item, status: 'scheduled' }, '2026-12', '2026-12-02'), true)
})

test('spending progress counts entered amounts and updates after undoing a transfer', () => {
  const rows = [{ amount: 150000, transferred: true }, { amount: 50000 }, { amount: null }, { amount: 0 }]
  const progress = () => checklistProgress(rows, row => row.transferred ? 0 : row.amount)
  assert.deepEqual(progress(), {
    total: 200000, remaining: 50000, arrears: 0, count: 2, completed: 1, completedAmount: 150000,
  })
  rows[0].transferred = false
  assert.equal(progress().completedAmount, 0)
  assert.equal(progress().remaining, 200000)
})
