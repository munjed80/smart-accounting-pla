import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

// Determine API_BASE_URL based on environment
// In DEV mode: Allow fallback to localhost for development convenience
// In PROD mode: VITE_API_URL must be set and must NOT point to localhost
const isDev = import.meta.env.DEV
const envApiUrl = import.meta.env.VITE_API_URL as string | undefined

// Normalize URL: trim whitespace and remove trailing slash
const normalizeBaseUrl = (url: string | undefined): string => {
  if (!url) return ''
  return url.trim().replace(/\/+$/, '')
}

// Check if the URL points to localhost by parsing the hostname
const isLocalhostUrl = (url: string | undefined): boolean => {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('127.')
  } catch {
    // If URL parsing fails, fall back to string check
    return url.includes('localhost') || url.includes('127.0.0.1')
  }
}

// Normalize the env URL first (handles whitespace)
const normalizedEnvApiUrl = envApiUrl ? normalizeBaseUrl(envApiUrl) : undefined

// Determine if API is misconfigured (production with localhost or missing URL)
// Uses normalized URL to ensure consistent validation
const checkMisconfiguration = (): { isMisconfigured: boolean; reason: string } => {
  if (isDev) {
    // In DEV mode, anything goes (including localhost)
    return { isMisconfigured: false, reason: '' }
  }
  
  // In PROD mode, VITE_API_URL must be set and must NOT point to localhost
  if (!normalizedEnvApiUrl || normalizedEnvApiUrl === '') {
    return { 
      isMisconfigured: true, 
      reason: 'VITE_API_URL environment variable is not set. The frontend cannot call the API.' 
    }
  }
  
  if (isLocalhostUrl(normalizedEnvApiUrl)) {
    return { 
      isMisconfigured: true, 
      reason: `VITE_API_URL is set to "${normalizedEnvApiUrl}" which points to localhost. In production, this must be the actual API URL (e.g., https://api.zzpershub.nl).` 
    }
  }
  
  return { isMisconfigured: false, reason: '' }
}

// Compute API_BASE_URL with /api/v1 suffix
// In DEV: use env var or fallback to localhost:8000
// In PROD: use env var (misconfiguration check already validates this)
// If misconfigured in PROD, we still set the URL (possibly localhost) so the UI can display it,
// but the misconfiguration banner will warn users
// NOTE: All API routes are mounted under /api/v1, so we include it in the base URL
const API_BASE_URL = isDev 
  ? `${normalizeBaseUrl(envApiUrl || 'http://localhost:8000')}/api/v1`
  : `${normalizedEnvApiUrl || 'http://api-not-configured.invalid'}/api/v1`

// Store misconfiguration result
const misconfigurationCheck = checkMisconfiguration()

// Export API base for display purposes
export const getApiBaseUrl = () => API_BASE_URL

// Export misconfiguration status for UI display
export const isApiMisconfigured = () => misconfigurationCheck.isMisconfigured

// Export the reason for misconfiguration
export const getApiMisconfigurationReason = () => misconfigurationCheck.reason

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
  withCredentials: true,
})

// Add request interceptor to fail fast if API is misconfigured
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // In production, if API is misconfigured, reject requests immediately with clear error
    if (misconfigurationCheck.isMisconfigured) {
      return Promise.reject(new Error(`API Configuration Error: ${misconfigurationCheck.reason}`))
    }
    
    const token = localStorage.getItem('access_token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      
      window.location.href = '/login'
      
      return Promise.reject(error)
    }

    return Promise.reject(error)
  }
)

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  full_name: string
  // Admin role is NOT allowed via public registration for security
  // Admin users can only be created via database seed
  role?: 'zzp' | 'accountant'
}

