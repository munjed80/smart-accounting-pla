/**
 * BulkOperationModal - Bulk Operation Modal Component
 * 
 * Modal for bulk operations with:
 * - Title + Dutch explanation per action type
 * - Selection summary (first 5 client names + "+N meer")
 * - Optional fields for reminders (message template, deadline) and VAT (period selector)
 * - Confirm button with loading state
 * - Abort/Cancel UI with prevention of double-submit
 * - Results display with partial success support:
 *   - Counts: Gelukt / Mislukt / Overgeslagen
 *   - Expandable per-client list with status and error
 *   - "Opnieuw proberen (alleen mislukt)" button
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  WarningCircle,
  CaretDown,
  CaretRight,
  Spinner,
} from '@phosphor-icons/react'
import { t } from '@/i18n'
import { BulkActionType } from './BulkActionBar'
import { 
  BulkOperationResponse,
  BulkOperationResultItem,
  accountantMasterDashboardApi,
  BulkRecalculateRequest,
  BulkAckYellowRequest,
  BulkGenerateVatDraftRequest,
  BulkSendRemindersRequest,
} from '@/lib/api'
import { useActionLog, ActionType } from '@/hooks/useActionLog'

interface ClientInfo {
  id: string
  name: string
}

interface BulkOperationModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Handler to close the modal */
  onClose: () => void
  /** The type of bulk action being performed */
  actionType: BulkActionType | null
  /** List of selected clients with their names */
  selectedClients: ClientInfo[]
  /** Callback when operation completes (for refreshing data) */
  onOperationComplete?: () => void
  /** Callback when user wants to retry only failed clients */
  onRetryFailed?: (failedClientIds: string[]) => void
}

// Helper to get modal title by action type
const getModalTitle = (actionType: BulkActionType | null): string => {
  switch (actionType) {
    case 'recalculate':
      return t('accountant.bulkRecalculate')
    case 'ack_yellow':
      return t('accountant.bulkAckYellow')
    case 'generate_vat':
      return t('accountant.bulkGenerateVat')
    case 'send_reminders':
      return t('accountant.bulkSendReminders')
    default:
      return t('bulkOps.title')
  }
}

// Helper to get action description
const getActionDescription = (actionType: BulkActionType | null): string => {
  switch (actionType) {
    case 'recalculate':
      return t('bulkOps.recalculateDesc')
    case 'ack_yellow':
      return t('bulkOps.ackYellowDesc')
    case 'generate_vat':
      return t('bulkOps.vatDraftDesc')
    case 'send_reminders':
      return t('bulkOps.sendReminderDesc')
    default:
      return ''
  }
}

// Map BulkActionType to ActionType for logging
const mapToActionType = (actionType: BulkActionType): ActionType => {
  switch (actionType) {
    case 'recalculate':
      return 'recalculate'
    case 'ack_yellow':
      return 'ack_yellow'
    case 'generate_vat':
      return 'generate_vat'
    case 'send_reminders':
      return 'send_reminders'
    default:
      return 'recalculate'
  }
}

// Client result row component
const ClientResultRow = ({ 
  result, 
  isExpanded, 
  onToggle 
}: { 
  result: BulkOperationResultItem
  isExpanded: boolean
  onToggle: () => void 
}) => {
  const statusConfig = {
    SUCCESS: {
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-950',
      label: t('bulkOps.resultSuccess'),
    },
    FAILED: {
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-100 dark:bg-red-950',
      label: t('bulkOps.resultFailed'),
    },
    SKIPPED: {
      icon: WarningCircle,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-100 dark:bg-amber-950',
      label: t('bulkOps.resultSkipped'),
    },
  }
  
  const config = statusConfig[result.status]
  const Icon = config.icon
  const hasError = result.status === 'FAILED' && result.error_message

  return (
    <div className={`rounded-md border ${config.bg} mb-1`}>
      <button
        className="w-full flex items-center gap-2 p-2 text-left"
        onClick={onToggle}
        disabled={!hasError}
      >
        <Icon size={16} className={config.color} weight="fill" />
        <span className="flex-1 text-sm truncate">{result.client_name}</span>
        <Badge variant="outline" className={`${config.color} text-xs`}>
          {config.label}
        </Badge>
        {hasError && (
          isExpanded 
            ? <CaretDown size={14} className="text-muted-foreground" /> 
            : <CaretRight size={14} className="text-muted-foreground" />
        )}
      </button>
      {hasError && isExpanded && (
        <div className="px-2 pb-2 pt-0">
          <p className="text-xs text-muted-foreground bg-background/50 rounded p-2">
            <span className="font-medium">{t('bulkOps.errorReason')}: </span>
            {result.error_message}
          </p>
        </div>
      )}
    </div>
  )
}

