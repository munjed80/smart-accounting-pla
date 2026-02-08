/**
 * Client Dossier Page
 * 
 * Container page for accountant client workflow:
 * - Issues tab: View and resolve validation issues
 * - Periods tab: Period control (review/finalize/lock)
 * - Decisions tab: View decision history
 * 
 * All UI text is Dutch (nl.ts).
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/AuthContext'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { 
  ledgerApi, 
  LedgerClientOverview,
  getErrorMessage 
} from '@/lib/api'
import { createDossierLogger } from '@/lib/dossierLogger'
import { 
  ArrowLeft,
  WarningCircle,
  Warning,
  CheckCircle,
  Folder,
  ClipboardText,
  CalendarBlank,
  ListChecks,
  LockSimple,
  User,
  Sparkle,
} from '@phosphor-icons/react'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'

// Import sub-pages
import { ClientIssuesTab } from '@/components/ClientIssuesTab'
import { ClientPeriodsTab } from '@/components/ClientPeriodsTab'
import { ClientDecisionsTab } from '@/components/ClientDecisionsTab'

/**
 * Check if an error is a NOT_ASSIGNED error (403).
 * Returns true if the user is not assigned to the requested client.
 */
function isNotAssignedError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('response' in err)) {
    return false
  }
  const response = (err as { response?: { status?: number; data?: { detail?: { code?: string } | string } } }).response
  if (response?.status !== 403) {
    return false
  }
  const detail = response?.data?.detail
  return typeof detail === 'object' && detail?.code === 'NOT_ASSIGNED'
}

interface ClientDossierPageProps {
  clientId: string
  initialTab?: 'issues' | 'periods' | 'decisions'
}

// Session storage key for today's completed actions
const TODAY_COMPLETED_KEY = 'dossier_today_completed'

// Get today's date string for session tracking
const getTodayDateKey = () => new Date().toISOString().split('T')[0]

// Get today's completed count from session storage
const getTodayCompleted = (): number => {
  try {
    const stored = sessionStorage.getItem(TODAY_COMPLETED_KEY)
    if (!stored) return 0
    const data = JSON.parse(stored)
    // Only return count if it's from today
    if (data.date === getTodayDateKey()) {
      return data.count || 0
    }
    return 0
  } catch {
    return 0
  }
}

// Increment today's completed count
const incrementTodayCompleted = (): number => {
  const current = getTodayCompleted()
  const newCount = current + 1
  sessionStorage.setItem(TODAY_COMPLETED_KEY, JSON.stringify({
    date: getTodayDateKey(),
    count: newCount
  }))
  return newCount
}