export interface User {
  id: string
  email: string
  full_name: string
  role: 'zzp' | 'accountant' | 'admin'
  is_active: boolean
  is_email_verified?: boolean
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

// New auth response interfaces
export interface RegisterResponse {
  message: string
  user_id: string
}

export interface GenericMessageResponse {
  message: string
}

export interface VerifyEmailResponse {
  message: string
  verified: boolean
}

export interface ResetPasswordRequest {
  token: string
  new_password: string
}

export interface ResetPasswordResponse {
  message: string
}

export interface EmailNotVerifiedError {
  message: string
  code: 'EMAIL_NOT_VERIFIED'
  hint: string
}

export interface TransactionStats {
  total_transactions: number
  draft_count: number
  posted_count: number
  total_debit: number
  total_credit: number
  recent_transactions: RecentTransaction[]
}

export interface RecentTransaction {
  id: string
  booking_number: string
  transaction_date: string
  description: string
  status: 'DRAFT' | 'POSTED'
  total_amount: number
}

export interface TransactionLine {
  id: string
  ledger_account_code: string
  ledger_account_name: string
  debit_amount: number
  credit_amount: number
  vat_code: string | null
  description: string
}

export interface Transaction {
  id: string
  booking_number: string
  transaction_date: string
  description: string
  status: 'DRAFT' | 'POSTED'
  total_amount: number
  document_id: string | null
  created_at: string
  updated_at: string | null
  created_by_name: string | null
  updated_by_name: string | null
  ai_confidence_score: number | null
  lines: TransactionLine[]
}

export interface TransactionListItem {
  id: string
  booking_number: string
  transaction_date: string
  description: string
  status: 'DRAFT' | 'POSTED'
  total_amount: number
  created_by_name: string | null
  ai_confidence_score: number | null
}

export interface TransactionUpdateRequest {
  transaction_date?: string
  description?: string
  lines?: Omit<TransactionLine, 'id'>[]
}

export const authApi = {
  login: async (credentials: LoginRequest): Promise<TokenResponse> => {
    const formData = new URLSearchParams()
    formData.append('username', credentials.username)
    formData.append('password', credentials.password)

    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] POST /auth/token ->', `${API_BASE_URL}/auth/token`)
    }

    const response = await api.post<TokenResponse>('/auth/token', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    return response.data
  },

  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] POST /auth/register ->', `${API_BASE_URL}/auth/register`)
    }

    const response = await api.post<RegisterResponse>('/auth/register', data)
    return response.data
  },

  me: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me')
    return response.data
  },

  verifyEmail: async (token: string): Promise<VerifyEmailResponse> => {
    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] GET /auth/verify-email ->', `${API_BASE_URL}/auth/verify-email`)
    }

    const response = await api.get<VerifyEmailResponse>('/auth/verify-email', {
      params: { token }
    })
    return response.data
  },

  resendVerification: async (email: string): Promise<GenericMessageResponse> => {
    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] POST /auth/resend-verification ->', `${API_BASE_URL}/auth/resend-verification`)
    }

    const response = await api.post<GenericMessageResponse>('/auth/resend-verification', { email })
    return response.data
  },

  forgotPassword: async (email: string): Promise<GenericMessageResponse> => {
    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] POST /auth/forgot-password ->', `${API_BASE_URL}/auth/forgot-password`)
    }

    const response = await api.post<GenericMessageResponse>('/auth/forgot-password', { email })
    return response.data
  },

  resetPassword: async (data: ResetPasswordRequest): Promise<ResetPasswordResponse> => {
    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] POST /auth/reset-password ->', `${API_BASE_URL}/auth/reset-password`)
    }

    const response = await api.post<ResetPasswordResponse>('/auth/reset-password', data)
    return response.data
  },
}

/**
 * Health check result interface for the API connectivity test.
 */
export interface HealthCheckResult {
  success: boolean
  status: 'healthy' | 'unhealthy' | 'unreachable' | 'error'
  message: string
  details?: string
  responseTime?: number
}

/**
 * Test API connectivity by calling the /ops/health endpoint.
 * Returns detailed information about the connection status and any failures.
 */
export const checkApiHealth = async (): Promise<HealthCheckResult> => {
  const startTime = Date.now()
  
  try {
    const response = await api.get('/ops/health', { timeout: 10000 })
    const responseTime = Date.now() - startTime
    
    const healthData = response.data
    const isHealthy = healthData?.status === 'healthy'
    
    return {
      success: isHealthy,
      status: isHealthy ? 'healthy' : 'unhealthy',
      message: isHealthy 
        ? `API is healthy (${responseTime}ms)` 
        : `API reports unhealthy status: ${healthData?.status || 'unknown'}`,
      details: healthData?.components 
        ? `Components: ${Object.entries(healthData.components)
            .map(([k, v]) => `${k}: ${(v as { status: string })?.status || 'unknown'}`)
            .join(', ')}`
        : undefined,
      responseTime,
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    
    if (axios.isAxiosError(error)) {
      // Log detailed error for debugging
      logApiError(error, 'Health Check')
      
      // Network error - could be CORS, TLS, DNS, or connectivity
      if (error.message === 'Network Error') {
        return {
          success: false,
          status: 'unreachable',
          message: 'Cannot reach API server',
          details: `Failed to connect to ${API_BASE_URL}. Possible causes: CORS policy blocking the request, invalid/expired TLS certificate, DNS resolution failure, or the server is down.`,
          responseTime,
        }
      }
      
      // Timeout
      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          status: 'unreachable',
          message: 'API request timed out',
          details: `Request to ${API_BASE_URL}/health timed out after ${responseTime}ms. The server may be overloaded or unresponsive.`,
          responseTime,
        }
      }
      
      // Server responded with an error status
      if (error.response) {
        return {
          success: false,
          status: 'error',
          message: `API returned error: HTTP ${error.response.status}`,
          details: error.response.data?.message || error.response.statusText || 'Unknown error',
          responseTime,
        }
      }
    }
    
    // Generic error
    return {
      success: false,
      status: 'error',
      message: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      responseTime,
    }
  }
}

