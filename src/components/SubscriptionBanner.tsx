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
import { toast } from 'sonner'

export const SubscriptionBanner = () => {
  const { entitlements, subscription, isLoading, isAccountantBypass, refetch } = useEntitlements()
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
        toast.success('Abonnement gepland', {
          description: `Je abonnement start automatisch na de proefperiode${result.trial_end_at ? ` op ${new Date(result.trial_end_at).toLocaleDateString('nl-NL')}` : ''}.`,
        })
      } else {
        toast.success('Abonnement actief', {
          description: 'Je abonnement is nu actief. Je hebt toegang tot alle functies.',
        })
      }
    } catch (error: any) {
      console.error('Failed to activate subscription:', error)
      
      toast.error('Activatie mislukt', {
        description: error.response?.data?.detail?.message || 'Er is een fout opgetreden bij het activeren van je abonnement.',
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
  
  // PAST_DUE - payment failed
  if (status === 'PAST_DUE') {
    return (
      <Alert className="mb-4 border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-red-900">
            <strong>Betaling mislukt</strong> — Activeer opnieuw om functies te herstellen
          </span>
          <Button 
            variant="default" 
            size="sm"
            className="ml-4 bg-red-600 hover:bg-red-700"
            onClick={handleActivate}
            disabled={isActivating}
          >
            {isActivating ? 'Bezig...' : 'Opnieuw activeren'}
          </Button>
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
    return (
      <Alert className="mb-4 border-green-200 bg-green-50">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-900">
          <strong>Abonnement actief</strong> — ZZP Basic (€6,95/maand)
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
