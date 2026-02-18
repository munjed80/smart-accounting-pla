/**
 * useEntitlements Hook - Subscription entitlement management
 * 
 * Provides subscription status and entitlement flags for feature gating.
 * Auto-fetches subscription data on mount and provides helpers for checking feature access.
 */
import { useEffect, useState } from 'react'
import { subscriptionApi, type EntitlementResponse } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'
import { useQuery } from '@tanstack/react-query'

export interface UseEntitlementsResult {
  entitlements: EntitlementResponse | null
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
  const isAccountantBypass = user?.role === 'accountant' || user?.role === 'admin' || user?.role === 'super_admin'
  
  // Fetch entitlements (disabled for accountants)
  const { data, isLoading, error, refetch } = useQuery<EntitlementResponse>({
    queryKey: ['entitlements', user?.id],
    queryFn: subscriptionApi.getEntitlements,
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
    // If no entitlements loaded yet, assume blocked
    if (!data) return false
    
    // Check general pro feature access
    return data.can_use_pro_features
  }
  
  return {
    entitlements: data || null,
    isLoading,
    error: error as Error | null,
    refetch,
    canUseFeature,
    isAccountantBypass: false,
  }
}
