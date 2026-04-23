// ============ Bank Reconciliation API (types + functions, includes Bank Matching Engine types) ============
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

// ============ Bank Reconciliation Types ============

export type BankTransactionStatus = 'NEW' | 'MATCHED' | 'IGNORED' | 'NEEDS_REVIEW'
export type MatchedType = 'INVOICE' | 'EXPENSE' | 'TRANSFER' | 'MANUAL'
export type ReconciliationAction = 'APPLY_MATCH' | 'IGNORE' | 'CREATE_EXPENSE' | 'UNMATCH'

export interface ColumnMapping {
  date_column?: string
  amount_column?: string
  description_column?: string
  name_column?: string
  iban_column?: string
  reference_column?: string
}

export interface BankImportRequest {
  administration_id: string
  file: File
  bank_account_iban?: string
  bank_name?: string
}

export interface BankImportResponse {
  imported_count: number
  skipped_duplicates_count: number
  total_in_file: number
  errors: string[]
  message: string
  bank_account_id: string | null
}

export interface BankTransaction {
  id: string
  administration_id: string
  bank_account_id: string
  booking_date: string
  amount: string | number
  currency: string
  counterparty_name: string | null
  counterparty_iban: string | null
  description: string
  reference: string | null
  status: BankTransactionStatus
  matched_entity_type: string | null
  matched_entity_id: string | null
  created_at: string
}

export interface BankTransactionListResponse {
  transactions: BankTransaction[]
  total_count: number
  page: number
  page_size: number
}

export interface MatchSuggestion {
  entity_type: MatchedType
  entity_id: string
  entity_reference: string
  confidence_score: number
  amount: string | number
  date: string
  explanation: string
  proposed_action: ReconciliationAction
  learned_rule?: boolean
  expense_category?: string
}

export interface SuggestMatchResponse {
  transaction_id: string
  suggestions: MatchSuggestion[]
  message: string
}

export interface ApplyActionRequest {
  action_type: ReconciliationAction
  match_entity_type?: MatchedType
  match_entity_id?: string
  expense_category?: string
  vat_rate?: number
  notes?: string
}

export interface ApplyActionResponse {
  transaction: BankTransaction
  action_applied: ReconciliationAction
  journal_entry_id: string | null
  message: string
}

export interface ReconciliationActionRecord {
  id: string
  administration_id: string
  accountant_user_id: string
  bank_transaction_id: string
  action_type: ReconciliationAction
  payload: Record<string, unknown> | null
  created_at: string
}

export interface ReconciliationActionsListResponse {
  actions: ReconciliationActionRecord[]
  total_count: number
}

// ============ Bank Matching Engine Types ============

export interface BankKPI {
  matched_percentage: number
  unmatched_count: number
  total_inflow: string | number
  total_outflow: string | number
  period_days: number
  total_transactions: number
  matched_count: number
}

export interface MatchProposal {
  id: string
  transaction_id: string
  entity_type: MatchedType
  entity_id: string
  entity_reference: string
  confidence_score: number
  amount: string | number
  date: string
  reason: string
  proposed_action: ReconciliationAction
  // Status lifecycle: 'suggested' (initial proposal), 'accepted' (user approved), 'rejected' (user declined), 'expired' (no longer valid)
  status: 'suggested' | 'accepted' | 'rejected' | 'expired'
  created_at: string
}

export interface MatchProposalListResponse {
  proposals: MatchProposal[]
  transaction_id: string
}

export interface GenerateProposalsResponse {
  generated_count: number
  message: string
}

export interface ProposalActionResponse {
  proposal: MatchProposal
  transaction: BankTransaction
  message: string
}

export interface UnmatchResponse {
  transaction: BankTransaction
  message: string
}

// ============ Bank Reconciliation API ============

