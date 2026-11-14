const mytDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
})
const currency = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

export function emptyBudget() {
  return { income: null, incomeByMonth: {}, incomeSourcesByMonth: {}, commitments: [], categories: [], payments: {}, spending: {} }
}

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
  return {
    due,
    amount: override?.amount ?? commitment.amount,
    ...(override?.paymentMonth && { paymentMonth: override.paymentMonth }),
    status: override?.status === 'paid' ? 'paid'
      : override?.status === 'missed' || (!commitment.provisional && due < today) ? 'missed' : 'scheduled',
  }
}

export function categoryMonth(data, category, month) {
  if (!active(category, month)) return null
  const entry = data.spending[paymentKey(category.id, month)]
  return { planned: entry?.planned ?? category.planned, spent: entry?.spent ?? null }
}

export function monthSummary(data, month, today) {
  const original = data.commitments.flatMap(item => {
    const entry = installment(data, item, month, today)
    return entry ? [{ ...entry, id: item.id, name: item.name, dueMonth: month }] : []
  })
  const movedOut = original.filter(entry => entry.paymentMonth && entry.paymentMonth !== month)
  const movedIn = movedInstallments(data, today).filter(entry => entry.paymentMonth === month)
  const commitments = [...original.filter(entry => !entry.paymentMonth || entry.paymentMonth === month), ...movedIn]
  const categories = data.categories.map(item => categoryMonth(data, item, month)).filter(Boolean)
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
  const planned = categories.reduce((total, entry) => total + entry.planned, 0)
  const spent = categories.reduce((total, entry) => total + (entry.spent ?? 0), 0)
  const hasSpending = categories.some(entry => entry.spent != null)
  const spendingForecast = categories.reduce((total, entry) => total + Math.max(entry.planned, entry.spent ?? 0), 0)
  return {
    income, cashInflow, otherIncome, loanProceeds, committed, paidTotal, planned, spent, spendingForecast, hasSpending, movedIn, movedOut,
    scheduledCommitment: original.reduce((total, entry) => total + entry.amount, 0),
    count: commitments.length, paidCount: paid.length, missedCount: missed.length,
    outstanding: committed - paidTotal,
    balance: cashInflow == null ? null : cashInflow - committed - spendingForecast,
    recordedBalance: cashInflow == null || !hasSpending ? null : cashInflow - committed - spent,
  }
}

function movedInstallments(data, today) {
  const commitments = new Map(data.commitments.map(item => [item.id, item]))
  return Object.entries(data.payments).flatMap(([key, payment]) => {
    const [id, dueMonth] = key.split(':')
    if (!payment.paymentMonth || payment.paymentMonth === dueMonth) return []
    const item = commitments.get(id)
    const entry = item && installment(data, item, dueMonth, today)
    return entry ? [{ ...entry, id, name: item.name, dueMonth }] : []
  })
}

export function outstandingBefore(data, start, today) {
  const current = today.slice(0, 7)
  const commitments = new Map(data.commitments.map(item => [item.id, item]))
  let total = 0
  for (const item of data.commitments) {
    const last = item.end && item.end < current ? item.end : current
    for (let month = item.start; month < start && month <= last; month = addMonths(month, 1)) {
      const entry = installment(data, item, month, today)
      if (entry.status === 'missed' && (!entry.paymentMonth || entry.paymentMonth === month)) total += entry.amount
    }
  }
  for (const [key, payment] of Object.entries(data.payments)) {
    if (!payment.oneOff) continue
    const [id, month] = key.split(':')
    const item = commitments.get(id)
    if (!item || active(item, month) || month >= start || month > current) continue
    const entry = installment(data, item, month, today)
    if (entry.status === 'missed' && (!entry.paymentMonth || entry.paymentMonth === month)) total += entry.amount
  }
  for (const entry of movedInstallments(data, today)) {
    if (entry.status !== 'paid' && entry.paymentMonth < start && entry.paymentMonth < current) total += entry.amount
  }
  return total
}

export function simulate(data, { start, duration, amount, buffer }, today) {
  const arrears = outstandingBefore(data, start, today)
  let tightest = null
  for (let offset = 0; offset < duration; offset++) {
    const month = addMonths(start, offset)
    const { balance, loanProceeds } = monthSummary(data, month, today)
    if (balance == null) return { missing: month, arrears }
    const remaining = balance - loanProceeds - amount - (offset === 0 ? arrears : 0)
    if (!tightest || remaining < tightest.remaining) tightest = { month, remaining }
  }
  return {
    ...tightest, arrears,
    status: tightest.remaining < 0 ? 'deficit' : tightest.remaining < buffer ? 'tight' : 'fits',
    headroom: tightest.remaining - buffer,
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
    { id: 'food', name: 'Food & groceries', planned: 160000, start: previous, end: '' },
    { id: 'fuel', name: 'Fuel & transport', planned: 55000, start: previous, end: '' },
    { id: 'family', name: 'Household & family', planned: 90000, start: previous, end: '' },
  ]
  data.spending[paymentKey('food', current)] = { spent: 92000 }
  data.spending[paymentKey('fuel', current)] = { spent: 31000 }
  data.spending[paymentKey('family', current)] = { spent: 68000 }
  return data
}
