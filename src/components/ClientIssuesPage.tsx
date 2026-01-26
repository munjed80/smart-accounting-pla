/**
 * Client Issues Page
 * 
 * Displays all issues from the consistency engine for a specific client.
 * Features:
 * - List issues with severity (RED/YELLOW)
 * - Show suggested action for each issue
 * - Link to related entities (document/journal entry)
 * - Trigger recalculation
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/lib/AuthContext'
import { 
  ledgerApi, 
  LedgerClientIssuesResponse,
  LedgerClientIssue,
  LedgerIssueSeverity,
  RecalculateResponse,
  getErrorMessage 
} from '@/lib/api'
import { 
  ArrowsClockwise,
  WarningCircle,
  Warning,
  CheckCircle,
  ArrowLeft,
  FileText,
  BookOpen,
  User,
  CurrencyEur,
  CaretRight
} from '@phosphor-icons/react'
import { formatDistanceToNow, format } from 'date-fns'

interface ClientIssuesPageProps {
  clientId: string
  onBack?: () => void
}

// Severity indicator colors
const severityConfig: Record<LedgerIssueSeverity, { 
  bg: string
  text: string
  border: string
  icon: typeof WarningCircle
  label: string
}> = {
  RED: { 
    bg: 'bg-red-500/20', 
    text: 'text-red-700 dark:text-red-400', 
    border: 'border-red-500/40',
    icon: WarningCircle,
    label: 'Error'
  },
  YELLOW: { 
    bg: 'bg-amber-500/20', 
    text: 'text-amber-700 dark:text-amber-400', 
    border: 'border-amber-500/40',
    icon: Warning,
    label: 'Warning'
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

// Issue item component
const IssueCard = ({ issue }: { issue: LedgerClientIssue }) => {
  const severity = severityConfig[issue.severity]
  const Icon = issueCodeIcons[issue.issue_code] || FileText
  
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
                {severity.label}
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
                <p className="text-xs font-medium text-muted-foreground mb-1">Why this happened:</p>
                <p className="text-sm">{issue.why}</p>
              </div>
            )}
            
            {issue.suggested_action && (
              <div className="bg-background/50 rounded-lg p-3 border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Action:</p>
                <p className="text-sm font-medium">{issue.suggested_action}</p>
              </div>
            )}
            
            {/* References */}
            <div className="flex flex-wrap gap-2 mt-3">
              {issue.document_id && (
                <Badge variant="secondary" className="text-xs">
                  <FileText size={12} className="mr-1" />
                  Document: {issue.document_id.slice(0, 8)}...
                </Badge>
              )}
              {issue.journal_entry_id && (
                <Badge variant="secondary" className="text-xs">
                  <BookOpen size={12} className="mr-1" />
                  Journal: {issue.journal_entry_id.slice(0, 8)}...
                </Badge>
              )}
              {issue.party_id && (
                <Badge variant="secondary" className="text-xs">
                  <User size={12} className="mr-1" />
                  Party: {issue.party_id.slice(0, 8)}...
                </Badge>
              )}
              {issue.amount_discrepancy && (
                <Badge variant="secondary" className="text-xs">
                  <CurrencyEur size={12} className="mr-1" />
                  €{issue.amount_discrepancy.toFixed(2)}
                </Badge>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground mt-3">
              Created {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export const ClientIssuesPage = ({ clientId, onBack }: ClientIssuesPageProps) => {
  const { user } = useAuth()
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
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      console.error('Failed to recalculate:', err)
    } finally {
      setIsRecalculating(false)
    }
  }

  useEffect(() => {
    fetchIssues()
  }, [clientId])

  // Check if user is accountant
  if (user?.role !== 'accountant' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-4xl mx-auto">
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

  if (error && !issues) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-4xl mx-auto">
          <Alert className="bg-destructive/10 border-destructive/40">
            <WarningCircle className="h-5 w-5 text-destructive" />
            <AlertDescription className="ml-2">
              <div className="font-semibold mb-2">Failed to load issues</div>
              <div className="text-sm text-muted-foreground mb-4">{error}</div>
              <Button onClick={fetchIssues} size="sm" variant="outline">
                <ArrowsClockwise size={16} className="mr-2" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
      
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
              <ArrowLeft size={18} className="mr-2" />
              Back to Dashboard
            </Button>
          )}
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">
                {isLoading ? <Skeleton className="h-8 w-48" /> : issues?.client_name}
              </h1>
              <p className="text-muted-foreground">
                Consistency Issues from Validation Engine
              </p>
            </div>
            
            <Button 
              onClick={handleRecalculate} 
              disabled={isRecalculating}
              variant="outline"
            >
              <ArrowsClockwise size={18} className={`mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
              {isRecalculating ? 'Validating...' : 'Run Validation'}
            </Button>
          </div>
        </div>

        {/* Recalculation Result Alert */}
        {recalculateResult && (
          <Alert className="mb-6 bg-blue-500/10 border-blue-500/40">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            <AlertTitle>Validation Complete</AlertTitle>
            <AlertDescription>
              {recalculateResult.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Issues
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
                Errors
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
                Warnings
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
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>All Issues</CardTitle>
            <CardDescription>
              Issues are sorted by severity: errors first, then warnings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : issues?.issues && issues.issues.length > 0 ? (
              <div className="space-y-4">
                {issues.issues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle size={48} className="mx-auto mb-4 text-green-500 opacity-50" />
                <p className="font-medium">No issues found</p>
                <p className="text-sm mt-2">
                  All consistency checks passed. The ledger is in good shape!
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ClientIssuesPage
