import { active, addMonths, commitmentCategories, paymentKey, spendingReviewKey, validMonth } from './budget.js'

export function spendingConversionPlan(data, item, today) {
  const entries = Object.entries(data.spending).flatMap(([key, value]) => {
    const [id, month] = key.split(':')
    return id === item.id ? [{ ...value, key, month }] : []
  }).sort((a, b) => a.month.localeCompare(b.month))
  const linked = data.commitments.find(commitment => commitment.spendingSourceId === item.id)
  const protectedMonths = [
    ...entries.filter(entry => entry.transferred).map(entry => entry.month),
    ...Object.entries(data.spendingConfirmations ?? {}).filter(([month, review]) =>
      active(item, month) && review === spendingReviewKey(data, month)).map(([month]) => month),
  ]
  const nextMonth = addMonths(today.slice(0, 7), 1)
  const start = [nextMonth, item.start, ...protectedMonths.map(month => addMonths(month, 1))].sort().at(-1)
  const available = !linked && validMonth(start) && active(item, start)
  const amount = entries.findLast(entry => entry.month <= start && entry.spent > 0)?.spent
  return { entries, start, available, amount, linked }
}

export function convertSpendingToCommitment(data, { itemId, start, amount, day, category, frequency = 'monthly' }, today) {
  const item = data.categories.find(entry => entry.id === itemId)
  if (!item) throw new Error('This spending item is no longer available.')
  const plan = spendingConversionPlan(data, item, today)
  if (!plan.available || !validMonth(start) || start < plan.start || !active(item, start)) {
    throw new Error('Choose an eligible start month after the spending history.')
  }
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 999999999 || !Number.isInteger(day) || day < 1 || day > 31
    || !commitmentCategories.includes(category)) throw new Error('Enter a valid amount, due day and commitment category.')
  if (!['monthly', 'yearly'].includes(frequency)) throw new Error('Choose monthly or yearly billing.')

  const id = crypto.randomUUID()
  const commitment = { id, name: item.name, category, start, end: item.end, amount, day, spendingSourceId: item.id,
    ...(frequency === 'yearly' && { frequency }) }
  const spending = { ...data.spending }
  const payments = { ...data.payments }
  for (const entry of plan.entries) {
    if (entry.month < start) continue
    if (frequency === 'monthly' && entry.spent != null) payments[paymentKey(id, entry.month)] = { amount: entry.spent }
    delete spending[entry.key]
  }
  const categories = data.categories.flatMap(source => {
    if (source.id !== item.id) return [source]
    return start > item.start ? [{ ...source, end: addMonths(start, -1) }] : []
  })
  return { ...data, commitments: [...data.commitments, commitment], categories, payments, spending }
}
