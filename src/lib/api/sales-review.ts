// ============================================================================
// Phase 2: E-commerce Sales Review API
// ============================================================================
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

export type MappingReviewStatus = 'new' | 'needs_review' | 'mapped' | 'approved' | 'posted' | 'skipped' | 'duplicate' | 'error'

export interface EcommerceMappingResponse {
  id: string
  administration_id: string
  connection_id: string
  order_id: string | null
  refund_id: string | null
  record_type: 'order' | 'refund'
  review_status: MappingReviewStatus
  provider: string
  external_ref: string | null
  revenue_cents: number
  tax_cents: number
  shipping_cents: number
  discount_cents: number
  refund_cents: number
  net_amount_cents: number
  vat_rate: number | null
  vat_amount_cents: number
  vat_status: string
  currency: string
  accounting_date: string | null
  notes: string | null
  posted_entity_type: string | null
  posted_entity_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  approved_by: string | null
  approved_at: string | null
  posted_by: string | null
  posted_at: string | null
  created_at: string
  updated_at: string
  // Denormalized source data
  customer_name: string | null
  customer_email: string | null
  total_amount_cents: number
  ordered_at: string | null
  external_order_number: string | null
}

export interface MappingListResponse {
  mappings: EcommerceMappingResponse[]
  total: number
  page: number
  per_page: number
  status_counts: Record<string, number>
}

export interface GenerateMappingsResponse {
  created: number
  skipped_existing: number
  total_orders: number
  total_refunds: number
}

export interface BulkMappingActionResponse {
  processed: number
  skipped: number
  errors: number
  details: Array<{ id: string; status: string }>
}

export const salesReviewApi = {
  /** Generate mapping records from imported orders/refunds */
  generateMappings: async (connectionId?: string): Promise<GenerateMappingsResponse> => {
    const params = connectionId ? { connection_id: connectionId } : {}
    const response = await api.post('/zzp/integrations/sales-review/generate', null, { params })
    return response.data
  },

  /** List mapping records (review workspace) */
  listMappings: async (params: {
    page?: number
    per_page?: number
    review_status?: string
    record_type?: string
    provider?: string
    connection_id?: string
  } = {}): Promise<MappingListResponse> => {
    const response = await api.get('/zzp/integrations/sales-review', { params })
    return response.data
  },

  /** Get a single mapping */
  getMapping: async (mappingId: string): Promise<EcommerceMappingResponse> => {
    const response = await api.get(`/zzp/integrations/sales-review/${mappingId}`)
    return response.data
  },

  /** Perform an action on a mapping (approve, post, skip, mark_duplicate, reset, needs_review) */
  mappingAction: async (
    mappingId: string,
    action: string,
    data?: { notes?: string; vat_rate?: number; accounting_date?: string }
  ): Promise<EcommerceMappingResponse> => {
    const response = await api.post(`/zzp/integrations/sales-review/${mappingId}/action`, {
      action,
      ...data,
    })
    return response.data
  },

  /** Bulk action on multiple mappings */
  bulkAction: async (
    mappingIds: string[],
    action: string,
    notes?: string
  ): Promise<BulkMappingActionResponse> => {
    const response = await api.post('/zzp/integrations/sales-review/bulk-action', {
      mapping_ids: mappingIds,
      action,
      notes,
    })
    return response.data
  },

  /** Get summary/status counts */
  getSummary: async (): Promise<{ total: number; status_counts: Record<string, number> }> => {
    const response = await api.get('/zzp/integrations/sales-review/summary')
    return response.data
  },
}