export const transactionApi = {
  getStats: async (): Promise<TransactionStats> => {
    const response = await api.get<TransactionStats>('/transactions/stats')
    return response.data
  },

  getAll: async (status?: 'DRAFT' | 'POSTED'): Promise<TransactionListItem[]> => {
    const params = status ? { status } : {}
    const response = await api.get<TransactionListItem[]>('/transactions', { params })
    return response.data
  },

  getById: async (id: string): Promise<Transaction> => {
    const response = await api.get<Transaction>(`/transactions/${id}`)
    return response.data
  },

  update: async (id: string, data: TransactionUpdateRequest): Promise<Transaction> => {
    const response = await api.put<Transaction>(`/transactions/${id}`, data)
    return response.data
  },

  approve: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/transactions/${id}/approve`)
    return response.data
  },

  reject: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/transactions/${id}/reject`)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/transactions/${id}`)
  },

  post: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/transactions/${id}/post`)
    return response.data
  },
}

export interface Administration {
  id: string
  name: string
  description: string | null
  kvk_number: string | null
  btw_number: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AdministrationCreateRequest {
  name: string
  description?: string
  kvk_number?: string
  btw_number?: string
}

export const administrationApi = {
  create: async (data: AdministrationCreateRequest): Promise<Administration> => {
    const response = await api.post<Administration>('/administrations', data)
    return response.data
  },

  list: async (): Promise<Administration[]> => {
    const response = await api.get<Administration[]>('/administrations')
    return response.data
  },

  get: async (id: string): Promise<Administration> => {
    const response = await api.get<Administration>(`/administrations/${id}`)
    return response.data
  },
}

export interface DocumentResponse {
  id: string
  administration_id: string
  original_filename: string
  mime_type: string
  file_size: number
  status: 'UPLOADED' | 'PROCESSING' | 'DRAFT_READY' | 'FAILED'
  error_message: string | null
  created_at: string
  updated_at: string
  transaction_id: string | null
}

export const documentApi = {
  upload: async (file: File, administrationId?: string): Promise<{ message: string; document_id: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    if (administrationId) {
      formData.append('administration_id', administrationId)
    }

    const response = await api.post<{ message: string; document_id: string }>(
      '/documents/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return response.data
  },

  list: async (administrationId?: string): Promise<DocumentResponse[]> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<DocumentResponse[]>('/documents', { params })
    return response.data
  },

  get: async (id: string): Promise<DocumentResponse> => {
    const response = await api.get<DocumentResponse>(`/documents/${id}`)
    return response.data
  },

  reprocess: async (id: string): Promise<DocumentResponse> => {
    const response = await api.post<DocumentResponse>(`/documents/${id}/reprocess`)
    return response.data
  },
}

// Accountant Dashboard Types
export type ClientStatus = 'GREEN' | 'YELLOW' | 'RED'
export type BTWQuarterStatus = 'ON_TRACK' | 'PENDING_DOCS' | 'DEADLINE_APPROACHING' | 'OVERDUE' | 'NOT_APPLICABLE'
export type IssueSeverity = 'ERROR' | 'WARNING' | 'INFO'
export type IssueCategory = 'MISSING_DOCUMENT' | 'PROCESSING_ERROR' | 'VALIDATION_ERROR' | 'BTW_DEADLINE' | 'UNBALANCED_TRANSACTION' | 'DRAFT_PENDING' | 'LOW_CONFIDENCE'

export interface DashboardIssue {
  id: string
  category: IssueCategory
  severity: IssueSeverity
  title: string
  description: string
  suggested_action: string
  related_entity_id: string | null
  related_entity_type: string | null
  created_at: string
}

export interface ClientOverview {
  id: string
  name: string
  kvk_number: string | null
  btw_number: string | null
  status: ClientStatus
  last_document_upload: string | null
  btw_quarter_status: BTWQuarterStatus
  current_quarter: string
  error_count: number
  warning_count: number
  issues: DashboardIssue[]
  total_transactions: number
  draft_transactions: number
  failed_documents: number
}

export interface AccountantDashboardResponse {
  total_clients: number
  clients_needing_attention: number
  clients_with_errors: number
  clients: ClientOverview[]
  global_issues: DashboardIssue[]
  generated_at: string
}

export interface ClientIssuesResponse {
  client_id: string
  client_name: string
  total_issues: number
  issues: DashboardIssue[]
}

export const accountantDashboardApi = {
  getDashboard: async (): Promise<AccountantDashboardResponse> => {
    const response = await api.get<AccountantDashboardResponse>('/accountant/dashboard')
    return response.data
  },

  getClientIssues: async (clientId: string): Promise<ClientIssuesResponse> => {
    const response = await api.get<ClientIssuesResponse>(`/accountant/dashboard/client/${clientId}/issues`)
    return response.data
  },
}

// Core Ledger API Types
export type LedgerIssueSeverity = 'RED' | 'YELLOW'

export interface LedgerClientIssue {
  id: string
  issue_code: string
  severity: LedgerIssueSeverity
  title: string
  description: string
  why: string | null
  suggested_action: string | null
  document_id: string | null
  journal_entry_id: string | null
  account_id: string | null
  fixed_asset_id: string | null
  party_id: string | null
  open_item_id: string | null
  amount_discrepancy: number | null
  is_resolved: boolean
  resolved_at: string | null
  created_at: string
}

export interface LedgerClientIssuesResponse {
  client_id: string
  client_name: string
  total_issues: number
  red_count: number
  yellow_count: number
  issues: LedgerClientIssue[]
}

export interface LedgerClientOverview {
  client_id: string
  client_name: string
  missing_docs_count: number
  error_count: number
  warning_count: number
  upcoming_deadlines: unknown[]
  total_journal_entries: number
  draft_entries_count: number
  posted_entries_count: number
  total_open_receivables: number
  total_open_payables: number
}

export interface RecalculateResponse {
  success: boolean
  validation_run_id: string
  issues_found: number
  message: string
}

export interface AccountBalance {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  debit_total: number
  credit_total: number
  balance: number
}

export interface BalanceSheetSection {
  name: string
  accounts: AccountBalance[]
  total: number
}

export interface BalanceSheetResponse {
  as_of_date: string
  current_assets: BalanceSheetSection
  fixed_assets: BalanceSheetSection
  total_assets: number
  current_liabilities: BalanceSheetSection
  long_term_liabilities: BalanceSheetSection
  equity: BalanceSheetSection
  total_liabilities_equity: number
  is_balanced: boolean
}

export interface PnLSection {
  name: string
  accounts: AccountBalance[]
  total: number
}

export interface ProfitAndLossResponse {
  start_date: string
  end_date: string
  revenue: PnLSection
  cost_of_goods_sold: PnLSection
  gross_profit: number
  operating_expenses: PnLSection
  operating_income: number
  other_income: PnLSection
  other_expenses: PnLSection
  net_income: number
}

export interface OpenItemReport {
  party_id: string
  party_name: string
  party_code: string | null
  document_number: string | null
  document_date: string
  due_date: string
  original_amount: number
  paid_amount: number
  open_amount: number
  days_overdue: number
  status: string
}

export interface SubledgerReportResponse {
  report_type: string
  as_of_date: string
  items: OpenItemReport[]
  total_original: number
  total_paid: number
  total_open: number
  overdue_amount: number
}

// Core Ledger API
export const ledgerApi = {
  getClientOverview: async (clientId: string): Promise<LedgerClientOverview> => {
    const response = await api.get<LedgerClientOverview>(`/accountant/clients/${clientId}/overview`)
    return response.data
  },

  getClientIssues: async (clientId: string, includeResolved = false): Promise<LedgerClientIssuesResponse> => {
    const response = await api.get<LedgerClientIssuesResponse>(
      `/accountant/clients/${clientId}/issues`,
      { params: { include_resolved: includeResolved } }
    )
    return response.data
  },

  recalculate: async (clientId: string, force = false): Promise<RecalculateResponse> => {
    const response = await api.post<RecalculateResponse>(
      `/accountant/clients/${clientId}/journal/recalculate`,
      { force }
    )
    return response.data
  },

  getBalanceSheet: async (clientId: string, asOfDate?: string): Promise<BalanceSheetResponse> => {
    const params = asOfDate ? { as_of_date: asOfDate } : {}
    const response = await api.get<BalanceSheetResponse>(
      `/accountant/clients/${clientId}/reports/balance-sheet`,
      { params }
    )
    return response.data
  },

  getProfitAndLoss: async (clientId: string, startDate?: string, endDate?: string): Promise<ProfitAndLossResponse> => {
    const params: Record<string, string> = {}
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate
    const response = await api.get<ProfitAndLossResponse>(
      `/accountant/clients/${clientId}/reports/pnl`,
      { params }
    )
    return response.data
  },

  getAccountsReceivable: async (clientId: string, asOfDate?: string): Promise<SubledgerReportResponse> => {
    const params = asOfDate ? { as_of_date: asOfDate } : {}
    const response = await api.get<SubledgerReportResponse>(
      `/accountant/clients/${clientId}/reports/ar`,
      { params }
    )
    return response.data
  },

  getAccountsPayable: async (clientId: string, asOfDate?: string): Promise<SubledgerReportResponse> => {
    const params = asOfDate ? { as_of_date: asOfDate } : {}
    const response = await api.get<SubledgerReportResponse>(
      `/accountant/clients/${clientId}/reports/ap`,
      { params }
    )
    return response.data
  },
}

// ============ Decision Engine Types ============

export type ActionType = 
  | 'RECLASSIFY_TO_ASSET'
  | 'CREATE_DEPRECIATION'
  | 'CORRECT_VAT_RATE'
  | 'ALLOCATE_OPEN_ITEM'
  | 'FLAG_DOCUMENT_INVALID'
  | 'LOCK_PERIOD'
  | 'REVERSE_JOURNAL_ENTRY'
  | 'CREATE_ADJUSTMENT_ENTRY'

export type DecisionType = 'APPROVED' | 'REJECTED' | 'OVERRIDDEN'
export type ExecutionStatus = 'PENDING' | 'EXECUTED' | 'FAILED' | 'ROLLED_BACK'

export interface SuggestedAction {
  id: string
  issue_id: string
  action_type: ActionType
  title: string
  explanation: string
  parameters: Record<string, unknown> | null
  confidence_score: number
  is_auto_suggested: boolean
  priority: number
  created_at: string
}

export interface IssueSuggestionsResponse {
  issue_id: string
  issue_title: string
  issue_code: string
  suggestions: SuggestedAction[]
  total_suggestions: number
}

export interface DecisionRequest {
  suggested_action_id?: string
  action_type: ActionType
  decision: DecisionType
  override_parameters?: Record<string, unknown>
  notes?: string
}

export interface DecisionResponse {
  id: string
  issue_id: string
  suggested_action_id: string | null
  action_type: ActionType
  decision: DecisionType
  override_parameters: Record<string, unknown> | null
  notes: string | null
  decided_by_id: string
  decided_at: string
  execution_status: ExecutionStatus
  executed_at: string | null
  execution_error: string | null
  result_journal_entry_id: string | null
  is_reversible: boolean
}

export interface DecisionHistoryItem {
  id: string
  issue_id: string
  issue_title: string
  issue_code: string
  action_type: ActionType
  decision: DecisionType
  decided_by_name: string
  decided_at: string
  execution_status: ExecutionStatus
  is_reversible: boolean
}

export interface DecisionHistoryResponse {
  client_id: string
  client_name: string
  total_decisions: number
  decisions: DecisionHistoryItem[]
}

export interface ExecutionResultResponse {
  decision_id: string
  execution_status: ExecutionStatus
  executed_at: string | null
  result_journal_entry_id: string | null
  error_message: string | null
  message: string
}

export interface DecisionPattern {
  id: string
  issue_code: string
  action_type: ActionType
  approval_count: number
  rejection_count: number
  confidence_boost: number
  last_approved_at: string | null
  last_rejected_at: string | null
}

export interface ClientPatternsResponse {
  client_id: string
  client_name: string
  patterns: DecisionPattern[]
}

// Decision Engine API
export const decisionApi = {
  getIssueSuggestions: async (issueId: string): Promise<IssueSuggestionsResponse> => {
    const response = await api.get<IssueSuggestionsResponse>(
      `/accountant/issues/${issueId}/suggestions`
    )
    return response.data
  },

  makeDecision: async (
    issueId: string, 
    request: DecisionRequest, 
    autoExecute = true
  ): Promise<DecisionResponse> => {
    const response = await api.post<DecisionResponse>(
      `/accountant/issues/${issueId}/decide`,
      request,
      { params: { auto_execute: autoExecute } }
    )
    return response.data
  },

  executeDecision: async (decisionId: string): Promise<ExecutionResultResponse> => {
    const response = await api.post<ExecutionResultResponse>(
      `/accountant/decisions/${decisionId}/execute`
    )
    return response.data
  },

  reverseDecision: async (decisionId: string, reason?: string): Promise<{ decision_id: string; reversed_at: string; message: string }> => {
    const response = await api.post<{ decision_id: string; reversed_at: string; message: string }>(
      `/accountant/decisions/${decisionId}/reverse`,
      { reason }
    )
    return response.data
  },

  getDecisionHistory: async (
    clientId: string, 
    limit = 50, 
    offset = 0
  ): Promise<DecisionHistoryResponse> => {
    const response = await api.get<DecisionHistoryResponse>(
      `/accountant/clients/${clientId}/decision-history`,
      { params: { limit, offset } }
    )
    return response.data
  },

  getDecisionPatterns: async (clientId: string): Promise<ClientPatternsResponse> => {
    const response = await api.get<ClientPatternsResponse>(
      `/accountant/clients/${clientId}/decision-patterns`
    )
    return response.data
  },
}

export interface ApiError {
  message: string
  detail?: string
  status?: number
}

/**
 * Log API error details.
 * In development: logs full axios error details (status, response body) to console.
 * In production: logs minimal info to avoid exposing sensitive data.
 */
export const logApiError = (error: unknown, context?: string): void => {
  const prefix = context ? `[${context}]` : '[API Error]'
  
  if (axios.isAxiosError(error)) {
    if (isDev) {
      // Development: log detailed error information
      console.error(`${prefix} Axios error details:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method,
        message: error.message,
        code: error.code,
      })
    } else {
      // Production: log minimal info
      console.error(`${prefix} API request failed:`, error.response?.status || error.code || 'Unknown')
    }
  } else if (error instanceof Error) {
    if (isDev) {
      console.error(`${prefix} Error:`, error.message, error.stack)
    } else {
      console.error(`${prefix} Error:`, error.message)
    }
  } else {
    console.error(`${prefix} Unknown error type`)
  }
}

/**
 * Get a detailed error message suitable for display.
 * Includes information about network, CORS, TLS, and HTTP status errors.
 */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    // Log the error with appropriate detail level
    logApiError(error)
    
    // Check for server response with error detail
    if (error.response?.data?.detail) {
      return typeof error.response.data.detail === 'string' 
        ? error.response.data.detail 
        : JSON.stringify(error.response.data.detail)
    }
    
    // Network error - could be CORS, TLS, or connectivity issue
    if (error.message === 'Network Error') {
      return `Cannot connect to server at ${API_BASE_URL}. This could be caused by: network connectivity issues, CORS misconfiguration, or invalid TLS certificate on the API server.`
    }
    
    // Timeout
    if (error.code === 'ECONNABORTED') {
      return `Request to ${API_BASE_URL} timed out. The server may be slow or unresponsive.`
    }
    
    // HTTP status errors with better messages
    const status = error.response?.status
    if (status) {
      if (status === 401) {
        return 'Authentication failed. Your credentials are incorrect or your session has expired.'
      }
      if (status === 403) {
        return 'Access denied. You do not have permission for this action.'
      }
      if (status === 404) {
        return 'The requested resource was not found on the server.'
      }
      if (status === 422) {
        return 'Invalid request data. Please check your input.'
      }
      if (status >= 500) {
        return `Server error (${status}). Please try again later or contact support.`
      }
      return `Request failed with status ${status}: ${error.response?.statusText || error.message}`
    }
    
    return error.message
  }
  
  if (error instanceof Error) {
    logApiError(error)
    return error.message
  }
  
  return 'An unexpected error occurred'
}

// ============ Document Review Queue Types ============

export type DocumentReviewStatus = 'UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'NEEDS_REVIEW' | 'POSTED' | 'REJECTED' | 'DRAFT_READY' | 'FAILED'

export type DocumentSuggestedActionType = 
  | 'ALLOCATE_OPEN_ITEM'
  | 'RECLASSIFY_TO_ASSET'
  | 'CREATE_DEPRECIATION'
  | 'MARK_DUPLICATE'
  | 'POST_AS_EXPENSE'
  | 'POST_AS_REVENUE'
  | 'NEEDS_MANUAL_REVIEW'

export interface DocumentSuggestedAction {
  id: string
  action_type: DocumentSuggestedActionType
  title: string
  explanation: string
  confidence_score: number
  parameters: Record<string, unknown> | null
  priority: number
  created_at: string
}

export interface DocumentReviewItem {
  id: string
  administration_id: string
  original_filename: string
  mime_type: string
  file_size: number
  status: DocumentReviewStatus
  error_message: string | null
  created_at: string
  updated_at: string
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: number | null
  vat_amount: number | null
  net_amount: number | null
  currency: string | null
  extraction_confidence: number | null
  matched_party_id: string | null
  matched_party_name: string | null
  matched_open_item_id: string | null
  match_confidence: number | null
  is_duplicate: boolean
  duplicate_of_id: string | null
  suggested_actions: DocumentSuggestedAction[]
  extracted_fields: Record<string, unknown>
}

export interface DocumentReviewListResponse {
  client_id: string
  client_name: string
  total_documents: number
  documents: DocumentReviewItem[]
}

export interface DocumentPostRequest {
  description?: string
  entry_date?: string
  account_id?: string
  vat_code_id?: string
  allocate_to_open_item_id?: string
  notes?: string
}

export interface DocumentPostResponse {
  document_id: string
  status: DocumentReviewStatus
  journal_entry_id: string
  message: string
  posted_at: string
  posted_by_name: string | null
}

export interface DocumentRejectRequest {
  reason: string
  notes?: string
}

export interface DocumentRejectResponse {
  document_id: string
  status: DocumentReviewStatus
  rejection_reason: string
  rejected_at: string
  rejected_by_name: string | null
  message: string
}

export interface DocumentReprocessResponse {
  document_id: string
  status: DocumentReviewStatus
  process_count: number
  message: string
}

// Closing Checklist Types
export interface ClosingChecklistItem {
  name: string
  description: string
  status: 'PASSED' | 'FAILED' | 'WARNING' | 'PENDING'
  details: string | null
  value: string | null
  required: boolean
}

export interface ClosingChecklistResponse {
  client_id: string
  client_name: string
  period_id: string
  period_name: string
  period_status: string
  can_finalize: boolean
  blocking_items: number
  warning_items: number
  items: ClosingChecklistItem[]
  documents_posted_percent: number
  documents_pending_review: number
  red_issues_count: number
  yellow_issues_count: number
  unacknowledged_yellow_count: number
  vat_report_ready: boolean
  ar_reconciled: boolean
  ap_reconciled: boolean
  assets_consistent: boolean
}

// Document Review Queue API
export const documentReviewApi = {
  listDocuments: async (
    clientId: string, 
    status?: DocumentReviewStatus
  ): Promise<DocumentReviewListResponse> => {
    const params = status ? { status } : {}
    const response = await api.get<DocumentReviewListResponse>(
      `/accountant/clients/${clientId}/documents`,
      { params }
    )
    return response.data
  },

  getDocument: async (clientId: string, documentId: string): Promise<DocumentReviewItem> => {
    const response = await api.get<DocumentReviewItem>(
      `/accountant/clients/${clientId}/documents/${documentId}`
    )
    return response.data
  },

  postDocument: async (
    clientId: string, 
    documentId: string, 
    request: DocumentPostRequest = {}
  ): Promise<DocumentPostResponse> => {
    const response = await api.post<DocumentPostResponse>(
      `/accountant/clients/${clientId}/documents/${documentId}/post`,
      request
    )
    return response.data
  },

  rejectDocument: async (
    clientId: string, 
    documentId: string, 
    request: DocumentRejectRequest
  ): Promise<DocumentRejectResponse> => {
    const response = await api.post<DocumentRejectResponse>(
      `/accountant/clients/${clientId}/documents/${documentId}/reject`,
      request
    )
    return response.data
  },

  reprocessDocument: async (
    clientId: string, 
    documentId: string
  ): Promise<DocumentReprocessResponse> => {
    const response = await api.post<DocumentReprocessResponse>(
      `/accountant/clients/${clientId}/documents/${documentId}/reprocess`
    )
    return response.data
  },

  runMatching: async (clientId: string, documentId: string): Promise<{
    document_id: string
    status: string
    is_duplicate: boolean
    match_confidence: string | null
    matched_party_id: string | null
    matched_open_item_id: string | null
    message: string
  }> => {
    const response = await api.post(
      `/accountant/clients/${clientId}/documents/${documentId}/match`
    )
    return response.data
  },

  getClosingChecklist: async (clientId: string, periodId: string): Promise<ClosingChecklistResponse> => {
    const response = await api.get<ClosingChecklistResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/closing-checklist`
    )
    return response.data
  },
}

// ============ Observability Types ============

export type AlertSeverity_Ops = 'CRITICAL' | 'WARNING' | 'INFO'

export interface Alert {
  id: string
  alert_code: string
  severity: AlertSeverity_Ops
  title: string
  message: string
  entity_type: string | null
  entity_id: string | null
  administration_id: string | null
  context: string | null
  created_at: string
  acknowledged_at: string | null
  acknowledged_by_id: string | null
  resolved_at: string | null
  resolved_by_id: string | null
  resolution_notes: string | null
  auto_resolved: boolean
}

export interface AlertListResponse {
  alerts: Alert[]
  total_count: number
  active_count: number
  acknowledged_count: number
  critical_count: number
  warning_count: number
  info_count: number
}

export interface AlertCountsResponse {
  critical: number
  warning: number
  info: number
  total: number
}

export interface AlertGroupedResponse {
  critical: Alert[]
  warning: Alert[]
  info: Alert[]
  counts: AlertCountsResponse
}

export interface HealthComponent {
  status: 'healthy' | 'unhealthy' | 'warning' | 'unknown'
  message: string | null
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  components: {
    database: HealthComponent
    redis: HealthComponent
    migrations: HealthComponent
    background_tasks: HealthComponent
  }
}

export interface MetricsSummary {
  documents_processed_today: number
  issues_created_today: number
  red_issues_active: number
  decisions_approved_today: number
  decisions_rejected_today: number
  postings_created_today: number
  failed_operations_count: number
  active_critical_alerts: number
}

export interface MetricsResponse {
  timestamp: string
  scope: 'client' | 'global'
  administration_id: string | null
  documents: {
    documents_processed_today: number
    documents_uploaded_today: number
    documents_failed_today: number
    documents_by_status: Record<string, number>
    documents_pending_review: number
    documents_in_processing: number
  }
  issues: {
    issues_created_today: { red: number; yellow: number; total: number }
    active_issues: { red: number; yellow: number; total: number }
    issues_resolved_today: number
  }
  decisions: {
    decisions_today: { approved: number; rejected: number; overridden: number; total: number }
    execution_today: { executed: number; failed: number; pending: number }
  }
  postings: {
    postings_created_today: number
    draft_entries: number
    entries_by_status: Record<string, number>
  }
  alerts: {
    active_alerts: { critical: number; warning: number; info: number; total: number }
    alerts_created_today: number
    alerts_resolved_today: number
  }
  summary: MetricsSummary
}

// Observability API
export const observabilityApi = {
  getHealth: async (): Promise<HealthResponse> => {
    const response = await api.get<HealthResponse>('/health')
    return response.data
  },

  getMetrics: async (administrationId?: string): Promise<MetricsResponse> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<MetricsResponse>('/ops/metrics', { params })
    return response.data
  },

  listAlerts: async (
    administrationId?: string,
    severity?: AlertSeverity_Ops,
    includeResolved = false,
    limit = 100
  ): Promise<AlertListResponse> => {
    const params: Record<string, unknown> = { include_resolved: includeResolved, limit }
    if (administrationId) params.administration_id = administrationId
    if (severity) params.severity = severity
    const response = await api.get<AlertListResponse>('/ops/alerts', { params })
    return response.data
  },

  getAlertsGrouped: async (administrationId?: string): Promise<AlertGroupedResponse> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<AlertGroupedResponse>('/ops/alerts/grouped', { params })
    return response.data
  },

