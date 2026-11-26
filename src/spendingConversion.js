import { active, addMonths, commitmentCategories, dueDate, paymentKey, spendingReviewKey, validDate, validMonth } from './budget.js'

export function spendingConversionPlan(data, item, today) {
  const entries = Object.entries(data.spending).flatMap(([key, value]) => {
    const [id, month] = key.split(':')
    return id === item.id ? [{ ...value, key, month }] : []
  }).sort((a, b) => a.month.localeCompare(b.month))
  const linked = data.commitments.find(commitment => commitment.spendingSourceId === item.id)
  const reviewed = new Set(Object.entries(data.spendingConfirmations ?? {}).filter(([month, review]) =>
    active(item, month) && review === spendingReviewKey(data, month)).map(([month]) => month))
  const current = today.slice(0, 7)
  const end = item.end || '2100-12'
  const linkedFrom = linked?.spendingSourceFrom ?? linked?.start
  const latest = linkedFrom && linkedFrom <= end ? addMonths(linkedFrom, -1) : end
  const first = entries.find(entry => entry.month <= latest && entry.spent != null)?.month ?? item.start
  const currentAvailable = current >= item.start && current <= latest
  const amount = entries.findLast(entry => entry.month <= current && entry.spent > 0)?.spent
    ?? entries.find(entry => entry.spent > 0)?.spent
  return { entries, reviewed, current, first, latest, currentAvailable, available: item.start <= latest, amount, linked, linkedFrom }
}

export function isSpendingHistory(plan, entry, today, day, renewalMonth) {
  return entry.month < plan.current || (entry.month === plan.current
    && (renewalMonth > plan.current || (day > 0 && dueDate(entry.month, day) < today)))
    || entry.transferred || plan.reviewed.has(entry.month)
}

export function convertSpendingToCommitment(data, { itemId, start, amount, day, category, frequency = 'monthly', renewalDate }, today) {
  const item = data.categories.find(entry => entry.id === itemId)
  if (!item) throw new Error('This spending item is no longer available.')
  const plan = spendingConversionPlan(data, item, today)
  if (!plan.available || !validMonth(start) || start < item.start || start > plan.latest) {
    throw new Error('Choose an eligible start month for this spending item.')
  }
  const yearly = !plan.linked && frequency === 'yearly'
  const renewalMonth = yearly && validDate(renewalDate) ? renewalDate.slice(0, 7) : undefined
  if (!plan.linked) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 999999999
      || !commitmentCategories.includes(category)) throw new Error('Enter a valid amount and commitment category.')
    if (!['monthly', 'yearly'].includes(frequency)) throw new Error('Choose monthly or yearly billing.')
    if (yearly) {
      if (!renewalMonth || renewalDate < today || renewalMonth < start) {
        throw new Error('Choose a renewal date on or after today and no earlier than the transfer month.')
      }
      if (item.end && renewalMonth > item.end) throw new Error('Choose a renewal date within this item’s last month, or update its last month first.')
    } else if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error('Enter a due day from 1 to 31.')
    }
  }

  const id = plan.linked?.id ?? crypto.randomUUID()
  const dueDay = plan.linked?.day ?? (yearly ? Number(renewalDate.slice(-2)) : day)
  const commitment = { id, name: item.name, category, start: renewalMonth ?? start, end: item.end,
    amount, day: dueDay, spendingSourceId: item.id, spendingSourceFrom: start,
    ...(!yearly && start <= plan.current && { scheduleFrom: today }),
    ...(yearly && { frequency }) }
  const spending = { ...data.spending }
  const payments = { ...data.payments }
  const keepSource = plan.entries.some(entry => entry.month < start && entry.spent != null)
  const moving = plan.entries.filter(entry => entry.month >= start && entry.month <= plan.latest)
  const historyMonths = new Set(moving.filter(entry => entry.spent != null
    && isSpendingHistory(plan, entry, today, dueDay, renewalMonth)).map(entry => entry.month))
  for (const month of plan.reviewed) {
    if (!plan.linked && !yearly && month >= start && month >= plan.current) historyMonths.add(month)
  }
  const movedByMonth = new Map(moving.map(entry => [entry.month, entry]))
  for (const month of historyMonths) {
    const key = paymentKey(id, month)
    if (payments[key]) throw new Error('A commitment entry already exists for a month being moved. Review it before transferring.')
    const entry = movedByMonth.get(month)
    payments[key] = { amount: entry?.spent ?? 0, status: entry?.transferred ? 'paid' : 'recorded', oneOff: true,
      ...(entry?.transferred && { spendingTransferred: true }) }
  }
  for (const entry of plan.entries) {
    if (entry.month >= start && entry.month <= plan.latest) {
      if ((plan.linked || frequency === 'monthly') && entry.spent != null && !historyMonths.has(entry.month)) {
        const key = paymentKey(id, entry.month)
        if (payments[key]) throw new Error('A commitment entry already exists for a month being moved. Review it before transferring.')
        payments[key] = { amount: entry.spent, ...(plan.linked && { oneOff: true }) }
      }
      delete spending[entry.key]
    } else if (!keepSource) delete spending[entry.key]
  }
  const categories = data.categories.flatMap(source => {
    if (source.id !== item.id) return [source]
    return keepSource ? [{ ...source, end: addMonths(start, -1) }] : []
  })
  const commitments = plan.linked
    ? data.commitments.map(existing => existing.id === id ? { ...existing, spendingSourceFrom: start } : existing)
    : [...data.commitments, commitment]
  const next = { ...data, commitments, categories, payments, spending }
  if (plan.reviewed.size) {
    next.spendingConfirmations = { ...data.spendingConfirmations }
    for (const month of plan.reviewed) next.spendingConfirmations[month] = spendingReviewKey(next, month)
  }
  return next
}
