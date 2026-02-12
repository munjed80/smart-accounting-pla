/**
 * ZZP Time Tracking Page (Uren)
 * 
 * Full CRUD functionality for time entry management.
 * Features weekly view with navigation, day-by-day breakdown, and entry list.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { 
  Clock, 
  Plus, 
  PencilSimple, 
  TrashSimple,
  CheckCircle,
  XCircle,
  CaretLeft,
  CaretRight,
  CalendarBlank,
  Timer,
  CurrencyEur,
  Receipt,
  SpinnerGap,
  Briefcase,
  User,
  Play,
  Stop,
  CaretDown,
  CaretUp,
  Export,
  FileText,
  Funnel,
  MagnifyingGlass,
  ArrowsDownUp,
  TrendUp,
  Copy,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthContext'
import { navigateTo } from '@/lib/navigation'
import { 
  zzpApi, 
  ZZPTimeEntry, 
  ZZPTimeEntryCreate, 
  ZZPTimeEntryUpdate,
  ZZPTimeEntryListResponse,
  ZZPWeeklyTimeSummary,
  ZZPCustomer,
  WorkSession,
  ZZPInvoiceLineCreate,
} from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

// Sentinel value for "no customer" selection (empty string is not allowed in Radix Select v2+)
const NO_CUSTOMER_VALUE = "__none__"

// Default Dutch VAT rate (%)
const DEFAULT_VAT_RATE_NL = 21

// Helper function to format time entry as invoice line description
const formatTimeEntryLineDescription = (entry: ZZPTimeEntry): string => {
  return `${entry.description}${entry.project_name ? ` (${entry.project_name})` : ''} - ${entry.hours}h`
}

const escapeCsv = (value: string | number | undefined): string => {
  const raw = value === undefined ? '' : String(value)
  const escaped = raw.replace(/"/g, '""')
  return `"${escaped}"`
}

// Hook for live timer display
const useTimer = (startedAt: string | null) => {
  const [elapsed, setElapsed] = useState(0)
  
  useEffect(() => {
    if (!startedAt) {
      setElapsed(0)
      return
    }
    
    const startTime = new Date(startedAt).getTime()
    
    // Calculate initial elapsed time
    const updateElapsed = () => {
      const now = Date.now()
      setElapsed(Math.floor((now - startTime) / 1000))
    }
    
    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    
    return () => clearInterval(interval)
  }, [startedAt])
  
  // Format as HH:MM:SS
  const hours = Math.floor(elapsed / 3600)
  const minutes = Math.floor((elapsed % 3600) / 60)
  const seconds = elapsed % 60
  
  const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  
  return { elapsed, formatted, hours, minutes, seconds }
}

// Helper functions for date manipulation
const getMonday = (date: Date): Date => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const getSunday = (monday: Date): Date => {
  const d = new Date(monday)
  d.setDate(d.getDate() + 6)
  return d
}

const formatDateISO = (date: Date): string => {
  return date.toISOString().split('T')[0]
}

const formatDateDisplay = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

const formatWeekRange = (monday: Date, sunday: Date): string => {
  const monStr = monday.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
  const sunStr = sunday.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return `${monStr} - ${sunStr}`
}

const getDayName = (dayIndex: number): string => {
  const days = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
  return days[dayIndex] || ''
}

// Quick hour buttons
const QUICK_HOURS = [0.5, 1, 2, 4, 8]

// Billable badge component
const BillableBadge = ({ billable }: { billable: boolean }) => {
  if (billable) {
    return (
      <Badge variant="outline" className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40">
        <CheckCircle size={14} className="mr-1" weight="fill" />
        {t('zzpTimeTracking.billable')}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/40">
      <XCircle size={14} className="mr-1" weight="fill" />
      {t('zzpTimeTracking.nonBillable')}
    </Badge>
  )
}

// Stats card component
const StatsCard = ({ 
  title, 
  value, 
  unit,
  icon: Icon, 
  className = '' 
}: { 
  title: string
  value: number | string
  unit?: string
  icon: React.ElementType
  className?: string 
}) => (
  <Card className={`bg-card/80 backdrop-blur-sm border border-border/50 ${className}`}>
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold mt-1">
            {value}
            {unit && <span className="text-base sm:text-lg text-muted-foreground ml-1">{unit}</span>}
          </p>
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
  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
    {[1, 2].map((i) => (
      <Card key={i} className="bg-card/80 backdrop-blur-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16 sm:w-20" />
              <Skeleton className="h-7 w-14 sm:h-8 sm:w-16" />
            </div>
            <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
)

// Weekly summary bar component
interface DayData {
  dayName: string
  dateStr: string
  hours: number
  height: number
  isWeekend: boolean
}

const WeeklySummaryBar = ({ 
  entriesByDay,
  weekStart 
}: { 
  entriesByDay: Record<string, number>
  weekStart: Date
}) => {
  const maxHours = Math.max(8, ...Object.values(entriesByDay))
  const days: DayData[] = []
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + i)
    const dateStr = formatDateISO(date)
    const hours = entriesByDay[dateStr] || 0
    const height = maxHours > 0 ? (hours / maxHours) * 100 : 0
    
    days.push({
      dayName: getDayName(i),
      dateStr,
      hours,
      height,
      isWeekend: i >= 5,
    })
  }

  return (
    <Card className="bg-card/80 backdrop-blur-sm border border-border/50 mb-6">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-end justify-between gap-2 h-32">
          {days.map((day) => (
            <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col items-center justify-end h-20">
                {day.hours > 0 && (
                  <span className="text-xs font-medium text-muted-foreground mb-1">
                    {day.hours.toFixed(1)}
                  </span>
                )}
                <div 
                  className={`w-full max-w-8 rounded-t transition-all ${
                    day.isWeekend 
                      ? 'bg-secondary/80' 
                      : day.hours > 0 
                        ? 'bg-primary/80' 
                        : 'bg-secondary/50'
                  }`}
                  style={{ height: `${Math.max(day.height, 4)}%` }}
                />
              </div>
              <span className={`text-xs font-medium ${day.isWeekend ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
                {day.dayName}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

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
                <Skeleton className="h-4 w-24 sm:w-48" />
                <Skeleton className="h-3 w-32 sm:w-32" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)

// Time entry form dialog
const TimeEntryFormDialog = ({
  open,
  onOpenChange,
  entry,
  onSave,
  customers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry?: ZZPTimeEntry
  onSave: (data: ZZPTimeEntryCreate) => Promise<void>
  customers: ZZPCustomer[]
}) => {
  const isEdit = !!entry
  
  // Form fields
  const [entryDate, setEntryDate] = useState('')
  const [description, setDescription] = useState('')
  const [hours, setHours] = useState('')
  const [projectName, setProjectName] = useState('')
  const [customerId, setCustomerId] = useState(NO_CUSTOMER_VALUE)
  const [hourlyRateCents, setHourlyRateCents] = useState('')
  const [billable, setBillable] = useState(true)
  
  // Validation
  const [dateError, setDateError] = useState('')
  const [descriptionError, setDescriptionError] = useState('')
  const [hoursError, setHoursError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when dialog opens/closes or entry changes
  useEffect(() => {
    if (open) {
      if (entry) {
        setEntryDate(entry.entry_date)
        setDescription(entry.description)
        setHours(entry.hours.toString())
        setProjectName(entry.project_name || '')
        setCustomerId(entry.customer_id || NO_CUSTOMER_VALUE)
        setHourlyRateCents(entry.hourly_rate_cents ? (entry.hourly_rate_cents / 100).toString() : '')
        setBillable(entry.billable)
      } else {
        // Default to today
        setEntryDate(formatDateISO(new Date()))
        setDescription('')
        setHours('')
        setProjectName('')
        setCustomerId(NO_CUSTOMER_VALUE)
        setHourlyRateCents('')
        setBillable(true)
      }
      // Clear errors
      setDateError('')
      setDescriptionError('')
      setHoursError('')
      setIsSubmitting(false)
    }
  }, [open, entry])

  const handleSave = async () => {
    let hasError = false
    
    // Validate date
    if (!entryDate) {
      setDateError(t('zzpTimeTracking.dateRequired'))
      hasError = true
    }
    
    // Validate description
    if (!description.trim()) {
      setDescriptionError(t('zzpTimeTracking.descriptionRequired'))
      hasError = true
    }
    
    // Validate hours
    const hoursNum = parseFloat(hours)
    if (!hours || isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
      setHoursError(t('zzpTimeTracking.hoursInvalid'))
      hasError = true
    }

    if (hasError) return

    setIsSubmitting(true)

    try {
      const rateNum = hourlyRateCents ? parseFloat(hourlyRateCents) : undefined
      // Convert sentinel value back to undefined for API
      const actualCustomerId = customerId === NO_CUSTOMER_VALUE ? undefined : customerId
      
      await onSave({
        entry_date: entryDate,
        description: description.trim(),
        hours: hoursNum,
        project_name: projectName.trim() || undefined,
        customer_id: actualCustomerId,
        hourly_rate_cents: rateNum ? Math.round(rateNum * 100) : undefined,
        billable,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQuickHours = (value: number) => {
    setHours(value.toString())
    setHoursError('')
  }

  const isFormValid = entryDate && description.trim() && hours && !isNaN(parseFloat(hours)) && parseFloat(hours) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock size={24} className="text-primary" weight="duotone" />
            </div>
            {isEdit ? t('zzpTimeTracking.editEntry') : t('zzpTimeTracking.newEntry')}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isEdit 
              ? t('zzpTimeTracking.editEntryDescription')
              : t('zzpTimeTracking.newEntryDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Date field */}
          <div className="space-y-2">
            <Label htmlFor="entry-date" className="text-sm font-medium">
              {t('zzpTimeTracking.date')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="entry-date"
              type="date"
              value={entryDate}
              onChange={(e) => {
                setEntryDate(e.target.value)
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

          {/* Description field */}
          <div className="space-y-2">
            <Label htmlFor="entry-description" className="text-sm font-medium">
              {t('zzpTimeTracking.description')} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="entry-description"
              placeholder={t('zzpTimeTracking.descriptionPlaceholder')}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                setDescriptionError('')
              }}
              className={`min-h-20 ${descriptionError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              disabled={isSubmitting}
            />
            {descriptionError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle size={14} />
                {descriptionError}
              </p>
            )}
          </div>

          {/* Hours field with quick buttons */}
          <div className="space-y-2">
            <Label htmlFor="entry-hours" className="text-sm font-medium">
              {t('zzpTimeTracking.hours')} <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="entry-hours"
                type="number"
                step="0.25"
                min="0"
                max="24"
                placeholder="0.0"
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value)
                  setHoursError('')
                }}
                className={`h-11 flex-1 ${hoursError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_HOURS.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickHours(value)}
                  disabled={isSubmitting}
                  className="h-8 px-3"
                >
                  {value}h
                </Button>
              ))}
            </div>
            {hoursError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle size={14} />
                {hoursError}
              </p>
            )}
          </div>

          {/* Project name */}
          <div className="space-y-2">
            <Label htmlFor="entry-project" className="text-sm font-medium flex items-center gap-2">
              <Briefcase size={14} className="text-muted-foreground" />
              {t('zzpTimeTracking.project')}
              <span className="text-xs text-muted-foreground font-normal">({t('common.optional')})</span>
            </Label>
            <Input
              id="entry-project"
              placeholder={t('zzpTimeTracking.projectPlaceholder')}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="h-11"
              disabled={isSubmitting}
            />
          </div>

          {/* Customer selection */}
          {customers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="entry-customer" className="text-sm font-medium flex items-center gap-2">
                <User size={14} className="text-muted-foreground" />
                {t('zzpTimeTracking.customer')}
                <span className="text-xs text-muted-foreground font-normal">({t('common.optional')})</span>
              </Label>
              <Select value={customerId} onValueChange={setCustomerId} disabled={isSubmitting}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={t('zzpTimeTracking.selectCustomer')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CUSTOMER_VALUE}>{t('zzpTimeTracking.noCustomer')}</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Hourly rate */}
          <div className="space-y-2">
            <Label htmlFor="entry-rate" className="text-sm font-medium flex items-center gap-2">
              <CurrencyEur size={14} className="text-muted-foreground" />
              {t('zzpTimeTracking.hourlyRate')}
              <span className="text-xs text-muted-foreground font-normal">({t('common.optional')})</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
              <Input
                id="entry-rate"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={hourlyRateCents}
                onChange={(e) => setHourlyRateCents(e.target.value)}
                className="h-11 pl-8"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Billable switch */}
          <div className="flex items-center justify-between py-2 px-3 bg-secondary/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Receipt size={18} className="text-muted-foreground" />
              <Label htmlFor="entry-billable" className="text-sm font-medium cursor-pointer">
                {t('zzpTimeTracking.markAsBillable')}
              </Label>
            </div>
            <Switch
              id="entry-billable"
              checked={billable}
              onCheckedChange={setBillable}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-border/50">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!isFormValid || isSubmitting}
            className="gap-2"
          >
            {isSubmitting && <SpinnerGap size={18} className="animate-spin" />}
            {isEdit ? t('common.save') : t('zzpTimeTracking.addEntry')}
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
  entryDescription,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  entryDescription: string
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('zzpTimeTracking.deleteEntry')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('zzpTimeTracking.deleteConfirmation')}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {t('common.delete')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

// Create Invoice from Time Entries Dialog
const CreateInvoiceDialog = ({
  open,
  onOpenChange,
  entries,
  customers,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: ZZPTimeEntry[]
  customers: ZZPCustomer[]
  onSuccess: () => void
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(NO_CUSTOMER_VALUE)
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Filter to billable entries only
  const billableEntries = useMemo(() => 
    entries.filter(e => e.billable), 
    [entries]
  )

  // Entries for the selected customer
  const customerEntries = useMemo(() => {
    if (selectedCustomerId === NO_CUSTOMER_VALUE) return []
    return billableEntries.filter(e => e.customer_id === selectedCustomerId)
  }, [billableEntries, selectedCustomerId])

  // Customers that have billable entries
  const customersWithEntries = useMemo(() => {
    const customerIds = new Set(billableEntries.filter(e => e.customer_id).map(e => e.customer_id))
    return customers.filter(c => customerIds.has(c.id))
  }, [customers, billableEntries])

  // Reset selections when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedCustomerId(NO_CUSTOMER_VALUE)
      setSelectedEntryIds(new Set())
      setIsSubmitting(false)
    }
  }, [open])

  // Auto-select all entries when customer changes
  useEffect(() => {
    if (selectedCustomerId !== NO_CUSTOMER_VALUE) {
      setSelectedEntryIds(new Set(customerEntries.map(e => e.id)))
    } else {
      setSelectedEntryIds(new Set())
    }
  }, [selectedCustomerId, customerEntries])

  // Calculate totals
  const totals = useMemo(() => {
    const selected = customerEntries.filter(e => selectedEntryIds.has(e.id))
    const hours = selected.reduce((sum, e) => sum + e.hours, 0)
    const entriesWithRate = selected.filter(e => e.hourly_rate_cents)
    const entriesWithoutRate = selected.filter(e => !e.hourly_rate_cents)
    const amount = entriesWithRate.reduce((sum, e) => 
      sum + Math.round(e.hours * (e.hourly_rate_cents || 0)), 0
    )
    return { 
      hours, 
      amount, 
      count: selected.length,
      withoutRateCount: entriesWithoutRate.length 
    }
  }, [customerEntries, selectedEntryIds])

  // Toggle entry selection
  const toggleEntry = (entryId: string) => {
    setSelectedEntryIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(entryId)) {
        newSet.delete(entryId)
      } else {
        newSet.add(entryId)
      }
      return newSet
    })
  }

  // Create draft invoice
  const handleCreateInvoice = async () => {
    if (selectedCustomerId === NO_CUSTOMER_VALUE || selectedEntryIds.size === 0) return

    setIsSubmitting(true)
    try {
      const selectedEntries = customerEntries.filter(e => selectedEntryIds.has(e.id))
      
      // Create invoice lines from time entries
      const lines: ZZPInvoiceLineCreate[] = selectedEntries.map(entry => ({
        description: formatTimeEntryLineDescription(entry),
        quantity: entry.hours,
        unit_price_cents: entry.hourly_rate_cents || 0,
        vat_rate: DEFAULT_VAT_RATE_NL,
      }))

      // Create the invoice
      await zzpApi.invoices.create({
        customer_id: selectedCustomerId,
        issue_date: formatDateISO(new Date()),
        lines,
      })

      toast.success(t('zzpTimeTracking.invoiceCreated'), {
        action: {
          label: t('zzpTimeTracking.invoiceCreatedGoTo'),
          onClick: () => navigateTo('invoices'),
        },
      })

      onOpenChange(false)
      onSuccess()
    } catch (error) {
      console.error('Failed to create invoice:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Format currency
  const formatAmount = (cents: number) => 
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText size={24} className="text-primary" weight="duotone" />
            </div>
            {t('zzpTimeTracking.createInvoiceTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('zzpTimeTracking.createInvoiceDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* No billable entries message */}
          {billableEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Receipt size={40} className="text-muted-foreground mb-3" />
              <p className="font-medium">{t('zzpTimeTracking.noBillableEntries')}</p>
              <p className="text-sm text-muted-foreground">
                {t('zzpTimeTracking.noBillableEntriesDescription')}
              </p>
            </div>
          ) : (
            <>
              {/* Customer selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t('zzpTimeTracking.selectCustomerForInvoice')}
                </Label>
                <Select 
                  value={selectedCustomerId} 
                  onValueChange={setSelectedCustomerId}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder={t('zzpTimeTracking.selectCustomerForInvoice')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CUSTOMER_VALUE}>{t('zzpTimeTracking.noCustomerSelected')}</SelectItem>
                    {customersWithEntries.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Entries list for selected customer */}
              {selectedCustomerId !== NO_CUSTOMER_VALUE && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t('zzpTimeTracking.selectEntriesForInvoice')}
                  </Label>
                  <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                    {customerEntries.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        {t('zzpTimeTracking.noBillableEntries')}
                      </div>
                    ) : (
                      customerEntries.map((entry) => (
                        <label
                          key={entry.id}
                          className="flex items-center gap-3 p-3 hover:bg-secondary/30 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedEntryIds.has(entry.id)}
                            onChange={() => toggleEntry(entry.id)}
                            className="h-4 w-4 rounded border-input"
                            disabled={isSubmitting}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{entry.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateDisplay(entry.entry_date)} • {entry.hours}h
                              {entry.project_name && ` • ${entry.project_name}`}
                            </p>
                          </div>
                          <div className="text-right">
                            {entry.hourly_rate_cents ? (
                              <span className="text-sm font-medium">
                                {formatAmount(Math.round(entry.hours * entry.hourly_rate_cents))}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">{t('zzpTimeTracking.noRate')}</span>
                            )}
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Totals summary */}
              {selectedEntryIds.size > 0 && (
                <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t('zzpTimeTracking.selectedEntries')}</span>
                    <span className="font-medium">{totals.count} ({totals.hours.toFixed(1)}h)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">{t('zzpTimeTracking.totalToInvoice')}</span>
                    <span className="text-lg font-bold text-primary">{formatAmount(totals.amount)}</span>
                  </div>
                  {totals.withoutRateCount > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      ⚠️ {totals.withoutRateCount} {t('zzpTimeTracking.entriesWithoutRate')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="pt-4 border-t border-border/50">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreateInvoice}
            disabled={isSubmitting || selectedCustomerId === NO_CUSTOMER_VALUE || selectedEntryIds.size === 0}
            className="gap-2"
          >
            {isSubmitting && <SpinnerGap size={18} className="animate-spin" />}
            {t('zzpTimeTracking.createDraftInvoice')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Empty state component
const EmptyState = ({ onAddEntry }: { onAddEntry: () => void }) => (
  <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
    <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Clock size={40} weight="duotone" className="text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('zzpTimeTracking.noEntries')}</h3>
      <p className="text-muted-foreground mb-8 max-w-md">
        {t('zzpTimeTracking.noEntriesDescription')}
      </p>
      <Button onClick={onAddEntry} size="lg" className="gap-2 h-12 px-6">
        <Plus size={20} weight="bold" />
        {t('zzpTimeTracking.addFirstEntry')}
      </Button>
    </CardContent>
  </Card>
)

// Clock-in/out card component (Dagstart)
const ClockInCard = ({
  activeSession,
  onClockIn,
  onClockOut,
  isLoading,
}: {
  activeSession: WorkSession | null
  onClockIn: (note?: string) => Promise<void>
  onClockOut: (breakMinutes: number, note?: string) => Promise<void>
  isLoading: boolean
}) => {
  const [showOptions, setShowOptions] = useState(false)
  const [breakMinutes, setBreakMinutes] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const { formatted: timerDisplay } = useTimer(activeSession?.started_at || null)
  const isActive = !!activeSession
  
  const handleClockIn = async () => {
    setIsSubmitting(true)
    try {
      await onClockIn(note.trim() || undefined)
      setNote('')
      setShowOptions(false)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  const handleClockOut = async () => {
    setIsSubmitting(true)
    try {
      const mins = parseInt(breakMinutes) || 0
      await onClockOut(mins, note.trim() || undefined)
      setNote('')
      setBreakMinutes('')
      setShowOptions(false)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  // Format start time for display
  const startTimeDisplay = activeSession?.started_at
    ? new Date(activeSession.started_at).toLocaleTimeString('nl-NL', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    : null
  
  return (
    <Card className="bg-gradient-to-br from-card via-card to-primary/5 backdrop-blur-sm border-2 border-primary/20 mb-6">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left side: Status and timer */}
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${
              isActive 
                ? 'bg-green-500/20 animate-pulse' 
                : 'bg-secondary/50'
            }`}>
              <Timer 
                size={32} 
                className={isActive ? 'text-green-500' : 'text-muted-foreground'} 
                weight="duotone" 
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold">{t('zzpTimeTracking.dagstartTitle')}</h3>
                <Badge 
                  variant={isActive ? 'default' : 'secondary'}
                  className={isActive 
                    ? 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40' 
                    : 'bg-secondary text-muted-foreground'
                  }
                >
                  {isActive ? t('zzpTimeTracking.statusActive') : t('zzpTimeTracking.statusInactive')}
                </Badge>
              </div>
              {isActive ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-mono font-bold text-primary">{timerDisplay}</span>
                  <span className="text-sm text-muted-foreground">
                    ({t('zzpTimeTracking.startedAt')} {startTimeDisplay})
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('zzpTimeTracking.dagstartDescription')}
                </p>
              )}
            </div>
          </div>
          
          {/* Right side: Button */}
          <div className="flex flex-col gap-2 sm:items-end">
            <Button
              onClick={isActive ? handleClockOut : handleClockIn}
              disabled={isLoading || isSubmitting}
              size="lg"
              className={`gap-2 h-12 px-6 min-w-[160px] ${
                isActive 
                  ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isSubmitting ? (
                <>
                  <SpinnerGap size={20} className="animate-spin" />
                  {isActive ? t('zzpTimeTracking.clockingOut') : t('zzpTimeTracking.clockingIn')}
                </>
              ) : isActive ? (
                <>
                  <Stop size={20} weight="fill" />
                  {t('zzpTimeTracking.clockOut')}
                </>
              ) : (
                <>
                  <Play size={20} weight="fill" />
                  {t('zzpTimeTracking.clockIn')}
                </>
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOptions(!showOptions)}
              className="gap-1 text-xs text-muted-foreground"
            >
              {showOptions ? <CaretUp size={14} /> : <CaretDown size={14} />}
              {showOptions ? t('zzpTimeTracking.hideOptions') : t('zzpTimeTracking.showOptions')}
            </Button>
          </div>
        </div>
        
        {/* Expandable options */}
        {showOptions && (
          <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isActive && (
              <div className="space-y-2">
                <Label htmlFor="break-minutes" className="text-sm font-medium">
                  {t('zzpTimeTracking.breakMinutes')}
                </Label>
                <Input
                  id="break-minutes"
                  type="number"
                  min="0"
                  max="480"
                  placeholder={t('zzpTimeTracking.breakMinutesPlaceholder')}
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(e.target.value)}
                  className="h-10"
                  disabled={isSubmitting}
                />
              </div>
            )}
            <div className={`space-y-2 ${!isActive ? 'sm:col-span-2' : ''}`}>
              <Label htmlFor="work-note" className="text-sm font-medium">
                {t('zzpTimeTracking.workNote')}
              </Label>
              <Input
                id="work-note"
                placeholder={t('zzpTimeTracking.workNotePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-10"
                disabled={isSubmitting}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Mobile entry card component
const EntryCard = ({ 
  entry,
  customerName,
  onEdit,
  onDuplicate,
  onDelete 
}: { 
  entry: ZZPTimeEntry
  customerName?: string
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void 
}) => (
  <Card className="bg-card/80 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-colors">
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <CalendarBlank size={20} className="text-primary" weight="duotone" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-muted-foreground">
                {formatDateDisplay(entry.entry_date)}
              </span>
              <span className="text-lg font-bold text-primary">{entry.hours}h</span>
            </div>
            <h4 className="font-medium line-clamp-2">{entry.description}</h4>
            {(entry.project_name || customerName) && (
              <p className="text-sm text-muted-foreground truncate flex items-center gap-1.5 mt-1">
                {entry.project_name && (
                  <>
                    <Briefcase size={12} />
                    {entry.project_name}
                  </>
                )}
                {entry.project_name && customerName && <span>•</span>}
                {customerName && (
                  <>
                    <User size={12} />
                    {customerName}
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <BillableBadge billable={entry.billable} />
      </div>
      <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border/50">
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
          onClick={onDuplicate}
          className="h-9 px-3 gap-2"
        >
          <Copy size={16} />
          {t('zzpTimeTracking.duplicate')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-9 px-3 gap-2 text-destructive hover:text-destructive"
        >
          <TrashSimple size={16} />
          {t('common.delete')}
        </Button>
      </div>
    </CardContent>
  </Card>
)

// Helper component to render entry table
const EntriesTable = ({
  entries,
  customerMap,
  onEdit,
  onDuplicate,
  onDelete,
  title,
  description,
  emptyMessage,
  showInvoiceRef = false
}: {
  entries: ZZPTimeEntry[]
  customerMap: Record<string, string>
  onEdit: (entry: ZZPTimeEntry) => void
  onDuplicate: (entry: ZZPTimeEntry) => void
  onDelete: (entry: ZZPTimeEntry) => void
  title: string
  description: string
  emptyMessage: string
  showInvoiceRef?: boolean
}) => {
  if (entries.length === 0) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm border border-border/50">
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">{emptyMessage}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>
            {description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile: Card list */}
        <div className="sm:hidden space-y-3">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              customerName={entry.customer_id ? customerMap[entry.customer_id] : undefined}
              onEdit={() => onEdit(entry)}
              onDuplicate={() => onDuplicate(entry)}
              onDelete={() => onDelete(entry)}
            />
          ))}
        </div>

        {/* Desktop: Table */}
        <div className="hidden sm:block rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="font-semibold">{t('zzpTimeTracking.columnDate')}</TableHead>
                <TableHead className="font-semibold">{t('zzpTimeTracking.columnDescription')}</TableHead>
                <TableHead className="font-semibold hidden lg:table-cell">{t('zzpTimeTracking.columnProject')}</TableHead>
                <TableHead className="font-semibold text-right">{t('zzpTimeTracking.columnHours')}</TableHead>
                <TableHead className="font-semibold">{t('zzpTimeTracking.columnBillable')}</TableHead>
                {showInvoiceRef && <TableHead className="font-semibold">Factuur</TableHead>}
                <TableHead className="text-right font-semibold">{t('zzpTimeTracking.columnActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className="hover:bg-secondary/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CalendarBlank size={16} className="text-primary" weight="duotone" />
                      </div>
                      <span className="font-medium">{formatDateDisplay(entry.entry_date)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="font-medium truncate">{entry.description}</p>
                      {entry.customer_id && customerMap[entry.customer_id] && (
                        <p className="text-xs text-muted-foreground truncate">
                          <User size={12} className="inline mr-1" />
                          {customerMap[entry.customer_id]}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {entry.project_name ? (
                      <div className="flex items-center gap-2">
                        <Briefcase size={14} className="text-muted-foreground" />
                        <span className="text-sm truncate max-w-[200px]">{entry.project_name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold">{entry.hours.toFixed(2)}h</span>
                  </TableCell>
                  <TableCell>
                    {entry.billable ? (
                      <Badge variant="default" className="gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
                        <CheckCircle size={14} weight="fill" />
                        {t('zzpTimeTracking.billable')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <XCircle size={14} weight="fill" />
                        {t('zzpTimeTracking.nonBillable')}
                      </Badge>
                    )}
                  </TableCell>
                  {showInvoiceRef && (
                    <TableCell>
                      {entry.invoice_id ? (
                        <button 
                          onClick={() => navigateTo(`invoices/${entry.invoice_id}`)}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Receipt size={14} />
                          Factuur
                        </button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(entry)}
                            disabled={entry.is_invoiced}
                            className="h-8 w-8 p-0"
                          >
                            <PencilSimple size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {entry.is_invoiced ? 'Gefactureerde uren kunnen niet worden bewerkt' : t('common.edit')}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDuplicate(entry)}
                            className="h-8 w-8 p-0"
                          >
                            <Copy size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('zzpTimeTracking.duplicate')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(entry)}
                            disabled={entry.is_invoiced}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <TrashSimple size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {entry.is_invoiced ? 'Gefactureerde uren kunnen niet worden verwijderd' : t('common.delete')}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export const ZZPTimeTrackingPage = () => {
  const { user } = useAuth()
  
  // Data state
  const [entries, setEntries] = useState<ZZPTimeEntry[]>([])
  const [weeklySummary, setWeeklySummary] = useState<ZZPWeeklyTimeSummary | null>(null)
  const [customers, setCustomers] = useState<ZZPCustomer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isWeeklyLoading, setIsWeeklyLoading] = useState(true)
  
  const showLoading = useDelayedLoading(isLoading, 300, entries.length > 0)
  
  // Clock-in/out state
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  
  // Week navigation
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getMonday(new Date()))
  
  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<ZZPTimeEntry | undefined>()
  const [deletingEntry, setDeletingEntry] = useState<ZZPTimeEntry | undefined>()
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false)

  // Invoice creation state
  const [invoiceCustomerId, setInvoiceCustomerId] = useState<string>('')
  const [invoicePeriodStart, setInvoicePeriodStart] = useState('')
  const [invoicePeriodEnd, setInvoicePeriodEnd] = useState('')
  const [invoiceHourlyRate, setInvoiceHourlyRate] = useState('')
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false)

  // Productivity filters and sorting
  const [searchTerm, setSearchTerm] = useState('')
  const [billableFilter, setBillableFilter] = useState<'all' | 'billable' | 'non-billable'>('all')
  const [sortOption, setSortOption] = useState<'date-desc' | 'date-asc' | 'hours-desc' | 'hours-asc'>('date-desc')

  // Computed values
  const currentWeekEnd = useMemo(() => getSunday(currentWeekStart), [currentWeekStart])
  const weekRangeDisplay = useMemo(() => formatWeekRange(currentWeekStart, currentWeekEnd), [currentWeekStart, currentWeekEnd])

  // Customer map for quick lookup
  const customerMap = useMemo(() => {
    const map: Record<string, string> = {}
    customers.forEach(c => { map[c.id] = c.name })
    return map
  }, [customers])

  // Calculate unbilled hours for invoice preview
  const unbilledHoursForInvoice = useMemo(() => {
    if (!invoiceCustomerId || !invoicePeriodStart || !invoicePeriodEnd) return 0
    
    const periodStart = new Date(invoicePeriodStart)
    const periodEnd = new Date(invoicePeriodEnd)
    
    return entries
      .filter(e => 
        e.customer_id === invoiceCustomerId &&
        !e.is_invoiced &&
        new Date(e.entry_date) >= periodStart &&
        new Date(e.entry_date) <= periodEnd
      )
      .reduce((sum, e) => sum + e.hours, 0)
  }, [entries, invoiceCustomerId, invoicePeriodStart, invoicePeriodEnd])

  // Calculate invoice total preview
  const invoiceTotalPreview = useMemo(() => {
    const rate = parseFloat(invoiceHourlyRate) || 0
    return unbilledHoursForInvoice * rate
  }, [unbilledHoursForInvoice, invoiceHourlyRate])

  // Split entries into open and invoiced
  const openEntries = useMemo(() => 
    entries.filter(e => !e.is_invoiced),
    [entries]
  )

  const invoicedEntries = useMemo(() => 
    entries.filter(e => e.is_invoiced),
    [entries]
  )

  // Load customers
  const loadCustomers = useCallback(async () => {
    try {
      const response = await zzpApi.customers.list()
      setCustomers(response.customers)
    } catch (error) {
      console.error('Failed to load customers:', error)
    }
  }, [])

  // Load active work session
  const loadActiveSession = useCallback(async () => {
    if (!user?.id) return
    
    setIsSessionLoading(true)
    try {
      const session = await zzpApi.workSessions.getActive()
      setActiveSession(session)
    } catch (error) {
      console.error('Failed to load active session:', error)
      setActiveSession(null)
    } finally {
      setIsSessionLoading(false)
    }
  }, [user?.id])

  // Load weekly summary
  const loadWeeklySummary = useCallback(async () => {
    if (!user?.id) return
    
    setIsWeeklyLoading(true)
    try {
      const summary = await zzpApi.timeEntries.getWeekly(formatDateISO(currentWeekStart))
      setWeeklySummary(summary)
    } catch (error) {
      console.error('Failed to load weekly summary:', error)
      // Create empty summary on error
      setWeeklySummary({
        week_start: formatDateISO(currentWeekStart),
        week_end: formatDateISO(currentWeekEnd),
        total_hours: 0,
        billable_hours: 0,
        entries_by_day: {},
      })
    } finally {
      setIsWeeklyLoading(false)
    }
  }, [user?.id, currentWeekStart, currentWeekEnd])

  // Load entries for current week
  const loadEntries = useCallback(async () => {
    if (!user?.id) return
    
    setIsLoading(true)
    try {
      const response = await zzpApi.timeEntries.list({
        from_date: formatDateISO(currentWeekStart),
        to_date: formatDateISO(currentWeekEnd),
      })
      setEntries(response.entries)
    } catch (error) {
      console.error('Failed to load time entries:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, currentWeekStart, currentWeekEnd])

  // Clock-in handler
  const handleClockIn = useCallback(async (note?: string) => {
    if (!user?.id) {
      toast.error(t('zzpTimeTracking.notLoggedIn'))
      return
    }
    
    // Show loading toast
    const loadingToastId = toast.loading(t('zzpTimeTracking.clockingIn'))
    
    try {
      const session = await zzpApi.workSessions.start({ note })
      setActiveSession(session)
      toast.dismiss(loadingToastId)
      toast.success(t('zzpTimeTracking.workStarted'), {
        description: note ? `📝 ${note}` : undefined
      })
    } catch (error) {
      console.error('Failed to clock in:', error)
      toast.dismiss(loadingToastId)
      toast.error(t('zzpTimeTracking.clockInFailed'), {
        description: parseApiError(error)
      })
    }
  }, [user?.id])

  // Clock-out handler
  const handleClockOut = useCallback(async (breakMinutes: number, note?: string) => {
    if (!user?.id) {
      toast.error(t('zzpTimeTracking.notLoggedIn'))
      return
    }
    
    // Show loading toast
    const loadingToastId = toast.loading(t('zzpTimeTracking.clockingOut'))
    
    try {
      const response = await zzpApi.workSessions.stop({ 
        break_minutes: breakMinutes,
        note 
      })
      setActiveSession(null)
      toast.dismiss(loadingToastId)
      
      // Show success toast with hours added
      const hours = response.hours_added
      toast.success(t('zzpTimeTracking.workStopped'), {
        description: `✅ ${hours} ${t('zzpTimeTracking.hoursAdded')} ${t('zzpTimeTracking.addedToTimesheet')}`
      })
      
      // Reload entries and weekly summary to reflect the new entry
      await Promise.all([loadEntries(), loadWeeklySummary()])
    } catch (error) {
      console.error('Failed to clock out:', error)
      toast.dismiss(loadingToastId)
      toast.error(t('zzpTimeTracking.clockOutFailed'), {
        description: parseApiError(error)
      })
    }
  }, [user?.id, loadEntries, loadWeeklySummary])

  // Initial load
  useEffect(() => {
    loadCustomers()
    loadActiveSession()
  }, [loadCustomers, loadActiveSession])

  // Poll for active session every 15 seconds to keep state in sync
  useEffect(() => {
    const interval = setInterval(() => {
      loadActiveSession()
    }, 15000) // 15 seconds
    
    return () => clearInterval(interval)
  }, [loadActiveSession])

  // Load data when week changes
  useEffect(() => {
    loadEntries()
    loadWeeklySummary()
  }, [loadEntries, loadWeeklySummary])

  // Initialize invoice period to current week
  useEffect(() => {
    setInvoicePeriodStart(formatDateISO(currentWeekStart))
    setInvoicePeriodEnd(formatDateISO(currentWeekEnd))
  }, [currentWeekStart, currentWeekEnd])

  // Week navigation
  const goToPreviousWeek = useCallback(() => {
    setCurrentWeekStart(prev => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() - 7)
      return newDate
    })
  }, [])

  const goToNextWeek = useCallback(() => {
    setCurrentWeekStart(prev => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() + 7)
      return newDate
    })
  }, [])

  const goToCurrentWeek = useCallback(() => {
    setCurrentWeekStart(getMonday(new Date()))
  }, [])

  // Handle save entry
  const handleSaveEntry = useCallback(async (data: ZZPTimeEntryCreate) => {
    if (!user?.id) return

    try {
      if (editingEntry?.id) {
        await zzpApi.timeEntries.update(editingEntry.id, data as ZZPTimeEntryUpdate)
        toast.success(t('zzpTimeTracking.entrySaved'))
      } else {
        await zzpApi.timeEntries.create(data)
        toast.success(t('zzpTimeTracking.entrySaved'))
      }

      // Reload data
      await Promise.all([loadEntries(), loadWeeklySummary()])

      setIsFormOpen(false)
      setEditingEntry(undefined)
    } catch (error) {
      console.error('Failed to save time entry:', error)
      toast.error(parseApiError(error))
    }
  }, [user?.id, editingEntry, loadEntries, loadWeeklySummary])

  // Handle delete entry
  const handleDeleteEntry = useCallback(async () => {
    if (!user?.id || !deletingEntry) return

    try {
      await zzpApi.timeEntries.delete(deletingEntry.id)
      toast.success(t('zzpTimeTracking.entryDeleted'))
      
      // Reload data
      await Promise.all([loadEntries(), loadWeeklySummary()])
    } catch (error) {
      console.error('Failed to delete time entry:', error)
      toast.error(parseApiError(error))
    }

    setDeletingEntry(undefined)
  }, [user?.id, deletingEntry, loadEntries, loadWeeklySummary])

  // Handle invoice creation from time entries
  const handleCreateInvoiceFromTimeEntries = useCallback(async () => {
    if (!invoiceCustomerId || !invoicePeriodStart || !invoicePeriodEnd || !invoiceHourlyRate) {
      toast.error('Vul alle velden in om een factuur te maken')
      return
    }

    if (unbilledHoursForInvoice === 0) {
      toast.error('Geen ongefactureerde uren gevonden voor deze periode en klant')
      return
    }

    setIsCreatingInvoice(true)
    try {
      const hourlyRateCents = Math.round(parseFloat(invoiceHourlyRate) * 100)
      
      const invoice = await zzpApi.timeEntries.createInvoice({
        customer_id: invoiceCustomerId,
        period_start: invoicePeriodStart,
        period_end: invoicePeriodEnd,
        hourly_rate_cents: hourlyRateCents,
        issue_date: formatDateISO(new Date()),
        due_date: formatDateISO(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)), // 14 days from now
      })

      toast.success('Factuur succesvol aangemaakt', {
        action: {
          label: 'Bekijk factuur',
          onClick: () => navigateTo(`invoices/${invoice.id}`),
        },
      })

      // Reset form
      setInvoiceCustomerId('')
      setInvoiceHourlyRate('')
      
      // Reload data
      await Promise.all([loadEntries(), loadWeeklySummary()])
    } catch (error) {
      console.error('Failed to create invoice:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsCreatingInvoice(false)
    }
  }, [
    invoiceCustomerId, 
    invoicePeriodStart, 
    invoicePeriodEnd, 
    invoiceHourlyRate,
    unbilledHoursForInvoice,
    loadEntries,
    loadWeeklySummary
  ])

  // Open form for new entry
  const openNewForm = useCallback(() => {
    setEditingEntry(undefined)
    setIsFormOpen(true)
  }, [])

  // Open form for editing
  const openEditForm = useCallback((entry: ZZPTimeEntry) => {
    setEditingEntry(entry)
    setIsFormOpen(true)
  }, [])

  // Filter and sort entries - separate for open and invoiced
  const filteredOpenEntries = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    const filtered = openEntries.filter((entry) => {
      const customerName = entry.customer_id ? customerMap[entry.customer_id] : ''
      const matchesSearch = !query || [
        entry.description,
        entry.project_name,
        customerName,
      ].some((value) => (value || '').toLowerCase().includes(query))

      const matchesBillableFilter =
        billableFilter === 'all' ||
        (billableFilter === 'billable' && entry.billable) ||
        (billableFilter === 'non-billable' && !entry.billable)

      return matchesSearch && matchesBillableFilter
    })

    return filtered.sort((a, b) => {
      switch (sortOption) {
        case 'date-asc':
          return a.entry_date.localeCompare(b.entry_date)
        case 'hours-desc':
          return b.hours - a.hours
        case 'hours-asc':
          return a.hours - b.hours
        case 'date-desc':
        default:
          return b.entry_date.localeCompare(a.entry_date)
      }
    })
  }, [openEntries, searchTerm, billableFilter, sortOption, customerMap])

  const filteredInvoicedEntries = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    const filtered = invoicedEntries.filter((entry) => {
      const customerName = entry.customer_id ? customerMap[entry.customer_id] : ''
      const matchesSearch = !query || [
        entry.description,
        entry.project_name,
        customerName,
      ].some((value) => (value || '').toLowerCase().includes(query))

      const matchesBillableFilter =
        billableFilter === 'all' ||
        (billableFilter === 'billable' && entry.billable) ||
        (billableFilter === 'non-billable' && !entry.billable)

      return matchesSearch && matchesBillableFilter
    })

    return filtered.sort((a, b) => {
      switch (sortOption) {
        case 'date-asc':
          return a.entry_date.localeCompare(b.entry_date)
        case 'hours-desc':
          return b.hours - a.hours
        case 'hours-asc':
          return a.hours - b.hours
        case 'date-desc':
        default:
          return b.entry_date.localeCompare(a.entry_date)
      }
    })
  }, [invoicedEntries, searchTerm, billableFilter, sortOption, customerMap])

  // Combined for metrics
  const filteredEntries = useMemo(() => 
    [...filteredOpenEntries, ...filteredInvoicedEntries],
    [filteredOpenEntries, filteredInvoicedEntries]
  )

  const productivityMetrics = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, entry) => sum + entry.hours, 0)
    const billableHours = filteredEntries.filter((entry) => entry.billable).reduce((sum, entry) => sum + entry.hours, 0)
    const utilization = totalHours > 0 ? (billableHours / totalHours) * 100 : 0

    return {
      totalHours,
      billableHours,
      utilization,
      averageHoursPerEntry: filteredEntries.length > 0 ? totalHours / filteredEntries.length : 0,
    }
  }, [filteredEntries])

  const exportEntriesToCsv = useCallback(() => {
    if (filteredEntries.length === 0) {
      toast.error(t('zzpTimeTracking.noEntriesToExport'))
      return
    }

    const headers = [
      t('zzpTimeTracking.columnDate'),
      t('zzpTimeTracking.columnDescription'),
      t('zzpTimeTracking.columnProject'),
      t('zzpTimeTracking.customer'),
      t('zzpTimeTracking.columnHours'),
      t('zzpTimeTracking.columnBillable'),
      t('zzpTimeTracking.hourlyRate'),
    ]

    const rows = filteredEntries.map((entry) => [
      entry.entry_date,
      entry.description,
      entry.project_name || '-',
      entry.customer_id ? customerMap[entry.customer_id] || '-' : '-',
      entry.hours.toString(),
      entry.billable ? t('zzpTimeTracking.billable') : t('zzpTimeTracking.nonBillable'),
      entry.hourly_rate_cents ? (entry.hourly_rate_cents / 100).toFixed(2) : '-',
    ])

    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `uren-${formatDateISO(currentWeekStart)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t('zzpTimeTracking.exportSuccess'))
  }, [filteredEntries, customerMap, currentWeekStart])

  const duplicateEntry = useCallback((entry: ZZPTimeEntry) => {
    setEditingEntry({
      ...entry,
      id: '',
      entry_date: formatDateISO(new Date()),
    })
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
              <Clock size={28} className="text-primary sm:hidden" weight="duotone" />
              <Clock size={40} className="text-primary hidden sm:block" weight="duotone" />
              {t('zzpTimeTracking.title')}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t('zzpTimeTracking.pageDescription')}
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  onClick={() => setIsInvoiceDialogOpen(true)}
                  className="gap-2 h-10 sm:h-11 flex-1 sm:flex-none"
                >
                  <FileText size={18} />
                  <span className="hidden sm:inline">{t('zzpTimeTracking.createInvoice')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('zzpTimeTracking.createInvoiceTooltip')}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline"
                  onClick={exportEntriesToCsv}
                  className="gap-2 h-10 sm:h-11 flex-1 sm:flex-none"
                >
                  <Export size={18} />
                  <span className="hidden sm:inline">{t('zzpTimeTracking.export')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('zzpTimeTracking.exportTooltip')}</p>
              </TooltipContent>
            </Tooltip>
            <Button onClick={openNewForm} className="gap-2 h-10 sm:h-11 flex-1 sm:flex-none">
              <Plus size={18} weight="bold" />
              {t('zzpTimeTracking.newEntry')}
            </Button>
          </div>
        </div>

        {/* Clock-in/out Card (Dagstart) */}
        <ClockInCard
          activeSession={activeSession}
          onClockIn={handleClockIn}
          onClockOut={handleClockOut}
          isLoading={isSessionLoading}
        />

        {/* Invoice Creation Block - Facturatie deze week */}
        <Card className="bg-gradient-to-br from-primary/5 to-accent/5 backdrop-blur-sm border border-primary/20 mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Receipt size={24} className="text-primary" weight="duotone" />
              </div>
              Facturatie deze week
            </CardTitle>
            <CardDescription>
              Genereer direct een factuur van ongefactureerde uren
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Customer selector */}
              <div className="space-y-2">
                <Label htmlFor="invoice-customer">Klant *</Label>
                <Select value={invoiceCustomerId} onValueChange={setInvoiceCustomerId}>
                  <SelectTrigger id="invoice-customer">
                    <SelectValue placeholder="Selecteer klant..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Hourly rate */}
              <div className="space-y-2">
                <Label htmlFor="invoice-rate">Uurtarief (€) *</Label>
                <Input
                  id="invoice-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="bijv. 75.00"
                  value={invoiceHourlyRate}
                  onChange={(e) => setInvoiceHourlyRate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Period start */}
              <div className="space-y-2">
                <Label htmlFor="invoice-period-start">Periode van</Label>
                <Input
                  id="invoice-period-start"
                  type="date"
                  value={invoicePeriodStart}
                  onChange={(e) => setInvoicePeriodStart(e.target.value)}
                />
              </div>

              {/* Period end */}
              <div className="space-y-2">
                <Label htmlFor="invoice-period-end">Periode tot</Label>
                <Input
                  id="invoice-period-end"
                  type="date"
                  value={invoicePeriodEnd}
                  onChange={(e) => setInvoicePeriodEnd(e.target.value)}
                />
              </div>
            </div>

            {/* Preview */}
            {invoiceCustomerId && invoiceHourlyRate && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Totaal uren:</span>
                  <span className="font-semibold">{unbilledHoursForInvoice.toFixed(2)}h</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Uurtarief:</span>
                  <span className="font-semibold">€{parseFloat(invoiceHourlyRate).toFixed(2)}</span>
                </div>
                <div className="h-px bg-border my-2" />
                <div className="flex justify-between">
                  <span className="font-semibold">Totaal (excl. BTW):</span>
                  <span className="text-lg font-bold text-primary">
                    €{invoiceTotalPreview.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Create invoice button */}
            <Button
              onClick={handleCreateInvoiceFromTimeEntries}
              disabled={!invoiceCustomerId || !invoiceHourlyRate || unbilledHoursForInvoice === 0 || isCreatingInvoice}
              className="w-full gap-2"
            >
              {isCreatingInvoice ? (
                <>
                  <SpinnerGap size={20} className="animate-spin" />
                  Factuur aanmaken...
                </>
              ) : (
                <>
                  <Receipt size={20} />
                  Maak factuur
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Week Navigation */}
        <Card className="bg-card/80 backdrop-blur-sm border border-border/50 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToPreviousWeek}
                className="gap-1"
              >
                <CaretLeft size={18} />
                <span className="hidden sm:inline">{t('zzpTimeTracking.previousWeek')}</span>
              </Button>
              
              <div className="flex items-center gap-3">
                <CalendarBlank size={20} className="text-primary" weight="duotone" />
                <span className="font-semibold text-sm sm:text-base">{weekRangeDisplay}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToCurrentWeek}
                  className="h-7 px-2 text-xs"
                >
                  {t('zzpTimeTracking.today')}
                </Button>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={goToNextWeek}
                className="gap-1"
              >
                <span className="hidden sm:inline">{t('zzpTimeTracking.nextWeek')}</span>
                <CaretRight size={18} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        {isWeeklyLoading ? (
          <StatsLoadingSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
            <StatsCard 
              title={t('zzpTimeTracking.totalHours')} 
              value={weeklySummary?.total_hours.toFixed(1) || '0.0'} 
              unit="h"
              icon={Timer}
              className="border-primary/20"
            />
            <StatsCard 
              title={t('zzpTimeTracking.billableHours')} 
              value={weeklySummary?.billable_hours.toFixed(1) || '0.0'} 
              unit="h"
              icon={Receipt}
              className="border-green-500/20"
            />
            <StatsCard
              title={t('zzpTimeTracking.utilization')}
              value={productivityMetrics.utilization.toFixed(0)}
              unit="%"
              icon={TrendUp}
              className="col-span-2 lg:col-span-1 border-blue-500/20"
            />
          </div>
        )}

        {/* Weekly Summary Bar */}
        {!isWeeklyLoading && weeklySummary && (
          <WeeklySummaryBar 
            entriesByDay={weeklySummary.entries_by_day} 
            weekStart={currentWeekStart}
          />
        )}

        {!showLoading && (
          <Card className="bg-card/80 backdrop-blur-sm border border-border/50 mb-6">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2 relative">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('zzpTimeTracking.searchPlaceholder')}
                    className="pl-9"
                  />
                </div>
                <Select value={billableFilter} onValueChange={(v: 'all' | 'billable' | 'non-billable') => setBillableFilter(v)}>
                  <SelectTrigger className="gap-2">
                    <div className="flex items-center gap-2">
                      <Funnel size={14} />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('zzpTimeTracking.filterAll')}</SelectItem>
                    <SelectItem value="billable">{t('zzpTimeTracking.filterBillable')}</SelectItem>
                    <SelectItem value="non-billable">{t('zzpTimeTracking.filterNonBillable')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOption} onValueChange={(v: 'date-desc' | 'date-asc' | 'hours-desc' | 'hours-asc') => setSortOption(v)}>
                  <SelectTrigger className="gap-2">
                    <div className="flex items-center gap-2">
                      <ArrowsDownUp size={14} />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date-desc">{t('zzpTimeTracking.sortDateDesc')}</SelectItem>
                    <SelectItem value="date-asc">{t('zzpTimeTracking.sortDateAsc')}</SelectItem>
                    <SelectItem value="hours-desc">{t('zzpTimeTracking.sortHoursDesc')}</SelectItem>
                    <SelectItem value="hours-asc">{t('zzpTimeTracking.sortHoursAsc')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show loading, empty state or content */}
        {showLoading ? (
          <TableLoadingSkeleton />
        ) : filteredEntries.length === 0 ? (
          <EmptyState onAddEntry={openNewForm} />
        ) : (
          <div className="space-y-6">
            {/* Open uren (not invoiced) */}
            <EntriesTable
              entries={filteredOpenEntries}
              customerMap={customerMap}
              onEdit={openEditForm}
              onDuplicate={duplicateEntry}
              onDelete={setDeletingEntry}
              title="Open uren"
              description={`${filteredOpenEntries.length} ${filteredOpenEntries.length === 1 ? 'uur' : 'uren'} nog niet gefactureerd`}
              emptyMessage="Geen open uren gevonden. Alle uren zijn gefactureerd."
              showInvoiceRef={false}
            />

            {/* Gefactureerde uren (invoiced) */}
            {filteredInvoicedEntries.length > 0 && (
              <EntriesTable
                entries={filteredInvoicedEntries}
                customerMap={customerMap}
                onEdit={openEditForm}
                onDuplicate={duplicateEntry}
                onDelete={setDeletingEntry}
                title="Gefactureerde uren"
                description={`${filteredInvoicedEntries.length} ${filteredInvoicedEntries.length === 1 ? 'uur' : 'uren'} gefactureerd`}
                emptyMessage="Geen gefactureerde uren gevonden."
                showInvoiceRef={true}
              />
            )}
          </div>
        )}
      </div>

      {/* Time entry form dialog */}
      <TimeEntryFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) setEditingEntry(undefined)
        }}
        entry={editingEntry}
        onSave={handleSaveEntry}
        customers={customers}
      />

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={!!deletingEntry}
        onOpenChange={(open) => {
          if (!open) setDeletingEntry(undefined)
        }}
        onConfirm={handleDeleteEntry}
        entryDescription={deletingEntry?.description || ''}
      />

      {/* Create invoice dialog */}
      <CreateInvoiceDialog
        open={isInvoiceDialogOpen}
        onOpenChange={setIsInvoiceDialogOpen}
        entries={entries}
        customers={customers}
        onSuccess={loadEntries}
      />
    </div>
  )
}

export default ZZPTimeTrackingPage
