import { InvoiceCorrections } from './InvoiceCorrections'
import { useQuickCreate } from '@/hooks/useQuickCreate'
import { invoiceDecimal, invoicePriceCents, invoiceLineAmounts } from '@/lib/invoiceMoney'
import { saveInvoicePdf } from '@/lib/invoicePdf'
import { InvoicePdfPreview } from './InvoicePdfPreview'
import { useServerPagination } from '@/hooks/useServerPagination'
import { ServerPagination } from './ServerPagination'
/**
 * ZZP Invoices Page
 * 
 * Full CRUD functionality for managing invoices via backend API.
 * Invoices are linked to customers.
 * Includes seller snapshot from Business Profile (stored server-side).
 * 
 * Premium UI with:
 * - Stats mini-cards
 * - Search with debounce
 * - Responsive table/card design
 * - Invoice lines support
 * - Loading/skeleton states
 * - Seller details preview from Business Profile
 */

import { useState, useEffect, useMemo, useCallback, useRef, Component, ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  FileText, 
  Plus, 
  MagnifyingGlass, 
  PencilSimple, 
  TrashSimple,
  Users,
  Warning,
  ArrowRight,
  Clock,
  CheckCircle,
  PaperPlaneTilt,
  Receipt,
  CurrencyEur,
  CalendarBlank,
  NotePencil,
  Hourglass,
  Wallet,
  SpinnerGap,
  XCircle,
  Buildings,
  Info,
  Eye,
  X,
  DotsThreeVertical,
  Printer,
  Envelope,
  Download,
  ShareNetwork,
  CopySimple,
  CurrencyCircleDollar,
  ArrowCounterClockwise,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthContext'
import { navigateTo } from '@/lib/navigation'
import { 
  zzpApi,
  ZZPInvoice,
  ZZPInvoiceCreate,
  ZZPInvoiceLineCreate,
  ZZPCustomer,
  ZZPBusinessProfile,
  MonthlyInvoiceSummary,
  MonthlyInvoicePeriod,
  getApiBaseUrl,
} from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/useDebounce'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useQueryFilters } from '@/hooks/useQueryFilters'
import { filterInvoices, InvoiceFilters } from '@/lib/filtering'
import { ApiHttpError, NetworkError, ServerError, UnauthorizedError } from '@/lib/errors'
import {
  formatAmountEUR,
  formatDate,
  getStatusCodeFromError,
  normalizeListResponse,
  extractDatePart,
} from '@/components/shared/page-formatting'

// Format amount in cents to EUR currency string
// (formatAmountEUR, formatDate, getStatusCodeFromError, normalizeListResponse,
//  extractDatePart are imported from '@/components/shared/page-formatting')

// Invoice status types (matches backend)
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
type InvoiceLoadState = 'idle' | 'loading' | 'success' | 'forbidden' | 'server' | 'network' | 'error'

interface InvoicesRequestTrace {
  endpoint: string
  status: number | null
  ok: boolean
  timestamp: string
}


const defaultInvoiceFilters: InvoiceFilters = {
  q: '',
  status: 'all',
  from: '',
  to: '',
  min: '',
  max: '',
  customer_id: '',
}


// Status badge component
const StatusBadge = ({ status, size = 'default' }: { status: InvoiceStatus; size?: 'default' | 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'text-xs py-0.5 px-1.5' : ''
  const iconSize = size === 'sm' ? 12 : 14
  
  const config: Record<InvoiceStatus, { bg: string; text: string; border: string; icon: React.ReactNode; label: string }> = {
    draft: {
      bg: 'bg-gray-500/20',
      text: 'text-gray-600 dark:text-gray-400',
      border: 'border-gray-500/40',
      icon: <Clock size={iconSize} className="mr-1" weight="fill" />,
      label: t('zzpInvoices.statusDraft'),
    },
    sent: {
      bg: 'bg-blue-500/20',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-500/40',
      icon: <PaperPlaneTilt size={iconSize} className="mr-1" weight="fill" />,
      label: t('zzpInvoices.statusSent'),
    },
    paid: {
      bg: 'bg-green-500/20',
      text: 'text-green-700 dark:text-green-400',
      border: 'border-green-500/40',
      icon: <CheckCircle size={iconSize} className="mr-1" weight="fill" />,
      label: t('zzpInvoices.statusPaid'),
    },
    overdue: {
      bg: 'bg-red-500/20',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-500/40',
      icon: <Warning size={iconSize} className="mr-1" weight="fill" />,
      label: t('zzpInvoices.statusOverdue'),
    },
    cancelled: {
      bg: 'bg-slate-500/20',
      text: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-500/40',
      icon: <XCircle size={iconSize} className="mr-1" weight="fill" />,
      label: t('zzpInvoices.statusCancelled'),
    },
  }

  const { bg, text, border, icon, label } = config[status]

  return (
    <Badge variant="outline" className={`${bg} ${text} ${border} ${sizeClasses}`}>
      {icon}
      {label}
    </Badge>
  )
}

// Stats card component for invoices
const StatsCard = ({ 
  title, 
  value, 
  subtitle,
  icon: Icon, 
  className = '' 
}: { 
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  className?: string 
}) => (
  <Card className={`bg-card/80 backdrop-blur-sm border border-border/50 ${className}`}>
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{title}</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold mt-1 truncate">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>
          )}
        </div>
        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 ml-3">
          <Icon size={20} className="text-primary sm:hidden" weight="duotone" />
          <Icon size={24} className="text-primary hidden sm:block" weight="duotone" />
        </div>
      </div>
    </CardContent>
  </Card>
)

