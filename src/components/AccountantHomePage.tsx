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

import { useEffect, useState, useCallback } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/AuthContext'
import { 
  api, 
  getErrorMessage,
  DashboardSummary,
  ClientStatusCard,
  ClientsListResponse,
  BulkOperationResponse,
  BulkOperationResultItem,
} from '@/lib/api'
import { 
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  Warning,
  Users,
  FileSearch,
  Calendar,
  Lightning,
  Bell,
  Gauge,
  Stack,
  PaperPlaneTilt,
  Lock,
  CaretUp,
  CaretDown,
  CaretLeft,
  Eye,
} from '@phosphor-icons/react'
import { format, formatDistanceToNow } from 'date-fns'
import { ReviewQueue } from './ReviewQueue'
import { navigateTo } from '@/lib/navigation'

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
            {client.red_issue_count} RED
          </Badge>
        )}
        {client.yellow_issue_count > 0 && (
          <Badge variant="outline" className="bg-amber-500/20 text-amber-700">
            {client.yellow_issue_count} YELLOW
          </Badge>
        )}
        {client.red_issue_count === 0 && client.yellow_issue_count === 0 && (
          <span className="text-green-600">✓ OK</span>
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
            {formatDistanceToNow(new Date(client.last_activity_at), { addSuffix: true })}
          </span>
        ) : (
          <span className="text-muted-foreground">Never</span>
        )}
      </TableCell>
      <TableCell>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => onViewReviewQueue(client)}
        >
          <Eye size={16} className="mr-1" />
          Review
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
  
  // Selection state
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set())
  
  // Review Queue state - for viewing a specific client's documents
  const [reviewQueueClient, setReviewQueueClient] = useState<ClientStatusCard | null>(null)
  
  // Sorting state
  const [sortBy, setSortBy] = useState('readiness_score')
  const [sortOrder, setSortOrder] = useState('asc')
  
  // Active tab
  const [activeTab, setActiveTab] = useState('all')
  
  // Bulk operation state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [bulkOperationType, setBulkOperationType] = useState<string | null>(null)
  const [bulkOperationResult, setBulkOperationResult] = useState<BulkOperationResponse | null>(null)
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)
  
  // Reminder form state
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderMessage, setReminderMessage] = useState('')
  const [reminderType, setReminderType] = useState('ACTION_REQUIRED')
  
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

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Fetch summary
      const summaryRes = await api.get<DashboardSummary>('/api/v1/accountant/dashboard/summary')
      setSummary(summaryRes.data)
      
      // Determine filters based on active tab
      let filters: string[] = []
      if (activeTab === 'needs_review') filters = ['needs_review']
      else if (activeTab === 'vat_due') filters = ['deadline_7d']
      else if (activeTab === 'red_issues') filters = ['has_red']
      else if (activeTab === 'stale') filters = ['stale_30d']
      
      // Fetch clients
      const clientsRes = await api.get<ClientsListResponse>('/api/v1/accountant/dashboard/clients', {
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
    setSelectedClientIds(prev => {
      const next = new Set(prev)
      if (selected) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedClientIds(new Set(clients.map(c => c.id)))
    } else {
      setSelectedClientIds(new Set())
    }
  }

  // Bulk operation handlers
  const openBulkModal = (operationType: string) => {
    setBulkOperationType(operationType)
    setBulkOperationResult(null)
    setIsBulkModalOpen(true)
  }

  const executeBulkOperation = async () => {
    if (!bulkOperationType || selectedClientIds.size === 0) return
    
    setIsBulkProcessing(true)
    setBulkOperationResult(null)
    
    try {
      let endpoint = ''
      let payload: Record<string, unknown> = {
        client_ids: Array.from(selectedClientIds),
      }
      
      switch (bulkOperationType) {
        case 'recalculate':
          endpoint = '/api/v1/accountant/bulk/recalculate'
          payload.force = true
          break
        case 'ack_yellow':
          endpoint = '/api/v1/accountant/bulk/ack-yellow'
          break
        case 'send_reminders':
          endpoint = '/api/v1/accountant/bulk/send-reminders'
          payload.reminder_type = reminderType
          payload.title = reminderTitle
          payload.message = reminderMessage
          break
        case 'generate_vat':
          endpoint = '/api/v1/accountant/bulk/generate-vat-draft'
          const now = new Date()
          payload.period_year = now.getFullYear()
          payload.period_quarter = Math.ceil((now.getMonth() + 1) / 3)
          break
        default:
          return
      }
      
      const response = await api.post<BulkOperationResponse>(endpoint, payload)
      setBulkOperationResult(response.data)
      
      // Refresh data after bulk operation
      await fetchData()
      
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsBulkProcessing(false)
    }
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
  
  // Handle view review queue for a client
  const handleViewReviewQueue = (client: ClientStatusCard) => {
    setReviewQueueClient(client)
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
            <AlertTitle>Access Restricted</AlertTitle>
            <AlertDescription>
              This page is only available for accountants managing ZZP clients.
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
              Back to Client List
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
              Daily Work Queue
            </h1>
            <p className="text-muted-foreground">
              {summary?.total_clients || 0} clients assigned
            </p>
          </div>
          <Button onClick={fetchData} variant="outline" size="sm" disabled={isLoading}>
            <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

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
            label="Total Clients" 
            value={summary?.total_clients || 0}
            isLoading={isLoading}
          />
          <KPICard 
            icon={WarningCircle} 
            label="RED Issues" 
            value={summary?.clients_with_red_issues || 0}
            color="red"
            isLoading={isLoading}
          />
          <KPICard 
            icon={FileSearch} 
            label="In Review" 
            value={summary?.clients_in_review || 0}
            color="yellow"
            isLoading={isLoading}
          />
          <KPICard 
            icon={Calendar} 
            label="VAT Due 7d" 
            value={summary?.upcoming_vat_deadlines_7d || 0}
            color={summary?.upcoming_vat_deadlines_7d ? 'red' : 'green'}
            isLoading={isLoading}
          />
          <KPICard 
            icon={Stack} 
            label="Doc Backlog" 
            value={summary?.document_backlog_total || 0}
            color={summary?.document_backlog_total ? 'yellow' : 'green'}
            isLoading={isLoading}
          />
          <KPICard 
            icon={Bell} 
            label="Alerts" 
            value={(summary?.alerts_by_severity.critical || 0) + (summary?.alerts_by_severity.warning || 0)}
            color={summary?.alerts_by_severity.critical ? 'red' : 'yellow'}
            isLoading={isLoading}
          />
        </div>

        {/* Bulk Actions Bar */}
        {selectedClientIds.size > 0 && (
          <Card className="mb-4 bg-primary/5 border-primary/20">
            <CardContent className="p-3 flex items-center gap-4">
              <span className="font-medium">
                {selectedClientIds.size} client{selectedClientIds.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2 ml-auto">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => openBulkModal('recalculate')}
                >
                  <ArrowsClockwise size={16} className="mr-1" />
                  Recalculate
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => openBulkModal('ack_yellow')}
                >
                  <CheckCircle size={16} className="mr-1" />
                  Ack YELLOW
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => openBulkModal('generate_vat')}
                >
                  <Gauge size={16} className="mr-1" />
                  VAT Draft
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => openBulkModal('send_reminders')}
                >
                  <PaperPlaneTilt size={16} className="mr-1" />
                  Send Reminder
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => setSelectedClientIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content with Tabs */}
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">
                  All Clients
                </TabsTrigger>
                <TabsTrigger value="red_issues" className="text-red-600">
                  <WarningCircle size={16} className="mr-1" />
                  Red Issues
                </TabsTrigger>
                <TabsTrigger value="needs_review">
                  <FileSearch size={16} className="mr-1" />
                  Needs Review
                </TabsTrigger>
                <TabsTrigger value="vat_due">
                  <Calendar size={16} className="mr-1" />
                  VAT Due
                </TabsTrigger>
                <TabsTrigger value="stale">
                  <Warning size={16} className="mr-1" />
                  Stale 30d
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
                        checked={selectedClientIds.size === clients.length && clients.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('name')}
                    >
                      Client <SortIcon field="name" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('readiness_score')}
                    >
                      Score <SortIcon field="readiness_score" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('red_issues')}
                    >
                      Issues <SortIcon field="red_issues" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('backlog')}
                    >
                      Backlog <SortIcon field="backlog" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('deadline')}
                    >
                      VAT <SortIcon field="deadline" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => toggleSort('last_activity')}
                    >
                      Activity <SortIcon field="last_activity" />
                    </TableHead>
                    <TableHead>
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <ClientRow
                      key={client.id}
                      client={client}
                      isSelected={selectedClientIds.has(client.id)}
                      onSelect={handleSelectClient}
                      onViewReviewQueue={handleViewReviewQueue}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No clients yet</p>
                <p className="text-sm mt-2">
                  Clients will appear here once they're assigned to you.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Operation Modal */}
        <Dialog open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {bulkOperationType === 'recalculate' && 'Bulk Recalculate Validation'}
                {bulkOperationType === 'ack_yellow' && 'Bulk Acknowledge YELLOW Issues'}
                {bulkOperationType === 'generate_vat' && 'Bulk Generate VAT Draft'}
                {bulkOperationType === 'send_reminders' && 'Bulk Send Reminders'}
              </DialogTitle>
              <DialogDescription>
                This action will be applied to {selectedClientIds.size} selected client{selectedClientIds.size > 1 ? 's' : ''}.
              </DialogDescription>
            </DialogHeader>

            {/* Reminder form fields */}
            {bulkOperationType === 'send_reminders' && !bulkOperationResult && (
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="reminder-type">Reminder Type</Label>
                  <Select value={reminderType} onValueChange={setReminderType}>
                    <SelectTrigger id="reminder-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTION_REQUIRED">Action Required</SelectItem>
                      <SelectItem value="DOCUMENT_MISSING">Document Missing</SelectItem>
                      <SelectItem value="VAT_DEADLINE">VAT Deadline</SelectItem>
                      <SelectItem value="REVIEW_PENDING">Review Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="reminder-title">Title</Label>
                  <Input 
                    id="reminder-title"
                    value={reminderTitle}
                    onChange={(e) => setReminderTitle(e.target.value)}
                    placeholder="Reminder title..."
                  />
                </div>
                <div>
                  <Label htmlFor="reminder-message">Message</Label>
                  <Textarea 
                    id="reminder-message"
                    value={reminderMessage}
                    onChange={(e) => setReminderMessage(e.target.value)}
                    placeholder="Reminder message..."
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Results */}
            {bulkOperationResult && (
              <div className="py-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {bulkOperationResult.status === 'COMPLETED' && (
                      <Badge className="bg-green-500">COMPLETED</Badge>
                    )}
                    {bulkOperationResult.status === 'COMPLETED_WITH_ERRORS' && (
                      <Badge className="bg-amber-500">COMPLETED WITH ERRORS</Badge>
                    )}
                    {bulkOperationResult.status === 'FAILED' && (
                      <Badge variant="destructive">FAILED</Badge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {bulkOperationResult.successful_clients}/{bulkOperationResult.total_clients} successful
                    </span>
                  </div>
                  {/* Idempotency key and timestamp */}
                  <div className="text-xs text-muted-foreground">
                    {bulkOperationResult.completed_at && (
                      <span>Completed: {new Date(bulkOperationResult.completed_at).toLocaleTimeString()}</span>
                    )}
                  </div>
                </div>
                
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {bulkOperationResult.results.map((result) => (
                    <div 
                      key={result.client_id}
                      className={`p-2 rounded text-sm ${
                        result.status === 'SUCCESS' ? 'bg-green-500/10' :
                        result.status === 'FAILED' ? 'bg-red-500/10' :
                        'bg-gray-500/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{result.client_name}</span>
                        <Badge variant={
                          result.status === 'SUCCESS' ? 'outline' :
                          result.status === 'FAILED' ? 'destructive' :
                          'secondary'
                        }>
                          {result.status}
                        </Badge>
                      </div>
                      {result.error_message && (
                        <p className="text-xs text-red-600 mt-1">{result.error_message}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Retry failed clients button */}
                {bulkOperationResult.failed_clients > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Get failed client IDs and retry
                        const failedIds = bulkOperationResult.results
                          .filter(r => r.status === 'FAILED')
                          .map(r => r.client_id)
                        setSelectedClientIds(new Set(failedIds))
                        setBulkOperationResult(null)
                      }}
                    >
                      <ArrowsClockwise size={14} className="mr-2" />
                      Retry {bulkOperationResult.failed_clients} Failed Client{bulkOperationResult.failed_clients > 1 ? 's' : ''}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              {!bulkOperationResult ? (
                <>
                  <Button variant="outline" onClick={() => setIsBulkModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={executeBulkOperation}
                    disabled={isBulkProcessing || (bulkOperationType === 'send_reminders' && (!reminderTitle || !reminderMessage))}
                  >
                    {isBulkProcessing ? (
                      <>
                        <ArrowsClockwise size={16} className="mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Lightning size={16} className="mr-2" />
                        Execute
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setIsBulkModalOpen(false)}>
                  Close
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
