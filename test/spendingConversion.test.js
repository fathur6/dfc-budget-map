import assert from 'node:assert/strict'
import test from 'node:test'
import { readBackup } from '../src/backup.js'
import { emptyBudget, installment, monthSummary, outstandingBefore, paymentKey, spendingReviewKey } from '../src/budget.js'
import { convertSpendingToCommitment, spendingConversionPlan } from '../src/spendingConversion.js'
import { commitmentChecklist, spendingChecklist } from '../src/transfers.js'

const today = '2026-11-25'
const september = '2026-09'
const october = '2026-10'
const november = '2026-11'
const december = '2026-12'
const january = '2027-01'
const february = '2027-02'
const march = '2027-03'
const april = '2027-04'

test('moves future amounts exactly once and preserves transferred and confirmed spending', () => {
  const budget = emptyBudget()
  budget.income = 100000
  const item = { id: 'drive', name: 'Cloud storage', start: november, end: april, category: 'Subscriptions' }
  budget.categories = [item]
  budget.spending = {
    [paymentKey(item.id, november)]: { spent: 4300 },
    [paymentKey(item.id, december)]: { spent: 4300, transferred: true },
    [paymentKey(item.id, january)]: { spent: 4300 },
    [paymentKey(item.id, february)]: { spent: 4700 },
    [paymentKey(item.id, march)]: { spent: 0 },
  }
  budget.spendingConfirmations = { [january]: spendingReviewKey(budget, january) }
  const fields = { itemId: item.id, start: february, amount: 4300, day: 15, category: 'Subscriptions' }
  assert.equal(spendingConversionPlan(budget, item, today).current, november)
  assert.throws(() => convertSpendingToCommitment(budget, { ...fields, start: october }, today), /eligible start month/)
  assert.throws(() => convertSpendingToCommitment(budget, { ...fields, day: 0 }, today), /due day/)

  const updated = convertSpendingToCommitment(budget, fields, today)
  const [commitment] = updated.commitments
  assert.equal(commitment.spendingSourceId, item.id)
  assert.equal(commitment.end, april)
  assert.equal(updated.categories[0].end, january)
  assert.deepEqual(updated.spending[paymentKey(item.id, december)], { spent: 4300, transferred: true })
  assert.equal(monthSummary(updated, january, today).spendingConfirmed, true)
  for (const month of [november, december, january, february, march]) {
    assert.equal(monthSummary(updated, month, today).balance, monthSummary(budget, month, today).balance)
  }
  assert.equal(monthSummary(updated, april, today).committed, 4300)
  assert.equal(spendingChecklist(updated, february).length, 0)
  assert.equal(commitmentChecklist(updated, february, today)[0].amount, 4700)
  assert.equal(commitmentChecklist(updated, february, today)[0].status, 'scheduled')
  assert.equal(commitmentChecklist(updated, march, today).length, 0)
  assert.throws(() => convertSpendingToCommitment(updated, fields, today), /eligible start month/)
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: updated })), updated)
})

test('handles a spending item that starts in the future and has no history to retain', () => {
  const budget = emptyBudget()
  const item = { id: 'future', name: 'Future subscription', start: december, end: '' }
  budget.categories = [item]
  budget.spending[paymentKey(item.id, december)] = { spent: null }
  const updated = convertSpendingToCommitment(budget, {
    itemId: item.id, start: december, amount: 2500, day: 31, category: 'Subscriptions',
  }, today)
  assert.deepEqual(updated.categories, [])
  assert.deepEqual(updated.spending, {})
  assert.equal(commitmentChecklist(updated, december, today)[0].amount, 2500)
})

test('replaces unconfirmed monthly amounts with the full yearly charge on renewal', () => {
  const budget = emptyBudget()
  const item = { id: 'annual', name: 'Yearly subscription', start: november, end: '', category: 'Subscriptions' }
  budget.categories = [item]
  budget.spending = {
    [paymentKey(item.id, november)]: { spent: 5000, transferred: true },
    [paymentKey(item.id, december)]: { spent: 0 },
    [paymentKey(item.id, january)]: { spent: 5000 },
  }
  const updated = convertSpendingToCommitment(budget, {
    itemId: item.id, start: december, amount: 10000, renewalDate: '2026-12-25', category: 'Subscriptions', frequency: 'yearly',
  }, today)

  assert.equal(updated.commitments[0].frequency, 'yearly')
  assert.deepEqual(updated.spending, { [paymentKey(item.id, november)]: { spent: 5000, transferred: true } })
  assert.equal(monthSummary(updated, december, today).committed, 10000)
  assert.equal(monthSummary(updated, january, today).committed, 0)
  assert.equal(monthSummary(updated, '2027-12', today).committed, 10000)
  assert.deepEqual(commitmentChecklist(updated, january, today), [])
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: updated })), updated)
})

