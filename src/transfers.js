import { categoryMonth, commitmentMonths, installment, outstandingBudgetMonth, paymentBudgetMonth, paymentKey, remainingInstallment, validDate } from './budget.js'

export function commitmentChecklist(data, month, today) {
  const rows = []
  for (const { item, months } of commitmentMonths(data, month, today)) {
    for (const dueMonth of months) {
      const entry = installment(data, item, dueMonth, today)
      if (!entry) continue
      const key = paymentKey(item.id, dueMonth)
      const row = { key, item, dueMonth, due: entry.due }
      const target = outstandingBudgetMonth(entry, dueMonth, today)
      if (entry.partial) {
        const { paid, settled, month: originalPlan, paidDate, paidMonth, allocations = [] } = entry.partial
        const included = allocations.filter(allocation => (allocation.checklistMonth ?? originalPlan) === month)
        const lastAllocation = included.at(-1)
        const settledHere = settled && originalPlan === month
        const remaining = target === month ? remainingInstallment(entry) : 0
        const amount = remaining + (dueMonth === month ? paid : 0) + (settledHere ? entry.amount - paid : 0)
          + included.reduce((total, allocation) => total + allocation.amount, 0)
        if (amount > 0) {
          const date = lastAllocation?.date ?? (settledHere ? paidDate : undefined)
          rows.push({ ...row, portion: dueMonth !== month ? 'remainder' : remaining === 0 && !lastAllocation ? 'partial' : undefined,
            amount, remaining, status: remaining === 0 ? 'paid' : 'scheduled',
            paidMonth: remaining === 0 ? date?.slice(0, 7) ?? (settledHere ? paidMonth : null) ?? month : null,
            paidDate: date })
        }
      } else {
        const actual = entry.paymentMonth ?? dueMonth
        const paid = entry.status === 'paid'
        const planned = paid ? data.payments[key]?.checklistMonth ?? (actual < dueMonth ? dueMonth : actual) : target
        if (planned === month && entry.amount > 0) {
          rows.push({ ...row, ...(dueMonth < month && { portion: 'remainder' }),
            status: !paid && dueMonth < month ? 'scheduled' : entry.status, amount: entry.amount, paidMonth: paid ? actual : null,
            paidDate: entry.paidDate })
        }
      }
    }
  }
  return rows
}

export function markCommitmentPaid(data, requested, month, today) {
  const pending = commitmentChecklist(data, month, today)
    .filter(entry => entry.item.id === requested.item.id && entry.status !== 'paid')
  const row = pending.find(entry => entry.key === requested.key)
  if (!row || (row.remaining ?? row.amount) !== (requested.remaining ?? requested.amount)) {
    throw new Error('The outstanding balance has changed. Refresh the checklist before recording the payment.')
  }
  if (pending[0].key !== row.key) throw new Error('Record the oldest outstanding instalment first.')
  const paidMonth = today.slice(0, 7)
  const previous = data.payments[row.key]
  if (previous?.partial && (previous.partial.allocations || previous.partial.month !== month)) {
    return applySlices(data, [{ row, amount: row.remaining }], month, today)
  }
  let payment
  if (previous?.partial) {
    if (paidMonth < row.dueMonth) throw new Error('Check the date of the original partial payment before settling the remainder.')
    payment = { ...previous, partial: { ...previous.partial, settled: true, paidMonth, paidDate: today } }
  } else {
    payment = { ...previous, status: 'paid', amount: row.amount, checklistMonth: month, paidDate: today }
    if (paidMonth === row.dueMonth) delete payment.paymentMonth
    else payment.paymentMonth = paidMonth
  }
  return { ...data, payments: { ...data.payments, [row.key]: payment } }
}

export function allocationRows(data, item, month, today) {
  return commitmentChecklist(data, month, today)
    .filter(row => row.item.id === item.id && row.dueMonth <= month && row.status !== 'paid')
    .sort((a, b) => a.dueMonth.localeCompare(b.dueMonth))
}

export function splitPayment(rows, amount) {
  let available = amount ?? 0
  return rows.map(row => {
    const outstanding = row.remaining ?? row.amount
    const applied = Math.min(available, outstanding)
    available -= applied
    return { row, amount: applied, remaining: outstanding - applied }
  })
}

function applySlices(data, slices, month, date) {
  const budgetMonth = paymentBudgetMonth(data, date.slice(0, 7), month, date)
  const payments = { ...data.payments }
  for (const { row, amount } of slices) {
    if (amount === 0) continue
    const previous = payments[row.key]
    const { amount: dueAmount } = installment(data, row.item, row.dueMonth, date)
    payments[row.key] = {
      amount: dueAmount,
      ...(previous?.day != null && { day: previous.day }),
      ...(previous?.oneOff && { oneOff: true }),
      partial: {
        paid: previous?.partial?.paid ?? 0,
        month: previous?.partial?.month ?? month, settled: false,
        allocations: [...(previous?.partial?.allocations ?? []), { amount, date, month: budgetMonth, checklistMonth: month }],
      },
    }
  }
  return { ...data, payments }
}

export function recordAllocatedPayment(data, item, month, amount, date, today) {
  const rows = allocationRows(data, item, month, today)
  const maximum = rows.reduce((sum, row) => sum + (row.remaining ?? row.amount), 0)
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > maximum) {
    throw new Error('Enter an amount within the outstanding balance.')
  }
  if (!validDate(date) || date > today) throw new Error('Enter a payment date of today or earlier.')
  return applySlices(data, splitPayment(rows, amount), month, date)
}

export function spendingChecklist(data, month) {
  return data.categories.flatMap(item => {
    const entry = categoryMonth(data, item, month)
    if (!entry || entry.spent === 0) return []
    const key = paymentKey(item.id, month)
    return [{ key, item, amount: entry.spent, transferred: entry.transferred }]
  })
}

export function isOutstandingArrears(row, month, today) {
  return row.status !== 'paid' && (row.dueMonth < month || row.status === 'missed'
    || (!row.item.provisional && row.due < today))
}

export function checklistProgress(rows, remainingAmount, isArrears = () => false) {
  const progress = { total: 0, remaining: 0, arrears: 0, count: 0, completed: 0 }
  for (const row of rows) {
    if (!(row.amount > 0)) continue
    const remaining = remainingAmount(row)
    progress.total += row.amount
    progress.remaining += remaining
    progress.count += 1
    if (remaining === 0) progress.completed += 1
    if (isArrears(row)) progress.arrears += remaining
  }
  return { ...progress, completedAmount: progress.total - progress.remaining }
}
