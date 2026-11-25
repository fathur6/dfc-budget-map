import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonths, appendIncomeSource, demoBudget, dueDate, emptyBudget, installment, monthSummary, nextMonthChange,
  outstandingBefore, parseMoney, projectClosingCash, projectCommitment, simulate, spendingReviewKey, todayMYT,
} from '../src/budget.js'
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
  assert.equal(now.committed, 335000)
  assert.equal(now.paidTotal, 243000)
  assert.equal(now.outstanding, 92000)
  assert.equal(now.balance, 324000)
  assert.equal(monthSummary(data, '2027-01', today).committed, 281500)
})

test('groups recorded spending by category using the same amounts as the monthly total', () => {
  const budget = emptyBudget()
  budget.categories = [
    { id: 'nursery', category: 'Childcare', start: '2026-11', end: '2026-12' },
    { id: 'school', category: 'Childcare', start: '2026-11' },
    { id: 'legacy', start: '2026-12' },
    { id: 'petrol', category: 'Transport', start: '2026-11' },
  ]
  budget.spending = {
    'nursery:2026-12': { spent: 45000 },
    'school:2026-12': { spent: 25000 },
    'legacy:2026-12': { spent: 4305 },
    'petrol:2026-12': { spent: 0 },
    'nursery:2027-01': { spent: 45000 },
    'school:2027-01': { spent: 25000 },
  }

  const december = monthSummary(budget, '2026-12', today)
  assert.deepEqual(december.spendingByCategory, new Map([
    ['Childcare', 70000], ['Uncategorized', 4305], ['Transport', 0],
  ]))
  assert.equal(december.spent, 74305)

  const january = monthSummary(budget, '2027-01', today)
  assert.deepEqual(january.spendingByCategory, new Map([['Childcare', 25000]]))
  assert.equal(january.spent, 25000)
  assert.equal(monthSummary(budget, '2027-02', today).hasSpending, false)
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

test('yearly commitments renew in their first month and keep explicit off-cycle payment records', () => {
  const budget = emptyBudget()
  const item = { id: 'yearly', name: 'Yearly subscription', category: 'Subscriptions', start: '2026-02',
    end: '2028-02', amount: 12000, day: 31, frequency: 'yearly' }
  budget.commitments = [item]
  budget.payments['yearly:2026-03'] = { status: 'paid', amount: 800 }
  budget.payments['yearly:2026-04'] = { amount: 800 }
  assert.equal(installment(budget, item, '2026-03', today).status, 'paid')
  assert.equal(installment(budget, item, '2026-04', today), null)
  assert.equal(installment(budget, item, '2027-02', today).due, '2027-02-28')
  assert.equal(installment(budget, item, '2028-02', today).due, '2028-02-29')
  assert.equal(installment(budget, item, '2029-02', today), null)
  assert.equal(monthSummary(budget, '2026-11', today).outstanding, 12000)
  const projections = projectCommitment(budget, { start: '2027-01', duration: 3, amount: 0 }, '2026-01-01')
  assert.deepEqual(projections.months.map(month => month.committed), [0, 12000, 0])
})

test('ignores legacy spending budgets and allows zero income', () => {
  const changed = structuredClone(data)
  changed.categories[0].planned = 900000
  changed.spending['food:2026-11'] = { spent: 200000, planned: 950000 }
  changed.incomeByMonth['2026-11'] = 0
  const result = monthSummary(changed, '2026-11', today)
  assert.equal(result.spent, 299000)
  assert.equal(result.income, 0)
  assert.equal(result.balance, -634000)
  assert.equal(monthSummary(emptyBudget(), '2026-11', today).balance, null)
  changed.incomeByMonth['2026-11'] = null
  assert.equal(monthSummary(changed, '2026-11', today).balance, null)
})

test('uses only recorded spending for the summary balance and distinguishes zero from missing', () => {
  const changed = structuredClone(data)
  assert.equal(monthSummary(changed, '2026-11', today).balance, 324000)
  assert.equal(monthSummary(changed, '2026-12', today).balance, 537000)
  changed.spending['food:2026-12'] = { spent: 0 }
  assert.equal(monthSummary(changed, '2026-12', today).balance, 537000)
  changed.incomeByMonth['2026-12'] = null
  assert.equal(monthSummary(changed, '2026-12', today).balance, null)
})

test('adds extra income and loan proceeds to cash flow for the selected month only', () => {
  const changed = structuredClone(data)
  changed.incomeByMonth['2026-11'] = 800000
  changed.incomeSourcesByMonth['2026-11'] = [
    { type: 'Gift', name: '', amount: 25000 },
    { type: 'Project', name: 'Workshop', amount: 120000 },
    { type: 'Loan proceeds', name: '', amount: 500000 },
  ]
  const result = monthSummary(changed, '2026-11', today)
  assert.equal(result.income, 945000)
  assert.equal(result.loanProceeds, 500000)
  assert.equal(result.cashInflow, 1445000)
  assert.equal(result.balance, 919000)
  assert.equal(monthSummary(changed, '2026-12', today).cashInflow, 850000)
  assert.equal(simulate(changed, { start: '2026-11', duration: 1, amount: 10000, buffer: 0 }, today).remaining, 409000)
  changed.incomeByMonth['2026-11'] = 0
  assert.equal(monthSummary(changed, '2026-11', today).cashInflow, 645000)
  changed.incomeByMonth['2026-11'] = null
  assert.equal(monthSummary(changed, '2026-11', today).balance, null)
})

test('appends additional income sources for one month and retains the existing loan treatment', () => {
  const december = '2026-12'
  const base = { ...data, incomeSourcesByMonth: { [december]: [{ type: 'Project', name: 'Workshop', amount: 4000 }] } }
  const additions = [['Loan proceeds', 20000], ['Incentive', 10000], ['Gift', 5000], ['Freelance', 15000], ['Gift', 2500]]
  const updated = additions.reduce((budget, [type, amount]) => appendIncomeSource(budget, december, type, amount), base)
  const { cashInflow, income, loanProceeds } = monthSummary(updated, december, today)
  assert.equal(cashInflow, 906500)
  assert.equal(income, 886500)
  assert.equal(loanProceeds, 20000)
  assert.equal(monthSummary(updated, '2026-11', today).cashInflow, 850000)
  assert.equal(base.incomeSourcesByMonth[december].length, 1)
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: updated })), updated)
  assert.throws(() => appendIncomeSource(base, december, 'Invalid', 100), /Choose an income source/)
  assert.throws(() => appendIncomeSource(base, december, 'Gift', 0), /greater than RM 0.00/)
})

