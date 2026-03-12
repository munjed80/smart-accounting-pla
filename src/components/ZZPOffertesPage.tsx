/**
 * ZZP Offertes Page
 *
 * Full CRUD functionality for managing offertes (quotes) via backend API.
 * Offertes are linked to customers and can be converted to facturen (invoices).
 * Reuses the same visual patterns and components as ZZPInvoicesPage.
 *
 * Statuses: Concept | Verzonden | Geaccepteerd | Verlopen | Geweigerd | Omgezet naar factuur
 */

import { useState, useEffect, useMemo, useCallback, Component, ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
  CalendarBlank,
  Hourglass,
  SpinnerGap,
  XCircle,
  Info,
  Eye,
  DotsThreeVertical,
  Download,
  ShareNetwork,
  CopySimple,
  ArrowsCounterClockwise,
  Prohibit,
  Timer,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthContext'
import { navigateTo } from '@/lib/navigation'
import {
  zzpApi,
  ZZPQuote,
  ZZPQuoteCreate,
  ZZPQuoteLineCreate,
  ZZPCustomer,
  ZZPBusinessProfile,
  getApiBaseUrl,
  QuoteStatus,
} from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/useDebounce'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { ApiHttpError, NetworkError, ServerError, UnauthorizedError } from '@/lib/errors'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatAmountEUR(amountCents: number): string {
  const safeAmount = Number(amountCents)
  const normalizedAmount = Number.isFinite(safeAmount) ? safeAmount : 0
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(normalizedAmount / 100)
}

function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const parsedDate = new Date(isoDate)
  if (Number.isNaN(parsedDate.getTime())) return '—'
  return new Intl.DateTimeFormat('nl-NL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsedDate)
}

const getStatusCodeFromError = (error: unknown): number | null => {
  if (error instanceof ApiHttpError && error.statusCode) return error.statusCode
  if (typeof error === 'object' && error !== null) {
    const maybeStatus = (error as { statusCode?: unknown }).statusCode
    if (typeof maybeStatus === 'number') return maybeStatus
    const responseStatus = (error as { response?: { status?: unknown } }).response?.status
    if (typeof responseStatus === 'number') return responseStatus
  }
  return null
}

function normalizeListResponse<T>(response: unknown, primaryKey?: string): T[] {
  if (Array.isArray(response)) return response as T[]
  if (response !== null && typeof response === 'object') {
    const obj = response as Record<string, unknown>
    if (primaryKey && Array.isArray(obj[primaryKey])) return obj[primaryKey] as T[]
    for (const key of ['data', 'items', 'results']) {
      if (Array.isArray(obj[key])) return obj[key] as T[]
    }
  }
  return []
}

const extractDatePart = (isoString: string | undefined): string => {
  if (!isoString) return ''
  return isoString.split('T')[0]
}

