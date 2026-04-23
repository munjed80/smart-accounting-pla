// ============================================================================
// ZZP E-commerce Integrations API
// ============================================================================
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

export interface EcommerceConnectionResponse {
  id: string
  provider: 'shopify' | 'woocommerce'
  status: 'connected' | 'disconnected' | 'error'
  shop_name: string | null
  shop_url: string | null
  last_sync_at: string | null
  last_sync_error: string | null
  last_sync_orders_count: number
  created_at: string
  updated_at: string
}

export interface EcommerceOrderResponse {
  id: string
  connection_id: string
  provider: string | null
  external_order_id: string
  external_order_number: string | null
  status: string
  customer_name: string | null
  customer_email: string | null
  currency: string
  total_amount_cents: number
  subtotal_cents: number
  tax_cents: number
  shipping_cents: number
  discount_cents: number
  ordered_at: string | null
  paid_at: string | null
  created_at: string
}

export interface EcommerceSyncLogResponse {
  id: string
  connection_id: string
  status: string
  trigger: string
  orders_imported: number
  orders_updated: number
  customers_imported: number
  refunds_imported: number
  error_message: string | null
  duration_ms: number | null
  started_at: string
  finished_at: string | null
}

export interface EcommerceCustomerResponse {
  id: string
  connection_id: string
  external_customer_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  company: string | null
  phone: string | null
  total_orders: number
  total_spent_cents: number
  currency: string
  created_at: string
}

export interface EcommerceRefundResponse {
  id: string
  connection_id: string
  external_refund_id: string
  external_order_id: string | null
  amount_cents: number
  currency: string
  reason: string | null
  refunded_at: string | null
  created_at: string
}

export interface SyncTriggerResponse {
  message: string
  sync_log_id: string
  status: string
  orders_imported: number
  orders_updated: number
  customers_imported: number
  refunds_imported: number
  error: string | null
}

export interface IntegrationEntitlementsResponse {
  can_use_integrations: boolean
  plan_code: string | null
  is_pro: boolean
  in_trial: boolean
  status: string
}

export const integrationsApi = {
  /** List all e-commerce connections */
  listConnections: async (): Promise<{ connections: EcommerceConnectionResponse[] }> => {
    const response = await api.get('/zzp/integrations')
    return response.data
  },

  /** Check if user can use integrations (Pro plan) */
  checkEntitlements: async (): Promise<IntegrationEntitlementsResponse> => {
    const response = await api.get('/zzp/integrations/entitlements')
    return response.data
  },

  /** Connect Shopify store */
  connectShopify: async (data: { shop_url: string; access_token: string; shop_name?: string }): Promise<EcommerceConnectionResponse> => {
    const response = await api.post('/zzp/integrations/shopify', data)
    return response.data
  },

  /** Connect WooCommerce store */
  connectWooCommerce: async (data: { shop_url: string; consumer_key: string; consumer_secret: string; shop_name?: string }): Promise<EcommerceConnectionResponse> => {
    const response = await api.post('/zzp/integrations/woocommerce', data)
    return response.data
  },

  /** Trigger sync for a connection */
  triggerSync: async (connectionId: string): Promise<SyncTriggerResponse> => {
    const response = await api.post(`/zzp/integrations/${connectionId}/sync`)
    return response.data
  },

  /** Disconnect integration (keeps imported data) */
  disconnect: async (connectionId: string): Promise<EcommerceConnectionResponse> => {
    const response = await api.post(`/zzp/integrations/${connectionId}/disconnect`)
    return response.data
  },

  /** Delete integration and all imported data */
  deleteConnection: async (connectionId: string): Promise<void> => {
    await api.delete(`/zzp/integrations/${connectionId}`)
  },

  /** List imported orders */
  listOrders: async (connectionId: string, page = 1, perPage = 25): Promise<{ orders: EcommerceOrderResponse[]; total: number; page: number; per_page: number }> => {
    const response = await api.get(`/zzp/integrations/${connectionId}/orders`, { params: { page, per_page: perPage } })
    return response.data
  },

  /** List imported customers */
  listCustomers: async (connectionId: string): Promise<{ customers: EcommerceCustomerResponse[]; total: number }> => {
    const response = await api.get(`/zzp/integrations/${connectionId}/customers`)
    return response.data
  },

  /** List imported refunds */
  listRefunds: async (connectionId: string): Promise<{ refunds: EcommerceRefundResponse[]; total: number }> => {
    const response = await api.get(`/zzp/integrations/${connectionId}/refunds`)
    return response.data
  },

  /** List sync logs */
  listSyncLogs: async (connectionId: string, limit = 20): Promise<{ logs: EcommerceSyncLogResponse[]; total: number }> => {
    const response = await api.get(`/zzp/integrations/${connectionId}/sync-logs`, { params: { limit } })
    return response.data
  },
}
