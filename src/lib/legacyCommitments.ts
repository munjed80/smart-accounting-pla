import type { ZZPCommitmentCreate } from './api'

export interface LegacyCommitmentCandidate {
  key: string
  name: string
  payload: ZZPCommitmentCreate
}

// These old keys have no owner identifier. Never import or render their content
// automatically: the signed-in user must review and confirm ownership first.
export function hasLegacyCommitments(): boolean {
  return ['zzp_recurring_costs_v1', 'zzp_leases_loans_v1'].some(key => {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]').length > 0 } catch { return false }
  })
}

export function readLegacyCommitments(): LegacyCommitmentCandidate[] {
  const result: LegacyCommitmentCandidate[] = []
  for (const [storageKey, source] of [['zzp_recurring_costs_v1', 'recurring'], ['zzp_leases_loans_v1', 'lease_loan']] as const) {
    let rows: unknown
    try { rows = JSON.parse(localStorage.getItem(storageKey) ?? '[]') } catch { continue }
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(row.id) || typeof row.name !== 'string') continue
      const key = `${source}:${row.id}`
      const recurring = source === 'recurring'
      const amount = recurring ? row.amount_cents : row.payment_cents
      if (!Number.isInteger(amount) || amount <= 0) continue
      result.push({ key, name: row.name, payload: {
        legacy_source_key: key, type: recurring ? 'subscription' : row.type,
        name: row.name, amount_cents: amount,
        monthly_payment_cents: recurring ? undefined : amount,
        principal_amount_cents: recurring ? undefined : row.principal_cents,
        remaining_balance_override_cents: recurring ? undefined : row.remaining_cents ?? undefined,
        interest_rate: recurring ? undefined : row.interest_rate_percent ?? undefined,
        recurring_frequency: recurring ? row.interval : row.payment_interval,
        start_date: row.start_date, end_date: row.end_date ?? undefined,
        contract_term_months: row.contract_months ?? undefined,
        vat_rate: recurring ? row.vat_rate : row.type === 'lease' ? 21 : 0,
        notice_period_days: row.notice_days ?? undefined, auto_renew: row.auto_renew ?? false,
        notes: row.notes ?? undefined,
      } })
    }
  }
  return result
}