export const bankReconciliationApi = {
  importFile: async (request: BankImportRequest): Promise<BankImportResponse> => {
    const formData = new FormData()
    formData.append('file', request.file)
    if (request.bank_account_iban) {
      formData.append('bank_account_iban', request.bank_account_iban)
    }
    if (request.bank_name) {
      formData.append('bank_name', request.bank_name)
    }
    const response = await api.post<BankImportResponse>(`/accountant/clients/${request.administration_id}/bank/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  listTransactions: async (
    administrationId: string,
    options?: {
      status?: BankTransactionStatus
      q?: string
      dateFrom?: string
      dateTo?: string
      minAmount?: number
      maxAmount?: number
      page?: number
      pageSize?: number
    }
  ): Promise<BankTransactionListResponse> => {
    const params: Record<string, unknown> = {}
    if (options?.status) params.status = options.status
    if (options?.q) params.q = options.q
    if (options?.dateFrom) params.date_from = options.dateFrom
    if (options?.dateTo) params.date_to = options.dateTo
    if (options?.minAmount !== undefined) params.min_amount = options.minAmount
    if (options?.maxAmount !== undefined) params.max_amount = options.maxAmount
    if (options?.page) params.page = options.page
    if (options?.pageSize) params.page_size = options.pageSize
    const response = await api.get<BankTransactionListResponse>(`/accountant/clients/${administrationId}/bank/transactions`, { params })
    return response.data
  },

  suggestMatches: async (transactionId: string, administrationId: string): Promise<SuggestMatchResponse> => {
    const response = await api.post<SuggestMatchResponse>(
      `/accountant/clients/${administrationId}/bank/transactions/${transactionId}/suggest`,
      null
    )
    return response.data
  },

  applyAction: async (
    transactionId: string,
    administrationId: string,
    request: ApplyActionRequest
  ): Promise<ApplyActionResponse> => {
    const response = await api.post<ApplyActionResponse>(
      `/accountant/clients/${administrationId}/bank/transactions/${transactionId}/apply`,
      request
    )
    return response.data
  },

  listActions: async (
    administrationId: string,
    options?: { page?: number; pageSize?: number }
  ): Promise<ReconciliationActionsListResponse> => {
    const params: Record<string, unknown> = {}
    if (options?.page) params.page = options.page
    if (options?.pageSize) params.page_size = options.pageSize
    const response = await api.get<ReconciliationActionsListResponse>(`/accountant/clients/${administrationId}/bank/actions`, { params })
    return response.data
  },

  // ============ Matching Engine Endpoints ============

  getKPI: async (clientId: string): Promise<BankKPI> => {
    const response = await api.get<BankKPI>(`/accountant/clients/${clientId}/bank/kpi`)
    return response.data
  },

  generateProposals: async (clientId: string): Promise<GenerateProposalsResponse> => {
    const response = await api.post<GenerateProposalsResponse>(
      `/accountant/clients/${clientId}/bank/proposals/generate`
    )
    return response.data
  },

  getTransactionProposals: async (
    clientId: string,
    transactionId: string
  ): Promise<MatchProposalListResponse> => {
    const response = await api.get<MatchProposalListResponse>(
      `/accountant/clients/${clientId}/bank/transactions/${transactionId}/proposals`
    )
    return response.data
  },

  acceptProposal: async (clientId: string, proposalId: string): Promise<ProposalActionResponse> => {
    const response = await api.post<ProposalActionResponse>(
      `/accountant/clients/${clientId}/bank/proposals/${proposalId}/accept`
    )
    return response.data
  },

  rejectProposal: async (clientId: string, proposalId: string): Promise<ProposalActionResponse> => {
    const response = await api.post<ProposalActionResponse>(
      `/accountant/clients/${clientId}/bank/proposals/${proposalId}/reject`
    )
    return response.data
  },

  unmatchTransaction: async (clientId: string, transactionId: string): Promise<UnmatchResponse> => {
    const response = await api.post<UnmatchResponse>(
      `/accountant/clients/${clientId}/bank/transactions/${transactionId}/unmatch`
    )
    return response.data
  },
}