test('includes a one-off instalment outside the schedule and carries it once if overdue', () => {
  const changed = structuredClone(data)
  const device = changed.commitments.find(item => item.id === 'plan')
  changed.payments['plan:2027-02'] = { oneOff: true, amount: 12345, day: 31 }
  const overdue = '2027-03-01'
  assert.deepEqual(installment(changed, device, '2027-02', overdue),
    { due: '2027-02-28', amount: 12345, status: 'missed' })
  assert.equal(installment(changed, device, '2027-01', overdue), null)
  assert.equal(installment(changed, device, '2027-03', overdue), null)
  assert.equal(monthSummary(changed, '2027-02', overdue).scheduledCommitment,
    monthSummary(data, '2027-02', overdue).scheduledCommitment + 12345)
  assert.equal(monthSummary(changed, '2027-02', overdue).committed, 0)
  assert.equal(monthSummary(changed, '2027-03', overdue).committed,
    monthSummary(data, '2027-03', overdue).committed + 12345)
  assert.equal(outstandingBefore(changed, '2027-03', overdue), 0)
  assert.equal(outstandingBefore(changed, '2027-04', overdue),
    outstandingBefore(data, '2027-04', overdue) + 12345)
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: changed })), changed)
})

test('tests the whole term, the user buffer and earlier missed payments once', () => {
  const changed = structuredClone(data)
  changed.incomeByMonth['2027-01'] = 640000
  assert.equal(outstandingBefore(changed, '2026-11', today), 0)
  assert.equal(outstandingBefore(changed, '2026-12', today), 22000)
  const run = options => simulate(changed, { start: '2026-11', duration: 3, amount: 40000, buffer: 20000, ...options }, today)
  assert.deepEqual(run(), {
    month: '2026-11', remaining: 284000, arrears: 0, status: 'fits', headroom: 264000, unconfirmedCount: 3,
    before: { month: '2026-11', remaining: 324000, firstBelow: null, belowCount: 0 },
    after: { month: '2026-11', remaining: 284000, firstBelow: null, belowCount: 0 },
  })
  assert.equal(run({ amount: 20000 }).status, 'fits')
  assert.equal(run({ amount: 400000 }).status, 'deficit')
  assert.equal(run({ duration: 1, amount: 200000 }).remaining, 124000)
  assert.equal(simulate(emptyBudget(), { start: '2026-11', duration: 1, amount: 40000, buffer: 0 }, today).missing, '2026-11')
})

