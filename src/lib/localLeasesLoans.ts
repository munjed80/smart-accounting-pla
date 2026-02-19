/**
 * Local-first storage service for leases and loans.
 * All data is persisted in localStorage under the key zzp_leases_loans_v1.
 * No network calls are made.
 */

export interface LeaseLoan {
  id: string
  type: 'lease' | 'loan'
  name: string
  principal_cents: number
  interest_rate_percent?: number | null
  start_date: string
  end_date?: string | null
  payment_interval: 'monthly' | 'quarterly' | 'yearly'
  payment_cents?: number | null
  remaining_cents?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export type LeaseLoanInput = Omit<LeaseLoan, 'id' | 'created_at' | 'updated_at'>

const STORAGE_KEY = 'zzp_leases_loans_v1'

const loadAll = (): LeaseLoan[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as LeaseLoan[]
  } catch {
    return []
  }
}

const persist = (items: LeaseLoan[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export const leasesLoansService = {
  list: (): LeaseLoan[] => loadAll(),

  create: (data: LeaseLoanInput): LeaseLoan => {
    const items = loadAll()
    const now = new Date().toISOString()
    const item: LeaseLoan = {
      ...data,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    }
    persist([...items, item])
    return item
  },

  update: (id: string, data: Partial<LeaseLoanInput>): LeaseLoan | null => {
    const items = loadAll()
    const index = items.findIndex(i => i.id === id)
    if (index === -1) return null
    const updated: LeaseLoan = {
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
