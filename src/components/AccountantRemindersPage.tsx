/**
 * Accountant Reminders Page - Tasks & Reminders Center
 * 
 * Shows:
 * 1) "Herinneringen geschiedenis" table with filters (period, client, status)
 * 2) "Bulk acties logs" section showing recent bulk operations
 * 
 * All text is in Dutch per UX requirements.
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/AuthContext'
import { 
  reminderApi, 
  accountantClientApi,
  accountantMasterDashboardApi,
  ReminderResponse,
  ReminderHistoryResponse,
  BulkOperationResponse,
  AccountantClientListItem,
  getErrorMessage,
} from '@/lib/api'
import { 
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  Clock,
  Bell,
  EnvelopeSimple,
  DeviceMobile,
  CalendarBlank,
  Lightning,
  Stack,
  PaperPlaneTilt,
  Lock,
  Warning,
  FunnelSimple,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import { format, subDays, formatDistanceToNow } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'

// Constants
const ADMIN_ID_TRUNCATE_LENGTH = 8
const MESSAGE_PREVIEW_LENGTH = 50

// Period filter options
type PeriodFilter = 'last7' | 'last30' | 'last90' | 'all'

// Status filter options
type StatusFilter = 'all' | 'SENT' | 'FAILED' | 'PENDING' | 'SCHEDULED'

// Helper to get status badge styling
const getStatusBadge = (status: string) => {
  switch (status.toUpperCase()) {
    case 'SENT':
      return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/30">{t('reminders.sent')}</Badge>
    case 'FAILED':
      return <Badge variant="destructive">{t('reminders.failed')}</Badge>
    case 'PENDING':
      return <Badge variant="secondary">{t('reminders.pending')}</Badge>
    case 'SCHEDULED':
      return <Badge variant="outline" className="text-blue-600 border-blue-500/30">{t('reminders.scheduled')}</Badge>
    case 'IN_PROGRESS':
      return <Badge variant="outline" className="text-amber-600 border-amber-500/30">{t('reminders.inProgress')}</Badge>
    case 'COMPLETED':
      return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/30">{t('reminders.completed')}</Badge>
    case 'COMPLETED_WITH_ERRORS':
      return <Badge variant="outline" className="text-amber-600 border-amber-500/30">{t('reminders.completedWithErrors')}</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

// Helper to get channel badge
const getChannelBadge = (channel: string) => {
  switch (channel.toUpperCase()) {
    case 'IN_APP':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <DeviceMobile size={14} /> {t('reminders.channelInApp')}
        </span>
      )
    case 'EMAIL':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <EnvelopeSimple size={14} /> {t('reminders.channelEmail')}
        </span>
      )
    default:
      return <span className="text-xs text-muted-foreground">{channel}</span>
  }
}

// Helper to get reminder type display text
const getReminderTypeDisplay = (reminderType: string) => {
  switch (reminderType) {
    case 'ACTION_REQUIRED':
      return t('reminders.typeActionRequired')
    case 'DOCUMENT_MISSING':
      return t('reminders.typeDocumentMissing')
    case 'VAT_DEADLINE':
      return t('reminders.typeVatDeadline')
    case 'REVIEW_PENDING':
      return t('reminders.typeReviewPending')
    default:
      return reminderType
  }
}

// Helper to get bulk operation type display text
const getBulkOperationTypeDisplay = (operationType: string) => {
  switch (operationType.toUpperCase()) {
    case 'RECALCULATE':
      return t('reminders.bulkRecalculate')
    case 'ACK_YELLOW':
      return t('reminders.bulkAckYellow')
    case 'GENERATE_VAT_DRAFT':
      return t('reminders.bulkVatDraft')
    case 'SEND_REMINDERS':
      return t('reminders.bulkSendReminders')
    case 'LOCK_PERIOD':
      return t('reminders.bulkLockPeriod')
    default:
      return operationType
  }
}

// Helper to get bulk operation icon
const getBulkOperationIcon = (operationType: string) => {
  switch (operationType.toUpperCase()) {
    case 'RECALCULATE':
      return <ArrowsClockwise size={16} className="text-blue-500" />
    case 'ACK_YELLOW':
      return <CheckCircle size={16} className="text-amber-500" />
    case 'GENERATE_VAT_DRAFT':
      return <Stack size={16} className="text-purple-500" />
    case 'SEND_REMINDERS':
      return <PaperPlaneTilt size={16} className="text-green-500" />
    case 'LOCK_PERIOD':
      return <Lock size={16} className="text-red-500" />
    default:
      return <Lightning size={16} className="text-gray-500" />
  }
}

export const AccountantRemindersPage = () => {
  const { user } = useAuth()
  
  // State for reminders
  const [reminders, setReminders] = useState<ReminderResponse[]>([])
  const [totalReminders, setTotalReminders] = useState(0)
  const [isLoadingReminders, setIsLoadingReminders] = useState(true)
  const [remindersError, setRemindersError] = useState<string | null>(null)
  
  // State for bulk operations
  const [bulkOperations, setBulkOperations] = useState<BulkOperationResponse[]>([])
  const [isLoadingBulkOps, setIsLoadingBulkOps] = useState(true)
  const [bulkOpsError, setBulkOpsError] = useState<string | null>(null)
  
  // State for clients (for filter dropdown)
  const [clients, setClients] = useState<AccountantClientListItem[]>([])
  
  // Filter state
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('last30')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  
  // Load clients for filter dropdown
  useEffect(() => {
    const loadClients = async () => {
      try {
        const response = await accountantClientApi.listClients()
        setClients(response.clients)
      } catch {
        // Silently fail - filter will just show "All clients"
        console.warn('Could not load clients for filter')
      }
    }
    loadClients()
  }, [])
  
  // Load reminders based on filters
  const loadReminders = async () => {
    setIsLoadingReminders(true)
    setRemindersError(null)
    
    try {
      const clientId = clientFilter !== 'all' ? clientFilter : undefined
      const response = await reminderApi.getHistory(clientId, 100, 0)
      
      // Apply local filtering for period and status since the API might not support all filters
      let filteredReminders = response.reminders
      
      // Filter by status
      if (statusFilter !== 'all') {
        filteredReminders = filteredReminders.filter(r => r.status === statusFilter)
      }
      
      // Filter by period
      const now = new Date()
      if (periodFilter !== 'all') {
        const daysMap: Record<PeriodFilter, number> = {
          last7: 7,
          last30: 30,
          last90: 90,
          all: 0,
        }
        const cutoffDate = subDays(now, daysMap[periodFilter])
        filteredReminders = filteredReminders.filter(r => {
          const createdAt = r.created_at ? new Date(r.created_at) : null
          return createdAt && createdAt >= cutoffDate
        })
      }
      
      setReminders(filteredReminders)
      setTotalReminders(filteredReminders.length)
    } catch (err) {
      setRemindersError(getErrorMessage(err))
    } finally {
      setIsLoadingReminders(false)
    }
  }
  
  // Load bulk operations
  const loadBulkOperations = async () => {
    setIsLoadingBulkOps(true)
    setBulkOpsError(null)
    
    try {
      const response = await accountantMasterDashboardApi.listBulkOperations(50)
      setBulkOperations(response.operations)
    } catch (err) {
      setBulkOpsError(getErrorMessage(err))
    } finally {
      setIsLoadingBulkOps(false)
    }
  }
  
  // Load data on mount and when filters change
  useEffect(() => {
    loadReminders()
  }, [periodFilter, clientFilter, statusFilter])
  
  useEffect(() => {
    loadBulkOperations()
  }, [])
  
  // Handle refresh
  const handleRefresh = () => {
    loadReminders()
    loadBulkOperations()
  }
  
  // Access check
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
  
  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    try {
      const date = new Date(dateStr)
      return format(date, 'd MMM yyyy HH:mm', { locale: nlLocale })
    } catch {
      return dateStr
    }
  }
  
  // Format relative time
  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      return formatDistanceToNow(date, { addSuffix: true, locale: nlLocale })
    } catch {
      return ''
    }
  }

  // Get client name from administration_id
  const getClientName = (administrationId: string) => {
    const client = clients.find(c => c.administration_id === administrationId)
    return client?.name || client?.administration_name || administrationId.substring(0, ADMIN_ID_TRUNCATE_LENGTH) + '...'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">
              {t('reminders.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('reminders.subtitle')}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <ArrowsClockwise size={16} className="mr-2" />
            {t('reminders.refreshData')}
          </Button>
        </div>
        
        {/* Reminders History Section */}
        <Card className="bg-card/80 backdrop-blur-sm mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell size={20} className="text-primary" />
                  {t('reminders.history')}
                </CardTitle>
                <CardDescription>{t('reminders.historyDescription')}</CardDescription>
              </div>
            </div>
            
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mt-4">
              <div className="flex items-center gap-2">
                <FunnelSimple size={16} className="text-muted-foreground" />
                <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder={t('reminders.filterPeriod')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last7">{t('reminders.last7Days')}</SelectItem>
                    <SelectItem value="last30">{t('reminders.last30Days')}</SelectItem>
                    <SelectItem value="last90">{t('reminders.last90Days')}</SelectItem>
                    <SelectItem value="all">{t('reminders.allTime')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder={t('reminders.filterClient')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('reminders.allClients')}</SelectItem>
                  {clients.filter(c => c.administration_id).map((client) => (
                    <SelectItem key={client.administration_id} value={client.administration_id!}>
                      {client.name || client.administration_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={t('reminders.filterStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('reminders.allStatuses')}</SelectItem>
                  <SelectItem value="SENT">{t('reminders.statusSent')}</SelectItem>
                  <SelectItem value="FAILED">{t('reminders.statusFailed')}</SelectItem>
                  <SelectItem value="PENDING">{t('reminders.statusPending')}</SelectItem>
                  <SelectItem value="SCHEDULED">{t('reminders.statusScheduled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {remindersError && (
              <Alert className="mb-4 bg-destructive/10 border-destructive/40">
                <WarningCircle className="h-5 w-5 text-destructive" />
                <AlertDescription>{remindersError}</AlertDescription>
              </Alert>
            )}
            
            {isLoadingReminders ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : reminders.length === 0 ? (
              <EmptyState
                title={t('reminders.noRemindersFound')}
                description={t('reminders.noRemindersDescription')}
                icon={<Bell size={64} weight="duotone" className="text-muted-foreground" />}
                tips={[t('reminders.sendFirstReminder')]}
                actionLabel={t('sidebar.accountantOverview')}
                onAction={() => navigateTo('/accountant')}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('reminders.date')}</TableHead>
                      <TableHead>{t('reminders.client')}</TableHead>
                      <TableHead>{t('reminders.actionType')}</TableHead>
                      <TableHead>{t('reminders.channel')}</TableHead>
                      <TableHead>{t('reminders.result')}</TableHead>
                      <TableHead>{t('reminders.details')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reminders.map((reminder) => (
                      <TableRow key={reminder.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm">{formatDate(reminder.created_at)}</span>
                            <span className="text-xs text-muted-foreground">{formatRelativeTime(reminder.created_at)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{getClientName(reminder.administration_id)}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{getReminderTypeDisplay(reminder.reminder_type)}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={reminder.title}>
                              {reminder.title}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getChannelBadge(reminder.channel)}</TableCell>
                        <TableCell>{getStatusBadge(reminder.status)}</TableCell>
                        <TableCell>
                          <div className="max-w-[200px]">
                            {reminder.send_error ? (
                              <span className="text-xs text-destructive">{reminder.send_error}</span>
                            ) : reminder.sent_at ? (
                              <span className="text-xs text-muted-foreground">
                                {t('reminders.sent')}: {formatDate(reminder.sent_at)}
                              </span>
                            ) : reminder.scheduled_at ? (
                              <span className="text-xs text-blue-600">
                                {t('reminders.scheduled')}: {formatDate(reminder.scheduled_at)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground truncate" title={reminder.message}>
                                {reminder.message?.substring(0, MESSAGE_PREVIEW_LENGTH)}...
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 text-sm text-muted-foreground">
                  {totalReminders} {t('reminders.history').toLowerCase()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Bulk Operations History Section */}
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightning size={20} className="text-primary" />
              {t('reminders.bulkHistory')}
            </CardTitle>
            <CardDescription>{t('reminders.bulkHistoryDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {bulkOpsError && (
              <Alert className="mb-4 bg-destructive/10 border-destructive/40">
                <WarningCircle className="h-5 w-5 text-destructive" />
                <AlertDescription>{bulkOpsError}</AlertDescription>
              </Alert>
            )}
            
            {isLoadingBulkOps ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : bulkOperations.length === 0 ? (
              <EmptyState
                title={t('reminders.noBulkActionsFound')}
                description={t('reminders.noBulkActionsDescription')}
                icon={<Lightning size={64} weight="duotone" className="text-muted-foreground" />}
                actionLabel={t('sidebar.accountantOverview')}
                onAction={() => navigateTo('/accountant')}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('reminders.date')}</TableHead>
                      <TableHead>{t('reminders.actionType')}</TableHead>
                      <TableHead>{t('reminders.result')}</TableHead>
                      <TableHead>{t('reminders.clientsAffected')}</TableHead>
                      <TableHead>{t('reminders.successRate')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkOperations.map((op) => {
                      const successRate = op.total_clients > 0 
                        ? Math.round((op.successful_clients / op.total_clients) * 100) 
                        : 0
                      return (
                        <TableRow key={op.id}>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-sm">{formatDate(op.created_at)}</span>
                              <span className="text-xs text-muted-foreground">{formatRelativeTime(op.created_at)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getBulkOperationIcon(op.operation_type)}
                              <span className="font-medium">{getBulkOperationTypeDisplay(op.operation_type)}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(op.status)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{op.processed_clients}/{op.total_clients}</span>
                              <span className="text-xs text-muted-foreground">{t('reminders.clientsAffected')}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {successRate >= 100 ? (
                                <CheckCircle size={16} className="text-green-500" />
                              ) : successRate > 0 ? (
                                <Warning size={16} className="text-amber-500" />
                              ) : (
                                <WarningCircle size={16} className="text-red-500" />
                              )}
                              <span className={`text-sm font-medium ${
                                successRate >= 100 ? 'text-green-600' : 
                                successRate > 0 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                {successRate}%
                              </span>
                              {op.failed_clients > 0 && (
                                <span className="text-xs text-destructive">
                                  ({op.failed_clients} {t('reminders.failed').toLowerCase()})
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