test('allocates a deferred installment to its planned month and replaces it with the actual month', () => {
  const changed = structuredClone(data)
  const dueMonth = '2026-10'
  const plannedMonth = '2026-12'
  const key = 'electric:' + dueMonth
  changed.payments[key] = { paymentMonth: plannedMonth }
  const origin = monthSummary(changed, dueMonth, today)
  const target = monthSummary(changed, plannedMonth, today)
  assert.equal(origin.scheduledCommitment, 313000)
  assert.equal(origin.committed, 291000)
  assert.equal(origin.movedOut[0].paymentMonth, plannedMonth)
  assert.equal(target.committed, 335000)
  assert.equal(target.movedIn[0].dueMonth, dueMonth)
  assert.equal(outstandingBefore(changed, plannedMonth, today), 0)
  assert.equal(simulate(changed, { start: plannedMonth, duration: 1, amount: 10000, buffer: 0 }, today).remaining, 505000)
  assert.equal(outstandingBefore(changed, '2027-01', '2026-12-31'), 0)
  assert.equal(outstandingBefore(changed, '2027-01', '2027-01-02'),
    outstandingBefore(data, '2027-01', '2027-01-02'))

  changed.payments[key] = { status: 'paid', paymentMonth: '2027-01', amount: 22000 }
  assert.equal(monthSummary(changed, plannedMonth, today).committed, 313000)
  assert.equal(monthSummary(changed, '2027-01', today).committed, 303500)
  assert.equal(monthSummary(changed, '2027-01', today).paidTotal, 22000)
  assert.equal(outstandingBefore(changed, '2027-02', '2027-01-02'),
    outstandingBefore(data, '2027-02', '2027-01-02') - 22000)
})

test('charges an early payment to the earlier month and keeps its original installment in the schedule', () => {
  const changed = structuredClone(data)
  changed.payments['plan:2026-12'] = { status: 'paid', amount: 31500, paymentMonth: '2026-11' }
  const early = monthSummary(changed, '2026-11', today)
  const due = monthSummary(changed, '2026-12', today)
  assert.equal(early.committed, 366500)
  assert.equal(early.paidTotal, 274500)
  assert.equal(early.balance, 292500)
  assert.equal(due.scheduledCommitment, 313000)
  assert.equal(due.committed, 281500)
  assert.equal(installment(changed, changed.commitments[4], '2026-12', today).status, 'paid')
  const backup = budget => JSON.stringify({ format: 'dfc-budget-map', version: 1, budget })
  assert.deepEqual(readBackup(backup(changed)), changed)
  changed.payments['plan:2026-12'].paymentMonth = '2026-13'
  assert.throws(() => readBackup(backup(changed)), /valid DFC/)
})

test('backups round-trip and reject invalid money and orphan monthly records', () => {
  const serialize = budget => JSON.stringify({ format: 'dfc-budget-map', version: 1, budget })
  assert.deepEqual(readBackup(serialize(data)), data)
  assert.throws(() => readBackup(serialize({ ...data, income: 1.23 })), /valid DFC/)
  assert.throws(() => readBackup(serialize({ ...data, payments: { 'unknown:2026-11': { status: 'paid' } } })), /valid DFC/)
})

test('accepts older backups and validates any monthly income sources', () => {
  const serialize = budget => JSON.stringify({ format: 'dfc-budget-map', version: 1, budget })
  const { incomeSourcesByMonth, ...legacy } = data
  assert.deepEqual(readBackup(serialize(legacy)), legacy)
  assert.equal(monthSummary(legacy, '2026-11', today).cashInflow, 850000)
  const sources = [{ type: 'Project', name: 'Workshop', amount: 75000 }]
  const changed = { ...legacy, incomeSourcesByMonth: { '2026-12': sources } }
  assert.deepEqual(readBackup(serialize(changed)), changed)
  for (const invalid of [
    { '2026-13': sources },
    { '2026-12': [{ ...sources[0], amount: -1 }] },
    { '2026-12': [{ ...sources[0], type: 'Invalid' }] },
  ]) {
    assert.throws(() => readBackup(serialize({ ...legacy, incomeSourcesByMonth: invalid })), /valid DFC/)
  }
})

test('allocates a partial payment and its carried balance without double counting', () => {
  const changed = emptyBudget()
  changed.commitments = [{ id: 'test', name: 'Test plan', category: 'Other', start: '2026-11', end: '', amount: 223000, day: 20 }]
  changed.payments['test:2026-11'] = { amount: 223000, partial: { paid: 99000, month: '2026-12', settled: false } }
  const nov = monthSummary(changed, '2026-11', today)
  const dec = monthSummary(changed, '2026-12', today)
  assert.equal(nov.scheduledCommitment, 223000)
  assert.equal(nov.committed, 99000)
  assert.equal(nov.paidTotal, 99000)
  assert.equal(dec.committed, 347000)
  assert.equal(dec.outstanding, 347000)
  assert.equal(dec.movedIn[0].amount, 124000)
  assert.equal(nov.scheduledTotal, 0)
  assert.equal(nov.missedTotal, 0)
  assert.equal(dec.scheduledTotal, 347000)
  assert.equal(dec.missedTotal, 0)
  const overdue = monthSummary(changed, '2026-12', '2027-01-01')
  assert.equal(overdue.committed, 0)
  assert.equal(overdue.scheduledTotal, 0)
  assert.equal(monthSummary(changed, '2027-01', '2027-01-01').outstanding, 570000)
  assert.equal(outstandingBefore(changed, '2027-01', '2027-01-01'), 0)
  const backup = JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: changed })
  assert.deepEqual(readBackup(backup), changed)
  changed.payments['test:2026-11'].partial.settled = true
  assert.equal(monthSummary(changed, '2026-12', '2026-12-21').paidTotal, 124000)
  assert.equal(monthSummary(changed, '2027-01', '2027-01-01').outstanding, 446000)
})