  getAlertCounts: async (administrationId?: string): Promise<AlertCountsResponse> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<AlertCountsResponse>('/ops/alerts/counts', { params })
    return response.data
  },

  getAlert: async (alertId: string): Promise<Alert> => {
    const response = await api.get<Alert>(`/ops/alerts/${alertId}`)
    return response.data
  },

  acknowledgeAlert: async (alertId: string): Promise<Alert> => {
    const response = await api.post<Alert>(`/ops/alerts/${alertId}/acknowledge`)
    return response.data
  },

  resolveAlert: async (alertId: string, notes?: string): Promise<Alert> => {
    const response = await api.post<Alert>(`/ops/alerts/${alertId}/resolve`, { notes })
    return response.data
  },

  runAlertChecks: async (administrationId: string): Promise<AlertListResponse> => {
    const response = await api.post<AlertListResponse>(`/ops/alerts/check/${administrationId}`)
    return response.data
  },
}

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
    const response = await api.post<BulkOperationResponse>('/accountant/bulk/recalculate', request)
    return response.data
  },

  bulkAckYellow: async (request: BulkAckYellowRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>('/accountant/bulk/ack-yellow', request)
    return response.data
  },

  bulkGenerateVatDraft: async (request: BulkGenerateVatDraftRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>('/accountant/bulk/generate-vat-draft', request)
    return response.data
  },

  bulkSendReminders: async (request: BulkSendRemindersRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>('/accountant/bulk/send-reminders', request)
    return response.data
  },

  bulkLockPeriod: async (request: BulkLockPeriodRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>('/accountant/bulk/lock-period', request)
    return response.data
  },

  getBulkOperation: async (operationId: string): Promise<BulkOperationResponse> => {
    const response = await api.get<BulkOperationResponse>(`/accountant/bulk/operations/${operationId}`)
    return response.data
  },

  listBulkOperations: async (limit?: number, operationType?: string): Promise<{ operations: BulkOperationResponse[], total_count: number }> => {
    const params: Record<string, unknown> = {}
    if (limit) params.limit = limit
    if (operationType) params.operation_type = operationType
    const response = await api.get<{ operations: BulkOperationResponse[], total_count: number }>('/accountant/bulk/operations', { params })
    return response.data
  },
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
