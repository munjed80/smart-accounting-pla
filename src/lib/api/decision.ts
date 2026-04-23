// ============ Decision Engine API (types + functions) ============
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

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
