/**
 * Client Bookkeeping Tab
 * 
 * Displays journal entries for the client with:
 * - List of all entries (draft/posted filter)
 * - Entry detail drawer
 * - Create/edit functionality
 * 
 * All UI text is Dutch (nl.ts).
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { 
  bookkeepingApi, 
  JournalEntryListItem, 
  JournalEntryResponse,
  JournalEntryStatus,
  getErrorMessage 
} from '@/lib/api'
import { 
  Book,
  Check,
  FileDashed,
  ArrowCounterClockwise,
  Eye,
  Plus,
  Warning,
  CheckCircle,
  XCircle,
} from '@phosphor-icons/react'
import { t } from '@/i18n'

interface ClientBookkeepingTabProps {
  clientId: string
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const formatDateTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const StatusBadge = ({ status }: { status: JournalEntryStatus }) => {
  switch (status) {
    case 'DRAFT':
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
          <FileDashed size={14} className="mr-1" />
          {t('bookkeeping.statusDraft')}
        </Badge>
      )
    case 'POSTED':
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
          <Check size={14} className="mr-1" />
          {t('bookkeeping.statusPosted')}
        </Badge>
      )
    case 'REVERSED':
      return (
        <Badge variant="outline" className="bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/30">
          <ArrowCounterClockwise size={14} className="mr-1" />
          {t('bookkeeping.statusReversed')}
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export const ClientBookkeepingTab = ({ clientId }: ClientBookkeepingTabProps) => {
  const [entries, setEntries] = useState<JournalEntryListItem[]>([])
  const [selectedEntry, setSelectedEntry] = useState<JournalEntryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  const fetchEntries = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const options: { status?: JournalEntryStatus; limit: number } = { limit: 100 }
      if (statusFilter !== 'ALL') {
        options.status = statusFilter as JournalEntryStatus
      }
      
      const response = await bookkeepingApi.listJournalEntries(clientId, options)
      setEntries(response.entries)
      setTotalCount(response.total_count)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const loadEntryDetail = async (entryId: string) => {
    try {
      setIsLoadingDetail(true)
      const entry = await bookkeepingApi.getJournalEntry(clientId, entryId)
      setSelectedEntry(entry)
      setIsSheetOpen(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoadingDetail(false)
    }
  }

  useEffect(() => {
    if (clientId) {
      fetchEntries()
    }
  }, [clientId, statusFilter])

  if (isLoading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <Warning size={18} />
        <AlertTitle>{t('errors.loadFailed')}</AlertTitle>
        <AlertDescription>
          {error}
          <Button onClick={fetchEntries} variant="outline" size="sm" className="mt-2">
            {t('common.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <>
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Book size={24} weight="duotone" className="text-primary" />
                {t('bookkeeping.title')}
              </CardTitle>
              <CardDescription>
                {t('bookkeeping.subtitle')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter op status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('bookkeeping.showAll')}</SelectItem>
                  <SelectItem value="DRAFT">{t('bookkeeping.showDrafts')}</SelectItem>
                  <SelectItem value="POSTED">{t('bookkeeping.showPosted')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <Book size={64} className="mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-semibold mb-2">{t('bookkeeping.noEntries')}</h3>
              <p className="text-muted-foreground mb-4">
                {t('bookkeeping.noEntriesDescription')}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('bookkeeping.entryNumber')}</TableHead>
                    <TableHead>{t('bookkeeping.entryDate')}</TableHead>
                    <TableHead>{t('bookkeeping.description')}</TableHead>
                    <TableHead>{t('bookkeeping.status')}</TableHead>
                    <TableHead className="text-right">{t('bookkeeping.totalDebit')}</TableHead>
                    <TableHead className="text-right">{t('bookkeeping.totalCredit')}</TableHead>
                    <TableHead>{t('bookkeeping.balance')}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono text-sm">{entry.entry_number}</TableCell>
                      <TableCell>{formatDate(entry.entry_date)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{entry.description}</TableCell>
                      <TableCell><StatusBadge status={entry.status} /></TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(entry.total_debit)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(entry.total_credit)}</TableCell>
                      <TableCell>
                        {entry.is_balanced ? (
                          <CheckCircle size={18} className="text-green-600" weight="fill" />
                        ) : (
                          <XCircle size={18} className="text-red-600" weight="fill" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => loadEntryDetail(entry.id)}
                          disabled={isLoadingDetail}
                        >
                          <Eye size={16} className="mr-1" />
                          {t('common.view')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          
          {totalCount > entries.length && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {entries.length} {t('common.showingOf')} {totalCount} {t('common.showing')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entry Detail Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-[500px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Book size={24} weight="duotone" className="text-primary" />
              {t('bookkeeping.entryDetail')}
            </SheetTitle>
            <SheetDescription>
              {selectedEntry?.entry_number}
            </SheetDescription>
          </SheetHeader>
          
          {selectedEntry && (
            <div className="mt-6 space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">{t('bookkeeping.entryDate')}</label>
                  <p className="font-medium">{formatDate(selectedEntry.entry_date)}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">{t('bookkeeping.status')}</label>
                  <div className="mt-1"><StatusBadge status={selectedEntry.status} /></div>
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-muted-foreground">{t('bookkeeping.description')}</label>
                  <p className="font-medium">{selectedEntry.description}</p>
                </div>
                {selectedEntry.reference && (
                  <div className="col-span-2">
                    <label className="text-sm text-muted-foreground">{t('bookkeeping.reference')}</label>
                    <p className="font-medium">{selectedEntry.reference}</p>
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <label className="text-sm text-muted-foreground">{t('bookkeeping.totalDebit')}</label>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(selectedEntry.total_debit)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">{t('bookkeeping.totalCredit')}</label>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(selectedEntry.total_credit)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">{t('bookkeeping.balance')}</label>
                    <p className={`text-lg font-bold ${selectedEntry.is_balanced ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedEntry.is_balanced ? `✓ ${t('bookkeeping.balanced')}` : `✗ ${t('bookkeeping.notBalancedStatus')}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Lines */}
              <div>
                <h4 className="font-semibold mb-3">{t('bookkeeping.lines')}</h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('bookkeeping.account')}</TableHead>
                        <TableHead className="text-right">{t('bookkeeping.debit')}</TableHead>
                        <TableHead className="text-right">{t('bookkeeping.credit')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedEntry.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <div>
                              <span className="font-mono text-sm">{line.account_code}</span>
                              <span className="text-muted-foreground ml-2">{line.account_name}</span>
                            </div>
                            {line.description && (
                              <p className="text-xs text-muted-foreground mt-1">{line.description}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {line.debit_amount > 0 ? formatCurrency(line.debit_amount) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {line.credit_amount > 0 ? formatCurrency(line.credit_amount) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Metadata */}
              <div className="border-t pt-4 space-y-2 text-sm text-muted-foreground">
                {selectedEntry.created_by_name && (
                  <p>{t('bookkeeping.createdBy')}: {selectedEntry.created_by_name}</p>
                )}
                {selectedEntry.posted_at && selectedEntry.posted_by_name && (
                  <p>{t('bookkeeping.postedBy')}: {selectedEntry.posted_by_name} ({formatDateTime(selectedEntry.posted_at)})</p>
                )}
                {selectedEntry.source_type && (
                  <p>{t('bookkeeping.sourceType')}: {selectedEntry.source_type}</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

export default ClientBookkeepingTab
