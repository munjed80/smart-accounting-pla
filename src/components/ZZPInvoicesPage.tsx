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

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
} from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/useDebounce'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

// Format amount in cents to EUR currency string
function formatAmountEUR(amountCents: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amountCents / 100)
}

// Format date string for display (Dutch locale)
function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoDate))
}

// Invoice status types (matches backend)
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

// Helper to detect iOS devices (including iPadOS)
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Helper to detect Android devices
function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent)
}

// Helper to detect mobile devices (iOS or Android)
function isMobile(): boolean {
  return isIOS() || isAndroid()
}

// Delay in ms before revoking PDF blob URL to ensure download/open completes
const PDF_URL_REVOCATION_DELAY_MS = 30000
// iOS requires longer delay due to slower blob URL loading
const IOS_REVOCATION_DELAY_MULTIPLIER = 2

// Helper function to extract date part from ISO string
const extractDatePart = (isoString: string | undefined): string => {
  if (!isoString) return ''
  return isoString.split('T')[0]
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

// Parse amount string to cents
const parseAmountToCents = (value: string): number | null => {
  const normalized = value.replace(',', '.')
  const parsed = parseFloat(normalized)
  if (isNaN(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

// Invoice form dialog - now supports invoice lines
const InvoiceFormDialog = ({
  open,
  onOpenChange,
  invoice,
  customers,
  businessProfile,
  onSave,
  isReadOnly = false,
  preSelectedCustomerId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice?: ZZPInvoice
  customers: ZZPCustomer[]
  businessProfile: ZZPBusinessProfile | null
  onSave: (data: ZZPInvoiceCreate, isEdit: boolean) => Promise<void>
  isReadOnly?: boolean
  preSelectedCustomerId?: string | null
}) => {
  const isEdit = !!invoice
  const [customerId, setCustomerId] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<InvoiceLineFormData[]>([createEmptyLine()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Validation errors
  const [customerError, setCustomerError] = useState('')
  const [dateError, setDateError] = useState('')
  const [linesError, setLinesError] = useState('')

  // Active customers only
  const activeCustomers = useMemo(() => 
    customers.filter(c => c.status === 'active'), 
    [customers]
  )

  // Reset form when dialog opens/closes or invoice changes
  useEffect(() => {
    if (open) {
      if (invoice) {
        setCustomerId(invoice.customer_id)
        setIssueDate(extractDatePart(invoice.issue_date))
        setDueDate(extractDatePart(invoice.due_date))
        setNotes(invoice.notes || '')
        // Convert existing lines to form data
        if (invoice.lines && invoice.lines.length > 0) {
          setLines(invoice.lines.map(line => ({
            id: line.id,
            description: line.description,
            quantity: line.quantity.toString(),
            unitPrice: (line.unit_price_cents / 100).toFixed(2).replace('.', ','),
            vatRate: line.vat_rate.toString(),
          })))
        } else {
          setLines([createEmptyLine()])
        }
      } else {
        // New invoice - use pre-selected customer if available
        setCustomerId(preSelectedCustomerId || '')
        setIssueDate(extractDatePart(new Date().toISOString()))
        setDueDate('')
        setNotes('')
        setLines([createEmptyLine()])
      }
      setCustomerError('')
      setDateError('')
      setLinesError('')
      setIsSubmitting(false)
    }
  }, [open, invoice, preSelectedCustomerId])

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
    const qty = parseFloat(line.quantity.replace(',', '.')) || 0
    const unitPriceCents = parseAmountToCents(line.unitPrice) || 0
    return qty * unitPriceCents
  }

  // Calculate totals (for display)
  const calculatedTotals = useMemo(() => {
    let subtotal = 0
    let vatTotal = 0
    lines.forEach(line => {
      const lineTotalCents = calculateLineTotal(line)
      const vatRate = parseFloat(line.vatRate) || 0
      const vatAmount = Math.round(lineTotalCents * (vatRate / 100))
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
      const qty = parseFloat(line.quantity.replace(',', '.'))
      if (isNaN(qty) || qty <= 0) {
        setLinesError(t('zzpInvoices.lineQuantityRequired'))
        return null
      }
      const unitPriceCents = parseAmountToCents(line.unitPrice)
      if (unitPriceCents === null || unitPriceCents <= 0) {
        setLinesError(t('zzpInvoices.lineUnitPriceRequired'))
        return null
      }
      const vatRate = parseFloat(line.vatRate)
      if (isNaN(vatRate) || vatRate < 0) {
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

    // Validate customer (only required for new invoices)
    if (!isEdit && !customerId) {
      setCustomerError(t('zzpInvoices.formCustomerRequired'))
      hasError = true
    }

    // Validate date
    if (!issueDate) {
      setDateError(t('zzpInvoices.formDateRequired'))
      hasError = true
    }

    // Validate lines
    const validLines = validateAndConvertLines()
    if (!validLines) {
      hasError = true
    }

    if (hasError || !validLines) {
      toast.error(t('zzpInvoices.formValidationError'))
      return
    }

    setIsSubmitting(true)

    try {
      const invoiceData: ZZPInvoiceCreate = {
        customer_id: isEdit ? invoice!.customer_id : customerId,
        issue_date: issueDate, // Already in YYYY-MM-DD format from input
        due_date: dueDate || undefined, // Already in YYYY-MM-DD format from input
        notes: notes.trim() || undefined,
        lines: validLines,
      }
      await onSave(invoiceData, isEdit)
    } catch (err) {
      // Error toast is handled by the parent onSave callback
      console.error('Failed to save invoice:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasValidLines = lines.some(line => 
    line.description.trim() && 
    parseFloat(line.quantity.replace(',', '.')) > 0 && 
    (parseAmountToCents(line.unitPrice) ?? 0) > 0
  )

  const isFormValid = (isEdit || customerId) && issueDate && hasValidLines

  // For non-draft invoices, form is read-only
  const formDisabled = isSubmitting || isReadOnly

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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

        <div className="py-4 space-y-5">
          {/* Customer section */}
          {!isEdit ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Users size={14} className="text-muted-foreground" />
                {t('zzpInvoices.formCustomer')} <span className="text-destructive">*</span>
              </Label>
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
                    activeCustomers.map((customer) => (
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
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Users size={14} className="text-muted-foreground" />
                {t('zzpInvoices.customerDetails')}
              </Label>
              <div className="bg-secondary/30 rounded-lg p-4 space-y-2 text-sm">
                <p className="font-semibold">
                  {invoice?.customer_name || customers.find(c => c.id === invoice?.customer_id)?.name || t('zzpInvoices.unknownCustomer')}
                </p>
                {invoice?.customer_address_street && (
                  <p className="text-muted-foreground">{invoice.customer_address_street}</p>
                )}
                {(invoice?.customer_address_postal_code || invoice?.customer_address_city) && (
                  <p className="text-muted-foreground">
                    {[invoice?.customer_address_postal_code, invoice?.customer_address_city].filter(Boolean).join(' ')}
                  </p>
                )}
                {invoice?.customer_address_country && (
                  <p className="text-muted-foreground">{invoice.customer_address_country}</p>
                )}
                {invoice?.customer_kvk_number && (
                  <p className="text-muted-foreground">KVK: {invoice.customer_kvk_number}</p>
                )}
                {invoice?.customer_btw_number && (
                  <p className="text-muted-foreground">BTW: {invoice.customer_btw_number}</p>
                )}
              </div>
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

        <DialogFooter className="pt-4 border-t border-border/50 gap-2 sm:gap-0">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="h-11"
          >
            {isReadOnly ? t('common.close') : t('common.cancel')}
          </Button>
          {!isReadOnly && (
            <Button 
              onClick={handleSave}
              disabled={isSubmitting || !isFormValid}
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
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/50">
        {invoice.status === 'draft' ? (
          <StatusBadge status={invoice.status} size="sm" />
        ) : (
          <Select 
            value={invoice.status} 
            onValueChange={(value) => onStatusChange(value as 'sent' | 'paid' | 'cancelled')}
          >
            <SelectTrigger className="w-auto border-0 p-0 h-auto focus:ring-0">
              <StatusBadge status={invoice.status} size="sm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sent">{t('zzpInvoices.statusSent')}</SelectItem>
              <SelectItem value="paid">{t('zzpInvoices.statusPaid')}</SelectItem>
              <SelectItem value="cancelled">{t('zzpInvoices.statusCancelled')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={canEdit ? onEdit : onView}
            className="h-9 px-3 gap-2"
          >
            {canEdit ? <PencilSimple size={16} /> : <Eye size={16} />}
            {canEdit ? t('common.edit') : t('common.view')}
          </Button>
          {invoice.status === 'draft' && (
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
              <DropdownMenuItem onSelect={onDownloadPdf} disabled={isDownloading}>
                {isDownloading ? (
                  <SpinnerGap size={16} className="mr-2 animate-spin" />
                ) : (
                  <Download size={16} className="mr-2" />
                )}
                {t('zzpInvoices.downloadPdf')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onCopyLink}>
                <CopySimple size={16} className="mr-2" />
                {t('zzpInvoices.copyInvoiceLink')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onShare}>
                <ShareNetwork size={16} className="mr-2" />
                {t('zzpInvoices.share')}
              </DropdownMenuItem>
              
              {/* Status actions separator - show for all except cancelled */}
              {invoice.status !== 'cancelled' && (
                <DropdownMenuSeparator />
              )}
              
              {/* Send invoice - only for draft invoices */}
              {invoice.status === 'draft' && (
                <DropdownMenuItem onSelect={onSendInvoice} disabled={isUpdatingStatus}>
                  {isUpdatingStatus ? (
                    <SpinnerGap size={16} className="mr-2 animate-spin" />
                  ) : (
                    <PaperPlaneTilt size={16} className="mr-2" />
                  )}
                  {t('zzpInvoices.sendInvoice')}
                </DropdownMenuItem>
              )}
              
              {/* Mark as Paid / Unpaid - only for non-draft, non-cancelled invoices */}
              {invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
                <>
                  {invoice.status === 'paid' ? (
                    <DropdownMenuItem onSelect={onMarkUnpaid} disabled={isUpdatingStatus}>
                      {isUpdatingStatus ? (
                        <SpinnerGap size={16} className="mr-2 animate-spin" />
                      ) : (
                        <XCircle size={16} className="mr-2" />
                      )}
                      {t('zzpInvoices.markUnpaid')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={onMarkPaid} disabled={isUpdatingStatus}>
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
              
              {/* Delete - only for draft invoices */}
              {invoice.status === 'draft' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onSelect={onDelete}
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

export const ZZPInvoicesPage = () => {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<ZZPInvoice[]>([])
  const [customers, setCustomers] = useState<ZZPCustomer[]>([])
  const [businessProfile, setBusinessProfile] = useState<ZZPBusinessProfile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const showLoading = useDelayedLoading(isLoading, 300, invoices.length > 0)
  
  // Pre-selected customer ID from URL (for CTA from customers page)
  const [preSelectedCustomerId, setPreSelectedCustomerId] = useState<string | null>(null)
  // Customer ID to pass to dialog (keeps value until dialog closes)
  const [dialogCustomerId, setDialogCustomerId] = useState<string | null>(null)
  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchQuery, 300)
  
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

  // Check for customer_id in URL params or invoice_id in URL path
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const customerId = params.get('customer_id')
    if (customerId) {
      setPreSelectedCustomerId(customerId)
      // Clear the URL param after reading it
      window.history.replaceState({}, '', window.location.pathname)
    }
    
    // Check for invoice ID in URL path: /zzp/invoices/:id
    const pathParts = window.location.pathname.split('/')
    const invoicesIndex = pathParts.indexOf('invoices')
    if (invoicesIndex !== -1 && pathParts[invoicesIndex + 1]) {
      const invoiceId = pathParts[invoicesIndex + 1]
      // We'll handle this after invoices are loaded
      setPreSelectedInvoiceId(invoiceId)
      // Clean up the URL to /zzp/invoices
      window.history.replaceState({}, '', '/zzp/invoices')
    }
  }, [])

  // Load data from API
  const loadData = useCallback(async () => {
    if (!user?.id) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      // Load invoices, customers, and business profile in parallel
      const [invoicesResponse, customersResponse, profileData] = await Promise.all([
        zzpApi.invoices.list(),
        zzpApi.customers.list(),
        zzpApi.profile.get().catch(() => null), // Profile might not exist
      ])
      
      setInvoices(invoicesResponse.invoices)
      setCustomers(customersResponse.customers)
      setBusinessProfile(profileData)
    } catch (err) {
      console.error('Failed to load data:', err)
      const errorMessage = parseApiError(err)
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

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
  
  // Auto-open invoice view when pre-selected invoice ID is set and data is loaded
  useEffect(() => {
    if (preSelectedInvoiceId && invoices.length > 0 && !isLoading) {
      // Find the invoice
      const invoice = invoices.find(inv => inv.id === preSelectedInvoiceId)
      if (invoice) {
        setViewingInvoice(invoice)
      } else {
        toast.error(t('zzpInvoices.invoiceNotFound') || 'Invoice not found')
      }
      setPreSelectedInvoiceId(null) // Clear after opening
    }
  }, [preSelectedInvoiceId, invoices, isLoading])

  // Create customer lookup map
  const customerMap = useMemo(() => {
    const map = new Map<string, ZZPCustomer>()
    customers.forEach(c => map.set(c.id, c))
    return map
  }, [customers])

  // Calculate stats
  const stats = useMemo(() => {
    const total = invoices.length
    const draft = invoices.filter(i => i.status === 'draft').length
    const sent = invoices.filter(i => i.status === 'sent').length
    const paid = invoices.filter(i => i.status === 'paid').length
    const overdue = invoices.filter(i => i.status === 'overdue').length
    const totalAmount = invoices.reduce((sum, i) => sum + i.total_cents, 0)
    const paidAmount = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.total_cents, 0)
    const openAmount = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, i) => sum + i.total_cents, 0)
    return { total, draft, sent, paid, overdue, totalAmount, paidAmount, openAmount }
  }, [invoices])

  // Filter invoices based on search and status
  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      // Status filter
      if (statusFilter !== 'all' && invoice.status !== statusFilter) {
        return false
      }
      
      // Search filter (debounced)
      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase()
        const matchesNumber = invoice.invoice_number.toLowerCase().includes(query)
        const matchesCustomer = invoice.customer_name?.toLowerCase().includes(query)
        // Also search in amount
        const matchesAmount = formatAmountEUR(invoice.total_cents).toLowerCase().includes(query)
        if (!matchesNumber && !matchesCustomer && !matchesAmount) {
          return false
        }
      }
      
      return true
    })
  }, [invoices, debouncedSearch, statusFilter])

  // Active customers for quick actions
  const activeCustomers = useMemo(() => {
    return customers.filter(c => c.status === 'active')
  }, [customers])

  // Check if we have active customers
  const hasActiveCustomers = useMemo(() => {
    return activeCustomers.length > 0
  }, [activeCustomers])

  // Handle adding/editing invoice
  const handleSaveInvoice = useCallback(async (data: ZZPInvoiceCreate, isEdit: boolean) => {
    try {
      if (isEdit && editingInvoice) {
        // Update existing
        await zzpApi.invoices.update(editingInvoice.id, {
          customer_id: data.customer_id,
          issue_date: data.issue_date,
          due_date: data.due_date,
          notes: data.notes,
          lines: data.lines,
        })
        toast.success(t('zzpInvoices.invoiceSaved'))
      } else {
        // Create new
        await zzpApi.invoices.create(data)
        toast.success(t('zzpInvoices.invoiceSaved'))
      }

      setIsFormOpen(false)
      setEditingInvoice(undefined)
      // Reload data
      await loadData()
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
    } catch (err) {
      console.error('Failed to update status:', err)
      toast.error(parseApiError(err))
    } finally {
      setUpdatingStatusInvoiceId(null)
    }
  }, [loadData])

  // Handle send invoice (draft → sent)
  const handleSendInvoice = useCallback(async (invoice: ZZPInvoice) => {
    setUpdatingStatusInvoiceId(invoice.id)
    try {
      toast.info(t('zzpInvoices.sending'))
      await zzpApi.invoices.sendEmail(invoice.id)
      toast.success(t('zzpInvoices.invoiceSent'))
      await loadData()
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
    } catch (err) {
      console.error('Failed to delete invoice:', err)
      toast.error(parseApiError(err))
    }
  }, [deletingInvoice, loadData])

  // Handle PDF download - download actual PDF from server (mobile-safe)
  // Uses fetch -> blob -> createObjectURL -> anchor/window.open for mobile compatibility
  // Implements iOS Safari workaround and Web Share API for file sharing
  const handleDownloadPdf = useCallback(async (invoice: ZZPInvoice) => {
    const filename = `${invoice.invoice_number || `INV-${invoice.id}`}.pdf`
    
    console.log('[PDF Download] Starting download for invoice:', invoice.id, 'filename:', filename)
    
    try {
      setDownloadingInvoiceId(invoice.id)
      toast.info(t('zzpInvoices.pdfDownloading'))
      
      // Download PDF as blob from backend
      console.log('[PDF Download] Fetching PDF blob from API...')
      const blob = await zzpApi.invoices.downloadPdf(invoice.id)
      
      // Ensure blob has correct MIME type for PDF
      const pdfBlob = new Blob([blob], { type: 'application/pdf' })
      console.log('[PDF Download] Blob received, size:', pdfBlob.size, 'bytes')
      
      // Check if blob is valid
      if (pdfBlob.size === 0) {
        throw new Error(`Empty PDF blob received for invoice ${invoice.id}`)
      }
      
      // Create object URL for the PDF blob
      const blobUrl = window.URL.createObjectURL(pdfBlob)
      console.log('[PDF Download] Created blob URL:', blobUrl)
      
      // iOS Safari: Use window.open to open PDF in new tab
      // iOS ignores download attribute, so opening in viewer is the best approach
      if (isIOS()) {
        console.log('[PDF Download] iOS detected, opening PDF in new tab...')
        const newWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer')
        
        if (!newWindow) {
          // If popup was blocked, notify user
          console.error('[PDF Download] Popup blocked by browser')
          toast.error(t('zzpInvoices.popupBlocked'))
          window.URL.revokeObjectURL(blobUrl)
          return
        }
        
        // Clean up blob URL after a long delay for iOS (slow to load)
        setTimeout(() => {
          console.log('[PDF Download] Revoking blob URL after iOS delay')
          window.URL.revokeObjectURL(blobUrl)
        }, PDF_URL_REVOCATION_DELAY_MS * IOS_REVOCATION_DELAY_MULTIPLIER)
      } else {
        // Desktop and Android: Use anchor element with download attribute
        console.log('[PDF Download] Creating anchor element for download...')
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = filename
        link.rel = 'noopener'  // Security: prevent window.opener access
        link.style.display = 'none'
        
        document.body.appendChild(link)
        link.click()
        
        // Small delay before removing to ensure click is processed
        setTimeout(() => {
          document.body.removeChild(link)
          console.log('[PDF Download] Anchor removed from DOM')
        }, 100)
        
        // Clean up blob URL after a delay
        // iOS needs longer delay due to slower blob loading, Android works fine with standard delay
        const revokeDelay = isIOS() 
          ? PDF_URL_REVOCATION_DELAY_MS * IOS_REVOCATION_DELAY_MULTIPLIER 
          : PDF_URL_REVOCATION_DELAY_MS
        setTimeout(() => {
          console.log('[PDF Download] Revoking blob URL after delay')
          window.URL.revokeObjectURL(blobUrl)
        }, revokeDelay)
      }
      
      // Success toast shown after all download attempts
      console.log('[PDF Download] Download initiated successfully')
      toast.success(t('zzpInvoices.pdfDownloaded'))
    } catch (err) {
      console.error('[PDF Download] Failed to download PDF:', err)
      
      // Parse and show detailed error message
      const errorMessage = parseApiError(err)
      if (errorMessage) {
        toast.error(`${t('zzpInvoices.pdfError')}: ${errorMessage}`)
      } else {
        toast.error(t('zzpInvoices.pdfError'))
      }
    } finally {
      setDownloadingInvoiceId(null)
    }
  }, [])

  // Handle copy invoice link to clipboard (PDF download URL)
  // Note: This URL requires authentication, so it's for internal use only
  const handleCopyLink = useCallback(async (invoice: ZZPInvoice) => {
    console.log('[PDF Copy Link] Copying link for invoice:', invoice.id)
    try {
      // Copy the PDF download URL (requires authentication)
      const pdfUrl = zzpApi.invoices.getPdfUrl(invoice.id)
      console.log('[PDF Copy Link] URL to copy:', pdfUrl)
      
      await navigator.clipboard.writeText(pdfUrl)
      console.log('[PDF Copy Link] Link copied successfully')
      toast.success(t('zzpInvoices.invoiceLinkCopied'))
    } catch (err) {
      console.error('[PDF Copy Link] Failed to copy link:', err)
      toast.error(t('common.error'))
    }
  }, [])

  // Handle share invoice (Web Share API with PDF file sharing)
  // Shares the actual PDF file if supported, otherwise falls back to URL sharing
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
      if (navigator.share && navigator.canShare) {
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
        }
      }
      
      if (navigator.share) {
        // Fallback: Share PDF URL instead of file (for browsers that don't support file sharing)
        console.log('[PDF Share] File sharing not supported, sharing URL instead...')
        const pdfUrl = zzpApi.invoices.getPdfUrl(invoice.id)
        await navigator.share({
          title: t('zzpInvoices.shareTitle').replace('{number}', invoiceNumber),
          text: t('zzpInvoices.shareText').replace('{number}', invoiceNumber),
          url: pdfUrl,
        })
        console.log('[PDF Share] URL shared successfully')
        toast.success(t('zzpInvoices.shareSuccess'))
      } else {
        // No Web Share API available: copy link to clipboard as fallback
        console.log('[PDF Share] Web Share API not available, copying link to clipboard...')
        const pdfUrl = zzpApi.invoices.getPdfUrl(invoice.id)
        await navigator.clipboard.writeText(pdfUrl)
        toast.success(t('zzpInvoices.invoiceLinkCopied'))
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
            <Button onClick={openNewForm} className="gap-2 h-10 sm:h-11 w-full sm:w-auto" disabled={!hasActiveCustomers}>
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

        {/* Show loading, empty state or content */}
        {showLoading ? (
          <TableLoadingSkeleton />
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
                    {statusFilter !== 'all' && ` (${
                      statusFilter === 'draft' ? t('zzpInvoices.filterDraft') :
                      statusFilter === 'sent' ? t('zzpInvoices.filterSent') :
                      statusFilter === 'paid' ? t('zzpInvoices.filterPaid') :
                      statusFilter === 'overdue' ? t('zzpInvoices.filterOverdue') :
                      statusFilter === 'cancelled' ? t('zzpInvoices.filterCancelled') : ''
                    })`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search and filter controls */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                  <MagnifyingGlass 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
                    size={18} 
                  />
                  <Input
                    placeholder={t('zzpInvoices.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11"
                  />
                </div>
                <Select 
                  value={statusFilter} 
                  onValueChange={(value) => setStatusFilter(value as 'all' | InvoiceStatus)}
                >
                  <SelectTrigger className="w-full sm:w-44 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('zzpInvoices.filterAll')}</SelectItem>
                    <SelectItem value="draft">{t('zzpInvoices.filterDraft')}</SelectItem>
                    <SelectItem value="sent">{t('zzpInvoices.filterSent')}</SelectItem>
                    <SelectItem value="paid">{t('zzpInvoices.filterPaid')}</SelectItem>
                    <SelectItem value="overdue">{t('zzpInvoices.filterOverdue')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
                    const canEdit = invoice.status === 'draft'
                    return (
                      <InvoiceCard
                        key={invoice.id}
                        invoice={invoice}
                        onView={() => openViewForm(invoice)}
                        onEdit={() => openEditForm(invoice)}
                        onDelete={() => setDeletingInvoice(invoice)}
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
                        const canEdit = invoice.status === 'draft'
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
                              {invoice.status === 'draft' ? (
                                <StatusBadge status={invoice.status} />
                              ) : (
                                <Select 
                                  value={invoice.status} 
                                  onValueChange={(value) => handleStatusChange(invoice, value as 'sent' | 'paid' | 'cancelled')}
                                >
                                  <SelectTrigger className="w-auto border-0 p-0 h-auto focus:ring-0">
                                    <StatusBadge status={invoice.status} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="sent">{t('zzpInvoices.statusSent')}</SelectItem>
                                    <SelectItem value="paid">{t('zzpInvoices.statusPaid')}</SelectItem>
                                    <SelectItem value="cancelled">{t('zzpInvoices.statusCancelled')}</SelectItem>
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
                                {invoice.status === 'draft' && (
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
                                    
                                    {/* Status actions separator - show for all except cancelled */}
                                    {invoice.status !== 'cancelled' && (
                                      <DropdownMenuSeparator />
                                    )}
                                    
                                    {/* Send invoice - only for draft invoices */}
                                    {invoice.status === 'draft' && (
                                      <DropdownMenuItem 
                                        onSelect={() => handleSendInvoice(invoice)}
                                        disabled={updatingStatusInvoiceId === invoice.id}
                                      >
                                        {updatingStatusInvoiceId === invoice.id ? (
                                          <SpinnerGap size={16} className="mr-2 animate-spin" />
                                        ) : (
                                          <PaperPlaneTilt size={16} className="mr-2" />
                                        )}
                                        {t('zzpInvoices.sendInvoice')}
                                      </DropdownMenuItem>
                                    )}
                                    
                                    {/* Mark as Paid / Unpaid - only for non-draft, non-cancelled invoices */}
                                    {invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
                                      <>
                                        {invoice.status === 'paid' ? (
                                          <DropdownMenuItem 
                                            onSelect={() => handleMarkUnpaid(invoice)}
                                            disabled={updatingStatusInvoiceId === invoice.id}
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
                                            disabled={updatingStatusInvoiceId === invoice.id}
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
                                    
                                    {/* Delete - only for draft invoices */}
                                    {invoice.status === 'draft' && (
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
