import assert from 'node:assert/strict'
import test from 'node:test'
import { readBackup } from '../src/backup.js'
import { emptyBudget, monthSummary, paymentKey, spendingReviewKey } from '../src/budget.js'
import { convertSpendingToCommitment, spendingConversionPlan } from '../src/spendingConversion.js'
import { commitmentChecklist, spendingChecklist } from '../src/transfers.js'

const today = '2026-11-25'
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
  assert.equal(spendingConversionPlan(budget, item, today).start, february)
  assert.throws(() => convertSpendingToCommitment(budget, { ...fields, start: january }, today), /eligible start month/)
  assert.throws(() => convertSpendingToCommitment(budget, { ...fields, day: 0 }, today), /valid monthly amount/)

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
