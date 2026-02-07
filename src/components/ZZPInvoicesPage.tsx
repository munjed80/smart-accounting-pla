/**
 * ZZP Invoices Page
 * 
 * Full CRUD functionality for managing invoices.
 * Data is stored in localStorage per user.
 * Invoices are linked to customers.
 */

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

// Invoice status types
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

// Helper function to extract date part from ISO string
const extractDatePart = (isoString: string | undefined): string => {
  if (!isoString) return ''
  return isoString.split('T')[0]
}

// Status badge component
const StatusBadge = ({ status }: { status: InvoiceStatus }) => {
  const config: Record<InvoiceStatus, { bg: string; text: string; border: string; icon: React.ReactNode; label: string }> = {
    draft: {
      bg: 'bg-gray-500/20',
      text: 'text-gray-600 dark:text-gray-400',
      border: 'border-gray-500/40',
      icon: <Clock size={14} className="mr-1" weight="fill" />,
      label: t('zzpInvoices.statusDraft'),
    },
    sent: {
      bg: 'bg-blue-500/20',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-500/40',
      icon: <PaperPlaneTilt size={14} className="mr-1" weight="fill" />,
      label: t('zzpInvoices.statusSent'),
    },
    paid: {
      bg: 'bg-green-500/20',
      text: 'text-green-700 dark:text-green-400',
      border: 'border-green-500/40',
      icon: <CheckCircle size={14} className="mr-1" weight="fill" />,
      label: t('zzpInvoices.statusPaid'),
    },
    overdue: {
      bg: 'bg-red-500/20',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-500/40',
      icon: <Warning size={14} className="mr-1" weight="fill" />,
      label: t('zzpInvoices.statusOverdue'),
    },
  }

  const { bg, text, border, icon, label } = config[status]

  return (
    <Badge variant="outline" className={`${bg} ${text} ${border}`}>
      {icon}
      {label}
    </Badge>
  )
}

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
  
  // Validation errors
  const [customerError, setCustomerError] = useState('')
  const [dateError, setDateError] = useState('')
  const [amountError, setAmountError] = useState('')

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
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={24} className="text-primary" weight="duotone" />
            {isEdit ? t('zzpInvoices.editInvoice') : t('zzpInvoices.newInvoice')}
          </DialogTitle>
          <DialogDescription>
            {t('zzpInvoices.noInvoicesDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Customer dropdown (only for new invoices) */}
          {!isEdit && (
            <div className="space-y-2">
              <Label>{t('zzpInvoices.formCustomer')} *</Label>
              <Select value={customerId} onValueChange={(value) => {
                setCustomerId(value)
                setCustomerError('')
              }}>
                <SelectTrigger className={customerError ? 'border-destructive' : ''}>
                  <SelectValue placeholder={t('zzpInvoices.formCustomerPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {customers.filter(c => c.status === 'active').map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customerError && (
                <p className="text-sm text-destructive">{customerError}</p>
              )}
            </div>
          )}

          {/* Show customer name for existing invoices */}
          {isEdit && (
            <div className="space-y-2">
              <Label>{t('zzpInvoices.formCustomer')}</Label>
              <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-md">
                <Users size={16} className="text-muted-foreground" />
                <span className="text-sm">
                  {customers.find(c => c.id === invoice.customerId)?.name || t('zzpInvoices.unknownCustomer')}
                </span>
              </div>
            </div>
          )}

          {/* Date fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-date">{t('zzpInvoices.formDate')} *</Label>
              <Input
                id="invoice-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setDateError('')
                }}
                className={dateError ? 'border-destructive' : ''}
              />
              {dateError && (
                <p className="text-sm text-destructive">{dateError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-due-date">{t('zzpInvoices.formDueDate')}</Label>
              <Input
                id="invoice-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Amount field */}
          <div className="space-y-2">
            <Label htmlFor="invoice-amount">{t('zzpInvoices.formAmount')} *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
              <Input
                id="invoice-amount"
                type="text"
                inputMode="decimal"
                placeholder={t('zzpInvoices.formAmountPlaceholder')}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setAmountError('')
                }}
                className={`pl-8 ${amountError ? 'border-destructive' : ''}`}
              />
            </div>
            {amountError && (
              <p className="text-sm text-destructive">{amountError}</p>
            )}
          </div>

          {/* Status dropdown */}
          <div className="space-y-2">
            <Label>{t('zzpInvoices.formStatus')}</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as InvoiceStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t('zzpInvoices.statusDraft')}</SelectItem>
                <SelectItem value="sent">{t('zzpInvoices.statusSent')}</SelectItem>
                <SelectItem value="paid">{t('zzpInvoices.statusPaid')}</SelectItem>
                <SelectItem value="overdue">{t('zzpInvoices.statusOverdue')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes field */}
          <div className="space-y-2">
            <Label htmlFor="invoice-notes">{t('zzpInvoices.formNotes')}</Label>
            <Textarea
              id="invoice-notes"
              placeholder={t('zzpInvoices.formNotesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave}>
            {t('zzpInvoices.saveInvoice')}
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
  <Card className="border-amber-500/50 bg-amber-500/10">
    <CardContent className="flex flex-col sm:flex-row items-center gap-4 py-6">
      <Warning size={48} className="text-amber-500" weight="duotone" />
      <div className="flex-1 text-center sm:text-left">
        <h3 className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
          {t('zzpInvoices.noCustomersWarning')}
        </h3>
        <p className="text-sm text-amber-600 dark:text-amber-300">
          {t('zzpCustomers.noCustomersDescription')}
        </p>
      </div>
      <Button onClick={() => navigateTo('/zzp/customers')} className="gap-2">
        {t('zzpInvoices.goToCustomers')}
        <ArrowRight size={18} />
      </Button>
    </CardContent>
  </Card>
)

// Empty state component
const EmptyState = ({ onAddInvoice, hasCustomers }: { onAddInvoice: () => void; hasCustomers: boolean }) => (
  <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
      <Receipt size={64} weight="duotone" className="text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">{t('zzpInvoices.noInvoices')}</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">
        {t('zzpInvoices.noInvoicesDescription')}
      </p>
      <Button onClick={onAddInvoice} className="gap-2" disabled={!hasCustomers}>
        <Plus size={18} />
        {t('zzpInvoices.addFirstInvoice')}
      </Button>
    </CardContent>
  </Card>
)

export const ZZPInvoicesPage = () => {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all')
  
  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>()
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | undefined>()

  // Load data from localStorage
  useEffect(() => {
    if (user?.id) {
      setInvoices(listInvoices(user.id))
      setCustomers(listCustomers(user.id))
    }
  }, [user?.id])

  // Create customer lookup map
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>()
    customers.forEach(c => map.set(c.id, c))
    return map
  }, [customers])

  // Filter invoices based on search and status
  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      // Status filter
      if (statusFilter !== 'all' && invoice.status !== statusFilter) {
        return false
      }
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesNumber = invoice.number.toLowerCase().includes(query)
        const customer = customerMap.get(invoice.customerId)
        const matchesCustomer = customer?.name.toLowerCase().includes(query)
        if (!matchesNumber && !matchesCustomer) {
          return false
        }
      }
      
      return true
    })
  }, [invoices, searchQuery, statusFilter, customerMap])

  // Check if we have active customers
  const hasActiveCustomers = useMemo(() => {
    return customers.some(c => c.status === 'active')
  }, [customers])

  // Handle adding/editing invoice
  const handleSaveInvoice = (data: InvoiceInput | InvoiceUpdate, isEdit: boolean) => {
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
  }

  // Handle quick status change
  const handleStatusChange = (invoice: Invoice, newStatus: InvoiceStatus) => {
    if (!user?.id) return

    const updated = updateInvoice(user.id, invoice.id, { status: newStatus })
    if (updated) {
      setInvoices(listInvoices(user.id))
      toast.success(t('zzpInvoices.invoiceSaved'))
    }
  }

  // Handle delete invoice
  const handleDeleteInvoice = () => {
    if (!user?.id || !deletingInvoice) return

    const success = removeInvoice(user.id, deletingInvoice.id)
    if (success) {
      setInvoices(listInvoices(user.id))
      toast.success(t('zzpInvoices.invoiceDeleted'))
    }

    setDeletingInvoice(undefined)
  }

  // Open form for new invoice
  const openNewForm = () => {
    setEditingInvoice(undefined)
    setIsFormOpen(true)
  }

  // Open form for editing
  const openEditForm = (invoice: Invoice) => {
    setEditingInvoice(invoice)
    setIsFormOpen(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
              <FileText size={40} weight="duotone" className="text-primary" />
              {t('zzpInvoices.title')}
            </h1>
            <p className="text-muted-foreground">
              {invoices.length} {invoices.length === 1 ? 'factuur' : 'facturen'}
            </p>
          </div>
          <Button onClick={openNewForm} className="gap-2" disabled={!hasActiveCustomers}>
            <Plus size={18} weight="bold" />
            {t('zzpInvoices.newInvoice')}
          </Button>
        </div>

        {/* No customers warning */}
        {!hasActiveCustomers && (
          <div className="mb-6">
            <NoCustomersWarning />
          </div>
        )}

        {/* Show empty state or table */}
        {invoices.length === 0 ? (
          <EmptyState onAddInvoice={openNewForm} hasCustomers={hasActiveCustomers} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t('zzpInvoices.title')}</CardTitle>
              <CardDescription>
                {t('zzpInvoices.noInvoicesDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search and filter controls */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <MagnifyingGlass 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
                    size={18} 
                  />
                  <Input
                    placeholder={t('zzpInvoices.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select 
                  value={statusFilter} 
                  onValueChange={(value) => setStatusFilter(value as 'all' | InvoiceStatus)}
                >
                  <SelectTrigger className="w-full sm:w-40">
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

              {/* Invoices table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('zzpInvoices.columnNumber')}</TableHead>
                      <TableHead>{t('zzpInvoices.columnCustomer')}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t('zzpInvoices.columnDate')}</TableHead>
                      <TableHead className="text-right">{t('zzpInvoices.columnAmount')}</TableHead>
                      <TableHead>{t('zzpInvoices.columnStatus')}</TableHead>
                      <TableHead className="text-right">{t('zzpInvoices.columnActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <MagnifyingGlass size={32} className="mb-2 opacity-50" />
                            <p>{t('zzpInvoices.noInvoicesFound')}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInvoices.map((invoice) => {
                        const customer = customerMap.get(invoice.customerId)
                        return (
                          <TableRow key={invoice.id}>
                            <TableCell>
                              <span className="font-mono text-sm">{invoice.number}</span>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{customer?.name || t('zzpInvoices.unknownCustomer')}</div>
                                {/* Show date on mobile in customer cell */}
                                <div className="text-sm text-muted-foreground sm:hidden">
                                  {formatDate(invoice.date)}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {formatDate(invoice.date)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatAmountEUR(invoice.amountCents)}
                            </TableCell>
                            <TableCell>
                              {/* Quick status change dropdown */}
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
                              <div className="flex justify-end gap-2">
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
