/**
 * BulkOperationsHistoryPage - Bulk Operations History Page
 * 
 * Shows history of bulk operations performed by the accountant:
 * - Table with columns: Datum/tijd, Actie, Status, Aantal klanten, Details
 * - Details drawer showing per-client results
 * - Filter by status
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/lib/AuthContext'
import { 
  accountantMasterDashboardApi,
  BulkOperationResponse,
  BulkOperationResultItem,
  getErrorMessage,
} from '@/lib/api'
import { 
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  XCircle,
  Clock,
  Gauge,
  PaperPlaneTilt,
  Lock,
  Warning,
  Eye,
  CaretLeft,
  Spinner,
  Funnel,
} from '@phosphor-icons/react'
import { format, formatDistanceToNow } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'

// Map operation types to icons and labels
const operationTypeConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  RECALCULATE: { icon: ArrowsClockwise, label: t('bulkHistory.actionRecalculate'), color: 'text-blue-600' },
  ACK_YELLOW: { icon: CheckCircle, label: t('bulkHistory.actionAckYellow'), color: 'text-amber-600' },
  GENERATE_VAT_DRAFT: { icon: Gauge, label: t('bulkHistory.actionVatDraft'), color: 'text-purple-600' },
  SEND_REMINDERS: { icon: PaperPlaneTilt, label: t('bulkHistory.actionSendReminders'), color: 'text-green-600' },
  LOCK_PERIOD: { icon: Lock, label: t('bulkHistory.actionLockPeriod'), color: 'text-red-600' },
}

// Map status to badge config
const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  PENDING: { label: t('bulkHistory.statusPending'), variant: 'outline' },
  IN_PROGRESS: { label: t('bulkHistory.statusInProgress'), variant: 'secondary', className: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: t('bulkHistory.statusCompleted'), variant: 'default', className: 'bg-green-100 text-green-700' },
  COMPLETED_WITH_ERRORS: { label: t('bulkHistory.statusCompletedWithErrors'), variant: 'outline', className: 'bg-amber-100 text-amber-700' },
  FAILED: { label: t('bulkHistory.statusFailed'), variant: 'destructive' },
}

// Result status badge
const ResultStatusBadge = ({ status }: { status: 'SUCCESS' | 'FAILED' | 'SKIPPED' }) => {
  const config = {
    SUCCESS: { icon: CheckCircle, label: t('results.success'), className: 'bg-green-100 text-green-700' },
    FAILED: { icon: XCircle, label: t('results.failed'), className: 'bg-red-100 text-red-700' },
    SKIPPED: { icon: Warning, label: t('results.skipped'), className: 'bg-amber-100 text-amber-700' },
  }
  const c = config[status]
  const Icon = c.icon

  return (
    <Badge variant="outline" className={c.className}>
      <Icon size={12} className="mr-1" />
      {c.label}
    </Badge>
  )
}

// Operation row component
const OperationRow = ({ 
  operation, 
  onViewDetails 
}: { 
  operation: BulkOperationResponse
  onViewDetails: () => void 
}) => {
  const typeConfig = operationTypeConfig[operation.operation_type] || operationTypeConfig.RECALCULATE
  const StatusIcon = typeConfig.icon
  const statusCfg = statusConfig[operation.status] || statusConfig.PENDING

  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col">
          <span className="font-medium">
            {format(new Date(operation.created_at), 'dd MMM yyyy', { locale: nlLocale })}
          </span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(operation.created_at), 'HH:mm', { locale: nlLocale })}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <StatusIcon size={18} className={typeConfig.color} />
          <span>{typeConfig.label}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={statusCfg.variant} className={statusCfg.className}>
          {statusCfg.label}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col text-sm">
          <span>
            <span className="font-medium">{operation.total_clients}</span> {t('bulkHistory.total')}
          </span>
          <span className="text-xs text-muted-foreground">
            <span className="text-green-600">{operation.successful_clients}</span> /
            <span className="text-red-600 mx-1">{operation.failed_clients}</span> /
            <span className="text-amber-600">{operation.total_clients - operation.successful_clients - operation.failed_clients}</span>
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" onClick={onViewDetails}>
          <Eye size={16} className="mr-1" />
          {t('bulkHistory.viewDetails')}
        </Button>
      </TableCell>
    </TableRow>
  )
}

// Details drawer component
const OperationDetailsDrawer = ({
  operation,
  isOpen,
  onClose,
}: {
  operation: BulkOperationResponse | null
  isOpen: boolean
  onClose: () => void
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'SUCCESS' | 'FAILED' | 'SKIPPED'>('all')

  if (!operation) return null

  const typeConfig = operationTypeConfig[operation.operation_type] || operationTypeConfig.RECALCULATE
  const StatusIcon = typeConfig.icon
  const statusCfg = statusConfig[operation.status] || statusConfig.PENDING

  // Filter results
  const filteredResults = statusFilter === 'all' 
    ? operation.results 
    : operation.results.filter(r => r.status === statusFilter)

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <StatusIcon size={20} className={typeConfig.color} />
            {typeConfig.label}
          </SheetTitle>
          <SheetDescription>
            {t('bulkHistory.operationDetails')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Operation summary */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t('bulkHistory.status')}:</span>
              <div className="mt-1">
                <Badge variant={statusCfg.variant} className={statusCfg.className}>
                  {statusCfg.label}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">{t('bulkHistory.clients')}:</span>
              <div className="mt-1 font-medium">{operation.total_clients}</div>
            </div>
            <div>
              <span className="text-muted-foreground">{t('bulkHistory.startedAt')}:</span>
              <div className="mt-1">
                {operation.started_at 
                  ? format(new Date(operation.started_at), 'dd MMM yyyy HH:mm', { locale: nlLocale })
                  : '—'
                }
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">{t('bulkHistory.completedAt')}:</span>
              <div className="mt-1">
                {operation.completed_at 
                  ? format(new Date(operation.completed_at), 'dd MMM yyyy HH:mm', { locale: nlLocale })
                  : '—'
                }
              </div>
            </div>
            {operation.initiated_by_name && (
              <div className="col-span-2">
                <span className="text-muted-foreground">{t('bulkHistory.initiatedBy')}:</span>
                <div className="mt-1">{operation.initiated_by_name}</div>
              </div>
            )}
          </div>

          {/* Result counts */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                {operation.successful_clients}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">{t('bulkHistory.success')}</p>
            </div>
            <div className="text-center p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                {operation.failed_clients}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400">{t('bulkHistory.failed')}</p>
            </div>
            <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {operation.total_clients - operation.successful_clients - operation.failed_clients}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">{t('bulkHistory.skipped')}</p>
            </div>
          </div>

          {/* Results filter */}
          {operation.results.length > 0 && (
            <div className="flex items-center gap-2">
              <Funnel size={16} className="text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('bulkHistory.filterByStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('bulkHistory.allResults')}</SelectItem>
                  <SelectItem value="SUCCESS">{t('bulkHistory.successOnly')}</SelectItem>
                  <SelectItem value="FAILED">{t('bulkHistory.failedOnly')}</SelectItem>
                  <SelectItem value="SKIPPED">{t('bulkHistory.skippedOnly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Per-client results */}
          {operation.results.length > 0 ? (
            <ScrollArea className="h-[300px] rounded-md border">
              <div className="p-2 space-y-2">
                {filteredResults.map((result, idx) => (
                  <div 
                    key={`${result.client_id}-${idx}`}
                    className={`p-3 rounded-lg border ${
                      result.status === 'SUCCESS' ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200' :
                      result.status === 'FAILED' ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200' :
                      'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{result.client_name}</span>
                      <ResultStatusBadge status={result.status} />
                    </div>
                    {result.error_message && (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                        {t('bulkHistory.errorMessage')}: {result.error_message}
                      </p>
                    )}
                    {result.processed_at && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('bulkHistory.processedAt')}: {format(new Date(result.processed_at), 'HH:mm:ss', { locale: nlLocale })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('bulkOps.noResultsYet')}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export const BulkOperationsHistoryPage = () => {
  const { user } = useAuth()
  
  // State
  const [operations, setOperations] = useState<BulkOperationResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Details drawer state
  const [selectedOperation, setSelectedOperation] = useState<BulkOperationResponse | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)

  // Fetch operations list
  const fetchOperations = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const response = await accountantMasterDashboardApi.listBulkOperations(50)
      setOperations(response.operations)
      
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOperations()
  }, [fetchOperations])

  // View operation details
  const handleViewDetails = async (operationId: string) => {
    try {
      setIsLoadingDetails(true)
      setIsDetailsOpen(true)
      
      const operation = await accountantMasterDashboardApi.getBulkOperation(operationId)
      setSelectedOperation(operation)
      
    } catch (err) {
      setError(getErrorMessage(err))
      setIsDetailsOpen(false)
    } finally {
      setIsLoadingDetails(false)
    }
  }

  const closeDetails = () => {
    setIsDetailsOpen(false)
    setSelectedOperation(null)
  }

  // Check access
  if (user?.role !== 'accountant' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-7xl mx-auto">
          <Alert className="bg-amber-500/10 border-amber-500/40">
            <Warning className="h-5 w-5 text-amber-600" />
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
        {/* Back button */}
        <div className="mb-4">
          <Button variant="ghost" onClick={() => navigateTo('/accountant')}>
            <CaretLeft size={18} className="mr-2" />
            {t('accountantDashboard.backToClients')}
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">
              {t('bulkHistory.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('bulkHistory.subtitle')}
            </p>
          </div>
          <Button onClick={fetchOperations} variant="outline" size="sm" disabled={isLoading}>
            <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive/40">
            <WarningCircle className="h-5 w-5 text-destructive" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Main content */}
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : operations.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('bulkHistory.dateTime')}</TableHead>
                    <TableHead>{t('bulkHistory.action')}</TableHead>
                    <TableHead>{t('bulkHistory.status')}</TableHead>
                    <TableHead>{t('bulkHistory.clients')}</TableHead>
                    <TableHead>{t('bulkHistory.details')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operations.map((op) => (
                    <OperationRow
                      key={op.id}
                      operation={op}
                      onViewDetails={() => handleViewDetails(op.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              // Empty state
              <div className="text-center py-16 text-muted-foreground">
                <Clock size={64} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">{t('bulkHistory.noHistory')}</p>
                <p className="text-sm mt-2 mb-6 max-w-md mx-auto">
                  {t('bulkHistory.noHistoryDesc')}
                </p>
                <Button 
                  variant="outline"
                  onClick={() => navigateTo('/accountant')}
                >
                  {t('bulkHistory.goToClients')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details drawer */}
        <OperationDetailsDrawer
          operation={selectedOperation}
          isOpen={isDetailsOpen}
          onClose={closeDetails}
        />

        {/* Loading overlay for details */}
        {isLoadingDetails && (
          <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50">
            <Spinner size={32} className="animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  )
}

export default BulkOperationsHistoryPage
