/**
 * Period Control Panel
 * 
 * Minimal UI for period finalization workflow:
 * - Period Status indicator
 * - Review period (trigger validation)
 * - Finalize period (with validation summary)
 * - Lock period (with irreversibility warning)
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Lock,
  LockOpen,
  CheckCircle,
  WarningCircle,
  Warning,
  ClockCounterClockwise,
  Eye,
  FileText,
  ArrowsClockwise,
  ShieldCheck,
} from '@phosphor-icons/react'
import { format } from 'date-fns'

// Types
type PeriodStatus = 'OPEN' | 'REVIEW' | 'FINALIZED' | 'LOCKED'

interface ValidationIssue {
  id: string
  code: string
  title: string
  description: string
  suggested_action?: string
}

interface Period {
  id: string
  name: string
  period_type: string
  start_date: string
  end_date: string
  status: PeriodStatus
  is_closed: boolean
  finalized_at?: string
  locked_at?: string
}

interface PeriodWithValidation {
  period: Period
  validation: {
    red_issues: ValidationIssue[]
    yellow_issues: ValidationIssue[]
    can_finalize: boolean
    validation_summary: {
      total_issues: number
      red_count: number
      yellow_count: number
    }
  }
}

// Status colors and icons
const statusConfig: Record<PeriodStatus, { 
  bg: string
  text: string
  border: string
  icon: typeof LockOpen
  label: string
}> = {
  OPEN: {
    bg: 'bg-green-500/20',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-500/40',
    icon: LockOpen,
    label: 'Open',
  },
  REVIEW: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-500/40',
    icon: Eye,
    label: 'Under Review',
  },
  FINALIZED: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-500/40',
    icon: ShieldCheck,
    label: 'Finalized',
  },
  LOCKED: {
    bg: 'bg-red-500/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-500/40',
    icon: Lock,
    label: 'Locked',
  },
}

// Status Badge Component
const PeriodStatusBadge = ({ status }: { status: PeriodStatus }) => {
  const config = statusConfig[status]
  const Icon = config.icon
  
  return (
    <Badge
      variant="outline"
      className={`${config.bg} ${config.text} ${config.border} font-semibold`}
    >
      <Icon size={14} className="mr-1" weight="fill" />
      {config.label}
    </Badge>
  )
}

// Issue List Component
const IssueList = ({
  title,
  issues,
  severity,
  acknowledgedIds,
  onToggleAcknowledge,
}: {
  title: string
  issues: ValidationIssue[]
  severity: 'RED' | 'YELLOW'
  acknowledgedIds?: Set<string>
  onToggleAcknowledge?: (id: string) => void
}) => {
  if (issues.length === 0) return null

  const isYellow = severity === 'YELLOW'
  const bgColor = isYellow ? 'bg-amber-500/10' : 'bg-red-500/10'
  const borderColor = isYellow ? 'border-amber-500/30' : 'border-red-500/30'
  const textColor = isYellow ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'

  return (
    <div className="space-y-2">
      <h4 className={`font-semibold ${textColor} flex items-center gap-2`}>
        {isYellow ? <Warning size={18} weight="fill" /> : <WarningCircle size={18} weight="fill" />}
        {title} ({issues.length})
      </h4>
      <div className="space-y-2">
        {issues.map((issue) => (
          <div
            key={issue.id}
            className={`p-3 rounded-lg ${bgColor} border ${borderColor}`}
          >
            <div className="flex items-start gap-3">
              {isYellow && onToggleAcknowledge && (
                <Checkbox
                  checked={acknowledgedIds?.has(issue.id)}
                  onCheckedChange={() => onToggleAcknowledge(issue.id)}
                  className="mt-0.5"
                />
              )}
              <div className="flex-1">
                <p className={`font-medium text-sm ${textColor}`}>
                  {issue.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {issue.description}
                </p>
                {issue.suggested_action && (
                  <p className="text-xs mt-2">
                    <span className="font-medium">Action:</span> {issue.suggested_action}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Main Period Control Panel Component
export const PeriodControlPanel = ({
  clientId,
  periodData,
  isLoading,
  onReview,
  onFinalize,
  onLock,
  onRefresh,
}: {
  clientId: string
  periodData: PeriodWithValidation | null
  isLoading: boolean
  onReview: () => Promise<void>
  onFinalize: (acknowledgedIssues: string[]) => Promise<void>
  onLock: () => Promise<void>
  onRefresh: () => void
}) => {
  const [isReviewLoading, setIsReviewLoading] = useState(false)
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false)
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false)
  const [acknowledgedIssues, setAcknowledgedIssues] = useState<Set<string>>(new Set())
  const [confirmLock, setConfirmLock] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Reset state when dialog closes
  useEffect(() => {
    if (!isFinalizeDialogOpen) {
      setAcknowledgedIssues(new Set())
    }
    if (!isLockDialogOpen) {
      setConfirmLock(false)
    }
  }, [isFinalizeDialogOpen, isLockDialogOpen])

  const handleReview = async () => {
    setIsReviewLoading(true)
    try {
      await onReview()
    } finally {
      setIsReviewLoading(false)
    }
  }

  const handleFinalize = async () => {
    setActionLoading(true)
    try {
      await onFinalize(Array.from(acknowledgedIssues))
      setIsFinalizeDialogOpen(false)
    } finally {
      setActionLoading(false)
    }
  }

  const handleLock = async () => {
    setActionLoading(true)
    try {
      await onLock()
      setIsLockDialogOpen(false)
    } finally {
      setActionLoading(false)
    }
  }

  const toggleAcknowledge = (id: string) => {
    const newSet = new Set(acknowledgedIssues)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setAcknowledgedIssues(newSet)
  }

  if (isLoading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!periodData) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={24} />
            Period Control
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No period selected</p>
        </CardContent>
      </Card>
    )
  }

  const { period, validation } = periodData
  const config = statusConfig[period.status]
  const canReview = period.status === 'OPEN'
  const canFinalize = period.status === 'OPEN' || period.status === 'REVIEW'
  const canLock = period.status === 'FINALIZED'

  const allYellowAcknowledged =
    validation.yellow_issues.length === 0 ||
    validation.yellow_issues.every((i) => acknowledgedIssues.has(i.id))

  const canProceedWithFinalize =
    validation.can_finalize && allYellowAcknowledged

  return (
    <Card className={`bg-card/80 backdrop-blur-sm border-2 ${config.border}`}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText size={24} />
            {period.name}
          </CardTitle>
          <CardDescription>
            {format(new Date(period.start_date), 'MMM d, yyyy')} -{' '}
            {format(new Date(period.end_date), 'MMM d, yyyy')}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <PeriodStatusBadge status={period.status} />
          <Button variant="ghost" size="icon" onClick={onRefresh}>
            <ArrowsClockwise size={18} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Info */}
        {period.finalized_at && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Finalized:</span>{' '}
            {format(new Date(period.finalized_at), 'PPpp')}
          </div>
        )}
        {period.locked_at && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Locked:</span>{' '}
            {format(new Date(period.locked_at), 'PPpp')}
          </div>
        )}

        {/* Validation Summary */}
        {(period.status === 'OPEN' || period.status === 'REVIEW') && (
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">{validation.validation_summary.total_issues}</div>
              <div className="text-xs text-muted-foreground">Total Issues</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-500/10">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {validation.validation_summary.red_count}
              </div>
              <div className="text-xs text-muted-foreground">Blocking</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-amber-500/10">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {validation.validation_summary.yellow_count}
              </div>
              <div className="text-xs text-muted-foreground">Warnings</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {canReview && (
            <Button
              variant="outline"
              onClick={handleReview}
              disabled={isReviewLoading}
            >
              {isReviewLoading ? (
                <ArrowsClockwise size={18} className="mr-2 animate-spin" />
              ) : (
                <Eye size={18} className="mr-2" />
              )}
              Start Review
            </Button>
          )}

          {canFinalize && (
            <Dialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="default"
                  disabled={!validation.can_finalize}
                >
                  <ShieldCheck size={18} className="mr-2" />
                  Finalize Period
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Finalize {period.name}</DialogTitle>
                  <DialogDescription>
                    This will create an immutable snapshot and prevent further changes.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Issues Summary */}
                  {validation.red_issues.length > 0 && (
                    <Alert className="bg-red-500/10 border-red-500/40">
                      <WarningCircle className="h-4 w-4" />
                      <AlertTitle>Cannot Finalize</AlertTitle>
                      <AlertDescription>
                        {validation.red_issues.length} blocking issue(s) must be resolved first.
                      </AlertDescription>
                    </Alert>
                  )}

                  <IssueList
                    title="Blocking Issues (Must Resolve)"
                    issues={validation.red_issues}
                    severity="RED"
                  />

                  <IssueList
                    title="Warnings (Acknowledge to Continue)"
                    issues={validation.yellow_issues}
                    severity="YELLOW"
                    acknowledgedIds={acknowledgedIssues}
                    onToggleAcknowledge={toggleAcknowledge}
                  />

                  {validation.yellow_issues.length > 0 && (
                    <div className="text-sm text-muted-foreground">
                      <Checkbox
                        checked={allYellowAcknowledged}
                        onCheckedChange={() => {
                          if (allYellowAcknowledged) {
                            setAcknowledgedIssues(new Set())
                          } else {
                            setAcknowledgedIssues(
                              new Set(validation.yellow_issues.map((i) => i.id))
                            )
                          }
                        }}
                        className="mr-2"
                      />
                      Acknowledge all warnings
                    </div>
                  )}

                  {validation.can_finalize && allYellowAcknowledged && (
                    <Alert className="bg-green-500/10 border-green-500/40">
                      <CheckCircle className="h-4 w-4" />
                      <AlertTitle>Ready to Finalize</AlertTitle>
                      <AlertDescription>
                        All requirements met. Click Finalize to proceed.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsFinalizeDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleFinalize}
                    disabled={!canProceedWithFinalize || actionLoading}
                  >
                    {actionLoading ? (
                      <ArrowsClockwise size={18} className="mr-2 animate-spin" />
                    ) : (
                      <ShieldCheck size={18} className="mr-2" />
                    )}
                    Finalize Period
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canLock && (
            <Dialog open={isLockDialogOpen} onOpenChange={setIsLockDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Lock size={18} className="mr-2" />
                  Lock Period
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <WarningCircle size={24} weight="fill" />
                    Lock {period.name}
                  </DialogTitle>
                  <DialogDescription>
                    This action is <strong>IRREVERSIBLE</strong>.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <Alert className="bg-red-500/10 border-red-500/40">
                    <WarningCircle className="h-4 w-4" />
                    <AlertTitle>Warning</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                        <li>The period will become completely immutable</li>
                        <li>No entries can be posted or reversed</li>
                        <li>This cannot be undone under any circumstances</li>
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="confirm-lock"
                      checked={confirmLock}
                      onCheckedChange={(checked) => setConfirmLock(checked as boolean)}
                    />
                    <label
                      htmlFor="confirm-lock"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      I understand this action is irreversible
                    </label>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsLockDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleLock}
                    disabled={!confirmLock || actionLoading}
                  >
                    {actionLoading ? (
                      <ArrowsClockwise size={18} className="mr-2 animate-spin" />
                    ) : (
                      <Lock size={18} className="mr-2" />
                    )}
                    Lock Period Permanently
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Info for finalized/locked periods */}
        {period.status === 'FINALIZED' && (
          <Alert className="bg-amber-500/10 border-amber-500/40">
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Period Finalized</AlertTitle>
            <AlertDescription>
              No new entries can be posted to this period. Corrections must be made via
              reversals in a subsequent open period.
            </AlertDescription>
          </Alert>
        )}

        {period.status === 'LOCKED' && (
          <Alert className="bg-red-500/10 border-red-500/40">
            <Lock className="h-4 w-4" />
            <AlertTitle>Period Locked</AlertTitle>
            <AlertDescription>
              This period is permanently locked and cannot be modified in any way.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
