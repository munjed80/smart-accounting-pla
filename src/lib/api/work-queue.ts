// ============ Work Queue / Reminder / Evidence Pack APIs (types + functions) ============
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

// ============ Work Queue Summary Types ============

export interface DocumentReviewItem {
  id: string
  date: string | null
  type: string
  status: string
  vendor_customer: string | null
  amount: number | null
  link: string
}

export interface DocumentReviewSection {
  count: number
  top_items: DocumentReviewItem[]
}

export interface BankTransactionItem {
  id: string
  date: string
  description: string
  amount: number
  confidence_best_proposal: number | null
  link: string
}

export interface BankReconciliationSection {
  count: number
  top_items: BankTransactionItem[]
}

export interface VATActionsSection {
  current_period_status: string | null
  periods_needing_action_count: number
  btw_link: string
}

export interface OverdueInvoiceItem {
  id: string
  customer: string
  due_date: string
  amount: number
  link: string
}

export interface RemindersSection {
  count: number
  top_items: OverdueInvoiceItem[]
}

export interface IntegrityWarningItem {
  id: string
  severity: string
  message: string
  link: string
}

export interface IntegrityWarningsSection {
  count: number
  top_items: IntegrityWarningItem[]
}

export interface WorkQueueSummaryResponse {
  document_review: DocumentReviewSection
  bank_reconciliation: BankReconciliationSection
  vat_actions: VATActionsSection
  reminders: RemindersSection
  integrity_warnings: IntegrityWarningsSection
  generated_at: string
}

// ============ Work Queue Types ============

export interface WorkQueueCounts {
  red_issues: number
  needs_review: number
  vat_due: number
  stale: number
}

export interface ReadinessBreakdown {
  base_score: number
  deductions: Array<{
    reason: string
    count?: number
    penalty: number
    days_remaining?: number
    days_inactive?: number
  }>
  final_score: number
}

export interface WorkQueueItem {
  client_id: string
  client_name: string
  period_id: string | null
  period_status: string | null
  work_item_type: 'ISSUE' | 'VAT' | 'BACKLOG' | 'ALERT' | 'PERIOD_REVIEW' | 'STALE'
  severity: 'CRITICAL' | 'RED' | 'WARNING' | 'YELLOW' | 'INFO' | null
  title: string
  description: string
  suggested_next_action: string
  due_date: string | null
  age_days: number | null
  counts: {
    red: number
    yellow: number
    backlog: number
  }
  readiness_score: number
  readiness_breakdown: ReadinessBreakdown | null
  staleness_days?: number
}

export interface WorkQueueResponse {
  items: WorkQueueItem[]
  total_count: number
  returned_count: number
  queue_type: string
  counts: WorkQueueCounts
  sort_by: string
  sort_order: string
  generated_at: string
}

export interface SLASummaryResponse {
  total_violations: number
  critical_count: number
  warning_count: number
  by_type: Record<string, { critical: number; warning: number }>
  escalation_events_today: number
  policy: Record<string, number>
  generated_at: string
}

// ============ Reminder Types ============

export interface ReminderResponse {
  id: string
  administration_id: string
  reminder_type: string
  title: string
  message: string
  channel: 'IN_APP' | 'EMAIL'
  status: 'PENDING' | 'SCHEDULED' | 'SENT' | 'FAILED'
  due_date: string | null
  scheduled_at: string | null
  sent_at: string | null
  created_at: string | null
  send_error: string | null
}

export interface ReminderSendRequest {
  client_ids: string[]
  reminder_type: string
  title: string
  message: string
  channel?: 'IN_APP' | 'EMAIL'
  due_date?: string
  template_id?: string
  variables?: Record<string, unknown>
}

export interface ReminderScheduleRequest extends ReminderSendRequest {
  scheduled_at: string
}

export interface ReminderHistoryResponse {
  reminders: ReminderResponse[]
  total_count: number
  limit: number
  offset: number
}

// ============ Evidence Pack Types ============

export interface EvidencePackResponse {
  id: string
  administration_id: string
  period_id: string
  pack_type: 'VAT_EVIDENCE' | 'AUDIT_TRAIL'
  created_at: string | null
  file_size_bytes: number | null
  checksum: string
  download_count: number
  metadata: {
    administration_name?: string
    kvk_number?: string
    btw_number?: string
    period_name?: string
    period_status?: string
    generated_at?: string
  } | null
}

export interface EvidencePackListResponse {
  packs: EvidencePackResponse[]
  total_count: number
  limit: number
  offset: number
}

// ============ Work Queue API ============

export const workQueueApi = {
  getWorkQueue: async (
    queue?: 'red' | 'review' | 'vat_due' | 'stale' | 'all',
    limit?: number,
    sort?: string,
    order?: 'asc' | 'desc'
  ): Promise<WorkQueueResponse> => {
    const params: Record<string, unknown> = {}
    if (queue) params.queue = queue
    if (limit) params.limit = limit
    if (sort) params.sort = sort
    if (order) params.order = order
    const response = await api.get<WorkQueueResponse>('/accountant/work-queue', { params })
    return response.data
  },

  getSLASummary: async (): Promise<SLASummaryResponse> => {
    const response = await api.get<SLASummaryResponse>('/accountant/dashboard/sla-summary')
    return response.data
  },
}

// ============ Reminder API ============

export const reminderApi = {
  send: async (request: ReminderSendRequest): Promise<ReminderResponse[]> => {
    const response = await api.post<ReminderResponse[]>('/accountant/reminders/send', request)
    return response.data
  },

  schedule: async (request: ReminderScheduleRequest): Promise<ReminderResponse[]> => {
    const response = await api.post<ReminderResponse[]>('/accountant/reminders/schedule', request)
    return response.data
  },

  getHistory: async (clientId?: string, limit?: number, offset?: number): Promise<ReminderHistoryResponse> => {
    const params: Record<string, unknown> = {}
    if (clientId) params.client_id = clientId
    if (limit) params.limit = limit
    if (offset) params.offset = offset
    const response = await api.get<ReminderHistoryResponse>('/accountant/reminders/history', { params })
    return response.data
  },
}

// ============ Evidence Pack API ============

export const evidencePackApi = {
  generate: async (
    clientId: string,
    periodId: string,
    packType?: 'VAT_EVIDENCE' | 'AUDIT_TRAIL'
  ): Promise<EvidencePackResponse> => {
    const params: Record<string, unknown> = {}
    if (packType) params.pack_type = packType
    const response = await api.post<EvidencePackResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/evidence-pack`,
      {},
      { params }
    )
    return response.data
  },

  download: async (packId: string): Promise<Blob> => {
    const response = await api.get(`/accountant/evidence-packs/${packId}/download`, {
      responseType: 'blob'
    })
    return response.data
  },

  list: async (
    clientId?: string,
    periodId?: string,
    limit?: number,
    offset?: number
  ): Promise<EvidencePackListResponse> => {
    const params: Record<string, unknown> = {}
    if (clientId) params.client_id = clientId
    if (periodId) params.period_id = periodId
    if (limit) params.limit = limit
    if (offset) params.offset = offset
    const response = await api.get<EvidencePackListResponse>('/accountant/evidence-packs', { params })
    return response.data
  },
}
