import { categoryMonth, installment, paymentBudgetMonth, paymentKey, remainingInstallment, validDate } from './budget.js'

export function commitmentChecklist(data, month, today) {
  const dueMonths = new Map(data.commitments.map(item => [item.id, new Set([month])]))
  for (const [key, payment] of Object.entries(data.payments)) {
    if (payment.paymentMonth === month || payment.checklistMonth === month || payment.partial?.month === month) {
      const [id, dueMonth] = key.split(':')
      dueMonths.get(id)?.add(dueMonth)
    }
  }

  const rows = []
  for (const item of data.commitments) {
    for (const dueMonth of dueMonths.get(item.id)) {
      const entry = installment(data, item, dueMonth, today)
      if (!entry) continue
      const key = paymentKey(item.id, dueMonth)
      const row = { key, item, dueMonth, due: entry.due }
      if (entry.partial) {
        const remaining = remainingInstallment(entry)
        if (dueMonth === month && entry.partial.month !== month && entry.partial.paid > 0) {
          rows.push({ ...row, portion: 'partial', status: 'paid', amount: entry.partial.paid, paidMonth: dueMonth })
        }
        if (entry.partial.month === month) {
          const carried = dueMonth !== month
          const lastAllocation = entry.partial.allocations?.at(-1)
          rows.push({ ...row, ...(carried && { portion: 'remainder' }),
            amount: entry.amount - (carried ? entry.partial.paid : 0), remaining,
            status: remaining === 0 ? 'paid' : 'scheduled',
            paidMonth: remaining === 0 ? lastAllocation?.date.slice(0, 7) ?? entry.partial.paidMonth ?? month : null,
            paidDate: lastAllocation?.date ?? entry.partial.paidDate })
        }
      } else {
        const actual = entry.paymentMonth ?? dueMonth
        const planned = data.payments[key]?.checklistMonth ?? (entry.status === 'paid' && actual < dueMonth ? dueMonth : actual)
        if (planned === month && entry.amount > 0) {
          rows.push({ ...row, status: entry.status, amount: entry.amount, paidMonth: entry.status === 'paid' ? actual : null,
            paidDate: entry.paidDate })
        }
      }
    }
  }
  return rows
}

export function markCommitmentPaid(data, row, month, today) {
  const paidMonth = today.slice(0, 7)
  const previous = data.payments[row.key]
  if (previous?.partial?.allocations) {
    return applySlices(data, [{ row, amount: row.remaining }], month, today)
  }
  let payment
  if (row.portion === 'remainder') {
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
        month, settled: false,
        allocations: [...(previous?.partial?.allocations ?? []), { amount, date, month: budgetMonth }],
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
    return [{ key, item, amount: entry.spent, transferred: data.spending[key]?.transferred === true }]
  })
}
