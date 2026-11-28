import { active, addMonths, incomeSourceTypes, spendingCategories, validDate, validMonth } from './budget.js'
import { validSavingsJars } from './savings.js'

const validAmount = value => Number.isSafeInteger(value) && value >= 0 && value <= 999999999
const record = value => value && typeof value === 'object' && !Array.isArray(value)
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id)
const invalidBackup = () => new Error('This file is not a valid DFC Budget Map backup.')

function validateItems(items, validValues) {
  if (!Array.isArray(items)) return false
  const ids = new Set()
  return items.every(item => {
    if (!record(item) || !validId(item.id) || ids.has(item.id)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 65
      || !validMonth(item.start) || (item.end !== '' && (!validMonth(item.end) || item.end < item.start))
      || !validValues(item)) return false
    ids.add(item.id)
    return true
  })
}

function validateEntries(map, items, validateEntry, allowOneOff = false) {
  if (!record(map)) return false
  const ids = new Map(items.map(item => [item.id, item]))
  return Object.entries(map).every(([key, entry]) => {
    const [id, month, extra] = key.split(':')
    const item = ids.get(id)
    return item && extra === undefined && validMonth(month)
      && record(entry) && validateEntry(entry, month)
      && (active(item, month) || (allowOneOff && entry.oneOff === true))
  })
}

function validAllocations(partial, total) {
  if (partial.allocations === undefined) return partial.paid > 0
  return !partial.settled && Array.isArray(partial.allocations) && partial.allocations.length > 0
    && partial.allocations.every(entry => record(entry) && validAmount(entry.amount) && entry.amount > 0
      && validDate(entry.date) && validMonth(entry.month)
      && (entry.checklistMonth === undefined || validMonth(entry.checklistMonth))
      && [entry.date.slice(0, 7), addMonths(entry.date.slice(0, 7), 1)].includes(entry.month))
    && partial.allocations.reduce((sum, entry) => sum + entry.amount, partial.paid) <= total
}

export function readBackup(text) {
  let file
  try { file = JSON.parse(text) } catch { throw invalidBackup() }
  const budget = file?.budget
  if (file?.format !== 'dfc-budget-map' || file.version !== 1 || !record(budget)
    || (budget.income !== null && !validAmount(budget.income))
    || !record(budget.incomeByMonth)
    || !Object.entries(budget.incomeByMonth).every(([month, value]) => validMonth(month) && (value === null || validAmount(value)))
    || (budget.salaryReceipts !== undefined && (!record(budget.salaryReceipts)
      || !Object.entries(budget.salaryReceipts).every(([month, date]) => validMonth(month) && validDate(date)
        && [date.slice(0, 7), addMonths(date.slice(0, 7), 1)].includes(month))))
    || (budget.incomeSourcesByMonth !== undefined && (!record(budget.incomeSourcesByMonth)
      || !Object.entries(budget.incomeSourcesByMonth).every(([month, sources]) => validMonth(month)
        && Array.isArray(sources) && sources.every(source => record(source)
          && incomeSourceTypes.includes(source.type) && validAmount(source.amount) && source.amount > 0
          && typeof source.name === 'string' && source.name.length <= 65))))
    || !validateItems(budget.commitments, item => validAmount(item.amount) && item.amount > 0
      && Number.isInteger(item.day) && item.day >= 1 && item.day <= 31
      && typeof item.category === 'string' && item.category.length <= 40
      && (item.frequency === undefined || ['monthly', 'yearly'].includes(item.frequency))
      && (item.spendingSourceId === undefined || validId(item.spendingSourceId))
      && (item.spendingSourceFrom === undefined || (item.spendingSourceId && validMonth(item.spendingSourceFrom)))
      && (item.scheduleFrom === undefined || validDate(item.scheduleFrom))
      && (item.provisional === undefined || typeof item.provisional === 'boolean'))
    || !validateItems(budget.categories, item => item.category === undefined || spendingCategories.includes(item.category))
    || !validateEntries(budget.payments, budget.commitments, (item, month) =>
      (item.status === undefined || ['paid', 'missed', 'recorded'].includes(item.status))
      && (item.status !== 'recorded' || (item.oneOff === true && item.paymentMonth === undefined))
      && (item.spendingTransferred === undefined || (item.spendingTransferred === true && item.oneOff === true
        && ['recorded', 'paid'].includes(item.status) && item.amount > 0
        && item.paymentMonth === undefined && item.paidDate === undefined && item.checklistMonth === undefined))
      && (item.paymentMonth === undefined || (validMonth(item.paymentMonth) && item.status !== 'missed'))
      && (item.checklistMonth === undefined || (validMonth(item.checklistMonth) && item.status === 'paid'))
      && (item.paidDate === undefined || (item.status === 'paid' && validDate(item.paidDate)
        && item.paidDate.slice(0, 7) === (item.paymentMonth ?? month)))
      && (item.partial === undefined || (record(item.partial)
        && item.status === undefined && item.paymentMonth === undefined && validAmount(item.amount)
        && validAmount(item.partial.paid) && item.partial.paid < item.amount && validAllocations(item.partial, item.amount)
        && validMonth(item.partial.month) && (item.partial.allocations ? item.partial.month >= month : item.partial.month > month)
        && typeof item.partial.settled === 'boolean'
        && (item.partial.paidMonth === undefined || (item.partial.settled
          && validMonth(item.partial.paidMonth) && item.partial.paidMonth >= month))
        && (item.partial.paidDate === undefined || (item.partial.settled && validDate(item.partial.paidDate)
          && item.partial.paidDate.slice(0, 7) === (item.partial.paidMonth ?? item.partial.month)))))
      && (item.oneOff === undefined || (item.oneOff === true && validAmount(item.amount)))
      && (item.day === undefined || (Number.isInteger(item.day) && item.day >= 1 && item.day <= 31))
      && (item.amount === undefined || validAmount(item.amount)), true)
    || !validateEntries(budget.spending, budget.categories, item =>
      (item.spent == null || validAmount(item.spent))
      && (item.transferred === undefined || (item.transferred === true && item.spent > 0)))
    || (budget.spendingConfirmations !== undefined && (!record(budget.spendingConfirmations)
      || !Object.entries(budget.spendingConfirmations).every(([month, value]) => validMonth(month) && typeof value === 'string')))
    || (budget.openingCash !== undefined && (!record(budget.openingCash) || !validMonth(budget.openingCash.month)
      || !Number.isSafeInteger(budget.openingCash.amount) || !validAmount(Math.abs(budget.openingCash.amount))))
    || (budget.savingsJars !== undefined && !validSavingsJars(budget.savingsJars))
    || (budget.notes !== undefined && (!Array.isArray(budget.notes)
      || !budget.notes.every(note => typeof note === 'string' && note.length <= 1500)))) throw invalidBackup()
  return budget
}

export function downloadBackup(budget) {
  const blob = new Blob([JSON.stringify({ format: 'dfc-budget-map', version: 1, budget }, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = 'dfc-budget.private.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
