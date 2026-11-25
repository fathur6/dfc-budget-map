const mytDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
})
const currency = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dayLabel = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
})

export function todayMYT(now = new Date()) {
  return mytDate.format(now)
}

export function addMonths(month, count) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + count, 1)).toISOString().slice(0, 7)
}

export function monthLabel(month, width = 'short', includeYear = true) {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'UTC', month: width, ...(includeYear && { year: 'numeric' }),
  }).format(new Date(month + '-01T00:00:00Z'))
}

export function dueDate(month, day) {
  const [year, number] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return month + '-' + String(Math.min(day, lastDay)).padStart(2, '0')
}

export function money(sen) {
  return sen == null ? '—' : (sen < 0 ? '−' : '') + 'RM ' + currency.format(Math.abs(sen) / 100)
}

export function parseMoney(value) {
  if (typeof value !== 'string' || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())) return null
  const [ringgit, sen = ''] = value.trim().split('.')
  return Number(ringgit) * 100 + Number(sen.padEnd(2, '0'))
}

export function inputMoney(sen) {
  return sen == null ? '' : (sen / 100).toFixed(2)
}

export const validMonth = month => typeof month === 'string' && /^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$/.test(month)

export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !validMonth(date.slice(0, 7))) return false
  const day = Number(date.slice(-2))
  return day > 0 && dueDate(date.slice(0, 7), day) === date
}

export function dateLabel(date) {
  return dayLabel.format(new Date(date + 'T00:00:00Z'))
}

export function salaryChecklistMonth(data, month, today) {
  const current = today.slice(0, 7)
  const next = addMonths(current, 1)
  if (month !== current || !validMonth(next)) return month
  return afterBudgetCutoff(today) || data.salaryReceipts?.[next]?.slice(0, 7) === current ? next : month
}

const afterBudgetCutoff = date => Number(date.slice(-2)) > 20

export function paymentBudgetMonth(data, actual, target, paidDate, hasLegacyTarget = false) {
  if (!validMonth(target) || target !== addMonths(actual, 1)) return actual
  const received = data.salaryReceipts?.[target]
  const afterReceipt = received?.slice(0, 7) === actual && received <= paidDate
  const belongsToNext = paidDate ? afterBudgetCutoff(paidDate) || afterReceipt : hasLegacyTarget
  return belongsToNext ? target : actual
}

export function emptyBudget() {
  return { income: null, incomeByMonth: {}, incomeSourcesByMonth: {}, commitments: [], categories: [], payments: {}, spending: {} }
}

export const spendingCategories = ['Food & household', 'Family support', 'Transport', 'Childcare', 'Insurance', 'Education', 'Subscriptions', 'Other']

export const incomeSourceTypes = ['Gift', 'Project', 'Loan proceeds', 'Other']

export function active(item, month) {
  return month >= item.start && (!item.end || month <= item.end)
}

export function paymentKey(id, month) {
  return id + ':' + month
}

export function installment(data, commitment, month, today) {
  const override = data.payments[paymentKey(commitment.id, month)]
  if (!active(commitment, month) && !override?.oneOff) return null
  const due = dueDate(month, override?.day ?? commitment.day)
  const actual = override?.paymentMonth || month
  const paid = override?.status === 'paid'
  const budgetMonth = paid
    ? paymentBudgetMonth(data, actual, override.checklistMonth ?? month, override.paidDate, Boolean(override.checklistMonth))
    : actual
  return {
    due,
    amount: override?.amount ?? commitment.amount,
    ...(override?.partial && { partial: override.partial }),
    ...(override?.paymentMonth && { paymentMonth: override.paymentMonth }),
    ...(override?.paidDate && { paidDate: override.paidDate }),
    ...(budgetMonth !== actual && { budgetMonth }),
    status: paid ? 'paid'
      : override?.status === 'missed' || (!commitment.provisional && due < today) ? 'missed' : 'scheduled',
  }
}

export function categoryMonth(data, category, month) {
  if (!active(category, month)) return null
  const entry = data.spending[paymentKey(category.id, month)]
  return { spent: entry?.spent ?? null }
}