test('moves spending from the first recorded month and marks transferred amounts paid', () => {
  const budget = emptyBudget()
  budget.income = 100000
  const item = { id: 'music', name: 'Music', start: september, end: '', category: 'Subscriptions' }
  budget.categories = [item]
  budget.spending = {
    [paymentKey(item.id, september)]: { spent: null },
    [paymentKey(item.id, october)]: { spent: 3800, transferred: true },
    [paymentKey(item.id, november)]: { spent: 4000 },
    [paymentKey(item.id, december)]: { spent: 4500, transferred: true },
    [paymentKey(item.id, february)]: { spent: 5200 },
  }
  budget.spendingConfirmations = { [october]: spendingReviewKey(budget, october), [january]: spendingReviewKey(budget, january) }
  const plan = spendingConversionPlan(budget, item, today)
  assert.equal(plan.first, october)
  assert.equal(plan.currentAvailable, true)
  const updated = convertSpendingToCommitment(budget, {
    itemId: item.id, start: plan.first, amount: 5000, day: 15, category: 'Subscriptions',
  }, today)
  const [commitment] = updated.commitments
  assert.deepEqual(updated.categories, [])
  assert.deepEqual(updated.spending, {})
  assert.equal(installment(updated, commitment, september, today), null)
  assert.deepEqual(updated.payments[paymentKey(commitment.id, october)], {
    amount: 3800, status: 'paid', oneOff: true, spendingTransferred: true,
  })
  for (const value of [october, november, december, january, february]) {
    const summary = monthSummary(updated, value, today)
    assert.equal(summary.balance, monthSummary(budget, value, today).balance)
    assert.equal(summary.spent, 0)
    assert.equal(summary.committed, summary.recordedTotal + summary.scheduledTotal + summary.missedTotal + summary.paidTotal)
  }
  assert.equal(monthSummary(updated, october, today).spendingConfirmed, true)
  assert.equal(monthSummary(updated, january, today).spendingConfirmed, true)
  assert.equal(monthSummary(updated, november, today).recordedTotal, 4000)
  assert.equal(monthSummary(updated, november, today).paidCount, 0)
  assert.equal(monthSummary(updated, december, today).paidTotal, 4500)
  assert.equal(monthSummary(updated, december, today).paidCount, 1)
  assert.equal(monthSummary(updated, december, today).outstanding, 0)
  const [row] = commitmentChecklist(updated, december, today)
  assert.equal(row.status, 'paid')
  assert.equal(row.paidDate, undefined)
  assert.equal(row.paidMonth, null)
  assert.equal(outstandingBefore(updated, february, today), 0)
  assert.equal(commitmentChecklist(updated, february, today)[0].amount, 5200)
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: updated })), updated)
})

test('previously moved transferred spending counts as paid without re-saving the budget', () => {
  const budget = emptyBudget()
  budget.income = 100000
  const item = { id: 'streaming', name: 'Streaming', category: 'Subscriptions', start: december, end: '', day: 14, amount: 5600 }
  budget.commitments = [item]
  const transferredKey = paymentKey(item.id, december)
  budget.payments[transferredKey] = { amount: 5600, oneOff: true, status: 'recorded', spendingTransferred: true }
  budget.payments[paymentKey(item.id, january)] = { amount: 5600, oneOff: true, status: 'recorded' }
  const restored = readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget }))
  assert.equal(restored.payments[transferredKey].status, 'recorded')
  assert.equal(installment(restored, item, december, today).status, 'paid')
  const summary = monthSummary(restored, december, today)
  assert.equal(summary.paidTotal, 5600)
  assert.equal(summary.recordedTotal, 0)
  assert.equal(summary.balance, 94400)
  assert.equal(summary.outstanding, 0)
  assert.equal(commitmentChecklist(restored, december, today)[0].status, 'paid')
  assert.equal(monthSummary(restored, january, today).recordedTotal, 5600)
  assert.equal(commitmentChecklist(restored, january, today).length, 0)
  assert.equal(installment(restored, item, february, today).status, 'scheduled')
})

test('starting this month keeps earlier spending and schedules the current untransferred amount', () => {
  const budget = emptyBudget()
  const item = { id: 'music', name: 'Music', start: september, end: '', category: 'Subscriptions' }
  budget.categories = [item]
  budget.spending = { 'music:2026-09': { spent: 5000 }, 'music:2026-11': { spent: 5500 } }
  const plan = spendingConversionPlan(budget, item, today)
  const updated = convertSpendingToCommitment(budget, {
    itemId: item.id, start: plan.current, amount: 6000, day: 28, category: 'Subscriptions',
  }, today)
  assert.equal(updated.categories[0].end, october)
  assert.deepEqual(updated.spending, { 'music:2026-09': { spent: 5000 } })
  assert.equal(monthSummary(updated, november, today).scheduledTotal, 5500)
  assert.equal(monthSummary(updated, december, today).scheduledTotal, 6000)
})

