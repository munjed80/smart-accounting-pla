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
import { toast } from 'sonner'

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
  const [isActivating, setIsActivating] = useState(false)
  
  const handleActivate = async (planCode: string) => {
    setIsActivating(true)
    
    try {
      const result = await subscriptionApi.activateSubscription(planCode)
      
      // Redirect to Mollie checkout for immediate payment
      if (result.checkout_url) {
        window.location.href = result.checkout_url
        return
      }
      
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
      
      onClose()
    } catch (error: any) {
      console.error('Failed to activate subscription:', error)
      
      toast.error('Activatie mislukt', {
        description: error.response?.data?.detail?.message || 'Er is een fout opgetreden bij het activeren van je abonnement.',
      })
    } finally {
      setIsActivating(false)
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
            <Lock className="h-6 w-6 text-orange-600" />
          </div>
          <DialogTitle className="text-center">Abonnement vereist</DialogTitle>
          <DialogDescription className="text-center">
            {entitlements?.status === 'PAST_DUE' ? (
              <>
                Betaling mislukt. Activeer opnieuw om functies te herstellen.
              </>
            ) : entitlements?.status === 'TRIALING' ? (
              <>
                Proefperiode actief — {entitlements.days_left_trial} {entitlements.days_left_trial === 1 ? 'dag' : 'dagen'}.
              </>
            ) : (
              <>
                Deze functie (<strong>{featureNameNL}</strong>) is alleen beschikbaar met een actief abonnement.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="my-4 space-y-3">
          {/* Starter plan */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-blue-900 mb-2">Starter — €4,95/maand</h4>
                <ul className="space-y-1.5 text-sm text-blue-800">
                  <li className="flex items-center gap-2">
                    <span className="text-blue-600">✓</span>
                    Onbeperkt aantal facturen
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-600">✓</span>
                    Urenregistratie & agenda
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-600">✓</span>
                    5 GB opslag
                  </li>
                </ul>
                <Button
                  size="sm"
                  className="mt-3 bg-blue-600 hover:bg-blue-700"
                  onClick={() => handleActivate('starter')}
                  disabled={isActivating}
                >
                  {isActivating ? 'Bezig...' : 'Kies Starter'}
                </Button>
              </div>
            </div>
          </div>

          {/* Pro plan */}
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-purple-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-purple-900 mb-2">
                  Pro — €6,95/maand <span className="text-sm font-normal line-through text-purple-400">€11,99</span>
                </h4>
                <ul className="space-y-1.5 text-sm text-purple-800">
                  <li className="flex items-center gap-2">
                    <span className="text-purple-600">✓</span>
                    Alles van Starter
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-purple-600">✓</span>
                    BTW-aangifte met Digipoort
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-purple-600">✓</span>
                    Bankrekening koppeling & Exports
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-purple-600">✓</span>
                    10 GB opslag & Prioriteit support
                  </li>
                </ul>
                <Button
                  size="sm"
                  className="mt-3 bg-purple-600 hover:bg-purple-700"
                  onClick={() => handleActivate('zzp_pro')}
                  disabled={isActivating}
                >
                  {isActivating ? 'Bezig...' : 'Kies Pro'}
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex gap-2 sm:justify-center">
          <Button variant="outline" onClick={onClose} disabled={isActivating}>
            Annuleren
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
