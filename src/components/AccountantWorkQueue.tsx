/**
 * Accountant Work Queue Component
 * 
 * Unified work queue for the accountant dashboard:
 * - Tabs: All, Red Issues, Needs Review, VAT Due, Stale 30d
 * - Each row shows readiness score, work item, counts, and due date
 * - Clicking row opens client detail drawer
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/AuthContext'
import {
  workQueueApi,
  WorkQueueItem,
  WorkQueueResponse,
  SLASummaryResponse,
  getErrorMessage,
} from '@/lib/api'
import {
  ArrowsClockwise,
  WarningCircle,
  Warning,
  MagnifyingGlass,
  Calendar,
  ClockCountdown,
  CaretUp,
  CaretDown,
  Gauge,
  Bell,
  Lightning,
  Info,
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

// Readiness score badge with tooltip
const ReadinessScoreBadge = ({ score, breakdown }: { score: number; breakdown?: { deductions?: Array<{ reason: string; penalty: number }> } | null }) => {
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'bg-green-500/20 text-green-700 dark:text-green-400'
    if (s >= 50) return 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
    if (s >= 20) return 'bg-orange-500/20 text-orange-700 dark:text-orange-400'
    return 'bg-red-500/20 text-red-700 dark:text-red-400'
  }

  const formatReason = (reason: string) => {
    return reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${getScoreColor(score)} font-bold cursor-help`}>
            <Gauge size={14} className="mr-1" />
            {score}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="text-sm">
            <p className="font-semibold mb-2">Readiness Score: {score}/100</p>
            {breakdown?.deductions && breakdown.deductions.length > 0 ? (
              <ul className="space-y-1">
                {breakdown.deductions.map((d, i) => (
                  <li key={i} className="flex justify-between text-xs">
                    <span>{formatReason(d.reason)}</span>
                    <span className="text-red-500 ml-2">-{d.penalty}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Perfect health!</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Severity badge
const SeverityBadge = ({ severity }: { severity: string | null }) => {
  if (!severity) return null
  
  const config: Record<string, { bg: string; text: string }> = {
    CRITICAL: { bg: 'bg-red-600', text: 'text-white' },
    RED: { bg: 'bg-red-500/20', text: 'text-red-700 dark:text-red-400' },
    WARNING: { bg: 'bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400' },
    YELLOW: { bg: 'bg-yellow-500/20', text: 'text-yellow-700 dark:text-yellow-400' },
    INFO: { bg: 'bg-blue-500/20', text: 'text-blue-700 dark:text-blue-400' },
  }
  
  const style = config[severity] || config.INFO
  
  return (
    <Badge className={`${style.bg} ${style.text} text-xs`}>
      {severity}
    </Badge>
  )
}

// Work item row
const WorkItemRow = ({
  item,
  onSelect,
}: {
  item: WorkQueueItem
  onSelect: (item: WorkQueueItem) => void
}) => {
  const isUrgent = item.severity === 'CRITICAL' || item.severity === 'RED'
  
  return (
    <TableRow
      className={`cursor-pointer hover:bg-muted/50 ${isUrgent ? 'bg-red-50 dark:bg-red-950/30' : ''}`}
      onClick={() => onSelect(item)}
    >
      <TableCell>
        <ReadinessScoreBadge score={item.readiness_score} breakdown={item.readiness_breakdown} />
      </TableCell>
      <TableCell className="font-medium">
        <div>
          <p className="font-semibold">{item.client_name}</p>
          <p className="text-xs text-muted-foreground">{item.period_status || 'No period'}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={item.severity} />
          <span className="text-sm">{item.title}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{item.suggested_next_action}</p>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {item.counts?.red > 0 && (
            <Badge variant="destructive" className="text-xs">
              {item.counts.red} RED
            </Badge>
          )}
          {item.counts?.yellow > 0 && (
            <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-700">
              {item.counts.yellow} YELLOW
            </Badge>
          )}
          {item.counts?.backlog > 0 && (
            <Badge variant="outline" className="text-xs">
              {item.counts.backlog} docs
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {item.due_date ? (
          <span className={item.severity === 'CRITICAL' ? 'text-red-600 font-medium' : ''}>
            {format(new Date(item.due_date), 'MMM d')}
          </span>
        ) : item.age_days ? (
          <span className="text-muted-foreground">{item.age_days}d ago</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}

// Client detail drawer
const ClientDetailDrawer = ({
  item,
  isOpen,
  onClose,
  onAction,
}: {
  item: WorkQueueItem | null
  isOpen: boolean
  onClose: () => void
  onAction: (action: string) => void
}) => {
  if (!item) return null
  
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ReadinessScoreBadge score={item.readiness_score} breakdown={item.readiness_breakdown} />
            {item.client_name}
          </SheetTitle>
          <SheetDescription>
            {item.period_status ? `Period: ${item.period_status}` : 'No active period'}
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {/* Current issue */}
          <div className="p-4 rounded-lg bg-muted">
            <div className="flex items-start gap-3">
              <SeverityBadge severity={item.severity} />
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
              </div>
            </div>
          </div>
          
          {/* Issue counts */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Issue Summary</h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-lg bg-red-500/10 text-center">
                <p className="text-2xl font-bold text-red-600">{item.counts?.red || 0}</p>
                <p className="text-xs text-muted-foreground">RED Issues</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 text-center">
                <p className="text-2xl font-bold text-amber-600">{item.counts?.yellow || 0}</p>
                <p className="text-xs text-muted-foreground">YELLOW Issues</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 text-center">
                <p className="text-2xl font-bold text-blue-600">{item.counts?.backlog || 0}</p>
                <p className="text-xs text-muted-foreground">Doc Backlog</p>
              </div>
            </div>
          </div>
          
          {/* Suggested action */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Suggested Next Action</h4>
            <div className="p-3 rounded-lg border bg-primary/5">
              <p className="text-sm font-medium">{item.suggested_next_action}</p>
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Quick Actions</h4>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => onAction('recalculate')}>
                <ArrowsClockwise size={16} className="mr-2" />
                Recalculate
              </Button>
              <Button variant="outline" size="sm" onClick={() => onAction('view_issues')}>
                <WarningCircle size={16} className="mr-2" />
                View Issues
              </Button>
              <Button variant="outline" size="sm" onClick={() => onAction('vat_draft')}>
                <MagnifyingGlass size={16} className="mr-2" />
                VAT Draft
              </Button>
              <Button variant="outline" size="sm" onClick={() => onAction('send_reminder')}>
                <Bell size={16} className="mr-2" />
                Send Reminder
              </Button>
              {item.period_status === 'REVIEW' && (
                <Button variant="outline" size="sm" onClick={() => onAction('finalize')}>
                  <Lightning size={16} className="mr-2" />
                  Start Finalize
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// SLA Summary card
const SLASummaryCard = ({ summary, isLoading }: { summary: SLASummaryResponse | null; isLoading: boolean }) => {
  if (isLoading) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    )
  }
  
  if (!summary || summary.total_violations === 0) return null
  
  return (
    <Alert className={summary.critical_count > 0 ? 'bg-red-500/10 border-red-500/40' : 'bg-amber-500/10 border-amber-500/40'}>
      <WarningCircle className={`h-5 w-5 ${summary.critical_count > 0 ? 'text-red-600' : 'text-amber-600'}`} />
      <AlertDescription className="ml-2">
        <span className="font-semibold">SLA Violations: </span>
        {summary.critical_count > 0 && (
          <Badge variant="destructive" className="mx-1">{summary.critical_count} CRITICAL</Badge>
        )}
        {summary.warning_count > 0 && (
          <Badge variant="outline" className="mx-1 bg-amber-500/20">{summary.warning_count} WARNING</Badge>
        )}
        <span className="text-sm text-muted-foreground ml-2">
          ({summary.escalation_events_today} escalations today)
        </span>
      </AlertDescription>
    </Alert>
  )
}

export const AccountantWorkQueue = () => {
  const { user } = useAuth()
  
  // Data state
  const [workQueue, setWorkQueue] = useState<WorkQueueResponse | null>(null)
  const [slaSummary, setSlaSummary] = useState<SLASummaryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Delayed loading to prevent flashing
  const showLoading = useDelayedLoading(isLoading, 300, !!workQueue)
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'all' | 'red' | 'review' | 'vat_due' | 'stale'>('all')
  
  // Sort state
  const [sortBy, setSortBy] = useState('readiness_score')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  
  // Drawer state
  const [selectedItem, setSelectedItem] = useState<WorkQueueItem | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const [queueData, slaData] = await Promise.all([
        workQueueApi.getWorkQueue(activeTab, 100, sortBy, sortOrder),
        workQueueApi.getSLASummary(),
      ])
      
      setWorkQueue(queueData)
      setSlaSummary(slaData)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, sortBy, sortOrder])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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

  // Handle item selection
  const handleSelectItem = (item: WorkQueueItem) => {
    setSelectedItem(item)
    setIsDrawerOpen(true)
  }

  // Handle drawer actions
  const handleAction = (action: string) => {
    console.log('Action:', action, 'for client:', selectedItem?.client_id)
    // TODO: Implement action handlers
    setIsDrawerOpen(false)
  }

  // Check access
  if (user?.role !== 'accountant' && user?.role !== 'admin') {
    return (
      <Alert className="bg-amber-500/10 border-amber-500/40 m-4">
        <Warning className="h-5 w-5 text-amber-600" />
        <AlertDescription>
          This component is only available for accountants.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Work Queue</h2>
          <p className="text-muted-foreground">
            {workQueue?.total_count || 0} items requiring attention
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" disabled={isLoading}>
          <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* SLA Summary */}
      <SLASummaryCard summary={slaSummary} isLoading={isLoading} />

      {/* Error Alert */}
      {error && (
        <Alert className="bg-destructive/10 border-destructive/40">
          <WarningCircle className="h-5 w-5 text-destructive" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Card with Tabs */}
      <Card>
        <CardHeader className="pb-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">
                All
                {workQueue?.counts && (
                  <Badge variant="secondary" className="ml-2">
                    {workQueue.total_count}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="red" className="text-red-600">
                <WarningCircle size={16} className="mr-1" />
                Red Issues
                {workQueue?.counts?.red_issues && workQueue.counts.red_issues > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {workQueue.counts.red_issues}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="review">
                <MagnifyingGlass size={16} className="mr-1" />
                Needs Review
              </TabsTrigger>
              <TabsTrigger value="vat_due">
                <Calendar size={16} className="mr-1" />
                VAT Due
              </TabsTrigger>
              <TabsTrigger value="stale">
                <ClockCountdown size={16} className="mr-1" />
                Stale 30d
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="pt-4">
          {showLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : workQueue && workQueue.items.length > 0 ? (
            <Table style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="w-20 cursor-pointer"
                    onClick={() => toggleSort('readiness_score')}
                  >
                    Score <SortIcon field="readiness_score" />
                  </TableHead>
                  <TableHead className="w-40">Client</TableHead>
                  <TableHead>Work Item</TableHead>
                  <TableHead className="w-48">Counts</TableHead>
                  <TableHead
                    className="w-24 cursor-pointer"
                    onClick={() => toggleSort('due_date')}
                  >
                    Due <SortIcon field="due_date" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workQueue.items.map((item, idx) => (
                  <WorkItemRow
                    key={`${item.client_id}-${item.work_item_type}-${idx}`}
                    item={item}
                    onSelect={handleSelectItem}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Info size={48} className="mx-auto mb-4 opacity-50" />
              <p>No work items in this queue</p>
              <p className="text-sm mt-2">All clients are in good standing!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Detail Drawer */}
      <ClientDetailDrawer
        item={selectedItem}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onAction={handleAction}
      />
    </div>
  )
}
