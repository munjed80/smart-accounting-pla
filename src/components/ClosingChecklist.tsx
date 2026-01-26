/**
 * Closing Checklist Component
 * 
 * Shows the period closing checklist for accountants:
 * - % documents posted in period
 * - Unresolved RED issues (must be zero)
 * - Unresolved YELLOW issues (must be acknowledged)
 * - VAT report ready and anomalies resolved
 * - AR/AP reconciled
 * - Asset schedules consistent
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  documentReviewApi, 
  ClosingChecklistResponse, 
  ClosingChecklistItem,
  getErrorMessage 
} from '@/lib/api'
import { 
  CheckCircle,
  XCircle,
  Warning,
  ArrowsClockwise,
  ClipboardText,
  FileText,
  WarningCircle,
  Receipt,
  Bank,
  Wallet,
  House,
  Lock,
  LockOpen
} from '@phosphor-icons/react'

// Status colors
const statusConfig: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  PASSED: { bg: 'bg-green-500/20', text: 'text-green-600', icon: CheckCircle },
  FAILED: { bg: 'bg-red-500/20', text: 'text-red-600', icon: XCircle },
  WARNING: { bg: 'bg-amber-500/20', text: 'text-amber-600', icon: Warning },
  PENDING: { bg: 'bg-gray-500/20', text: 'text-gray-600', icon: ArrowsClockwise },
}

// Icon mapping for checklist items
const itemIcons: Record<string, typeof FileText> = {
  'Documents Posted': FileText,
  'Critical Issues': WarningCircle,
  'Warning Issues': Warning,
  'VAT Report Ready': Receipt,
  'AR Reconciled': Bank,
  'AP Reconciled': Wallet,
  'Asset Schedules Consistent': House,
}

// Checklist item component
const ChecklistItemRow = ({ item }: { item: ClosingChecklistItem }) => {
  const config = statusConfig[item.status]
  const StatusIcon = config.icon
  const ItemIcon = itemIcons[item.name] || ClipboardText

  // Use explicit border classes to work with CSS purging
  const borderClass = item.status === 'PASSED' 
    ? 'border-green-600/30' 
    : item.status === 'FAILED' 
      ? 'border-red-600/30' 
      : item.status === 'WARNING' 
        ? 'border-amber-600/30' 
        : 'border-gray-600/30'

  return (
    <div className={`p-4 rounded-lg border ${config.bg} ${borderClass}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${config.bg}`}>
          <StatusIcon size={20} weight="fill" className={config.text} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <ItemIcon size={16} className="text-muted-foreground" />
            <span className="font-medium">{item.name}</span>
            {item.required && (
              <Badge variant="outline" className="text-xs">Required</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{item.description}</p>
          {item.details && (
            <p className="text-sm mt-1">{item.details}</p>
          )}
          {item.value && (
            <p className="text-sm font-mono mt-1">{item.value}</p>
          )}
        </div>
        <Badge 
          variant="outline" 
          className={`${config.bg} ${config.text} border-none`}
        >
          {item.status}
        </Badge>
      </div>
    </div>
  )
}

interface ClosingChecklistProps {
  clientId: string
  clientName: string
  periodId: string
  periodName: string
  onFinalize?: () => void
}

export const ClosingChecklist = ({ 
  clientId, 
  clientName, 
  periodId, 
  periodName,
  onFinalize 
}: ClosingChecklistProps) => {
  const [checklist, setChecklist] = useState<ClosingChecklistResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchChecklist = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await documentReviewApi.getClosingChecklist(clientId, periodId)
      setChecklist(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchChecklist()
  }, [clientId, periodId])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert className="bg-destructive/10 border-destructive/40">
        <WarningCircle size={18} className="text-destructive" />
        <AlertTitle>Error loading checklist</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!checklist) return null

  const passedCount = checklist.items.filter(i => i.status === 'PASSED').length
  const totalCount = checklist.items.length
  const progressPercent = Math.round((passedCount / totalCount) * 100)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardText size={28} />
            Period Closing Checklist
          </h2>
          <p className="text-muted-foreground">
            {clientName} • {periodName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchChecklist}>
            <ArrowsClockwise size={16} className="mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={checklist.can_finalize ? 'border-green-500/40' : 'border-red-500/40'}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {checklist.can_finalize ? (
                <LockOpen size={32} className="text-green-500" weight="fill" />
              ) : (
                <Lock size={32} className="text-red-500" weight="fill" />
              )}
              <div>
                <p className="text-sm text-muted-foreground">Ready to Finalize</p>
                <p className={`text-xl font-bold ${checklist.can_finalize ? 'text-green-600' : 'text-red-600'}`}>
                  {checklist.can_finalize ? 'Yes' : 'No'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText size={32} className="text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Documents Posted</p>
                <p className="text-xl font-bold">{checklist.documents_posted_percent}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={checklist.red_issues_count > 0 ? 'border-red-500/40' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <WarningCircle size={32} className={checklist.red_issues_count > 0 ? 'text-red-500' : 'text-green-500'} />
              <div>
                <p className="text-sm text-muted-foreground">Blocking Issues</p>
                <p className={`text-xl font-bold ${checklist.red_issues_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {checklist.blocking_items}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={checklist.warning_items > 0 ? 'border-amber-500/40' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Warning size={32} className={checklist.warning_items > 0 ? 'text-amber-500' : 'text-green-500'} />
              <div>
                <p className="text-sm text-muted-foreground">Warnings</p>
                <p className={`text-xl font-bold ${checklist.warning_items > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {checklist.warning_items}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Checklist Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={progressPercent} className="flex-1" />
            <span className="text-sm font-medium">{passedCount}/{totalCount} items passed</span>
          </div>
        </CardContent>
      </Card>

      {/* Checklist items */}
      <Card>
        <CardHeader>
          <CardTitle>Checklist Items</CardTitle>
          <CardDescription>
            All blocking items must pass before the period can be finalized
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {checklist.items.map((item, index) => (
            <ChecklistItemRow key={index} item={item} />
          ))}
        </CardContent>
      </Card>

      {/* Summary section */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Documents Pending</p>
              <p className="text-lg font-bold">{checklist.documents_pending_review}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">RED Issues</p>
              <p className={`text-lg font-bold ${checklist.red_issues_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {checklist.red_issues_count}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">YELLOW Issues</p>
              <p className={`text-lg font-bold ${checklist.yellow_issues_count > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {checklist.yellow_issues_count}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unacknowledged</p>
              <p className={`text-lg font-bold ${checklist.unacknowledged_yellow_count > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {checklist.unacknowledged_yellow_count}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              {checklist.vat_report_ready ? (
                <CheckCircle size={18} className="text-green-500" weight="fill" />
              ) : (
                <XCircle size={18} className="text-red-500" weight="fill" />
              )}
              <span className="text-sm">VAT Report</span>
            </div>
            <div className="flex items-center gap-2">
              {checklist.ar_reconciled ? (
                <CheckCircle size={18} className="text-green-500" weight="fill" />
              ) : (
                <XCircle size={18} className="text-red-500" weight="fill" />
              )}
              <span className="text-sm">AR Reconciled</span>
            </div>
            <div className="flex items-center gap-2">
              {checklist.ap_reconciled ? (
                <CheckCircle size={18} className="text-green-500" weight="fill" />
              ) : (
                <XCircle size={18} className="text-red-500" weight="fill" />
              )}
              <span className="text-sm">AP Reconciled</span>
            </div>
            <div className="flex items-center gap-2">
              {checklist.assets_consistent ? (
                <CheckCircle size={18} className="text-green-500" weight="fill" />
              ) : (
                <Warning size={18} className="text-amber-500" weight="fill" />
              )}
              <span className="text-sm">Assets Consistent</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Finalize button */}
      {onFinalize && (
        <div className="flex justify-end">
          <Button 
            size="lg"
            disabled={!checklist.can_finalize}
            onClick={onFinalize}
            className={checklist.can_finalize ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {checklist.can_finalize ? (
              <>
                <LockOpen size={20} className="mr-2" />
                Finalize Period
              </>
            ) : (
              <>
                <Lock size={20} className="mr-2" />
                Resolve Issues to Finalize
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
