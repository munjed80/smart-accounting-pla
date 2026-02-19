/**
 * Local-first storage service for recurring costs / subscriptions.
 * All data is persisted in localStorage under the key zzp_recurring_costs_v1.
 * No network calls are made.
 */

export interface RecurringCost {
  id: string
  name: string
  amount_cents: number
  interval: 'monthly' | 'quarterly' | 'yearly'
  start_date: string
  contract_months?: number | null
  vat_rate: 0 | 9 | 21
  notice_days?: number | null
  auto_renew: boolean
  notes?: string | null
  created_at: string
  updated_at: string
}

export type RecurringCostInput = Omit<RecurringCost, 'id' | 'created_at' | 'updated_at'>

const STORAGE_KEY = 'zzp_recurring_costs_v1'

const loadAll = (): RecurringCost[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as RecurringCost[]
  } catch {
    return []
  }
}

const persist = (items: RecurringCost[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export const recurringCostsService = {
  list: (): RecurringCost[] => loadAll(),

  create: (data: RecurringCostInput): RecurringCost => {
    const items = loadAll()
    const now = new Date().toISOString()
    const item: RecurringCost = {
      ...data,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    }
    persist([...items, item])
    return item
  },

  update: (id: string, data: Partial<RecurringCostInput>): RecurringCost | null => {
    const items = loadAll()
    const index = items.findIndex(i => i.id === id)
    if (index === -1) return null
    const updated: RecurringCost = {
      ...items[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    }
    items[index] = updated
    persist(items)
    return updated
  },

  delete: (id: string): boolean => {
    const items = loadAll()
    const filtered = items.filter(i => i.id !== id)
    if (filtered.length === items.length) return false
    persist(filtered)
    return true
  },
}
