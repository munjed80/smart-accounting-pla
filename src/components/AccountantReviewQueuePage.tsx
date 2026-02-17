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

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState } from '@/components/EmptyState'
import { WorkQueueSummary } from '@/components/WorkQueueSummary'
import { ClientAccessError, parseClientAccessError } from '@/components/ClientAccessError'
import { useAuth } from '@/lib/AuthContext'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { accountantClientApi, AccountantClientListItem, getErrorMessage } from '@/lib/api'
import { 
  WarningCircle,
  UsersThree,
} from '@phosphor-icons/react'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'

export const AccountantReviewQueuePage = () => {
  const { user } = useAuth()
  const { activeClient, hasActiveClients, hasPendingClients } = useActiveClient()
  
  // Client details state
  const [selectedClient, setSelectedClient] = useState<AccountantClientListItem | null>(null)
  
  // Loading and error state
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clientAccessError, setClientAccessError] = useState<'pending_approval' | 'access_revoked' | 'not_assigned' | 'no_client' | null>(null)
  const showLoading = useDelayedLoading(isLoading, 300, !!selectedClient)
  
  // Fetch client details when activeClient changes
  useEffect(() => {
    if (activeClient) {
      fetchClientDetails(activeClient.administrationId)
    } else {
      setSelectedClient(null)
      setIsLoading(false)
    }
  }, [activeClient])
  
  const fetchClientDetails = async (clientId: string) => {
    setIsLoading(true)
    setError(null)
    setClientAccessError(null)
    
    try {
      const response = await accountantClientApi.listClients()
      const client = response.clients.find(c => c.administration_id === clientId)
      if (client) {
        setSelectedClient(client)
      }
    } catch (err) {
      // Check for client access errors (PENDING_APPROVAL, ACCESS_REVOKED)
      const accessError = parseClientAccessError(err)
      if (accessError && accessError !== 'no_client') {
        setClientAccessError(accessError)
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      setIsLoading(false)
    }
  }
  
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
  
  // Show client access error if there's one
  if (clientAccessError) {
    return (
      <ClientAccessError 
        type={clientAccessError} 
        clientName={activeClient?.name}
        onGoToClients={handleGoToClients}
      />
    )
  }
  
  // Show empty state if no client selected
  if (!isLoading && !activeClient) {
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
            {activeClient && (
              <p className="text-muted-foreground">
                {t('clientSwitcher.activeClient')}: <span className="font-semibold">{activeClient.name || activeClient.email}</span>
              </p>
            )}
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
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {/* Work Queue Summary */}
        {activeClient && (
          <WorkQueueSummary 
            clientId={activeClient.administrationId}
            clientName={activeClient.name || activeClient.email}
          />
        )}
      </div>
    </div>
  )
}