test('projects the full term with the same monthly balances used by the simulator', () => {
  const changed = structuredClone(data)
  changed.incomeSourcesByMonth['2026-11'] = [{ type: 'Loan proceeds', name: '', amount: 100000 }]
  const scenario = { start: '2026-11', duration: 12, amount: 15000, buffer: 25000 }
  const projection = projectCommitment(changed, scenario, today)
  assert.equal(projection.months.length, 12)
  assert.equal(projection.months.at(-1).month, '2027-10')
  assert.equal(projection.months[0].cashInflow, 850000)
  assert.equal(projection.months[0].committed, 335000)
  assert.equal(projection.months[1].committed, 313000)
  assert.equal(projection.months[0].proposed, 15000)
  assert.ok(projection.months.every(entry => entry.baseline - entry.balance === scenario.amount))
  assert.equal(simulate(changed, scenario, today).remaining,
    Math.min(...projection.months.map(entry => entry.balance)))
})

test('spending confirmation follows an exact month and detects changes in active entries', () => {
  const budget = structuredClone(data)
  const month = '2026-11'
  const isConfirmed = value => monthSummary(budget, value, today).spendingConfirmed
  assert.equal(isConfirmed(month), false)
  budget.spendingConfirmations = { [month]: spendingReviewKey(budget, month) }
  budget.categories.reverse()
  assert.equal(isConfirmed(month), true)
  assert.equal(isConfirmed('2026-12'), false)
  budget.spending['food:2026-11'] = { spent: 0 }
  assert.equal(isConfirmed(month), false)
  budget.spendingConfirmations[month] = spendingReviewKey(budget, month)
  budget.categories.push({ id: 'new', start: month })
  assert.equal(isConfirmed(month), false)
})

test('attributes monthly change and carries cash forward until an unknown-income month', () => {
  const budget = emptyBudget()
  budget.income = 1180000
  budget.categories = [{ id: 'spending', name: 'Spending', start: '2026-11', end: '' }]
  budget.commitments = [{ id: 'debt', name: 'Debt', category: 'Financing', amount: 913899, day: 1, start: '2026-12', end: '2027-01' }]
  budget.payments['debt:2027-01'] = { amount: 709021 }
  budget.spending['spending:2026-12'] = { spent: 459200 }
  budget.spending['spending:2027-01'] = { spent: 414200 }
  budget.openingCash = { month: '2026-12', amount: 100000 }
  budget.spendingConfirmations = { '2026-12': spendingReviewKey(budget, '2026-12') }
  budget.incomeByMonth['2027-02'] = null
  const months = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03']
  const summaries = months.map(month => monthSummary(budget, month, today))

  assert.deepEqual(nextMonthChange(summaries[1], summaries[2]), {
    total: 249878,
    drivers: [
      { label: 'Commitments', change: -204878 },
      { label: 'Entered spending', change: -45000 },
    ],
  })
  assert.equal(nextMonthChange(summaries[2], summaries[3]), null)
  assert.deepEqual(projectClosingCash(budget, months, summaries, today), {
    balances: [null, -93099, -36320, null, null], incomplete: '2027-01', missingIncome: '2027-02',
  })
  assert.equal(projectClosingCash(budget, months.slice(2), summaries.slice(2), today).balances[0], -36320)
  const backup = { ...budget, openingCash: { ...budget.openingCash, amount: -20000 } }
  assert.deepEqual(readBackup(JSON.stringify({ format: 'dfc-budget-map', version: 1, budget: backup })), backup)
})

test('compares how many months cross the buffer and reports exact headroom', () => {
  const budget = emptyBudget()
  budget.income = 100000
  budget.incomeByMonth['2026-12'] = 80000
  const scenario = { start: '2026-11', duration: 3, amount: 20000, buffer: 70000 }
  const result = simulate(budget, scenario, today)
  assert.equal(result.before.belowCount, 0)
  assert.equal(result.after.belowCount, 1)
  assert.equal(result.after.firstBelow, '2026-12')
  assert.equal(result.headroom, -10000)
  assert.equal(simulate(budget, { ...scenario, buffer: 59500 }, today).headroom, 500)
})
