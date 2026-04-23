// ============================================================================
// ZZP BTW Aangifte API (Self-service VAT overview)
// ============================================================================
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

export interface BTWVatRateBreakdown {
  vat_rate: string
  omzet_cents: number
  vat_cents: number
  transaction_count: number
}

export interface BTWInvoiceSummary {
  total_count: number
  paid_count: number
  sent_count: number
  draft_count: number
  total_omzet_cents: number
  total_vat_cents: number
}

export interface BTWExpenseSummary {
  total_count: number
  total_amount_cents: number
  total_vat_deductible_cents: number
}

export interface BTWWarning {
  id: string
  severity: 'error' | 'warning' | 'info'
  title: string
  description: string
  action_hint?: string
  related_route?: string
}

export interface BTWQuarterOverview {
  quarter: string
  quarter_start: string
  quarter_end: string
  deadline: string
  days_until_deadline: number
  basis: string
  omzet_cents: number
  output_vat_cents: number
  input_vat_cents: number
  net_vat_cents: number
  unpaid_vat_cents: number
  vat_rate_breakdown: BTWVatRateBreakdown[]
  invoice_summary: BTWInvoiceSummary
  expense_summary: BTWExpenseSummary
  warnings: BTWWarning[]
  is_ready: boolean
  readiness_notes: string[]
  data_status: 'NO_DATA' | 'ONLY_DRAFTS' | 'ONLY_UNPAID' | 'ONLY_INVOICES' | 'ONLY_EXPENSES' | 'COMPLETE' | 'ERROR'
  data_status_reason: string
  generated_at: string
}

export interface BTWAangifteResponse {
  current_quarter: BTWQuarterOverview
  previous_quarters: BTWQuarterOverview[]
  profile_complete: boolean
  btw_number: string | null
}

export const zzpBtwApi = {
  getOverview: async (year?: number, quarter?: number): Promise<BTWAangifteResponse> => {
    const params: Record<string, string> = {}
    if (year) params.year = String(year)
    if (quarter) params.quarter = String(quarter)
    const response = await api.get<BTWAangifteResponse>('/zzp/btw-aangifte', { params })
    return response.data
  },

  downloadXml: async (year?: number, quarter?: number): Promise<void> => {
    const params: Record<string, string> = {}
    if (year) params.year = String(year)
    if (quarter) params.quarter = String(quarter)
    const response = await api.get('/zzp/btw-aangifte/xml', {
      params,
      responseType: 'blob',
    })
    const blob = new Blob([response.data as BlobPart], { type: 'application/xml' })
    const disposition = (response.headers as Record<string, string>)['content-disposition'] || ''
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/)
    const filename = filenameMatch ? filenameMatch[1] : `btw-overzicht.xml`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
}
