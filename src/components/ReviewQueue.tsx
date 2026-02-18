/**
 * Document Review Queue Component
 * 
 * Allows accountants to:
 * - View documents needing review
 * - See extracted fields and confidence
 * - See suggested actions from the matching engine
 * - Approve and post in one flow
 * - Reject with reason
 * 
 * Shows Dutch toast notifications for success/failure.
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { 
  documentReviewApi, 
  DocumentReviewItem, 
  DocumentReviewListResponse,
  DocumentReviewStatus,
  DocumentSuggestedAction,
  getErrorMessage 
} from '@/lib/api'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { 
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  Warning,
  FileText,
  Eye,
  Trash,
  ArrowClockwise,
  CurrencyEur,
  Calendar,
  Buildings,
  Lightning,
  Copy,
  CheckFat,
  XCircle
} from '@phosphor-icons/react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { t } from '@/i18n'
import { BookingProposalModal } from './BookingProposalModal'

// Status colors and labels
const statusConfig: Record<DocumentReviewStatus, { bg: string; text: string; label: string }> = {
  UPLOADED: { bg: 'bg-gray-500/20', text: 'text-gray-600', label: 'Uploaded' },
  PROCESSING: { bg: 'bg-blue-500/20', text: 'text-blue-600', label: 'Processing' },
  EXTRACTED: { bg: 'bg-purple-500/20', text: 'text-purple-600', label: 'Extracted' },
  NEEDS_REVIEW: { bg: 'bg-amber-500/20', text: 'text-amber-600', label: 'Needs Review' },
  POSTED: { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Posted' },
  REJECTED: { bg: 'bg-red-500/20', text: 'text-red-600', label: 'Rejected' },
  DRAFT_READY: { bg: 'bg-cyan-500/20', text: 'text-cyan-600', label: 'Draft Ready' },
  FAILED: { bg: 'bg-red-500/20', text: 'text-red-600', label: 'Failed' },
}

// Confidence indicator component
const ConfidenceIndicator = ({ confidence }: { confidence: number | null }) => {
  if (confidence === null) return <span className="text-muted-foreground">—</span>
  
  const percent = Math.round(confidence * 100)
  
  // Use explicit color classes based on confidence level
  const getColorClass = () => {
    if (percent >= 85) return 'text-green-600'
    if (percent >= 65) return 'text-amber-600'
    return 'text-red-600'
  }
  
  return (
    <div className="flex items-center gap-2">
      <Progress value={percent} className="w-16 h-2" />
      <span className={`text-xs font-medium ${getColorClass()}`}>{percent}%</span>
    </div>
  )
}

// Suggested action component
const SuggestedActionCard = ({ 
  action, 
  onApply 
}: { 
  action: DocumentSuggestedAction
  onApply: () => void 
}) => {
  const confidencePercent = Math.round(action.confidence_score * 100)
  
  return (
    <div className="p-3 rounded-lg border border-border bg-card/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Lightning size={16} weight="fill" className="text-amber-500" />
            <span className="font-medium text-sm">{action.title}</span>
            <Badge variant="outline" className="text-xs">
              {confidencePercent}% confidence
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{action.explanation}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onApply}>
          Apply
        </Button>
      </div>
    </div>
  )
}

interface ReviewQueueProps {
  clientId: string
  clientName: string
  onClose?: () => void
  onActionComplete?: () => void // Called after an action to invalidate cache
}

export const ReviewQueue = ({ clientId, clientName, onClose, onActionComplete }: ReviewQueueProps) => {
  const [documents, setDocuments] = useState<DocumentReviewItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<DocumentReviewStatus | undefined>('NEEDS_REVIEW')
  const showSkeleton = useDelayedLoading(isLoading, 300, documents.length > 0)
  
  // Dialog states
  const [selectedDoc, setSelectedDoc] = useState<DocumentReviewItem | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [isBookingProposalOpen, setIsBookingProposalOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchDocuments = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await documentReviewApi.listDocuments(clientId, filter)
      setDocuments(data.documents)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [clientId, filter])

  const handleViewDocument = (doc: DocumentReviewItem) => {
    setSelectedDoc(doc)
    setIsDetailOpen(true)
  }

  const handleOpenBookingProposal = (doc: DocumentReviewItem) => {
    setSelectedDoc(doc)
    setIsBookingProposalOpen(true)
  }

  const handleBookingSuccess = () => {
    // After successful booking, refresh the list
    fetchDocuments()
    onActionComplete?.()
    setIsDetailOpen(false)
    setIsBookingProposalOpen(false)
  }

  const handleRejectDocument = async () => {
    if (!selectedDoc || !rejectReason.trim()) return
    
    try {
      setIsProcessing(true)
      await documentReviewApi.rejectDocument(clientId, selectedDoc.id, { reason: rejectReason })
      toast.success(t('common.success'), {
        description: t('reviewQueueActions.rejected'),
      })
      setIsRejectOpen(false)
      setIsDetailOpen(false)
      setRejectReason('')
      fetchDocuments()
      // Invalidate cache in parent
      onActionComplete?.()
    } catch (err) {
      toast.error(t('common.error'), {
        description: getErrorMessage(err),
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReprocessDocument = async (doc: DocumentReviewItem) => {
    try {
      setIsProcessing(true)
      await documentReviewApi.reprocessDocument(clientId, doc.id)
      toast.success(t('common.success'), {
        description: t('reviewQueueActions.reprocessing'),
      })
      fetchDocuments()
      // Invalidate cache in parent
      onActionComplete?.()
    } catch (err) {
      toast.error(t('common.error'), {
        description: getErrorMessage(err),
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const needsReviewCount = documents.filter(d => d.status === 'NEEDS_REVIEW').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Document Review Queue</h2>
          <p className="text-muted-foreground">{clientName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchDocuments} disabled={isLoading}>
            <ArrowsClockwise size={16} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Action message */}
      {actionMessage && (
        <Alert className={actionMessage.type === 'success' ? 'bg-green-500/10 border-green-500/40' : 'bg-red-500/10 border-red-500/40'}>
          {actionMessage.type === 'success' ? (
            <CheckCircle size={18} className="text-green-600" />
          ) : (
            <WarningCircle size={18} className="text-red-600" />
          )}
          <AlertDescription>{actionMessage.text}</AlertDescription>
        </Alert>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['NEEDS_REVIEW', 'EXTRACTED', 'POSTED', 'REJECTED', undefined] as const).map((status) => (
          <Button
            key={status || 'all'}
            variant={filter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(status)}
          >
            {status ? statusConfig[status].label : 'All'}
            {status === 'NEEDS_REVIEW' && needsReviewCount > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {needsReviewCount}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <Alert className="bg-destructive/10 border-destructive/40">
          <WarningCircle size={18} className="text-destructive" />
          <AlertTitle className="flex items-center justify-between">
            <span>Error</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setError(null)
                load()
              }}
            >
              <ArrowClockwise size={16} className="mr-2" />
              Opnieuw proberen
            </Button>
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Documents table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={24} />
            {t('reviewQueueTable.documents')}
          </CardTitle>
          <CardDescription>
            {t('reviewQueueTable.documentsCount').replace('{count}', String(documents.length))}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showSkeleton ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">{t('emptyStates.noReviewItems')}</p>
              <p className="text-sm mb-4">{t('emptyStates.noReviewItemsDescription')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reviewQueueTable.document')}</TableHead>
                  <TableHead>{t('reviewQueueTable.status')}</TableHead>
                  <TableHead>{t('reviewQueueTable.supplier')}</TableHead>
                  <TableHead>{t('reviewQueueTable.amount')}</TableHead>
                  <TableHead>{t('reviewQueueTable.confidence')}</TableHead>
                  <TableHead>{t('reviewQueueTable.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id} className={doc.is_duplicate ? 'bg-amber-500/10' : ''}>
                    <TableCell>
                      <div>
                        <p className="font-medium truncate max-w-[200px]">{doc.original_filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                        </p>
                        {doc.is_duplicate && (
                          <Badge variant="outline" className="mt-1 text-xs bg-amber-500/20">
                            <Copy size={12} className="mr-1" />
                            Duplicate
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={`${statusConfig[doc.status].bg} ${statusConfig[doc.status].text}`}
                      >
                        {statusConfig[doc.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {doc.supplier_name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {doc.total_amount !== null ? (
                        <span className="font-mono">€{doc.total_amount.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ConfidenceIndicator confidence={doc.extraction_confidence} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleViewDocument(doc)}>
                          <Eye size={16} />
                        </Button>
                        {doc.status === 'NEEDS_REVIEW' && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-green-600"
                              onClick={() => handleOpenBookingProposal(doc)}
                            >
                              <CheckFat size={16} />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-red-600"
                              onClick={() => { setSelectedDoc(doc); setIsRejectOpen(true) }}
                            >
                              <XCircle size={16} />
                            </Button>
                          </>
                        )}
                        {doc.status === 'FAILED' && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleReprocessDocument(doc)}
                          >
                            <ArrowClockwise size={16} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Document detail dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText size={24} />
                  {selectedDoc.original_filename}
                </DialogTitle>
                <DialogDescription>
                  Uploaded {formatDistanceToNow(new Date(selectedDoc.created_at), { addSuffix: true })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                {/* Status and confidence */}
                <div className="flex items-center gap-4">
                  <Badge 
                    variant="outline" 
                    className={`${statusConfig[selectedDoc.status].bg} ${statusConfig[selectedDoc.status].text}`}
                  >
                    {statusConfig[selectedDoc.status].label}
                  </Badge>
                  {selectedDoc.extraction_confidence !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Extraction confidence:</span>
                      <ConfidenceIndicator confidence={selectedDoc.extraction_confidence} />
                    </div>
                  )}
                </div>

                {/* Duplicate warning */}
                {selectedDoc.is_duplicate && (
                  <Alert className="bg-amber-500/10 border-amber-500/40">
                    <Warning size={18} className="text-amber-600" />
                    <AlertTitle>Potential Duplicate</AlertTitle>
                    <AlertDescription>
                      This document may be a duplicate of an existing document.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Extracted fields */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Extracted Information</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Buildings size={14} />
                        Supplier
                      </div>
                      <p className="font-medium">{selectedDoc.supplier_name || '—'}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <FileText size={14} />
                        Invoice Number
                      </div>
                      <p className="font-medium">{selectedDoc.invoice_number || '—'}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Calendar size={14} />
                        Invoice Date
                      </div>
                      <p className="font-medium">
                        {selectedDoc.invoice_date 
                          ? format(new Date(selectedDoc.invoice_date), 'dd MMM yyyy')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Calendar size={14} />
                        Due Date
                      </div>
                      <p className="font-medium">
                        {selectedDoc.due_date 
                          ? format(new Date(selectedDoc.due_date), 'dd MMM yyyy')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <CurrencyEur size={14} />
                        Total Amount
                      </div>
                      <p className="font-medium font-mono">
                        {selectedDoc.total_amount !== null 
                          ? `€${selectedDoc.total_amount.toFixed(2)}`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <CurrencyEur size={14} />
                        VAT Amount
                      </div>
                      <p className="font-medium font-mono">
                        {selectedDoc.vat_amount !== null 
                          ? `€${selectedDoc.vat_amount.toFixed(2)}`
                          : '—'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Matching results */}
                {(selectedDoc.matched_party_id || selectedDoc.matched_open_item_id) && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Matching Results</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedDoc.matched_party_name && (
                        <div className="flex items-center gap-2">
                          <CheckCircle size={16} className="text-green-500" />
                          <span className="text-sm">
                            Matched to party: <strong>{selectedDoc.matched_party_name}</strong>
                          </span>
                        </div>
                      )}
                      {selectedDoc.matched_open_item_id && (
                        <div className="flex items-center gap-2">
                          <CheckCircle size={16} className="text-green-500" />
                          <span className="text-sm">Matched to open item</span>
                        </div>
                      )}
                      {selectedDoc.match_confidence !== null && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Match confidence:</span>
                          <ConfidenceIndicator confidence={selectedDoc.match_confidence} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Suggested actions */}
                {selectedDoc.suggested_actions && selectedDoc.suggested_actions.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Lightning size={16} weight="fill" className="text-amber-500" />
                        Suggested Actions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedDoc.suggested_actions
                        .sort((a, b) => a.priority - b.priority)
                        .map((action) => (
                          <SuggestedActionCard
                            key={action.id}
                            action={action}
                            onApply={() => {
                              // Apply the suggested action
                              handleOpenBookingProposal(selectedDoc)
                            }}
                          />
                        ))}
                    </CardContent>
                  </Card>
                )}
              </div>

              <DialogFooter className="mt-6">
                {selectedDoc.status === 'NEEDS_REVIEW' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setIsRejectOpen(true)}
                      disabled={isProcessing}
                    >
                      <XCircle size={16} className="mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleOpenBookingProposal(selectedDoc)}
                      disabled={isProcessing}
                    >
                      <CheckFat size={16} className="mr-2" />
                      Boeking Controleren
                    </Button>
                  </>
                )}
                {selectedDoc.status === 'FAILED' && (
                  <Button
                    variant="outline"
                    onClick={() => handleReprocessDocument(selectedDoc)}
                    disabled={isProcessing}
                  >
                    <ArrowClockwise size={16} className="mr-2" />
                    Reprocess
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectDocument}
              disabled={!rejectReason.trim() || isProcessing}
            >
              Reject Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Proposal Modal */}
      {selectedDoc && (
        <BookingProposalModal
          open={isBookingProposalOpen}
          onOpenChange={setIsBookingProposalOpen}
          document={selectedDoc}
          clientId={clientId}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  )
}
