/**
 * Client Decisions Tab (Dutch-first)
 * 
 * Decision history page showing:
 * - All decisions made for this client
 * - Status: approved/rejected/executed
 * - Reversible indicator
 * - Reverse button for eligible decisions
 * 
 * All text in Dutch.
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  decisionApi,
  DecisionHistoryResponse,
  DecisionHistoryItem,
  ActionType,
  DecisionType,
  ExecutionStatus,
  getErrorMessage 
} from '@/lib/api'
import { createDossierLogger } from '@/lib/dossierLogger'
import { 
  ArrowsClockwise,
  WarningCircle,
  Warning,
  CheckCircle,
  ThumbsUp,
  ThumbsDown,
  ArrowCounterClockwise,
  ListChecks,
  Clock,
  X,
  Check,
  Lightning,
} from '@phosphor-icons/react'
import { format, formatDistanceToNow } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import { t } from '@/i18n'

interface ClientDecisionsTabProps {
  clientId: string
}

// Decision type colors
const decisionTypeConfig: Record<DecisionType, {
  bg: string
  text: string
  border: string
  icon: typeof ThumbsUp
  label: string
}> = {
  APPROVED: {
    bg: 'bg-green-500/20',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-500/40',
    icon: ThumbsUp,
    label: t('decisions.status.approved'),
  },
  REJECTED: {
    bg: 'bg-red-500/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-500/40',
    icon: ThumbsDown,
    label: t('decisions.status.rejected'),
  },
  OVERRIDDEN: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-500/40',
    icon: Lightning,
    label: t('decisions.status.overridden'),
  },
}

// Execution status colors
const executionStatusConfig: Record<ExecutionStatus, {
  bg: string
  text: string
  border: string
  icon: typeof Clock
  label: string
}> = {
  PENDING: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-700 dark:text-gray-400',
    border: 'border-gray-500/40',
    icon: Clock,
    label: t('decisions.executionStatus.pending'),
  },
  EXECUTED: {
    bg: 'bg-green-500/20',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-500/40',
    icon: Check,
    label: t('decisions.executionStatus.executed'),
  },
  FAILED: {
    bg: 'bg-red-500/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-500/40',
    icon: X,
    label: t('decisions.executionStatus.failed'),
  },
  ROLLED_BACK: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-500/40',
    icon: ArrowCounterClockwise,
    label: t('decisions.executionStatus.rolledBack'),
  },
}

// Get Dutch action type label
const getActionTypeLabel = (actionType: ActionType): string => {
  const translations: Record<ActionType, string> = {
    RECLASSIFY_TO_ASSET: t('suggestions.actionTypes.RECLASSIFY_TO_ASSET'),
    CREATE_DEPRECIATION: t('suggestions.actionTypes.CREATE_DEPRECIATION'),
    CORRECT_VAT_RATE: t('suggestions.actionTypes.CORRECT_VAT_RATE'),
    ALLOCATE_OPEN_ITEM: t('suggestions.actionTypes.ALLOCATE_OPEN_ITEM'),
    FLAG_DOCUMENT_INVALID: t('suggestions.actionTypes.FLAG_DOCUMENT_INVALID'),
    LOCK_PERIOD: t('suggestions.actionTypes.LOCK_PERIOD'),
    REVERSE_JOURNAL_ENTRY: t('suggestions.actionTypes.REVERSE_JOURNAL_ENTRY'),
    CREATE_ADJUSTMENT_ENTRY: t('suggestions.actionTypes.CREATE_ADJUSTMENT_ENTRY'),
  }
  return translations[actionType] || actionType
}

// Decision Row Component
const DecisionRow = ({
  decision,
  onReverse,
  isReversingId,
}: {
  decision: DecisionHistoryItem
  onReverse: (id: string) => void
  isReversingId: string | null
}) => {
  const decisionConfig = decisionTypeConfig[decision.decision]
  const execConfig = executionStatusConfig[decision.execution_status]
  const DecisionIcon = decisionConfig.icon
  const ExecIcon = execConfig.icon
  
  const canReverse = decision.is_reversible && decision.execution_status === 'EXECUTED'
  const isReversing = isReversingId === decision.id

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div>
          <p className="font-semibold text-sm">{decision.issue_title}</p>
          <p className="text-xs text-muted-foreground font-mono">{decision.issue_code}</p>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm">{getActionTypeLabel(decision.action_type)}</span>
      </TableCell>
      <TableCell>
        <Badge 
          variant="outline" 
          className={`${decisionConfig.bg} ${decisionConfig.text} ${decisionConfig.border}`}
        >
          <DecisionIcon size={12} className="mr-1" weight="fill" />
          {decisionConfig.label}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge 
          variant="outline" 
          className={`${execConfig.bg} ${execConfig.text} ${execConfig.border}`}
        >
          <ExecIcon size={12} className="mr-1" weight="fill" />
          {execConfig.label}
        </Badge>
      </TableCell>
      <TableCell>
        <div>
          <p className="text-sm">{decision.decided_by_name}</p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(decision.decided_at), { addSuffix: true, locale: nlLocale })}
          </p>
        </div>
      </TableCell>
      <TableCell>
        {canReverse ? (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => onReverse(decision.id)}
            disabled={isReversing}
            className="border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
          >
            <ArrowCounterClockwise size={14} className={`mr-1 ${isReversing ? 'animate-spin' : ''}`} />
            {isReversing ? t('common.processing') : t('decisions.reverse')}
          </Button>
        ) : decision.is_reversible ? (
          <span className="text-xs text-muted-foreground">{t('decisions.reversible')}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('decisions.notReversible')}</span>
        )}
      </TableCell>
    </TableRow>
  )
}

export const ClientDecisionsTab = ({ clientId }: ClientDecisionsTabProps) => {
  const [history, setHistory] = useState<DecisionHistoryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isReversingId, setIsReversingId] = useState<string | null>(null)
  const [reverseError, setReverseError] = useState<string | null>(null)
  const [reverseSuccess, setReverseSuccess] = useState<string | null>(null)
  const showLoading = useDelayedLoading(isLoading, 300, !!history)
  
  // Reverse confirmation dialog
  const [showReverseDialog, setShowReverseDialog] = useState(false)
  const [decisionToReverse, setDecisionToReverse] = useState<string | null>(null)

  const fetchHistory = async () => {
    const logger = createDossierLogger(clientId)
    const endpoint = `/accountant/clients/${clientId}/decision-history`
    
    try {
      setIsLoading(true)
      setError(null)
      logger.request(endpoint)
      const data = await decisionApi.getDecisionHistory(clientId)
      logger.success(endpoint, { totalDecisions: data.total_decisions })
      setHistory(data)
    } catch (err) {
      logger.error(endpoint, err)
      const message = getErrorMessage(err)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReverseClick = (decisionId: string) => {
    setDecisionToReverse(decisionId)
    setShowReverseDialog(true)
  }

  const handleConfirmReverse = async () => {
    if (!decisionToReverse) return
    
    const logger = createDossierLogger(clientId)
    const endpoint = `/accountant/decisions/${decisionToReverse}/reverse`
    
    setIsReversingId(decisionToReverse)
    setReverseError(null)
    setReverseSuccess(null)
    setShowReverseDialog(false)
    
    try {
      logger.request(endpoint)
      await decisionApi.reverseDecision(decisionToReverse)
      logger.success(endpoint)
      setReverseSuccess(t('decisions.reversedSuccess'))
      // Refresh the list
      await fetchHistory()
      setTimeout(() => setReverseSuccess(null), 3000)
    } catch (err) {
      logger.error(endpoint, err)
      setReverseError(getErrorMessage(err))
    } finally {
      setIsReversingId(null)
      setDecisionToReverse(null)
    }
  }

  useEffect(() => {
    let isMounted = true
    
    const fetchData = async () => {
      const logger = createDossierLogger(clientId)
      const endpoint = `/accountant/clients/${clientId}/decision-history`
      
      try {
        setIsLoading(true)
        setError(null)
        logger.request(endpoint)
        const data = await decisionApi.getDecisionHistory(clientId)
        logger.success(endpoint, { totalDecisions: data.total_decisions })
        
        if (isMounted) {
          setHistory(data)
        }
      } catch (err) {
        logger.error(endpoint, err)
        const message = getErrorMessage(err)
        if (isMounted) {
          setError(message)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }
    
    fetchData()
    
    return () => {
      isMounted = false
    }
  }, [clientId])

  if (error && !history) {
    return (
      <Alert className="bg-destructive/10 border-destructive/40">
        <WarningCircle className="h-5 w-5 text-destructive" />
        <AlertDescription className="ml-2">
          <div className="font-semibold mb-2">{t('errors.loadFailed')}</div>
          <div className="text-sm text-muted-foreground mb-4">{error}</div>
          <Button onClick={fetchHistory} size="sm" variant="outline">
            <ArrowsClockwise size={16} className="mr-2" />
            {t('errors.tryAgain')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('decisions.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('decisions.subtitle')}</p>
        </div>
        <Button 
          onClick={fetchHistory} 
          disabled={isLoading}
          variant="outline"
          size="sm"
        >
          <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Success/Error messages */}
      {reverseSuccess && (
        <Alert className="bg-green-500/10 border-green-500/30">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertDescription>{reverseSuccess}</AlertDescription>
        </Alert>
      )}
      
      {reverseError && (
        <Alert className="bg-red-500/10 border-red-500/30">
          <WarningCircle className="h-4 w-4 text-red-500" />
          <AlertDescription>{reverseError}</AlertDescription>
        </Alert>
      )}

      {/* Summary Card */}
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t('decisions.totalDecisions')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <div className="text-2xl font-bold">
              {history?.total_decisions || 0}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Decisions Table */}
      {showLoading ? (
        <div className="space-y-4 transition-opacity duration-200">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : history?.decisions && history.decisions.length > 0 ? (
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('decisions.tableHeaders.issue')}</TableHead>
                  <TableHead>{t('decisions.tableHeaders.action')}</TableHead>
                  <TableHead>{t('decisions.tableHeaders.decision')}</TableHead>
                  <TableHead>{t('decisions.tableHeaders.status')}</TableHead>
                  <TableHead>{t('decisions.decidedBy')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.decisions.map((decision) => (
                  <DecisionRow 
                    key={decision.id} 
                    decision={decision} 
                    onReverse={handleReverseClick}
                    isReversingId={isReversingId}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-muted-foreground">
              <ListChecks size={48} className="mx-auto mb-4 opacity-50" />
              <p className="font-medium">{t('decisions.noDecisions')}</p>
              <p className="text-sm mt-2">
                {t('decisions.noDecisionsDescription')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reverse Confirmation Dialog */}
      <Dialog open={showReverseDialog} onOpenChange={setShowReverseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <ArrowCounterClockwise size={20} />
              {t('decisions.reverse')}
            </DialogTitle>
            <DialogDescription>
              {t('decisions.reverseConfirm')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Alert className="bg-amber-500/10 border-amber-500/30">
              <Warning className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                {t('decisions.reverseWarning')}
              </AlertDescription>
            </Alert>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReverseDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              variant="default"
              onClick={handleConfirmReverse}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {t('decisions.reverse')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ClientDecisionsTab
