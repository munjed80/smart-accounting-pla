/**
 * ZZP Document Inbox Page (Documenten)
 *
 * Single intake inbox for receipts and invoices (bon/factuur).
 * Supports upload, list, detail view, and convert-to-expense workflow.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  FileText,
  Receipt,
  UploadSimple,
  MagnifyingGlass,
  Trash,
  CheckCircle,
  XCircle,
  SpinnerGap,
  Image,
  FilePdf,
  ArrowRight,
  WarningCircle,
  ArrowClockwise,
} from '@phosphor-icons/react'
import { zzpApi, ZZPDocument, ZZPDocType, ZZPDocStatus, ZZPExpenseCreate } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { toast } from 'sonner'

// ─── helpers ────────────────────────────────────────────────────────────────

const formatAmount = (cents: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })

const DOC_TYPE_LABELS: Record<ZZPDocType, string> = {
  BON: 'Bon',
  FACTUUR: 'Factuur',
  OVERIG: 'Overig',
}

const DOC_STATUS_LABELS: Record<ZZPDocStatus, string> = {
  NEW: 'Nieuw',
  REVIEW: 'Te beoordelen',
  PROCESSED: 'Verwerkt',
  FAILED: 'Mislukt',
}

const DOC_STATUS_VARIANT: Record<ZZPDocStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  NEW: 'default',
  REVIEW: 'secondary',
  PROCESSED: 'outline',
  FAILED: 'destructive',
}

const EXPENSE_CATEGORIES = [
  'algemeen', 'kantoor', 'transport', 'marketing',
  'hardware', 'software', 'opleiding', 'huisvesting',
  'telefoon', 'internet', 'overig',
]

const VAT_RATES = [0, 9, 21]

const parseEuroToCents = (val: string) => {
  const n = parseFloat(val.replace(/[€\s]/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

// ─── sub-components ─────────────────────────────────────────────────────────

const DocIcon = ({ mimeType }: { mimeType: string }) => {
  if (mimeType === 'application/pdf') return <FilePdf size={28} className="text-red-500" weight="duotone" />
  return <Image size={28} className="text-blue-500" weight="duotone" />
}

const StatusBadge = ({ status }: { status: ZZPDocStatus }) => (
  <Badge variant={DOC_STATUS_VARIANT[status]} className="text-xs">
    {DOC_STATUS_LABELS[status]}
  </Badge>
)

const TypeBadge = ({ docType }: { docType: ZZPDocType }) => (
  <Badge variant="outline" className="text-xs">
    {DOC_TYPE_LABELS[docType]}
  </Badge>
)

const LoadingSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map(i => (
      <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
        <Skeleton className="h-10 w-10 rounded" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
    ))}
  </div>
)

// ─── Expense form (for convert-to-uitgave) ──────────────────────────────────

interface ExpenseFormValues {
  vendor: string
  description: string
  expense_date: string
  amount: string
  vat_rate: number
  category: string
  notes: string
}

interface ConvertDialogProps {
  doc: ZZPDocument | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}

const ConvertDialog = ({ doc, open, onOpenChange, onSuccess }: ConvertDialogProps) => {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState<ExpenseFormValues>({
    vendor: doc?.supplier ?? '',
    description: '',
    expense_date: doc?.doc_date ?? today,
    amount: doc?.amount_cents ? String(doc.amount_cents / 100).replace('.', ',') : '',
    vat_rate: doc?.vat_rate ? Number(doc.vat_rate) : 21,
    category: 'algemeen',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when doc changes
  const prevDocId = useRef<string | null>(null)
  if (doc && doc.id !== prevDocId.current) {
    prevDocId.current = doc.id
    setForm({
      vendor: doc.supplier ?? '',
      description: '',
      expense_date: doc.doc_date ?? today,
      amount: doc.amount_cents ? String(doc.amount_cents / 100).replace('.', ',') : '',
      vat_rate: doc.vat_rate ? Number(doc.vat_rate) : 21,
      category: 'algemeen',
      notes: '',
    })
    setError(null)
  }

  const handleSave = async () => {
    if (!doc) return
    setError(null)
    if (!form.vendor.trim()) { setError('Leveranciersnaam is verplicht.'); return }
    const amount_cents = parseEuroToCents(form.amount)
    if (amount_cents <= 0) { setError('Voer een geldig bedrag in.'); return }
    setSaving(true)
    try {
      await zzpApi.documents.createExpense(doc.id, {
        vendor: form.vendor.trim(),
        description: form.description || undefined,
        expense_date: form.expense_date,
        amount_cents,
        vat_rate: form.vat_rate,
        category: form.category,
        notes: form.notes || undefined,
      } as ZZPExpenseCreate & { amount_cents: number })
      toast.success('Uitgave opgeslagen en document gekoppeld.')
      onOpenChange(false)
      onSuccess()
    } catch (e) {
      setError(parseApiError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Maak uitgave</DialogTitle>
          <DialogDescription>
            Vul de gegevens in om een uitgave aan te maken op basis van dit document.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <XCircle size={16} /> {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="vendor">Leverancier *</Label>
            <Input
              id="vendor"
              value={form.vendor}
              onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
              placeholder="Bijv. Albert Heijn"
            />
          </div>
          <div>
            <Label htmlFor="description">Omschrijving</Label>
            <Input
              id="description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optioneel"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="expense_date">Datum *</Label>
              <Input
                id="expense_date"
                type="date"
                value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="amount">Bedrag (€) *</Label>
              <Input
                id="amount"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>BTW %</Label>
              <Select
                value={String(form.vat_rate)}
                onValueChange={v => setForm(f => ({ ...f, vat_rate: Number(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map(r => (
                    <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categorie</Label>
              <Select
                value={form.category}
                onValueChange={v => setForm(f => ({ ...f, category: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Notities</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optioneel"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <SpinnerGap size={16} className="animate-spin mr-2" /> : <CheckCircle size={16} className="mr-2" />}
            Uitgave opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Document detail modal ───────────────────────────────────────────────────

interface DetailModalProps {
  doc: ZZPDocument | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onDeleted: (id: string) => void
  onMarkedProcessed: (id: string) => void
  onMaakUitgave: (doc: ZZPDocument) => void
}

const DetailModal = ({ doc, open, onOpenChange, onDeleted, onMarkedProcessed, onMaakUitgave }: DetailModalProps) => {
  const [deleting, setDeleting] = useState(false)
  const [marking, setMarking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!doc) return null

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await zzpApi.documents.delete(doc.id)
      toast.success('Document verwijderd.')
      onOpenChange(false)
      onDeleted(doc.id)
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleMarkProcessed = async () => {
    setMarking(true)
    try {
      await zzpApi.documents.update(doc.id, { status: 'PROCESSED' })
      toast.success('Document gemarkeerd als verwerkt.')
      onOpenChange(false)
      onMarkedProcessed(doc.id)
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setMarking(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DocIcon mimeType={doc.mime_type} />
              <span className="truncate max-w-xs">{doc.filename}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              <StatusBadge status={doc.status} />
              <TypeBadge docType={doc.doc_type} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <span>Geüpload:</span>
              <span className="font-medium text-foreground">{formatDate(doc.created_at)}</span>
              {doc.supplier && <>
                <span>Leverancier:</span>
                <span className="font-medium text-foreground">{doc.supplier}</span>
              </>}
              {doc.amount_cents != null && <>
                <span>Bedrag:</span>
                <span className="font-medium text-foreground">{formatAmount(doc.amount_cents)}</span>
              </>}
              {doc.vat_rate != null && <>
                <span>BTW %:</span>
                <span className="font-medium text-foreground">{doc.vat_rate}%</span>
              </>}
              {doc.doc_date && <>
                <span>Documentdatum:</span>
                <span className="font-medium text-foreground">{formatDate(doc.doc_date)}</span>
              </>}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              className="sm:mr-auto"
            >
              <Trash size={14} className="mr-1" />
              Verwijderen
            </Button>
            {doc.status !== 'PROCESSED' && (
              <Button variant="outline" size="sm" onClick={handleMarkProcessed} disabled={marking}>
                {marking ? <SpinnerGap size={14} className="animate-spin mr-1" /> : <CheckCircle size={14} className="mr-1" />}
                Markeer als verwerkt
              </Button>
            )}
            {doc.status !== 'PROCESSED' && (
              <Button size="sm" onClick={() => { onOpenChange(false); onMaakUitgave(doc) }}>
                <ArrowRight size={14} className="mr-1" />
                Maak uitgave
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Document verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Document row ─────────────────────────────────────────────────────────────

interface DocRowProps {
  doc: ZZPDocument
  onClick: () => void
}

const DocRow = ({ doc, onClick }: DocRowProps) => (
  <button
    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card hover:bg-accent/40 transition-colors text-left"
    onClick={onClick}
  >
    <div className="flex-shrink-0"><DocIcon mimeType={doc.mime_type} /></div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">{doc.filename}</p>
      <p className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</p>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      <TypeBadge docType={doc.doc_type} />
      <StatusBadge status={doc.status} />
    </div>
  </button>
)

// ─── Main page ────────────────────────────────────────────────────────────────

export const ZZPDocumentInboxPage = () => {
  const [docs, setDocs] = useState<ZZPDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)

  const [selectedDoc, setSelectedDoc] = useState<ZZPDocument | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [convertDoc, setConvertDoc] = useState<ZZPDocument | null>(null)
  const [convertOpen, setConvertOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const all = await zzpApi.documents.list()
      setDocs(all)
    } catch (e) {
      setLoadError(parseApiError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Load on mount
  useEffect(() => { loadDocs() }, [loadDocs])

  const inboxDocs = docs.filter(d => d.status === 'NEW' || d.status === 'REVIEW')
  const processedDocs = docs.filter(d => d.status === 'PROCESSED')
  const failedDocs = docs.filter(d => d.status === 'FAILED')

  const filterBySearch = (list: ZZPDocument[]) =>
    search.trim()
      ? list.filter(d => d.filename.toLowerCase().includes(search.toLowerCase()))
      : list

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const result = await zzpApi.documents.upload(Array.from(files))
      toast.success(`${result.documents.length} document(en) geüpload.`)
      setDocs(prev => [...result.documents, ...prev])
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDocClick = (doc: ZZPDocument) => {
    setSelectedDoc(doc)
    setDetailOpen(true)
  }

  const handleMaakUitgave = (doc: ZZPDocument) => {
    setConvertDoc(doc)
    setConvertOpen(true)
  }

  const handleDeleted = (id: string) => setDocs(prev => prev.filter(d => d.id !== id))

  const handleMarkedProcessed = (id: string) => {
    setDocs(prev => prev.map(d => d.id === id ? { ...d, status: 'PROCESSED' as ZZPDocStatus } : d))
  }

  const handleConvertSuccess = () => {
    if (convertDoc) {
      setDocs(prev => prev.map(d => d.id === convertDoc.id ? { ...d, status: 'PROCESSED' as ZZPDocStatus } : d))
    }
    setConvertDoc(null)
  }

  const renderDocList = (list: ZZPDocument[], emptyText: string) => {
    if (loading) return <LoadingSkeleton />
    if (loadError) return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <WarningCircle size={40} className="text-destructive" weight="duotone" />
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" size="sm" onClick={loadDocs}>
          <ArrowClockwise size={14} className="mr-1" /> Opnieuw proberen
        </Button>
      </div>
    )
    const filtered = filterBySearch(list)
    if (filtered.length === 0) return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
        <FileText size={40} weight="duotone" />
        <p className="text-sm">{emptyText}</p>
      </div>
    )
    return (
      <div className="space-y-2">
        {filtered.map(doc => (
          <DocRow key={doc.id} doc={doc} onClick={() => handleDocClick(doc)} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Documenten</h1>
            <p className="text-sm text-muted-foreground">Upload en verwerk je bonnen en facturen</p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
              multiple
              capture="environment"
              className="hidden"
              onChange={e => handleUpload(e.target.files)}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading
                ? <SpinnerGap size={16} className="animate-spin" />
                : <UploadSimple size={16} />}
              Upload bon/factuur
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Zoek op bestandsnaam..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="inbox">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="inbox" className="flex-1 sm:flex-none">
              Inbox
              {inboxDocs.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">{inboxDocs.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="processed" className="flex-1 sm:flex-none">
              Verwerkt
              {processedDocs.length > 0 && (
                <Badge variant="outline" className="ml-2 text-xs">{processedDocs.length}</Badge>
              )}
            </TabsTrigger>
            {failedDocs.length > 0 && (
              <TabsTrigger value="failed" className="flex-1 sm:flex-none">
                Mislukt
                <Badge variant="destructive" className="ml-2 text-xs">{failedDocs.length}</Badge>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="inbox" className="mt-4">
            {renderDocList(
              inboxDocs,
              'Nog geen documenten. Upload je eerste bon of factuur.'
            )}
          </TabsContent>

          <TabsContent value="processed" className="mt-4">
            {renderDocList(processedDocs, 'Geen verwerkte documenten.')}
          </TabsContent>

          {failedDocs.length > 0 && (
            <TabsContent value="failed" className="mt-4">
              {renderDocList(failedDocs, 'Geen mislukte documenten.')}
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Detail modal */}
      <DetailModal
        doc={selectedDoc}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDeleted={handleDeleted}
        onMarkedProcessed={handleMarkedProcessed}
        onMaakUitgave={handleMaakUitgave}
      />

      {/* Convert-to-expense dialog */}
      <ConvertDialog
        doc={convertDoc}
        open={convertOpen}
        onOpenChange={setConvertOpen}
        onSuccess={handleConvertSuccess}
      />
    </div>
  )
}