const parseAmountToCents = (value: string): number | null => {
  const normalized = value.replace(',', '.')
  const parsed = parseFloat(normalized)
  if (isNaN(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

// ── Status badge ──────────────────────────────────────────────────────────────

const QuoteStatusBadge = ({ status, size = 'default' }: { status: QuoteStatus; size?: 'default' | 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'text-xs py-0.5 px-1.5' : ''
  const iconSize = size === 'sm' ? 12 : 14

  const config: Record<QuoteStatus, { bg: string; text: string; border: string; icon: React.ReactNode; label: string }> = {
    draft: {
      bg: 'bg-gray-500/20',
      text: 'text-gray-600 dark:text-gray-400',
      border: 'border-gray-500/40',
      icon: <Clock size={iconSize} className="mr-1" weight="fill" />,
      label: 'Concept',
    },
    sent: {
      bg: 'bg-blue-500/20',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-500/40',
      icon: <PaperPlaneTilt size={iconSize} className="mr-1" weight="fill" />,
      label: 'Verzonden',
    },
    accepted: {
      bg: 'bg-green-500/20',
      text: 'text-green-700 dark:text-green-400',
      border: 'border-green-500/40',
      icon: <CheckCircle size={iconSize} className="mr-1" weight="fill" />,
      label: 'Geaccepteerd',
    },
    rejected: {
      bg: 'bg-red-500/20',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-500/40',
      icon: <Prohibit size={iconSize} className="mr-1" weight="fill" />,
      label: 'Geweigerd',
    },
    expired: {
      bg: 'bg-orange-500/20',
      text: 'text-orange-600 dark:text-orange-400',
      border: 'border-orange-500/40',
      icon: <Timer size={iconSize} className="mr-1" weight="fill" />,
      label: 'Verlopen',
    },
    converted: {
      bg: 'bg-purple-500/20',
      text: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-500/40',
      icon: <ArrowsCounterClockwise size={iconSize} className="mr-1" weight="fill" />,
      label: 'Omgezet naar factuur',
    },
  }

  const cfg = config[status] ?? config.draft
  const { bg, text, border, icon, label } = cfg

  return (
    <Badge variant="outline" className={`${bg} ${text} ${border} ${sizeClasses}`}>
      {icon}
      {label}
    </Badge>
  )
}

// ── Stats card ────────────────────────────────────────────────────────────────

const StatsCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  className = '',
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

// ── Line item form types ──────────────────────────────────────────────────────

interface QuoteLineFormData {
  id?: string
  description: string
  quantity: string
  unitPrice: string
  vatRate: string
}

const createEmptyLine = (): QuoteLineFormData => ({
  description: '',
  quantity: '1',
  unitPrice: '',
  vatRate: '21',
})

// ── No customers warning ──────────────────────────────────────────────────────

const NoCustomersWarning = () => (
  <Alert className="border-amber-500/30 bg-amber-500/10">
    <Warning size={16} className="text-amber-500" weight="fill" />
    <AlertDescription className="text-sm">
      Je hebt nog geen actieve klanten.{' '}
      <button
        onClick={() => navigateTo('/zzp/customers')}
        className="font-medium text-primary hover:underline"
      >
        Voeg een klant toe
      </button>{' '}
      om een offerte te maken.
    </AlertDescription>
  </Alert>
)

// ── Empty state ───────────────────────────────────────────────────────────────

const EmptyState = ({ onAddQuote, hasCustomers }: { onAddQuote: () => void; hasCustomers: boolean }) => (
  <Card className="bg-card/80 backdrop-blur-sm">
    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <FileText size={32} className="text-primary" weight="duotone" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Nog geen offertes</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        Maak je eerste offerte aan en stuur deze naar je klant.
      </p>
      <Button onClick={onAddQuote} disabled={!hasCustomers} className="gap-2">
        <Plus size={16} weight="bold" />
        Nieuwe offerte
      </Button>
    </CardContent>
  </Card>
)

// ── Quote form dialog ─────────────────────────────────────────────────────────

const QuoteFormDialog = ({
  open,
  onOpenChange,
  quote,
  customers,
  onSave,
  isReadOnly = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  quote?: ZZPQuote
  customers: ZZPCustomer[]
  onSave: (data: ZZPQuoteCreate, isEdit: boolean) => Promise<void>
  isReadOnly?: boolean
}) => {
  const isEdit = !!quote
  const [customerId, setCustomerId] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [lines, setLines] = useState<QuoteLineFormData[]>([createEmptyLine()])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [customerError, setCustomerError] = useState('')
  const [dateError, setDateError] = useState('')
  const [linesError, setLinesError] = useState('')

  const activeCustomers = useMemo(() =>
    customers.filter(c => c.status === 'active'),
    [customers]
  )

  useEffect(() => {
    if (open) {
      if (quote) {
        setCustomerId(quote.customer_id)
        setIssueDate(extractDatePart(quote.issue_date))
        setValidUntil(extractDatePart(quote.valid_until ?? undefined))
        setTitle(quote.title || '')
        setNotes(quote.notes || '')
        setTerms(quote.terms || '')
        if (quote.lines && quote.lines.length > 0) {
          setLines(quote.lines.map(line => ({
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
        setCustomerId('')
        setIssueDate(extractDatePart(new Date().toISOString()))
        // Default valid_until: 30 days from now
        const validDate = new Date()
        validDate.setDate(validDate.getDate() + 30)
        setValidUntil(extractDatePart(validDate.toISOString()))
        setTitle('')
        setNotes('')
        setTerms('')
        setLines([createEmptyLine()])
      }
      setCustomerError('')
      setDateError('')
      setLinesError('')
      setIsSubmitting(false)
    }
  }, [open, quote])

  const addLine = () => setLines([...lines, createEmptyLine()])
  const removeLine = (index: number) => {
    if (lines.length > 1) setLines(lines.filter((_, i) => i !== index))
  }
  const updateLine = (index: number, field: keyof QuoteLineFormData, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }
    setLines(newLines)
    setLinesError('')
  }

  const calculateLineTotal = (line: QuoteLineFormData): number => {
    const qty = parseFloat(line.quantity.replace(',', '.')) || 0
    const unitPriceCents = parseAmountToCents(line.unitPrice) || 0
    return qty * unitPriceCents
  }

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
    return { subtotal, vatTotal, total: subtotal + vatTotal }
  }, [lines])

  const validateAndConvertLines = (): ZZPQuoteLineCreate[] | null => {
    const validLines: ZZPQuoteLineCreate[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.description.trim()) {
        setLinesError('Omschrijving is verplicht.')
        return null
      }
      const qty = parseFloat(line.quantity.replace(',', '.'))
      if (isNaN(qty) || qty <= 0) {
        setLinesError('Aantal moet groter zijn dan 0.')
        return null
      }
      const unitPriceCents = parseAmountToCents(line.unitPrice)
      if (unitPriceCents === null || unitPriceCents <= 0) {
        setLinesError('Prijs per eenheid is verplicht.')
        return null
      }
      const vatRate = parseFloat(line.vatRate)
      if (isNaN(vatRate) || vatRate < 0) {
        setLinesError('BTW-percentage is verplicht.')
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

    if (!customerId) {
      setCustomerError('Klant is verplicht.')
      hasError = true
    }

    if (!issueDate) {
      setDateError('Offertedatum is verplicht.')
      hasError = true
    }

    const validLines = validateAndConvertLines()
    if (!validLines) hasError = true

    if (hasError || !validLines) {
      toast.error('Controleer de ingevulde gegevens.')
      return
    }

    setIsSubmitting(true)
    try {
      const quoteData: ZZPQuoteCreate = {
        customer_id: customerId,
        issue_date: issueDate,
        valid_until: validUntil || undefined,
        title: title.trim() || undefined,
        notes: notes.trim() || undefined,
        terms: terms.trim() || undefined,
        lines: validLines,
      }
      await onSave(quoteData, isEdit)
    } catch (err) {
      console.error('Failed to save quote:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasValidLines = lines.some(line =>
    line.description.trim() &&
    parseFloat(line.quantity.replace(',', '.')) > 0 &&
    (parseAmountToCents(line.unitPrice) ?? 0) > 0
  )

  const isFormValid = customerId && issueDate && hasValidLines
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
                <FileText size={24} className="text-primary" weight="duotone" />
              )}
            </div>
            {isReadOnly ? 'Offerte bekijken' : isEdit ? 'Offerte bewerken' : 'Nieuwe offerte'}
            {quote && (
              <span className="font-mono text-sm text-muted-foreground">
                {quote.quote_number}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isReadOnly
              ? 'Bekijk de offerte details'
              : isEdit
                ? 'Pas de offerte aan en sla op'
                : 'Vul de offerte gegevens in'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-5">
          {/* Customer */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Users size={14} className="text-muted-foreground" />
              Klant <span className="text-destructive">*</span>
            </Label>
            <Select value={customerId} onValueChange={(value) => {
              setCustomerId(value)
              setCustomerError('')
            }} disabled={formDisabled}>
              <SelectTrigger className={`h-11 ${customerError ? 'border-destructive focus-visible:ring-destructive' : ''}`}>
                <SelectValue placeholder="Selecteer een klant" />
              </SelectTrigger>
              <SelectContent>
                {activeCustomers.length === 0 ? (
                  <div className="p-3 text-center text-sm text-muted-foreground">
                    Geen actieve klanten
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

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="quote-title" className="text-sm font-medium flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" />
              Onderwerp (optioneel)
            </Label>
            <Input
              id="quote-title"
              placeholder="Bijv. Webontwikkeling fase 2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={formDisabled}
              className="h-11"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quote-date" className="text-sm font-medium flex items-center gap-2">
                <CalendarBlank size={14} className="text-muted-foreground" />
                Offertedatum <span className="text-destructive">*</span>
              </Label>
              <Input
                id="quote-date"
                type="date"
                value={issueDate}
                onChange={(e) => {
                  setIssueDate(e.target.value)
                  setDateError('')
                }}
                disabled={formDisabled}
                className={`h-11 ${dateError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              />
              {dateError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle size={14} />
                  {dateError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-valid-until" className="text-sm font-medium flex items-center gap-2">
                <CalendarBlank size={14} className="text-muted-foreground" />
                Geldig tot
              </Label>
              <Input
                id="quote-valid-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                disabled={formDisabled}
                className="h-11"
              />
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Regels <span className="text-destructive">*</span></Label>

            {/* Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-xs font-medium text-muted-foreground">
              <span className="col-span-4">Omschrijving</span>
              <span className="col-span-2 text-center">Aantal</span>
              <span className="col-span-2 text-right">Prijs (€)</span>
              <span className="col-span-2 text-center">BTW %</span>
              <span className="col-span-1 text-right">Totaal</span>
              <span className="col-span-1" />
            </div>

            {lines.map((line, index) => {
              const lineTotal = calculateLineTotal(line)
              const vatAmount = Math.round(lineTotal * (parseFloat(line.vatRate) || 0) / 100)
              return (
                <div key={index} className="grid grid-cols-12 gap-2 items-start p-3 sm:p-0 bg-muted/30 sm:bg-transparent rounded-lg sm:rounded-none">
                  <div className="col-span-12 sm:col-span-4">
                    <Input
                      placeholder="Omschrijving"
                      value={line.description}
                      onChange={(e) => updateLine(index, 'description', e.target.value)}
                      disabled={formDisabled}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      placeholder="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                      disabled={formDisabled}
                      className="h-9 text-sm text-center"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      placeholder="0,00"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(index, 'unitPrice', e.target.value)}
                      disabled={formDisabled}
                      className="h-9 text-sm text-right"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Select
                      value={line.vatRate}
                      onValueChange={(v) => updateLine(index, 'vatRate', v)}
                      disabled={formDisabled}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="9">9%</SelectItem>
                        <SelectItem value="21">21%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-11 sm:col-span-1 flex items-center justify-end">
                    <span className="text-xs sm:text-sm font-medium">
                      {formatAmountEUR(lineTotal + vatAmount)}
                    </span>
                  </div>
                  <div className="col-span-1 flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(index)}
                      disabled={formDisabled || lines.length <= 1}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <XCircle size={16} />
                    </Button>
                  </div>
                </div>
              )
            })}

            {linesError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle size={14} />
                {linesError}
              </p>
            )}

            {!formDisabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                className="gap-2 text-sm"
              >
                <Plus size={14} weight="bold" />
                Regel toevoegen
              </Button>
            )}
          </div>

          {/* Totals summary */}
          {hasValidLines && (
            <div className="rounded-xl bg-muted/50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotaal</span>
                <span>{formatAmountEUR(calculatedTotals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">BTW</span>
                <span>{formatAmountEUR(calculatedTotals.vatTotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t border-border/50 pt-2">
                <span>Totaal</span>
                <span>{formatAmountEUR(calculatedTotals.total)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="quote-notes" className="text-sm font-medium">
              Opmerkingen (optioneel)
            </Label>
            <Textarea
              id="quote-notes"
              placeholder="Extra informatie voor de klant..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={formDisabled}
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          {/* Terms */}
          <div className="space-y-2">
            <Label htmlFor="quote-terms" className="text-sm font-medium">
              Voorwaarden (optioneel)
            </Label>
            <Textarea
              id="quote-terms"
              placeholder="Algemene voorwaarden of betalingsafspraken..."
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              disabled={formDisabled}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-border/50 gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Annuleren
          </Button>
          {!isReadOnly && (
            <Button
              onClick={handleSave}
              disabled={!isFormValid || isSubmitting}
              className="gap-2"
            >
              {isSubmitting && <SpinnerGap size={16} className="animate-spin" />}
              {isEdit ? 'Opslaan' : 'Offerte aanmaken'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Quote card (mobile) ───────────────────────────────────────────────────────

const QuoteCard = ({
  quote,
  onView,
  onEdit,
  onDelete,
  onDownload,
  onShare,
  onConvert,
  onStatusChange,
  isDownloading,
  isUpdating,
}: {
  quote: ZZPQuote
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onDownload: () => void
  onShare: () => void
  onConvert: () => void
  onStatusChange: (status: QuoteStatus) => void
  isDownloading: boolean
  isUpdating: boolean
}) => {
  const canEdit = quote.status === 'draft' || quote.status === 'sent'
  const canDelete = quote.status === 'draft'
  const canConvert = quote.status !== 'converted' && quote.status !== 'rejected'

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText size={20} className="text-primary" weight="duotone" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-medium">{quote.quote_number}</span>
                <QuoteStatusBadge status={quote.status} size="sm" />
              </div>
              <p className="text-sm font-medium truncate mt-0.5">
                {quote.customer_name || '—'}
              </p>
              {quote.title && (
                <p className="text-xs text-muted-foreground truncate">{quote.title}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {formatDate(quote.issue_date)}
                {quote.valid_until && ` · geldig tot ${formatDate(quote.valid_until)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-semibold text-sm">{formatAmountEUR(quote.total_cents)}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <DotsThreeVertical size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onView}>
                  <Eye size={16} className="mr-2" />
                  Bekijken
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <PencilSimple size={16} className="mr-2" />
                    Bewerken
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {quote.status === 'draft' && (
                  <DropdownMenuItem onClick={() => onStatusChange('sent')} disabled={isUpdating}>
                    <PaperPlaneTilt size={16} className="mr-2" />
                    Markeren als verzonden
                  </DropdownMenuItem>
                )}
                {quote.status === 'sent' && (
                  <>
                    <DropdownMenuItem onClick={() => onStatusChange('accepted')} disabled={isUpdating}>
                      <CheckCircle size={16} className="mr-2" />
                      Geaccepteerd
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStatusChange('rejected')} disabled={isUpdating}>
                      <Prohibit size={16} className="mr-2" />
                      Geweigerd
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStatusChange('expired')} disabled={isUpdating}>
                      <Timer size={16} className="mr-2" />
                      Verlopen
                    </DropdownMenuItem>
                  </>
                )}
                {canConvert && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onConvert} disabled={isUpdating} className="text-green-600 focus:text-green-600">
                      <ArrowsCounterClockwise size={16} className="mr-2" />
                      Omzetten naar factuur
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDownload} disabled={isDownloading}>
                  {isDownloading ? (
                    <SpinnerGap size={16} className="mr-2 animate-spin" />
                  ) : (
                    <Download size={16} className="mr-2" />
                  )}
                  PDF downloaden
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onShare}>
                  <ShareNetwork size={16} className="mr-2" />
                  Delen
                </DropdownMenuItem>
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                      <TrashSimple size={16} className="mr-2" />
                      Verwijderen
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
}

// ── Error boundary ────────────────────────────────────────────────────────────

class OffertesErrorBoundary extends Component<
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
    console.error('[ZZPOffertesPage] Unhandled render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <Card className="bg-card/80 backdrop-blur-sm border-destructive/30">
              <CardHeader>
                <CardTitle>Offertes tijdelijk niet beschikbaar</CardTitle>
                <CardDescription>
                  Er is een onverwachte fout opgetreden bij het laden van de offertes.
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

// ── Main export ───────────────────────────────────────────────────────────────

export const ZZPOffertesPage = () => {
  return (
    <OffertesErrorBoundary>
      <ZZPOffertesPageContent />
    </OffertesErrorBoundary>
  )
}

// ── Page content ──────────────────────────────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'success' | 'forbidden' | 'server' | 'network' | 'error'

const ZZPOffertesPageContent = () => {
  const { user } = useAuth()
  const [quotes, setQuotes] = useState<ZZPQuote[]>([])
  const [customers, setCustomers] = useState<ZZPCustomer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const showLoading = useDelayedLoading(isLoading, 300, quotes.length > 0)
  const debouncedSearch = useDebounce(searchQuery, 300)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingQuote, setEditingQuote] = useState<ZZPQuote | undefined>()
  const [viewingQuote, setViewingQuote] = useState<ZZPQuote | undefined>()
  const [deletingQuote, setDeletingQuote] = useState<ZZPQuote | undefined>()
  const [convertingQuote, setConvertingQuote] = useState<ZZPQuote | undefined>()

  const [downloadingQuoteId, setDownloadingQuoteId] = useState<string | null>(null)
  const [updatingStatusQuoteId, setUpdatingStatusQuoteId] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)

  const administrationId = typeof window !== 'undefined' ? localStorage.getItem('administration_id') : null

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    setLoadState('loading')

    try {
      const [quotesResponse, customersResponse] = await Promise.all([
        zzpApi.quotes.list(),
        zzpApi.customers.list(),
      ])

      const normalizedQuotes = normalizeListResponse<ZZPQuote>(quotesResponse, 'quotes')
      const normalizedCustomers = normalizeListResponse<ZZPCustomer>(customersResponse, 'customers')

      setQuotes(normalizedQuotes)
      setCustomers(normalizedCustomers)
      setLoadState('success')
    } catch (err) {
      console.error('[Offertes] Failed to load page data', {
        userRole: user.role,
        administration_id: administrationId,
        error: err,
      })

      const statusCode = getStatusCodeFromError(err)

      if (statusCode === 401 || statusCode === 403 || err instanceof UnauthorizedError) {
        setError('Geen toegang tot offertes.')
        setLoadState('forbidden')
      } else if ((statusCode !== null && statusCode >= 500) || err instanceof ServerError) {
        setError('Serverfout bij het laden van offertes.')
        setLoadState('server')
      } else if (err instanceof NetworkError || statusCode === null) {
        setError('Geen verbinding met de server.')
        setLoadState('network')
      } else {
        const errorMessage = parseApiError(err)
        setError(errorMessage)
        setLoadState('error')
      }

      toast.error(parseApiError(err))
      setQuotes([])
      setCustomers([])
    } finally {
      setIsLoading(false)
    }
  }, [administrationId, user?.id, user?.role])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeCustomers = useMemo(() =>
    customers.filter(c => c.status === 'active'),
    [customers]
  )
  const hasActiveCustomers = activeCustomers.length > 0

  // Stats
  const stats = useMemo(() => {
    const total = quotes.length
    const draft = quotes.filter(q => q.status === 'draft').length
    const sent = quotes.filter(q => q.status === 'sent').length
    const accepted = quotes.filter(q => q.status === 'accepted').length
    const converted = quotes.filter(q => q.status === 'converted').length
    const totalAmount = quotes.reduce((sum, q) => sum + q.total_cents, 0)
    const acceptedAmount = quotes.filter(q => q.status === 'accepted').reduce((sum, q) => sum + q.total_cents, 0)
    return { total, draft, sent, accepted, converted, totalAmount, acceptedAmount }
  }, [quotes])

  // Filtered quotes
  const filteredQuotes = useMemo(() => {
    let result = quotes
    if (statusFilter !== 'all') {
      result = result.filter(q => q.status === statusFilter)
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(quote =>
        quote.quote_number.toLowerCase().includes(q) ||
        (quote.customer_name ?? '').toLowerCase().includes(q) ||
        (quote.title ?? '').toLowerCase().includes(q)
      )
    }
    return result
  }, [quotes, statusFilter, debouncedSearch])

  // CRUD handlers
  const handleSaveQuote = useCallback(async (data: ZZPQuoteCreate, isEdit: boolean) => {
    try {
      if (isEdit && editingQuote) {
        await zzpApi.quotes.update(editingQuote.id, {
          customer_id: data.customer_id,
          issue_date: data.issue_date,
          valid_until: data.valid_until,
          title: data.title,
          notes: data.notes,
          terms: data.terms,
          lines: data.lines,
        })
        toast.success('Offerte opgeslagen.')
      } else {
        await zzpApi.quotes.create(data)
        toast.success('Offerte aangemaakt.')
      }
      setIsFormOpen(false)
      setEditingQuote(undefined)
      await loadData()
    } catch (err) {
      console.error('Failed to save quote:', err)
      toast.error(parseApiError(err))
      throw err
    }
  }, [editingQuote, loadData])

  const handleStatusChange = useCallback(async (quote: ZZPQuote, newStatus: QuoteStatus) => {
    setUpdatingStatusQuoteId(quote.id)
    try {
      await zzpApi.quotes.updateStatus(quote.id, newStatus)
      toast.success('Status bijgewerkt.')
      await loadData()
    } catch (err) {
      console.error('Failed to update status:', err)
      toast.error(parseApiError(err))
    } finally {
      setUpdatingStatusQuoteId(null)
    }
  }, [loadData])

  const handleDeleteQuote = useCallback(async () => {
    if (!deletingQuote) return
    try {
      await zzpApi.quotes.delete(deletingQuote.id)
      toast.success('Offerte verwijderd.')
      setDeletingQuote(undefined)
      await loadData()
    } catch (err) {
      console.error('Failed to delete quote:', err)
      toast.error(parseApiError(err))
    }
  }, [deletingQuote, loadData])

  const handleConvertToInvoice = useCallback(async () => {
    if (!convertingQuote) return
    setIsConverting(true)
    try {
      const result = await zzpApi.quotes.convertToInvoice(convertingQuote.id)
      toast.success(
        `Offerte omgezet naar factuur ${result.invoice_number}.`,
        {
          action: {
            label: 'Ga naar facturen',
            onClick: () => navigateTo('/zzp/invoices'),
          },
        }
      )
      setConvertingQuote(undefined)
      await loadData()
    } catch (err) {
      console.error('Failed to convert quote to invoice:', err)
      toast.error(parseApiError(err))
    } finally {
      setIsConverting(false)
    }
  }, [convertingQuote, loadData])

  const handleDownloadPdf = useCallback(async (quote: ZZPQuote) => {
    try {
      setDownloadingQuoteId(quote.id)
      toast.info('PDF wordt voorbereid...')
      const directUrl = zzpApi.quotes.getPdfUrl(quote.id)
      window.location.assign(directUrl)
      toast.success('PDF download gestart.')
    } catch (err) {
      console.error('Failed to download PDF:', err)
      toast.error(parseApiError(err))
    } finally {
      setDownloadingQuoteId(null)
    }
  }, [])

  const handleShare = useCallback(async (quote: ZZPQuote) => {
    const quoteNumber = quote.quote_number || `OFF-${quote.id}`
    const filename = `${quoteNumber}.pdf`
    try {
      const blob = await zzpApi.quotes.downloadPdf(quote.id)
      const pdfBlob = new Blob([blob], { type: 'application/pdf' })

      if (navigator.share && typeof navigator.canShare === 'function') {
        const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' })
        const shareData = {
          title: `Offerte ${quoteNumber}`,
          text: `Offerte ${quoteNumber}`,
          files: [pdfFile],
        }
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData)
          toast.success('Offerte gedeeld.')
          return
        }
      }

      if (navigator.share) {
        const pdfUrl = zzpApi.quotes.getPdfUrl(quote.id)
        await navigator.share({
          title: `Offerte ${quoteNumber}`,
          text: `Offerte ${quoteNumber}`,
          url: pdfUrl,
        })
        toast.success('Offerte gedeeld.')
      } else {
        const pdfUrl = zzpApi.quotes.getPdfUrl(quote.id)
        await navigator.clipboard.writeText(pdfUrl)
        toast.success('Link gekopieerd naar klembord.')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('Failed to share quote:', err)
      toast.error('Delen mislukt.')
    }
  }, [])

  const handleCopyLink = useCallback(async (quote: ZZPQuote) => {
    try {
      const pdfUrl = zzpApi.quotes.getPdfUrl(quote.id)
      await navigator.clipboard.writeText(pdfUrl)
      toast.success('Link gekopieerd naar klembord.')
    } catch (err) {
      console.error('Failed to copy link:', err)
      toast.error('Kopiëren mislukt.')
    }
  }, [])

  const openNewForm = useCallback(() => {
    setEditingQuote(undefined)
    setViewingQuote(undefined)
    setIsFormOpen(true)
  }, [])

  const openEditForm = useCallback((quote: ZZPQuote) => {
    setViewingQuote(undefined)
    setEditingQuote(quote)
    setIsFormOpen(true)
  }, [])

  const openViewForm = useCallback((quote: ZZPQuote) => {
    setEditingQuote(undefined)
    setViewingQuote(quote)
    setIsFormOpen(true)
  }, [])

  const activeFormQuote = editingQuote || viewingQuote

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
              Offertes
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Beheer je offertes en zet ze om naar facturen
            </p>
          </div>
          <Button
            onClick={openNewForm}
            className="gap-2 h-10 sm:h-11 w-full sm:w-auto"
            disabled={!hasActiveCustomers}
          >
            <Plus size={18} weight="bold" />
            Nieuwe offerte
          </Button>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatsCard
              title="Totaal"
              value={stats.total}
              subtitle={formatAmountEUR(stats.totalAmount)}
              icon={FileText}
              className="border-primary/20"
            />
            <StatsCard
              title="Verzonden"
              value={stats.sent}
              subtitle="In afwachting"
              icon={Hourglass}
              className="border-blue-500/20"
            />
            <StatsCard
              title="Geaccepteerd"
              value={stats.accepted}
              subtitle={formatAmountEUR(stats.acceptedAmount)}
              icon={CheckCircle}
              className="border-green-500/20"
            />
            <StatsCard
              title="Concept"
              value={stats.draft}
              subtitle="Nog niet verzonden"
              icon={Clock}
              className="border-gray-500/20"
            />
          </div>
        )}

        {/* Table / content */}
        {showLoading ? (
          <TableLoadingSkeleton />
        ) : error ? (
          <Card className="bg-card/80 backdrop-blur-sm border-destructive/30">
            <CardHeader>
              <CardTitle>
                {loadState === 'forbidden' ? 'Geen toegang' :
                  loadState === 'server' ? 'Serverfout' :
                    loadState === 'network' ? 'Geen verbinding' : 'Offertes laden mislukt'}
              </CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => { void loadData() }} variant="outline">Opnieuw proberen</Button>
            </CardContent>
          </Card>
        ) : quotes.length === 0 ? (
          <EmptyState onAddQuote={openNewForm} hasCustomers={hasActiveCustomers} />
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Offertelijst</CardTitle>
                  <CardDescription>
                    {filteredQuotes.length} {filteredQuotes.length === 1 ? 'offerte' : 'offertes'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search and filter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                <div className="relative sm:col-span-2 lg:col-span-1">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Zoek op nummer, klant of onderwerp..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Alle statussen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle statussen</SelectItem>
                    <SelectItem value="draft">Concept</SelectItem>
                    <SelectItem value="sent">Verzonden</SelectItem>
                    <SelectItem value="accepted">Geaccepteerd</SelectItem>
                    <SelectItem value="rejected">Geweigerd</SelectItem>
                    <SelectItem value="expired">Verlopen</SelectItem>
                    <SelectItem value="converted">Omgezet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filteredQuotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MagnifyingGlass size={32} className="text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Geen offertes gevonden</p>
                  {(searchQuery || statusFilter !== 'all') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setSearchQuery('')
                        setStatusFilter('all')
                      }}
                    >
                      Filters wissen
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[130px]">Nummer</TableHead>
                          <TableHead>Klant</TableHead>
                          <TableHead className="hidden lg:table-cell">Onderwerp</TableHead>
                          <TableHead className="hidden md:table-cell">Datum</TableHead>
                          <TableHead className="hidden lg:table-cell">Geldig tot</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Bedrag</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredQuotes.map((quote) => {
                          const canEdit = quote.status === 'draft' || quote.status === 'sent'
                          const canDelete = quote.status === 'draft'
                          const canConvert = quote.status !== 'converted' && quote.status !== 'rejected'
                          const isUpdating = updatingStatusQuoteId === quote.id
                          const isDownloading = downloadingQuoteId === quote.id

                          return (
                            <TableRow
                              key={quote.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => openViewForm(quote)}
                            >
                              <TableCell className="font-mono text-sm font-medium">
                                {quote.quote_number}
                              </TableCell>
                              <TableCell className="font-medium">
                                {quote.customer_name || '—'}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                                {quote.title || '—'}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                                {formatDate(quote.issue_date)}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                                {formatDate(quote.valid_until)}
                              </TableCell>
                              <TableCell>
                                <QuoteStatusBadge status={quote.status} size="sm" />
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatAmountEUR(quote.total_cents)}
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <DotsThreeVertical size={16} />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openViewForm(quote)}>
                                      <Eye size={16} className="mr-2" />
                                      Bekijken
                                    </DropdownMenuItem>
                                    {canEdit && (
                                      <DropdownMenuItem onClick={() => openEditForm(quote)}>
                                        <PencilSimple size={16} className="mr-2" />
                                        Bewerken
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    {quote.status === 'draft' && (
                                      <DropdownMenuItem
                                        onClick={() => handleStatusChange(quote, 'sent')}
                                        disabled={isUpdating}
                                      >
                                        <PaperPlaneTilt size={16} className="mr-2" />
                                        Markeren als verzonden
                                      </DropdownMenuItem>
                                    )}
                                    {quote.status === 'sent' && (
                                      <>
                                        <DropdownMenuItem
                                          onClick={() => handleStatusChange(quote, 'accepted')}
                                          disabled={isUpdating}
                                        >
                                          <CheckCircle size={16} className="mr-2" />
                                          Geaccepteerd
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleStatusChange(quote, 'rejected')}
                                          disabled={isUpdating}
                                        >
                                          <Prohibit size={16} className="mr-2" />
                                          Geweigerd
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleStatusChange(quote, 'expired')}
                                          disabled={isUpdating}
                                        >
                                          <Timer size={16} className="mr-2" />
                                          Verlopen
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    {canConvert && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => setConvertingQuote(quote)}
                                          disabled={isUpdating}
                                          className="text-green-600 focus:text-green-600"
                                        >
                                          <ArrowsCounterClockwise size={16} className="mr-2" />
                                          Omzetten naar factuur
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    {quote.status === 'converted' && quote.invoice_id && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => navigateTo('/zzp/invoices')}
                                        >
                                          <ArrowRight size={16} className="mr-2" />
                                          Ga naar factuur
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleDownloadPdf(quote)}
                                      disabled={isDownloading}
                                    >
                                      {isDownloading ? (
                                        <SpinnerGap size={16} className="mr-2 animate-spin" />
                                      ) : (
                                        <Download size={16} className="mr-2" />
                                      )}
                                      PDF downloaden
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleShare(quote)}>
                                      <ShareNetwork size={16} className="mr-2" />
                                      Delen
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleCopyLink(quote)}>
                                      <CopySimple size={16} className="mr-2" />
                                      Link kopiëren
                                    </DropdownMenuItem>
                                    {canDelete && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => setDeletingQuote(quote)}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <TrashSimple size={16} className="mr-2" />
                                          Verwijderen
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile card list */}
                  <div className="sm:hidden space-y-3">
                    {filteredQuotes.map((quote) => (
                      <QuoteCard
                        key={quote.id}
                        quote={quote}
                        onView={() => openViewForm(quote)}
                        onEdit={() => openEditForm(quote)}
                        onDelete={() => setDeletingQuote(quote)}
                        onDownload={() => handleDownloadPdf(quote)}
                        onShare={() => handleShare(quote)}
                        onConvert={() => setConvertingQuote(quote)}
                        onStatusChange={(status) => handleStatusChange(quote, status)}
                        isDownloading={downloadingQuoteId === quote.id}
                        isUpdating={updatingStatusQuoteId === quote.id}
                      />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quote form dialog */}
      <QuoteFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            setEditingQuote(undefined)
            setViewingQuote(undefined)
          }
        }}
        quote={activeFormQuote}
        customers={customers}
        onSave={handleSaveQuote}
        isReadOnly={!!viewingQuote && !editingQuote}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingQuote} onOpenChange={(open) => !open && setDeletingQuote(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Offerte verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je offerte{' '}
              <span className="font-mono font-semibold">{deletingQuote?.quote_number}</span> wilt verwijderen?
              Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteQuote}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Convert to invoice confirmation */}
      <AlertDialog open={!!convertingQuote} onOpenChange={(open) => !open && setConvertingQuote(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ArrowsCounterClockwise size={20} className="text-green-600" />
              Omzetten naar factuur?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Offerte{' '}
              <span className="font-mono font-semibold">{convertingQuote?.quote_number}</span>{' '}
              wordt omgezet naar een conceptfactuur. De status van de offerte wordt bijgewerkt naar
              &ldquo;Omgezet naar factuur&rdquo;. Je kunt de factuur daarna nog aanpassen voor je
              hem verstuurt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConverting}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConvertToInvoice}
              disabled={isConverting}
              className="bg-green-600 text-white hover:bg-green-700 gap-2"
            >
              {isConverting && <SpinnerGap size={16} className="animate-spin" />}
              Omzetten naar factuur
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
