/**
 * Client Issues Tab (Dutch-first)
 * 
 * Displays validation issues from the consistency engine:
 * - Grouped by severity: Rood (moet oplossen) / Geel (controleren)
 * - Expandable suggested actions with approve/reject
 * - Execute approved actions
 * - All text in Dutch
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  ledgerApi, 
  decisionApi,
  LedgerClientIssuesResponse,
  LedgerClientIssue,
  LedgerIssueSeverity,
  RecalculateResponse,
  SuggestedAction,
  DecisionResponse,
  ActionType,
  getErrorMessage 
} from '@/lib/api'
import { 
  ArrowsClockwise,
  WarningCircle,
  Warning,
  CheckCircle,
  FileText,
  BookOpen,
  User,
  CurrencyEur,
  CaretRight,
  CaretDown,
  ThumbsUp,
  ThumbsDown,
  Lightning,
  Lightbulb,
  Gauge,
  Play,
} from '@phosphor-icons/react'
import { formatDistanceToNow } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import { t } from '@/i18n'

interface ClientIssuesTabProps {
  clientId: string
  onIssueResolved?: () => void
}

// Severity indicator colors - Dutch labels
const severityConfig: Record<LedgerIssueSeverity, { 
  bg: string
  text: string
  border: string
  icon: typeof WarningCircle
  label: string
  dutchLabel: string
}> = {
  RED: { 
    bg: 'bg-red-500/20', 
    text: 'text-red-700 dark:text-red-400', 
    border: 'border-red-500/40',
    icon: WarningCircle,
    label: 'Error',
    dutchLabel: 'Rood (moet oplossen)'
  },
  YELLOW: { 
    bg: 'bg-amber-500/20', 
    text: 'text-amber-700 dark:text-amber-400', 
    border: 'border-amber-500/40',
    icon: Warning,
    label: 'Warning',
    dutchLabel: 'Geel (controleren)'
  },
}

// Issue code to icon mapping
const issueCodeIcons: Record<string, typeof FileText> = {
  JOURNAL_UNBALANCED: BookOpen,
  AR_RECON_MISMATCH: CurrencyEur,
  AP_RECON_MISMATCH: CurrencyEur,
  OVERDUE_RECEIVABLE: CurrencyEur,
  OVERDUE_PAYABLE: CurrencyEur,
  DEPRECIATION_NOT_POSTED: FileText,
  DEPRECIATION_MISMATCH: FileText,
  VAT_RATE_MISMATCH: CurrencyEur,
  VAT_NEGATIVE: CurrencyEur,
}

// Confidence score color based on value
const getConfidenceColor = (score: number): string => {
  if (score >= 0.8) return 'text-green-600 dark:text-green-400'
  if (score >= 0.6) return 'text-blue-600 dark:text-blue-400'
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400'
  return 'text-gray-500'
}

// Get Dutch action type label
const getActionTypeLabel = (actionType: ActionType): string => {
  const key = `suggestions.actionTypes.${actionType}` as const
  // Return translated version or fallback to English
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

// Suggested action card component
const SuggestionCard = ({ 
  suggestion,
  onApprove,
  onReject,
  isProcessing,
}: { 
  suggestion: SuggestedAction
  onApprove: () => void
  onReject: () => void
  isProcessing: boolean
}) => {
  const confidencePercent = Math.round(suggestion.confidence_score * 100)
  
  return (
    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Lightning size={16} weight="fill" className="text-blue-500" />
            <span className="font-medium text-sm">{suggestion.title}</span>
            {suggestion.is_auto_suggested && (
              <Badge variant="outline" className="text-xs bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">
                {t('suggestions.autoSuggested')}
              </Badge>
            )}
          </div>
          
          <p className="text-sm text-muted-foreground mb-3">
            {suggestion.explanation}
          </p>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Gauge size={14} />
              {t('suggestions.confidence')}: 
              <span className={`font-semibold ${getConfidenceColor(suggestion.confidence_score)}`}>
                {confidencePercent}%
              </span>
            </span>
            <span>
              {t('suggestions.action')}: {getActionTypeLabel(suggestion.action_type)}
            </span>
          </div>
        </div>
        
        <div className="flex flex-col gap-2">
          <Button 
            size="sm" 
            onClick={onApprove}
            disabled={isProcessing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <ThumbsUp size={14} className="mr-1" />
            {t('suggestions.approve')}
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={onReject}
            disabled={isProcessing}
            className="border-red-500/40 text-red-600 hover:bg-red-500/10"
          >
            <ThumbsDown size={14} className="mr-1" />
            {t('suggestions.reject')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Issue item component with suggestions
const IssueCard = ({ 
  issue,
  onIssueResolved,
}: { 
  issue: LedgerClientIssue
  onIssueResolved: () => void
}) => {
  const severity = severityConfig[issue.severity]
  const Icon = issueCodeIcons[issue.issue_code] || FileText
  
  const [isExpanded, setIsExpanded] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestedAction[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  const loadSuggestions = async () => {
    if (suggestions.length > 0) return // Already loaded
    
    setIsLoadingSuggestions(true)
    setError(null)
    try {
      const response = await decisionApi.getIssueSuggestions(issue.id)
      setSuggestions(response.suggestions)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoadingSuggestions(false)
    }
  }
  
  const handleExpand = () => {
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    if (newExpanded) {
      loadSuggestions()
    }
  }
  
  const handleApprove = async (suggestion: SuggestedAction) => {
    setIsProcessing(true)
    setError(null)
    setSuccessMessage(null)
    
    try {
      const response = await decisionApi.makeDecision(issue.id, {
        suggested_action_id: suggestion.id,
        action_type: suggestion.action_type,
        decision: 'APPROVED',
      })
      
      if (response.execution_status === 'EXECUTED') {
        setSuccessMessage(t('decisions.executedSuccess'))
        // Notify parent to refresh
        setTimeout(() => onIssueResolved(), 1500)
      } else if (response.execution_status === 'FAILED') {
        setError(`${t('decisions.executedFailed')}: ${response.execution_error || 'Onbekende fout'}`)
      } else {
        setSuccessMessage(t('decisions.approvedPending'))
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsProcessing(false)
    }
  }
  
  const handleReject = async (suggestion: SuggestedAction) => {
    setIsProcessing(true)
    setError(null)
    setSuccessMessage(null)
    
    try {
      await decisionApi.makeDecision(issue.id, {
        suggested_action_id: suggestion.id,
        action_type: suggestion.action_type,
        decision: 'REJECTED',
      })
      
      setSuccessMessage(t('decisions.rejectedSuccess'))
      // Remove from list
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsProcessing(false)
    }
  }
  
  return (
    <Card className={`${severity.bg} border ${severity.border}`}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-lg ${severity.bg}`}>
            <Icon size={24} weight="fill" className={severity.text} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge 
                variant="outline" 
                className={`${severity.bg} ${severity.text} ${severity.border} text-xs font-semibold`}
              >
                {issue.severity === 'RED' ? t('issues.severity.red') : t('issues.severity.yellow')}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                {issue.issue_code}
              </span>
            </div>
            
            <h3 className={`font-semibold mb-2 ${severity.text}`}>
              {issue.title}
            </h3>
            
            <p className="text-sm text-muted-foreground mb-3">
              {issue.description}
            </p>
            
            {issue.why && (
              <div className="mb-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t('issues.whyHappened')}
                </p>
                <p className="text-sm">{issue.why}</p>
              </div>
            )}
            
            {issue.suggested_action && (
              <div className="bg-background/50 rounded-lg p-3 border mb-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t('issues.quickSuggestion')}
                </p>
                <p className="text-sm font-medium">{issue.suggested_action}</p>
              </div>
            )}
            
            {/* References */}
            <div className="flex flex-wrap gap-2 mt-3 mb-3">
              {issue.document_id && (
                <Badge variant="secondary" className="text-xs">
                  <FileText size={12} className="mr-1" />
                  {t('issues.references.document')}: {issue.document_id.slice(0, 8)}...
                </Badge>
              )}
              {issue.journal_entry_id && (
                <Badge variant="secondary" className="text-xs">
                  <BookOpen size={12} className="mr-1" />
                  {t('issues.references.journal')}: {issue.journal_entry_id.slice(0, 8)}...
                </Badge>
              )}
              {issue.party_id && (
                <Badge variant="secondary" className="text-xs">
                  <User size={12} className="mr-1" />
                  {t('issues.references.party')}: {issue.party_id.slice(0, 8)}...
                </Badge>
              )}
              {issue.amount_discrepancy && (
                <Badge variant="secondary" className="text-xs">
                  <CurrencyEur size={12} className="mr-1" />
                  €{issue.amount_discrepancy.toFixed(2)}
                </Badge>
              )}
            </div>
            
            {/* Suggestions expansion */}
            <div className="border-t pt-3 mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExpand}
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <Lightbulb size={16} className="text-blue-500" />
                  <span className="text-sm font-medium">
                    {isExpanded ? t('issues.hideActions') : t('issues.viewActions')}
                  </span>
                </span>
                {isExpanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
              </Button>
              
              {isExpanded && (
                <div className="mt-3 space-y-3">
                  {isLoadingSuggestions ? (
                    <div className="space-y-2">
                      <Skeleton className="h-24 w-full" />
                    </div>
                  ) : error ? (
                    <Alert className="bg-red-500/10 border-red-500/30">
                      <WarningCircle className="h-4 w-4 text-red-500" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : successMessage ? (
                    <Alert className="bg-green-500/10 border-green-500/30">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <AlertDescription>{successMessage}</AlertDescription>
                    </Alert>
                  ) : suggestions.length > 0 ? (
                    suggestions.map((suggestion) => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        onApprove={() => handleApprove(suggestion)}
                        onReject={() => handleReject(suggestion)}
                        isProcessing={isProcessing}
                      />
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      <Lightbulb size={24} className="mx-auto mb-2 opacity-50" />
                      {t('suggestions.noSuggestions')}
                      <br />
                      {t('suggestions.manualRequired')}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground mt-3">
              {t('issues.created')} {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true, locale: nlLocale })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export const ClientIssuesTab = ({ clientId, onIssueResolved }: ClientIssuesTabProps) => {
  const [issues, setIssues] = useState<LedgerClientIssuesResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recalculateResult, setRecalculateResult] = useState<RecalculateResponse | null>(null)

  const fetchIssues = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await ledgerApi.getClientIssues(clientId)
      setIssues(data)
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      console.error('Failed to fetch issues:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRecalculate = async () => {
    try {
      setIsRecalculating(true)
      setRecalculateResult(null)
      const result = await ledgerApi.recalculate(clientId, true)
      setRecalculateResult(result)
      // Refresh issues list
      await fetchIssues()
      // Notify parent
      onIssueResolved?.()
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      console.error('Failed to recalculate:', err)
    } finally {
      setIsRecalculating(false)
    }
  }

  const handleIssueResolved = () => {
    fetchIssues()
    onIssueResolved?.()
  }

  useEffect(() => {
    fetchIssues()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  // Group issues by severity
  const redIssues = issues?.issues.filter(i => i.severity === 'RED') || []
  const yellowIssues = issues?.issues.filter(i => i.severity === 'YELLOW') || []

  if (error && !issues) {
    return (
      <Alert className="bg-destructive/10 border-destructive/40">
        <WarningCircle className="h-5 w-5 text-destructive" />
        <AlertDescription className="ml-2">
          <div className="font-semibold mb-2">{t('errors.loadFailed')}</div>
          <div className="text-sm text-muted-foreground mb-4">{error}</div>
          <Button onClick={fetchIssues} size="sm" variant="outline">
            <ArrowsClockwise size={16} className="mr-2" />
            {t('errors.tryAgain')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with recalculate button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('issues.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('issues.subtitle')}</p>
        </div>
        <Button 
          onClick={handleRecalculate} 
          disabled={isRecalculating}
          variant="outline"
        >
          <ArrowsClockwise size={18} className={`mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
          {isRecalculating ? t('issues.validating') : t('issues.runValidation')}
        </Button>
      </div>

      {/* Recalculation Result Alert */}
      {recalculateResult && (
        <Alert className="bg-blue-500/10 border-blue-500/40">
          <CheckCircle className="h-5 w-5 text-blue-600" />
          <AlertTitle>{t('issues.validationComplete')}</AlertTitle>
          <AlertDescription>
            {recalculateResult.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('issues.totalIssues')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">
                {issues?.total_issues || 0}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-card/80 backdrop-blur-sm border-2 border-red-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <WarningCircle size={16} weight="fill" className="text-red-500" />
              {t('issues.redMustResolve')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {issues?.red_count || 0}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-card/80 backdrop-blur-sm border-2 border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Warning size={16} weight="fill" className="text-amber-500" />
              {t('issues.yellowCheck')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {issues?.yellow_count || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Issues List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : issues?.issues && issues.issues.length > 0 ? (
        <div className="space-y-6">
          {/* Red Issues */}
          {redIssues.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                <WarningCircle size={20} weight="fill" />
                {severityConfig.RED.dutchLabel} ({redIssues.length})
              </h3>
              <div className="space-y-4">
                {redIssues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} onIssueResolved={handleIssueResolved} />
                ))}
              </div>
            </div>
          )}
          
          {/* Yellow Issues */}
          {yellowIssues.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-2">
                <Warning size={20} weight="fill" />
                {severityConfig.YELLOW.dutchLabel} ({yellowIssues.length})
              </h3>
              <div className="space-y-4">
                {yellowIssues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} onIssueResolved={handleIssueResolved} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-muted-foreground">
              <CheckCircle size={48} className="mx-auto mb-4 text-green-500 opacity-50" />
              <p className="font-medium">{t('issues.noIssues')}</p>
              <p className="text-sm mt-2">
                {t('issues.noIssuesDescription')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default ClientIssuesTab
