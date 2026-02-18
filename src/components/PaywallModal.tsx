/**
 * PaywallModal Component
 * 
 * Modal that blocks gated actions when subscription is required.
 * Shows clear messaging about subscription requirement and activation button.
 */
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Lock, Sparkles } from 'lucide-react'
import { useEntitlements } from '@/hooks/useEntitlements'
import { subscriptionApi } from '@/lib/api'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'

export interface PaywallModalProps {
  open: boolean
  onClose: () => void
  feature: string
  featureNameNL: string
}

/**
 * Paywall modal that explains subscription requirement.
 * 
 * @param open - Whether modal is visible
 * @param onClose - Callback when modal is closed
 * @param feature - Feature code (e.g., "vat_actions")
 * @param featureNameNL - Dutch display name (e.g., "BTW-aangifte acties")
 */
export const PaywallModal = ({ open, onClose, feature, featureNameNL }: PaywallModalProps) => {
  const { entitlements, refetch } = useEntitlements()
  const { toast } = useToast()
  const [isActivating, setIsActivating] = useState(false)
  
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
      
      onClose()
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
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
            <Lock className="h-6 w-6 text-orange-600" />
          </div>
          <DialogTitle className="text-center">Abonnement vereist</DialogTitle>
          <DialogDescription className="text-center">
            {(() => {
              const status = entitlements?.status
              
              // EXPIRED or TRIAL ended
              if (status === 'EXPIRED' || (status === 'TRIALING' && !entitlements?.can_use_pro_features)) {
                return (
                  <>
                    Je <strong>proefperiode is afgelopen</strong>. Activeer een abonnement om <strong>{featureNameNL}</strong> te blijven gebruiken.
                  </>
                )
              }
              
              // PAST_DUE - payment failed
              if (status === 'PAST_DUE') {
                return (
                  <>
                    Je <strong>betaling is achterstallig</strong>. Werk je betaalgegevens bij om toegang tot <strong>{featureNameNL}</strong> te herstellen.
                  </>
                )
              }
              
              // CANCELED
              if (status === 'CANCELED') {
                return (
                  <>
                    Je abonnement is <strong>geannuleerd</strong>. Activeer een nieuw abonnement om <strong>{featureNameNL}</strong> te gebruiken.
                  </>
                )
              }
              
              // Default message
              return (
                <>
                  Deze functie (<strong>{featureNameNL}</strong>) is alleen beschikbaar met een actief abonnement.
                </>
              )
            })()}
          </DialogDescription>
        </DialogHeader>
        
        <div className="my-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-900 mb-2">ZZP Basic - €6,95/maand</h4>
              <ul className="space-y-1.5 text-sm text-blue-800">
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Onbeperkt aantal facturen
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  BTW-aangifte met Digipoort
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Bankrekening koppeling
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Exports (PDF, CSV)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  5 GB opslag
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex gap-2 sm:justify-center">
          <Button variant="outline" onClick={onClose} disabled={isActivating}>
            Annuleren
          </Button>
          <Button 
            onClick={handleActivate} 
            className="bg-orange-600 hover:bg-orange-700"
            disabled={isActivating}
          >
            {isActivating ? 'Bezig...' : 'Abonnement activeren'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Helper hook to show paywall modal with standard error handling.
 * Returns a function that can be called to potentially show the paywall.
 * 
 * @returns showPaywallIfNeeded function
 */
export const usePaywallCheck = () => {
  const { canUseFeature, isAccountantBypass } = useEntitlements()
  
  /**
   * Check if paywall should be shown before executing an action.
   * 
   * @param feature - Feature code to check
   * @returns true if action can proceed, false if paywall blocks
   */
  const shouldShowPaywall = (feature: string): boolean => {
    // Accountants bypass paywall
    if (isAccountantBypass) return false
    
    // Check if user can use feature
    return !canUseFeature(feature)
  }
  
  return { shouldShowPaywall }
}
