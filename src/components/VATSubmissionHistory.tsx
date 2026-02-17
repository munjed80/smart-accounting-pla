/**
 * VAT Submission History Component
 * 
 * Displays submission history for VAT/BTW and ICP returns with:
 * - Submission status timeline
 * - Mark as submitted functionality
 * - Reference text and attachments
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CheckCircle, Clock, FileText, Upload, Warning, X } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { vatApi, VATSubmission, getErrorMessage } from '@/lib/api'

interface VATSubmissionHistoryProps {
  clientId: string
  periodId?: string
  onRefresh?: () => void
}

const STATUS_CONFIG = {
  DRAFT: {
    label: 'Concept',
    icon: Clock,
    variant: 'secondary' as const,
    color: 'text-gray-600 dark:text-gray-400',
  },
  SUBMITTED: {
    label: 'Ingediend',
    icon: CheckCircle,
    variant: 'default' as const,
    color: 'text-blue-600 dark:text-blue-400',
  },
  CONFIRMED: {
    label: 'Bevestigd',
    icon: CheckCircle,
    variant: 'default' as const,
    color: 'text-green-600 dark:text-green-400',
  },
  REJECTED: {
    label: 'Afgewezen',
    icon: Warning,
    variant: 'destructive' as const,
    color: 'text-red-600 dark:text-red-400',
  },
}

export const VATSubmissionHistory = ({ clientId, periodId, onRefresh }: VATSubmissionHistoryProps) => {
  const [submissions, setSubmissions] = useState<VATSubmission[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSubmission, setSelectedSubmission] = useState<VATSubmission | null>(null)
  const [isMarkingSubmitted, setIsMarkingSubmitted] = useState(false)
  const [referenceText, setReferenceText] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')

  const loadSubmissions = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await vatApi.listSubmissions(clientId, periodId)
      setSubmissions(response.submissions)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSubmissions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, periodId])

  const handleMarkSubmitted = async () => {
    if (!selectedSubmission || !referenceText.trim()) return

    try {
      setIsMarkingSubmitted(true)
      setError(null)
      await vatApi.markSubmitted(
        clientId,
        selectedSubmission.id,
        referenceText,
        attachmentUrl || undefined
      )
      setSelectedSubmission(null)
      setReferenceText('')
      setAttachmentUrl('')
      await loadSubmissions()
      onRefresh?.()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsMarkingSubmitted(false)
    }
  }

  const openMarkSubmittedDialog = (submission: VATSubmission) => {
    setSelectedSubmission(submission)
    setReferenceText('')
    setAttachmentUrl('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Indieningsgeschiedenis</CardTitle>
        <CardDescription>
          Overzicht van gegenereerde en ingediende BTW- en ICP-aangiftes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Laden...
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p>Nog geen aangiftes gegenereerd voor deze periode</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum aangemaakt</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Methode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ingediend op</TableHead>
                  <TableHead>Referentie</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((submission) => {
                  const statusConfig = STATUS_CONFIG[submission.status as keyof typeof STATUS_CONFIG]
                  const StatusIcon = statusConfig.icon

                  return (
                    <TableRow key={submission.id}>
                      <TableCell>
                        {format(new Date(submission.created_at), 'dd-MM-yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {submission.submission_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {submission.method === 'PACKAGE' ? 'Handmatig' : 'Digipoort'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusIcon size={16} className={statusConfig.color} />
                          <Badge variant={statusConfig.variant}>
                            {statusConfig.label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {submission.submitted_at
                          ? format(new Date(submission.submitted_at), 'dd-MM-yyyy HH:mm')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {submission.reference_text || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {submission.status === 'DRAFT' && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openMarkSubmittedDialog(submission)}
                              >
                                <Upload size={16} className="mr-2" />
                                Markeer als ingediend
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Markeer als ingediend</DialogTitle>
                                <DialogDescription>
                                  Voer de referentie in van de indiening bij de Belastingdienst
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                <div className="space-y-2">
                                  <Label htmlFor="reference">
                                    Referentie *
                                  </Label>
                                  <Textarea
                                    id="reference"
                                    placeholder="bijv. 'Ingediend via portal op 17-02-2026, bevestigingsnummer: 12345678'"
                                    value={referenceText}
                                    onChange={(e) => setReferenceText(e.target.value)}
                                    rows={3}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="attachment">
                                    Bijlage URL (optioneel)
                                  </Label>
                                  <Input
                                    id="attachment"
                                    type="url"
                                    placeholder="https://..."
                                    value={attachmentUrl}
                                    onChange={(e) => setAttachmentUrl(e.target.value)}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Link naar bevestigingsmail of ontvangstbewijs
                                  </p>
                                </div>
                                {error && (
                                  <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                  </Alert>
                                )}
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => setSelectedSubmission(null)}
                                  >
                                    Annuleren
                                  </Button>
                                  <Button
                                    onClick={handleMarkSubmitted}
                                    disabled={!referenceText.trim() || isMarkingSubmitted}
                                  >
                                    {isMarkingSubmitted ? 'Bezig...' : 'Opslaan'}
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default VATSubmissionHistory