export const ClientDossierPage = ({ clientId, initialTab = 'issues' }: ClientDossierPageProps) => {
  const { user } = useAuth()
  const { activeClientId, allLinks, setActiveClient, refreshLinks } = useActiveClient()
  const [overview, setOverview] = useState<LedgerClientOverview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAccessDenied, setIsAccessDenied] = useState(false)
  const [activeTab, setActiveTab] = useState<string>(initialTab)
  const [todayCompleted, setTodayCompleted] = useState(getTodayCompleted())

  /**
   * Try to sync the active client context from allLinks.
   * Returns true if sync was successful, false if link not found.
   */
  const trySyncActiveClient = (links: typeof allLinks): boolean => {
    const link = links.find(l => l.administration_id === clientId && l.status === 'ACTIVE')
    if (link) {
      setActiveClient({
        id: link.client_user_id,
        name: link.client_name,
        email: link.client_email,
        administrationId: link.administration_id,
        administrationName: link.administration_name,
      })
      return true
    }
    return false
  }

  const fetchOverview = async () => {
    const logger = createDossierLogger(clientId)
    const endpoint = `/accountant/clients/${clientId}/overview`
    
    try {
      setIsLoading(true)
      setError(null)
      setIsAccessDenied(false)
      logger.request(endpoint)
      const data = await ledgerApi.getClientOverview(clientId)
      logger.success(endpoint, { clientName: data.client_name })
      setOverview(data)
      
      // If activeClient context doesn't match, sync it
      if (activeClientId !== clientId) {
        if (!trySyncActiveClient(allLinks)) {
          // Links may not be loaded yet; refresh them
          // After refresh, the ActiveClientContext will auto-select if matching
          await refreshLinks()
        }
      }
    } catch (err: unknown) {
      logger.error(endpoint, err)
      // Check if it's a NOT_ASSIGNED error (403)
      if (isNotAssignedError(err)) {
        setIsAccessDenied(true)
        return
      }
      const message = getErrorMessage(err)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (clientId) {
      fetchOverview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  const handleBack = () => {
    navigateTo('/accountant/clients')
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    // Update URL to reflect current tab
    navigateTo(`/accountant/clients/${clientId}/${tab}`)
  }

  // Handle issue resolved - increment counter and check for next recommended action
  const handleIssueResolved = () => {
    // Increment today's completed counter
    const newCount = incrementTodayCompleted()
    setTodayCompleted(newCount)
    
    // Refresh overview to get updated counts
    fetchOverview()
  }

  // Check if user is accountant
  if (user?.role !== 'accountant' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-4xl mx-auto">
          <Alert className="bg-amber-500/10 border-amber-500/40">
            <Warning className="h-5 w-5 text-amber-600" />
            <AlertTitle>{t('errors.accessDenied')}</AlertTitle>
            <AlertDescription>
              {t('errors.accountantOnly')}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  // Access denied - CLIENT_NOT_ASSIGNED error
  if (isAccessDenied) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-4xl mx-auto">
          <Alert className="bg-amber-500/10 border-amber-500/40">
            <LockSimple className="h-5 w-5 text-amber-600" />
            <AlertTitle className="text-amber-700 dark:text-amber-400">{t('errors.clientNotAssigned')}</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="text-muted-foreground mb-4">
                {t('errors.clientNotAssignedDescription')}
              </p>
              <Button onClick={handleBack} variant="outline">
                <ArrowLeft size={16} className="mr-2" />
                {t('errors.backToClients')}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  // No client selected
  if (!clientId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardContent className="pt-12 pb-12">
              <div className="text-center">
                <Folder size={64} className="mx-auto mb-4 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold mb-2">{t('dossier.noClientSelected')}</h2>
                <p className="text-muted-foreground mb-6">{t('dossier.selectClientCta')}</p>
                <Button onClick={() => navigateTo('/accountant/clients')}>
                  {t('dossier.goToClients')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4">
            <ArrowLeft size={18} className="mr-2" />
            {t('sidebar.backToClientList')}
          </Button>
          <Alert className="bg-destructive/10 border-destructive/40">
            <WarningCircle className="h-5 w-5 text-destructive" />
            <AlertDescription className="ml-2">
              <div className="font-semibold mb-2">{t('errors.loadFailed')}</div>
              <div className="text-sm text-muted-foreground mb-4">{error}</div>
              <Button onClick={fetchOverview} size="sm" variant="outline">
                {t('errors.tryAgain')}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
      
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft size={18} className="mr-2" />
              {t('accountant.backToClientList')}
            </Button>
            
            {/* Today's completed counter */}
            {todayCompleted > 0 && (
              <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30 px-3 py-1">
                <Sparkle size={14} weight="fill" className="mr-1" />
                {t('dossier.todayCompleted')}: {todayCompleted}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Folder size={32} weight="duotone" className="text-primary" />
                {isLoading ? (
                  <Skeleton className="h-9 w-48" />
                ) : (
                  <>
                    <h1 className="text-2xl font-bold text-foreground">
                      {overview?.client_name || t('dossier.title')}
                    </h1>
                    {/* Active client indicator */}
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">
                      <User size={12} className="mr-1" />
                      {t('dossier.activeClient')}
                    </Badge>
                  </>
                )}
              </div>
              <p className="text-muted-foreground mt-1">
                {t('dossier.title')}
              </p>
            </div>
            
            {/* Issue counts summary */}
            {!isLoading && overview && (
              <div className="flex gap-3">
                <Badge 
                  variant="outline" 
                  className={`${overview.error_count > 0 
                    ? 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40' 
                    : 'bg-muted text-muted-foreground'
                  } px-3 py-1`}
                >
                  <WarningCircle size={16} weight="fill" className="mr-1" />
                  {overview.error_count} {t('issues.severity.red').toLowerCase()}
                </Badge>
                <Badge 
                  variant="outline" 
                  className={`${overview.warning_count > 0 
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40' 
                    : 'bg-muted text-muted-foreground'
                  } px-3 py-1`}
                >
                  <Warning size={16} weight="fill" className="mr-1" />
                  {overview.warning_count} {t('issues.severity.yellow').toLowerCase()}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="issues" className="flex items-center gap-2">
              <ClipboardText size={18} />
              {t('dossier.tabs.issues')}
              {overview && (overview.error_count > 0 || overview.warning_count > 0) && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {overview.error_count + overview.warning_count}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="periods" className="flex items-center gap-2">
              <CalendarBlank size={18} />
              {t('dossier.tabs.periods')}
            </TabsTrigger>
            <TabsTrigger value="decisions" className="flex items-center gap-2">
              <ListChecks size={18} />
              {t('dossier.tabs.decisions')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="issues">
            <ClientIssuesTab 
              clientId={clientId} 
              onIssueResolved={handleIssueResolved}
            />
          </TabsContent>

          <TabsContent value="periods">
            <ClientPeriodsTab clientId={clientId} />
          </TabsContent>

          <TabsContent value="decisions">
            <ClientDecisionsTab clientId={clientId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default ClientDossierPage
