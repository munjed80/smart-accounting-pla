// ============ Admin API ============
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

export interface AdminOverview {
  users_count: number
  administrations_count: number
  active_subscriptions_count: number
  mrr_estimate: number
  invoices_last_30_days: number
}

export interface AdminCompanyRow {
  id: string
  name: string
  owner_email: string | null
  plan: string | null
  subscription_status: 'trial' | 'active' | 'past_due' | 'canceled' | null
  created_at: string
  last_activity: string | null
}

export interface AdminUserRow {
  id: string
  email: string
  full_name: string
  role: 'zzp' | 'accountant' | 'admin' | 'super_admin'
  is_active: boolean
  last_login_at: string | null
  administration_membership_count: number
}

export type ContactMessageStatus = 'NEW' | 'READ' | 'RESOLVED'

export interface ContactMessageListItem {
  id: string
  created_at: string
  status: ContactMessageStatus
  name: string | null
  email: string
  subject: string | null
  message_snippet: string
}

export interface ContactMessageListResponse {
  items: ContactMessageListItem[]
  total: number
  page: number
  page_size: number
}

export interface ContactMessageDetail {
  id: string
  created_at: string
  updated_at: string
  status: ContactMessageStatus
  name: string | null
  email: string
  subject: string | null
  message: string
  page_url: string | null
  user_id: string | null
  user_agent: string | null
  administration_id: string | null
  internal_note: string | null
}

export interface AdminSubscriptionDetail {
  administration_id: string
  subscription_id: string | null
  plan_code: string | null
  status: string | null
  trial_start_at: string | null
  trial_end_at: string | null
  days_remaining: number | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  provider: string | null
  provider_subscription_id: string | null
  is_paid: boolean
  can_extend_trial: boolean
}

export interface ExtendTrialRequest {
  extend_days?: number
  new_trial_end?: string
  reason: string
}

export interface ExtendTrialResponse {
  message: string
  new_trial_end: string | null
  new_status: string
}

export const adminApi = {
  getOverview: async (): Promise<AdminOverview> => {
    const response = await api.get('/admin/overview')
    return response.data
  },
  getAdministrations: async (params?: { query?: string; status?: string; plan?: string }): Promise<{ administrations: AdminCompanyRow[]; total: number }> => {
    const response = await api.get('/admin/administrations', { params })
    return response.data
  },
  getUsers: async (params?: { query?: string; role?: string }): Promise<{ users: AdminUserRow[]; total: number }> => {
    const response = await api.get('/admin/users', { params })
    return response.data
  },
  updateUserStatus: async (userId: string, is_active: boolean): Promise<{ message: string }> => {
    const response = await api.patch(`/admin/users/${userId}/status`, { is_active })
    return response.data
  },
  updateAdministrationSubscription: async (administrationId: string, payload: { plan_id?: string; status?: string; starts_at?: string; ends_at?: string | null }): Promise<{ message: string }> => {
    const response = await api.patch(`/admin/administrations/${administrationId}/subscription`, payload)
    return response.data
  },
  impersonate: async (userId: string): Promise<{ access_token: string; token_type: string; impersonated_user_id: string }> => {
    const response = await api.post(`/admin/impersonate/${userId}`)
    return response.data
  },
  getSystemLogs: async (limit = 50): Promise<{ logs: { id: string; action: string; target_type: string; target_id: string; created_at: string; actor_user_id: string | null }[] }> => {
    const response = await api.get('/admin/logs', { params: { limit } })
    return response.data
  },
  listContactMessages: async (params?: {
    page?: number
    page_size?: number
    status?: string
    q?: string
    date_from?: string
    date_to?: string
  }): Promise<ContactMessageListResponse> => {
    const response = await api.get('/admin/contact-messages', { params })
    return response.data
  },
  getContactMessage: async (id: string): Promise<ContactMessageDetail> => {
    const response = await api.get(`/admin/contact-messages/${id}`)
    return response.data
  },
  updateContactMessage: async (id: string, payload: { status?: string; internal_note?: string }): Promise<ContactMessageDetail> => {
    const response = await api.patch(`/admin/contact-messages/${id}`, payload)
    return response.data
  },
  getSubscriptionDetail: async (administrationId: string): Promise<AdminSubscriptionDetail> => {
    const response = await api.get(`/admin/administrations/${administrationId}/subscription-detail`)
    return response.data
  },
  extendTrial: async (administrationId: string, payload: ExtendTrialRequest): Promise<ExtendTrialResponse> => {
    const response = await api.post(`/admin/administrations/${administrationId}/extend-trial`, payload)
    return response.data
  },
}
