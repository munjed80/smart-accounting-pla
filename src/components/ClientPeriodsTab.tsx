/**
 * Client Periods Tab (Dutch-first)
 * 
 * Period control: Review → Finalize → Lock workflow
 * - List periods with status badges
 * - Start review (validation)
 * - Finalize (with checklist)
 * - Lock (irreversible warning)
 * - View snapshot and audit logs
 * 
 * All text in Dutch.
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { 
  periodApi,
  Period,
  PeriodStatus,
  PeriodWithValidation,
  PeriodSnapshot,
  AuditLogEntry,
  getErrorMessage 
} from '@/lib/api'
import { createDossierLogger } from '@/lib/dossierLogger'
import { 
  ArrowsClockwise,
  WarningCircle,
  Warning,
  CheckCircle,
  CalendarBlank,
  Play,
  Flag,
  Lock,
  Eye,
  ClockCounterClockwise,
  FileText,
  Shield,
} from '@phosphor-icons/react'
import { format, formatDistanceToNow } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import { t } from '@/i18n'

interface ClientPeriodsTabProps {
  clientId: string
}

// Period status colors and Dutch labels
const periodStatusConfig: Record<PeriodStatus, {
  bg: string
  text: string
  border: string
  icon: typeof CalendarBlank
  label: string
}> = {
  OPEN: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-500/40',
    icon: CalendarBlank,
    label: t('periods.statusBadge.OPEN'),
  },
  REVIEW: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-500/40',
    icon: Eye,
    label: t('periods.statusBadge.REVIEW'),
  },
  FINALIZED: {
    bg: 'bg-green-500/20',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-500/40',
    icon: Flag,
    label: t('periods.statusBadge.FINALIZED'),
  },
  LOCKED: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-700 dark:text-gray-400',
    border: 'border-gray-500/40',
    icon: Lock,
    label: t('periods.statusBadge.LOCKED'),
  },
}

// Period Card Component
const PeriodCard = ({
  period,
  clientId,
  onRefresh,
}: {
  period: Period
  clientId: string
  onRefresh: () => void
}) => {
  const statusConfig = periodStatusConfig[period.status]
  const StatusIcon = statusConfig.icon
  
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [periodDetails, setPeriodDetails] = useState<PeriodWithValidation | null>(null)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  
  // Dialog states
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false)
  const [showLockDialog, setShowLockDialog] = useState(false)
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false)
  const [showAuditDialog, setShowAuditDialog] = useState(false)
  
  // Finalize form state
  const [acknowledgeYellow, setAcknowledgeYellow] = useState(false)
  const [confirmIrreversible, setConfirmIrreversible] = useState(false)
  
  // Snapshot and audit data
  const [snapshot, setSnapshot] = useState<PeriodSnapshot | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])

  const loadPeriodDetails = async () => {
    setIsLoadingDetails(true)
    try {
      const details = await periodApi.getPeriod(clientId, period.id)
      setPeriodDetails(details)
    } catch (err) {
      console.error('Failed to load period details:', err)
    } finally {
      setIsLoadingDetails(false)
    }
  }

  const handleStartReview = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await periodApi.startReview(clientId, period.id)
      setSuccessMessage(t('periods.reviewStartedMessage').replace('{count}', String(result.issues_found)))
      setShowReviewDialog(false)
      setTimeout(() => {
        setSuccessMessage(null)
        onRefresh()
      }, 2000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleFinalize = async () => {
    if (!acknowledgeYellow && (periodDetails?.validation.yellow_issues.length || 0) > 0) {
      setError(t('periods.errors.yellowNotAcknowledged'))
      return
    }
    
    setIsLoading(true)
    setError(null)
    try {
      const yellowIssueIds = periodDetails?.validation.yellow_issues.map(i => i.id) || []
      await periodApi.finalizePeriod(clientId, period.id, {
        acknowledged_yellow_issues: acknowledgeYellow ? yellowIssueIds : undefined,
      })
      setSuccessMessage(t('periods.finalizeSuccessMessage'))
      setShowFinalizeDialog(false)
      setAcknowledgeYellow(false)
      setTimeout(() => {
        setSuccessMessage(null)
        onRefresh()
      }, 2000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleLock = async () => {
    if (!confirmIrreversible) {
      setError(t('periods.actions.lock.confirmLabel'))
      return
    }
    
    setIsLoading(true)
    setError(null)
    try {
      await periodApi.lockPeriod(clientId, period.id, {
        confirm_irreversible: true,
      })
      setSuccessMessage(t('periods.lockSuccessMessage'))
      setShowLockDialog(false)
      setConfirmIrreversible(false)
      setTimeout(() => {
        setSuccessMessage(null)
        onRefresh()
      }, 2000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const loadSnapshot = async () => {
    setIsLoading(true)
    try {
      const data = await periodApi.getSnapshot(clientId, period.id)
      setSnapshot(data)
      setShowSnapshotDialog(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const loadAuditLogs = async () => {
    setIsLoading(true)
    try {
      const data = await periodApi.getAuditLogs(clientId, period.id)
      setAuditLogs(data.logs)
      setShowAuditDialog(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  // Load period details when clicking review or finalize
  const handleOpenReviewDialog = async () => {
    setShowReviewDialog(true)
  }

  const handleOpenFinalizeDialog = async () => {
    await loadPeriodDetails()
    setShowFinalizeDialog(true)
  }

  const handleOpenLockDialog = () => {
    setShowLockDialog(true)
  }

  // Determine available actions based on status
  const canStartReview = period.status === 'OPEN'
  const canFinalize = period.status === 'REVIEW'
  const canLock = period.status === 'FINALIZED'
  const canViewSnapshot = period.status === 'FINALIZED' || period.status === 'LOCKED'

  return (
    <>
      <Card className={`${statusConfig.bg} border ${statusConfig.border}`}>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-lg ${statusConfig.bg}`}>
                <StatusIcon size={24} weight="fill" className={statusConfig.text} />
              </div>
              
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{period.name}</h3>
                  <Badge 
                    variant="outline" 
                    className={`${statusConfig.bg} ${statusConfig.text} ${statusConfig.border} text-xs font-semibold`}
                  >
                    {statusConfig.label}
                  </Badge>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  {format(new Date(period.start_date), 'd MMM yyyy', { locale: nlLocale })} - {format(new Date(period.end_date), 'd MMM yyyy', { locale: nlLocale })}
                </p>
                
                {/* Status timestamps */}
                <div className="mt-2 text-xs text-muted-foreground space-y-1">
                  {period.review_started_at && (
                    <p>Controle gestart: {format(new Date(period.review_started_at), 'd MMM yyyy HH:mm', { locale: nlLocale })}</p>
                  )}
                  {period.finalized_at && (
                    <p>Afgerond: {format(new Date(period.finalized_at), 'd MMM yyyy HH:mm', { locale: nlLocale })}</p>
                  )}
                  {period.locked_at && (
                    <p>Vergrendeld: {format(new Date(period.locked_at), 'd MMM yyyy HH:mm', { locale: nlLocale })}</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex flex-col gap-2">
              {canStartReview && (
                <Button size="sm" onClick={handleOpenReviewDialog} disabled={isLoading}>
                  <Play size={14} className="mr-1" />
                  {t('periods.startReview')}
                </Button>
              )}
              
              {canFinalize && (
                <Button size="sm" onClick={handleOpenFinalizeDialog} disabled={isLoading}>
                  <Flag size={14} className="mr-1" />
                  {t('periods.finalize')}
                </Button>
              )}
              
              {canLock && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleOpenLockDialog} 
                  disabled={isLoading}
                  className="border-red-500/40 text-red-600 hover:bg-red-500/10"
                >
                  <Lock size={14} className="mr-1" />
                  {t('periods.lock')}
                </Button>
              )}
              
              {canViewSnapshot && (
                <Button size="sm" variant="outline" onClick={loadSnapshot} disabled={isLoading}>
                  <Eye size={14} className="mr-1" />
                  {t('periods.viewSnapshot')}
                </Button>
              )}
              
              <Button size="sm" variant="ghost" onClick={loadAuditLogs} disabled={isLoading}>
                <ClockCounterClockwise size={14} className="mr-1" />
                {t('periods.viewAuditLog')}
              </Button>
            </div>
          </div>
          
          {/* Error/Success messages */}
          {error && (
            <Alert className="mt-4 bg-red-500/10 border-red-500/30">
              <WarningCircle className="h-4 w-4 text-red-500" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {successMessage && (
            <Alert className="mt-4 bg-green-500/10 border-green-500/30">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play size={20} />
              {t('periods.actions.review.title')}
            </DialogTitle>
            <DialogDescription>
              {t('periods.actions.review.description')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Periode: <strong>{period.name}</strong>
            </p>
          </div>
          
          {error && (
            <Alert className="bg-red-500/10 border-red-500/30">
              <WarningCircle className="h-4 w-4 text-red-500" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleStartReview} disabled={isLoading}>
              {isLoading ? t('common.processing') : t('periods.actions.review.button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize Dialog */}
      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag size={20} />
              {t('periods.actions.finalize.title')}
            </DialogTitle>
            <DialogDescription>
              {t('periods.actions.finalize.description')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {isLoadingDetails ? (
              <Skeleton className="h-20 w-full" />
            ) : periodDetails ? (
              <>
                {/* Validation Summary */}
                <div className="flex gap-4">
                  <div className="flex-1 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <p className="text-xs text-muted-foreground mb-1">{t('periods.summary.redIssues')}</p>
                    <p className="text-lg font-bold text-red-600">{periodDetails.validation.red_issues.length}</p>
                  </div>
                  <div className="flex-1 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-xs text-muted-foreground mb-1">{t('periods.summary.yellowIssues')}</p>
                    <p className="text-lg font-bold text-amber-600">{periodDetails.validation.yellow_issues.length}</p>
                  </div>
                </div>
                
                {/* Checklist */}
                <div className="space-y-3">
                  <p className="font-medium text-sm">{t('periods.actions.finalize.checklist.title')}</p>
                  
                  <div className="flex items-center gap-2">
                    {periodDetails.validation.red_issues.length === 0 ? (
                      <CheckCircle size={18} className="text-green-500" weight="fill" />
                    ) : (
                      <WarningCircle size={18} className="text-red-500" weight="fill" />
                    )}
                    <span className={periodDetails.validation.red_issues.length === 0 ? 'text-green-600' : 'text-red-600'}>
                      {t('periods.actions.finalize.checklist.redResolved')}
                    </span>
                  </div>
                  
                  {periodDetails.validation.yellow_issues.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Checkbox 
                        id="ack-yellow" 
                        checked={acknowledgeYellow}
                        onCheckedChange={(checked) => setAcknowledgeYellow(checked === true)}
                      />
                      <Label htmlFor="ack-yellow" className="text-sm">
                        {t('periods.actions.finalize.acknowledgeYellow').replace('{count}', String(periodDetails.validation.yellow_issues.length))}
                      </Label>
                    </div>
                  )}
                </div>
                
                {/* Warning */}
                <Alert className="bg-amber-500/10 border-amber-500/30">
                  <Warning className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-sm">
                    {t('periods.actions.finalize.warning')}
                  </AlertDescription>
                </Alert>
                
                {/* Can Finalize indicator */}
                {periodDetails.validation.red_issues.length > 0 && (
                  <Alert className="bg-red-500/10 border-red-500/30">
                    <WarningCircle className="h-4 w-4 text-red-500" />
                    <AlertDescription>
                      {t('periods.errors.hasRedIssues')}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            ) : null}
          </div>
          
          {error && (
            <Alert className="bg-red-500/10 border-red-500/30">
              <WarningCircle className="h-4 w-4 text-red-500" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalizeDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleFinalize} 
              disabled={isLoading || (periodDetails?.validation.red_issues.length || 0) > 0}
            >
              {isLoading ? t('common.processing') : t('periods.actions.finalize.button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock Dialog */}
      <Dialog open={showLockDialog} onOpenChange={setShowLockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Lock size={20} />
              {t('periods.actions.lock.title')}
            </DialogTitle>
            <DialogDescription>
              {t('periods.actions.lock.description')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <Alert className="bg-red-500/10 border-red-500/40">
              <Shield className="h-4 w-4 text-red-500" />
              <AlertDescription className="font-medium">
                {t('periods.actions.lock.warning')}
              </AlertDescription>
            </Alert>
            
            <div className="flex items-start gap-2">
              <Checkbox 
                id="confirm-lock" 
                checked={confirmIrreversible}
                onCheckedChange={(checked) => setConfirmIrreversible(checked === true)}
              />
              <Label htmlFor="confirm-lock" className="text-sm">
                {t('periods.actions.lock.confirmLabel')}
              </Label>
            </div>
          </div>
          
          {error && (
            <Alert className="bg-red-500/10 border-red-500/30">
              <WarningCircle className="h-4 w-4 text-red-500" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLockDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleLock} 
              disabled={isLoading || !confirmIrreversible}
            >
              {isLoading ? t('common.processing') : t('periods.actions.lock.button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snapshot Dialog */}
      <Dialog open={showSnapshotDialog} onOpenChange={setShowSnapshotDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={20} />
              {t('snapshots.title')}
            </DialogTitle>
            <DialogDescription>
              {t('snapshots.subtitle')}
            </DialogDescription>
          </DialogHeader>
          
          {snapshot && (
            <div className="py-4 space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>{t('snapshots.createdAt')}: {format(new Date(snapshot.created_at), 'd MMM yyyy HH:mm', { locale: nlLocale })}</p>
              </div>
              
              <Separator />
              
              {/* Summary */}
              <div>
                <h4 className="font-semibold mb-3">{t('snapshots.summary.title')}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">{t('snapshots.summary.totalAssets')}</p>
                    <p className="font-semibold">€ {snapshot.summary.total_assets.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">{t('snapshots.summary.totalLiabilities')}</p>
                    <p className="font-semibold">€ {snapshot.summary.total_liabilities.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">{t('snapshots.summary.totalEquity')}</p>
                    <p className="font-semibold">€ {snapshot.summary.total_equity.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">{t('snapshots.summary.netIncome')}</p>
                    <p className={`font-semibold ${snapshot.summary.net_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      € {snapshot.summary.net_income.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">{t('snapshots.summary.totalAr')}</p>
                    <p className="font-semibold">€ {snapshot.summary.total_ar.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">{t('snapshots.summary.totalAp')}</p>
                    <p className="font-semibold">€ {snapshot.summary.total_ap.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">{t('snapshots.summary.vatPayable')}</p>
                    <p className="font-semibold">€ {snapshot.summary.vat_payable.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground">{t('snapshots.summary.vatReceivable')}</p>
                    <p className="font-semibold">€ {snapshot.summary.vat_receivable.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSnapshotDialog(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Log Dialog */}
      <Dialog open={showAuditDialog} onOpenChange={setShowAuditDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClockCounterClockwise size={20} />
              {t('audit.title')}
            </DialogTitle>
            <DialogDescription>
              {t('audit.subtitle')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {auditLogs.length > 0 ? (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-lg bg-muted">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline">
                        {log.action === 'REVIEW_START' && t('audit.actions.REVIEW_START')}
                        {log.action === 'FINALIZE' && t('audit.actions.FINALIZE')}
                        {log.action === 'LOCK' && t('audit.actions.LOCK')}
                        {!['REVIEW_START', 'FINALIZE', 'LOCK'].includes(log.action) && log.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.performed_at), 'd MMM yyyy HH:mm', { locale: nlLocale })}
                      </span>
                    </div>
                    {log.from_status && log.to_status && (
                      <p className="text-sm">
                        {t('audit.from')}: <span className="font-medium">{log.from_status}</span> → {t('audit.to')}: <span className="font-medium">{log.to_status}</span>
                      </p>
                    )}
                    {log.notes && (
                      <p className="text-sm text-muted-foreground mt-1">{t('audit.notes')}: {log.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ClockCounterClockwise size={32} className="mx-auto mb-2 opacity-50" />
                <p>{t('audit.noLogs')}</p>
                <p className="text-sm">{t('audit.noLogsDescription')}</p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuditDialog(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export const ClientPeriodsTab = ({ clientId }: ClientPeriodsTabProps) => {
  const [periods, setPeriods] = useState<Period[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPeriods = async () => {
    const logger = createDossierLogger(clientId)
    const endpoint = `/accountant/clients/${clientId}/periods`
    
    try {
      setIsLoading(true)
      setError(null)
      logger.request(endpoint)
      const data = await periodApi.listPeriods(clientId)
      logger.success(endpoint, { count: data.periods.length })
      setPeriods(data.periods)
    } catch (err) {
      logger.error(endpoint, err)
      const message = getErrorMessage(err)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPeriods()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  if (error && periods.length === 0) {
    return (
      <Alert className="bg-destructive/10 border-destructive/40">
        <WarningCircle className="h-5 w-5 text-destructive" />
        <AlertDescription className="ml-2">
          <div className="font-semibold mb-2">{t('errors.loadFailed')}</div>
          <div className="text-sm text-muted-foreground mb-4">{error}</div>
          <Button onClick={fetchPeriods} size="sm" variant="outline">
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
          <h2 className="text-xl font-semibold">{t('periods.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('periods.subtitle')}</p>
        </div>
        <Button 
          onClick={fetchPeriods} 
          disabled={isLoading}
          variant="outline"
          size="sm"
        >
          <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Periods List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : periods.length > 0 ? (
        <div className="space-y-4">
          {periods.map((period) => (
            <PeriodCard 
              key={period.id} 
              period={period} 
              clientId={clientId}
              onRefresh={fetchPeriods}
            />
          ))}
        </div>
      ) : (
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-muted-foreground">
              <CalendarBlank size={48} className="mx-auto mb-4 opacity-50" />
              <p className="font-medium">{t('periods.noPeriods')}</p>
              <p className="text-sm mt-2">
                {t('periods.noPeriodsDescription')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default ClientPeriodsTab
