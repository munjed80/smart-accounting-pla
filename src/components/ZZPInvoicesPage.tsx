/**
 * ZZP Invoices Page
 * 
 * Full CRUD functionality for managing invoices.
 * Data is stored in localStorage per user.
 * Invoices are linked to customers.
 * 
 * Premium UI with:
 * - Stats mini-cards
 * - Search with debounce
 * - Responsive table/card design
 * - Better form grouping
 * - Loading/skeleton states
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthContext'
import { navigateTo } from '@/lib/navigation'
import { 
  Invoice,
  InvoiceInput,
  InvoiceUpdate,
  Customer,
  listInvoices, 
  addInvoice, 
  updateInvoice, 
  removeInvoice,
  listCustomers,
  formatAmountEUR,
  formatDate,
} from '@/lib/storage/zzp'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/useDebounce'

// Invoice status types
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

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

// Invoice form dialog
const InvoiceFormDialog = ({
  open,
  onOpenChange,
  invoice,
  customers,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice?: Invoice
  customers: Customer[]
  onSave: (data: InvoiceInput | InvoiceUpdate, isEdit: boolean) => void
}) => {
  const isEdit = !!invoice
  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<InvoiceStatus>('draft')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Validation errors
  const [customerError, setCustomerError] = useState('')
  const [dateError, setDateError] = useState('')
  const [amountError, setAmountError] = useState('')

  // Active customers only
  const activeCustomers = useMemo(() => 
    customers.filter(c => c.status === 'active'), 
    [customers]
  )

  // Reset form when dialog opens/closes or invoice changes
  useEffect(() => {
    if (open) {
      if (invoice) {
        setCustomerId(invoice.customerId)
        setDate(extractDatePart(invoice.date))
        setDueDate(extractDatePart(invoice.dueDate))
        setAmount((invoice.amountCents / 100).toFixed(2).replace('.', ','))
        setStatus(invoice.status)
        setNotes(invoice.notes || '')
      } else {
        setCustomerId('')
        setDate(extractDatePart(new Date().toISOString()))
        setDueDate('')
        setAmount('')
        setStatus('draft')
        setNotes('')
      }
      setCustomerError('')
      setDateError('')
      setAmountError('')
      setIsSubmitting(false)
    }
  }, [open, invoice])

  // Parse amount string to cents
  const parseAmount = (value: string): number | null => {
    // Replace comma with dot for parsing
    const normalized = value.replace(',', '.')
    const parsed = parseFloat(normalized)
    if (isNaN(parsed) || parsed < 0) return null
    return Math.round(parsed * 100)
  }

  const handleSave = () => {
    let hasError = false

    // Validate customer (only required for new invoices)
    if (!isEdit && !customerId) {
      setCustomerError(t('zzpInvoices.formCustomerRequired'))
      hasError = true
    }

    // Validate date
    if (!date) {
      setDateError(t('zzpInvoices.formDateRequired'))
      hasError = true
    }

    // Validate amount
    const amountCents = parseAmount(amount)
    if (amountCents === null || amountCents <= 0) {
      setAmountError(t('zzpInvoices.formAmountRequired'))
      hasError = true
    }

    if (hasError) return

    setIsSubmitting(true)

    if (isEdit) {
      // Update existing - don't include customerId
      const updateData: InvoiceUpdate = {
        date: new Date(date).toISOString(),
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        amountCents: amountCents!,
        currency: 'EUR',
        status,
        notes: notes.trim() || undefined,
      }
      onSave(updateData, true)
    } else {
      // Create new
      const inputData: InvoiceInput = {
        customerId,
        date: new Date(date).toISOString(),
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        amountCents: amountCents!,
        currency: 'EUR',
        status,
        notes: notes.trim() || undefined,
      }
      onSave(inputData, false)
    }
    
    setIsSubmitting(false)
  }

  const isFormValid = (isEdit || customerId) && date && parseAmount(amount) !== null && (parseAmount(amount) ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Receipt size={24} className="text-primary" weight="duotone" />
            </div>
            {isEdit ? t('zzpInvoices.editInvoice') : t('zzpInvoices.newInvoice')}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isEdit 
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
              }} disabled={isSubmitting}>
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
                      <SelectItem key={customer.id} value={customer.id}>
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
              <Label className="text-sm font-medium">{t('zzpInvoices.formCustomer')}</Label>
              <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl border border-border/50">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users size={16} className="text-primary" />
                </div>
                <span className="font-medium">
                  {customers.find(c => c.id === invoice.customerId)?.name || t('zzpInvoices.unknownCustomer')}
                </span>
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
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setDateError('')
                }}
                className={`h-11 ${dateError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
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
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Amount and Status - two columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-amount" className="text-sm font-medium flex items-center gap-2">
                <CurrencyEur size={14} className="text-muted-foreground" />
                {t('zzpInvoices.formAmount')} <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">€</span>
                <Input
                  id="invoice-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder={t('zzpInvoices.formAmountPlaceholder')}
                  value={amount}
                  onChange={(e) => {
                    // Only allow numbers, comma, and dot
                    const value = e.target.value.replace(/[^0-9,.]/g, '')
                    setAmount(value)
                    setAmountError('')
                  }}
                  className={`pl-8 h-11 ${amountError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  disabled={isSubmitting}
                />
              </div>
              {amountError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle size={14} />
                  {amountError}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('zzpInvoices.formStatus')}</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as InvoiceStatus)} disabled={isSubmitting}>
                <SelectTrigger className="h-11">
                  <StatusBadge status={status} size="sm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-gray-500" />
                      {t('zzpInvoices.statusDraft')}
                    </div>
                  </SelectItem>
                  <SelectItem value="sent">
                    <div className="flex items-center gap-2">
                      <PaperPlaneTilt size={14} className="text-blue-500" />
                      {t('zzpInvoices.statusSent')}
                    </div>
                  </SelectItem>
                  <SelectItem value="paid">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-green-500" />
                      {t('zzpInvoices.statusPaid')}
                    </div>
                  </SelectItem>
                  <SelectItem value="overdue">
                    <div className="flex items-center gap-2">
                      <Warning size={14} className="text-red-500" />
                      {t('zzpInvoices.statusOverdue')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
              disabled={isSubmitting}
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
            {t('common.cancel')}
          </Button>
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
  customer,
  onEdit, 
  onDelete,
  onStatusChange,
}: { 
  invoice: Invoice
  customer?: Customer
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (newStatus: InvoiceStatus) => void
}) => (
  <Card className="bg-card/80 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-colors">
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FileText size={20} className="text-primary" weight="duotone" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-mono text-sm font-semibold truncate">{invoice.number}</h4>
            <p className="text-sm text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
              <Users size={12} />
              {customer?.name || t('zzpInvoices.unknownCustomer')}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-lg">{formatAmountEUR(invoice.amountCents)}</p>
          <p className="text-xs text-muted-foreground">{formatDate(invoice.date)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/50">
        <Select 
          value={invoice.status} 
          onValueChange={(value) => onStatusChange(value as InvoiceStatus)}
        >
          <SelectTrigger className="w-auto border-0 p-0 h-auto focus:ring-0">
            <StatusBadge status={invoice.status} size="sm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">{t('zzpInvoices.statusDraft')}</SelectItem>
            <SelectItem value="sent">{t('zzpInvoices.statusSent')}</SelectItem>
            <SelectItem value="paid">{t('zzpInvoices.statusPaid')}</SelectItem>
            <SelectItem value="overdue">{t('zzpInvoices.statusOverdue')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-9 px-3 gap-2"
          >
            <PencilSimple size={16} />
            {t('common.edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-9 px-3 gap-2 text-destructive hover:text-destructive"
          >
            <TrashSimple size={16} />
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
)

export const ZZPInvoicesPage = () => {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all')
  const [isLoading, setIsLoading] = useState(true)
  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchQuery, 300)
  
  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>()
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | undefined>()

  // Load data from localStorage
  useEffect(() => {
    if (user?.id) {
      setIsLoading(true)
      // Load data synchronously from localStorage
      setInvoices(listInvoices(user.id))
      setCustomers(listCustomers(user.id))
      setIsLoading(false)
    }
  }, [user?.id])

  // Create customer lookup map
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>()
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
    const totalAmount = invoices.reduce((sum, i) => sum + i.amountCents, 0)
    const paidAmount = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amountCents, 0)
    const openAmount = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, i) => sum + i.amountCents, 0)
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
        const matchesNumber = invoice.number.toLowerCase().includes(query)
        const customer = customerMap.get(invoice.customerId)
        const matchesCustomer = customer?.name.toLowerCase().includes(query)
        // Also search in amount
        const matchesAmount = formatAmountEUR(invoice.amountCents).toLowerCase().includes(query)
        if (!matchesNumber && !matchesCustomer && !matchesAmount) {
          return false
        }
      }
      
      return true
    })
  }, [invoices, debouncedSearch, statusFilter, customerMap])

  // Check if we have active customers
  const hasActiveCustomers = useMemo(() => {
    return customers.some(c => c.status === 'active')
  }, [customers])

  // Handle adding/editing invoice
  const handleSaveInvoice = useCallback((data: InvoiceInput | InvoiceUpdate, isEdit: boolean) => {
    if (!user?.id) return

    if (isEdit && editingInvoice) {
      // Update existing
      const updated = updateInvoice(user.id, editingInvoice.id, data as InvoiceUpdate)
      if (updated) {
        setInvoices(listInvoices(user.id))
        toast.success(t('zzpInvoices.invoiceSaved'))
      }
    } else {
      // Add new
      addInvoice(user.id, data as InvoiceInput)
      setInvoices(listInvoices(user.id))
      toast.success(t('zzpInvoices.invoiceSaved'))
    }

    setIsFormOpen(false)
    setEditingInvoice(undefined)
  }, [user?.id, editingInvoice])

  // Handle quick status change
  const handleStatusChange = useCallback((invoice: Invoice, newStatus: InvoiceStatus) => {
    if (!user?.id) return

    const updated = updateInvoice(user.id, invoice.id, { status: newStatus })
    if (updated) {
      setInvoices(listInvoices(user.id))
      toast.success(t('zzpInvoices.statusChanged'))
    }
  }, [user?.id])

  // Handle delete invoice
  const handleDeleteInvoice = useCallback(() => {
    if (!user?.id || !deletingInvoice) return

    const success = removeInvoice(user.id, deletingInvoice.id)
    if (success) {
      setInvoices(listInvoices(user.id))
      toast.success(t('zzpInvoices.invoiceDeleted'))
    }

    setDeletingInvoice(undefined)
  }, [user?.id, deletingInvoice])

  // Open form for new invoice
  const openNewForm = useCallback(() => {
    setEditingInvoice(undefined)
    setIsFormOpen(true)
  }, [])

  // Open form for editing
  const openEditForm = useCallback((invoice: Invoice) => {
    setEditingInvoice(invoice)
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
          <Button onClick={openNewForm} className="gap-2 h-10 sm:h-11 w-full sm:w-auto" disabled={!hasActiveCustomers}>
            <Plus size={18} weight="bold" />
            {t('zzpInvoices.newInvoice')}
          </Button>
        </div>

        {/* No customers warning */}
        {!isLoading && !hasActiveCustomers && (
          <div className="mb-6">
            <NoCustomersWarning />
          </div>
        )}

        {/* Stats Cards */}
        {isLoading ? (
          <StatsLoadingSkeleton />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
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
        {isLoading ? (
          <TableLoadingSkeleton />
        ) : invoices.length === 0 ? (
          <EmptyState onAddInvoice={openNewForm} hasCustomers={hasActiveCustomers} />
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{t('zzpInvoices.listTitle')}</CardTitle>
                  <CardDescription>
                    {filteredInvoices.length} {filteredInvoices.length === 1 ? 'factuur' : 'facturen'}
                    {statusFilter !== 'all' && ` (${t(`zzpInvoices.filter${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`)})`}
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
                  filteredInvoices.map((invoice) => (
                    <InvoiceCard
                      key={invoice.id}
                      invoice={invoice}
                      customer={customerMap.get(invoice.customerId)}
                      onEdit={() => openEditForm(invoice)}
                      onDelete={() => setDeletingInvoice(invoice)}
                      onStatusChange={(status) => handleStatusChange(invoice, status)}
                    />
                  ))
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
                        const customer = customerMap.get(invoice.customerId)
                        return (
                          <TableRow key={invoice.id} className="hover:bg-secondary/30">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                  <FileText size={16} className="text-primary" weight="duotone" />
                                </div>
                                <span className="font-mono text-sm font-medium">{invoice.number}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Users size={14} className="text-muted-foreground" />
                                <span>{customer?.name || t('zzpInvoices.unknownCustomer')}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground">
                              {formatDate(invoice.date)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatAmountEUR(invoice.amountCents)}
                            </TableCell>
                            <TableCell>
                              <Select 
                                value={invoice.status} 
                                onValueChange={(value) => handleStatusChange(invoice, value as InvoiceStatus)}
                              >
                                <SelectTrigger className="w-auto border-0 p-0 h-auto focus:ring-0">
                                  <StatusBadge status={invoice.status} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="draft">{t('zzpInvoices.statusDraft')}</SelectItem>
                                  <SelectItem value="sent">{t('zzpInvoices.statusSent')}</SelectItem>
                                  <SelectItem value="paid">{t('zzpInvoices.statusPaid')}</SelectItem>
                                  <SelectItem value="overdue">{t('zzpInvoices.statusOverdue')}</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditForm(invoice)}
                                  className="h-8 w-8 p-0"
                                >
                                  <PencilSimple size={16} />
                                  <span className="sr-only">{t('common.edit')}</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeletingInvoice(invoice)}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                >
                                  <TrashSimple size={16} />
                                  <span className="sr-only">{t('common.delete')}</span>
                                </Button>
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
          if (!open) setEditingInvoice(undefined)
        }}
        invoice={editingInvoice}
        customers={customers}
        onSave={handleSaveInvoice}
      />

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={!!deletingInvoice}
        onOpenChange={(open) => {
          if (!open) setDeletingInvoice(undefined)
        }}
        onConfirm={handleDeleteInvoice}
        invoiceNumber={deletingInvoice?.number || ''}
      />
    </div>
  )
}

export default ZZPInvoicesPage
