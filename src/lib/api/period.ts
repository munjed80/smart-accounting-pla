// ============ Period Control API (types + functions) ============
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

// ============ Period Control Types ============

export type PeriodStatus = 'OPEN' | 'REVIEW' | 'FINALIZED' | 'LOCKED' | 'READY_FOR_FILING'

export interface Period {
  id: string
  administration_id: string
  name: string
  period_type: string
  start_date: string
  end_date: string
  status: PeriodStatus
  is_closed: boolean
  created_at: string
  closed_at: string | null
  review_started_at: string | null
  finalized_at: string | null
  locked_at: string | null
  review_started_by_id: string | null
  finalized_by_id: string | null
  locked_by_id: string | null
}

export interface ValidationIssue {
  id: string
  code: string
  title: string
  severity: 'RED' | 'YELLOW'
}

export interface ValidationStatus {
  red_issues: ValidationIssue[]
  yellow_issues: ValidationIssue[]
  can_finalize: boolean
  validation_summary: string
}

export interface PeriodWithValidation {
  period: Period
  validation: ValidationStatus
}

export interface PeriodsListResponse {
  administration_id: string
  periods: Period[]
  total_count: number
}

export interface ReviewPeriodRequest {
  notes?: string
}

export interface ReviewPeriodResponse {
  period: Period
  validation_run_id: string
  issues_found: number
  message: string
}

export interface FinalizePeriodRequest {
  acknowledged_yellow_issues?: string[]
  notes?: string
}

export interface FinalizePeriodResponse {
  period: Period
  snapshot_id: string
  message: string
}

export interface LockPeriodRequest {
  confirm_irreversible: boolean
  notes?: string
}

export interface LockPeriodResponse {
  period: Period
  message: string
}

export interface UpdatePeriodStatusRequest {
  status: 'READY_FOR_FILING' | 'FINALIZED'
}

export interface UpdatePeriodStatusResponse {
  period: Period
  message: string
}

export interface SnapshotSummary {
  total_assets: number
  total_liabilities: number
  total_equity: number
  net_income: number
  total_ar: number
  total_ap: number
  vat_payable: number
  vat_receivable: number
}

export interface PeriodSnapshot {
  id: string
  period_id: string
  administration_id: string
  snapshot_type: string
  created_at: string
  created_by_id: string
  summary: SnapshotSummary
  balance_sheet: Record<string, unknown> | null
  profit_and_loss: Record<string, unknown> | null
  vat_summary: Record<string, unknown> | null
  open_ar_balances: Record<string, unknown> | null
  open_ap_balances: Record<string, unknown> | null
  trial_balance: Record<string, unknown> | null
  acknowledged_yellow_issues: string[] | null
  issue_summary: Record<string, unknown> | null
}

export interface AuditLogEntry {
  id: string
  period_id: string
  administration_id: string
  action: string
  from_status: string | null
  to_status: string | null
  performed_by_id: string
  performed_at: string
  notes: string | null
  snapshot_id: string | null
}

export interface PeriodAuditLogsResponse {
  period_id: string
  logs: AuditLogEntry[]
  total_count: number
}

// Period Control API
export const periodApi = {
  listPeriods: async (
    clientId: string, 
    status?: PeriodStatus[]
  ): Promise<PeriodsListResponse> => {
    const params: Record<string, unknown> = {}
    if (status && status.length > 0) {
      params.status = status
    }
    const response = await api.get<PeriodsListResponse>(
      `/accountant/clients/${clientId}/periods`,
      { params }
    )
    return response.data
  },

  getPeriod: async (clientId: string, periodId: string): Promise<PeriodWithValidation> => {
    const response = await api.get<PeriodWithValidation>(
      `/accountant/clients/${clientId}/periods/${periodId}`
    )
    return response.data
  },

  startReview: async (
    clientId: string, 
    periodId: string, 
    request: ReviewPeriodRequest = {}
  ): Promise<ReviewPeriodResponse> => {
    const response = await api.post<ReviewPeriodResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/review`,
      request
    )
    return response.data
  },

  finalizePeriod: async (
    clientId: string, 
    periodId: string, 
    request: FinalizePeriodRequest = {}
  ): Promise<FinalizePeriodResponse> => {
    const response = await api.post<FinalizePeriodResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/finalize`,
      request
    )
    return response.data
  },

  lockPeriod: async (
    clientId: string, 
    periodId: string, 
    request: LockPeriodRequest
  ): Promise<LockPeriodResponse> => {
    const response = await api.post<LockPeriodResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/lock`,
      request
    )
    return response.data
  },

  updateStatus: async (
    clientId: string,
    periodId: string,
    request: UpdatePeriodStatusRequest
  ): Promise<UpdatePeriodStatusResponse> => {
    const response = await api.patch<UpdatePeriodStatusResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}`,
      request
    )
    return response.data
  },

  getSnapshot: async (clientId: string, periodId: string): Promise<PeriodSnapshot> => {
    const response = await api.get<PeriodSnapshot>(
      `/accountant/clients/${clientId}/periods/${periodId}/snapshot`
    )
    return response.data
  },

  getAuditLogs: async (
    clientId: string, 
    periodId: string, 
    limit = 50
  ): Promise<PeriodAuditLogsResponse> => {
    const response = await api.get<PeriodAuditLogsResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/audit-logs`,
      { params: { limit } }
    )
    return response.data
  },
}
