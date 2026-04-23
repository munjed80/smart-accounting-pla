// ============================================================================
// Accountant APIs (Master Dashboard, Client Assignments, Consent, Permission
// Scopes, accountantApi, accountantClientApi)
// ----------------------------------------------------------------------------
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.
// ============================================================================

import { api } from '../api'

// ============ Accountant Master Dashboard Types ============

export interface VATDeadlineInfo {
  client_id: string
  client_name: string
  period_name: string
  deadline_date: string
  days_remaining: number
  status: string
}

export interface AlertSeverityCounts {
  critical: number
  warning: number
  info: number
}

export interface DashboardSummary {
  total_clients: number
  clients_with_red_issues: number
  clients_in_review: number
  upcoming_vat_deadlines_7d: number
  upcoming_vat_deadlines_14d: number
  upcoming_vat_deadlines_30d: number
  document_backlog_total: number
  alerts_by_severity: AlertSeverityCounts
  vat_deadlines: VATDeadlineInfo[]
  generated_at: string
}

export interface ClientStatusCard {
  id: string
  name: string
  kvk_number: string | null
  btw_number: string | null
  last_activity_at: string | null
  open_period_status: string | null
  open_period_name: string | null
  red_issue_count: number
  yellow_issue_count: number
  documents_needing_review_count: number
  backlog_age_max_days: number | null
  vat_anomaly_count: number
  next_vat_deadline: string | null
  days_to_vat_deadline: number | null
  readiness_score: number
  has_critical_alerts: boolean
  needs_immediate_attention: boolean
}

export interface ClientsListResponse {
  clients: ClientStatusCard[]
  total_count: number
  filtered_count: number
  sort_by: string
  sort_order: string
  filters_applied: string[]
  generated_at: string
}

export interface BulkOperationResultItem {
  client_id: string
  client_name: string
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  result_data: Record<string, unknown> | null
  error_message: string | null
  processed_at: string
}

export interface BulkOperationResponse {
  id: string
  operation_type: string
  status: string
  initiated_by_id: string
  initiated_by_name: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  total_clients: number
  processed_clients: number
  successful_clients: number
  failed_clients: number
  error_message: string | null
  results: BulkOperationResultItem[]
  message: string
}

export interface BulkRecalculateRequest {
  client_ids?: string[]
  filters?: Record<string, unknown>
  force?: boolean
  stale_only?: boolean
  idempotency_key?: string
}

export interface BulkAckYellowRequest {
  client_ids?: string[]
  filters?: Record<string, unknown>
  issue_codes?: string[]
  notes?: string
  idempotency_key?: string
}

export interface BulkGenerateVatDraftRequest {
  client_ids?: string[]
  filters?: Record<string, unknown>
  period_year: number
  period_quarter: number
  idempotency_key?: string
}

export interface BulkSendRemindersRequest {
  client_ids?: string[]
  filters?: Record<string, unknown>
  reminder_type: string
  title: string
  message: string
  due_date?: string
  idempotency_key?: string
}

export interface BulkLockPeriodRequest {
  client_ids?: string[]
  filters?: Record<string, unknown>
  period_year: number
  period_quarter: number
  confirm_irreversible: boolean
  idempotency_key?: string
}

// ============ Accountant Bulk API Endpoints ============
// Single source of truth for all bulk endpoint paths
export const ACCOUNTANT_BULK_ENDPOINTS = {
  recalculate: '/accountant/bulk/recalculate',
  ackYellow: '/accountant/bulk/ack-yellow',
  generateVatDraft: '/accountant/bulk/generate-vat-draft',
  sendReminders: '/accountant/bulk/send-reminders',
  lockPeriod: '/accountant/bulk/lock-period',
  operations: '/accountant/bulk/operations',
  operationById: (id: string) => `/accountant/bulk/operations/${id}`,
} as const

