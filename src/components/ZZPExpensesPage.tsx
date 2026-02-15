/**
 * ZZP Expenses Page (Uitgaven)
 * 
 * Full CRUD functionality for managing business expenses.
 * 
 * Premium UI with:
 * - Stats mini-cards (totals, VAT summary)
 * - Filter by month and category
 * - Responsive table/card design
 * - Modal for create/edit
 * - Loading/skeleton states
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  Receipt, 
  Plus, 
  PencilSimple, 
  TrashSimple,
  CheckCircle,
  XCircle,
  SpinnerGap,
  CurrencyEur,
  Calculator,
  Tag,
  CalendarBlank,
  DotsThreeVertical,
  Camera,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthContext'
import { zzpApi, ZZPExpense, ZZPExpenseCreate, ZZPExpenseUpdate } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

// Default expense categories
const DEFAULT_CATEGORIES = [
  'algemeen',
  'kantoorkosten',
  'reiskosten',
  'marketing',
  'verzekeringen',
  'abonnementen',
  'telefoon_internet',
  'auto',
  'onderhoud',
  'opleiding',
  'representatie',
  'overig',
]

// VAT rate options
const VAT_RATES = [0, 9, 21]

// Format amount from cents to euros
const formatAmount = (cents: number): string => {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

// Parse euro input to cents
const parseEuroToCents = (value: string): number => {
  // Remove currency symbol and whitespace
  const cleaned = value.replace(/[€\s]/g, '').replace(',', '.')
  const parsed = parseFloat(cleaned)
  if (isNaN(parsed)) return 0
  return Math.round(parsed * 100)
}

// Stats card component
const StatsCard = ({ 
  title, 
  value, 
  icon: Icon, 
  className = '' 
}: { 
  title: string
  value: string
  icon: React.ElementType
  className?: string 
}) => (
  <Card className={`bg-card/80 backdrop-blur-sm border border-border/50 ${className}`}>
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-xl sm:text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon size={20} className="text-primary sm:hidden" weight="duotone" />
          <Icon size={24} className="text-primary hidden sm:block" weight="duotone" />
        </div>
      </div>
    </CardContent>
  </Card>
)

// Loading skeleton for stats
const StatsLoadingSkeleton = () => (
  <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
    {[1, 2, 3].map((i) => (
      <Card key={i} className="bg-card/80 backdrop-blur-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16 sm:w-20" />
              <Skeleton className="h-7 w-16 sm:h-8 sm:w-20" />
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
            <div className="flex items-center gap-3 sm:gap-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 sm:w-32" />
                <Skeleton className="h-3 w-32 sm:w-48" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)

// Expense form dialog
const ExpenseFormDialog = ({
  open,
  onOpenChange,
  expense,
  scannedData,
  categories,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense?: ZZPExpense
  scannedData?: ZZPExpenseCreate | null
  categories: string[]
  onSave: (data: ZZPExpenseCreate) => Promise<void>
}) => {
  const isEdit = !!expense
  const isScanned = !!scannedData && !expense
  
  // Form fields
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState('')
  const [amountEuros, setAmountEuros] = useState('')
  const [vatRate, setVatRate] = useState<number>(21)
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  
  // Validation errors
  const [vendorError, setVendorError] = useState('')
  const [dateError, setDateError] = useState('')
  const [amountError, setAmountError] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when dialog opens/closes or expense/scannedData changes
  useEffect(() => {
    if (open) {
      if (expense) {
        // Editing existing expense
        setVendor(expense.vendor)
        setDescription(expense.description || '')
        setExpenseDate(expense.expense_date)
        setAmountEuros((expense.amount_cents / 100).toFixed(2).replace('.', ','))
        setVatRate(expense.vat_rate)
        setCategory(expense.category)
        setNotes(expense.notes || '')
      } else if (scannedData) {
        // Prefill with scanned data
        setVendor(scannedData.vendor || '')
        setDescription(scannedData.description || '')
        setExpenseDate(scannedData.expense_date || new Date().toISOString().split('T')[0])
        setAmountEuros(scannedData.amount_cents ? (scannedData.amount_cents / 100).toFixed(2).replace('.', ',') : '')
        setVatRate(scannedData.vat_rate || 21)
        setCategory(scannedData.category || categories[0] || 'algemeen')
        setNotes(scannedData.notes || '')
      } else {
        // New expense
        setVendor('')
        setDescription('')
        setExpenseDate(new Date().toISOString().split('T')[0])
        setAmountEuros('')
        setVatRate(21)
        setCategory(categories[0] || 'algemeen')
        setNotes('')
      }
      // Clear errors
      setVendorError('')
      setDateError('')
      setAmountError('')
      setCategoryError('')
      setIsSubmitting(false)
    }
  }, [open, expense, scannedData, categories])

  const handleSave = async () => {
    let hasError = false
    
    // Validate vendor
    if (!vendor.trim()) {
      setVendorError(t('zzpExpenses.formVendorRequired'))
      hasError = true
    }
    
    // Validate date
    if (!expenseDate) {
      setDateError(t('zzpExpenses.formDateRequired'))
      hasError = true
    }
    
    // Validate amount
    const amountCents = parseEuroToCents(amountEuros)
    if (amountCents <= 0) {
      setAmountError(t('zzpExpenses.formAmountRequired'))
      hasError = true
    }
    
    // Validate category
    if (!category) {
      setCategoryError(t('zzpExpenses.formCategoryRequired'))
      hasError = true
    }

    if (hasError) return

    setIsSubmitting(true)

    try {
      await onSave({
        vendor: vendor.trim(),
        description: description.trim() || undefined,
        expense_date: expenseDate,
        amount_cents: amountCents,
        vat_rate: vatRate,
        category,
        notes: notes.trim() || undefined,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isFormValid = vendor.trim() && 
    expenseDate && 
    parseEuroToCents(amountEuros) > 0 && 
    category

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              {isScanned ? <Camera size={24} className="text-primary" weight="duotone" /> : <Receipt size={24} className="text-primary" weight="duotone" />}
            </div>
            {isEdit ? t('zzpExpenses.editExpense') : isScanned ? t('zzpExpenses.reviewScannedExpense') : t('zzpExpenses.newExpense')}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isEdit 
              ? t('zzpExpenses.editExpenseDescription')
              : isScanned
              ? t('zzpExpenses.reviewScannedDescription')
              : t('zzpExpenses.newExpenseDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Vendor field (required) */}
          <div className="space-y-2">
            <Label htmlFor="expense-vendor" className="text-sm font-medium">
              {t('zzpExpenses.formVendor')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="expense-vendor"
              placeholder={t('zzpExpenses.formVendorPlaceholder')}
              value={vendor}
              onChange={(e) => {
                setVendor(e.target.value)
                setVendorError('')
              }}
              className={`h-11 ${vendorError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              disabled={isSubmitting}
              autoFocus
            />
            {vendorError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle size={14} />
                {vendorError}
              </p>
            )}
          </div>

          {/* Description (optional) */}
          <div className="space-y-2">
            <Label htmlFor="expense-description" className="text-sm font-medium">
              {t('zzpExpenses.formDescription')}
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({t('zzpExpenses.helperOptional')})
              </span>
            </Label>
            <Input
              id="expense-description"
              placeholder={t('zzpExpenses.formDescriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-11"
              disabled={isSubmitting}
            />
          </div>

          {/* Date and Amount - two columns */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expense-date" className="text-sm font-medium">
                {t('zzpExpenses.formDate')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="expense-date"
                type="date"
                value={expenseDate}
                onChange={(e) => {
                  setExpenseDate(e.target.value)
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
              <Label htmlFor="expense-amount" className="text-sm font-medium">
                {t('zzpExpenses.formAmount')} <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <CurrencyEur className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input
                  id="expense-amount"
                  placeholder="0,00"
                  value={amountEuros}
                  onChange={(e) => {
                    setAmountEuros(e.target.value)
                    setAmountError('')
                  }}
                  className={`h-11 pl-10 ${amountError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
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
          </div>

          {/* VAT Rate and Category - two columns */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expense-vat" className="text-sm font-medium">
                {t('zzpExpenses.formVatRate')} <span className="text-destructive">*</span>
              </Label>
              <Select 
                value={vatRate.toString()} 
                onValueChange={(value) => setVatRate(parseInt(value))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((rate) => (
                    <SelectItem key={rate} value={rate.toString()}>
                      {rate}% BTW
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-category" className="text-sm font-medium">
                {t('zzpExpenses.formCategory')} <span className="text-destructive">*</span>
              </Label>
              <Select 
                value={category} 
                onValueChange={(value) => {
                  setCategory(value)
                  setCategoryError('')
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger className={`h-11 ${categoryError ? 'border-destructive focus-visible:ring-destructive' : ''}`}>
                  <SelectValue placeholder={t('zzpExpenses.formCategoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(`zzpExpenses.category_${cat}`) || cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categoryError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle size={14} />
                  {categoryError}
                </p>
              )}
            </div>
          </div>

          {/* Notes (optional) */}
          <div className="space-y-2">
            <Label htmlFor="expense-notes" className="text-sm font-medium">
              {t('zzpExpenses.formNotes')}
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({t('zzpExpenses.helperOptional')})
              </span>
            </Label>
            <Textarea
              id="expense-notes"
              placeholder={t('zzpExpenses.formNotesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px] resize-none"
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
                {t('zzpExpenses.saveExpense')}
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
  expenseVendor,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  expenseVendor: string
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('zzpExpenses.deleteExpense')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('zzpExpenses.deleteExpenseConfirm')}
            <br />
            <span className="font-medium">{expenseVendor}</span>
            <br /><br />
            {t('zzpExpenses.deleteExpenseWarning')}
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

// Empty state component
const EmptyState = ({ onAddExpense }: { onAddExpense: () => void }) => (
  <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
    <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Receipt size={40} weight="duotone" className="text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('zzpExpenses.noExpenses')}</h3>
      <p className="text-muted-foreground mb-8 max-w-md">
        {t('zzpExpenses.noExpensesDescription')}
      </p>
      <Button onClick={onAddExpense} size="lg" className="gap-2 h-12 px-6">
        <Plus size={20} weight="bold" />
        {t('zzpExpenses.addFirstExpense')}
      </Button>
    </CardContent>
  </Card>
)

// Mobile expense card component
const ExpenseCard = ({ 
  expense, 
  onEdit, 
  onDelete 
}: { 
  expense: ZZPExpense
  onEdit: () => void
  onDelete: () => void 
}) => (
  <Card className="bg-card/80 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-colors">
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Receipt size={20} className="text-primary" weight="duotone" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold truncate">{expense.vendor}</h4>
            {expense.commitment_id && <Badge variant="secondary" className="mt-1">Linked to commitment</Badge>}
            {expense.description && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {expense.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{new Date(expense.expense_date).toLocaleDateString('nl-NL')}</span>
              <span>•</span>
              <span>{t(`zzpExpenses.category_${expense.category}`) || expense.category}</span>
            </div>
          </div>
        </div>
        <div className="text-right flex items-start gap-2">
          <div>
            <p className="font-semibold">{formatAmount(expense.amount_cents)}</p>
            <p className="text-xs text-muted-foreground">{expense.vat_rate}% BTW</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                <DotsThreeVertical size={18} />
                <span className="sr-only">{t('common.actions')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <PencilSimple size={16} className="mr-2" />
                {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <TrashSimple size={16} className="mr-2" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </CardContent>
  </Card>
)

// Generate month options
const generateMonthOptions = () => {
  const months = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    months.push({
      value: (i + 1).toString(),
      label: new Date(now.getFullYear(), i, 1).toLocaleDateString('nl-NL', { month: 'long' }),
    })
  }
  return months
}

// Generate year options (current year and 2 previous years)
const generateYearOptions = () => {
  const years = []
  const currentYear = new Date().getFullYear()
  for (let i = 0; i < 3; i++) {
    const year = currentYear - i
    years.push({ value: year.toString(), label: year.toString() })
  }
  return years
}

export const ZZPExpensesPage = () => {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState<ZZPExpense[]>([])
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [isLoading, setIsLoading] = useState(true)
  
  const showLoading = useDelayedLoading(isLoading, 300, expenses.length > 0)
  
  // Filter state
  const currentDate = new Date()
  const [filterYear, setFilterYear] = useState<string>(currentDate.getFullYear().toString())
  const [filterMonth, setFilterMonth] = useState<string>((currentDate.getMonth() + 1).toString())
  const [filterCategory, setFilterCategory] = useState<string>('all')
  
  // Totals from API
  const [totalCount, setTotalCount] = useState(0)
  const [totalAmountCents, setTotalAmountCents] = useState(0)
  const [totalVatCents, setTotalVatCents] = useState(0)
  
  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ZZPExpense | undefined>()
  const [deletingExpense, setDeletingExpense] = useState<ZZPExpense | undefined>()
  const [isScanning, setIsScanning] = useState(false)
  const [scannedData, setScannedData] = useState<ZZPExpenseCreate | null>(null)

  const monthOptions = useMemo(() => generateMonthOptions(), [])
  const yearOptions = useMemo(() => generateYearOptions(), [])

  // Load categories from API
  const loadCategories = useCallback(async () => {
    try {
      const response = await zzpApi.expenses.getCategories()
      if (response.categories && response.categories.length > 0) {
        setCategories(response.categories)
      }
    } catch (error) {
      console.error('Failed to load categories, using defaults:', error)
      // Keep default categories on error
    }
  }, [])

  // Load expenses from API
  const loadExpenses = useCallback(async () => {
    if (!user?.id) return
    
    setIsLoading(true)
    try {
      const options: {
        year?: number
        month?: number
        category?: string
      } = {}
      
      if (filterYear && filterYear !== 'all') {
        options.year = parseInt(filterYear)
      }
      if (filterMonth && filterMonth !== 'all') {
        options.month = parseInt(filterMonth)
      }
      if (filterCategory && filterCategory !== 'all') {
        options.category = filterCategory
      }
      
      const response = await zzpApi.expenses.list(options)
      setExpenses(response.expenses)
      setTotalCount(response.total)
      setTotalAmountCents(response.total_amount_cents)
      setTotalVatCents(response.total_vat_cents)
    } catch (error) {
      console.error('Failed to load expenses:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, filterYear, filterMonth, filterCategory])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  // Handle adding/editing expense
  const handleSaveExpense = useCallback(async (data: ZZPExpenseCreate) => {
    if (!user?.id) return

    try {
      if (editingExpense) {
        // Update existing
        await zzpApi.expenses.update(editingExpense.id, data as ZZPExpenseUpdate)
        toast.success(t('zzpExpenses.expenseSaved'))
      } else {
        // Add new
        await zzpApi.expenses.create(data)
        toast.success(t('zzpExpenses.expenseSaved'))
      }

      // Reload expenses list
      await loadExpenses()

      setIsFormOpen(false)
      setEditingExpense(undefined)
    } catch (error) {
      console.error('Failed to save expense:', error)
      toast.error(parseApiError(error))
    }
  }, [user?.id, editingExpense, loadExpenses])

  // Handle delete expense
  const handleDeleteExpense = useCallback(async () => {
    if (!user?.id || !deletingExpense) return

    try {
      await zzpApi.expenses.delete(deletingExpense.id)
      toast.success(t('zzpExpenses.expenseDeleted'))
      
      // Reload expenses list
      await loadExpenses()
    } catch (error) {
      console.error('Failed to delete expense:', error)
      toast.error(parseApiError(error))
    }

    setDeletingExpense(undefined)
  }, [user?.id, deletingExpense, loadExpenses])

  // Open form for new expense
  const openNewForm = useCallback(() => {
    setEditingExpense(undefined)
    setScannedData(null)
    setIsFormOpen(true)
  }, [])

  // Open form for editing
  const openEditForm = useCallback((expense: ZZPExpense) => {
    setEditingExpense(expense)
    setScannedData(null)
    setIsFormOpen(true)
  }, [])
  
  // Handle scan receipt
  // Updated to support file upload with camera capture on mobile
  const handleScanReceipt = useCallback(async (file: File) => {
    if (!user?.id) return
    
    setIsScanning(true)
    try {
      console.log('[Expense Scan] Starting receipt scan with file:', file.name)
      
      // Call API with file upload
      const result = await zzpApi.expenses.scanReceipt(file)
      console.log('[Expense Scan] Scan completed:', result)
      
      // Set the scanned data to prefill the form
      setScannedData(result.extracted_data)
      setEditingExpense(undefined)
      setIsFormOpen(true)
      
      toast.success(result.message || t('zzpExpenses.scanSuccess'))
    } catch (error) {
      console.error('[Expense Scan] Failed to scan receipt:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsScanning(false)
    }
  }, [user?.id])
  
  // Trigger file picker for receipt scan
  const handleScanButtonClick = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    // Enable camera capture on mobile devices (ignored by desktop browsers)
    input.setAttribute('capture', 'environment')
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        handleScanReceipt(file)
      }
    }
    input.click()
  }, [handleScanReceipt])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3">
              <Receipt size={28} className="text-primary sm:hidden" weight="duotone" />
              <Receipt size={40} className="text-primary hidden sm:block" weight="duotone" />
              {t('zzpExpenses.title')}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t('zzpExpenses.pageDescription')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleScanButtonClick} 
              variant="outline"
              disabled={isScanning}
              className="gap-2 h-10 sm:h-11 flex-1 sm:flex-initial"
            >
              {isScanning ? (
                <>
                  <SpinnerGap size={18} className="animate-spin" />
                  {t('zzpExpenses.scanning')}
                </>
              ) : (
                <>
                  <Camera size={18} weight="bold" />
                  {t('zzpExpenses.scanReceipt')}
                </>
              )}
            </Button>
            <Button onClick={openNewForm} className="gap-2 h-10 sm:h-11 flex-1 sm:flex-initial">
              <Plus size={18} weight="bold" />
              {t('zzpExpenses.newExpense')}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {showLoading ? (
          <StatsLoadingSkeleton />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
            <StatsCard 
              title={t('zzpExpenses.statsTotal')} 
              value={totalCount.toString()} 
              icon={Receipt}
              className="border-primary/20"
            />
            <StatsCard 
              title={t('zzpExpenses.statsAmount')} 
              value={formatAmount(totalAmountCents)} 
              icon={CurrencyEur}
              className="border-green-500/20"
            />
            <StatsCard 
              title={t('zzpExpenses.statsVat')} 
              value={formatAmount(totalVatCents)} 
              icon={Calculator}
              className="border-blue-500/20"
            />
          </div>
        )}

        {/* Show loading, empty state or content */}
        {showLoading ? (
          <TableLoadingSkeleton />
        ) : expenses.length === 0 && filterCategory === 'all' && filterYear === currentDate.getFullYear().toString() && filterMonth === (currentDate.getMonth() + 1).toString() ? (
          <EmptyState onAddExpense={openNewForm} />
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{t('zzpExpenses.listTitle')}</CardTitle>
                  <CardDescription>
                    {totalCount} {totalCount === 1 ? t('zzpExpenses.expenseSingular') : t('zzpExpenses.expensePlural')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filter controls */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="flex gap-2 flex-1">
                  <Select 
                    value={filterYear} 
                    onValueChange={setFilterYear}
                  >
                    <SelectTrigger className="w-[100px] h-11">
                      <CalendarBlank size={16} className="mr-1 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select 
                    value={filterMonth} 
                    onValueChange={setFilterMonth}
                  >
                    <SelectTrigger className="w-[130px] h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('zzpExpenses.filterAllMonths')}</SelectItem>
                      {monthOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Select 
                  value={filterCategory} 
                  onValueChange={setFilterCategory}
                >
                  <SelectTrigger className="w-full sm:w-48 h-11">
                    <Tag size={16} className="mr-1 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('zzpExpenses.filterAllCategories')}</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {t(`zzpExpenses.category_${cat}`) || cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Mobile: Card list */}
              <div className="sm:hidden space-y-3">
                {expenses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Receipt size={40} className="mb-3 opacity-50" />
                    <p className="font-medium">{t('zzpExpenses.noExpensesFound')}</p>
                    <p className="text-sm">{t('zzpExpenses.tryDifferentFilter')}</p>
                  </div>
                ) : (
                  expenses.map((expense) => (
                    <ExpenseCard
                      key={expense.id}
                      expense={expense}
                      onEdit={() => openEditForm(expense)}
                      onDelete={() => setDeletingExpense(expense)}
                    />
                  ))
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden sm:block rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                      <TableHead className="font-semibold">{t('zzpExpenses.columnDate')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpExpenses.columnVendor')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpExpenses.columnCategory')}</TableHead>
                      <TableHead className="font-semibold text-right">{t('zzpExpenses.columnAmount')}</TableHead>
                      <TableHead className="font-semibold text-right">{t('zzpExpenses.columnVat')}</TableHead>
                      <TableHead className="text-right font-semibold">{t('zzpExpenses.columnActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Receipt size={40} className="mb-3 opacity-50" />
                            <p className="font-medium">{t('zzpExpenses.noExpensesFound')}</p>
                            <p className="text-sm">{t('zzpExpenses.tryDifferentFilter')}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      expenses.map((expense) => (
                        <TableRow key={expense.id} className="hover:bg-secondary/30">
                          <TableCell className="text-muted-foreground">
                            {new Date(expense.expense_date).toLocaleDateString('nl-NL')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Receipt size={16} className="text-primary" weight="duotone" />
                              </div>
                              <div>
                                <span className="font-medium">{expense.vendor}</span>
                                {expense.commitment_id && <Badge variant="secondary" className="ml-2">Linked to commitment</Badge>}
                                {expense.description && (
                                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {expense.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {t(`zzpExpenses.category_${expense.category}`) || expense.category}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatAmount(expense.amount_cents)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {expense.vat_rate}% ({formatAmount(expense.vat_amount_cents)})
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditForm(expense)}
                                className="h-8 w-8 p-0"
                              >
                                <PencilSimple size={16} />
                                <span className="sr-only">{t('common.edit')}</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingExpense(expense)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                <TrashSimple size={16} />
                                <span className="sr-only">{t('common.delete')}</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Expense form dialog */}
      <ExpenseFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            setEditingExpense(undefined)
            setScannedData(null)
          }
        }}
        expense={editingExpense}
        scannedData={scannedData}
        categories={categories}
        onSave={handleSaveExpense}
      />

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={!!deletingExpense}
        onOpenChange={(open) => {
          if (!open) setDeletingExpense(undefined)
        }}
        onConfirm={handleDeleteExpense}
        expenseVendor={deletingExpense?.vendor || ''}
      />
    </div>
  )
}

export default ZZPExpensesPage
