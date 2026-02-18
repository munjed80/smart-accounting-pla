/**
 * SubscriptionBanner Component
 * 
 * Displays subscription status banner at the top of the page.
 * Shows trial status, days remaining, or subscription active/expired messages.
 */
import { AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useEntitlements } from '@/hooks/useEntitlements'
import { subscriptionApi } from '@/lib/api'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'

export const SubscriptionBanner = () => {
  const { entitlements, subscription, isLoading, isAccountantBypass, refetch } = useEntitlements()
  const { toast } = useToast()
  const [isActivating, setIsActivating] = useState(false)
  
  // Don't show banner for accountants
  if (isAccountantBypass || isLoading || !entitlements) {
    return null
  }
  
  const { in_trial, days_left_trial, status, can_use_pro_features } = entitlements
  
  const handleActivate = async () => {
    setIsActivating(true)
    
    try {
      const result = await subscriptionApi.activateSubscription()
      
      // Refetch entitlements to update UI
      await refetch()
      
      // Show success message
      if (result.scheduled) {
        toast({
          title: 'Abonnement gepland',
          description: `Je abonnement start automatisch na de proefperiode${result.trial_end_at ? ` op ${new Date(result.trial_end_at).toLocaleDateString('nl-NL')}` : ''}.`,
          variant: 'default',
        })
      } else {
        toast({
          title: 'Abonnement actief',
          description: 'Je abonnement is nu actief. Je hebt toegang tot alle functies.',
          variant: 'default',
        })
      }
    } catch (error: any) {
      console.error('Failed to activate subscription:', error)
      
      toast({
        title: 'Activatie mislukt',
        description: error.response?.data?.detail?.message || 'Er is een fout opgetreden bij het activeren van je abonnement.',
        variant: 'destructive',
      })
    } finally {
      setIsActivating(false)
    }
  }
  
  // In trial - show days remaining and scheduled status
  if (in_trial && can_use_pro_features) {
    // Check if subscription is scheduled
    const isScheduled = subscription?.scheduled || false
    
    return (
      <Alert className="mb-4 border-blue-200 bg-blue-50" role="status" aria-live="polite">
        <Clock className="h-4 w-4 text-blue-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-blue-900">
            <strong>Proefperiode actief</strong> — {days_left_trial} {days_left_trial === 1 ? 'dag' : 'dagen'} over
            {isScheduled && <span className="ml-2 text-sm">(Abonnement gepland na proefperiode)</span>}
          </span>
          {!isScheduled && (
            <Button 
              variant="outline" 
              size="sm"
              className="ml-4 border-blue-600 text-blue-600 hover:bg-blue-100"
              onClick={handleActivate}
              disabled={isActivating}
            >
              {isActivating ? 'Bezig...' : 'Abonnement activeren'}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }
  
  // Trial expired - prompt to activate
  if (status === 'EXPIRED' || (status === 'TRIALING' && !can_use_pro_features)) {
    return (
      <Alert className="mb-4 border-orange-200 bg-orange-50">
        <AlertCircle className="h-4 w-4 text-orange-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-orange-900">
            <strong>Proefperiode afgelopen</strong> — activeer abonnement om door te gaan (€6,95/maand)
          </span>
          <Button 
            variant="default" 
            size="sm"
            className="ml-4 bg-orange-600 hover:bg-orange-700"
            onClick={handleActivate}
            disabled={isActivating}
          >
            {isActivating ? 'Bezig...' : 'Nu activeren'}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  
  // Active paid subscription
  if (status === 'ACTIVE' && can_use_pro_features) {
    // Check if subscription is marked for cancellation
    const cancelAtPeriodEnd = subscription?.cancel_at_period_end || false
    const periodEnd = subscription?.current_period_end
    
    if (cancelAtPeriodEnd && periodEnd) {
      return (
        <Alert className="mb-4 border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-900">
            <strong>Abonnement opgezegd</strong> — blijft actief tot {new Date(periodEnd).toLocaleDateString('nl-NL')}
          </AlertDescription>
        </Alert>
      )
    }
    
    return (
      <Alert className="mb-4 border-green-200 bg-green-50">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-900">
          <strong>Abonnement actief</strong> — ZZP Basic (€6,95/maand)
        </AlertDescription>
      </Alert>
    )
  }
  
  // Past due - payment failed
  if (status === 'PAST_DUE') {
    return (
      <Alert className="mb-4 border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-red-900">
            <strong>Betaling achterstallig</strong> — werk je betaalgegevens bij om toegang te behouden
          </span>
          <Button 
            variant="default" 
            size="sm"
            className="ml-4 bg-red-600 hover:bg-red-700"
            onClick={handleActivate}
            disabled={isActivating}
          >
            {isActivating ? 'Bezig...' : 'Bijwerken'}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  
  // Canceled subscription
  if (status === 'CANCELED') {
    return (
      <Alert className="mb-4 border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-red-900">
            <strong>Abonnement geannuleerd</strong> — verlengd niet automatisch
          </span>
          <Button 
            variant="outline" 
            size="sm"
            className="ml-4 border-red-600 text-red-600 hover:bg-red-100"
            onClick={handleActivate}
            disabled={isActivating}
          >
            {isActivating ? 'Bezig...' : 'Heractiveren'}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  
  // Don't show banner for other states
  return null
}
