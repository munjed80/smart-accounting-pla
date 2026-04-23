// ============ Document Review Queue API (types + functions) ============
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

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
