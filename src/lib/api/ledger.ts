// ============================================================================
// Ledger / Journal / Audit / Bookkeeping APIs (types + functions)
// ----------------------------------------------------------------------------
// Bundles ledgerApi, accountantDossierApi, bookkeepingApi and all closely
// related types (Core Ledger, Journal Entry, Audit Log, Comprehensive Audit).
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.
// ============================================================================

import { api } from '../api'
import type {
  AccountantCommitmentsResponse,
  ZZPExpenseListResponse,
  ZZPInvoiceListResponse,
  ZZPTimeEntryListResponse,
} from './zzp'

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

// ============ Bookkeeping / Journal Entry Types ============

export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'REVERSED'

export interface JournalLineCreate {
  account_id: string
  description?: string
  debit_amount: number
  credit_amount: number
  vat_code_id?: string
  vat_amount?: number
  taxable_amount?: number
  party_type?: 'CUSTOMER' | 'SUPPLIER'
  party_id?: string
}

export interface JournalLineResponse {
  id: string
  line_number: number
  account_id: string
  account_code: string | null
  account_name: string | null
  description: string | null
  debit_amount: number
  credit_amount: number
  vat_code_id: string | null
  vat_code: string | null
  vat_amount: number | null
  taxable_amount: number | null
  party_type: string | null
  party_id: string | null
}

export interface JournalEntryCreate {
  entry_date: string
  description: string
  reference?: string
  document_id?: string
  source_type?: string
  source_id?: string
  lines: JournalLineCreate[]
  auto_post?: boolean
}

export interface JournalEntryUpdate {
  entry_date?: string
  description?: string
  reference?: string
  lines?: JournalLineCreate[]
}

export interface JournalEntryResponse {
  id: string
  administration_id: string
  entry_number: string
  entry_date: string
  description: string
  reference: string | null
  status: JournalEntryStatus
  total_debit: number
  total_credit: number
  is_balanced: boolean
  source_type: string | null
  document_id: string | null
  posted_at: string | null
  posted_by_name: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
  lines: JournalLineResponse[]
}

export interface JournalEntryListItem {
  id: string
  entry_number: string
  entry_date: string
  description: string
  status: JournalEntryStatus
  total_debit: number
  total_credit: number
  is_balanced: boolean
  source_type: string | null
  posted_at: string | null
  created_at: string
}

export interface JournalEntryListResponse {
  entries: JournalEntryListItem[]
  total_count: number
}

export interface JournalEntryPostResponse {
  id: string
  status: JournalEntryStatus
  entry_number: string
  posted_at: string
  message: string
}

export interface PeriodLockCheckResponse {
  is_locked: boolean
  period_id: string | null
  period_name: string | null
  locked_at: string | null
  locked_by_name: string | null
  message: string
}

// ============ Audit Log Types ============

export type AuditLogAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'POST' 
  | 'DELETE' 
  | 'REVERSE' 
  | 'LOCK_PERIOD' 
  | 'UNLOCK_PERIOD' 
  | 'START_REVIEW' 
  | 'FINALIZE_PERIOD'

