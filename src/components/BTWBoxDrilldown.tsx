/**
 * BTW Box Drilldown Drawer
 * 
 * Shows detailed source lines for a specific VAT box with:
 * - All contributing transaction lines
 * - Filters by source type and date
 * - Document references
 * - Export to CSV
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  X,
  DownloadSimple,
  MagnifyingGlass,
  FileText,
  Receipt,
  BookOpen,
} from '@phosphor-icons/react'
import { format } from 'date-fns'

// Types
interface VatBoxLine {
  id: string
  vat_box_code: string
  net_amount: string
  vat_amount: string
  source_type: string
  source_id: string
  document_id?: string
  journal_entry_id: string
  journal_line_id: string
  vat_code_id?: string
  transaction_date: string
  reference?: string
  description?: string
  party_id?: string
  party_name?: string
  party_vat_number?: string
  created_at: string
}

interface VatBoxLinesData {
  period_id: string
  period_name: string
  box_code: string
  box_name: string
  lines: VatBoxLine[]
  total_count: number
  page: number
  page_size: number
}

interface BTWBoxDrilldownProps {
  open: boolean
  onClose: () => void
  clientId: string
  periodId: string
  boxCode: string
  boxName: string
  onViewDocument?: (documentId: string) => void
  onViewJournalEntry?: (entryId: string) => void
}

const formatCurrency = (amount: string | number) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(num)
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  INVOICE_LINE: 'Factuur',
  EXPENSE_LINE: 'Uitgave',
  JOURNAL_LINE: 'Journaalpost',
}

const SOURCE_TYPE_ICONS: Record<string, any> = {
  INVOICE_LINE: Receipt,
  EXPENSE_LINE: FileText,
  JOURNAL_LINE: BookOpen,
}

export const BTWBoxDrilldown = ({
  open,
  onClose,
  clientId,
  periodId,
  boxCode,
  boxName,
  onViewDocument,
  onViewJournalEntry,
}: BTWBoxDrilldownProps) => {
  const [data, setData] = useState<VatBoxLinesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  
  // Load drilldown data
  const loadData = async () => {
    if (!open || !clientId || !periodId || !boxCode) return
    
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: '50',
      })
      
      if (sourceTypeFilter && sourceTypeFilter !== 'all') {
        params.append('source_type', sourceTypeFilter)
      }
      
      const response = await fetch(
        `/api/accountant/clients/${clientId}/btw/periods/${periodId}/boxes/${boxCode}/lines?${params}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Selected-Client-Id': clientId,
          },
        }
      )
      
      if (!response.ok) {
        throw new Error('Failed to load drilldown data')
      }
      
      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }
  
  // Load data when filters change
  useEffect(() => {
    loadData()
  }, [open, clientId, periodId, boxCode, page, sourceTypeFilter])
  
  // Filter lines by search query (client-side)
  const filteredLines = data?.lines.filter(line => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      line.description?.toLowerCase().includes(query) ||
      line.reference?.toLowerCase().includes(query) ||
      line.party_name?.toLowerCase().includes(query)
    )
  }) || []
  
  // Export to CSV
  const handleExportCSV = () => {
    if (!data) return
    
    const headers = [
      'Datum',
      'Type',
      'Omschrijving',
      'Relatie',
      'Referentie',
      'Netto',
      'BTW',
      'Document ID',
      'Boeking ID',
    ]
    
    const rows = filteredLines.map(line => [
      format(new Date(line.transaction_date), 'dd-MM-yyyy'),
      SOURCE_TYPE_LABELS[line.source_type] || line.source_type,
      line.description || '',
      line.party_name || '',
      line.reference || '',
      line.net_amount,
      line.vat_amount,
      line.document_id || '',
      line.journal_entry_id,
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `btw-${boxCode}-drilldown.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  
  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-[90vw] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle>
                BTW Rubriek {boxCode} - Bronregels
              </SheetTitle>
              <SheetDescription>
                {boxName}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
            >
              <X size={20} />
            </Button>
          </div>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="Zoek op omschrijving, referentie of relatie..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter op type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle types</SelectItem>
                <SelectItem value="INVOICE_LINE">Facturen</SelectItem>
                <SelectItem value="EXPENSE_LINE">Uitgaven</SelectItem>
                <SelectItem value="JOURNAL_LINE">Journaalposten</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!data || filteredLines.length === 0}
            >
              <DownloadSimple size={16} className="mr-2" />
              Exporteer CSV
            </Button>
          </div>
          
          {/* Summary */}
          {data && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{data.total_count} totale regels</span>
              {searchQuery && (
                <span>• {filteredLines.length} gefilterd</span>
              )}
            </div>
          )}
          
          {/* Loading state */}
          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          
          {/* Error state */}
          {error && (
            <div className="text-center py-8 text-destructive">
              <p>Fout bij laden van gegevens</p>
              <p className="text-sm">{error}</p>
              <Button onClick={loadData} className="mt-4">
                Opnieuw proberen
              </Button>
            </div>
          )}
          
          {/* Data table */}
          {!loading && !error && data && (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead>Relatie</TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                    <TableHead className="text-right">BTW</TableHead>
                    <TableHead className="text-center">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Geen regels gevonden
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLines.map((line) => {
                      const Icon = SOURCE_TYPE_ICONS[line.source_type] || BookOpen
                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            {format(new Date(line.transaction_date), 'dd-MM-yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              <Icon size={14} />
                              {SOURCE_TYPE_LABELS[line.source_type] || line.source_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            <div className="truncate">{line.description || '-'}</div>
                            {line.reference && (
                              <div className="text-xs text-muted-foreground">{line.reference}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {line.party_name || '-'}
                            {line.party_vat_number && (
                              <div className="text-xs text-muted-foreground font-mono">
                                {line.party_vat_number}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(line.net_amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(line.vat_amount)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              {line.document_id && onViewDocument && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onViewDocument(line.document_id!)}
                                >
                                  <FileText size={16} />
                                </Button>
                              )}
                              {onViewJournalEntry && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onViewJournalEntry(line.journal_entry_id)}
                                >
                                  <BookOpen size={16} />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          
          {/* Pagination */}
          {data && data.total_count > data.page_size && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Pagina {data.page} van {Math.ceil(data.total_count / data.page_size)}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Vorige
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(data.total_count / data.page_size)}
                  onClick={() => setPage(page + 1)}
                >
                  Volgende
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default BTWBoxDrilldown
