/**
 * SubscriptionCard Component
 * 
 * Displays detailed subscription information in Settings page.
 * Shows trial end date, next payment date, period end date if cancel requested.
 */
import { useState, useEffect } from 'react'
import { subscriptionApi, SubscriptionResponse } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  CreditCard,
  Calendar,
  AlertTriangle,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/utils'

export const SubscriptionCard = () => {
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCanceling, setIsCanceling] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  
  useEffect(() => {
    fetchSubscription()
  }, [])
  
  const fetchSubscription = async () => {
    setIsLoading(true)
    try {
      const data = await subscriptionApi.getMySubscription()
      setSubscription(data)
    } catch (error) {
      console.error('Failed to fetch subscription:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleActivate = async () => {
    setIsActivating(true)
    
    try {
      const result = await subscriptionApi.activateSubscription()
      
      // Refetch subscription to update UI
      await fetchSubscription()
      
      // Show success message
      if (result.scheduled) {
        toast.success(
          'Abonnement gepland',
          { description: `Je abonnement start automatisch na de proefperiode${result.trial_end_at ? ` op ${new Date(result.trial_end_at).toLocaleDateString('nl-NL')}` : ''}.` }
        )
      } else {
        toast.success(
          'Abonnement actief',
          { description: 'Je abonnement is nu actief. Je hebt toegang tot alle functies.' }
        )
      }
    } catch (error: any) {
      console.error('Failed to activate subscription:', error)
      toast.error(
        'Activatie mislukt',
        { description: error.response?.data?.detail?.message || 'Er is een fout opgetreden bij het activeren van je abonnement.' }
      )
    } finally {
      setIsActivating(false)
    }
  }
  
  const handleCancel = async () => {
    if (!confirm('Weet je zeker dat je je abonnement wilt opzeggen? Je behoud toegang tot het einde van de huidige periode.')) {
      return
    }
    
    setIsCanceling(true)
    
    try {
      const result = await subscriptionApi.cancelSubscription()
      
      // Refetch subscription to update UI
      await fetchSubscription()
      
      const periodEndDate = result.current_period_end 
        ? new Date(result.current_period_end).toLocaleDateString('nl-NL')
        : 'het einde van de periode'
      
      toast.success(
        'Abonnement opgezegd',
        { description: `Je abonnement blijft actief tot ${periodEndDate}.` }
      )
    } catch (error: any) {
      console.error('Failed to cancel subscription:', error)
      toast.error(
        'Annulering mislukt',
        { description: error.response?.data?.detail?.message || 'Er is een fout opgetreden bij het annuleren van je abonnement.' }
      )
    } finally {
      setIsCanceling(false)
    }
  }
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }
  
  if (!subscription) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Kon abonnementsgegevens niet laden
        </AlertDescription>
      </Alert>
    )
  }
  
  const { status, in_trial, days_left_trial, trial_end_at, current_period_end, cancel_at_period_end, scheduled } = subscription
  
  // Status badge
  const StatusBadge = () => {
    if (status === 'ACTIVE') {
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <CheckCircle className="h-3 w-3 mr-1" />
          Actief
        </Badge>
      )
    } else if (status === 'TRIALING') {
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-200">
          <Clock className="h-3 w-3 mr-1" />
          Proefperiode
        </Badge>
      )
    } else if (status === 'PAST_DUE') {
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          Betaling achterstallig
        </Badge>
      )
    } else if (status === 'CANCELED') {
      return (
        <Badge variant="outline" className="border-red-300 text-red-700">
          <XCircle className="h-3 w-3 mr-1" />
          Geannuleerd
        </Badge>
      )
    } else if (status === 'EXPIRED') {
      return (
        <Badge variant="outline" className="border-orange-300 text-orange-700">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Verlopen
        </Badge>
      )
    }
    return <Badge variant="outline">{status}</Badge>
  }
  
  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">ZZP Basic</h3>
          <p className="text-sm text-muted-foreground">€6,95 per maand</p>
        </div>
        <StatusBadge />
      </div>
      
      <Separator />
      
      {/* Subscription Details */}
      <div className="space-y-3">
        {/* Trial Info */}
        {in_trial && trial_end_at && (
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Proefperiode eindigt</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">
                {new Date(trial_end_at).toLocaleDateString('nl-NL', { 
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </div>
              <div className="text-xs text-muted-foreground">
                {days_left_trial} {days_left_trial === 1 ? 'dag' : 'dagen'} over
              </div>
            </div>
          </div>
        )}
        
        {/* Scheduled Info */}
        {scheduled && (
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Betaling start</span>
            </div>
            <div className="text-sm font-medium">
              Na proefperiode
            </div>
          </div>
        )}
        
        {/* Next Payment Date */}
        {status === 'ACTIVE' && current_period_end && !cancel_at_period_end && (
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Volgende betaling</span>
            </div>
            <div className="text-sm font-medium">
              {new Date(current_period_end).toLocaleDateString('nl-NL', { 
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </div>
          </div>
        )}
        
        {/* Period End Date (if cancel requested) */}
        {cancel_at_period_end && current_period_end && (
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <span className="text-muted-foreground">Abonnement eindigt</span>
            </div>
            <div className="text-sm font-medium text-orange-700">
              {new Date(current_period_end).toLocaleDateString('nl-NL', { 
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </div>
          </div>
        )}
      </div>
      
      <Separator />
      
      {/* Action Buttons */}
      <div className="space-y-2">
        {/* Show activate button for TRIALING/EXPIRED without scheduled subscription */}
        {(status === 'TRIALING' || status === 'EXPIRED') && !scheduled && (
          <Button 
            className="w-full"
            onClick={handleActivate}
            disabled={isActivating}
          >
            {isActivating ? 'Bezig...' : 'Abonnement activeren'}
          </Button>
        )}
        
        {/* Show cancel button for ACTIVE subscription */}
        {status === 'ACTIVE' && !cancel_at_period_end && (
          <Button 
            variant="outline"
            className="w-full border-red-300 text-red-700 hover:bg-red-50"
            onClick={handleCancel}
            disabled={isCanceling}
          >
            {isCanceling ? 'Bezig...' : 'Abonnement opzeggen'}
          </Button>
        )}
        
        {/* Status Messages */}
        {status === 'PAST_DUE' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Je betaling is achterstallig. Werk je betaalgegevens bij om toegang te behouden.
            </AlertDescription>
          </Alert>
        )}
        
        {cancel_at_period_end && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Je abonnement is opgezegd en blijft actief tot het einde van de huidige periode.
            </AlertDescription>
          </Alert>
        )}
        
        {scheduled && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Je abonnement is gepland en start automatisch na de proefperiode.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
