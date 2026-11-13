import { createClient } from '@supabase/supabase-js'
import { demoBudget, emptyBudget } from './budget.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase = url && key ? createClient(url, key) : null
export const incompleteConfig = Boolean(url) !== Boolean(key)
const localKey = 'dfc-budget-map:v1'
const conflict = 'The saved budget changed in another tab or device. Close this editor and reload the budget before saving again.'

function readLocal() {
  return JSON.parse(localStorage.getItem(localKey) ?? 'null')
}

export async function loadBudget(user, today) {
  if (!user) return readLocal() ?? { budget: demoBudget(today), revision: 0, demo: true }
  const { data, error } = await supabase.from('budget_workspaces')
    .select('budget, revision').eq('user_id', user.id).maybeSingle()
  if (error) throw error
  return data ?? { budget: emptyBudget(), revision: 0 }
}

export async function saveBudget(user, snapshot, budget, demo = snapshot.demo) {
  const revision = snapshot.revision + 1
  if (!user) {
    if ((readLocal()?.revision ?? 0) !== snapshot.revision) throw new Error(conflict)
    const next = { budget, demo, revision }
    localStorage.setItem(localKey, JSON.stringify(next))
    return next
  }

  const table = supabase.from('budget_workspaces')
  const request = snapshot.revision === 0
    ? table.insert({ user_id: user.id, budget, revision })
    : table.update({ budget, revision }).eq('user_id', user.id).eq('revision', snapshot.revision)
  const { data, error } = await request.select('budget, revision').maybeSingle()
  if (error?.code === '23505' || (!error && !data)) throw new Error(conflict)
  if (error) throw error
  return data
}