// Loading skeleton for stats
const StatsLoadingSkeleton = () => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
    {[1, 2, 3, 4].map((i) => (
      <Card key={i} className="bg-card/80 backdrop-blur-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-16 sm:w-20" />
              <Skeleton className="h-6 w-20 sm:h-8 sm:w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
)

// Loading skeleton for table
const TableLoadingSkeleton = () => (
  <Card className="bg-card/80 backdrop-blur-sm">
    <CardContent className="p-4 sm:p-6">
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
              <div className="space-y-2 flex-1 min-w-0">
                <Skeleton className="h-4 w-24 sm:w-32" />
                <Skeleton className="h-3 w-32 sm:w-48" />
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <Skeleton className="h-5 w-16 sm:w-20" />
              <Skeleton className="h-6 w-16 sm:w-20" />
              <Skeleton className="h-8 w-8 rounded hidden sm:block" />
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)

// Invoice line item type for form
interface InvoiceLineFormData {
  id?: string
  description: string
  quantity: string
  unitPrice: string
  vatRate: string
}

// Default empty line
const createEmptyLine = (): InvoiceLineFormData => ({
  description: '',
  quantity: '1',
  unitPrice: '',
  vatRate: '21',
})
// Invoice form dialog - now supports invoice lines
export const InvoiceFormDialog = ({
  open,
  onOpenChange,
  invoice,
  customers,
  businessProfile,
  onSave,
  isReadOnly = false,
  preSelectedCustomerId,
  onCorrectionsChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice?: ZZPInvoice
  customers: ZZPCustomer[]
  businessProfile: ZZPBusinessProfile | null
  onSave: (data: ZZPInvoiceCreate, isEdit: boolean, creationKey?: string) => Promise<void>
  isReadOnly?: boolean
  onCorrectionsChanged?: () => Promise<void>
  preSelectedCustomerId?: string | null
}) => {
  const isEdit = !!invoice
  const [customerId, setCustomerId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [initialFormKey, setInitialFormKey] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [actionError, setActionError] = useState('')
  const creationKey = useRef('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<InvoiceLineFormData[]>([createEmptyLine()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [priceSuggestion, setPriceSuggestion] = useState<string | null>(null)
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null)
  
  // Validation errors
  const [customerError, setCustomerError] = useState('')
  const [invoiceNumberError, setInvoiceNumberError] = useState('')
  const [dateError, setDateError] = useState('')
  const [linesError, setLinesError] = useState('')

  // Active customers only
  const activeCustomers = useMemo(() => 
    customers.filter(c => c.status === 'active' || c.id === invoice?.customer_id),
    [customers, invoice?.customer_id]
  )

  const formKey = JSON.stringify({ customerId, invoiceNumber, issueDate, dueDate, deliveryDate, notes, lines })
  const dirty = open && !isReadOnly && !!initialFormKey && formKey !== initialFormKey
  const requestOpenChange = (next: boolean) => {
    if (isSubmitting || isPreviewing) return
    if (!next && dirty) setConfirmClose(true)
    else onOpenChange(next)
  }
  useEffect(() => {
    if (!dirty) return
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [dirty])
  useEffect(() => {
    if (!open) { setPreview(null); return }
    const next = {
      customerId: invoice?.customer_id || preSelectedCustomerId || '',
      invoiceNumber: invoice?.invoice_number || '',
      issueDate: extractDatePart(invoice?.issue_date) || new Date().toLocaleDateString('sv-SE'),
      dueDate: extractDatePart(invoice?.due_date || undefined),
      deliveryDate: extractDatePart(invoice?.delivery_date || undefined),
      notes: invoice?.notes || '',
      lines: invoice?.lines?.length ? invoice.lines.map(line => ({ id: line.id, description: line.description,
        quantity: String(line.quantity), unitPrice: (line.unit_price_cents / 100).toFixed(2).replace('.', ','), vatRate: String(line.vat_rate) })) : [createEmptyLine()],
    }
    setCustomerId(next.customerId); setInvoiceNumber(next.invoiceNumber); setIssueDate(next.issueDate)
    setDueDate(next.dueDate); setDeliveryDate(next.deliveryDate); setNotes(next.notes); setLines(next.lines)
    setInitialFormKey(JSON.stringify(next)); creationKey.current = crypto.randomUUID()
    setCustomerSearch(''); setConfirmClose(false); setActionError(''); setPreview(null)
    setCustomerError(''); setInvoiceNumberError(''); setDateError(''); setLinesError(''); setIsSubmitting(false)
  }, [open, invoice, preSelectedCustomerId])

  // Fetch price suggestion when customer changes (for new invoices or when editing)
  // Note: We intentionally don't include 'lines' in dependencies to avoid infinite loop
  // since we update lines inside this effect. The first line's description is read
  // at the time the effect runs, which is sufficient for the suggestion logic.
  useEffect(() => {
    let cancelled = false
    const fetchPriceSuggestion = async () => {
      if (!customerId || !open) {
        setPriceSuggestion(null)
        setSuggestionMessage(null)
        return
      }
      
      try {
        // Get the first line's description if available
        const firstLineDescription = lines[0]?.description?.trim() || undefined
        const suggestion = await zzpApi.invoices.suggestPrice(customerId, firstLineDescription)
        
        if (cancelled) return
        if (suggestion.suggested_price_euros !== null) {
          // Format price as Euro string with comma decimal separator
          const formattedPrice = suggestion.suggested_price_euros.toFixed(2).replace('.', ',')
          setPriceSuggestion(formattedPrice)
          setSuggestionMessage(suggestion.message)
          
        } else {
          setPriceSuggestion(null)
          setSuggestionMessage(suggestion.message)
        }
      } catch (error) {
        console.error('Failed to fetch price suggestion:', error)
        setPriceSuggestion(null)
        setSuggestionMessage(null)
      }
    }
    
    void fetchPriceSuggestion()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, open, isReadOnly])

  // Add new line
  const addLine = () => {
    setLines([...lines, createEmptyLine()])
  }

  // Remove line
  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index))
    }
  }

  // Update line
  const updateLine = (index: number, field: keyof InvoiceLineFormData, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }
    setLines(newLines)
    setLinesError('')
  }

  // Calculate line total (for display)
  const calculateLineTotal = (line: InvoiceLineFormData): number => {
    return invoiceLineAmounts(line.quantity, line.unitPrice, line.vatRate).net
  }

  // Calculate totals (for display)
  const calculatedTotals = useMemo(() => {
    let subtotal = 0
    let vatTotal = 0
    lines.forEach(line => {
      const lineTotalCents = calculateLineTotal(line)
      const vatAmount = invoiceLineAmounts(line.quantity, line.unitPrice, line.vatRate).vat
      subtotal += lineTotalCents
      vatTotal += vatAmount
    })
    return {
      subtotal,
      vatTotal,
      total: subtotal + vatTotal,
    }
  }, [lines])

  // Validate and convert lines to API format
  const validateAndConvertLines = (): ZZPInvoiceLineCreate[] | null => {
    const validLines: ZZPInvoiceLineCreate[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.description.trim()) {
        setLinesError(t('zzpInvoices.lineDescriptionRequired'))
        return null
      }
      const qty = invoiceDecimal(line.quantity)?.toNumber() ?? NaN
      if (!Number.isFinite(qty) || qty <= 0 || qty > 99999999.99) {
        setLinesError(t('zzpInvoices.lineQuantityRequired'))
        return null
      }
      const unitPriceCents = invoicePriceCents(line.unitPrice)
      if (unitPriceCents === null || unitPriceCents <= 0) {
        setLinesError(t('zzpInvoices.lineUnitPriceRequired'))
        return null
      }
      const vatRate = parseFloat(line.vatRate)
      if (![0, 9, 21].includes(vatRate)) {
        setLinesError(t('zzpInvoices.lineVatRateRequired'))
        return null
      }
      validLines.push({
        description: line.description.trim(),
        quantity: qty,
        unit_price_cents: unitPriceCents,
        vat_rate: vatRate,
      })
    }
    
    return validLines
  }

  const handleSave = async () => {
    let hasError = false

    // Validate customer (required for both new and edit invoices)
    if (!customerId) {
      setCustomerError(t('zzpInvoices.formCustomerRequired'))
      hasError = true
    }

    // Validate invoice number (required when editing)
    if (isEdit && !invoiceNumber.trim()) {
      setInvoiceNumberError(t('zzpInvoices.formInvoiceNumberRequired'))
      hasError = true
    } else if (isEdit && invoiceNumber.trim().length > 50) {
      setInvoiceNumberError(t('zzpInvoices.formInvoiceNumberTooLong'))
      hasError = true
    }

    // Validate date
    if (!issueDate) {
      setDateError(t('zzpInvoices.formDateRequired'))
      hasError = true
    }

    if (dueDate && issueDate && dueDate < issueDate) { setDateError('Vervaldatum mag niet vóór de factuurdatum liggen.'); hasError = true }

    // Validate lines
    const validLines = validateAndConvertLines()
    if (!validLines) {
      hasError = true
    }

    if (hasError || !validLines) {
      toast.error(t('zzpInvoices.formValidationError'))
      return
    }

    setActionError('')
    setIsSubmitting(true)

    try {
      const invoiceData: ZZPInvoiceCreate = {
        customer_id: customerId, // Use the selected customer for both new and edit
        issue_date: issueDate, // Already in YYYY-MM-DD format from input
        due_date: dueDate || null,
        delivery_date: deliveryDate || null, // Already in YYYY-MM-DD format from input
        notes: notes.trim() || null,
        lines: validLines,
        ...(isEdit && { invoice_number: invoiceNumber.trim() }),
      }
      await onSave(invoiceData, isEdit, creationKey.current)
    } catch (err) {
      // Error toast is handled by the parent onSave callback
      setActionError(parseApiError(err))
      console.error('Failed to save invoice:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePreview = async () => {
    setActionError('')
    if (isReadOnly && invoice) {
      setIsPreviewing(true)
      try { setPreview(await zzpApi.invoices.downloadPdf(invoice.id)) }
      catch(error) { setActionError(parseApiError(error)) }
      finally { setIsPreviewing(false) }
      return
    }
    const valid = validateAndConvertLines()
    if (!customerId || !issueDate || !valid || (dueDate && dueDate < issueDate)) {
      setActionError('Controleer klant, datum en regels voordat je het voorbeeld opent. Gebruik maximaal twee decimalen voor aantal en tarief.')
      return
    }
    setIsPreviewing(true)
    try { setPreview(await zzpApi.invoices.preview({ customer_id: customerId, invoice_number: invoiceNumber || undefined, issue_date: issueDate,
      due_date: dueDate || null, delivery_date: deliveryDate || null, notes: notes.trim() || null, lines: valid })) }
    catch(error) { setActionError(parseApiError(error)) }
    finally { setIsPreviewing(false) }
  }

  const handleDownloadSaved = async () => {
    if (!invoice) return
    setActionError(''); setIsPreviewing(true)
    try {
      saveInvoicePdf(await zzpApi.invoices.downloadPdf(invoice.id), invoice.invoice_number)
      toast.success('PDF-bestand gereed. Kies waar je het wilt bewaren.')
    } catch(error) { setActionError(parseApiError(error)) }
    finally { setIsPreviewing(false) }
  }

  const hasValidLines = lines.some(line => 
    line.description.trim() && 
    (invoiceDecimal(line.quantity)?.toNumber() ?? 0) > 0 &&
    (invoicePriceCents(line.unitPrice) ?? 0) > 0
  )

  const isFormValid = (isEdit || customerId) && issueDate && hasValidLines

  // For non-draft invoices, form is read-only
  const formDisabled = isSubmitting || isPreviewing || isReadOnly

  return (
    <>
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="flex max-h-[94dvh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              {isReadOnly ? (
                <Eye size={24} className="text-primary" weight="duotone" />
              ) : (
                <Receipt size={24} className="text-primary" weight="duotone" />
              )}
            </div>
            {isReadOnly 
              ? t('zzpInvoices.viewInvoice')
              : isEdit 
                ? t('zzpInvoices.editInvoice') 
                : t('zzpInvoices.newInvoice')}
            {invoice && (
              <span className="font-mono text-sm text-muted-foreground">
                {invoice.invoice_number}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isReadOnly
              ? t('zzpInvoices.viewInvoiceDescription')
              : isEdit 
                ? t('zzpInvoices.editInvoiceDescription')
                : t('zzpInvoices.newInvoiceDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto py-4 space-y-5">
          {/* Customer section - Always show selector, but with info if editing */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Users size={14} className="text-muted-foreground" />
              {t('zzpInvoices.formCustomer')} <span className="text-destructive">*</span>
            </Label>
            {!isReadOnly && <Input aria-label="Zoek klant" placeholder="Zoek klant op naam of e-mail" value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} disabled={formDisabled} />}
            <Select value={customerId} onValueChange={(value) => {
              setCustomerId(value)
              setCustomerError('')
            }} disabled={formDisabled}>
              <SelectTrigger className={`h-11 ${customerError ? 'border-destructive focus-visible:ring-destructive' : ''}`}>
                <SelectValue placeholder={t('zzpInvoices.formCustomerPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {activeCustomers.length === 0 ? (
                  <div className="p-3 text-center text-sm text-muted-foreground">
                    {t('zzpInvoices.noActiveCustomers')}
                  </div>
                ) : (
                  activeCustomers.filter(customer => customer.id === customerId || `${customer.name} ${customer.email || ''}`.toLowerCase().includes(customerSearch.toLowerCase())).map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-muted-foreground" />
                        {customer.name}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {customerError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle size={14} />
                {customerError}
              </p>
            )}
            {isEdit && invoice && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info size={12} />
                Je kunt de klant wijzigen indien nodig
              </p>
            )}
            {suggestionMessage && priceSuggestion && (
              <p className="text-xs text-primary flex items-center gap-1">
                <CurrencyCircleDollar size={12} />
                {suggestionMessage}: €{priceSuggestion}
                {!isReadOnly && <Button type="button" variant="outline" size="sm" onClick={() => setLines(current => current.map((line, index) => index === 0 ? { ...line, unitPrice: priceSuggestion } : line))}>Tarief toepassen</Button>}
              </p>
            )}
          </div>

          {/* Invoice Number field - only shown when editing */}
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="invoice-number" className="text-sm font-medium flex items-center gap-2">
                <FileText size={14} className="text-muted-foreground" />
                {t('zzpInvoices.formInvoiceNumber')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invoice-number"
                type="text"
                value={invoiceNumber}
                onChange={(e) => {
                  setInvoiceNumber(e.target.value)
                  setInvoiceNumberError('')
                }}
                placeholder={t('zzpInvoices.formInvoiceNumberPlaceholder')}
                className={`h-11 font-mono ${invoiceNumberError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={formDisabled}
              />
              {invoiceNumberError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle size={14} />
                  {invoiceNumberError}
                </p>
              )}
            </div>
          )}

          {/* Date fields - two columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-date" className="text-sm font-medium flex items-center gap-2">
                <CalendarBlank size={14} className="text-muted-foreground" />
                {t('zzpInvoices.formDate')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invoice-date"
                type="date"
                value={issueDate}
                onChange={(e) => {
                  setIssueDate(e.target.value)
                  setDateError('')
                }}
                className={`h-11 ${dateError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={formDisabled}
              />
              {dateError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle size={14} />
                  {dateError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-due-date" className="text-sm font-medium flex items-center gap-2">
                <Hourglass size={14} className="text-muted-foreground" />
                {t('zzpInvoices.formDueDate')}
              </Label>
              <Input
                id="invoice-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-11"
                disabled={formDisabled}
              />
            </div>
          </div>

          <div className="space-y-2"><Label htmlFor="invoice-delivery-date">Leverdatum / datum dienstverlening</Label><Input id="invoice-delivery-date" type="date" value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)} disabled={formDisabled}/><p className="text-xs text-muted-foreground">Vul de werkelijke leverdatum in. Alle regeltarieven zijn exclusief BTW; maximaal twee decimalen voor aantal en tarief.</p></div>

          {/* Invoice Lines Section */}
          <div className="space-y-3">
            <Separator />
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Receipt size={14} className="text-muted-foreground" />
                {t('zzpInvoices.invoiceLines')} <span className="text-destructive">*</span>
              </Label>
              {!isReadOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLine}
                  disabled={formDisabled}
                  className="h-8 gap-1"
                >
                  <Plus size={14} />
                  {t('zzpInvoices.addLine')}
                </Button>
              )}
            </div>

            {/* Lines table header (desktop) */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
              <div className="col-span-5">{t('zzpInvoices.lineDescription')}</div>
              <div className="col-span-2 text-right">{t('zzpInvoices.lineQuantity')}</div>
              <div className="col-span-2 text-right">{t('zzpInvoices.lineUnitPrice')}</div>
              <div className="col-span-1 text-right">{t('zzpInvoices.lineVat')}</div>
              <div className="col-span-2 text-right">{t('zzpInvoices.lineTotal')}</div>
            </div>

            {/* Lines */}
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="relative group">
                  {/* Desktop layout */}
                  <div className="hidden sm:grid sm:grid-cols-12 gap-2 items-start">
                    <div className="col-span-5">
                      <Input
                        placeholder={t('zzpInvoices.lineDescriptionPlaceholder')}
                        value={line.description}
                        onChange={(e) => updateLine(index, 'description', e.target.value)}
                        disabled={formDisabled}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="1"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, 'quantity', e.target.value.replace(/[^0-9,.]/g, ''))}
                        disabled={formDisabled}
                        className="h-9 text-right"
                      />
                    </div>
                    <div className="col-span-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(index, 'unitPrice', e.target.value.replace(/[^0-9,.]/g, ''))}
                          disabled={formDisabled}
                          className="h-9 pl-6 text-right"
                        />
                      </div>
                    </div>
                    <div className="col-span-1">
                      <Select 
                        value={line.vatRate} 
                        onValueChange={(value) => updateLine(index, 'vatRate', value)}
                        disabled={formDisabled}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0%</SelectItem>
                          <SelectItem value="9">9%</SelectItem>
                          <SelectItem value="21">21%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      <span className="text-sm font-medium">
                        {formatAmountEUR(calculateLineTotal(line))}
                      </span>
                      {!isReadOnly && lines.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(index)}
                          disabled={formDisabled}
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                        >
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Mobile layout */}
                  <div className="sm:hidden space-y-2 p-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('zzpInvoices.line')} {index + 1}
                      </span>
                      {!isReadOnly && lines.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(index)}
                          disabled={formDisabled}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <X size={12} />
                        </Button>
                      )}
                    </div>
                    <Input
                      placeholder={t('zzpInvoices.lineDescriptionPlaceholder')}
                      value={line.description}
                      onChange={(e) => updateLine(index, 'description', e.target.value)}
                      disabled={formDisabled}
                      className="h-9"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('zzpInvoices.lineQuantity')}</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(e) => updateLine(index, 'quantity', e.target.value.replace(/[^0-9,.]/g, ''))}
                          disabled={formDisabled}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('zzpInvoices.lineUnitPrice')}</Label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">€</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(index, 'unitPrice', e.target.value.replace(/[^0-9,.]/g, ''))}
                            disabled={formDisabled}
                            className="h-9 pl-5"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('zzpInvoices.lineVat')}</Label>
                        <Select 
                          value={line.vatRate} 
                          onValueChange={(value) => updateLine(index, 'vatRate', value)}
                          disabled={formDisabled}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0%</SelectItem>
                            <SelectItem value="9">9%</SelectItem>
                            <SelectItem value="21">21%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="text-right text-sm font-medium">
                      {t('zzpInvoices.lineTotal')}: {formatAmountEUR(calculateLineTotal(line))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {linesError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle size={14} />
                {linesError}
              </p>
            )}

            {/* Totals */}
            <div className="pt-3 border-t border-border/50 space-y-2">
              {(() => {
                // Use server-calculated totals for read-only view, otherwise use local calculation
                const displayTotals = isReadOnly && invoice
                  ? { subtotal: invoice.subtotal_cents, vatTotal: invoice.vat_total_cents, total: invoice.total_cents }
                  : calculatedTotals
                return (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('zzpInvoices.subtotal')}</span>
                      <span>{formatAmountEUR(displayTotals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('zzpInvoices.vatTotal')}</span>
                      <span>{formatAmountEUR(displayTotals.vatTotal)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold pt-2 border-t border-border/50">
                      <span>{t('zzpInvoices.total')}</span>
                      <span>{formatAmountEUR(displayTotals.total)}</span>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          {isReadOnly && !invoice?.seller_company_name && !invoice?.seller_trading_name && <Alert><AlertDescription>Bedrijfsgegevens ontbreken in deze factuur. Werk het bedrijfsprofiel en vervolgens de conceptfactuur bij voordat je deze verstuurt.</AlertDescription></Alert>}
          {/* Seller Details Preview */}
          {(isReadOnly && invoice?.seller_company_name) ? (
            <div className="space-y-3">
              <Separator />
              <Label className="text-sm font-medium flex items-center gap-2">
                <Buildings size={14} className="text-muted-foreground" />
                {t('zzpInvoices.sellerDetails')}
              </Label>
              <div className="bg-secondary/30 rounded-lg p-4 space-y-2 text-sm">
                <p className="font-semibold">{invoice.seller_company_name}</p>
                {invoice.seller_address_street && (
                  <p className="text-muted-foreground">{invoice.seller_address_street}</p>
                )}
                {(invoice.seller_address_postal_code || invoice.seller_address_city) && (
                  <p className="text-muted-foreground">
                    {[invoice.seller_address_postal_code, invoice.seller_address_city].filter(Boolean).join(' ')}
                  </p>
                )}
                {invoice.seller_kvk_number && (
                  <p className="text-muted-foreground">KVK: {invoice.seller_kvk_number}</p>
                )}
                {invoice.seller_btw_number && (
                  <p className="text-muted-foreground">BTW: {invoice.seller_btw_number}</p>
                )}
                {invoice.seller_iban && (
                  <p className="text-muted-foreground">IBAN: {invoice.seller_iban}</p>
                )}
              </div>
            </div>
          ) : !isEdit && businessProfile && (
            <div className="space-y-3">
              <Separator />
              <Label className="text-sm font-medium flex items-center gap-2">
                <Buildings size={14} className="text-muted-foreground" />
                {t('zzpInvoices.sellerDetails')}
              </Label>
              <div className="bg-secondary/30 rounded-lg p-4 space-y-2 text-sm">
                <p className="font-semibold">{businessProfile.company_name}</p>
                {businessProfile.address_street && (
                  <p className="text-muted-foreground">{businessProfile.address_street}</p>
                )}
                {(businessProfile.address_postal_code || businessProfile.address_city) && (
                  <p className="text-muted-foreground">
                    {[businessProfile.address_postal_code, businessProfile.address_city].filter(Boolean).join(' ')}
                  </p>
                )}
                {businessProfile.kvk_number && (
                  <p className="text-muted-foreground">KVK: {businessProfile.kvk_number}</p>
                )}
                {businessProfile.btw_number && (
                  <p className="text-muted-foreground">BTW: {businessProfile.btw_number}</p>
                )}
                {businessProfile.iban && (
                  <p className="text-muted-foreground">IBAN: {businessProfile.iban}</p>
                )}
              </div>
            </div>
          )}

          {!isEdit && !businessProfile && (
            <div className="space-y-3">
              <Separator />
              <Alert>
                <Info size={16} />
                <AlertDescription>
                  {t('zzpInvoices.noBusinessProfile')}
                </AlertDescription>
              </Alert>
            </div>
          )}

          {isReadOnly && invoice && ['sent', 'paid', 'overdue'].includes(invoice.status) && <InvoiceCorrections key={invoice.id} invoiceId={invoice.id} onChanged={onCorrectionsChanged} />}

          {/* Notes field */}
          <div className="space-y-2">
            <Label htmlFor="invoice-notes" className="text-sm font-medium flex items-center gap-2">
              <NotePencil size={14} className="text-muted-foreground" />
              {t('zzpInvoices.formNotes')}
            </Label>
            <Textarea
              id="invoice-notes"
              placeholder={t('zzpInvoices.formNotesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
              disabled={formDisabled}
            />
          </div>
        </div>

        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
        <DialogFooter className="shrink-0 pt-4 border-t border-border/50 gap-2 sm:gap-0">
          <Button 
            variant="outline" 
            onClick={() => requestOpenChange(false)}
            disabled={isSubmitting}
            className="h-11"
          >
            {isReadOnly ? t('common.close') : t('common.cancel')}
          </Button>
          {isReadOnly && <Button onClick={handleDownloadSaved} disabled={isSubmitting || isPreviewing}>PDF downloaden</Button>}
          <Button variant="outline" onClick={handlePreview} disabled={isSubmitting || isPreviewing}>{isPreviewing ? 'PDF laden...' : 'Voorbeeld PDF'}</Button>
          {!isReadOnly && (
            <Button
              onClick={handleSave}
              disabled={isSubmitting || isPreviewing || !isFormValid}
              className="h-11 min-w-[140px]"
            >
              {isSubmitting ? (
                <>
                  <SpinnerGap size={18} className="mr-2 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <CheckCircle size={18} className="mr-2" weight="fill" />
                  {t('zzpInvoices.saveInvoice')}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Wijzigingen niet opgeslagen</AlertDialogTitle><AlertDialogDescription>Je wijzigingen gaan verloren als je deze factuur sluit.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Verder bewerken</AlertDialogCancel><AlertDialogAction onClick={() => { setConfirmClose(false); onOpenChange(false) }}>Wijzigingen verwerpen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <InvoicePdfPreview pdf={preview} title={invoiceNumber || 'concept'} onClose={() => setPreview(null)} />
    </>
  )
}

// Delete confirmation dialog
const DeleteConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  invoiceNumber,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  invoiceNumber: string
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('zzpInvoices.deleteInvoice')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('zzpInvoices.deleteInvoiceConfirm')}
            <br />
            <span className="font-medium">{invoiceNumber}</span>
            <br /><br />
            {t('zzpInvoices.deleteInvoiceWarning')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// No customers warning component
const NoCustomersWarning = () => (
  <Card className="border-amber-500/50 bg-amber-500/10 backdrop-blur-sm">
    <CardContent className="flex flex-col sm:flex-row items-center gap-4 py-6 px-4 sm:px-6">
      <div className="h-14 w-14 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
        <Warning size={28} className="text-amber-500" weight="duotone" />
      </div>
      <div className="flex-1 text-center sm:text-left">
        <h3 className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
          {t('zzpInvoices.noCustomersWarning')}
        </h3>
        <p className="text-sm text-amber-600 dark:text-amber-300">
          {t('zzpInvoices.noCustomersWarningDescription')}
        </p>
      </div>
      <Button onClick={() => navigateTo('/zzp/customers')} className="gap-2 w-full sm:w-auto">
        <Users size={18} />
        {t('zzpInvoices.goToCustomers')}
        <ArrowRight size={18} />
      </Button>
    </CardContent>
  </Card>
)

// Empty state component
const EmptyState = ({ onAddInvoice, hasCustomers }: { onAddInvoice: () => void; hasCustomers: boolean }) => (
  <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
    <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Receipt size={40} weight="duotone" className="text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('zzpInvoices.noInvoices')}</h3>
      <p className="text-muted-foreground mb-8 max-w-md">
        {t('zzpInvoices.noInvoicesDescription')}
      </p>
      <Button onClick={onAddInvoice} size="lg" className="gap-2 h-12 px-6" disabled={!hasCustomers}>
        <Plus size={20} weight="bold" />
        {t('zzpInvoices.addFirstInvoice')}
      </Button>
    </CardContent>
  </Card>
)

// Mobile invoice card component
const InvoiceCard = ({ 
  invoice, 
  onView,
  onEdit, 
  onDelete,
  onRestore,
  onStatusChange,
  onSendInvoice,
  onDownloadPdf,
  onCopyLink,
  onShare,
  onMarkPaid,
  onMarkUnpaid,
  canEdit,
  isDownloading,
  isUpdatingStatus,
}: { 
  invoice: ZZPInvoice
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onRestore: () => void
  onStatusChange: (newStatus: 'sent' | 'paid' | 'cancelled') => void
  onSendInvoice: () => void
  onDownloadPdf: () => void
  onCopyLink: () => void
  onShare: () => void
  onMarkPaid: () => void
  onMarkUnpaid: () => void
  canEdit: boolean
  isDownloading: boolean
  isUpdatingStatus: boolean
}) => (
  <Card className="bg-card/80 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-colors">
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FileText size={20} className="text-primary" weight="duotone" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-mono text-sm font-semibold truncate">{invoice.invoice_number}</h4>
            <p className="text-sm text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
              <Users size={12} />
              {invoice.customer_name || t('zzpInvoices.unknownCustomer')}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-lg">{formatAmountEUR(invoice.total_cents)}</p>
          <p className="text-xs text-muted-foreground">{formatDate(invoice.issue_date)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
        {invoice.status === 'draft' || invoice.status === 'cancelled' ? (
          <StatusBadge status={invoice.status} size="sm" />
        ) : (
          <Select
            value={invoice.status}
            onValueChange={(value) => onStatusChange(value as 'sent' | 'paid' | 'cancelled')}
            disabled={isUpdatingStatus}
          >
            {/*
              Mobile: compact pill (status badge + chevron only) so the actions stay
              visible. The dashed primary border + tinted background still signal
              that this control is interactive. From sm: up the explicit
              "Status wijzigen" label is shown for extra discoverability on larger
              screens where there is room.
            */}
            <SelectTrigger
              aria-label={t('zzpInvoices.changeStatus')}
              title={t('zzpInvoices.changeStatus')}
              className="group flex items-center gap-1.5 sm:gap-2 h-11 sm:h-9 w-auto pl-1.5 pr-1.5 sm:pr-2.5 rounded-full border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/40 transition-all shadow-sm [&>svg:last-child]:opacity-100 [&>svg:last-child]:text-primary"
            >
              <StatusBadge status={invoice.status} size="sm" />
              <span className="hidden sm:inline text-xs font-semibold text-primary whitespace-nowrap">
                {t('zzpInvoices.changeStatus')}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sent">{t('zzpInvoices.statusSent')}</SelectItem>
              <SelectItem value="paid">{t('zzpInvoices.statusPaid')}</SelectItem>
              <SelectItem value="cancelled">{t('zzpInvoices.statusCancelled')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-1 sm:gap-2 flex-shrink-0">
          {/*
            Edit/View: icon-only on mobile (square 36px touch target), icon + label
            from sm: up. This guarantees the dropdown trigger to its right always
            stays visible even when the status pill is shown.
          */}
          <Button
            variant="ghost"
            size="sm"
            onClick={canEdit ? onEdit : onView}
            aria-label={canEdit ? t('common.edit') : t('common.view')}
            title={canEdit ? t('common.edit') : t('common.view')}
            className="h-9 w-9 sm:w-auto p-0 sm:px-3 sm:gap-2"
          >
            {canEdit ? <PencilSimple size={16} /> : <Eye size={16} />}
            <span className="hidden sm:inline">{canEdit ? t('common.edit') : t('common.view')}</span>
          </Button>
          {(invoice.status === 'draft' || invoice.status === 'cancelled') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-9 px-3 gap-2 text-destructive hover:text-destructive"
            >
              <TrashSimple size={16} />
            </Button>
          )}
          {/* More actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                <DotsThreeVertical size={16} />
                <span className="sr-only">{t('zzpInvoices.moreActions')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(event) => {
                event.stopPropagation()
                onDownloadPdf()
              }} disabled={isDownloading}>
                {isDownloading ? (
                  <SpinnerGap size={16} className="mr-2 animate-spin" />
                ) : (
                  <Download size={16} className="mr-2" />
                )}
                {t('zzpInvoices.downloadPdf')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(event) => {
                event.stopPropagation()
                onCopyLink()
              }}>
                <CopySimple size={16} className="mr-2" />
                {t('zzpInvoices.copyInvoiceLink')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(event) => {
                event.stopPropagation()
                onShare()
              }}>
                <ShareNetwork size={16} className="mr-2" />
                {t('zzpInvoices.share')}
              </DropdownMenuItem>
              
              {/* Status actions separator */}
              <DropdownMenuSeparator />
              
              {/* Send invoice - only for draft invoices */}
              {invoice.status === 'draft' && (
                <DropdownMenuItem onClick={(event) => {
                  event.stopPropagation()
                  onSendInvoice()
                }} disabled={isUpdatingStatus}>
                  {isUpdatingStatus ? (
                    <SpinnerGap size={16} className="mr-2 animate-spin" />
                  ) : (
                    <PaperPlaneTilt size={16} className="mr-2" />
                  )}
                  {t('zzpInvoices.sendInvoice')}
                </DropdownMenuItem>
              )}

              {/* Cancel invoice - for draft invoices (backend supports draft → cancelled) */}
              {invoice.status === 'draft' && (
                <DropdownMenuItem onClick={(event) => {
                  event.stopPropagation()
                  onStatusChange('cancelled')
                }} disabled={isUpdatingStatus} className="text-destructive focus:text-destructive">
                  {isUpdatingStatus ? (
                    <SpinnerGap size={16} className="mr-2 animate-spin" />
                  ) : (
                    <XCircle size={16} className="mr-2" />
                  )}
                  {t('zzpInvoices.statusCancelled')}
                </DropdownMenuItem>
              )}
              
              {/* Mark as Paid / Unpaid - only for non-draft, non-cancelled invoices */}
              {invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
                <>
                  {invoice.status === 'paid' ? (
                    <DropdownMenuItem onClick={(event) => {
                      event.stopPropagation()
                      onMarkUnpaid()
                    }} disabled={isUpdatingStatus || !!invoice.credited_cents}>
                      {isUpdatingStatus ? (
                        <SpinnerGap size={16} className="mr-2 animate-spin" />
                      ) : (
                        <XCircle size={16} className="mr-2" />
                      )}
                      {t('zzpInvoices.markUnpaid')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={(event) => {
                      event.stopPropagation()
                      onMarkPaid()
                    }} disabled={isUpdatingStatus || (invoice.outstanding_cents !== undefined && invoice.outstanding_cents <= 0)}>
                      {isUpdatingStatus ? (
                        <SpinnerGap size={16} className="mr-2 animate-spin" />
                      ) : (
                        <CheckCircle size={16} className="mr-2" />
                      )}
                      {t('zzpInvoices.markPaid')}
                    </DropdownMenuItem>
                  )}
                </>
              )}

              {/* Cancelled invoice actions */}
              {invoice.status === 'cancelled' && (
                <DropdownMenuItem onClick={(event) => {
                  event.stopPropagation()
                  onRestore()
                }} disabled={isUpdatingStatus}>
                  {isUpdatingStatus ? (
                    <SpinnerGap size={16} className="mr-2 animate-spin" />
                  ) : (
                    <ArrowCounterClockwise size={16} className="mr-2" />
                  )}
                  {t('zzpInvoices.restoreToConcept')}
                </DropdownMenuItem>
              )}
              
              {/* Delete - for draft and cancelled invoices */}
              {(invoice.status === 'draft' || invoice.status === 'cancelled') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={(event) => {
                      event.stopPropagation()
                      onDelete()
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <TrashSimple size={16} className="mr-2" />
                    {t('common.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </CardContent>
  </Card>
)

// Inline error boundary for the invoices page — shows a contained error card
// instead of letting errors bubble up to the global DashboardErrorBoundary.
class InvoicesErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error('[ZZPInvoicesPage] Unhandled render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <Card className="bg-card/80 backdrop-blur-sm border-destructive/30">
              <CardHeader>
                <CardTitle>Facturen tijdelijk niet beschikbaar</CardTitle>
                <CardDescription>
                  Er is een onverwachte fout opgetreden bij het laden van de facturen.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => window.location.reload()} variant="outline">
                  Opnieuw proberen
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export const ZZPInvoicesPage = () => {
  return (
    <InvoicesErrorBoundary>
      <ZZPInvoicesPageContent />
    </InvoicesErrorBoundary>
  )
}

const ZZPInvoicesPageContent = () => {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<ZZPInvoice[]>([])
  const [customers, setCustomers] = useState<ZZPCustomer[]>([])
  const [businessProfile, setBusinessProfile] = useState<ZZPBusinessProfile | null>(null)
  const { filters, setFilter, reset } = useQueryFilters(defaultInvoiceFilters)
  const [searchQuery, setSearchQuery] = useState(filters.q)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<InvoiceLoadState>('idle')
  const [requestTraces, setRequestTraces] = useState<InvoicesRequestTrace[]>([])
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null)
  
  const showLoading = useDelayedLoading(isLoading, 300, invoices.length > 0)
  
  // Pre-selected customer ID from URL (for CTA from customers page)
  const [preSelectedCustomerId, setPreSelectedCustomerId] = useState<string | null>(null)
  // Customer ID to pass to dialog (keeps value until dialog closes)
  const [dialogCustomerId, setDialogCustomerId] = useState<string | null>(null)
  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchQuery, 300)

  useEffect(() => {
    setSearchQuery(filters.q)
  }, [filters.q])

  useEffect(() => {
    if (debouncedSearch !== filters.q) {
      setFilter('q', debouncedSearch)
    }
  }, [debouncedSearch, filters.q, setFilter])
  
  const pagination = useServerPagination(JSON.stringify([user?.id, filters]))
  const [serverStats, setServerStats] = useState<Awaited<ReturnType<typeof zzpApi.invoices.list>>['stats']>()
  const listOptions = useMemo(() => ({ limit: pagination.pageSize, offset: pagination.offset,
    status: filters.status === 'all' ? undefined : filters.status, customer_id: filters.customer_id || undefined,
    q: filters.q || undefined,
    from_date: (filters.from && filters.to ? [filters.from,filters.to].sort()[0] : filters.from) || undefined,
    to_date: (filters.from && filters.to ? [filters.from,filters.to].sort()[1] : filters.to) || undefined,
    min_cents: filters.min && Number.isFinite(Number(filters.min.replace(',', '.'))) ? Math.round(Number(filters.min.replace(',', '.')) * 100) : undefined,
    max_cents: filters.max && Number.isFinite(Number(filters.max.replace(',', '.'))) ? Math.round(Number(filters.max.replace(',', '.')) * 100) : undefined,
  }), [pagination.pageSize, pagination.offset, filters.status, filters.customer_id, filters.q, filters.from, filters.to, filters.min, filters.max])

  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<ZZPInvoice | undefined>()
  const [viewingInvoice, setViewingInvoice] = useState<ZZPInvoice | undefined>()
  const [deletingInvoice, setDeletingInvoice] = useState<ZZPInvoice | undefined>()
  
  // PDF download state - tracks which invoice is currently downloading
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null)
  
  // Status change state - tracks which invoice is updating status
  const [updatingStatusInvoiceId, setUpdatingStatusInvoiceId] = useState<string | null>(null)
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false)
  
  // Pre-selected invoice ID from URL
  const [preSelectedInvoiceId, setPreSelectedInvoiceId] = useState<string | null>(null)
  const debugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1'
  const administrationId = typeof window !== 'undefined' ? localStorage.getItem('administration_id') : null

  // Monthly invoice overview state
  const [monthlyPeriod, setMonthlyPeriod] = useState<MonthlyInvoicePeriod>('last_6_months')
  const [monthlyData, setMonthlyData] = useState<MonthlyInvoiceSummary[]>([])
  const [isLoadingMonthly, setIsLoadingMonthly] = useState(false)
  const [monthlyRefreshKey, setMonthlyRefreshKey] = useState(0)

  // Fetch monthly invoice summary
  const loadMonthlyData = useCallback(async (period: MonthlyInvoicePeriod) => {
    setIsLoadingMonthly(true)
    try {
      const response = await zzpApi.dashboard.monthlyInvoices(period)
      setMonthlyData(response.months)
    } catch {
      setMonthlyData([])
    } finally {
      setIsLoadingMonthly(false)
    }
  }, [])

  useEffect(() => {
    void loadMonthlyData(monthlyPeriod)
  }, [monthlyPeriod, monthlyRefreshKey, loadMonthlyData])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const customerId = params.get('customer_id')
    if (customerId) {
      setPreSelectedCustomerId(customerId)
      setFilter('customer_id', customerId)
    }
    
    // Check for invoice ID in URL path: /zzp/invoices/:id
    const pathParts = window.location.pathname.split('/')
    const invoicesIndex = pathParts.indexOf('invoices')
    if (invoicesIndex !== -1 && pathParts[invoicesIndex + 1]) {
      const invoiceId = pathParts[invoicesIndex + 1]
      // We'll handle this after invoices are loaded
      setPreSelectedInvoiceId(invoiceId)
      // Clean up the URL to /zzp/invoices
      window.history.replaceState({}, '', `/zzp/invoices${window.location.search}`)
    }
  }, [])

  // Load data from API
  const loadData = useCallback(async () => {
    const isCurrent = pagination.beginRequest()
    if (!user?.id) {
      // Auth not yet resolved — clear the initial loading state so the page
      // doesn't get stuck showing a skeleton indefinitely on back navigation.
      // When auth resolves, loadData is recreated (user?.id dep changes) and
      // the effect re-runs to fetch data.
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    setLoadState('loading')

    const invoiceEndpoint = `${getApiBaseUrl()}/zzp/invoices`
    const customerEndpoint = `${getApiBaseUrl()}/zzp/customers`
    const profileEndpoint = `${getApiBaseUrl()}/zzp/profile`

    try {
      // Load invoices, customers, and business profile in parallel
      const [invoicesResponse, customersResponse, profileData] = await Promise.all([
        zzpApi.invoices.list(listOptions),
        zzpApi.customers.list(),
        zzpApi.profile.get().catch((profileError) => {
          console.error('[Invoices] Failed to load profile during invoices bootstrap', {
            route: 'Facturen',
            endpoint: profileEndpoint,
            userRole: user.role,
            administration_id: administrationId,
            error: profileError,
          })
          return null
        }), // Profile might not exist
      ])

      if (!isCurrent()) return
      const normalizedInvoices = normalizeListResponse<ZZPInvoice>(invoicesResponse, 'invoices')
      const normalizedCustomers = normalizeListResponse<ZZPCustomer>(customersResponse, 'customers')

      setRequestTraces(prev => [
        {
          endpoint: invoiceEndpoint,
          status: 200,
          ok: true,
          timestamp: new Date().toISOString(),
        },
        {
          endpoint: customerEndpoint,
          status: 200,
          ok: true,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 12))

      pagination.setTotal(invoicesResponse?.total ?? normalizedInvoices.length)
      setServerStats(invoicesResponse?.stats ?? undefined)
      setInvoices(normalizedInvoices)
      setCustomers(normalizedCustomers)
      setBusinessProfile(profileData)
      setLoadState('success')
      setLastErrorMessage(null)
      // Refresh monthly summary after loading invoices

    } catch (err) {
      if (!isCurrent()) return
      console.error('[Invoices] Failed to load invoices page data', {
        route: 'Facturen',
        endpoint: invoiceEndpoint,
        userRole: user.role,
        administration_id: administrationId,
        error: err,
      })

      const statusCode = getStatusCodeFromError(err)
      setRequestTraces(prev => [
        {
          endpoint: invoiceEndpoint,
          status: statusCode,
          ok: false,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 12))

      if (statusCode === 401 || statusCode === 403 || err instanceof UnauthorizedError) {
        setError('Geen toegang tot facturen.')
        setLoadState('forbidden')
      } else if (statusCode !== null && statusCode >= 500 || err instanceof ServerError) {
        setError('Serverfout bij het laden van facturen.')
        setLoadState('server')
      } else if (err instanceof NetworkError || statusCode === null) {
        setError('Geen verbinding met de server.')
        setLoadState('network')
      } else {
        const errorMessage = parseApiError(err)
        setError(errorMessage)
        setLoadState('error')
      }

      const parsed = parseApiError(err)
      setLastErrorMessage(parsed)
      toast.error(parsed)
      setInvoices([])
      setCustomers([])
    } finally {
      if (isCurrent()) setIsLoading(false)
    }
  }, [administrationId, user?.id, user?.role, listOptions])

  useEffect(() => {
    loadData()
  }, [loadData])
  
  // Auto-open form when pre-selected customer ID is set and data is loaded
  useEffect(() => {
    if (preSelectedCustomerId && customers.length > 0 && !isLoading) {
      // Check if customer exists
      const customer = customers.find(c => c.id === preSelectedCustomerId)
      if (customer && customer.status === 'active') {
        setDialogCustomerId(preSelectedCustomerId)
        setIsFormOpen(true)
      }
      setPreSelectedCustomerId(null) // Clear URL param after opening
    }
  }, [preSelectedCustomerId, customers, isLoading])
  
  useEffect(() => {
    if (!preSelectedInvoiceId) return
    let cancelled = false
    zzpApi.invoices.get(preSelectedInvoiceId).then(invoice => {
      if (!cancelled) { setViewingInvoice(invoice); setIsFormOpen(true); setPreSelectedInvoiceId(null) }
    }).catch(error => { if (!cancelled) { toast.error(parseApiError(error)); setPreSelectedInvoiceId(null) } })
    return () => { cancelled = true }
  }, [preSelectedInvoiceId])

  // Create customer lookup map
  const customerMap = useMemo(() => {
    const map = new Map<string, ZZPCustomer>()
    customers.forEach(c => map.set(c.id, c))
    return map
  }, [customers])

  // Calculate stats
  const stats = useMemo(() => {
    if (serverStats) return serverStats
    const total = invoices.length
    const draft = invoices.filter(i => i.status === 'draft').length
    const sent = invoices.filter(i => i.status === 'sent').length
    const paid = invoices.filter(i => i.status === 'paid').length
    const overdue = invoices.filter(i => i.status === 'overdue').length
    const totalAmount = invoices.reduce((sum, i) => sum + i.total_cents, 0)
    const paidAmount = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.total_cents, 0)
    const openAmount = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, i) => sum + Math.max(0, i.total_cents - (i.amount_paid_cents || 0) - (i.credited_cents || 0) + (i.refunded_cents || 0)), 0)
    return { total, draft, sent, paid, overdue, totalAmount, paidAmount, openAmount }
  }, [invoices, serverStats])

  // Filter invoices based on search and status
  const filteredInvoices = useMemo(() => {
    return invoices
  }, [invoices, filters, debouncedSearch])

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: keyof InvoiceFilters; label: string }> = []
    if (filters.status !== 'all') chips.push({ key: 'status', label: `Status: ${filters.status}` })
    if (filters.from) chips.push({ key: 'from', label: `Vanaf: ${filters.from}` })
    if (filters.to) chips.push({ key: 'to', label: `Tot: ${filters.to}` })
    if (filters.min) chips.push({ key: 'min', label: `Min: €${filters.min}` })
    if (filters.max) chips.push({ key: 'max', label: `Max: €${filters.max}` })
    if (filters.customer_id) {
      chips.push({
        key: 'customer_id',
        label: `Klant: ${customers.find((c) => c.id === filters.customer_id)?.name || filters.customer_id}`,
      })
    }
    if (filters.q) chips.push({ key: 'q', label: `Zoek: ${filters.q}` })
    return chips
  }, [filters, customers])

  // Active customers for quick actions
  const activeCustomers = useMemo(() => {
    return customers.filter(c => c.status === 'active')
  }, [customers])

  // Check if we have active customers
  const hasActiveCustomers = useMemo(() => {
    return activeCustomers.length > 0
  }, [activeCustomers])

  // Handle adding/editing invoice
  const handleSaveInvoice = useCallback(async (data: ZZPInvoiceCreate, isEdit: boolean, creationKey?: string) => {
    try {
      if (isEdit && editingInvoice) {
        const wasCancelled = editingInvoice.status === 'cancelled'
        // Update existing (if cancelled, backend auto-restores to draft)
        await zzpApi.invoices.update(editingInvoice.id, {
          customer_id: data.customer_id,
          invoice_number: data.invoice_number,
          issue_date: data.issue_date,
          due_date: data.due_date,
          delivery_date: data.delivery_date,
          notes: data.notes,
          lines: data.lines,
        })
        toast.success(wasCancelled ? t('zzpInvoices.savedAndRestoredToConcept') : t('zzpInvoices.invoiceSaved'))
      } else {
        // Create new
        const saved = await zzpApi.invoices.create(data, creationKey)
        toast.success(t('zzpInvoices.invoiceSaved'), { action: { label: 'Open factuur', onClick: () => navigateTo(`/zzp/invoices/${saved.id}`) } })
        // Emit onboarding event so the tour can auto-advance
        window.dispatchEvent(new CustomEvent('onboarding:invoice_created'))
      }

      setIsFormOpen(false)
      setEditingInvoice(undefined)
      // Reload data
      await loadData()
      setMonthlyRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Failed to save invoice:', err)
      toast.error(parseApiError(err))
      throw err // Re-throw so the dialog knows it failed
    }
  }, [editingInvoice, loadData])

  // Handle quick status change
  const handleStatusChange = useCallback(async (invoice: ZZPInvoice, newStatus: 'sent' | 'paid' | 'cancelled') => {
    setUpdatingStatusInvoiceId(invoice.id)
    try {
      await zzpApi.invoices.updateStatus(invoice.id, newStatus)
      toast.success(t('zzpInvoices.statusChanged'))
      // Reload data
      await loadData()
      setMonthlyRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Failed to update status:', err)
      toast.error(parseApiError(err))
    } finally {
      setUpdatingStatusInvoiceId(null)
    }
  }, [loadData])

  // Handle restore cancelled invoice to concept (cancelled → draft)
  const handleRestoreToConcept = useCallback(async (invoice: ZZPInvoice) => {
    setUpdatingStatusInvoiceId(invoice.id)
    try {
      await zzpApi.invoices.updateStatus(invoice.id, 'draft')
      toast.success(t('zzpInvoices.restoredToConcept'))
      await loadData()
      setMonthlyRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Failed to restore invoice to concept:', err)
      toast.error(parseApiError(err))
    } finally {
      setUpdatingStatusInvoiceId(null)
    }
  }, [loadData, t])

  // Handle send invoice (draft → sent)
  const handleSendInvoice = useCallback(async (invoice: ZZPInvoice) => {
    setUpdatingStatusInvoiceId(invoice.id)
    try {
      toast.info(t('common.sending'))
      const result = await zzpApi.invoices.sendEmail(invoice.id)
      // Check if email was actually sent or just status updated
      if (('_email_status' in result ? result._email_status : undefined) === 'not_configured') {
        toast.success('Status bijgewerkt (e-mail niet geconfigureerd)')
      } else {
        toast.success(t('zzpInvoices.invoiceSent'))
      }
      await loadData()
      setMonthlyRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Failed to send invoice:', err)
      toast.error(parseApiError(err))
    } finally {
      setUpdatingStatusInvoiceId(null)
    }
  }, [loadData, t])

  // Handle delete invoice
  const handleDeleteInvoice = useCallback(async () => {
    if (!deletingInvoice) return

    try {
      await zzpApi.invoices.delete(deletingInvoice.id)
      toast.success(t('zzpInvoices.invoiceDeleted'))
      setDeletingInvoice(undefined)
      // Reload data
      await loadData()
      setMonthlyRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Failed to delete invoice:', err)
      toast.error(parseApiError(err))
    }
  }, [deletingInvoice, loadData])

  const handleDownloadPdf = useCallback(async (invoice: ZZPInvoice) => {
    setDownloadingInvoiceId(invoice.id)
    try {
      const pdf = await zzpApi.invoices.downloadPdf(invoice.id)
      saveInvoicePdf(pdf, invoice.invoice_number)
      toast.success('PDF-bestand gereed. Kies waar je het wilt bewaren.')
    } catch (error) { toast.error(parseApiError(error)) }
    finally { setDownloadingInvoiceId(null) }
  }, [])

  // Handle copy invoice link to clipboard (public share URL)
  // Generates a signed, 30-day share link that doesn't require authentication
  const handleCopyLink = useCallback(async (invoice: ZZPInvoice) => {
    console.log('[PDF Copy Link] Creating share link for invoice:', invoice.id)
    try {
      const { url } = await zzpApi.invoices.createShareLink(invoice.id)
      console.log('[PDF Copy Link] Share URL:', url)
      
      await navigator.clipboard.writeText(url)
      console.log('[PDF Copy Link] Link copied successfully')
      toast.success(t('zzpInvoices.shareLinkCopied'))
    } catch (err) {
      console.error('[PDF Copy Link] Failed to create share link:', err)
      toast.error(t('common.error'))
    }
  }, [])

  // Handle share invoice (Web Share API with PDF file sharing)
  // Shares the actual PDF file if supported, otherwise falls back to public share URL
  const handleShare = useCallback(async (invoice: ZZPInvoice) => {
    const invoiceNumber = invoice.invoice_number || `INV-${invoice.id}`
    const filename = `${invoiceNumber}.pdf`
    
    console.log('[PDF Share] Starting share for invoice:', invoice.id, 'filename:', filename)
    
    try {
      // Download PDF as blob first
      console.log('[PDF Share] Fetching PDF blob from API...')
      const blob = await zzpApi.invoices.downloadPdf(invoice.id)
      
      // Ensure blob has correct MIME type for PDF
      const pdfBlob = new Blob([blob], { type: 'application/pdf' })
      console.log('[PDF Share] Blob received, size:', pdfBlob.size, 'bytes')
      
      // Check if Web Share API supports file sharing
      // Only create File object if we can actually use it
      if (navigator.share && typeof navigator.canShare === 'function') {
        const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' })
        const shareData = {
          title: t('zzpInvoices.shareTitle').replace('{number}', invoiceNumber),
          text: t('zzpInvoices.shareText').replace('{number}', invoiceNumber),
          files: [pdfFile],
        }
        
        if (navigator.canShare(shareData)) {
          // Share the actual PDF file
          console.log('[PDF Share] Sharing PDF file via Web Share API...')
          await navigator.share(shareData)
          console.log('[PDF Share] File shared successfully')
          toast.success(t('zzpInvoices.shareSuccess'))
          return
        } else {
          console.log('[PDF Share] File sharing not supported by canShare check')
        }
      }
      
      // Fallback: generate a public share link and share/copy it
      console.log('[PDF Share] Generating public share link...')
      const { url: shareUrl } = await zzpApi.invoices.createShareLink(invoice.id)

      if (navigator.share) {
        console.log('[PDF Share] Sharing public URL via Web Share API...')
        await navigator.share({
          title: t('zzpInvoices.shareTitle').replace('{number}', invoiceNumber),
          text: t('zzpInvoices.shareText').replace('{number}', invoiceNumber),
          url: shareUrl,
        })
        console.log('[PDF Share] URL shared successfully')
        toast.success(t('zzpInvoices.shareSuccess'))
      } else {
        // No Web Share API available: copy link to clipboard as fallback
        console.log('[PDF Share] Web Share API not available, copying link to clipboard...')
        await navigator.clipboard.writeText(shareUrl)
        toast.success(t('zzpInvoices.shareLinkCopied'))
      }
    } catch (err) {
      // AbortError is thrown when user cancels the share dialog - not an error
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[PDF Share] User cancelled share dialog')
        return
      }
      console.error('[PDF Share] Failed to share invoice:', err)
      toast.error(t('zzpInvoices.shareError'))
    }
  }, [])

  // Handle mark as paid
  const handleMarkPaid = useCallback(async (invoice: ZZPInvoice) => {
    setUpdatingStatusInvoiceId(invoice.id)
    try {
      // Use proper payment system endpoint
      await zzpApi.invoices.markPaid(invoice.id, {
        payment_date: new Date().toISOString(),
        payment_method: 'bank_transfer',
        notes: 'Gemarkeerd als betaald via ZZP portal'
      })
      toast.success(t('zzpInvoices.markedPaid'))
      await loadData()
      setMonthlyRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Failed to mark as paid:', err)
      toast.error(parseApiError(err))
    } finally {
      setUpdatingStatusInvoiceId(null)
    }
  }, [loadData])

  // Handle mark as unpaid (remove payment allocations)
  const handleMarkUnpaid = useCallback(async (invoice: ZZPInvoice) => {
    setUpdatingStatusInvoiceId(invoice.id)
    try {
      // Use proper payment system endpoint
      await zzpApi.invoices.markUnpaid(invoice.id)
      toast.success(t('zzpInvoices.markedUnpaid'))
      await loadData()
      setMonthlyRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Failed to mark as unpaid:', err)
      toast.error(parseApiError(err))
    } finally {
      setUpdatingStatusInvoiceId(null)
    }
  }, [loadData])

  // Open form for new invoice
  const openNewForm = useCallback(() => {
    setEditingInvoice(undefined)
    setViewingInvoice(undefined)
    setIsFormOpen(true)
  }, [])

  useQuickCreate('new', openNewForm, !isLoading && !!user?.id)

  // Generate invoice draft with sensible defaults and open it directly
  const handleGenerateInvoice = useCallback(async () => {
    if (activeCustomers.length === 0) {
      toast.error(t('zzpInvoices.noActiveCustomers'))
      return
    }

    setIsGeneratingInvoice(true)
    try {
      const selectedCustomer = [...activeCustomers].sort((a, b) => a.name.localeCompare(b.name))[0]
      const issueDate = new Date()
      const dueDate = new Date(issueDate)
      dueDate.setDate(dueDate.getDate() + 14)

      const generatedInvoice = await zzpApi.invoices.create({
        customer_id: selectedCustomer.id,
        issue_date: extractDatePart(issueDate.toISOString()),
        due_date: extractDatePart(dueDate.toISOString()),
        notes: t('zzpInvoices.generatedInvoiceNote'),
        lines: [
          {
            description: t('zzpInvoices.generatedLineDescription'),
            quantity: 1,
            unit_price_cents: 10000,
            vat_rate: 21,
          },
        ],
      })

      setViewingInvoice(undefined)
      setEditingInvoice(generatedInvoice)
      setIsFormOpen(true)
      toast.success(t('zzpInvoices.invoiceGenerated'))
      await loadData()
      setMonthlyRefreshKey(k => k + 1)
    } catch (err) {
      console.error('Failed to generate invoice:', err)
      toast.error(parseApiError(err))
    } finally {
      setIsGeneratingInvoice(false)
    }
  }, [activeCustomers, loadData])

  // Open form for editing (only for draft invoices)
  const openEditForm = useCallback((invoice: ZZPInvoice) => {
    setViewingInvoice(undefined)
    setEditingInvoice(invoice)
    setIsFormOpen(true)
  }, [])

  // Open form for viewing (for non-draft invoices)
  const openViewForm = useCallback((invoice: ZZPInvoice) => {
    setEditingInvoice(undefined)
    setViewingInvoice(invoice)
    setIsFormOpen(true)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        <ServerPagination {...pagination} loading={isLoading} />
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3">
              <FileText size={28} className="text-primary sm:hidden" weight="duotone" />
              <FileText size={40} className="text-primary hidden sm:block" weight="duotone" />
              {t('zzpInvoices.title')}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t('zzpInvoices.pageDescription')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              onClick={handleGenerateInvoice}
              variant="secondary"
              className="gap-2 h-10 sm:h-11 w-full sm:w-auto"
              disabled={!hasActiveCustomers || isGeneratingInvoice}
            >
              {isGeneratingInvoice ? (
                <SpinnerGap size={18} className="animate-spin" />
              ) : (
                <Receipt size={18} weight="bold" />
              )}
              {t('zzpInvoices.generateInvoice')}
            </Button>
            <Button onClick={openNewForm} className="gap-2 h-10 sm:h-11 w-full sm:w-auto" disabled={!hasActiveCustomers} data-onboarding="new-invoice-btn">
              <Plus size={18} weight="bold" />
              {t('zzpInvoices.newInvoice')}
            </Button>
          </div>
        </div>

        {/* No customers warning */}
        {!isLoading && !hasActiveCustomers && (
          <div className="mb-6">
            <NoCustomersWarning />
          </div>
        )}

        {/* Stats Cards */}
        {showLoading ? (
          <StatsLoadingSkeleton />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
            <StatsCard 
              title={t('zzpInvoices.statsTotal')} 
              value={stats.total}
              subtitle={`${formatAmountEUR(stats.totalAmount)}`}
              icon={Receipt}
              className="border-primary/20"
            />
            <StatsCard 
              title={t('zzpInvoices.statsOpen')} 
              value={stats.sent + stats.overdue}
              subtitle={`${formatAmountEUR(stats.openAmount)}`}
              icon={Hourglass}
              className="border-blue-500/20"
            />
            <StatsCard 
              title={t('zzpInvoices.statsPaid')} 
              value={stats.paid}
              subtitle={`${formatAmountEUR(stats.paidAmount)}`}
              icon={Wallet}
              className="border-green-500/20"
            />
            <StatsCard 
              title={t('zzpInvoices.statsDraft')} 
              value={stats.draft}
              subtitle={t('zzpInvoices.statsDraftSubtitle')}
              icon={Clock}
              className="border-gray-500/20"
            />
          </div>
        )}

        {/* Maandoverzicht facturen */}
        <div className="mb-6">
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarBlank size={18} weight="duotone" className="text-primary" />
                    {t('zzpInvoices.monthlyOverviewTitle')}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {t('zzpInvoices.monthlyOverviewDescription')}
                  </CardDescription>
                </div>
                <div className="flex gap-1.5">
                  <SegmentedControl<MonthlyInvoicePeriod>
                    value={monthlyPeriod}
                    onChange={setMonthlyPeriod}
                    ariaLabel={t('zzpInvoices.monthlyOverviewTitle')}
                    options={[
                      { value: 'this_month', label: t('zzpInvoices.monthlyPeriodThisMonth') },
                      { value: 'last_6_months', label: t('zzpInvoices.monthlyPeriodLast6Months') },
                      { value: 'this_year', label: t('zzpInvoices.monthlyPeriodThisYear') },
                    ]}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoadingMonthly ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-9 bg-muted/30 rounded-md animate-pulse" />
                  ))}
                </div>
              ) : monthlyData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">{t('zzpInvoices.monthlyNoData')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border/30">
                        <th className="text-left pb-2 font-medium">{t('zzpInvoices.monthlyColumnMonth')}</th>
                        <th className="text-right pb-2 font-medium">{t('zzpInvoices.monthlyColumnSent')}</th>
                        <th className="text-right pb-2 font-medium">{t('zzpInvoices.monthlyColumnPaid')}</th>
                        <th className="text-right pb-2 font-medium">{t('zzpInvoices.monthlyColumnOpen')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...monthlyData].reverse().map((m: MonthlyInvoiceSummary) => (
                        <tr
                          key={m.month_key}
                          className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-colors"
                        >
                          <td className="py-2 pr-4 font-medium">{m.month_label}</td>
                          <td className="py-2 text-right text-muted-foreground tabular-nums">
                            <span className="block">{formatAmountEUR(m.sent_total)}</span>
                            {m.sent_count > 0 && (
                              <span className="text-xs text-muted-foreground/60">
                                {m.sent_count} {m.sent_count === 1 ? 'factuur' : 'facturen'}
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            <span className={`block ${m.paid_total > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                              {formatAmountEUR(m.paid_total)}
                            </span>
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            <span className={`block ${m.open_total > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                              {formatAmountEUR(m.open_total)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Show loading, error, empty state or content */}
        {showLoading ? (
          <TableLoadingSkeleton />
        ) : error ? (
          <Card className="bg-card/80 backdrop-blur-sm border-destructive/30">
            <CardHeader>
              <CardTitle>{loadState === 'forbidden' ? 'Geen toegang' : loadState === 'server' ? 'Serverfout' : loadState === 'network' ? 'Geen verbinding' : 'Facturen laden mislukt'}</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => { void loadData() }} variant="outline">Opnieuw proberen</Button>
            </CardContent>
          </Card>
        ) : invoices.length === 0 ? (
          <EmptyState onAddInvoice={openNewForm} hasCustomers={hasActiveCustomers} />
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{t('zzpInvoices.listTitle')}</CardTitle>
                  <CardDescription>
                    {filteredInvoices.length} {filteredInvoices.length === 1 ? 'factuur' : 'facturen'}
                    {filters.status !== 'all' && ` (${
                      filters.status === 'refund_due' ? 'Terug te betalen' :
                      filters.status === 'open' ? 'Openstaand' :
                      filters.status === 'draft' ? t('zzpInvoices.filterDraft') :
                      filters.status === 'sent' ? t('zzpInvoices.filterSent') :
                      filters.status === 'paid' ? t('zzpInvoices.filterPaid') :
                      filters.status === 'overdue' ? t('zzpInvoices.filterOverdue') :
                      filters.status === 'cancelled' ? t('zzpInvoices.filterCancelled') : ''
                    })`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search and filter controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="relative sm:col-span-2 lg:col-span-1">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <Input placeholder={t('zzpInvoices.searchPlaceholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 h-11" />
                </div>
                <Select value={filters.status} onValueChange={(value) => setFilter('status', value as InvoiceFilters['status'])}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('zzpInvoices.filterAll')}</SelectItem>
                    <SelectItem value="open">Openstaand</SelectItem>
                    <SelectItem value="refund_due">Terug te betalen</SelectItem>
                    <SelectItem value="draft">{t('zzpInvoices.filterDraft')}</SelectItem>
                    <SelectItem value="sent">{t('zzpInvoices.filterSent')}</SelectItem>
                    <SelectItem value="paid">{t('zzpInvoices.filterPaid')}</SelectItem>
                    <SelectItem value="overdue">{t('zzpInvoices.filterOverdue')}</SelectItem>
                    <SelectItem value="cancelled">{t('zzpInvoices.filterCancelled')}</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className="h-11" />
                <Input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className="h-11" />
                <Input type="number" step="0.01" placeholder="Min bedrag" value={filters.min} onChange={(e) => setFilter('min', e.target.value)} className="h-11" />
                <Input type="number" step="0.01" placeholder="Max bedrag" value={filters.max} onChange={(e) => setFilter('max', e.target.value)} className="h-11" />
                <Select value={filters.customer_id || 'all'} onValueChange={(value) => setFilter('customer_id', value === 'all' ? '' : value)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Klant" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle klanten</SelectItem>
                    {customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={reset} className="h-11">Clear filters</Button>
              </div>

              {activeFilterChips.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {activeFilterChips.map((chip) => (
                    <Badge key={chip.key} variant="secondary" className="gap-1">
                      {chip.label}
                      <button type="button" onClick={() => setFilter(chip.key, defaultInvoiceFilters[chip.key])}><X size={12} /></button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Mobile: Card list */}
              <div className="sm:hidden space-y-3">
                {filteredInvoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <MagnifyingGlass size={40} className="mb-3 opacity-50" />
                    <p className="font-medium">{t('zzpInvoices.noInvoicesFound')}</p>
                    <p className="text-sm">{t('zzpInvoices.tryDifferentSearch')}</p>
                  </div>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const canEdit = invoice.status === 'draft' || invoice.status === 'cancelled'
                    return (
                      <InvoiceCard
                        key={invoice.id}
                        invoice={invoice}
                        onView={() => openViewForm(invoice)}
                        onEdit={() => openEditForm(invoice)}
                        onDelete={() => setDeletingInvoice(invoice)}
                        onRestore={() => handleRestoreToConcept(invoice)}
                        onStatusChange={(status) => handleStatusChange(invoice, status)}
                        onSendInvoice={() => handleSendInvoice(invoice)}
                        onDownloadPdf={() => handleDownloadPdf(invoice)}
                        onCopyLink={() => handleCopyLink(invoice)}
                        onShare={() => handleShare(invoice)}
                        onMarkPaid={() => handleMarkPaid(invoice)}
                        onMarkUnpaid={() => handleMarkUnpaid(invoice)}
                        canEdit={canEdit}
                        isDownloading={downloadingInvoiceId === invoice.id}
                        isUpdatingStatus={updatingStatusInvoiceId === invoice.id}
                      />
                    )
                  })
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden sm:block rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                      <TableHead className="font-semibold">{t('zzpInvoices.columnNumber')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpInvoices.columnCustomer')}</TableHead>
                      <TableHead className="font-semibold hidden lg:table-cell">{t('zzpInvoices.columnDate')}</TableHead>
                      <TableHead className="text-right font-semibold">{t('zzpInvoices.columnAmount')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpInvoices.columnStatus')}</TableHead>
                      <TableHead className="text-right font-semibold">{t('zzpInvoices.columnActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <MagnifyingGlass size={40} className="mb-3 opacity-50" />
                            <p className="font-medium">{t('zzpInvoices.noInvoicesFound')}</p>
                            <p className="text-sm">{t('zzpInvoices.tryDifferentSearch')}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInvoices.map((invoice) => {
                        const canEdit = invoice.status === 'draft' || invoice.status === 'cancelled'
                        return (
                          <TableRow key={invoice.id} className="hover:bg-secondary/30">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                  <FileText size={16} className="text-primary" weight="duotone" />
                                </div>
                                <span className="font-mono text-sm font-medium">{invoice.invoice_number}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Users size={14} className="text-muted-foreground" />
                                <span>{invoice.customer_name || t('zzpInvoices.unknownCustomer')}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground">
                              {formatDate(invoice.issue_date)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatAmountEUR(invoice.total_cents)}
                            </TableCell>
                            <TableCell>
                              {invoice.status === 'draft' || invoice.status === 'cancelled' ? (
                                <StatusBadge status={invoice.status} />
                              ) : (
                                <Select
                                  value={invoice.status}
                                  onValueChange={(value) => handleStatusChange(invoice, value as 'sent' | 'paid' | 'cancelled')}
                                  disabled={updatingStatusInvoiceId === invoice.id || !!invoice.credited_cents}
                                >
                                  <SelectTrigger
                                    aria-label={t('zzpInvoices.changeStatus')}
                                    className="group flex items-center gap-2 h-9 w-auto pl-1.5 pr-2.5 rounded-full border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/40 transition-all shadow-sm [&>svg:last-child]:opacity-100 [&>svg:last-child]:text-primary"
                                  >
                                    <StatusBadge status={invoice.status} size="sm" />
                                    <span className="text-xs font-semibold text-primary whitespace-nowrap hidden xl:inline">
                                      {t('zzpInvoices.changeStatus')}
                                    </span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="sent">{t('zzpInvoices.statusSent')}</SelectItem>
                                    <SelectItem value="paid">{t('zzpInvoices.statusPaid')}</SelectItem>

                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => canEdit ? openEditForm(invoice) : openViewForm(invoice)}
                                  className="h-8 w-8 p-0"
                                >
                                  {canEdit ? <PencilSimple size={16} /> : <Eye size={16} />}
                                  <span className="sr-only">{canEdit ? t('common.edit') : t('common.view')}</span>
                                </Button>
                                {(invoice.status === 'draft' || invoice.status === 'cancelled') && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeletingInvoice(invoice)}
                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                  >
                                    <TrashSimple size={16} />
                                    <span className="sr-only">{t('common.delete')}</span>
                                  </Button>
                                )}
                                {/* More actions dropdown */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <DotsThreeVertical size={16} />
                                      <span className="sr-only">{t('zzpInvoices.moreActions')}</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem 
                                      onSelect={() => handleDownloadPdf(invoice)}
                                      disabled={downloadingInvoiceId === invoice.id}
                                    >
                                      {downloadingInvoiceId === invoice.id ? (
                                        <SpinnerGap size={16} className="mr-2 animate-spin" />
                                      ) : (
                                        <Download size={16} className="mr-2" />
                                      )}
                                      {t('zzpInvoices.downloadPdf')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => handleCopyLink(invoice)}>
                                      <CopySimple size={16} className="mr-2" />
                                      {t('zzpInvoices.copyInvoiceLink')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => handleShare(invoice)}>
                                      <ShareNetwork size={16} className="mr-2" />
                                      {t('zzpInvoices.share')}
                                    </DropdownMenuItem>
                                    
                                    {/* Status actions separator */}
                                    <DropdownMenuSeparator />
                                    
                                    {/* Send invoice - only for draft invoices */}
                                    {invoice.status === 'draft' && (
                                      <DropdownMenuItem 
                                        onSelect={() => handleSendInvoice(invoice)}
                                        disabled={updatingStatusInvoiceId === invoice.id || !!invoice.credited_cents}
                                      >
                                        {updatingStatusInvoiceId === invoice.id ? (
                                          <SpinnerGap size={16} className="mr-2 animate-spin" />
                                        ) : (
                                          <PaperPlaneTilt size={16} className="mr-2" />
                                        )}
                                        {t('zzpInvoices.sendInvoice')}
                                      </DropdownMenuItem>
                                    )}

                                    {/* Cancel invoice - for draft invoices (backend supports draft → cancelled) */}
                                    {invoice.status === 'draft' && (
                                      <DropdownMenuItem
                                        onSelect={() => handleStatusChange(invoice, 'cancelled')}
                                        disabled={updatingStatusInvoiceId === invoice.id || !!invoice.credited_cents}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        {updatingStatusInvoiceId === invoice.id ? (
                                          <SpinnerGap size={16} className="mr-2 animate-spin" />
                                        ) : (
                                          <XCircle size={16} className="mr-2" />
                                        )}
                                        {t('zzpInvoices.statusCancelled')}
                                      </DropdownMenuItem>
                                    )}
                                    
                                    {/* Mark as Paid / Unpaid - only for non-draft, non-cancelled invoices */}
                                    {invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
                                      <>
                                        {invoice.status === 'paid' ? (
                                          <DropdownMenuItem 
                                            onSelect={() => handleMarkUnpaid(invoice)}
                                            disabled={updatingStatusInvoiceId === invoice.id || !!invoice.credited_cents}
                                          >
                                            {updatingStatusInvoiceId === invoice.id ? (
                                              <SpinnerGap size={16} className="mr-2 animate-spin" />
                                            ) : (
                                              <XCircle size={16} className="mr-2" />
                                            )}
                                            {t('zzpInvoices.markUnpaid')}
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem 
                                            onSelect={() => handleMarkPaid(invoice)}
                                            disabled={updatingStatusInvoiceId === invoice.id || (invoice.outstanding_cents !== undefined && invoice.outstanding_cents <= 0)}
                                          >
                                            {updatingStatusInvoiceId === invoice.id ? (
                                              <SpinnerGap size={16} className="mr-2 animate-spin" />
                                            ) : (
                                              <CheckCircle size={16} className="mr-2" />
                                            )}
                                            {t('zzpInvoices.markPaid')}
                                          </DropdownMenuItem>
                                        )}
                                      </>
                                    )}
                                    
                                    {/* Cancelled invoice actions */}
                                    {invoice.status === 'cancelled' && (
                                      <DropdownMenuItem
                                        onSelect={() => handleRestoreToConcept(invoice)}
                                        disabled={updatingStatusInvoiceId === invoice.id || !!invoice.credited_cents}
                                      >
                                        {updatingStatusInvoiceId === invoice.id ? (
                                          <SpinnerGap size={16} className="mr-2 animate-spin" />
                                        ) : (
                                          <ArrowCounterClockwise size={16} className="mr-2" />
                                        )}
                                        {t('zzpInvoices.restoreToConcept')}
                                      </DropdownMenuItem>
                                    )}
                                    
                                    {/* Delete - for draft and cancelled invoices */}
                                    {(invoice.status === 'draft' || invoice.status === 'cancelled') && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem 
                                          onSelect={() => setDeletingInvoice(invoice)}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <TrashSimple size={16} className="mr-2" />
                                          {t('common.delete')}
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {debugEnabled && (
          <Card className="mt-4 border-dashed border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Invoices debug</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1 font-mono">
              <p>role: {user?.role ?? 'unknown'}</p>
              <p>administration_id: {administrationId ?? 'missing'}</p>
              <p>api: {getApiBaseUrl()}</p>
              <p>loadState: {loadState}</p>
              <p>lastError: {lastErrorMessage ?? 'none'}</p>
              <div>
                <p className="font-semibold mb-1">requests:</p>
                {requestTraces.length === 0 ? (
                  <p>none</p>
                ) : (
                  <ul className="space-y-1">
                    {requestTraces.map((trace, index) => (
                      <li key={`${trace.timestamp}-${trace.endpoint}-${index}`}>
                        [{trace.status ?? 'ERR'}] {trace.endpoint}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Invoice form dialog */}
      <InvoiceFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            setEditingInvoice(undefined)
            setViewingInvoice(undefined)
            setDialogCustomerId(null) // Clear pre-selected customer when dialog closes
          }
        }}
        invoice={editingInvoice || viewingInvoice}
        customers={customers}
        businessProfile={businessProfile}
        onSave={handleSaveInvoice}
        isReadOnly={!!viewingInvoice}
        onCorrectionsChanged={async () => { await loadData(); if (viewingInvoice) setViewingInvoice(await zzpApi.invoices.get(viewingInvoice.id)) }}
        preSelectedCustomerId={dialogCustomerId}
      />

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={!!deletingInvoice}
        onOpenChange={(open) => {
          if (!open) setDeletingInvoice(undefined)
        }}
        onConfirm={handleDeleteInvoice}
        invoiceNumber={deletingInvoice?.invoice_number || ''}
      />
    </div>
  )
}

export default ZZPInvoicesPage