test('moving from the first recorded month can start annual renewals on a later exact date', () => {
  const budget = emptyBudget()
  const item = { id: 'annual', name: 'Annual subscription', start: '2024-10', end: '' }
  budget.categories = [item]
  budget.spending = { 'annual:2024-10': { spent: 5000 }, 'annual:2025-01': { spent: 4700 },
    'annual:2026-11': { spent: 5200 }, 'annual:2027-01': { spent: 5000 } }
  const updated = convertSpendingToCommitment(budget, {
    itemId: item.id, start: item.start, amount: 10000, renewalDate: '2028-02-29', category: 'Subscriptions', frequency: 'yearly',
  }, today)
  const [commitment] = updated.commitments
  assert.equal(commitment.spendingSourceFrom, '2024-10')
  assert.equal(commitment.start, '2028-02')
  assert.deepEqual(updated.categories, [])
  assert.equal(installment(updated, commitment, '2025-10', today), null)
  assert.equal(installment(updated, commitment, february, today), null)
  assert.equal(monthSummary(updated, '2025-01', today).recordedTotal, 4700)
  assert.equal(monthSummary(updated, november, today).recordedTotal, 5200)
  assert.equal(monthSummary(updated, january, today).committed, 0)
  assert.equal(installment(updated, commitment, '2028-02', today).due, '2028-02-29')
  assert.equal(installment(updated, commitment, '2029-02', today).due, '2029-02-28')
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: updated })), updated)
})

test('a custom annual cutover keeps earlier spending and validates the renewal date', () => {
  const budget = emptyBudget()
  const item = { id: 'annual', name: 'Annual subscription', start: october, end: april }
  budget.categories = [item]
  budget.spending = { 'annual:2026-10': { spent: 5000 }, 'annual:2026-12': { spent: 5300, transferred: true } }
  budget.spendingConfirmations = { [january]: spendingReviewKey(budget, january) }
  const fields = { itemId: item.id, start: december, amount: 12000, category: 'Subscriptions', frequency: 'yearly' }
  assert.throws(() => convertSpendingToCommitment(budget, fields, today), /renewal date/)
  assert.throws(() => convertSpendingToCommitment(budget, { ...fields, renewalDate: '2026-11-28' }, today), /transfer month/)
  assert.throws(() => convertSpendingToCommitment(budget, { ...fields, renewalDate: '2027-02-30' }, today), /renewal date/)
  assert.throws(() => convertSpendingToCommitment(budget, { ...fields, renewalDate: '2027-05-01' }, today), /last month/)
  const updated = convertSpendingToCommitment(budget, { ...fields, renewalDate: '2027-01-15' }, today)
  assert.equal(updated.categories[0].end, november)
  assert.equal(monthSummary(updated, october, today).spent, 5000)
  assert.equal(monthSummary(updated, december, today).paidTotal, 5300)
  assert.equal(monthSummary(updated, january, today).scheduledTotal, 12000)
  assert.equal(monthSummary(updated, february, today).committed, 0)
  assert.equal(monthSummary(updated, january, today).spendingConfirmed, true)

  const sameMonth = convertSpendingToCommitment(budget, { ...fields, renewalDate: '2026-12-15' }, today)
  const summary = monthSummary(sameMonth, december, today)
  assert.equal(summary.committed, 5300)
  assert.equal(summary.spent, 0)
  assert.equal(summary.scheduledTotal, 0)
})

test('merges the remaining history into a previously linked commitment without moving its renewals', () => {
  const budget = emptyBudget()
  const item = { id: 'music', name: 'Music', start: september, end: november, category: 'Subscriptions' }
  budget.categories = [item]
  budget.spending = { 'music:2026-10': { spent: 5000 }, 'music:2026-11': { spent: 5000, transferred: true } }
  const commitment = { ...item, id: 'subscription', start: december, end: '', amount: 12000, day: 25,
    frequency: 'yearly', spendingSourceId: item.id }
  budget.commitments = [commitment]
  const plan = spendingConversionPlan(budget, item, today)
  assert.equal(plan.first, october)
  const fields = { itemId: item.id, start: plan.first }
  const updated = convertSpendingToCommitment(budget, fields, today)
  assert.deepEqual(updated.commitments, [{ ...commitment, spendingSourceFrom: october }])
  assert.deepEqual(updated.categories, [])
  assert.equal(monthSummary(updated, october, today).recordedTotal, 5000)
  assert.equal(monthSummary(updated, december, today).scheduledTotal, 12000)
  assert.equal(monthSummary(updated, '2027-12', today).scheduledTotal, 12000)

  const collision = { amount: 6000, status: 'paid', oneOff: true }
  budget.payments['subscription:2026-10'] = collision
  assert.throws(() => convertSpendingToCommitment(budget, fields, today), /already exists/)
  assert.equal(budget.payments['subscription:2026-10'], collision)
  assert.equal(budget.spending['music:2026-10'].spent, 5000)
})
