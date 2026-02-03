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
import { ReviewQueue } from './ReviewQueue'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import { DagstartPanel } from './DagstartPanel'
import { PriorityClientsPanel } from './PriorityClientsPanel'
import { BulkActionBar, BulkActionType } from './BulkActionBar'
import { BulkOperationModal } from './BulkOperationModal'
import { RecentActionsPanel } from './RecentActionsPanel'
import { useClientSelection } from '@/hooks/useClientSelection'

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
  const [allClients, setAllClients] = useState<ClientStatusCard[]>([]) // All fetched clients
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
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
    return stored ? parseInt(stored, 10) : 25
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
    selectMany,
  } = useClientSelection()
  
  // Review Queue state - for viewing a specific client's documents
  const [reviewQueueClient, setReviewQueueClient] = useState<ClientStatusCard | null>(null)
  
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
  
  // Filter, search, and sort clients (client-side for now)
  const filteredClients = useMemo(() => {
    let result = [...allClients]
    
    // Apply search filter (name or email-like patterns in name)
    if (debouncedSearch.trim()) {
      const searchLower = debouncedSearch.toLowerCase().trim()
      result = result.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        (c.kvk_number && c.kvk_number.includes(searchLower)) ||
        (c.btw_number && c.btw_number.toLowerCase().includes(searchLower))
      )
    }
    
    // Apply filter chip
    switch (activeFilter) {
      case 'has_red':
        result = result.filter(c => c.red_issue_count > 0)
        break
      case 'has_yellow':
        result = result.filter(c => c.yellow_issue_count > 0 && c.red_issue_count === 0)
        break
      case 'ok':
        result = result.filter(c => c.red_issue_count === 0 && c.yellow_issue_count === 0)
        break
      case 'stale_30d':
        result = result.filter(c => {
          if (!c.last_activity_at) return true // Never active = stale
          const lastActivity = new Date(c.last_activity_at)
          const daysSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
          return daysSince >= 30
        })
        break
      case 'deadline_7d':
        result = result.filter(c => 
          c.days_to_vat_deadline !== null && c.days_to_vat_deadline <= 7
        )
        break
      // 'all' shows everything
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'readiness_score':
          comparison = a.readiness_score - b.readiness_score
          break
        case 'deadline':
          // null deadlines go to the end
          if (a.days_to_vat_deadline === null && b.days_to_vat_deadline === null) comparison = 0
          else if (a.days_to_vat_deadline === null) comparison = 1
          else if (b.days_to_vat_deadline === null) comparison = -1
          else comparison = a.days_to_vat_deadline - b.days_to_vat_deadline
          break
        case 'backlog':
          comparison = (a.backlog_age_max_days ?? 0) - (b.backlog_age_max_days ?? 0)
          break
        case 'last_activity':
          if (!a.last_activity_at && !b.last_activity_at) comparison = 0
          else if (!a.last_activity_at) comparison = 1
          else if (!b.last_activity_at) comparison = -1
          else comparison = new Date(a.last_activity_at).getTime() - new Date(b.last_activity_at).getTime()
          break
        case 'red_issues':
          comparison = b.red_issue_count - a.red_issue_count // desc by default
          break
        case 'name':
          comparison = a.name.localeCompare(b.name, 'nl')
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
    
    return result
  }, [allClients, debouncedSearch, activeFilter, sortBy, sortOrder])
  
  // Paginated clients
  const paginatedClients = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize
    return filteredClients.slice(startIdx, startIdx + pageSize)
  }, [filteredClients, currentPage, pageSize])
  
  // Total pages
  const totalPages = Math.ceil(filteredClients.length / pageSize)
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, activeFilter, sortBy, sortOrder, pageSize])
  
  // Get selected clients with their names for the modal
  const selectedClients = useMemo(() => {
    // If "select all results" mode, use filtered clients
    if (selectAllResultsMode) {
      return filteredClients.map(c => ({ id: c.id, name: c.name }))
    }
    return allClients
      .filter(c => selectedClientIds.has(c.id))
      .map(c => ({ id: c.id, name: c.name }))
  }, [allClients, filteredClients, selectedClientIds, selectAllResultsMode])
  
  // Check for selectedClientId in localStorage on mount
  useEffect(() => {
    const storedClientId = localStorage.getItem('selectedClientId')
    if (storedClientId && allClients.length > 0) {
      const client = allClients.find(c => c.id === storedClientId)
      if (client) {
        setReviewQueueClient(client)
        // Clear from localStorage after use
        localStorage.removeItem('selectedClientId')
      }
    }
  }, [allClients])

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

  // Fetch data - now fetches all clients and handles filtering/sorting client-side
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Fetch summary
      const summaryRes = await api.get<DashboardSummary>('/accountant/dashboard/summary')
      setSummary(summaryRes.data)
      
      // Fetch all clients (no server-side filters for better client-side UX)
      const clientsRes = await api.get<ClientsListResponse>('/accountant/dashboard/clients', {
        params: {
          sort: 'readiness_score',
          order: 'asc',
        },
      })
      setAllClients(clientsRes.data.clients)
      
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Selection handlers
  const handleSelectClient = (id: string, selected: boolean) => {
    setSelectAllResultsMode(false) // Exit "select all results" mode
    toggleSelect(id)
  }

  const handleSelectAll = (selected: boolean) => {
    setSelectAllResultsMode(false)
    if (selected) {
      // Select all visible (paginated) clients
      selectAllClients(paginatedClients.map(c => c.id))
    } else {
      clearSelection()
    }
  }
  
  // Select all results (across all pages)
  const handleSelectAllResults = () => {
    setSelectAllResultsMode(true)
    selectAllClients(filteredClients.map(c => c.id))
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
    // Refresh data after bulk operation
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
  
  // Close review queue and go back to client list
  const handleCloseReviewQueue = () => {
    setReviewQueueClient(null)
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

        {/* Dagstart Panel - "Dagstart" Daily workflow panel */}
        <DagstartPanel 
          summary={summary} 
          clients={allClients} 
          isLoading={isLoading}
          onFilterChange={setActiveFilter as (filter: string) => void}
        />

        {/* Priority Clients Panel - "Top prioriteit klanten" */}
        <PriorityClientsPanel 
          clients={allClients} 
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

        {/* Bulk Actions Bar - Updated with new selection features */}
        <BulkActionBar
          selectedCount={selectAllResultsMode ? filteredClients.length : selectedCount}
          visibleClientCount={paginatedClients.length}
          onSelectAll={handleSelectAllResults}
          onClearSelection={handleClearSelection}
          onAction={openBulkModal}
        />
        
        {/* Select All Results Banner */}
        {selectedCount > 0 && selectedCount === paginatedClients.length && !selectAllResultsMode && filteredClients.length > paginatedClients.length && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm">
              {t('filters.onPageSelected').replace('{count}', String(paginatedClients.length))}
            </span>
            <Button variant="link" size="sm" onClick={handleSelectAllResults}>
              {t('filters.selectAll')} {filteredClients.length} {t('filters.resultsFound')}
            </Button>
          </div>
        )}
        
        {selectAllResultsMode && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm text-blue-700 dark:text-blue-300">
              ✓ {t('filters.allFilteredSelected').replace('{count}', String(filteredClients.length))}
            </span>
            <Button variant="link" size="sm" className="text-blue-600" onClick={handleClearSelection}>
              {t('bulkOps.clearSelection')}
            </Button>
          </div>
        )}

        {/* Recent Actions Panel */}
        <RecentActionsPanel />

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
                        {filteredClients.length}
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
              
              {/* Results count */}
              <div className="text-sm text-muted-foreground">
                {filteredClients.length} {t('filters.resultsFound')}
                {debouncedSearch && ` "${debouncedSearch}"`}
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : paginatedClients.length > 0 ? (
              <>
                <Table>
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
                      {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredClients.length)} {t('pagination.of')} {filteredClients.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToPrevPage}
                        disabled={currentPage === 1}
                      >
                        <CaretLeft size={16} />
                        {t('pagination.previous')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToNextPage}
                        disabled={currentPage === totalPages}
                      >
                        {t('pagination.next')}
                        <CaretRight size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : allClients.length === 0 ? (
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