export interface LedgerAuditLogEntry {
  id: string
  administration_id: string
  actor_id: string | null
  actor_name: string | null
  action: AuditLogAction | string
  entity_type: string
  entity_id: string | null
  entity_description: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

export interface AuditLogListResponse {
  entries: LedgerAuditLogEntry[]
  total_count: number
}

// ============ Comprehensive Audit Log Types ============

export interface ComprehensiveAuditLogEntry {
  id: string
  client_id: string
  entity_type: string
  entity_id: string
  action: string
  user_id: string | null
  user_role: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export interface ComprehensiveAuditLogListResponse {
  entries: ComprehensiveAuditLogEntry[]
  total_count: number
  page: number
  page_size: number
}

export interface ComprehensiveAuditLogFilters {
  date_from?: string
  date_to?: string
  entity_type?: string
  entity_id?: string
  action?: string
  user_role?: string
  page?: number
  page_size?: number
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



export const accountantDossierApi = {
  getInvoices: async (clientId: string): Promise<ZZPInvoiceListResponse> => {
    const response = await api.get<ZZPInvoiceListResponse>(`/accountant/clients/${clientId}/invoices`)
    return response.data
  },

  getExpenses: async (clientId: string, filters?: { commitment_id?: string }): Promise<ZZPExpenseListResponse> => {
    const response = await api.get<ZZPExpenseListResponse>(`/accountant/clients/${clientId}/expenses`, { params: filters })
    return response.data
  },

  getHours: async (clientId: string): Promise<ZZPTimeEntryListResponse> => {
    const response = await api.get<ZZPTimeEntryListResponse>(`/accountant/clients/${clientId}/hours`)
    return response.data
  },

  getCommitments: async (
    clientId: string,
    filters?: { type?: 'lease' | 'loan' | 'subscription'; status?: 'active' | 'paused' | 'ended'; period_key?: string }
  ): Promise<AccountantCommitmentsResponse> => {
    const response = await api.get<AccountantCommitmentsResponse>(`/accountant/clients/${clientId}/commitments`, { params: filters })
    return response.data
  },

  exportInvoicesCsv: async (clientId: string): Promise<Blob> => {
    const response = await api.get(`/accountant/clients/${clientId}/invoices/export`, {
      responseType: 'blob'
    })
    return response.data as Blob
  },

  exportExpensesCsv: async (clientId: string, filters?: { commitment_id?: string }): Promise<Blob> => {
    const response = await api.get(`/accountant/clients/${clientId}/expenses/export`, {
      params: filters,
      responseType: 'blob'
    })
    return response.data as Blob
  },

  exportHoursCsv: async (clientId: string): Promise<Blob> => {
    const response = await api.get(`/accountant/clients/${clientId}/hours/export`, {
      responseType: 'blob'
    })
    return response.data as Blob
  },
}

// ============ Bookkeeping API ============

export const bookkeepingApi = {
  /**
   * List journal entries for a client
   */
  listJournalEntries: async (
    clientId: string, 
    options?: { status?: JournalEntryStatus; startDate?: string; endDate?: string; limit?: number; offset?: number }
  ): Promise<JournalEntryListResponse> => {
    const response = await api.get<JournalEntryListResponse>(
      `/accountant/clients/${clientId}/journal`,
      { params: options }
    )
    return response.data
  },

  /**
   * Create a new manual journal entry
   */
  createJournalEntry: async (clientId: string, entry: JournalEntryCreate): Promise<JournalEntryResponse> => {
    const response = await api.post<JournalEntryResponse>(
      `/accountant/clients/${clientId}/journal`,
      entry
    )
    return response.data
  },

  /**
   * Get a specific journal entry with all lines
   */
  getJournalEntry: async (clientId: string, entryId: string): Promise<JournalEntryResponse> => {
    const response = await api.get<JournalEntryResponse>(
      `/accountant/clients/${clientId}/journal/${entryId}`
    )
    return response.data
  },

  /**
   * Update a draft journal entry
   */
  updateJournalEntry: async (clientId: string, entryId: string, entry: JournalEntryUpdate): Promise<JournalEntryResponse> => {
    const response = await api.put<JournalEntryResponse>(
      `/accountant/clients/${clientId}/journal/${entryId}`,
      entry
    )
    return response.data
  },

  /**
   * Post a draft journal entry
   */
  postJournalEntry: async (clientId: string, entryId: string): Promise<JournalEntryPostResponse> => {
    const response = await api.post<JournalEntryPostResponse>(
      `/accountant/clients/${clientId}/journal/${entryId}/post`
    )
    return response.data
  },

  /**
   * Delete a draft journal entry
   */
  deleteJournalEntry: async (clientId: string, entryId: string): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(
      `/accountant/clients/${clientId}/journal/${entryId}`
    )
    return response.data
  },

  /**
   * Check if a date falls within a locked period
   */
  checkPeriodLock: async (clientId: string, entryDate: string): Promise<PeriodLockCheckResponse> => {
    const response = await api.get<PeriodLockCheckResponse>(
      `/accountant/clients/${clientId}/journal/check-period`,
      { params: { entry_date: entryDate } }
    )
    return response.data
  },

  /**
   * List audit log entries for a client
   */
  listAuditLog: async (
    clientId: string,
    options?: { entityType?: string; action?: string; limit?: number; offset?: number }
  ): Promise<AuditLogListResponse> => {
    const response = await api.get<AuditLogListResponse>(
      `/accountant/clients/${clientId}/audit`,
      { params: options }
    )
    return response.data
  },
}
