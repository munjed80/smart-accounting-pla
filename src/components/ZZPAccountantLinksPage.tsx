/**
 * ZZPAccountantLinksPage - Manage accountant access requests
 * 
 * Features:
 * - View pending accountant link requests
 * - Approve or reject requests
 * - View active accountant links
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { zzpApi, PendingLinkRequest, getErrorMessage } from '@/lib/api'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  Info,
  Handshake,
  ShieldCheck,
  Buildings,
  Envelope,
  WarningCircle,
} from '@phosphor-icons/react'

// Pending request card component
const PendingRequestCard = ({
  request,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  request: PendingLinkRequest
  onApprove: () => void
  onReject: () => void
  isApproving: boolean
  isRejecting: boolean
}) => {
  const isProcessing = isApproving || isRejecting
  
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          {/* Request info */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <User size={24} className="text-amber-600 dark:text-amber-400" weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-lg">
                  {request.accountant_name || request.accountant_email}
                </h3>
                <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30">
                  <Clock size={14} className="mr-1" />
                  {t('accountantClients.statusPending')}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {request.accountant_email}
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                {t('zzpAccountantLinks.requestedAccess')}
              </p>
              
              {/* Administration info */}
              <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                <Buildings size={16} />
                <span>{t('zzpAccountantLinks.administration')}: {request.administration_name}</span>
              </div>
              
              {/* Request date */}
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <Clock size={14} />
                <span>
                  {t('zzpAccountantLinks.requestedAt')}: {format(new Date(request.invited_at), 'dd MMM yyyy, HH:mm', { locale: nlLocale })}
                </span>
              </div>
            </div>
          </div>

          {/* Explanation alert */}
          <Alert className="bg-blue-500/10 border-blue-500/30">
            <Info size={18} className="text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-700 dark:text-blue-300">{t('zzpAccountantLinks.whatThisMeans')}</AlertTitle>
            <AlertDescription className="text-blue-600/80 dark:text-blue-400/80">
              {t('zzpAccountantLinks.approvalExplanation')}
            </AlertDescription>
          </Alert>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={onReject}
              disabled={isProcessing}
              className="gap-2 text-destructive hover:text-destructive"
            >
              {isRejecting ? (
                <>
                  <span className="animate-spin">⟳</span>
                  {t('zzpAccountantLinks.rejecting')}
                </>
              ) : (
                <>
                  <XCircle size={18} />
                  {t('zzpAccountantLinks.reject')}
                </>
              )}
            </Button>
            <Button
              onClick={onApprove}
              disabled={isProcessing}
              className="gap-2"
            >
              {isApproving ? (
                <>
                  <span className="animate-spin">⟳</span>
                  {t('zzpAccountantLinks.approving')}
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  {t('zzpAccountantLinks.approve')}
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Empty state component
const EmptyState = ({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon?: React.ReactNode
}) => (
  <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
      {icon || <Handshake size={64} weight="duotone" className="text-muted-foreground mb-4" />}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-sm">{description}</p>
    </CardContent>
  </Card>
)

// Loading skeleton
const LoadingSkeleton = () => (
  <div className="space-y-4">
    {[1, 2].map((i) => (
      <Card key={i}>
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <Skeleton className="w-12 h-12 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64 mb-4" />
              <Skeleton className="h-16 w-full mb-4" />
              <div className="flex justify-end gap-2">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-28" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
)

export const ZZPAccountantLinksPage = () => {
  const [pendingRequests, setPendingRequests] = useState<PendingLinkRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set())
  const [rejectingIds, setRejectingIds] = useState<Set<string>>(new Set())

  // Load pending requests
  const loadRequests = useCallback(async () => {
    try {
      setError(null)
      const response = await zzpApi.getPendingLinks()
      setPendingRequests(response.pending_requests)
    } catch (err) {
      console.error('Failed to load pending requests:', err)
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  // Handle approve
  const handleApprove = async (assignmentId: string) => {
    setApprovingIds(prev => new Set(prev).add(assignmentId))
    
    try {
      await zzpApi.approveLink(assignmentId)
      toast.success(t('zzpAccountantLinks.approvedSuccess'))
      
      // Remove from list
      setPendingRequests(prev => prev.filter(r => r.assignment_id !== assignmentId))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setApprovingIds(prev => {
        const next = new Set(prev)
        next.delete(assignmentId)
        return next
      })
    }
  }

  // Handle reject
  const handleReject = async (assignmentId: string) => {
    setRejectingIds(prev => new Set(prev).add(assignmentId))
    
    try {
      await zzpApi.rejectLink(assignmentId)
      toast.success(t('zzpAccountantLinks.rejectedSuccess'))
      
      // Remove from list
      setPendingRequests(prev => prev.filter(r => r.assignment_id !== assignmentId))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRejectingIds(prev => {
        const next = new Set(prev)
        next.delete(assignmentId)
        return next
      })
    }
  }

  return (
    <div className="container max-w-3xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Handshake size={32} className="text-primary" weight="duotone" />
          <h1 className="text-2xl sm:text-3xl font-bold">{t('zzpAccountantLinks.title')}</h1>
        </div>
        <p className="text-muted-foreground">
          {t('zzpAccountantLinks.subtitle')}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <WarningCircle size={18} />
          <AlertTitle>{t('errors.loadFailed')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button variant="outline" size="sm" onClick={loadRequests} className="mt-2">
            {t('common.retry')}
          </Button>
        </Alert>
      )}

      {/* Pending requests section */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={20} className="text-amber-600 dark:text-amber-400" />
          <h2 className="text-lg font-semibold">{t('zzpAccountantLinks.pendingRequests')}</h2>
          {pendingRequests.length > 0 && (
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-400">
              {pendingRequests.length}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : pendingRequests.length === 0 ? (
          <EmptyState
            title={t('zzpAccountantLinks.noPendingRequests')}
            description={t('zzpAccountantLinks.noPendingRequestsDescription')}
            icon={<ShieldCheck size={64} weight="duotone" className="text-green-500 mb-4" />}
          />
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <PendingRequestCard
                key={request.assignment_id}
                request={request}
                onApprove={() => handleApprove(request.assignment_id)}
                onReject={() => handleReject(request.assignment_id)}
                isApproving={approvingIds.has(request.assignment_id)}
                isRejecting={rejectingIds.has(request.assignment_id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Info about active links */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
          <h2 className="text-lg font-semibold">{t('zzpAccountantLinks.activeLinks')}</h2>
        </div>
        
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              {t('zzpAccountantLinks.noActiveLinksDescription')}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

export default ZZPAccountantLinksPage
