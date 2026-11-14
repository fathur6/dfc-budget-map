import { active, incomeSourceTypes } from './budget.js'

const validMonth = month => typeof month === 'string' && /^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$/.test(month)
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
      && record(entry) && validateEntry(entry)
      && (active(item, month) || (allowOneOff && entry.oneOff === true))
  })
}

export function readBackup(text) {
  let file
  try { file = JSON.parse(text) } catch { throw invalidBackup() }
  const budget = file?.budget
  if (file?.format !== 'dfc-budget-map' || file.version !== 1 || !record(budget)
    || (budget.income !== null && !validAmount(budget.income))
    || !record(budget.incomeByMonth)
    || !Object.entries(budget.incomeByMonth).every(([month, value]) => validMonth(month) && (value === null || validAmount(value)))
    || (budget.incomeSourcesByMonth !== undefined && (!record(budget.incomeSourcesByMonth)
      || !Object.entries(budget.incomeSourcesByMonth).every(([month, sources]) => validMonth(month)
        && Array.isArray(sources) && sources.every(source => record(source)
          && incomeSourceTypes.includes(source.type) && validAmount(source.amount) && source.amount > 0
          && typeof source.name === 'string' && source.name.length <= 65))))
    || !validateItems(budget.commitments, item => validAmount(item.amount) && item.amount > 0
      && Number.isInteger(item.day) && item.day >= 1 && item.day <= 31
      && typeof item.category === 'string' && item.category.length <= 40
      && (item.provisional === undefined || typeof item.provisional === 'boolean'))
    || !validateItems(budget.categories, item => validAmount(item.planned))
    || !validateEntries(budget.payments, budget.commitments, item =>
      (item.status === undefined || ['paid', 'missed'].includes(item.status))
      && (item.paymentMonth === undefined || (validMonth(item.paymentMonth) && item.status !== 'missed'))
      && (item.oneOff === undefined || (item.oneOff === true && validAmount(item.amount)))
      && (item.day === undefined || (Number.isInteger(item.day) && item.day >= 1 && item.day <= 31))
      && (item.amount === undefined || validAmount(item.amount)), true)
    || !validateEntries(budget.spending, budget.categories, item =>
      (item.planned == null || validAmount(item.planned)) && (item.spent == null || validAmount(item.spent)))
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
