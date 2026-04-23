// ============================================================================
// Subscription API - ZZP Subscription Management (Phase 1)
// ============================================================================
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

export interface SubscriptionResponse {
  id: string
  administration_id: string
  plan_code: string
  status: string
  trial_start_at: string | null
  trial_end_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
  // Provider fields (Mollie integration - Phase 2)
  provider: string | null
  provider_subscription_id: string | null
  scheduled: boolean
  next_payment_date: string | null
  // Entitlement flags
  is_paid: boolean
  in_trial: boolean
  can_use_pro_features: boolean
  days_left_trial: number
  // Force-paywall test mode flag (BILLING_FORCE_PAYWALL=true on backend)
  force_paywall: boolean
}

export interface EntitlementResponse {
  is_paid: boolean
  in_trial: boolean
  can_use_pro_features: boolean
  days_left_trial: number
  status: string
  plan_code: string | null
  // Force-paywall test mode flag (BILLING_FORCE_PAYWALL=true on backend)
  force_paywall: boolean
}

export interface StartTrialResponse {
  subscription_id: string
  status: string
  trial_start_at: string
  trial_end_at: string
  message: string
}

export interface ActivateSubscriptionResponse {
  status: string
  in_trial: boolean
  trial_end_at: string | null
  scheduled: boolean
  provider_subscription_id: string | null
  checkout_url: string | null
}

export interface CancelSubscriptionResponse {
  subscription: {
    status: string
    cancel_at_period_end: boolean
    current_period_end: string | null
  }
  message_nl: string
}

export interface ReactivateSubscriptionResponse {
  subscription: {
    status: string
    cancel_at_period_end: boolean
    scheduled: boolean
    provider_subscription_id: string | null
    trial_end_at?: string | null
  }
  message_nl: string
}

export interface SubscriptionMeResponse {
  status: 'trial' | 'active' | 'expired'
  planCode: string | null
  planName: string | null
  startDate: string | null
  endDate: string | null
  daysRemaining: number
}

export const subscriptionApi = {
  /**
   * Get current user's subscription status and entitlements.
   * Auto-starts trial if no subscription exists.
   */
  getMySubscription: async (): Promise<SubscriptionResponse> => {
    const response = await api.get('/me/subscription')
    return response.data
  },

  /**
   * Start a trial subscription for the current user.
   * Idempotent - returns existing subscription if already started.
   */
  startTrial: async (): Promise<StartTrialResponse> => {
    const response = await api.post('/me/subscription/start-trial', {})
    return response.data
  },

  /**
   * Get entitlement status for the current user.
   * Lightweight endpoint for checking feature availability.
   */
  getEntitlements: async (): Promise<EntitlementResponse> => {
    const response = await api.get('/me/subscription/entitlements')
    return response.data
  },

  /**
   * Activate Mollie subscription (Upgrade to Pro).
   * Creates a Mollie first-payment checkout and returns checkout_url.
   * The caller must redirect `window.location.href = result.checkout_url`.
   * Idempotent for already-ACTIVE subscriptions (returns existing status).
   */
  activateSubscription: async (planCode?: string): Promise<ActivateSubscriptionResponse> => {
    const response = await api.post('/me/subscription/activate', { plan_code: planCode ?? null })
    return response.data
  },

  /**
   * Cancel Mollie subscription at period end (Phase 2).
   * The subscription will remain active until the end of the current billing period.
   */
  cancelSubscription: async (): Promise<CancelSubscriptionResponse> => {
    const response = await api.post('/me/subscription/cancel', {})
    return response.data
  },

  /**
   * Reactivate a canceled or expired subscription (Phase 2).
   * Creates a new subscription if needed, or removes cancellation flag.
   * Idempotent - returns existing status if already active.
   */
  reactivateSubscription: async (): Promise<ReactivateSubscriptionResponse> => {
    const response = await api.post('/me/subscription/reactivate', {})
    return response.data
  },

  /**
   * Get simplified subscription summary for ZZP settings page.
   * Returns status (trial/active/expired), start/end dates, and days remaining.
   */
  getSubscriptionMe: async (): Promise<SubscriptionMeResponse> => {
    const response = await api.get('/subscription/me')
    return response.data
  },
}
