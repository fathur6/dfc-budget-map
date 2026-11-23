import { categoryMonth, installment, paymentKey } from './budget.js'

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
        if (dueMonth === month) {
          rows.push({ ...row, portion: 'partial', status: 'paid', amount: entry.partial.paid, paidMonth: dueMonth })
        }
        if (entry.partial.month === month) {
          rows.push({ ...row, portion: 'remainder', amount: entry.amount - entry.partial.paid,
            status: entry.partial.settled ? 'paid' : 'scheduled',
            paidMonth: entry.partial.settled ? entry.partial.paidMonth ?? month : null })
        }
      } else {
        const actual = entry.paymentMonth ?? dueMonth
        const planned = data.payments[key]?.checklistMonth ?? (entry.status === 'paid' && actual < dueMonth ? dueMonth : actual)
        if (planned === month && entry.amount > 0) {
          rows.push({ ...row, status: entry.status, amount: entry.amount, paidMonth: entry.status === 'paid' ? actual : null })
        }
      }
    }
  }
  return rows
}

export function markCommitmentPaid(data, row, month, today) {
  const paidMonth = today.slice(0, 7)
  const previous = data.payments[row.key]
  let payment
  if (row.portion === 'remainder') {
    if (paidMonth < row.dueMonth) throw new Error('Check the date of the original partial payment before settling the remainder.')
    payment = { ...previous, partial: { ...previous.partial, settled: true, paidMonth } }
  } else {
    payment = { ...previous, status: 'paid', amount: row.amount, checklistMonth: month }
    if (paidMonth === row.dueMonth) delete payment.paymentMonth
    else payment.paymentMonth = paidMonth
  }
  return { ...data, payments: { ...data.payments, [row.key]: payment } }
}

export function spendingChecklist(data, month) {
  return data.categories.flatMap(item => {
    const entry = categoryMonth(data, item, month)
    if (!entry || entry.spent === 0) return []
    const key = paymentKey(item.id, month)
    return [{ key, item, amount: entry.spent, transferred: data.spending[key]?.transferred === true }]
  })
}
