// ============================================================================
// ZZP API (types + functions, plus the private zzpConsentApi spread into it)
// ----------------------------------------------------------------------------
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.
// ============================================================================

import { api } from '../api'
import type {
  ZZPLinksResponse,
  ZZPActiveLinksResponse,
  ApproveLinkResponse,
  RejectLinkResponse,
} from '../api'

// ============ ZZP API Types ============

// Customer Types (matching backend schemas)
export interface ZZPCustomer {
  id: string
  administration_id: string
  name: string
  email?: string
  phone?: string
  contact_person?: string
  address_street?: string
  address_line2?: string
  address_postal_code?: string
  address_city?: string
  address_country?: string
  kvk_number?: string
  btw_number?: string
  iban?: string
  bank_bic?: string
  notes?: string
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface ZZPCustomerCreate {
  name: string
  email?: string
  phone?: string
  contact_person?: string
  address_street?: string
  address_line2?: string
  address_postal_code?: string
  address_city?: string
  address_country?: string
  kvk_number?: string
  btw_number?: string
  iban?: string
  bank_bic?: string
  notes?: string
  status?: 'active' | 'inactive'
}

export interface ZZPCustomerUpdate extends Partial<ZZPCustomerCreate> {}

export interface ZZPCustomerListResponse {
  customers: ZZPCustomer[]
  total: number
}

// Business Profile Types
export interface ZZPBusinessProfile {
  id: string
  administration_id: string
  company_name: string
  default_hourly_rate?: string
  trading_name?: string
  address_street?: string
  address_postal_code?: string
  address_city?: string
  address_country?: string
  kvk_number?: string
  btw_number?: string
  iban?: string
  email?: string
  phone?: string
  website?: string
  logo_url?: string
  created_at: string
  updated_at: string
}

export interface ZZPBusinessProfileCreate {
  company_name: string
  trading_name?: string
  address_street?: string
  address_postal_code?: string
  address_city?: string
  address_country?: string
  kvk_number?: string
  btw_number?: string
  iban?: string
  email?: string
  phone?: string
  website?: string
  logo_url?: string
}

// Invoice Types
export interface ZZPInvoiceLine {
  id: string
  invoice_id: string
  line_number: number
  description: string
  quantity: number
  unit_price_cents: number
  vat_rate: number
  line_total_cents: number
  vat_amount_cents: number
  created_at: string
  updated_at: string
}

export interface ZZPInvoiceLineCreate {
  description: string
  quantity: number
  unit_price_cents: number
  vat_rate: number
}

export interface ZZPInvoice {
  id: string
  administration_id: string
  customer_id: string
  invoice_number: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  issue_date: string
  due_date?: string
  // Seller snapshot
  seller_company_name?: string
  seller_trading_name?: string
  seller_address_street?: string
  seller_address_postal_code?: string
  seller_address_city?: string
  seller_address_country?: string
  seller_kvk_number?: string
  seller_btw_number?: string
  seller_iban?: string
  seller_email?: string
  seller_phone?: string
  // Customer snapshot
  customer_name?: string
  customer_address_street?: string
  customer_address_postal_code?: string
  customer_address_city?: string
  customer_address_country?: string
  customer_kvk_number?: string
  customer_btw_number?: string
  // Totals
  subtotal_cents: number
  vat_total_cents: number
  total_cents: number
  amount_paid_cents: number
  // Payment timestamp
  paid_at?: string
  notes?: string
  lines: ZZPInvoiceLine[]
  created_at: string
  updated_at: string
}

export interface ZZPInvoiceCreate {
  customer_id: string
  invoice_number?: string
  issue_date: string
  due_date?: string
  notes?: string
  lines: ZZPInvoiceLineCreate[]
}

export interface ZZPInvoiceUpdate {
  customer_id?: string
  invoice_number?: string
  issue_date?: string
  due_date?: string
  notes?: string
  lines?: ZZPInvoiceLineCreate[]
}

export interface ZZPInvoiceListResponse {
  invoices: ZZPInvoice[]
  total: number
}

// Bank Account & Transaction Types
export interface ZZPBankAccount {
  id: string
  administration_id: string
  iban: string
  bank_name?: string
  currency: string
  created_at: string
}

export interface ZZPBankAccountListResponse {
  accounts: ZZPBankAccount[]
  total: number
}

export interface ZZPBankTransaction {
  id: string
  administration_id: string
  bank_account_id: string
  booking_date: string
  amount_cents: number
  currency: string
  counterparty_name?: string
  counterparty_iban?: string
  description: string
  reference?: string
  status: 'NEW' | 'MATCHED' | 'IGNORED' | 'NEEDS_REVIEW'
  matched_invoice_id?: string
  matched_invoice_number?: string
  created_at: string
}

export interface ZZPBankTransactionListResponse {
  transactions: ZZPBankTransaction[]
  total: number
  page: number
  page_size: number
}

export interface ZZPBankImportResponse {
  imported_count: number
  skipped_duplicates_count: number
  total_in_file: number
  errors: string[]
  message: string
  bank_account_id?: string
}

export interface ZZPInvoiceMatchSuggestion {
  invoice_id: string
  invoice_number: string
  customer_name?: string
  invoice_total_cents: number
  invoice_open_cents: number
  invoice_date: string
  confidence_score: number
  match_reason: string
}

export interface ZZPMatchSuggestionsResponse {
  transaction_id: string
  suggestions: ZZPInvoiceMatchSuggestion[]
  message: string
}

export interface ZZPMatchInvoiceRequest {
  invoice_id: string
  amount_cents?: number
  notes?: string
}

export interface ZZPMatchInvoiceResponse {
  transaction_id: string
  invoice_id: string
  invoice_number: string
  amount_matched_cents: number
  invoice_new_status: string
  invoice_amount_paid_cents: number
  invoice_total_cents: number
  message: string
}

export interface ZZPUnmatchResponse {
  transaction_id: string
  invoice_id: string
  invoice_number: string
  amount_unmatched_cents: number
  invoice_new_status: string
  invoice_amount_paid_cents: number
  message: string
}

export interface ZZPBankTransactionMatch {
  id: string
  bank_transaction_id: string
  invoice_id: string
  invoice_number: string
  amount_cents: number
  match_type: string
  confidence_score?: number
  notes?: string
  created_at: string
  user_id?: string
}

export interface ZZPBankTransactionMatchListResponse {
  matches: ZZPBankTransactionMatch[]
  total: number
}

// PSD2 Bank Connection Types (GoCardless)
export interface ZZPBankConnectionStatus {
  connected: boolean
  id?: string
  institution_name?: string
  institution_id?: string
  status?: string
  last_sync_at?: string
  consent_expires_at?: string
  iban?: string
  created_at?: string
}

export interface ZZPBankConnectResponse {
  link: string
  requisition_id: string
  institution_name: string
  connection_id: string
}

export interface ZZPBankSyncResponse {
  imported_count: number
  skipped_count: number
  total_fetched: number
  message: string
}

export interface ZZPBankInstitution {
  id: string
  name: string
  logo?: string
  countries?: string[]
}

export interface ZZPBankInstitutionListResponse {
  institutions: ZZPBankInstitution[]
  total: number
}

// AI Insights Types
export type InsightType = 
  | 'invoice_overdue'
  | 'invoice_followup'
  | 'unbilled_hours'
  | 'btw_deadline'
  | 'missing_profile'
  | 'no_recent_activity'

export type InsightSeverity = 'action_needed' | 'suggestion' | 'info'

export interface InsightAction {
  type: string
  label: string
  route?: string
  params?: Record<string, string>
}

export interface ZZPInsight {
  id: string
  type: InsightType
  severity: InsightSeverity
  title: string
  description: string
  reason: string
  action?: InsightAction
  related_id?: string
  related_type?: string
  amount_cents?: number
  created_at: string
  dismissible: boolean
}

export interface ZZPInsightsResponse {
  insights: ZZPInsight[]
  total_action_needed: number
  total_suggestions: number
  generated_at: string
  ai_model_version: string
}

// ZZP Dashboard Types
export interface ZZPDashboardActionItem {
  id: string
  type: string  // 'draft_invoice', 'overdue_invoice', 'missing_profile', 'incomplete_profile', 'btw_deadline', 'uncategorized_expense', 'missing_btw_on_expense'
  title: string
  description: string
  severity: 'error' | 'warning' | 'info'
  route?: string
  related_id?: string
  count?: number
  amount_cents?: number
}

export interface ZZPDashboardInvoiceStats {
  open_count: number
  open_total_cents: number
  draft_count: number
  overdue_count: number
  overdue_total_cents: number
  paid_this_month_count: number
  paid_this_month_cents: number
}

export interface ZZPDashboardExpenseStats {
  this_month_count: number
  this_month_total_cents: number
  this_month_vat_cents: number
}

export interface ZZPDashboardTimeStats {
  this_week_hours: number
  this_week_billable_hours: number
  this_week_value_cents: number
}

export interface ZZPDashboardBTWStats {
  quarter: string
  quarter_start: string
  quarter_end: string
  deadline: string
  days_until_deadline: number
  vat_collected_cents: number
  vat_deductible_cents: number
  vat_payable_cents: number
}

export interface ZZPDashboardResponse {
  invoices: ZZPDashboardInvoiceStats
  expenses: ZZPDashboardExpenseStats
  time: ZZPDashboardTimeStats
  btw: ZZPDashboardBTWStats
  actions: ZZPDashboardActionItem[]
  profile_complete: boolean
  generated_at: string
  notes: Record<string, string>
}

// Monthly Invoice Summary Types
export interface MonthlyInvoiceSummary {
  month_key: string      // e.g. "2026-03"
  month_label: string    // e.g. "Maart 2026"
  sent_total: number     // cents
  paid_total: number     // cents
  open_total: number     // cents
  sent_count: number
  paid_count: number
  open_count: number
}

export interface MonthlyInvoicesResponse {
  months: MonthlyInvoiceSummary[]
  period: string
}

export type MonthlyInvoicePeriod = 'this_month' | 'last_6_months' | 'this_year'

// Quote (Offerte) Types
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'

export interface ZZPQuoteLine {
  id: string
  quote_id: string
  line_number: number
  description: string
  quantity: number
  unit_price_cents: number
  vat_rate: number
  vat_amount_cents: number
  line_total_cents: number
}

export interface ZZPQuoteLineCreate {
  description: string
  quantity: number
  unit_price_cents: number
  vat_rate: number
}

export interface ZZPQuote {
  id: string
  administration_id: string
  customer_id: string
  quote_number: string
  status: QuoteStatus
  issue_date: string
  valid_until?: string
  invoice_id?: string
  
