/**
 * Accountant Home Page - Daily Work Queue
 * 
 * Main dashboard for accountants managing 20-200 clients:
 * - Top summary KPIs
 * - Tabs: "Needs Review", "VAT Due", "Red Issues", "Backlog", "Alerts"
 * - Multi-select clients + bulk actions
 * - Per-client result statuses
 * - Review Queue for selected client
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/AuthContext'
import { 
  api, 
  getErrorMessage,
  DashboardSummary,
  ClientStatusCard,
  ClientsListResponse,
} from '@/lib/api'
import { 
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  Warning,
  Users,
  MagnifyingGlass,
  Calendar,
  Bell,
  Gauge,
  Stack,
  CaretUp,
  CaretDown,
  CaretLeft,
  Eye,
} from '@phosphor-icons/react'
import { format, formatDistanceToNow } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import { ReviewQueue } from './ReviewQueue'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import { TodayCommandPanel } from './TodayCommandPanel'
import { PriorityClientsPanel } from './PriorityClientsPanel'
import { BulkActionBar, BulkActionType } from './BulkActionBar'
import { BulkOperationModal } from './BulkOperationModal'
import { RecentActionsPanel } from './RecentActionsPanel'
import { useClientSelection } from '@/hooks/useClientSelection'

// KPI Card Component
const KPICard = ({ 
  icon: Icon, 
  label, 
  value, 
  color = 'blue',
  isLoading = false 
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color?: 'blue' | 'green' | 'yellow' | 'red'
  isLoading?: boolean
}) => {
  const colorClasses = {
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    green: 'text-green-600 dark:text-green-400 bg-green-500/10',
    yellow: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    red: 'text-red-600 dark:text-red-400 bg-red-500/10',
  }

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            <Icon size={20} weight="fill" />
          </div>
          <div>
            {isLoading ? (
              <Skeleton className="h-6 w-12 mb-1" />
            ) : (
              <p className="text-2xl font-bold">{value}</p>
            )}
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Client Row with checkbox
const ClientRow = ({ 
  client, 
  isSelected,
  onSelect,
  onViewReviewQueue,
}: { 
  client: ClientStatusCard
  isSelected: boolean
  onSelect: (id: string, selected: boolean) => void
  onViewReviewQueue: (client: ClientStatusCard) => void
}) => {
  const scoreColor = client.readiness_score >= 80 ? 'text-green-600' : 
                     client.readiness_score >= 50 ? 'text-amber-600' : 'text-red-600'

  return (
    <TableRow className={client.needs_immediate_attention ? 'bg-red-50 dark:bg-red-950/30' : ''}>
      <TableCell>
        <Checkbox 
          checked={isSelected}
          onCheckedChange={(checked) => onSelect(client.id, !!checked)}
        />
      </TableCell>
      <TableCell className="font-medium">
        <div>
          <p className="font-semibold">{client.name}</p>
          {client.kvk_number && (
            <p className="text-xs text-muted-foreground">KVK: {client.kvk_number}</p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className={`text-lg font-bold ${scoreColor}`}>
          {client.readiness_score}
        </div>
      </TableCell>
      <TableCell>
        {client.red_issue_count > 0 && (
          <Badge variant="destructive" className="mr-1">
            {client.red_issue_count} {t('accountant.red')}
          </Badge>
        )}
        {client.yellow_issue_count > 0 && (
          <Badge variant="outline" className="bg-amber-500/20 text-amber-700">
            {client.yellow_issue_count} {t('accountant.yellow')}
          </Badge>
        )}
        {client.red_issue_count === 0 && client.yellow_issue_count === 0 && (
          <span className="text-green-600">✓ {t('accountant.green')}</span>
        )}
      </TableCell>
      <TableCell>
        {client.documents_needing_review_count > 0 ? (
          <Badge variant="outline">
            {client.documents_needing_review_count} docs
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {client.days_to_vat_deadline !== null ? (
          <span className={client.days_to_vat_deadline <= 7 ? 'text-red-600 font-medium' : ''}>
            {client.days_to_vat_deadline}d
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {client.last_activity_at ? (
          <span className="text-sm">
            {formatDistanceToNow(new Date(client.last_activity_at), { addSuffix: true, locale: nlLocale })}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('accountant.never')}</span>
        )}
      </TableCell>
      <TableCell>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => onViewReviewQueue(client)}
        >
          <Eye size={16} className="mr-1" />
          {t('accountantDashboard.openDossier')}
        </Button>
      </TableCell>
    </TableRow>
  )
}

export const AccountantHomePage = () => {
  const { user } = useAuth()
  
  // Data state
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [clients, setClients] = useState<ClientStatusCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Use shared selection hook
  const { 
    selectedIds: selectedClientIds, 
    count: selectedCount,
    isSelected,
    toggleSelect,
    selectAll: selectAllClients,
    clearAll: clearSelection,
    selectOnlyFailed 
  } = useClientSelection()
  
  // Review Queue state - for viewing a specific client's documents
  const [reviewQueueClient, setReviewQueueClient] = useState<ClientStatusCard | null>(null)
  
  // Sorting state
  const [sortBy, setSortBy] = useState('readiness_score')
  const [sortOrder, setSortOrder] = useState('asc')
  
  // Active tab
  const [activeTab, setActiveTab] = useState('all')
  
  // Bulk operation state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [bulkOperationType, setBulkOperationType] = useState<BulkActionType | null>(null)
  
  // Get selected clients with their names for the modal
  const selectedClients = useMemo(() => {
    return clients
      .filter(c => selectedClientIds.has(c.id))
      .map(c => ({ id: c.id, name: c.name }))
  }, [clients, selectedClientIds])
  
  // Check for selectedClientId in localStorage on mount
  useEffect(() => {
    const storedClientId = localStorage.getItem('selectedClientId')
    if (storedClientId && clients.length > 0) {
      const client = clients.find(c => c.id === storedClientId)
      if (client) {
        setReviewQueueClient(client)
        // Clear from localStorage after use
        localStorage.removeItem('selectedClientId')
      }
    }
  }, [clients])

  // Listen for tab changes from TodayCommandPanel
  useEffect(() => {
    const handleTabChange = (event: CustomEvent<{ tab: string | null }>) => {
      if (event.detail.tab) {
        setActiveTab(event.detail.tab)
      }
    }
    
    // Check sessionStorage for stored tab on mount
    const storedTab = sessionStorage.getItem('accountantActiveTab')
    if (storedTab) {
      setActiveTab(storedTab)
      sessionStorage.removeItem('accountantActiveTab')
    }
    
    window.addEventListener('accountantTabChange', handleTabChange as EventListener)
    return () => window.removeEventListener('accountantTabChange', handleTabChange as EventListener)
  }, [])

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Fetch summary
      const summaryRes = await api.get<DashboardSummary>('/accountant/dashboard/summary')
      setSummary(summaryRes.data)
      
      // Determine filters based on active tab
      let filters: string[] = []
      if (activeTab === 'needs_review') filters = ['needs_review']
      else if (activeTab === 'vat_due') filters = ['deadline_7d']
      else if (activeTab === 'red_issues') filters = ['has_red']
      else if (activeTab === 'stale') filters = ['stale_30d']
      
      // Fetch clients
      const clientsRes = await api.get<ClientsListResponse>('/accountant/dashboard/clients', {
        params: {
          sort: sortBy,
          order: sortOrder,
          filter: filters.length > 0 ? filters : undefined,
        },
      })
      setClients(clientsRes.data.clients)
      
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, sortBy, sortOrder])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Selection handlers
  const handleSelectClient = (id: string, selected: boolean) => {
    toggleSelect(id)
  }

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      selectAllClients(clients.map(c => c.id))
    } else {
      clearSelection()
    }
  }

  // Bulk operation handlers
  const openBulkModal = (actionType: BulkActionType) => {
    setBulkOperationType(actionType)
    setIsBulkModalOpen(true)
  }

  const closeBulkModal = () => {
    setIsBulkModalOpen(false)
    setBulkOperationType(null)
  }

  const handleOperationComplete = () => {
    // Refresh data after bulk operation
    fetchData()
  }

  const handleRetryFailed = (failedClientIds: string[]) => {
    selectOnlyFailed(failedClientIds)
  }

  // Toggle sort
  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return null
    return sortOrder === 'asc' ? <CaretUp size={14} /> : <CaretDown size={14} />
  }
  
  // Handle view review queue for a client - navigate to client dossier
  const handleViewReviewQueue = (client: ClientStatusCard) => {
    // Navigate to client dossier issues page
    navigateTo(`/accountant/clients/${client.administration_id}/issues`)
  }
  
  // Close review queue and go back to client list
  const handleCloseReviewQueue = () => {
    setReviewQueueClient(null)
  }

  // Check access
  if (user?.role !== 'accountant' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-7xl mx-auto">
          <Alert className="bg-amber-500/10 border-amber-500/40">
            <Warning className="h-5 w-5 text-amber-600" />
            <AlertTitle>{t('accountantDashboard.accessRestricted')}</AlertTitle>
            <AlertDescription>
              {t('accountantDashboard.accessRestrictedDesc')}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }
  
  // If a client is selected for review queue, show that view
  if (reviewQueueClient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Back button */}
          <div className="mb-4">
            <Button variant="ghost" onClick={handleCloseReviewQueue}>
              <CaretLeft size={18} className="mr-2" />
              {t('accountantDashboard.backToClients')}
            </Button>
          </div>
          
          <ReviewQueue
            clientId={reviewQueueClient.id}
            clientName={reviewQueueClient.name}
            onClose={handleCloseReviewQueue}
          />
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
              {t('accountantDashboard.dailyWorkQueue')}
            </h1>
            <p className="text-muted-foreground">
              {summary?.total_clients || 0} {t('accountant.clientsAssigned')}
            </p>
          </div>
          <Button onClick={fetchData} variant="outline" size="sm" disabled={isLoading}>
            <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </div>

        {/* Accountant Command Layer - "Vandaag – Overzicht" */}
        <TodayCommandPanel 
          summary={summary} 
          clients={clients} 
          isLoading={isLoading} 
        />

        {/* Priority Clients Panel - "Top prioriteit klanten" */}
        <PriorityClientsPanel 
          clients={clients} 
          isLoading={isLoading} 
        />

        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive/40">
            <WarningCircle className="h-5 w-5 text-destructive" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* KPI Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <KPICard 
            icon={Users} 
            label={t('accountantDashboard.kpiTotalClients')} 
            value={summary?.total_clients || 0}
            isLoading={isLoading}
          />
          <KPICard 
            icon={WarningCircle} 
            label={t('accountantDashboard.kpiRedIssues')} 
            value={summary?.clients_with_red_issues || 0}
            color="red"
            isLoading={isLoading}
          />
          <KPICard 
            icon={MagnifyingGlass} 
            label={t('accountantDashboard.kpiToReview')} 
            value={summary?.clients_in_review || 0}
            color="yellow"
            isLoading={isLoading}
          />
          <KPICard 
            icon={Calendar} 
            label={t('accountantDashboard.kpiVatDue')} 
            value={summary?.upcoming_vat_deadlines_7d || 0}
            color={summary?.upcoming_vat_deadlines_7d ? 'red' : 'green'}
            isLoading={isLoading}
          />
          <KPICard 
            icon={Stack} 
            label={t('accountantDashboard.kpiDocBacklog')} 
            value={summary?.document_backlog_total || 0}
            color={summary?.document_backlog_total ? 'yellow' : 'green'}
            isLoading={isLoading}
          />
          <KPICard 
            icon={Bell} 
            label={t('accountantDashboard.kpiAlerts')} 
            value={(summary?.alerts_by_severity.critical || 0) + (summary?.alerts_by_severity.warning || 0)}
            color={summary?.alerts_by_severity.critical ? 'red' : 'yellow'}
            isLoading={isLoading}
          />
        </div>

        {/* Bulk Actions Bar - New Component */}
        <BulkActionBar
          selectedCount={selectedCount}
          visibleClientCount={clients.length}
          onSelectAll={() => selectAllClients(clients.map(c => c.id))}
          onClearSelection={clearSelection}
          onAction={openBulkModal}
        />

        {/* Recent Actions Panel */}
        <RecentActionsPanel />

        {/* Main Content with Tabs */}
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">
                  {t('accountantDashboard.tabAllClients')}
                </TabsTrigger>
                <TabsTrigger value="red_issues" className="text-red-600">
                  <WarningCircle size={16} className="mr-1" />
                  {t('accountantDashboard.tabRedIssues')}
                </TabsTrigger>
                <TabsTrigger value="needs_review">
                  <MagnifyingGlass size={16} className="mr-1" />
                  {t('accountantDashboard.tabToReview')}
                </TabsTrigger>
                <TabsTrigger value="vat_due">
                  <Calendar size={16} className="mr-1" />
                  {t('accountantDashboard.tabVatSoon')}
                </TabsTrigger>
                <TabsTrigger value="stale">
                  <Warning size={16} className="mr-1" />
                  {t('accountantDashboard.tabInactive')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : clients.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={selectedCount === clients.length && clients.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('name')}
                    >
                      {t('accountantDashboard.tableClient')} <SortIcon field="name" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('readiness_score')}
                    >
                      {t('accountantDashboard.tableScore')} <SortIcon field="readiness_score" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('red_issues')}
                    >
                      {t('accountantDashboard.tableIssues')} <SortIcon field="red_issues" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('backlog')}
                    >
                      {t('accountantDashboard.tableBacklog')} <SortIcon field="backlog" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('deadline')}
                    >
                      {t('accountantDashboard.tableVat')} <SortIcon field="deadline" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('last_activity')}
                    >
                      {t('accountantDashboard.tableActivity')} <SortIcon field="last_activity" />
                    </TableHead>
                    <TableHead>
                      {t('accountantDashboard.tableActions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <ClientRow
                      key={client.id}
                      client={client}
                      isSelected={isSelected(client.id)}
                      onSelect={handleSelectClient}
                      onViewReviewQueue={handleViewReviewQueue}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">{t('accountantDashboard.noClientsTitle')}</p>
                <p className="text-sm mt-2 mb-4">
                  {t('accountantDashboard.noClientsDesc')}
                </p>
                <Button 
                  variant="outline"
                  onClick={() => navigateTo('/accountant/onboarding')}
                >
                  {t('accountantDashboard.goToOnboarding')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Operation Modal - New Component */}
        <BulkOperationModal
          isOpen={isBulkModalOpen}
          onClose={closeBulkModal}
          actionType={bulkOperationType}
          selectedClients={selectedClients}
          onOperationComplete={handleOperationComplete}
          onRetryFailed={handleRetryFailed}
        />
      </div>
    </div>
  )
}
