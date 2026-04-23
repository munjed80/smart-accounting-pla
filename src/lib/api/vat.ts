// ============ VAT API (types + functions) ============
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

export interface VATBox {
  box_code: string
  box_name: string
  turnover_amount: string
  vat_amount: string
  transaction_count: number
}

export interface VATAnomaly {
  id: string
  code: string
  severity: 'RED' | 'YELLOW'
  title: string
  description: string
  suggested_fix?: string
  amount_discrepancy?: string
}

export interface ICPEntry {
  customer_vat_number: string
  country_code: string
  customer_name?: string | null
  customer_id?: string | null
  taxable_base: string
  transaction_count: number
}

export interface VATReportResponse {
  period_id: string
  period_name: string
  start_date: string
  end_date: string
  generated_at: string
  boxes: Record<string, VATBox>
  total_turnover: string
  total_vat_payable: string
  total_vat_receivable: string
  net_vat: string
  anomalies: VATAnomaly[]
  has_red_anomalies: boolean
  has_yellow_anomalies: boolean
  icp_entries: ICPEntry[]
  total_icp_supplies: string
}

export interface ICPReportResponse {
  period_id: string
  period_name: string
  entries: ICPEntry[]
  total_supplies: string
  total_customers: number
}

export interface VATValidationResponse {
  period_id: string
  period_name: string
  anomalies: VATAnomaly[]
  total_anomalies: number
  red_count: number
  yellow_count: number
  is_valid: boolean
  message: string
}

export interface VATSubmission {
  id: string
  administration_id: string
  period_id: string
  submission_type: 'BTW' | 'ICP'
  created_at: string
  created_by: string
  method: 'PACKAGE' | 'DIGIPOORT'
  status: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'REJECTED'
  reference_text?: string
  attachment_url?: string
  submitted_at?: string
  updated_at: string
}

export interface VATSubmissionListResponse {
  submissions: VATSubmission[]
  total_count: number
}

export const vatApi = {
  getReport: async (clientId: string, periodId: string): Promise<VATReportResponse> => {
    const response = await api.get<VATReportResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/reports/vat`,
      { params: { allow_draft: true } }
    )
    return response.data
  },

  getICPReport: async (clientId: string, periodId: string): Promise<ICPReportResponse> => {
    const response = await api.get<ICPReportResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/reports/vat/icp`
    )
    return response.data
  },

  validate: async (clientId: string, periodId: string): Promise<VATValidationResponse> => {
    const response = await api.post<VATValidationResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/vat/validate`
    )
    return response.data
  },

  downloadPdf: async (clientId: string, periodId: string): Promise<Blob> => {
    const response = await api.get(
      `/accountant/clients/${clientId}/periods/${periodId}/reports/vat.pdf`,
      { responseType: 'blob' }
    )
    return response.data as Blob
  },

  downloadBtwSubmissionPackage: async (clientId: string, periodId: string): Promise<Blob> => {
    const response = await api.post(
      `/accountant/clients/${clientId}/tax/btw/submission-package`,
      { period_id: periodId },
      { responseType: 'blob' }
    )
    return response.data as Blob
  },

  downloadIcpSubmissionPackage: async (clientId: string, periodId: string): Promise<Blob> => {
    const response = await api.post(
      `/accountant/clients/${clientId}/tax/icp/submission-package`,
      { period_id: periodId },
      { responseType: 'blob' }
    )
    return response.data as Blob
  },

  listSubmissions: async (clientId: string, periodId?: string): Promise<VATSubmissionListResponse> => {
    const params = periodId ? { period_id: periodId } : {}
    const response = await api.get<VATSubmissionListResponse>(
      `/accountant/clients/${clientId}/vat/submissions`,
      { params }
    )
    return response.data
  },

  markSubmitted: async (clientId: string, submissionId: string, referenceText: string, attachmentUrl?: string): Promise<VATSubmission> => {
    const response = await api.post<VATSubmission>(
      `/accountant/clients/${clientId}/vat/submissions/${submissionId}/mark-submitted`,
      { reference_text: referenceText, attachment_url: attachmentUrl }
    )
    return response.data
  },
}
