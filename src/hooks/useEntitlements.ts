/**
 * useEntitlements Hook - Subscription entitlement management
 * 
 * Provides subscription status and entitlement flags for feature gating.
 * Auto-fetches subscription data on mount and provides helpers for checking feature access.
 */
import { subscriptionApi, type EntitlementResponse, type SubscriptionResponse } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'
import { useQuery } from '@tanstack/react-query'

// Roles that bypass subscription checks
const SUBSCRIPTION_BYPASS_ROLES = ['accountant', 'admin', 'super_admin']

export interface UseEntitlementsResult {
  entitlements: EntitlementResponse | null
  subscription: SubscriptionResponse | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
  canUseFeature: (feature: string) => boolean
  isAccountantBypass: boolean
}

/**
 * Hook to fetch and manage subscription entitlements.
 * 
 * Returns entitlement flags and helper functions for feature gating.
 * Accountants always have full access (bypass subscription checks).
 * 
 * @returns UseEntitlementsResult with entitlement data and helpers
 */
export const useEntitlements = (): UseEntitlementsResult => {
  const { user } = useAuth()
  
  // Accountants and admins bypass subscription checks
  const isAccountantBypass = user?.role && SUBSCRIPTION_BYPASS_ROLES.includes(user.role)
  
  // Fetch subscription (includes entitlements)
  const { data: subscription, isLoading, error, refetch } = useQuery<SubscriptionResponse>({
    queryKey: ['subscription', user?.id],
    queryFn: subscriptionApi.getMySubscription,
    enabled: !!user && !isAccountantBypass,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  })
  
  // If accountant, return full access
  if (isAccountantBypass) {
    return {
      entitlements: {
        is_paid: true,
        in_trial: false,
        can_use_pro_features: true,
        days_left_trial: 0,
        status: 'ACCOUNTANT_BYPASS',
        plan_code: null,
      },
      subscription: null,
      isLoading: false,
      error: null,
      refetch,
      canUseFeature: () => true,
      isAccountantBypass: true,
    }
  }
  
  /**
   * Check if user can use a specific feature.
   * Returns true if user has entitlement or is in trial.
   */
  const canUseFeature = (feature: string): boolean => {
    // If no subscription loaded yet, assume blocked
    if (!subscription) return false
    
    // Check general pro feature access
    return subscription.can_use_pro_features
  }
  
  // Extract entitlements from subscription
  const entitlements: EntitlementResponse | null = subscription ? {
    is_paid: subscription.is_paid,
    in_trial: subscription.in_trial,
    can_use_pro_features: subscription.can_use_pro_features,
    days_left_trial: subscription.days_left_trial,
    status: subscription.status,
    plan_code: subscription.plan_code,
  } : null
  
  return {
    entitlements,
    subscription,
    isLoading,
    error: error as Error | null,
    refetch,
    canUseFeature,
    isAccountantBypass: false,
  }
}