  // Seller snapshot
  seller_company_name?: string
  seller_trading_name?: string
  seller_address_street?: string
  seller_address_postal_code?: string
  seller_address_city?: string
  seller_address_country?: string
  seller_kvk_number?: string
  seller_btw_number?: string
  seller_iban?: string
  seller_email?: string
  seller_phone?: string
  
  // Customer snapshot
  customer_name?: string
  customer_address_street?: string
  customer_address_postal_code?: string
  customer_address_city?: string
  customer_address_country?: string
  customer_kvk_number?: string
  customer_btw_number?: string
  
  // Totals
  subtotal_cents: number
  vat_total_cents: number
  total_cents: number
  
  // Content
  title?: string
  notes?: string
  terms?: string
  
  // Timestamps
  created_at: string
  updated_at: string
  
  // Lines
  lines: ZZPQuoteLine[]
}

export interface ZZPQuoteCreate {
  customer_id: string
  issue_date: string
  valid_until?: string
  title?: string
  notes?: string
  terms?: string
  lines: ZZPQuoteLineCreate[]
}

export interface ZZPQuoteUpdate {
  customer_id?: string
  issue_date?: string
  valid_until?: string
  title?: string
  notes?: string
  terms?: string
  lines?: ZZPQuoteLineCreate[]
}

export interface ZZPQuoteListResponse {
  quotes: ZZPQuote[]
  total: number
  total_amount_cents: number
  stats?: {
    draft: number
    sent: number
    accepted: number
    rejected: number
    expired: number
    converted: number
  }
}

export interface ZZPQuoteConvertResponse {
  quote: ZZPQuote
  invoice_id: string
  invoice_number: string
}

// Expense Types
export interface ZZPExpense {
  id: string
  administration_id: string
  vendor: string
  description?: string
  expense_date: string
  amount_cents: number
  vat_rate: number
  vat_amount_cents: number
  category: string
  notes?: string
  attachment_url?: string
  commitment_id?: string | null
  created_at: string
  updated_at: string
}

export interface ZZPExpenseCreate {
  vendor: string
  description?: string
  expense_date: string
  amount_cents: number
  vat_rate: number
  category: string
  notes?: string
  attachment_url?: string
  commitment_id?: string
}

export interface ZZPExpenseUpdate extends Partial<ZZPExpenseCreate> {}

export interface ZZPExpenseListResponse {
  expenses: ZZPExpense[]
  total: number
  total_amount_cents: number
  total_vat_cents: number
}

// ZZP Document Inbox Types
export type ZZPDocType = 'BON' | 'FACTUUR' | 'OVERIG'
export type ZZPDocStatus = 'NEW' | 'REVIEW' | 'PROCESSED' | 'FAILED'

export interface ZZPDocument {
  id: string
  administration_id: string
  user_id?: string
  filename: string
  mime_type: string
  storage_ref: string
  doc_type: ZZPDocType
  status: ZZPDocStatus
  supplier?: string
  amount_cents?: number
  vat_rate?: number
  doc_date?: string
  created_at: string
  updated_at: string
}

export interface ZZPDocumentUpdate {
  doc_type?: ZZPDocType
  status?: ZZPDocStatus
  supplier?: string
  amount_cents?: number
  vat_rate?: number
  doc_date?: string
}

export interface ZZPDocumentUploadResponse {
  documents: ZZPDocument[]
}

export interface ZZPDocumentCreateExpenseResponse {
  expense_id: string
  document_id: string
  message: string
}

// Time Entry Types
export interface ZZPTimeEntry {
  id: string
  administration_id: string
  user_id?: string
  entry_date: string
  description: string
  hours: number | string
  project_name?: string
  customer_id?: string
  project_id?: string
  hourly_rate?: number | string
  hourly_rate_cents?: number
  billable: boolean
  invoice_id?: string
  is_invoiced: boolean
  created_at: string
  updated_at: string
}

export interface ZZPTimeEntryCreate {
  entry_date: string
  description: string
  hours: number | string
  project_name?: string
  customer_id?: string
  project_id?: string
  hourly_rate?: number | string
  billable: boolean
}

export interface ZZPTimeEntryUpdate extends Partial<ZZPTimeEntryCreate> {}

export interface ZZPTimeEntryMutationResponse {
  entry: ZZPTimeEntry | null
  status: number
}

export interface ZZPTimeEntryListResponse {
  entries: ZZPTimeEntry[]
  total: number
  total_hours: number
  total_billable_hours: number
}

export interface ZZPWeeklyTimeSummary {
  week_start: string
  week_end: string
  total_hours: number
  billable_hours: number
  entries_by_day: Record<string, number>
}

export interface ZZPTimeEntryInvoiceCreate {
  customer_id: string
  period_start: string
  period_end: string
  hourly_rate?: number | string
}

export interface ZZPWeeklyInvoiceCreateResponse {
  invoice_id: string
  invoice_number: string
  total_hours: number | string
  rate: number | string
  total_amount: number | string
}

// Calendar Event Types
export interface ZZPCalendarEvent {
  id: string
  administration_id: string
  title: string
  start_datetime: string
  end_datetime: string
  location?: string
  notes?: string
  recurrence?: string | null
  recurrence_end_date?: string | null
  color?: string | null
  created_at: string
  updated_at: string
}

export interface ZZPCalendarEventCreate {
  title: string
  start_datetime: string
  end_datetime: string
  location?: string
  notes?: string
  recurrence?: string | null
  recurrence_end_date?: string | null
  color?: string | null
}

export interface ZZPCalendarEventUpdate extends Partial<ZZPCalendarEventCreate> {}

export interface ZZPCalendarEventListResponse {
  events: ZZPCalendarEvent[]
  total: number
}

// Work Session Types (Clock-in/out)
export interface WorkSession {
  id: string
  user_id: string
  administration_id: string
  started_at: string
  ended_at?: string | null
  break_minutes: number
  note?: string | null
  time_entry_id?: string | null
  created_at: string
  updated_at: string
  duration_seconds?: number | null
}

export interface WorkSessionStart {
  note?: string
}

export interface WorkSessionStop {
  break_minutes?: number
  note?: string
}

export interface WorkSessionStopResponse {
  session: WorkSession
  time_entry: ZZPTimeEntry
  hours_added: number
  message: string
}


export interface ZZPCommitment {
  id: string
  administration_id: string
  type: 'lease' | 'loan' | 'subscription'
  name: string
  amount_cents: number
  monthly_payment_cents?: number | null
  principal_amount_cents?: number | null
  interest_rate?: number | null
  recurring_frequency?: 'monthly' | 'yearly' | null
  start_date: string
  end_date?: string | null
  contract_term_months?: number | null
  renewal_date?: string | null
  next_due_date?: string | null
  btw_rate?: number | null
  vat_rate?: number | null
  payment_day?: number | null
  provider?: string | null
  contract_number?: string | null
  notice_period_days?: number | null
  auto_renew: boolean
  last_booked_date?: string | null
  auto_create_expense?: boolean
  paid_to_date_cents?: number | null
  remaining_balance_cents?: number | null
  computed_end_date?: string | null
  end_date_status: 'active' | 'ending_soon' | 'ended' | 'unknown'
  status: 'active' | 'paused' | 'ended'
  created_at: string
  updated_at: string
}

export interface ZZPCommitmentCreate {
  type: 'lease' | 'loan' | 'subscription'
  name: string
  amount_cents: number
  monthly_payment_cents?: number
  principal_amount_cents?: number
  interest_rate?: number
  recurring_frequency?: 'monthly' | 'yearly'
  start_date: string
  end_date?: string
  contract_term_months?: number
  renewal_date?: string
  btw_rate?: number
  vat_rate?: number
  payment_day?: number
  provider?: string
  contract_number?: string
  notice_period_days?: number
  auto_renew?: boolean
  auto_create_expense?: boolean
  status?: 'active' | 'paused' | 'ended'
}

export type ZZPCommitmentUpdate = Partial<ZZPCommitmentCreate>


export interface CommitmentExpenseCreatePayload {
  expense_date: string
  amount_cents: number
  vat_rate: number
  description: string
  notes?: string
}

export interface CommitmentExpenseCreateResponse {
  expense_id: string
  commitment_id: string
  last_booked_date?: string | null
  next_due_date?: string | null
  linked_expenses_count: number
  vat_amount_cents: number
}

export interface ZZPCommitmentListResponse {
  commitments: ZZPCommitment[]
  total: number
}


export interface AccountantCommitmentItem extends ZZPCommitment {
  linked_expenses_count: number
  has_expense_in_period: boolean
}

export interface AccountantCommitmentsResponse {
  missing_this_period_count: number
  monthly_total_cents: number
  upcoming_30_days_total_cents: number
  warning_count: number
  cashflow_stress_label: string
  commitments: AccountantCommitmentItem[]
  total: number
}


export interface ZZPCommitmentAlert {
  code: "subscription_renewal" | "lease_loan_ending" | "monthly_threshold"
  severity: "info" | "warning"
  message: string
}

export interface ZZPCommitmentOverview {
  monthly_total_cents: number
  upcoming_total_cents: number
  warning_count: number
  by_type: Record<string, number>
  upcoming: ZZPCommitment[]
  alerts: ZZPCommitmentAlert[]
  threshold_cents: number
}

export interface ZZPAmortizationRow {
  month_index: number
  due_date: string
  payment_cents: number
  interest_cents: number
  principal_cents: number
  remaining_balance_cents: number
}

export interface ZZPCommitmentSuggestion {
  bank_transaction_id: string
  booking_date: string
  amount_cents: number
  description: string
  confidence: number
}


// ZZP Client Consent API (private to this module; spread into zzpApi below)
const zzpConsentApi = {
  /**
   * Get list of pending accountant link requests for ZZP client
   */
  getPendingLinks: async (): Promise<ZZPLinksResponse> => {
    const response = await api.get<ZZPLinksResponse>('/zzp/links')
    return response.data
  },

  /**
   * Get list of active accountant links for ZZP client
   */
  getActiveLinks: async (): Promise<ZZPActiveLinksResponse> => {
    const response = await api.get<ZZPActiveLinksResponse>('/zzp/links/active')
    return response.data
  },

  /**
   * Approve an accountant link request
   */
  approveLink: async (assignmentId: string): Promise<ApproveLinkResponse> => {
    const response = await api.post<ApproveLinkResponse>(`/zzp/links/${assignmentId}/approve`)
    return response.data
  },

  /**
   * Reject an accountant link request
   */
  rejectLink: async (assignmentId: string): Promise<RejectLinkResponse> => {
    const response = await api.post<RejectLinkResponse>(`/zzp/links/${assignmentId}/reject`)
    return response.data
  },

  /**
   * Revoke an active accountant link (withdraw previously granted access)
   */
  revokeLink: async (assignmentId: string): Promise<RejectLinkResponse> => {
    const response = await api.post<RejectLinkResponse>(`/zzp/links/${assignmentId}/revoke`)
    return response.data
  },
}

// ============ ZZP API Functions ============

export const zzpApi = {
  // ------------ Customers ------------
  customers: {
    list: async (options?: { status?: string; search?: string }): Promise<ZZPCustomerListResponse> => {
      const params: Record<string, string> = {}
      if (options?.status) params.status = options.status
      if (options?.search) params.search = options.search
      const response = await api.get<ZZPCustomerListResponse>('/zzp/customers', { params })
      return response.data
    },

    get: async (customerId: string): Promise<ZZPCustomer> => {
      const response = await api.get<ZZPCustomer>(`/zzp/customers/${customerId}`)
      return response.data
    },

    create: async (data: ZZPCustomerCreate): Promise<ZZPCustomer> => {
      const response = await api.post<ZZPCustomer>('/zzp/customers', data)
      return response.data
    },

    update: async (customerId: string, data: ZZPCustomerUpdate): Promise<ZZPCustomer> => {
      const response = await api.put<ZZPCustomer>(`/zzp/customers/${customerId}`, data)
      return response.data
    },

    delete: async (customerId: string): Promise<void> => {
      await api.delete(`/zzp/customers/${customerId}`)
    },
  },

  // ------------ Business Profile ------------
  profile: {
    get: async (): Promise<ZZPBusinessProfile> => {
      const response = await api.get<ZZPBusinessProfile>('/zzp/profile')
      return response.data
    },

    upsert: async (data: ZZPBusinessProfileCreate): Promise<ZZPBusinessProfile> => {
      const response = await api.put<ZZPBusinessProfile>('/zzp/profile', data)
      return response.data
    },

    update: async (data: Partial<ZZPBusinessProfileCreate>): Promise<ZZPBusinessProfile> => {
      const response = await api.patch<ZZPBusinessProfile>('/zzp/profile', data)
      return response.data
    },
  },

  // ------------ Invoices ------------
  invoices: {
    list: async (options?: {
      status?: string
      customer_id?: string
      from_date?: string
      to_date?: string
    }): Promise<ZZPInvoiceListResponse> => {
      const params: Record<string, string> = {}
      if (options?.status) params.status = options.status
      if (options?.customer_id) params.customer_id = options.customer_id
      if (options?.from_date) params.from_date = options.from_date
      if (options?.to_date) params.to_date = options.to_date
      const response = await api.get<ZZPInvoiceListResponse>('/zzp/invoices', { params })
      return response.data
    },

    get: async (invoiceId: string): Promise<ZZPInvoice> => {
      const response = await api.get<ZZPInvoice>(`/zzp/invoices/${invoiceId}`)
      return response.data
    },

    create: async (data: ZZPInvoiceCreate): Promise<ZZPInvoice> => {
      const response = await api.post<ZZPInvoice>('/zzp/invoices', data)
      return response.data
    },

    update: async (invoiceId: string, data: ZZPInvoiceUpdate): Promise<ZZPInvoice> => {
      const response = await api.put<ZZPInvoice>(`/zzp/invoices/${invoiceId}`, data)
      return response.data
    },

    updateStatus: async (invoiceId: string, status: 'draft' | 'sent' | 'paid' | 'cancelled'): Promise<ZZPInvoice> => {
      const response = await api.patch<ZZPInvoice>(`/zzp/invoices/${invoiceId}/status`, { status })
      return response.data
    },

    delete: async (invoiceId: string): Promise<void> => {
      await api.delete(`/zzp/invoices/${invoiceId}`)
    },

    /**
     * Download invoice as PDF.
     * Returns a Blob that can be used for download or preview.
     */
    downloadPdf: async (invoiceId: string): Promise<Blob> => {
      const response = await api.get(`/zzp/invoices/${invoiceId}/pdf`, {
        responseType: 'blob',
      })
      return response.data as Blob
    },

    /**
     * Get the invoice PDF URL for direct download (browser navigation).
     * Includes `?download=1` to signal explicit download intent and
     * `?token=<jwt>` so that browsers (e.g. iOS Safari) that cannot attach
     * Authorization headers during direct navigation are still authenticated.
     *
     * NOTE: The JWT is short-lived and scoped to the authenticated user.
     * Passing it in the URL is an accepted trade-off for file-download flows
     * where custom headers are unavailable (see iOS Safari / PWA constraints).
     */
    getPdfUrl: (invoiceId: string): string => {
      let token: string | null = null
      try {
        token = localStorage.getItem('access_token')
      } catch {
        // localStorage may be unavailable in certain browser contexts (e.g. private mode)
      }
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : ''
      return `${api.defaults.baseURL}/zzp/invoices/${invoiceId}/pdf?download=1${tokenParam}`
    },

    /**
     * Generate a public share link for an invoice (signed, 30-day expiry).
     * The returned URL can be accessed without authentication.
     */
    createShareLink: async (invoiceId: string): Promise<{ url: string; expires_in_days: number }> => {
      const response = await api.post<{ url: string; expires_in_days: number }>(
        `/zzp/invoices/${invoiceId}/share-link`
      )
      return response.data
    },

    /**
     * Mark an invoice as paid by creating a payment record.
     */
    markPaid: async (
      invoiceId: string, 
      data?: { 
        payment_date?: string
        payment_method?: string
        reference?: string
        notes?: string 
      }
    ): Promise<void> => {
      await api.post(`/zzp/payments/invoices/${invoiceId}/mark-paid`, data || {})
    },
    
    /**
     * Mark an invoice as unpaid by removing payment allocations.
     */
    markUnpaid: async (invoiceId: string): Promise<void> => {
      await api.post(`/zzp/payments/invoices/${invoiceId}/mark-unpaid`)
    },
    
    /**
     * Send invoice via email to the customer.
     * Generates PDF and emails it to the customer's email address.
     * Updates invoice status to 'sent'.
     */
    sendEmail: async (invoiceId: string): Promise<ZZPInvoice> => {
      const response = await api.post<ZZPInvoice>(`/zzp/invoices/${invoiceId}/send`)
      return response.data
    },
    
    /**
     * Suggest unit price based on previous invoices for a customer.
     * Returns suggested price in cents and euros, with a match reason.
     */
    suggestPrice: async (customerId: string, description?: string): Promise<{
      suggested_price_cents: number | null
      suggested_price_euros: number | null
      match_reason: string
      message: string
    }> => {
      const params = description ? { description } : {}
      const response = await api.get(`/zzp/invoices/suggest-price/${customerId}`, { params })
      return response.data
    },
  },

  // ------------ Expenses ------------
  expenses: {
    list: async (options?: {
      category?: string
      year?: number
      month?: number
      from_date?: string
      to_date?: string
    }): Promise<ZZPExpenseListResponse> => {
      const params: Record<string, string | number> = {}
      if (options?.category) params.category = options.category
      if (options?.year) params.year = options.year
      if (options?.month) params.month = options.month
      if (options?.from_date) params.from_date = options.from_date
      if (options?.to_date) params.to_date = options.to_date
      const response = await api.get<ZZPExpenseListResponse>('/zzp/expenses', { params })
      return response.data
    },

    get: async (expenseId: string): Promise<ZZPExpense> => {
      const response = await api.get<ZZPExpense>(`/zzp/expenses/${expenseId}`)
      return response.data
    },

    create: async (data: ZZPExpenseCreate): Promise<ZZPExpense> => {
      const response = await api.post<ZZPExpense>('/zzp/expenses', data)
      return response.data
    },

    update: async (expenseId: string, data: ZZPExpenseUpdate): Promise<ZZPExpense> => {
      const response = await api.put<ZZPExpense>(`/zzp/expenses/${expenseId}`, data)
      return response.data
    },

    delete: async (expenseId: string): Promise<void> => {
      await api.delete(`/zzp/expenses/${expenseId}`)
    },

    getCategories: async (): Promise<{ categories: string[] }> => {
      const response = await api.get<{ categories: string[] }>('/zzp/expenses/categories/list')
      return response.data
    },
    
    /**
     * Upload a receipt photo as attachment.
     * Returns empty data for manual form entry.
     */
    scanReceipt: async (file: File): Promise<{
      extracted_data: ZZPExpenseCreate
      status: string
      message: string
    }> => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/zzp/expenses/scan', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    },
  },

  // ------------ Document Inbox ------------
  documents: {
    upload: async (files: File[]): Promise<ZZPDocumentUploadResponse> => {
      const formData = new FormData()
      files.forEach(f => formData.append('files', f))
      const response = await api.post<ZZPDocumentUploadResponse>('/zzp/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    },

    list: async (options?: {
      status?: ZZPDocStatus
      type?: ZZPDocType
      q?: string
    }): Promise<ZZPDocument[]> => {
      const params: Record<string, string> = {}
      if (options?.status) params.status = options.status
      if (options?.type) params.type = options.type
      if (options?.q) params.q = options.q
      const response = await api.get<ZZPDocument[]>('/zzp/documents', { params })
      return response.data
    },

    get: async (documentId: string): Promise<ZZPDocument> => {
      const response = await api.get<ZZPDocument>(`/zzp/documents/${documentId}`)
      return response.data
    },

    update: async (documentId: string, data: ZZPDocumentUpdate): Promise<ZZPDocument> => {
      const response = await api.patch<ZZPDocument>(`/zzp/documents/${documentId}`, data)
      return response.data
    },

    createExpense: async (
      documentId: string,
      expenseData: ZZPExpenseCreate & { amount_cents: number }
    ): Promise<ZZPDocumentCreateExpenseResponse> => {
      const response = await api.post<ZZPDocumentCreateExpenseResponse>(
        `/zzp/documents/${documentId}/create-expense`,
        expenseData,
      )
      return response.data
    },

    delete: async (documentId: string): Promise<void> => {
      await api.delete(`/zzp/documents/${documentId}`)
    },
  },

  // ------------ Time Entries ------------
  timeEntries: {
    list: async (options?: {
      customer_id?: string
      period_start?: string
      period_end?: string
    }): Promise<ZZPTimeEntryListResponse> => {
      const params: Record<string, string> = {}
      if (options?.customer_id) params.customer_id = options.customer_id
      if (options?.period_start) params.period_start = options.period_start
      if (options?.period_end) params.period_end = options.period_end
      const response = await api.get<ZZPTimeEntryListResponse>('/zzp/time-entries', { params })
      return response.data
    },

    listOpen: async (options?: {
      customer_id?: string
      period_start?: string
      period_end?: string
    }): Promise<ZZPTimeEntry[]> => {
      const params: Record<string, string> = {}
      if (options?.customer_id) params.customer_id = options.customer_id
      if (options?.period_start) params.period_start = options.period_start
      if (options?.period_end) params.period_end = options.period_end
      const response = await api.get<ZZPTimeEntry[]>('/zzp/time-entries/open', { params })
      return response.data
    },

    listInvoiced: async (options?: {
      customer_id?: string
      period_start?: string
      period_end?: string
    }): Promise<ZZPTimeEntry[]> => {
      const params: Record<string, string> = {}
      if (options?.customer_id) params.customer_id = options.customer_id
      if (options?.period_start) params.period_start = options.period_start
      if (options?.period_end) params.period_end = options.period_end
      const response = await api.get<ZZPTimeEntry[]>('/zzp/time-entries/invoiced', { params })
      return response.data
    },

    create: async (data: ZZPTimeEntryCreate): Promise<ZZPTimeEntry> => {
      const response = await api.post<ZZPTimeEntry>('/zzp/time-entries', data)
      return response.data
    },

    update: async (entryId: string, data: ZZPTimeEntryUpdate): Promise<ZZPTimeEntryMutationResponse> => {
      const response = await api.patch<ZZPTimeEntry>(`/zzp/time-entries/${entryId}`, data)
      return {
        entry: response.data ?? null,
        status: response.status,
      }
    },

    delete: async (entryId: string): Promise<void> => {
      await api.delete(`/zzp/time-entries/${entryId}`)
    },

    invoiceWeek: async (data: ZZPTimeEntryInvoiceCreate): Promise<ZZPWeeklyInvoiceCreateResponse> => {
      const response = await api.post<ZZPWeeklyInvoiceCreateResponse>('/zzp/time-entries/invoice-week', data)
      return response.data
    },

    generateInvoice: async (data: ZZPTimeEntryInvoiceCreate): Promise<ZZPWeeklyInvoiceCreateResponse> => {
      const response = await api.post<ZZPWeeklyInvoiceCreateResponse>('/zzp/time-entries/invoice-week', data)
      return response.data
    },
  },

  // ------------ Work Sessions (Clock-in/out) ------------
  workSessions: {
    /**
     * Get the currently active work session.
     * Returns null if no active session exists.
     */
    getActive: async (): Promise<WorkSession | null> => {
      const response = await api.get<WorkSession | null>('/zzp/work-sessions/active')
      return response.data
    },

    /**
     * Start a new work session (clock-in).
     * Only one active session per user is allowed.
     */
    start: async (data?: WorkSessionStart): Promise<WorkSession> => {
      const response = await api.post<WorkSession>('/zzp/work-sessions/start', data || {})
      return response.data
    },

    /**
     * Stop the active work session (clock-out).
     * Creates a time entry with the calculated duration.
     */
    stop: async (data?: WorkSessionStop): Promise<WorkSessionStopResponse> => {
      const response = await api.post<WorkSessionStopResponse>('/zzp/work-sessions/stop', data || {})
      return response.data
    },
  },

  // ------------ Calendar Events ------------
  calendarEvents: {
    list: async (options?: {
      year?: number
      month?: number
      from_date?: string
      to_date?: string
    }): Promise<ZZPCalendarEventListResponse> => {
      const params: Record<string, string | number> = {}
      if (options?.year) params.year = options.year
      if (options?.month) params.month = options.month
      if (options?.from_date) params.from_date = options.from_date
      if (options?.to_date) params.to_date = options.to_date
      const response = await api.get<ZZPCalendarEventListResponse>('/zzp/calendar-events', { params })
      return response.data
    },

    get: async (eventId: string): Promise<ZZPCalendarEvent> => {
      const response = await api.get<ZZPCalendarEvent>(`/zzp/calendar-events/${eventId}`)
      return response.data
    },

    create: async (data: ZZPCalendarEventCreate): Promise<ZZPCalendarEvent> => {
      const response = await api.post<ZZPCalendarEvent>('/zzp/calendar-events', data)
      return response.data
    },

    update: async (eventId: string, data: ZZPCalendarEventUpdate): Promise<ZZPCalendarEvent> => {
      const response = await api.put<ZZPCalendarEvent>(`/zzp/calendar-events/${eventId}`, data)
      return response.data
    },

    delete: async (eventId: string): Promise<void> => {
      await api.delete(`/zzp/calendar-events/${eventId}`)
    },
  },


  // ------------ Commitments (Verplichtingen) ------------
  commitments: {
    list: async (type?: 'lease' | 'loan' | 'subscription'): Promise<ZZPCommitmentListResponse> => {
      const response = await api.get<ZZPCommitmentListResponse>('/zzp/commitments', { params: type ? { type } : undefined })
      return response.data
    },
    overview: async (threshold_cents?: number): Promise<ZZPCommitmentOverview> => {
      const response = await api.get<ZZPCommitmentOverview>('/zzp/commitments/overview/summary', {
        params: threshold_cents ? { threshold_cents } : undefined,
      })
      return response.data
    },
    create: async (data: ZZPCommitmentCreate): Promise<ZZPCommitment> => {
      const response = await api.post<ZZPCommitment>('/zzp/commitments', data)
      return response.data
    },
    get: async (id: string): Promise<ZZPCommitment> => {
      const response = await api.get<ZZPCommitment>(`/zzp/commitments/${id}`)
      return response.data
    },
    update: async (id: string, data: ZZPCommitmentUpdate): Promise<ZZPCommitment> => {
      const response = await api.patch<ZZPCommitment>(`/zzp/commitments/${id}`, data)
      return response.data
    },
    delete: async (id: string): Promise<void> => {
      await api.delete(`/zzp/commitments/${id}`)
    },
    amortization: async (id: string): Promise<ZZPAmortizationRow[]> => {
      const response = await api.get<ZZPAmortizationRow[]>(`/zzp/commitments/${id}/amortization`)
      return response.data
    },
    suggestions: async (): Promise<{ suggestions: ZZPCommitmentSuggestion[] }> => {
      const response = await api.get<{ suggestions: ZZPCommitmentSuggestion[] }>('/zzp/commitments/subscriptions/suggestions')
      return response.data
    },
    createExpense: async (id: string, data: CommitmentExpenseCreatePayload): Promise<CommitmentExpenseCreateResponse> => {
      const response = await api.post<CommitmentExpenseCreateResponse>(`/zzp/commitments/${id}/create-expense`, data)
      return response.data
    },
  },

  // ------------ Bank & Payments ------------
  bank: {
    /** List all bank accounts */
    listAccounts: async (): Promise<ZZPBankAccountListResponse> => {
      const response = await api.get<ZZPBankAccountListResponse>('/zzp/bank/accounts')
      return response.data
    },

    /** Import bank transactions from CSV */
    importTransactions: async (
      file: File,
      bankAccountIban?: string,
      bankName?: string
    ): Promise<ZZPBankImportResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      if (bankAccountIban) formData.append('bank_account_iban', bankAccountIban)
      if (bankName) formData.append('bank_name', bankName)
      
      const response = await api.post<ZZPBankImportResponse>('/zzp/bank/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    },

    /** List bank transactions with filters */
    listTransactions: async (options?: {
      status?: 'NEW' | 'MATCHED' | 'IGNORED' | 'NEEDS_REVIEW'
      bank_account_id?: string
      date_from?: string
      date_to?: string
      q?: string
      page?: number
      page_size?: number
    }): Promise<ZZPBankTransactionListResponse> => {
      const params: Record<string, string | number> = {}
      if (options?.status) params.status = options.status
      if (options?.bank_account_id) params.bank_account_id = options.bank_account_id
      if (options?.date_from) params.date_from = options.date_from
      if (options?.date_to) params.date_to = options.date_to
      if (options?.q) params.q = options.q
      if (options?.page) params.page = options.page
      if (options?.page_size) params.page_size = options.page_size
      
      const response = await api.get<ZZPBankTransactionListResponse>('/zzp/bank/transactions', { params })
      return response.data
    },

    /** Get match suggestions for a transaction */
    getSuggestions: async (transactionId: string): Promise<ZZPMatchSuggestionsResponse> => {
      const response = await api.get<ZZPMatchSuggestionsResponse>(
        `/zzp/bank/transactions/${transactionId}/suggestions`
      )
      return response.data
    },

    /** Match a transaction to an invoice */
    matchToInvoice: async (
      transactionId: string,
      data: ZZPMatchInvoiceRequest
    ): Promise<ZZPMatchInvoiceResponse> => {
      const response = await api.post<ZZPMatchInvoiceResponse>(
        `/zzp/bank/transactions/${transactionId}/match`,
        data
      )
      return response.data
    },

    /** Unmatch a transaction from its invoice */
    unmatch: async (transactionId: string): Promise<ZZPUnmatchResponse> => {
      const response = await api.post<ZZPUnmatchResponse>(
        `/zzp/bank/transactions/${transactionId}/unmatch`
      )
      return response.data
    },

    /** List all matches (audit trail) */
    listMatches: async (invoiceId?: string): Promise<ZZPBankTransactionMatchListResponse> => {
      const params: Record<string, string> = {}
      if (invoiceId) params.invoice_id = invoiceId
      
      const response = await api.get<ZZPBankTransactionMatchListResponse>('/zzp/bank/matches', { params })
      return response.data
    },

    // --- PSD2 Bank Connection (GoCardless) ---

    /** Get current bank connection status */
    getConnectionStatus: async (): Promise<ZZPBankConnectionStatus> => {
      const response = await api.get<ZZPBankConnectionStatus>('/zzp/bank/connection/status')
      return response.data
    },

    /** List available bank institutions */
    listInstitutions: async (country: string = 'NL'): Promise<ZZPBankInstitutionListResponse> => {
      const response = await api.get<ZZPBankInstitutionListResponse>('/zzp/bank/institutions', { params: { country } })
      return response.data
    },

    /** Initiate PSD2 bank connection */
    connect: async (institutionId: string): Promise<ZZPBankConnectResponse> => {
      const response = await api.post<ZZPBankConnectResponse>('/zzp/bank/connect', { institution_id: institutionId })
      return response.data
    },

    /** Handle callback after bank authorization */
    handleCallback: async (requisitionId: string): Promise<{ status: string; connection_id: string; institution_name: string; iban: string; message: string }> => {
      const response = await api.get<{ status: string; connection_id: string; institution_name: string; iban: string; message: string }>('/zzp/bank/callback', { params: { ref: requisitionId } })
      return response.data
    },

    /** Sync transactions from connected bank */
    syncTransactions: async (): Promise<ZZPBankSyncResponse> => {
      const response = await api.post<ZZPBankSyncResponse>('/zzp/bank/sync')
      return response.data
    },
  },

  // ------------ AI Insights ------------
  insights: {
    /**
     * Get AI-generated insights for the ZZP user.
     * 
     * Returns actionable insights like:
     * - Overdue invoices needing follow-up
     * - Unbilled hours that could be invoiced
     * - BTW deadline reminders
     * - Missing profile data
     * 
     * All insights include an explanation of WHY they were generated.
     */
    get: async (): Promise<ZZPInsightsResponse> => {
      const response = await api.get<ZZPInsightsResponse>('/zzp/insights')
      return response.data
    },
  },

  // ------------ Dashboard (Overzicht) ------------
  dashboard: {
    /**
     * Get aggregated dashboard metrics for the ZZP user.
     * 
     * Returns:
     * - Open invoices (sent/overdue) total + count
     * - Paid invoices this month
     * - Expenses this month
     * - Hours this week (total and billable)
     * - BTW estimate for current quarter
     * - Actions requiring attention
     */
    get: async (): Promise<ZZPDashboardResponse> => {
      const response = await api.get<ZZPDashboardResponse>('/zzp/dashboard')
      return response.data
    },

    /**
     * Get monthly invoice aggregations for the ZZP user.
     * Invoices are grouped by issue_date month.
     *
     * @param period - 'this_month' | 'last_6_months' | 'this_year'
     */
    monthlyInvoices: async (period: MonthlyInvoicePeriod = 'last_6_months'): Promise<MonthlyInvoicesResponse> => {
      const response = await api.get<MonthlyInvoicesResponse>('/zzp/dashboard/monthly-invoices', {
        params: { period },
      })
      return response.data
    },

    /**
     * Get standalone dashboard action items.
     * Returns a list of actions requiring the ZZP user's attention.
     */
    actions: async (): Promise<{ actions: ZZPDashboardActionItem[]; count: number; generated_at: string }> => {
      const response = await api.get<{ actions: ZZPDashboardActionItem[]; count: number; generated_at: string }>('/zzp/dashboard/actions')
      return response.data
    },
  },

  // ------------ Quotes (Offertes) ------------
  quotes: {
    /** List all quotes */
    list: async (options?: {
      status?: QuoteStatus
      customer_id?: string
      from_date?: string
      to_date?: string
    }): Promise<ZZPQuoteListResponse> => {
      const params: Record<string, string> = {}
      if (options?.status) params.status = options.status
      if (options?.customer_id) params.customer_id = options.customer_id
      if (options?.from_date) params.from_date = options.from_date
      if (options?.to_date) params.to_date = options.to_date
      const response = await api.get<ZZPQuoteListResponse>('/zzp/quotes', { params })
      return response.data
    },

    /** Get a specific quote */
    get: async (quoteId: string): Promise<ZZPQuote> => {
      const response = await api.get<ZZPQuote>(`/zzp/quotes/${quoteId}`)
      return response.data
    },

    /** Create a new quote */
    create: async (data: ZZPQuoteCreate): Promise<ZZPQuote> => {
      const response = await api.post<ZZPQuote>('/zzp/quotes', data)
      return response.data
    },

    /** Update a quote */
    update: async (quoteId: string, data: ZZPQuoteUpdate): Promise<ZZPQuote> => {
      const response = await api.put<ZZPQuote>(`/zzp/quotes/${quoteId}`, data)
      return response.data
    },

    /** Update quote status */
    updateStatus: async (quoteId: string, status: QuoteStatus): Promise<ZZPQuote> => {
      const response = await api.patch<ZZPQuote>(`/zzp/quotes/${quoteId}/status`, { status })
      return response.data
    },

    /** Convert quote to invoice */
    convertToInvoice: async (quoteId: string): Promise<ZZPQuoteConvertResponse> => {
      const response = await api.post<ZZPQuoteConvertResponse>(`/zzp/quotes/${quoteId}/convert`)
      return response.data
    },

    /** Delete a quote (draft only) */
    delete: async (quoteId: string): Promise<void> => {
      await api.delete(`/zzp/quotes/${quoteId}`)
    },

    /**
     * Download quote as PDF blob.
     */
    downloadPdf: async (quoteId: string): Promise<Blob> => {
      const response = await api.get(`/zzp/quotes/${quoteId}/pdf`, {
        responseType: 'blob',
      })
      return response.data as Blob
    },

    /**
     * Get the quote PDF URL for direct download (browser navigation).
     * Includes `?download=1` and `?token=<jwt>` for authenticated downloads.
     */
    getPdfUrl: (quoteId: string): string => {
      let token: string | null = null
      try {
        token = localStorage.getItem('access_token')
      } catch {
        // localStorage may be unavailable in certain browser contexts
      }
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : ''
      return `${api.defaults.baseURL}/zzp/quotes/${quoteId}/pdf?download=1${tokenParam}`
    },
  },

  // ------------ Links / Consent (from zzpConsentApi) ------------
  ...zzpConsentApi,
}