export const BulkOperationModal = ({
  isOpen,
  onClose,
  actionType,
  selectedClients,
  onOperationComplete,
  onRetryFailed,
}: BulkOperationModalProps) => {
  // State
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<BulkOperationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [pollingOperationId, setPollingOperationId] = useState<string | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Reminder form state
  const [reminderType, setReminderType] = useState('ACTION_REQUIRED')
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderMessage, setReminderMessage] = useState('')
  const [includeDeadline, setIncludeDeadline] = useState(false)
  const [deadlineDate, setDeadlineDate] = useState('')
  
  // VAT form state
  const [vatYear, setVatYear] = useState(new Date().getFullYear())
  const [vatQuarter, setVatQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  
  // Action log
  const { logBulkOperation } = useActionLog()

  // Clear polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  // Poll for operation status
  const pollOperationStatus = useCallback(async (operationId: string) => {
    try {
      const updatedOp = await accountantMasterDashboardApi.getBulkOperation(operationId)
      
      // Check if operation is complete
      if (updatedOp.status === 'COMPLETED' || 
          updatedOp.status === 'COMPLETED_WITH_ERRORS' || 
          updatedOp.status === 'FAILED') {
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        setPollingOperationId(null)
        setResult(updatedOp)
        setIsProcessing(false)
        
        // Notify parent that operation is complete
        onOperationComplete?.()
      } else {
        // Update result with latest status
        setResult(updatedOp)
      }
    } catch (err) {
      console.error('Polling error:', err)
      // Don't stop polling on transient errors
    }
  }, [onOperationComplete])

  // Start polling for an operation
  const startPolling = useCallback((operationId: string) => {
    // Clear any existing interval before starting a new one
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    
    setPollingOperationId(operationId)
    
    // Poll every 2 seconds
    pollingIntervalRef.current = setInterval(() => {
      pollOperationStatus(operationId)
    }, 2000)
  }, [pollOperationStatus])

  // Reset state when modal opens with new action type
  useEffect(() => {
    if (isOpen && actionType) {
      setResult(null)
      setError(null)
      setExpandedClients(new Set())
      setIsProcessing(false)
      setPollingOperationId(null)
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      
      // Set defaults for reminder
      if (actionType === 'send_reminders') {
        setReminderTitle(t('bulkOps.reminderDefaultTitle'))
        setReminderMessage(t('bulkOps.reminderDefaultMessage'))
      }
    }
  }, [isOpen, actionType])

  // Toggle expanded state for a client
  const toggleExpanded = useCallback((clientId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) {
        next.delete(clientId)
      } else {
        next.add(clientId)
      }
      return next
    })
  }, [])

  // Execute the bulk operation
  const executeOperation = async () => {
    if (!actionType || selectedClients.length === 0) return
    
    setIsProcessing(true)
    setError(null)
    setResult(null)
    
    try {
      const clientIds = selectedClients.map(c => c.id)
      let response: BulkOperationResponse
      
      switch (actionType) {
        case 'recalculate': {
          const request: BulkRecalculateRequest = {
            client_ids: clientIds,
            force: true,
          }
          response = await accountantMasterDashboardApi.bulkRecalculate(request)
          break
        }
        case 'ack_yellow': {
          const request: BulkAckYellowRequest = {
            client_ids: clientIds,
          }
          response = await accountantMasterDashboardApi.bulkAckYellow(request)
          break
        }
        case 'generate_vat': {
          const request: BulkGenerateVatDraftRequest = {
            client_ids: clientIds,
            period_year: vatYear,
            period_quarter: vatQuarter,
          }
          response = await accountantMasterDashboardApi.bulkGenerateVatDraft(request)
          break
        }
        case 'send_reminders': {
          const request: BulkSendRemindersRequest = {
            client_ids: clientIds,
            reminder_type: reminderType,
            title: reminderTitle,
            message: reminderMessage,
            ...(includeDeadline && deadlineDate ? { due_date: deadlineDate } : {}),
          }
          response = await accountantMasterDashboardApi.bulkSendReminders(request)
          break
        }
        default:
          throw new Error('Unknown action type')
      }
      
      setResult(response)
      
      // Check if operation is still in progress (PENDING or IN_PROGRESS)
      if (response.status === 'PENDING' || response.status === 'IN_PROGRESS') {
        // Start polling for status updates
        startPolling(response.id)
      } else {
        // Operation completed immediately
        setIsProcessing(false)
        
        // Log the operation
        logBulkOperation(
          response,
          mapToActionType(actionType),
          selectedClients.length,
          {
            vatPeriod: actionType === 'generate_vat' ? { year: vatYear, quarter: vatQuarter } : undefined,
            reminderInfo: actionType === 'send_reminders' ? { type: reminderType, title: reminderTitle } : undefined,
          }
        )
        
        // Notify parent that operation is complete
        onOperationComplete?.()
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Er is een fout opgetreden'
      setError(errorMessage)
      setIsProcessing(false)
    }
  }

  // Handle retry failed
  const handleRetryFailed = () => {
    if (!result) return
    
    const failedIds = result.results
      .filter(r => r.status === 'FAILED')
      .map(r => r.client_id)
    
    if (failedIds.length > 0 && onRetryFailed) {
      onRetryFailed(failedIds)
      // Close modal to allow user to re-open with new selection
      onClose()
    }
  }

  // Render selection summary
  const renderSelectionSummary = () => {
    const maxShow = 5
    const shown = selectedClients.slice(0, maxShow)
    const remaining = selectedClients.length - maxShow
    
    return (
      <div className="text-sm text-muted-foreground mb-4">
        <p className="font-medium mb-1">{t('bulkOps.selectionSummary')}:</p>
        <div className="flex flex-wrap gap-1">
          {shown.map(client => (
            <Badge key={client.id} variant="secondary" className="text-xs">
              {client.name}
            </Badge>
          ))}
          {remaining > 0 && (
            <Badge variant="outline" className="text-xs">
              {t('bulkOps.andMore').replace('{count}', String(remaining))}
            </Badge>
          )}
        </div>
      </div>
    )
  }

  // Render action-specific form fields
  const renderFormFields = () => {
    if (result) return null // Don't show form after execution
    
    switch (actionType) {
      case 'send_reminders':
        return (
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="reminder-type">{t('bulkOps.reminderTypeLabel')}</Label>
              <Select value={reminderType} onValueChange={setReminderType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTION_REQUIRED">{t('bulkOps.reminderTypeAction')}</SelectItem>
                  <SelectItem value="DOCUMENT_MISSING">{t('bulkOps.reminderTypeDoc')}</SelectItem>
                  <SelectItem value="VAT_DEADLINE">{t('bulkOps.reminderTypeVat')}</SelectItem>
                  <SelectItem value="REVIEW_PENDING">{t('bulkOps.reminderTypeReview')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reminder-title">{t('bulkOps.reminderTitleLabel')}</Label>
              <Input
                id="reminder-title"
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                placeholder={t('bulkOps.reminderTitlePlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="reminder-message">{t('bulkOps.reminderMessageLabel')}</Label>
              <Textarea
                id="reminder-message"
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
                placeholder={t('bulkOps.reminderMessagePlaceholder')}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-deadline"
                checked={includeDeadline}
                onCheckedChange={(checked) => setIncludeDeadline(checked === true)}
              />
              <Label htmlFor="include-deadline" className="text-sm cursor-pointer">
                {t('bulkOps.includeDeadline')}
              </Label>
            </div>
            {includeDeadline && (
              <div>
                <Input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            )}
          </div>
        )
      
      case 'generate_vat':
        return (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vat-year">{t('bulkOps.vatYear')}</Label>
                <Select value={String(vatYear)} onValueChange={(v) => setVatYear(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2].map(offset => {
                      const year = new Date().getFullYear() - offset
                      return (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="vat-quarter">{t('bulkOps.vatPeriodLabel')}</Label>
                <Select value={String(vatQuarter)} onValueChange={(v) => setVatQuarter(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map(q => (
                      <SelectItem key={q} value={String(q)}>
                        {t('bulkOps.vatQuarter').replace('{quarter}', String(q))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )
      
      default:
        return null
    }
  }

  // Render results
  const renderResults = () => {
    if (!result) return null
    
    const successCount = result.successful_clients
    const failedCount = result.failed_clients
    const skippedCount = result.total_clients - successCount - failedCount
    
    return (
      <div className="mt-4">
        {/* Status badge */}
        <div className="flex items-center gap-2 mb-4">
          {result.status === 'COMPLETED' && (
            <Badge className="bg-green-500">{t('bulkOps.statusCompleted')}</Badge>
          )}
          {result.status === 'COMPLETED_WITH_ERRORS' && (
            <Badge className="bg-amber-500">{t('bulkOps.statusCompletedWithErrors')}</Badge>
          )}
          {result.status === 'FAILED' && (
            <Badge variant="destructive">{t('bulkOps.statusFailed')}</Badge>
          )}
        </div>
        
        {/* Result counts */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-2 bg-green-100 dark:bg-green-950 rounded">
            <p className="text-lg font-bold text-green-700 dark:text-green-300">{successCount}</p>
            <p className="text-xs text-green-600 dark:text-green-400">{t('bulkOps.resultsSuccessCount')}</p>
          </div>
          <div className="text-center p-2 bg-red-100 dark:bg-red-950 rounded">
            <p className="text-lg font-bold text-red-700 dark:text-red-300">{failedCount}</p>
            <p className="text-xs text-red-600 dark:text-red-400">{t('bulkOps.resultsFailedCount')}</p>
          </div>
          <div className="text-center p-2 bg-amber-100 dark:bg-amber-950 rounded">
            <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{skippedCount}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">{t('bulkOps.resultsSkippedCount')}</p>
          </div>
        </div>
        
        {/* Per-client results */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              {t('bulkOps.expandDetails')}
              <CaretDown size={14} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="h-48 mt-2">
              {result.results.map((clientResult) => (
                <ClientResultRow
                  key={clientResult.client_id}
                  result={clientResult}
                  isExpanded={expandedClients.has(clientResult.client_id)}
                  onToggle={() => toggleExpanded(clientResult.client_id)}
                />
              ))}
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
        
        {/* Retry failed button */}
        {failedCount > 0 && onRetryFailed && (
          <Button
            variant="outline"
            className="w-full mt-4"
            onClick={handleRetryFailed}
          >
            <ArrowsClockwise size={16} className="mr-2" />
            {t('bulkOps.retryFailedCount').replace('{count}', String(failedCount))}
          </Button>
        )}
      </div>
    )
  }

  // Check if form is valid for execution
  const isFormValid = () => {
    if (actionType === 'send_reminders') {
      return reminderTitle.trim() !== '' && reminderMessage.trim() !== ''
    }
    return true
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getModalTitle(actionType)}</DialogTitle>
          <DialogDescription>
            {getActionDescription(actionType)}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {/* Selection summary */}
          {!result && renderSelectionSummary()}
          
          {/* Confirmation text */}
          {!result && !isProcessing && (
            <p className="text-sm">
              {t('bulkOps.confirmDesc').replace('{count}', String(selectedClients.length))}
            </p>
          )}
          
          {/* Form fields */}
          {renderFormFields()}
          
          {/* Processing state */}
          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-8">
              <Spinner size={32} className="animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">
                {pollingOperationId ? t('bulkOps.processingPolling') : t('bulkOps.processing')}
              </p>
              {pollingOperationId && result && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t('bulkOps.processedSoFar')}: {result.processed_clients || 0} / {result.total_clients}
                </p>
              )}
            </div>
          )}
          
          {/* Error display */}
          {error && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-950 rounded-md">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
          
          {/* Results */}
          {renderResults()}
        </div>
        
        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={isProcessing}>
                {t('bulkOps.cancel')}
              </Button>
              <Button 
                onClick={executeOperation} 
                disabled={isProcessing || !isFormValid()}
              >
                {isProcessing ? (
                  <>
                    <Spinner size={16} className="mr-2 animate-spin" />
                    {t('bulkOps.processing')}
                  </>
                ) : (
                  t('bulkOps.execute')
                )}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>
              {t('bulkOps.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BulkOperationModal
