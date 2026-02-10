/**
 * Accountant Review Queue Page
 * 
 * Main review queue page for accountants with Dutch UI.
 * Shows:
 * - Tabs: Rode issues, Te beoordelen, BTW binnenkort, Achterstand documenten
 * - EmptyState when no client selected
 * - Uses existing AccountantWorkQueue and ReviewQueue components
 * - Handles PENDING_APPROVAL and ACCESS_REVOKED errors from backend
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState } from '@/components/EmptyState'
import { ReviewQueue } from '@/components/ReviewQueue'
import { ClientAccessError, parseClientAccessError } from '@/components/ClientAccessError'
import { useAuth } from '@/lib/AuthContext'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { accountantClientApi, AccountantClientListItem, getErrorMessage } from '@/lib/api'
import { 
  WarningCircle,
  CheckCircle,
  Stack,
  Calendar,
  ClockCountdown,
  UsersThree,
  ArrowsClockwise,
} from '@phosphor-icons/react'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'

export const AccountantReviewQueuePage = () => {
  const { user } = useAuth()
  const { activeClient, hasActiveClients, hasPendingClients } = useActiveClient()
  
  // Client details state
  const [selectedClient, setSelectedClient] = useState<AccountantClientListItem | null>(null)
  
  // Active tab
  const [activeTab, setActiveTab] = useState<'red' | 'review' | 'vat' | 'backlog'>('review')
  
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
        
        {/* Issue counts summary */}
        {selectedClient && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className={`bg-card/80 backdrop-blur-sm ${selectedClient.open_red_count > 0 ? 'border-red-500/40' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${selectedClient.open_red_count > 0 ? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground'}`}>
                    <WarningCircle size={20} weight="fill" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{selectedClient.open_red_count}</p>
                    <p className="text-xs text-muted-foreground">{t('reviewQueue.redIssues')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${selectedClient.open_yellow_count > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                    <Stack size={20} weight="fill" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{selectedClient.open_yellow_count}</p>
                    <p className="text-xs text-muted-foreground">{t('reviewQueue.toReview')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                    <Calendar size={20} weight="fill" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">—</p>
                    <p className="text-xs text-muted-foreground">{t('reviewQueue.vatSoon')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                    <ClockCountdown size={20} weight="fill" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">—</p>
                    <p className="text-xs text-muted-foreground">{t('reviewQueue.documentBacklog')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Tabs */}
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-0">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="red" className="text-red-600">
                  <WarningCircle size={16} className="mr-1" />
                  {t('reviewQueue.redIssues')}
                  {selectedClient && selectedClient.open_red_count > 0 && (
                    <Badge variant="destructive" className="ml-2 text-xs">
                      {selectedClient.open_red_count}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="review">
                  <Stack size={16} className="mr-1" />
                  {t('reviewQueue.toReview')}
                </TabsTrigger>
                <TabsTrigger value="vat">
                  <Calendar size={16} className="mr-1" />
                  {t('reviewQueue.vatSoon')}
                </TabsTrigger>
                <TabsTrigger value="backlog">
                  <ClockCountdown size={16} className="mr-1" />
                  {t('reviewQueue.documentBacklog')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-6 transition-opacity duration-200">
            {showLoading ? (
              <div className="text-center py-12">
                <ArrowsClockwise size={32} className="mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground">{t('common.loading')}</p>
              </div>
            ) : activeClient ? (
              <>
                {activeTab === 'review' && (
                  <ReviewQueue
                    clientId={activeClient.administrationId}
                    clientName={activeClient.name || activeClient.email}
                  />
                )}
                {activeTab === 'red' && (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle size={48} className="mx-auto mb-4 opacity-50 text-green-500" />
                    <p className="text-lg font-medium">{t('reviewQueue.noItems')}</p>
                  </div>
                )}
                {activeTab === 'vat' && (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle size={48} className="mx-auto mb-4 opacity-50 text-green-500" />
                    <p className="text-lg font-medium">{t('reviewQueue.noItems')}</p>
                  </div>
                )}
                {activeTab === 'backlog' && (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle size={48} className="mx-auto mb-4 opacity-50 text-green-500" />
                    <p className="text-lg font-medium">{t('reviewQueue.noItems')}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <UsersThree size={48} className="mx-auto mb-4 opacity-50" />
                <p>{t('clientSwitcher.selectClientFirst')}</p>
                <Button variant="outline" className="mt-4" onClick={handleGoToClients}>
                  {t('clientSwitcher.goToClients')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