// Accountant Master Dashboard API
export const accountantMasterDashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    const response = await api.get<DashboardSummary>('/accountant/dashboard/summary')
    return response.data
  },

  getClients: async (
    sort?: string,
    order?: string,
    filters?: string[]
  ): Promise<ClientsListResponse> => {
    const params: Record<string, unknown> = {}
    if (sort) params.sort = sort
    if (order) params.order = order
    if (filters && filters.length > 0) params.filter = filters
    const response = await api.get<ClientsListResponse>('/accountant/dashboard/clients', { params })
    return response.data
  },

  bulkRecalculate: async (request: BulkRecalculateRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.recalculate, request)
    return response.data
  },

  bulkAckYellow: async (request: BulkAckYellowRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.ackYellow, request)
    return response.data
  },

  bulkGenerateVatDraft: async (request: BulkGenerateVatDraftRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.generateVatDraft, request)
    return response.data
  },

  bulkSendReminders: async (request: BulkSendRemindersRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.sendReminders, request)
    return response.data
  },

  bulkLockPeriod: async (request: BulkLockPeriodRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.lockPeriod, request)
    return response.data
  },

  getBulkOperation: async (operationId: string): Promise<BulkOperationResponse> => {
    const response = await api.get<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.operationById(operationId))
    return response.data
  },

  listBulkOperations: async (limit?: number, operationType?: string): Promise<{ operations: BulkOperationResponse[], total_count: number }> => {
    const params: Record<string, unknown> = {}
    if (limit) params.limit = limit
    if (operationType) params.operation_type = operationType
    const response = await api.get<{ operations: BulkOperationResponse[], total_count: number }>(ACCOUNTANT_BULK_ENDPOINTS.operations, { params })
    return response.data
  },
}

// ============ Client Assignment Types ============

export interface AccountantClientListItem {
  id: string
  email: string
  name: string
  status: string
  last_activity: string | null
  open_red_count: number
  open_yellow_count: number
  administration_id: string | null
  administration_name: string | null
}

export interface AccountantClientListResponse {
  clients: AccountantClientListItem[]
  total_count: number
}

export interface AccountantAssignmentByEmailRequest {
  client_email: string
}

export interface AccountantAssignmentResponse {
  id: string
  accountant_id: string
  accountant_name: string
  administration_id: string
  administration_name: string
  is_primary: boolean
  assigned_at: string
  assigned_by_name: string | null
  notes: string | null
}

export interface AccountantAssignmentsListResponse {
  assignments: AccountantAssignmentResponse[]
  total_count: number
}

// ============ Client Consent Workflow Types ============

export interface InviteClientRequest {
  email: string
}

export interface InviteClientResponse {
  assignment_id: string
  status: string  // PENDING or ACTIVE
  client_name: string
  client_email: string
  message: string
}

export interface ClientLink {
  assignment_id: string
  client_user_id: string
  client_email: string
  client_name: string
  administration_id: string
  administration_name: string
  status: 'PENDING' | 'ACTIVE' | 'REVOKED'
  invited_by: 'ACCOUNTANT' | 'ADMIN'
  assigned_at: string
  approved_at: string | null
  revoked_at: string | null
  open_red_count: number
  open_yellow_count: number
}

export interface ClientLinksResponse {
  links: ClientLink[]
  pending_count: number
  active_count: number
  total_count: number
}



export interface MandateItem {
  id: string
  accountant_user_id: string
  client_user_id: string
  client_company_id: string
  client_company_name: string
  accountant_name?: string | null
  accountant_email?: string | null
  status: 'pending' | 'approved' | 'rejected' | 'revoked'
  created_at: string
  updated_at: string
}

export interface MandateListResponse {
  mandates: MandateItem[]
  total_count: number
}

export interface MandateActionResponse {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'revoked'
  message: string
}

// ============ Permission Scopes Types ============

export type PermissionScope = 
  | 'invoices'
  | 'customers'
  | 'expenses'
  | 'hours'
  | 'documents'
  | 'bookkeeping'
  | 'settings'
  | 'vat'
  | 'reports'

export const ALL_SCOPES: PermissionScope[] = [
  'invoices',
  'customers',
  'expenses',
  'hours',
  'documents',
  'bookkeeping',
  'settings',
  'vat',
  'reports'
]

export interface ClientScopesResponse {
  client_id: string
  client_name: string
  scopes: PermissionScope[]
  available_scopes: PermissionScope[]
}

export interface UpdateScopesRequest {
  scopes: PermissionScope[]
}

export interface UpdateScopesResponse {
  client_id: string
  scopes: PermissionScope[]
  message: string
}

export interface ScopesSummary {
  total_scopes: number
  granted_scopes: PermissionScope[]
  missing_scopes: PermissionScope[]
}

export interface ClientLinkWithScopes extends ClientLink {
  scopes: PermissionScope[]
  scopes_summary: ScopesSummary | null
}

export interface ClientLinksWithScopesResponse {
  links: ClientLinkWithScopes[]
  pending_count: number
  active_count: number
  total_count: number
}

export interface ScopeMissingError {
  code: 'SCOPE_MISSING'
  message: string
  required_scope: string
  granted_scopes: string[]
}

export interface PendingLinkRequest {
  assignment_id: string
  accountant_id: string
  accountant_email: string
  accountant_name: string
  administration_id: string
  administration_name: string
  invited_at: string
}