export function spendingReviewKey(data, month) {
  return JSON.stringify(data.categories
    .filter(item => active(item, month))
    .map(item => [item.id, categoryMonth(data, item, month).spent])
    .sort(([a], [b]) => a.localeCompare(b)))
}

export function monthSummary(data, month, today) {
  const original = data.commitments.flatMap(item => {
    const entry = installment(data, item, month, today)
    return entry ? [allocatedInstallment(entry, item, month)] : []
  })
  const parts = original.flatMap(entry => installmentParts(data, entry, month, today))
  const movedOut = parts.filter(entry => entry.paymentMonth && entry.paymentMonth !== month)
  const movedIn = commitmentMonths(data, month, today).flatMap(({ item, months }) => months.flatMap(dueMonth => {
    if (dueMonth === month) return []
    const entry = installment(data, item, dueMonth, today)
    return entry ? installmentParts(data, allocatedInstallment(entry, item, dueMonth), dueMonth, today)
      .filter(part => part.paymentMonth === month) : []
  }))
  const commitments = [...parts.filter(entry => !entry.paymentMonth || entry.paymentMonth === month), ...movedIn]
  const spendingByCategory = new Map()
  for (const item of data.categories) {
    const amount = categoryMonth(data, item, month)?.spent
    if (amount == null) continue
    const category = spendingCategories.includes(item.category) ? item.category : 'Uncategorized'
    spendingByCategory.set(category, (spendingByCategory.get(category) ?? 0) + amount)
  }
  const baseIncome = Object.hasOwn(data.incomeByMonth, month) ? data.incomeByMonth[month] : data.income
  const incomeSources = data.incomeSourcesByMonth?.[month] ?? []
  const otherIncome = incomeSources.reduce((total, source) => total + (source.type === 'Loan proceeds' ? 0 : source.amount), 0)
  const loanProceeds = incomeSources.reduce((total, source) => total + (source.type === 'Loan proceeds' ? source.amount : 0), 0)
  const income = baseIncome == null ? null : baseIncome + otherIncome
  const cashInflow = income == null ? null : income + loanProceeds
  const committed = commitments.reduce((total, entry) => total + entry.amount, 0)
  const paid = commitments.filter(entry => entry.status === 'paid')
  const paidTotal = paid.reduce((total, entry) => total + entry.amount, 0)
  const missed = commitments.filter(entry => entry.paymentMonth && entry.paymentMonth !== entry.dueMonth
    ? entry.status !== 'paid' && entry.paymentMonth < today.slice(0, 7)
    : entry.status === 'missed')
  const missedTotal = missed.reduce((total, entry) => total + entry.amount, 0)
  const scheduledTotal = committed - paidTotal - missedTotal
  const spent = Array.from(spendingByCategory.values()).reduce((total, amount) => total + amount, 0)
  const hasSpending = spendingByCategory.size > 0
  return {
    income, cashInflow, otherIncome, loanProceeds, committed, paidTotal, scheduledTotal, missedTotal, spent, hasSpending, spendingByCategory, movedIn, movedOut,
    spendingConfirmed: Object.hasOwn(data.spendingConfirmations ?? {}, month)
      && data.spendingConfirmations[month] === spendingReviewKey(data, month),
    beforeLoans: income == null ? null : income - committed - spent,
    scheduledCommitment: original.reduce((total, entry) => total + entry.amount, 0),
    count: commitments.length, paidCount: paid.length, missedCount: missed.length,
    outstanding: committed - paidTotal,
    balance: cashInflow == null ? null : cashInflow - committed - spent,
  }
}

export function nextMonthChange(from, to) {
  if (from.balance == null || to.balance == null) return null
  return {
    total: to.balance - from.balance,
    drivers: [
      { label: 'Income', change: to.income - from.income },
      { label: 'Loan proceeds', change: to.loanProceeds - from.loanProceeds },
      { label: 'Commitments', change: to.committed - from.committed },
      { label: 'Entered spending', change: to.spent - from.spent },
    ].filter(entry => entry.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)),
  }
}

