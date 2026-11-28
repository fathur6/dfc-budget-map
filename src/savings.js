import { validDate, validMonth } from './budget.js'

const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value)
const validMoney = value => Number.isSafeInteger(value) && value >= 0 && value <= 999999999
const validText = (value, limit) => typeof value === 'string' && value.length <= limit
const record = value => value && typeof value === 'object' && !Array.isArray(value)
const amountChange = entry => entry.type === 'withdrawal' ? -entry.amount : entry.amount
const ordered = entries => entries.slice().sort((a, b) => a.date.localeCompare(b.date))

function validEntry(entry) {
  return record(entry) && validId(entry.id) && validMoney(entry.amount) && entry.amount > 0
    && validDate(entry.date) && (entry.type === 'opening'
      ? entry.month === undefined
      : ['deposit', 'withdrawal'].includes(entry.type) && validMonth(entry.month))
}

function nonnegativeHistory(entries) {
  let balance = 0
  return ordered(entries).every(entry => {
    balance += amountChange(entry)
    return balance >= 0
  })
}

function validJar(jar) {
  return record(jar) && validId(jar.id) && validText(jar.name, 65) && jar.name.trim()
    && validText(jar.purpose, 180) && validText(jar.bank, 65) && jar.bank.trim() && validText(jar.account, 65)
    && validMonth(jar.startMonth) && validMoney(jar.goal) && jar.goal > 0
    && validMoney(jar.monthlyAmount) && validMoney(jar.reserve)
    && typeof jar.simulatorEnabled === 'boolean' && typeof jar.archived === 'boolean'
    && record(jar.plans) && Object.entries(jar.plans).every(([month, amount]) => validMonth(month) && validMoney(amount))
    && Array.isArray(jar.entries) && jar.entries.every(validEntry)
    && new Set(jar.entries.map(entry => entry.id)).size === jar.entries.length
    && jar.entries.filter(entry => entry.type === 'opening').length <= 1
    && nonnegativeHistory(jar.entries)
}

export function validSavingsJars(jars) {
  return Array.isArray(jars) && jars.every(validJar) && new Set(jars.map(jar => jar.id)).size === jars.length
}

export function saveSavingsJar(data, jar) {
  if (!validJar(jar)) throw new Error('Check the jar settings and amounts.')
  const jars = data.savingsJars ?? []
  return { ...data, savingsJars: jars.some(item => item.id === jar.id)
    ? jars.map(item => item.id === jar.id ? jar : item) : [...jars, jar] }
}

export function saveSavingsEntry(data, id, entry, today) {
  const jar = data.savingsJars?.find(item => item.id === id)
  if (!jar || !validEntry(entry) || entry.date > today) {
    throw new Error('Enter a positive amount and a date of today or earlier.')
  }
  const exists = jar.entries.some(item => item.id === entry.id)
  if (jar.archived && !exists) throw new Error('Restore this jar to add a transaction.')
  const entries = exists ? jar.entries.map(item => item.id === entry.id ? entry : item) : [...jar.entries, entry]
  if (!nonnegativeHistory(entries)) throw new Error('This transaction would make the jar balance negative.')
  return saveSavingsJar(data, { ...jar, entries })
}

export function removeSavingsEntry(data, jar, entryId) {
  const entries = jar.entries.filter(entry => entry.id !== entryId)
  if (!nonnegativeHistory(entries)) throw new Error('Removing this entry would make the jar balance negative.')
  return saveSavingsJar(data, { ...jar, entries })
}

export function savingsBalance(jar, today) {
  return jar.entries.reduce((balance, entry) => entry.date <= today ? balance + amountChange(entry) : balance, 0)
}

export function savingsTransferRows(jars, month, today) {
  return jars.flatMap(jar => {
    const deposited = jar.entries.reduce((sum, entry) => sum + (entry.type === 'deposit'
      && entry.month === month && entry.date <= today ? entry.amount : 0), 0)
    if (!deposited && (jar.archived || month < jar.startMonth)) return []
    const planned = jar.archived ? 0 : jar.plans[month] ?? jar.monthlyAmount
    return [{ jar, planned, deposited, remaining: Math.max(0, planned - deposited) }]
  })
}

function confirmedFlows(jars, today) {
  const flows = new Map()
  for (const jar of jars) {
    for (const entry of jar.entries) {
      if (entry.type === 'opening' || entry.date > today) continue
      flows.set(entry.month, (flows.get(entry.month) ?? 0) - amountChange(entry))
    }
  }
  return flows
}

export function savingsFlow(jars, month, today) {
  return confirmedFlows(jars, today).get(month) ?? 0
}

export function projectSavingsSupport(jars, months, today) {
  const eligible = jars.filter(jar => jar.simulatorEnabled && !jar.archived)
  if (!eligible.length || !months.length || months.some(month => month.balance == null || month.baseline == null)) return null
  const flows = confirmedFlows(jars, today)
  const run = key => {
    const balances = eligible.map(jar => ({ id: jar.id, name: jar.name, reserve: jar.reserve,
      balance: savingsBalance(jar, today), used: 0 }))
    const impacts = months.flatMap(month => {
      const cash = month[key] + (flows.get(month.month) ?? 0)
      if (cash >= 0) return []
      let shortfall = -cash
      const draws = []
      for (const jar of balances) {
        const amount = Math.min(shortfall, Math.max(0, jar.balance - jar.reserve))
        if (!amount) continue
        shortfall -= amount
        jar.balance -= amount
        jar.used += amount
        draws.push({ id: jar.id, name: jar.name, amount, balance: jar.balance })
      }
      return [{ month: month.month, cash, shortfall, draws }]
    })
    return { impacts, jars: balances, used: balances.reduce((sum, jar) => sum + jar.used, 0) }
  }
  return { before: run('baseline'), after: run('balance') }
}