export interface ZZPLinksResponse {
  pending_requests: PendingLinkRequest[]
  total_count: number
}

export interface ApproveLinkResponse {
  assignment_id: string
  status: string  // ACTIVE
  approved_at: string
  message: string
}

export interface RejectLinkResponse {
  assignment_id: string
  status: string  // REVOKED
  revoked_at: string
  message: string
}

export interface ActiveAccountantLink {
  assignment_id: string
  accountant_id: string
  accountant_email: string
  accountant_name: string
  administration_id: string
  administration_name: string
  approved_at: string | null
}

export interface ZZPActiveLinksResponse {
  active_links: ActiveAccountantLink[]
  total_count: number
}

// Accountant Client Assignment API with Consent
export const accountantApi = {
  /**
   * Invite a ZZP client by email (self-serve, creates PENDING assignment)
   */
  inviteClient: async (request: InviteClientRequest): Promise<InviteClientResponse> => {
    const response = await api.post<InviteClientResponse>('/accountant/clients/invite', request)
    return response.data
  },

  /**
   * Get list of client links with consent status (PENDING + ACTIVE)
   */
  getClientLinks: async (): Promise<ClientLinksResponse> => {
    const response = await api.get<ClientLinksResponse>('/accountant/clients/links')
    return response.data
  },

  /**
   * Get list of client links with scopes summary
   */
  getClientLinksWithScopes: async (): Promise<ClientLinksWithScopesResponse> => {
    const response = await api.get<ClientLinksWithScopesResponse>('/accountant/clients/links/scopes')
    return response.data
  },

  /**
   * Get permission scopes for a specific client
   */
  getClientScopes: async (clientId: string): Promise<ClientScopesResponse> => {
    const response = await api.get<ClientScopesResponse>(`/accountant/clients/${clientId}/scopes`)
    return response.data
  },

  /**
   * Update permission scopes for a specific client (admin only)
   */
  updateClientScopes: async (clientId: string, request: UpdateScopesRequest): Promise<UpdateScopesResponse> => {
    const response = await api.put<UpdateScopesResponse>(`/accountant/clients/${clientId}/scopes`, request)
    return response.data
  },

  createMandateByEmail: async (email: string): Promise<MandateActionResponse> => {
    const response = await api.post<MandateActionResponse>('/accountant/mandates/by-email', { email })
    return response.data
  },

  getMandates: async (): Promise<MandateListResponse> => {
    const response = await api.get<MandateListResponse>('/accountant/mandates')
    return response.data
  },

  revokeMandate: async (mandateId: string): Promise<MandateActionResponse> => {
    const response = await api.delete<MandateActionResponse>(`/accountant/mandates/${mandateId}`)
    return response.data
  },

  /**
   * Get comprehensive audit logs for a client with filters
   */
  getClientAuditLogs: async (
    clientId: string, 
    filters?: ComprehensiveAuditLogFilters
  ): Promise<ComprehensiveAuditLogListResponse> => {
    const response = await api.get<ComprehensiveAuditLogListResponse>(
      `/accountant/clients/${clientId}/audit/logs`,
      { params: filters }
    )
    return response.data
  },
}

// Accountant Client Assignment API (legacy endpoints)
export const accountantClientApi = {
  /**
   * Get list of clients assigned to the current accountant
   */
  listClients: async (): Promise<AccountantClientListResponse> => {
    const response = await api.get<AccountantClientListResponse>('/accountant/clients')
    return response.data
  },
  
  /**
   * Get list of assignments for the current accountant
   */
  listAssignments: async (): Promise<AccountantAssignmentsListResponse> => {
    const response = await api.get<AccountantAssignmentsListResponse>('/accountant/assignments')
    return response.data
  },

  /**
   * Assign a client by their email address
   */
  assignByEmail: async (request: AccountantAssignmentByEmailRequest): Promise<AccountantAssignmentResponse> => {
    const response = await api.post<AccountantAssignmentResponse>('/accountant/assignments/by-email', request)
    return response.data
  },

  /**
   * Remove an assignment
   */
  removeAssignment: async (assignmentId: string): Promise<void> => {
    await api.delete(`/accountant/assignments/${assignmentId}`)
  },

  /**
   * Get work queue summary for a specific client
   */
  getWorkQueueSummary: async (clientId: string): Promise<WorkQueueSummaryResponse> => {
    const response = await api.get<WorkQueueSummaryResponse>(`/accountant/clients/${clientId}/work-queue/summary`)
    return response.data
  },
}
