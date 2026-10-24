import { isAccountantRole } from '@/lib/roles'
/**
 * Accountant Home Page - Daily Work Queue (Master Dashboard)
 * 
 * Main dashboard for accountants managing 20-200 clients:
 * - Top summary KPIs
 * - Debounced search by name/email
 * - Filter chips: Alle / Rood / Geel / OK / Inactief
 * - Sorting dropdown: Risico, BTW deadline, Achterstand, Laatste activiteit
 * - Pagination with page size selector (10/25/50)
 * - Multi-select clients + bulk actions
 * - Per-client result statuses
 * - Review Queue for selected client
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  CaretRight,
  Eye,
  X,
  Funnel,
  SortAscending,
  Clock,
} from '@phosphor-icons/react'
import { format, formatDistanceToNow } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import { DagstartPanel } from './DagstartPanel'
import { PriorityClientsPanel } from './PriorityClientsPanel'
import { BulkActionBar, BulkActionType } from './BulkActionBar'
import { BulkOperationModal } from './BulkOperationModal'
import { RecentActionsPanel } from './RecentActionsPanel'
import { useClientSelection } from '@/hooks/useClientSelection'
import { WorkQueueSection } from './WorkQueueSection'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { PlatformModulesCard } from './PlatformModulesCard'

// Local storage keys for user preferences
const PREF_SEARCH = 'accountant_search'
const PREF_FILTER = 'accountant_filter'
const PREF_SORT = 'accountant_sort'
const PREF_SORT_ORDER = 'accountant_sort_order'
const PREF_PAGE_SIZE = 'accountant_page_size'

// Filter options
type FilterType = 'all' | 'has_red' | 'has_yellow' | 'ok' | 'stale_30d' | 'deadline_7d'

// Sort options  
type SortField = 'readiness_score' | 'deadline' | 'backlog' | 'last_activity' | 'red_issues' | 'name'
type SortOrder = 'asc' | 'desc'

// Debounce helper hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])
  
  return debouncedValue
}

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
  const [allClients, setAllClients] = useState<ClientStatusCard[]>([])
  const [priorityClients, setPriorityClients] = useState<ClientStatusCard[]>([])
  const [portfolioCounts, setPortfolioCounts] = useState<ClientsListResponse['portfolio_counts']>({})
  const [filteredCount, setFilteredCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedClientInfo, setSelectedClientInfo] = useState<{ id: string; name: string }[]>([])
  const requestVersion = useRef(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Delayed loading to prevent flashing
  const showLoading = useDelayedLoading(isLoading, 300, allClients.length > 0)
  
  // Search state with debounce
  const [searchText, setSearchText] = useState(() => 
    localStorage.getItem(PREF_SEARCH) || ''
  )
  const debouncedSearch = useDebounce(searchText, 300)
  
  // Filter state (chips)
  const [activeFilter, setActiveFilter] = useState<FilterType>(() => 
    (localStorage.getItem(PREF_FILTER) as FilterType) || 'all'
  )
  
  // Sort state
  const [sortBy, setSortBy] = useState<SortField>(() => 
    (localStorage.getItem(PREF_SORT) as SortField) || 'readiness_score'
  )
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => 
    (localStorage.getItem(PREF_SORT_ORDER) as SortOrder) || 'asc'
  )
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => {
    const stored = localStorage.getItem(PREF_PAGE_SIZE)
    return [10, 25, 50].includes(Number(stored)) ? Number(stored) : 25
  })
  
  // Use shared selection hook
  const { 
    selectedIds: selectedClientIds, 
    count: selectedCount,
    isSelected,
    toggleSelect,
    selectAll: selectAllClients,
    clearAll: clearSelection,
    selectOnlyFailed,
  } = useClientSelection()
  
  // Track if "select all results" mode is active
  const [selectAllResultsMode, setSelectAllResultsMode] = useState(false)
  
  // Active tab (for legacy tab handling from TodayCommandPanel)
  const [activeTab, setActiveTab] = useState('all')
  
  // Bulk operation state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [bulkOperationType, setBulkOperationType] = useState<BulkActionType | null>(null)
  
  // Persist user preferences to localStorage
  useEffect(() => {
    localStorage.setItem(PREF_SEARCH, searchText)
  }, [searchText])
  
  useEffect(() => {
    localStorage.setItem(PREF_FILTER, activeFilter)
  }, [activeFilter])
  
  useEffect(() => {
    localStorage.setItem(PREF_SORT, sortBy)
  }, [sortBy])
  
  useEffect(() => {
    localStorage.setItem(PREF_SORT_ORDER, sortOrder)
  }, [sortOrder])
  
  useEffect(() => {
    localStorage.setItem(PREF_PAGE_SIZE, String(pageSize))
  }, [pageSize])
  
  const paginatedClients = allClients
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize))
  const selectedClients = selectedClientInfo.filter(c => selectedClientIds.has(c.id))

  useEffect(() => {
    setCurrentPage(1)
    clearSelection()
    setSelectedClientInfo([])
    setSelectAllResultsMode(false)
    // Selection belongs to the current query, not a persisted filter from another session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, activeFilter, sortBy, sortOrder, pageSize])

  // Listen for tab changes from TodayCommandPanel (legacy support)
  useEffect(() => {
    const handleTabChange = (event: CustomEvent<{ tab: string | null }>) => {
      if (event.detail.tab) {
        setActiveTab(event.detail.tab)
        // Map legacy tabs to new filter chips
        switch (event.detail.tab) {
          case 'red_issues':
            setActiveFilter('has_red')
            break
          case 'needs_review':
            // Filter by clients that have docs needing review
            setSortBy('backlog')
            setSortOrder('desc')
            setActiveFilter('all')
            break
          case 'vat_due':
            // Filter to clients with deadline in 7 days and sort by deadline
            setActiveFilter('deadline_7d')
            setSortBy('deadline')
            setSortOrder('asc')
            break
          case 'stale':
            setActiveFilter('stale_30d')
            break
          default:
            setActiveFilter('all')
        }
      }
    }
    
    // Check sessionStorage for stored tab on mount
    const storedTab = sessionStorage.getItem('accountantActiveTab')
    if (storedTab) {
      setActiveTab(storedTab)
      sessionStorage.removeItem('accountantActiveTab')
      // Apply same mapping
      switch (storedTab) {
        case 'red_issues':
          setActiveFilter('has_red')
          break
        case 'stale':
          setActiveFilter('stale_30d')
          break
        case 'vat_due':
          setActiveFilter('deadline_7d')
          setSortBy('deadline')
          setSortOrder('asc')
          break
        case 'needs_review':
          setSortBy('backlog')
          setSortOrder('desc')
          break
      }
    }
    
    window.addEventListener('accountantTabChange', handleTabChange as EventListener)
    return () => window.removeEventListener('accountantTabChange', handleTabChange as EventListener)
  }, [])

  const queryParams = useMemo(() => ({
    sort: sortBy, order: sortOrder, search: debouncedSearch || undefined,
    filter: activeFilter === 'all' ? undefined : activeFilter,
    limit: pageSize, offset: (currentPage - 1) * pageSize,
  }), [sortBy, sortOrder, debouncedSearch, activeFilter, pageSize, currentPage])

  const fetchData = useCallback(async () => {
    const version = ++requestVersion.current
    setIsLoading(true)
    setError(null)
    const results = await Promise.allSettled([
      api.get<DashboardSummary>('/accountant/dashboard/summary'),
      api.get<ClientsListResponse>('/accountant/dashboard/clients', { params: queryParams }),
    ])
    if (version !== requestVersion.current) return
    const [summaryResult, clientsResult] = results
    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value.data)
    if (clientsResult.status === 'fulfilled') {
      const data = clientsResult.value.data
      setAllClients(data.clients)
      setPriorityClients(data.priority_clients)
      setPortfolioCounts(data.portfolio_counts)
      setFilteredCount(data.filtered_count)
      setTotalCount(data.total_count)
      if (currentPage > Math.max(1, Math.ceil(data.filtered_count / pageSize))) setCurrentPage(1)
    }
    const failure = results.find(r => r.status === 'rejected')
    if (failure?.status === 'rejected') setError(getErrorMessage(failure.reason))
    setIsLoading(false)
  }, [queryParams, currentPage, pageSize])

  useEffect(() => {
    fetchData()
    return () => { requestVersion.current += 1 }
  }, [fetchData])

  // Selection handlers
  const handleSelectClient = (id: string, selected: boolean) => {
    setSelectAllResultsMode(false) // Exit "select all results" mode
    toggleSelect(id)
    const client = allClients.find(c => c.id === id)
    if (client) setSelectedClientInfo(prev => [...prev.filter(c => c.id !== id), { id, name: client.name }])
  }

  const handleSelectAll = (selected: boolean) => {
    setSelectAllResultsMode(false)
    if (selected) {
      // Select all visible (paginated) clients
      selectAllClients(paginatedClients.map(c => c.id))
      setSelectedClientInfo(paginatedClients.map(c => ({ id: c.id, name: c.name })))
    } else {
      clearSelection()
    }
  }
  
  // Select all results (across all pages)
  const handleSelectAllResults = async () => {
    const version = requestVersion.current
    try {
      const response = await api.get<{ clients: { id: string; name: string }[] }>('/accountant/dashboard/client-selection', {
        params: { search: queryParams.search, filter: queryParams.filter },
      })
      if (version !== requestVersion.current) return
      setSelectedClientInfo(response.data.clients)
      selectAllClients(response.data.clients.map(c => c.id))
      setSelectAllResultsMode(true)
    } catch (err) { setError(getErrorMessage(err)) }
  }

  // Clear selection and exit select-all-results mode
  const handleClearSelection = () => {
    setSelectAllResultsMode(false)
    clearSelection()
  }

  // Bulk operation handlers
  const openBulkModal = (actionType: BulkActionType) => {
    setBulkOperationType(actionType)
    setIsBulkModalOpen(true)
  }

  const closeBulkModal = () => {
    setIsBulkModalOpen(false)
    setBulkOperationType(null)
    setSelectAllResultsMode(false) // Clear select all results mode after operation
  }

  const handleOperationComplete = () => {
    // Completed operations invalidate the selection and the current data.
    clearSelection()
    setSelectedClientInfo([])
    fetchData()
    setSelectAllResultsMode(false)
  }

  const handleRetryFailed = (failedClientIds: string[]) => {
    setSelectAllResultsMode(false)
    selectOnlyFailed(failedClientIds)
  }

  // Toggle sort from column header (legacy)
  const toggleSort = (field: SortField) => {
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
    // Navigate to client dossier issues page - id is the administration ID
    navigateTo(`/accountant/clients/${client.id}/issues`)
  }
  
  // Pagination handlers
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }
  
  const goToPrevPage = () => {
    goToPage(currentPage - 1)
  }
  
  const goToNextPage = () => {
    goToPage(currentPage + 1)
  }
  
  const handlePageSizeChange = (newSize: string) => {
    setPageSize(parseInt(newSize, 10))
    setCurrentPage(1) // Reset to first page
  }
  
  // Filter chip helper
  const filterChips: { value: FilterType; label: string; color?: string }[] = [
    { value: 'all', label: t('filters.all') },
    { value: 'has_red', label: t('filters.red'), color: 'text-red-600' },
    { value: 'has_yellow', label: t('filters.yellow'), color: 'text-amber-600' },
    { value: 'ok', label: t('filters.ok'), color: 'text-green-600' },
    { value: 'deadline_7d', label: t('filters.vatSoon'), color: 'text-purple-600' },
    { value: 'stale_30d', label: t('filters.inactive') },
  ]
  
  // Sort options
  const sortOptions: { value: SortField; label: string }[] = [
    { value: 'readiness_score', label: t('filters.sortPriority') },
    { value: 'deadline', label: t('filters.sortDeadline') },
    { value: 'backlog', label: t('filters.sortBacklog') },
    { value: 'last_activity', label: t('filters.sortActivity') },
    { value: 'name', label: t('filters.sortName') },
  ]

  // Check access
  if (!isAccountantRole(user?.role)) {
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

        {/* Platform Modules Overview */}
        <PlatformModulesCard />

        {/* Dagstart Panel - "Dagstart" Daily workflow panel */}
        <DagstartPanel 
          summary={summary}
          portfolioCounts={portfolioCounts}
          clients={priorityClients}
          isLoading={showLoading}
          onFilterChange={setActiveFilter as (filter: string) => void}
        />

        {/* Priority Clients Panel - "Top prioriteit klanten" */}
        <PriorityClientsPanel 
          clients={priorityClients}
          isLoading={showLoading} 
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
            isLoading={showLoading}
          />
          <KPICard 
            icon={WarningCircle} 
            label={t('accountantDashboard.kpiRedIssues')} 
            value={summary?.clients_with_red_issues || 0}
            color="red"
            isLoading={showLoading}
          />
          <KPICard 
            icon={MagnifyingGlass} 
            label={t('accountantDashboard.kpiToReview')} 
            value={summary?.clients_in_review || 0}
            color="yellow"
            isLoading={showLoading}
          />
          <KPICard 
            icon={Calendar} 
            label={t('accountantDashboard.kpiVatDue')} 
            value={summary?.upcoming_vat_deadlines_7d || 0}
            color={summary?.upcoming_vat_deadlines_7d ? 'red' : 'green'}
            isLoading={showLoading}
          />
          <KPICard 
            icon={Stack} 
            label={t('accountantDashboard.kpiDocBacklog')} 
            value={summary?.document_backlog_total || 0}
            color={summary?.document_backlog_total ? 'yellow' : 'green'}
            isLoading={showLoading}
          />
          <KPICard 
            icon={Bell} 
            label={t('accountantDashboard.kpiAlerts')} 
            value={(summary?.alerts_by_severity.critical || 0) + (summary?.alerts_by_severity.warning || 0)}
            color={summary?.alerts_by_severity.critical ? 'red' : 'yellow'}
            isLoading={showLoading}
          />
        </div>

        {/* Bulk Actions Bar - Updated with new selection features */}
        <BulkActionBar
          selectedCount={selectAllResultsMode ? filteredCount : selectedCount}
          visibleClientCount={paginatedClients.length}
          onSelectAll={handleSelectAllResults}
          onClearSelection={handleClearSelection}
          onAction={openBulkModal}
        />
        
        {/* Select All Results Banner */}
        {selectedCount > 0 && selectedCount === paginatedClients.length && !selectAllResultsMode && filteredCount > paginatedClients.length && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm">
              {t('filters.onPageSelected').replace('{count}', String(paginatedClients.length))}
            </span>
            <Button variant="link" size="sm" onClick={handleSelectAllResults}>
              {t('filters.selectAll')} {filteredCount} {t('filters.resultsFound')}
            </Button>
          </div>
        )}
        
        {selectAllResultsMode && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm text-blue-700 dark:text-blue-300">
              ✓ {t('filters.allFilteredSelected').replace('{count}', String(filteredCount))}
            </span>
            <Button variant="link" size="sm" className="text-blue-600" onClick={handleClearSelection}>
              {t('bulkOps.clearSelection')}
            </Button>
          </div>
        )}

        {/* Recent Actions Panel */}
        <RecentActionsPanel />

        {/* Work Queue and Client List Tabs */}
        <Tabs defaultValue="clients" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="workqueue">
              <Stack size={16} className="mr-2" />
              Werklijst
            </TabsTrigger>
            <TabsTrigger value="clients">
              <Users size={16} className="mr-2" />
              Klanten Overzicht
            </TabsTrigger>
          </TabsList>

          {/* Work Queue Tab */}
          <TabsContent value="workqueue">
            <WorkQueueSection onRefresh={fetchData} />
          </TabsContent>

          {/* Client List Tab */}
          <TabsContent value="clients">

        {/* Main Content Card with Search, Filters, Sorting, and Pagination */}
        <Card id="client-list-section" className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4">
              {/* Search and Sort Row */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search Input */}
                <div className="relative flex-1">
                  <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    maxLength={200}
                    placeholder={t('filters.searchPlaceholder')}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  {searchText && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => setSearchText('')}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
                
                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <SortAscending size={18} className="text-muted-foreground" />
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder={t('filters.sortBy')} />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    title={sortOrder === 'asc' ? t('filters.sortAscending') : t('filters.sortDescending')}
                  >
                    {sortOrder === 'asc' ? <CaretUp size={16} /> : <CaretDown size={16} />}
                  </Button>
                </div>
              </div>
              
              {/* Filter Chips */}
              <div className="flex flex-wrap gap-2">
                {filterChips.map(chip => (
                  <Button
                    key={chip.value}
                    variant={activeFilter === chip.value ? 'default' : 'outline'}
                    size="sm"
                    className={`${activeFilter === chip.value ? '' : chip.color || ''}`}
                    onClick={() => setActiveFilter(chip.value)}
                  >
                    {chip.value === 'has_red' && <WarningCircle size={14} className="mr-1" />}
                    {chip.value === 'has_yellow' && <Warning size={14} className="mr-1" />}
                    {chip.value === 'ok' && <CheckCircle size={14} className="mr-1" />}
                    {chip.value === 'stale_30d' && <Clock size={14} className="mr-1" />}
                    {chip.label}
                    {chip.value !== 'all' && activeFilter === chip.value && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {filteredCount}
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
              
              {/* Results count */}
              <div className="text-sm text-muted-foreground">
                {filteredCount} {t('filters.resultsFound')}
                {debouncedSearch && ` "${debouncedSearch}"`}
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            {showLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : paginatedClients.length > 0 ? (
              <>
                <Table style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox 
                          checked={
                            (paginatedClients.length > 0 && 
                             paginatedClients.every(c => isSelected(c.id))) ||
                            selectAllResultsMode
                          }
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleSort('name')}
                      >
                        {t('accountantDashboard.tableClient')} <SortIcon field="name" />
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleSort('readiness_score')}
                      >
                        {t('accountantDashboard.tableScore')} <SortIcon field="readiness_score" />
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleSort('red_issues')}
                      >
                        {t('accountantDashboard.tableIssues')} <SortIcon field="red_issues" />
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleSort('backlog')}
                      >
                        {t('accountantDashboard.tableBacklog')} <SortIcon field="backlog" />
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleSort('deadline')}
                      >
                        {t('accountantDashboard.tableVat')} <SortIcon field="deadline" />
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
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
                    {paginatedClients.map((client) => (
                      <ClientRow
                        key={client.id}
                        client={client}
                        isSelected={isSelected(client.id) || selectAllResultsMode}
                        onSelect={handleSelectClient}
                        onViewReviewQueue={handleViewReviewQueue}
                      />
                    ))}
                  </TableBody>
                </Table>
                
                {/* Pagination Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t">
                  {/* Page size selector */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{t('pagination.rowsPerPage')}:</span>
                    <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="w-[70px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Page info and navigation */}
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredCount)} {t('pagination.of')} {filteredCount}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToPrevPage}
                        disabled={currentPage === 1 || isLoading}
                      >
                        <CaretLeft size={16} />
                        {t('pagination.previous')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToNextPage}
                        disabled={currentPage >= totalPages || isLoading}
                      >
                        {t('pagination.next')}
                        <CaretRight size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : totalCount === 0 ? (
              // No clients at all - show onboarding CTA
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
            ) : (
              // Clients exist but none match filter - show clear filter CTA
              <div className="text-center py-12 text-muted-foreground">
                <Funnel size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">{t('filters.noResultsFound')}</p>
                <p className="text-sm mt-2 mb-4">
                  {t('filters.adjustFilters')}
                </p>
                <div className="flex gap-2 justify-center">
                  {searchText && (
                    <Button variant="outline" onClick={() => setSearchText('')}>
                      {t('filters.clearSearch')}
                    </Button>
                  )}
                  {activeFilter !== 'all' && (
                    <Button variant="outline" onClick={() => setActiveFilter('all')}>
                      {t('priorityClients.clearFilter')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

          </TabsContent>
        </Tabs>

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
