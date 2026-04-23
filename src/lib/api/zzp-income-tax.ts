// ============================================================================
// ZZP Inkomstenbelasting (Income Tax) API
// ============================================================================
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

export interface IncomeTaxWarning {
  id: string
  severity: 'error' | 'warning' | 'info'
  title: string
  description: string
  action_hint?: string
  related_route?: string
}

export interface IncomeTaxCostBreakdown {
  category: string
  label: string
  amount_cents: number
  count: number
}

export interface IncomeTaxHoursIndicator {
  total_hours: number
  target_hours: number
  percentage: number
  data_available: boolean
  note: string
}

export interface IncomeTaxChecklistItem {
  id: string
  label: string
  done: boolean
  severity: 'info' | 'warning' | 'error'
  hint?: string
}

export interface IncomeTaxYearOverview {
  year: number
  year_start: string
  year_end: string
  filing_deadline: string
  omzet_cents: number
  kosten_cents: number
  winst_cents: number
  invoice_count: number
  paid_invoice_count: number
  draft_invoice_count: number
  unpaid_invoice_count: number
  expense_count: number
  cost_breakdown: IncomeTaxCostBreakdown[]
  hours_indicator: IncomeTaxHoursIndicator
  warnings: IncomeTaxWarning[]
  checklist: IncomeTaxChecklistItem[]
  is_complete: boolean
  completeness_notes: string[]
  generated_at: string
}

export interface IncomeTaxResponse {
  overview: IncomeTaxYearOverview
  available_years: number[]
  profile_complete: boolean
  kvk_number: string | null
  btw_number: string | null
}

export const zzpIncomeTaxApi = {
  getOverview: async (year?: number): Promise<IncomeTaxResponse> => {
    const params: Record<string, string> = {}
    if (year) params.year = String(year)
    const response = await api.get<IncomeTaxResponse>('/zzp/income-tax', { params })
    return response.data
  },
}
