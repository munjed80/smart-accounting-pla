import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
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
  role?: 'zzp' | 'accountant' | 'admin'
}

export interface User {
  id: string
  email: string
  full_name: string
  role: 'zzp' | 'accountant' | 'admin'
  is_active: boolean
}

export interface TokenResponse {
  access_token: string
  token_type: string
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

    const response = await api.post<TokenResponse>('/token', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    return response.data
  },

  register: async (data: RegisterRequest): Promise<User> => {
    const response = await api.post<User>('/api/v1/auth/register', data)
    return response.data
  },

  me: async (): Promise<User> => {
    const response = await api.get<User>('/api/v1/auth/me')
    return response.data
  },
}

export const transactionApi = {
  getStats: async (): Promise<TransactionStats> => {
    const response = await api.get<TransactionStats>('/api/v1/transactions/stats')
    return response.data
  },

  getAll: async (status?: 'DRAFT' | 'POSTED'): Promise<TransactionListItem[]> => {
    const params = status ? { status } : {}
    const response = await api.get<TransactionListItem[]>('/api/v1/transactions', { params })
    return response.data
  },

  getById: async (id: string): Promise<Transaction> => {
    const response = await api.get<Transaction>(`/api/v1/transactions/${id}`)
    return response.data
  },

  update: async (id: string, data: TransactionUpdateRequest): Promise<Transaction> => {
    const response = await api.put<Transaction>(`/api/v1/transactions/${id}`, data)
    return response.data
  },

  approve: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/api/v1/transactions/${id}/approve`)
    return response.data
  },

  reject: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/api/v1/transactions/${id}/reject`)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/transactions/${id}`)
  },

  post: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/api/v1/transactions/${id}/post`)
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
    const response = await api.post<Administration>('/api/v1/administrations', data)
    return response.data
  },

  list: async (): Promise<Administration[]> => {
    const response = await api.get<Administration[]>('/api/v1/administrations')
    return response.data
  },

  get: async (id: string): Promise<Administration> => {
    const response = await api.get<Administration>(`/api/v1/administrations/${id}`)
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
      '/api/v1/documents/upload',
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
    const response = await api.get<DocumentResponse[]>('/api/v1/documents', { params })
    return response.data
  },

  get: async (id: string): Promise<DocumentResponse> => {
    const response = await api.get<DocumentResponse>(`/api/v1/documents/${id}`)
    return response.data
  },

  reprocess: async (id: string): Promise<DocumentResponse> => {
    const response = await api.post<DocumentResponse>(`/api/v1/documents/${id}/reprocess`)
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
    const response = await api.get<AccountantDashboardResponse>('/api/v1/accountant/dashboard')
    return response.data
  },

  getClientIssues: async (clientId: string): Promise<ClientIssuesResponse> => {
    const response = await api.get<ClientIssuesResponse>(`/api/v1/accountant/dashboard/client/${clientId}/issues`)
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
    const response = await api.get<LedgerClientOverview>(`/api/v1/accountant/clients/${clientId}/overview`)
    return response.data
  },

  getClientIssues: async (clientId: string, includeResolved = false): Promise<LedgerClientIssuesResponse> => {
    const response = await api.get<LedgerClientIssuesResponse>(
      `/api/v1/accountant/clients/${clientId}/issues`,
      { params: { include_resolved: includeResolved } }
    )
    return response.data
  },

  recalculate: async (clientId: string, force = false): Promise<RecalculateResponse> => {
    const response = await api.post<RecalculateResponse>(
      `/api/v1/accountant/clients/${clientId}/journal/recalculate`,
      { force }
    )
    return response.data
  },

  getBalanceSheet: async (clientId: string, asOfDate?: string): Promise<BalanceSheetResponse> => {
    const params = asOfDate ? { as_of_date: asOfDate } : {}
    const response = await api.get<BalanceSheetResponse>(
      `/api/v1/accountant/clients/${clientId}/reports/balance-sheet`,
      { params }
    )
    return response.data
  },

  getProfitAndLoss: async (clientId: string, startDate?: string, endDate?: string): Promise<ProfitAndLossResponse> => {
    const params: Record<string, string> = {}
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate
    const response = await api.get<ProfitAndLossResponse>(
      `/api/v1/accountant/clients/${clientId}/reports/pnl`,
      { params }
    )
    return response.data
  },

  getAccountsReceivable: async (clientId: string, asOfDate?: string): Promise<SubledgerReportResponse> => {
    const params = asOfDate ? { as_of_date: asOfDate } : {}
    const response = await api.get<SubledgerReportResponse>(
      `/api/v1/accountant/clients/${clientId}/reports/ar`,
      { params }
    )
    return response.data
  },

  getAccountsPayable: async (clientId: string, asOfDate?: string): Promise<SubledgerReportResponse> => {
    const params = asOfDate ? { as_of_date: asOfDate } : {}
    const response = await api.get<SubledgerReportResponse>(
      `/api/v1/accountant/clients/${clientId}/reports/ap`,
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
      `/api/v1/accountant/issues/${issueId}/suggestions`
    )
    return response.data
  },

  makeDecision: async (
    issueId: string, 
    request: DecisionRequest, 
    autoExecute = true
  ): Promise<DecisionResponse> => {
    const response = await api.post<DecisionResponse>(
      `/api/v1/accountant/issues/${issueId}/decide`,
      request,
      { params: { auto_execute: autoExecute } }
    )
    return response.data
  },

  executeDecision: async (decisionId: string): Promise<ExecutionResultResponse> => {
    const response = await api.post<ExecutionResultResponse>(
      `/api/v1/accountant/decisions/${decisionId}/execute`
    )
    return response.data
  },

  reverseDecision: async (decisionId: string, reason?: string): Promise<{ decision_id: string; reversed_at: string; message: string }> => {
    const response = await api.post<{ decision_id: string; reversed_at: string; message: string }>(
      `/api/v1/accountant/decisions/${decisionId}/reverse`,
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
      `/api/v1/accountant/clients/${clientId}/decision-history`,
      { params: { limit, offset } }
    )
    return response.data
  },

  getDecisionPatterns: async (clientId: string): Promise<ClientPatternsResponse> => {
    const response = await api.get<ClientPatternsResponse>(
      `/api/v1/accountant/clients/${clientId}/decision-patterns`
    )
    return response.data
  },
}

export interface ApiError {
  message: string
  detail?: string
  status?: number
}

export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.detail) {
      return typeof error.response.data.detail === 'string' 
        ? error.response.data.detail 
        : JSON.stringify(error.response.data.detail)
    }
    if (error.message === 'Network Error') {
      return 'Cannot connect to server. Please ensure the backend is running at ' + API_BASE_URL
    }
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred'
}
