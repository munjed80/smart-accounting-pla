/**
 * Accountant Review Queue Page
 * 
 * Main review queue page for accountants with Dutch UI.
 * Shows the work queue summary with:
 * - Documents needing review
 * - Bank reconciliation items
 * - VAT actions
 * - Reminders/overdue invoices
 * - Integrity warnings
 * 
 * Handles PENDING_APPROVAL and ACCESS_REVOKED errors from backend
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState } from '@/components/EmptyState'
import { WorkQueueSummary } from '@/components/WorkQueueSummary'
import { ClientAccessError } from '@/components/ClientAccessError'
import { useAuth } from '@/lib/AuthContext'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { 
  WarningCircle,
  UsersThree,
  ArrowClockwise,
} from '@phosphor-icons/react'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'

export const AccountantReviewQueuePage = () => {
  const { user } = useAuth()
  const { activeClient, hasActiveClients, hasPendingClients } = useActiveClient()
  
  // Error state
  const [error, setError] = useState<string | null>(null)
  
  // Navigate to clients page to select a client
  const handleGoToClients = () => {
    navigateTo('/accountant/clients')
  }
  
  // Check access
  if (user?.role !== 'accountant' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-7xl mx-auto">
          <Alert className="bg-amber-500/10 border-amber-500/40">
            <WarningCircle className="h-5 w-5 text-amber-600" />
            <AlertDescription>
              {t('accountant.accountantOnly')}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }
  
  // Show empty state if no client selected
  if (!activeClient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-1">
              {t('sidebar.reviewQueue')}
            </h1>
          </div>
          
          {/* Show different message based on whether user has active clients or only pending */}
          {hasPendingClients && !hasActiveClients ? (
            <ClientAccessError 
              type="pending_approval"
              onGoToClients={handleGoToClients}
            />
          ) : (
            <EmptyState
              title={t('clientSwitcher.noClientSelected')}
              description={t('reviewQueue.selectClientCta')}
              icon={<UsersThree size={64} weight="duotone" className="text-muted-foreground" />}
              actionLabel={t('clientSwitcher.goToClients')}
              onAction={handleGoToClients}
              tips={[
                t('emptyStates.clientsAssignedByAdmin'),
                t('emptyStates.onceAssigned'),
              ]}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">
              {t('sidebar.reviewQueue')}
            </h1>
            <p className="text-muted-foreground">
              {t('clientSwitcher.activeClient')}: <span className="font-semibold">{activeClient.name || activeClient.email}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleGoToClients}>
              <UsersThree size={16} className="mr-2" />
              {t('clientSwitcher.change')}
            </Button>
          </div>
        </div>
        
        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive/40">
            <WarningCircle className="h-5 w-5 text-destructive" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setError(null)}
                className="shrink-0"
              >
                <ArrowClockwise size={16} className="mr-2" />
                Opnieuw proberen
              </Button>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Work Queue Summary */}
        <WorkQueueSummary 
          clientId={activeClient.administrationId}
          clientName={activeClient.name || activeClient.email}
        />
      </div>
    </div>
  )
}