export function projectClosingCash(data, months, summaries, today) {
  const opening = data.openingCash
  const balances = months.map(() => null)
  let incomplete = null
  let missingIncome = null
  if (!opening || opening.month > months.at(-1)) return { balances, incomplete, missingIncome }

  let cash = opening.amount
  for (let month = opening.month; month <= months.at(-1); month = addMonths(month, 1)) {
    const index = months.indexOf(month)
    const summary = index === -1 ? monthSummary(data, month, today) : summaries[index]
    if (!summary.spendingConfirmed) incomplete ??= month
    if (summary.balance == null) {
      missingIncome = month
      break
    }
    cash += summary.balance
    if (index >= 0) balances[index] = cash
  }
  return { balances, incomplete, missingIncome }
}

function allocatedInstallment(entry, item, dueMonth) {
  return {
    ...entry, id: item.id, name: item.name, dueMonth,
    ...(entry.budgetMonth && { paymentMonth: entry.budgetMonth, paidMonth: entry.paymentMonth ?? dueMonth }),
  }
}

export function carriedBudgetMonth(data, partial) {
  const actual = partial.paidMonth ?? partial.month
  return partial.settled ? paymentBudgetMonth(data, actual, partial.month, partial.paidDate, Boolean(partial.paidMonth)) : actual
}

export function remainingInstallment(entry) {
  if (!entry.partial) return entry.status === 'paid' ? 0 : entry.amount
  if (entry.partial.settled) return 0
  return entry.amount - entry.partial.paid
    - (entry.partial.allocations ?? []).reduce((sum, allocation) => sum + allocation.amount, 0)
}

function rolloverMonth(today) {
  const current = today.slice(0, 7)
  const next = addMonths(current, 1)
  return afterBudgetCutoff(today) && validMonth(next) ? next : current
}

export function outstandingBudgetMonth(entry, dueMonth, today) {
  const planned = entry.partial?.month ?? entry.paymentMonth ?? dueMonth
  const target = rolloverMonth(today)
  return entry.due < today && planned < target ? target : planned
}

export function installmentParts(data, entry, dueMonth, today) {
  if (!entry.partial) {
    if (entry.status === 'paid' || entry.amount <= 0) return [entry]
    const target = outstandingBudgetMonth(entry, dueMonth, today)
    if (target === (entry.paymentMonth ?? dueMonth)) return [entry]
    return [{ ...entry, paymentMonth: target, status: 'scheduled', autoCarried: true }]
  }
  const { paid, settled, paidMonth, paidDate, allocations = [] } = entry.partial
  const carryMonth = settled ? carriedBudgetMonth(data, entry.partial) : outstandingBudgetMonth(entry, dueMonth, today)
  if (settled && carryMonth === dueMonth) return [{ ...entry, status: 'paid' }]
  const parts = paid > 0 ? [{ ...entry, amount: paid, status: 'paid' }] : []
  parts.push(...allocations.map((allocation, allocationIndex) => ({
    ...entry, amount: allocation.amount, paymentMonth: allocation.month, paidDate: allocation.date,
    paidMonth: allocation.date.slice(0, 7), status: 'paid', allocationIndex,
  })))
  const remaining = settled ? entry.amount - paid : remainingInstallment(entry)
  if (remaining > 0) {
    parts.push({ ...entry, amount: remaining, paymentMonth: carryMonth,
      ...(settled && { paidMonth: paidMonth ?? entry.partial.month, paidDate }),
      ...(!settled && carryMonth !== entry.partial.month && { autoCarried: true }),
      status: settled ? 'paid' : carryMonth === dueMonth ? entry.status : 'scheduled' })
  }
  return parts
}

export function commitmentMonths(data, month, today) {
  const includeArrears = month === rolloverMonth(today)
  const byId = new Map(data.commitments.map(item => [item.id, { item, months: new Set([month]) }]))
  if (includeArrears) {
    for (const { item, months } of byId.values()) {
      for (let due = item.start; due < month && active(item, due); due = addMonths(due, 1)) months.add(due)
    }
  }
  for (const [key, payment] of Object.entries(data.payments)) {
    const [id, due] = key.split(':')
    if (payment.paymentMonth === month || payment.checklistMonth === month || payment.partial
      || (includeArrears && due < month)) byId.get(id)?.months.add(due)
  }
  return Array.from(byId.values(), ({ item, months }) => ({ item, months: Array.from(months).sort() }))
}

