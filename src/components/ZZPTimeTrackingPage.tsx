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
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthContext'
import { 
  zzpApi, 
  ZZPTimeEntry, 
  ZZPTimeEntryCreate, 
  ZZPTimeEntryUpdate,
  ZZPTimeEntryListResponse,
  ZZPWeeklyTimeSummary,
  ZZPCustomer,
  WorkSession,
} from '@/lib/api'
import { t } from '@/i18n'
import { toast } from 'sonner'

// Sentinel value for "no customer" selection (empty string is not allowed in Radix Select v2+)
const NO_CUSTOMER_VALUE = "__none__"

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
  <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
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
        customer_id: actualCustomerId || undefined,
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
  onDelete 
}: { 
  entry: ZZPTimeEntry
  customerName?: string
  onEdit: () => void
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

export const ZZPTimeTrackingPage = () => {
  const { user } = useAuth()
  
  // Data state
  const [entries, setEntries] = useState<ZZPTimeEntry[]>([])
  const [weeklySummary, setWeeklySummary] = useState<ZZPWeeklyTimeSummary | null>(null)
  const [customers, setCustomers] = useState<ZZPCustomer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isWeeklyLoading, setIsWeeklyLoading] = useState(true)
  
  // Clock-in/out state
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  
  // Week navigation
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getMonday(new Date()))
  
  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<ZZPTimeEntry | undefined>()
  const [deletingEntry, setDeletingEntry] = useState<ZZPTimeEntry | undefined>()

  // Computed values
  const currentWeekEnd = useMemo(() => getSunday(currentWeekStart), [currentWeekStart])
  const weekRangeDisplay = useMemo(() => formatWeekRange(currentWeekStart, currentWeekEnd), [currentWeekStart, currentWeekEnd])

  // Customer map for quick lookup
  const customerMap = useMemo(() => {
    const map: Record<string, string> = {}
    customers.forEach(c => { map[c.id] = c.name })
    return map
  }, [customers])

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
      toast.error(t('zzpTimeTracking.errorLoadingEntries'))
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, currentWeekStart, currentWeekEnd])

  // Clock-in handler
  const handleClockIn = useCallback(async (note?: string) => {
    if (!user?.id) return
    
    try {
      const session = await zzpApi.workSessions.start({ note })
      setActiveSession(session)
      toast.success(t('zzpTimeTracking.workStarted'))
    } catch (error: any) {
      console.error('Failed to clock in:', error)
      const message = error?.response?.data?.detail?.message || t('zzpTimeTracking.errorClockIn')
      toast.error(message)
    }
  }, [user?.id])

  // Clock-out handler
  const handleClockOut = useCallback(async (breakMinutes: number, note?: string) => {
    if (!user?.id) return
    
    try {
      const response = await zzpApi.workSessions.stop({ 
        break_minutes: breakMinutes,
        note 
      })
      setActiveSession(null)
      toast.success(`${t('zzpTimeTracking.workStopped')} — ${response.hours_added} ${t('zzpTimeTracking.hoursAdded')}`)
      
      // Reload entries and weekly summary to reflect the new entry
      await Promise.all([loadEntries(), loadWeeklySummary()])
    } catch (error: any) {
      console.error('Failed to clock out:', error)
      const message = error?.response?.data?.detail?.message || t('zzpTimeTracking.errorClockOut')
      toast.error(message)
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
      if (editingEntry) {
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
      toast.error(t('zzpTimeTracking.errorSavingEntry'))
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
      toast.error(t('zzpTimeTracking.errorDeletingEntry'))
    }

    setDeletingEntry(undefined)
  }, [user?.id, deletingEntry, loadEntries, loadWeeklySummary])

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

  // Sort entries by date (most recent first)
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date))
  }, [entries])

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
          <Button onClick={openNewForm} className="gap-2 h-10 sm:h-11 w-full sm:w-auto">
            <Plus size={18} weight="bold" />
            {t('zzpTimeTracking.newEntry')}
          </Button>
        </div>

        {/* Clock-in/out Card (Dagstart) */}
        <ClockInCard
          activeSession={activeSession}
          onClockIn={handleClockIn}
          onClockOut={handleClockOut}
          isLoading={isSessionLoading}
        />

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
          </div>
        )}

        {/* Weekly Summary Bar */}
        {!isWeeklyLoading && weeklySummary && (
          <WeeklySummaryBar 
            entriesByDay={weeklySummary.entries_by_day} 
            weekStart={currentWeekStart}
          />
        )}

        {/* Show loading, empty state or content */}
        {isLoading ? (
          <TableLoadingSkeleton />
        ) : entries.length === 0 ? (
          <EmptyState onAddEntry={openNewForm} />
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{t('zzpTimeTracking.entriesTitle')}</CardTitle>
                  <CardDescription>
                    {entries.length} {entries.length === 1 ? t('zzpTimeTracking.entry') : t('zzpTimeTracking.entries')} {t('zzpTimeTracking.thisWeek')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Mobile: Card list */}
              <div className="sm:hidden space-y-3">
                {sortedEntries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    customerName={entry.customer_id ? customerMap[entry.customer_id] : undefined}
                    onEdit={() => openEditForm(entry)}
                    onDelete={() => setDeletingEntry(entry)}
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
                      <TableHead className="text-right font-semibold">{t('zzpTimeTracking.columnActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEntries.map((entry) => (
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
                              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                                <User size={12} />
                                {customerMap[entry.customer_id]}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden lg:table-cell">
                          {entry.project_name || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold text-primary">{entry.hours}h</span>
                        </TableCell>
                        <TableCell>
                          <BillableBadge billable={entry.billable} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditForm(entry)}
                              className="h-8 w-8 p-0"
                            >
                              <PencilSimple size={16} />
                              <span className="sr-only">{t('common.edit')}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingEntry(entry)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <TrashSimple size={16} />
                              <span className="sr-only">{t('common.delete')}</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
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
    </div>
  )
}

export default ZZPTimeTrackingPage