export function outstandingBefore(data, start, today) {
  const current = today.slice(0, 7)
  return commitmentMonths(data, rolloverMonth(today), today).reduce((total, { item, months }) => {
    for (const dueMonth of months) {
      if (dueMonth > current) break
      const entry = installment(data, item, dueMonth, today)
      if (!entry) continue
      for (const part of installmentParts(data, entry, dueMonth, today)) {
        const assigned = part.paymentMonth ?? dueMonth
        if (part.status !== 'paid' && assigned < start
          && (part.autoCarried || (assigned === dueMonth ? part.status === 'missed' : assigned < current))) total += part.amount
      }
    }
    return total
  }, 0)
}

export function projectCommitment(data, { start, duration, amount }, today) {
  const arrears = outstandingBefore(data, start, today)
  const months = Array.from({ length: duration }, (_, offset) => {
    const month = addMonths(start, offset)
    const { income, committed, spent, spendingConfirmed } = monthSummary(data, month, today)
    const existing = committed + (offset === 0 ? arrears : 0)
    const baseline = income == null ? null : income - existing - spent
    return {
      month, cashInflow: income, committed: existing, spent, proposed: amount, spendingConfirmed,
      baseline, balance: baseline == null ? null : baseline - amount,
    }
  })
  return { arrears, months }
}

export function simulate(data, scenario, today, projection = projectCommitment(data, scenario, today)) {
  const { buffer } = scenario
  const { arrears, months } = projection
  const missing = months.find(entry => entry.balance == null)?.month
  if (missing) return { missing, arrears }

  const stats = key => {
    const tightest = months.reduce((lowest, entry) => entry[key] < lowest[key] ? entry : lowest)
    const below = months.filter(entry => entry[key] < buffer)
    return {
      month: tightest.month, remaining: tightest[key],
      firstBelow: below[0]?.month ?? null, belowCount: below.length,
    }
  }
  const before = stats('baseline')
  const after = stats('balance')
  return {
    month: after.month, remaining: after.remaining, arrears, before, after,
    unconfirmedCount: months.filter(entry => !entry.spendingConfirmed).length,
    status: after.remaining < 0 ? 'deficit' : after.remaining < buffer ? 'tight' : 'fits',
    headroom: after.remaining - buffer,
  }
}

export function demoBudget(today) {
  const current = today.slice(0, 7)
  const previous = addMonths(current, -1)
  const data = emptyBudget()
  data.income = 850000
  data.commitments = [
    { id: 'home', name: 'Home instalment', category: 'Housing', amount: 165000, day: 5, start: previous, end: '' },
    { id: 'car', name: 'Car financing', category: 'Transport', amount: 78000, day: 12, start: previous, end: '' },
    { id: 'electric', name: 'Electricity', category: 'Utilities', amount: 22000, day: 20, start: previous, end: '' },
    { id: 'mobile', name: 'Mobile & internet', category: 'Utilities', amount: 16500, day: 22, start: previous, end: '' },
    { id: 'plan', name: 'Device instalment', category: 'Financing', amount: 31500, day: 28, start: previous, end: addMonths(current, 1) },
  ]
  for (const item of data.commitments) {
    if (item.id !== 'electric') data.payments[paymentKey(item.id, previous)] = { status: 'paid', amount: item.amount }
    if (['home', 'car'].includes(item.id)) data.payments[paymentKey(item.id, current)] = { status: 'paid', amount: item.amount }
  }
  data.categories = [
    { id: 'food', name: 'Food & groceries', start: previous, end: '' },
    { id: 'fuel', name: 'Fuel & transport', start: previous, end: '' },
    { id: 'family', name: 'Household & family', start: previous, end: '' },
  ]
  data.spending[paymentKey('food', current)] = { spent: 92000 }
  data.spending[paymentKey('fuel', current)] = { spent: 31000 }
  data.spending[paymentKey('family', current)] = { spent: 68000 }
  return data
}
