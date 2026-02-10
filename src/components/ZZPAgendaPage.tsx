/**
 * ZZP Agenda Page
 * 
 * Full CRUD functionality for managing calendar events.
 * 
 * Premium UI with:
 * - Month calendar view with event indicators
 * - List view of events for selected month/day
 * - Modal for create/edit
 * - Loading/skeleton states
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  CalendarBlank, 
  Plus, 
  PencilSimple, 
  TrashSimple,
  CheckCircle,
  XCircle,
  SpinnerGap,
  CaretLeft,
  CaretRight,
  MapPin,
  Clock,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthContext'
import { zzpApi, ZZPCalendarEvent, ZZPCalendarEventCreate, ZZPCalendarEventUpdate } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

// Dutch day abbreviations (week starts on Monday)
const WEEKDAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

// Dutch month names
const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'
]

// Format datetime for display
const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString)
  return date.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// Format time only
const formatTime = (isoString: string): string => {
  const date = new Date(isoString)
  return date.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// Format date for input
const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0]
}

// Format time for input
const formatTimeForInput = (date: Date): string => {
  return date.toTimeString().slice(0, 5)
}

// Parse date and time inputs to ISO string
const toISOString = (dateStr: string, timeStr: string): string => {
  return `${dateStr}T${timeStr}:00`
}

// Get days in month
const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month + 1, 0).getDate()
}

// Get day of week for first day of month (0 = Monday, 6 = Sunday)
const getFirstDayOfMonth = (year: number, month: number): number => {
  const day = new Date(year, month, 1).getDay()
  // Convert Sunday (0) to 6, and shift other days back by 1
  return day === 0 ? 6 : day - 1
}

// Check if two dates are the same day
const isSameDay = (d1: Date, d2: Date): boolean => {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
}

// Loading skeleton for calendar
const CalendarLoadingSkeleton = () => (
  <Card className="bg-card/80 backdrop-blur-sm">
    <CardContent className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-9 w-9 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i + 7} className="h-12 sm:h-16 w-full" />
        ))}
      </div>
    </CardContent>
  </Card>
)

// Loading skeleton for event list
const EventListLoadingSkeleton = () => (
  <Card className="bg-card/80 backdrop-blur-sm">
    <CardContent className="p-4 sm:p-6">
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-3 sm:gap-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32 sm:w-48" />
                <Skeleton className="h-3 w-24 sm:w-32" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)

// Event form dialog
const EventFormDialog = ({
  open,
  onOpenChange,
  event,
  onSave,
  selectedDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  event?: ZZPCalendarEvent
  onSave: (data: ZZPCalendarEventCreate) => Promise<void>
  selectedDate?: Date
}) => {
  const isEdit = !!event
  
  // Form fields
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  
  // Validation errors
  const [titleError, setTitleError] = useState('')
  const [startError, setStartError] = useState('')
  const [endError, setEndError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when dialog opens/closes or event changes
  useEffect(() => {
    if (open) {
      if (event) {
        const start = new Date(event.start_datetime)
        const end = new Date(event.end_datetime)
        setTitle(event.title)
        setStartDate(formatDateForInput(start))
        setStartTime(formatTimeForInput(start))
        setEndDate(formatDateForInput(end))
        setEndTime(formatTimeForInput(end))
        setLocation(event.location || '')
        setNotes(event.notes || '')
      } else {
        const date = selectedDate || new Date()
        const dateStr = formatDateForInput(date)
        setTitle('')
        setStartDate(dateStr)
        setStartTime('09:00')
        setEndDate(dateStr)
        setEndTime('10:00')
        setLocation('')
        setNotes('')
      }
      // Clear errors
      setTitleError('')
      setStartError('')
      setEndError('')
      setIsSubmitting(false)
    }
  }, [open, event, selectedDate])

  const handleSave = async () => {
    let hasError = false
    
    // Validate title
    if (!title.trim()) {
      setTitleError(t('zzpAgenda.formTitleRequired'))
      hasError = true
    }
    
    // Validate start datetime
    if (!startDate || !startTime) {
      setStartError(t('zzpAgenda.formStartRequired'))
      hasError = true
    }
    
    // Validate end datetime
    if (!endDate || !endTime) {
      setEndError(t('zzpAgenda.formEndRequired'))
      hasError = true
    }
    
    // Validate end is after start
    if (startDate && startTime && endDate && endTime) {
      const startDateTime = new Date(toISOString(startDate, startTime))
      const endDateTime = new Date(toISOString(endDate, endTime))
      if (endDateTime <= startDateTime) {
        setEndError(t('zzpAgenda.formEndAfterStart'))
        hasError = true
      }
    }

    if (hasError) return

    setIsSubmitting(true)

    try {
      await onSave({
        title: title.trim(),
        start_datetime: toISOString(startDate, startTime),
        end_datetime: toISOString(endDate, endTime),
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isFormValid = title.trim() && startDate && startTime && endDate && endTime

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CalendarBlank size={24} className="text-primary" weight="duotone" />
            </div>
            {isEdit ? t('zzpAgenda.editEvent') : t('zzpAgenda.newEvent')}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isEdit 
              ? t('zzpAgenda.editEventDescription')
              : t('zzpAgenda.newEventDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Title field (required) */}
          <div className="space-y-2">
            <Label htmlFor="event-title" className="text-sm font-medium">
              {t('zzpAgenda.formTitle')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event-title"
              placeholder={t('zzpAgenda.formTitlePlaceholder')}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleError('')
              }}
              className={`h-11 ${titleError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              disabled={isSubmitting}
              autoFocus
            />
            {titleError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle size={14} />
                {titleError}
              </p>
            )}
          </div>

          {/* Start date/time */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('zzpAgenda.formStart')} <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setStartError('')
                  // Auto-set end date if empty or before new start
                  if (!endDate || e.target.value > endDate) {
                    setEndDate(e.target.value)
                  }
                }}
                className={`h-11 ${startError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
              />
              <Input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value)
                  setStartError('')
                }}
                className={`h-11 ${startError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
              />
            </div>
            {startError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle size={14} />
                {startError}
              </p>
            )}
          </div>

          {/* End date/time */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('zzpAgenda.formEnd')} <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setEndError('')
                }}
                className={`h-11 ${endError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
              />
              <Input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value)
                  setEndError('')
                }}
                className={`h-11 ${endError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
              />
            </div>
            {endError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle size={14} />
                {endError}
              </p>
            )}
          </div>

          {/* Location (optional) */}
          <div className="space-y-2">
            <Label htmlFor="event-location" className="text-sm font-medium">
              {t('zzpAgenda.formLocation')}
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({t('zzpAgenda.helperOptional')})
              </span>
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                id="event-location"
                placeholder={t('zzpAgenda.formLocationPlaceholder')}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-11 pl-10"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Notes (optional) */}
          <div className="space-y-2">
            <Label htmlFor="event-notes" className="text-sm font-medium">
              {t('zzpAgenda.formNotes')}
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({t('zzpAgenda.helperOptional')})
              </span>
            </Label>
            <Textarea
              id="event-notes"
              placeholder={t('zzpAgenda.formNotesPlaceholder')}
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
                {t('zzpAgenda.saveEvent')}
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
  eventTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  eventTitle: string
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('zzpAgenda.deleteEvent')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('zzpAgenda.deleteEventConfirm')}
            <br />
            <span className="font-medium">{eventTitle}</span>
            <br /><br />
            {t('zzpAgenda.deleteEventWarning')}
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
const EmptyState = ({ onAddEvent }: { onAddEvent: () => void }) => (
  <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
    <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <CalendarBlank size={40} weight="duotone" className="text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('zzpAgenda.noEvents')}</h3>
      <p className="text-muted-foreground mb-8 max-w-md">
        {t('zzpAgenda.noEventsDescription')}
      </p>
      <Button onClick={onAddEvent} size="lg" className="gap-2 h-12 px-6">
        <Plus size={20} weight="bold" />
        {t('zzpAgenda.addFirstEvent')}
      </Button>
    </CardContent>
  </Card>
)

// Mobile event card component
const EventCard = ({ 
  event, 
  onEdit, 
  onDelete 
}: { 
  event: ZZPCalendarEvent
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
            <h4 className="font-semibold truncate">{event.title}</h4>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <Clock size={12} />
              <span>
                {formatDateTime(event.start_datetime)} - {formatTime(event.end_datetime)}
              </span>
            </div>
            {event.location && (
              <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                <MapPin size={12} />
                <span className="truncate">{event.location}</span>
              </div>
            )}
          </div>
        </div>
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

// Calendar day cell component
const CalendarDayCell = ({
  day,
  isCurrentMonth,
  isToday,
  isSelected,
  eventCount,
  onClick,
}: {
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  eventCount: number
  onClick: () => void
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        relative h-12 sm:h-16 p-1 sm:p-2 text-center border border-border/30 rounded-md transition-all
        hover:bg-primary/5 hover:border-primary/30
        ${!isCurrentMonth ? 'text-muted-foreground/50 bg-secondary/20' : 'bg-card/50'}
        ${isToday ? 'ring-2 ring-primary/50 bg-primary/5' : ''}
        ${isSelected ? 'bg-primary/10 border-primary/50' : ''}
      `}
    >
      <span className={`text-xs sm:text-sm font-medium ${isToday ? 'text-primary font-bold' : ''}`}>
        {day}
      </span>
      {eventCount > 0 && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
          {eventCount <= 3 ? (
            Array.from({ length: eventCount }).map((_, i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-full bg-primary" />
            ))
          ) : (
            <>
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-[10px] text-primary font-medium">+{eventCount - 2}</span>
            </>
          )}
        </div>
      )}
    </button>
  )
}

export const ZZPAgendaPage = () => {
  const { user } = useAuth()
  const [events, setEvents] = useState<ZZPCalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  const showLoading = useDelayedLoading(isLoading, 300, events.length > 0)
  
  // Current view state
  const today = useMemo(() => new Date(), [])
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  
  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ZZPCalendarEvent | undefined>()
  const [deletingEvent, setDeletingEvent] = useState<ZZPCalendarEvent | undefined>()

  // Get events for the current view month
  const loadEvents = useCallback(async () => {
    if (!user?.id) return
    
    setIsLoading(true)
    try {
      const response = await zzpApi.calendarEvents.list({
        year: viewYear,
        month: viewMonth + 1, // API expects 1-12
      })
      setEvents(response.events)
    } catch (error) {
      console.error('Failed to load events:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, viewYear, viewMonth])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<number, ZZPCalendarEvent[]>()
    events.forEach(event => {
      const eventDate = new Date(event.start_datetime)
      // Only include events that start in the current view month
      if (eventDate.getMonth() === viewMonth && eventDate.getFullYear() === viewYear) {
        const day = eventDate.getDate()
        const existing = map.get(day) || []
        existing.push(event)
        map.set(day, existing)
      }
    })
    return map
  }, [events, viewMonth, viewYear])

  // Get events for selected day or all events for the month
  const displayedEvents = useMemo(() => {
    if (selectedDate && selectedDate.getMonth() === viewMonth && selectedDate.getFullYear() === viewYear) {
      return events.filter(event => {
        const eventDate = new Date(event.start_datetime)
        return isSameDay(eventDate, selectedDate)
      })
    }
    // Show all events for the month sorted by start time
    return [...events].sort((a, b) => 
      new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
    )
  }, [events, selectedDate, viewMonth, viewYear])

  // Calendar grid data
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth)
    const firstDayOfMonth = getFirstDayOfMonth(viewYear, viewMonth)
    const days: Array<{ day: number; isCurrentMonth: boolean }> = []
    
    // Previous month days
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1
    const prevMonthYear = viewMonth === 0 ? viewYear - 1 : viewYear
    const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonth)
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false })
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, isCurrentMonth: true })
    }
    
    // Next month days (fill to complete 6 rows)
    const totalCells = Math.ceil(days.length / 7) * 7
    for (let i = 1; days.length < totalCells; i++) {
      days.push({ day: i, isCurrentMonth: false })
    }
    
    return days
  }, [viewYear, viewMonth])

  // Navigation handlers
  const goToPreviousMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
    setSelectedDate(null)
  }, [viewMonth, viewYear])

  const goToNextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
    setSelectedDate(null)
  }, [viewMonth, viewYear])

  const goToToday = useCallback(() => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelectedDate(today)
  }, [today])

  // Handle adding/editing event
  const handleSaveEvent = useCallback(async (data: ZZPCalendarEventCreate) => {
    if (!user?.id) return

    try {
      if (editingEvent) {
        await zzpApi.calendarEvents.update(editingEvent.id, data as ZZPCalendarEventUpdate)
        toast.success(t('zzpAgenda.eventSaved'))
      } else {
        await zzpApi.calendarEvents.create(data)
        toast.success(t('zzpAgenda.eventSaved'))
      }

      await loadEvents()

      setIsFormOpen(false)
      setEditingEvent(undefined)
    } catch (error) {
      console.error('Failed to save event:', error)
      toast.error(parseApiError(error))
    }
  }, [user?.id, editingEvent, loadEvents])

  // Handle delete event
  const handleDeleteEvent = useCallback(async () => {
    if (!user?.id || !deletingEvent) return

    try {
      await zzpApi.calendarEvents.delete(deletingEvent.id)
      toast.success(t('zzpAgenda.eventDeleted'))
      
      await loadEvents()
    } catch (error) {
      console.error('Failed to delete event:', error)
      toast.error(parseApiError(error))
    }

    setDeletingEvent(undefined)
  }, [user?.id, deletingEvent, loadEvents])

  // Open form for new event
  const openNewForm = useCallback((date?: Date) => {
    setEditingEvent(undefined)
    setIsFormOpen(true)
  }, [])

  // Open form for editing
  const openEditForm = useCallback((event: ZZPCalendarEvent) => {
    setEditingEvent(event)
    setIsFormOpen(true)
  }, [])

  // Handle day click
  const handleDayClick = useCallback((day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return
    const clickedDate = new Date(viewYear, viewMonth, day)
    setSelectedDate(prev => 
      prev && isSameDay(prev, clickedDate) ? null : clickedDate
    )
  }, [viewYear, viewMonth])

  // Title for event list section
  const eventListTitle = selectedDate && selectedDate.getMonth() === viewMonth && selectedDate.getFullYear() === viewYear
    ? `${t('zzpAgenda.eventsOnDay')} ${selectedDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}`
    : `${t('zzpAgenda.eventsInMonth')} ${MONTH_NAMES[viewMonth]}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3">
              <CalendarBlank size={28} className="text-primary sm:hidden" weight="duotone" />
              <CalendarBlank size={40} className="text-primary hidden sm:block" weight="duotone" />
              {t('zzpAgenda.title')}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t('zzpAgenda.pageDescription')}
            </p>
          </div>
          <Button onClick={() => openNewForm(selectedDate || undefined)} className="gap-2 h-10 sm:h-11 w-full sm:w-auto">
            <Plus size={18} weight="bold" />
            {t('zzpAgenda.newEvent')}
          </Button>
        </div>

        {/* Calendar View */}
        {showLoading ? (
          <CalendarLoadingSkeleton />
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm mb-6" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
            <CardContent className="p-4 sm:p-6">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-semibold capitalize">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToToday}
                    className="h-9 px-3 hidden sm:inline-flex"
                  >
                    {t('zzpAgenda.today')}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToPreviousMonth}
                    className="h-9 w-9"
                  >
                    <CaretLeft size={18} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToNextMonth}
                    className="h-9 w-9"
                  >
                    <CaretRight size={18} />
                  </Button>
                </div>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAY_NAMES.map((day) => (
                  <div
                    key={day}
                    className="h-8 flex items-center justify-center text-xs font-semibold text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((dayInfo, index) => {
                  const isToday = dayInfo.isCurrentMonth && 
                    today.getDate() === dayInfo.day && 
                    today.getMonth() === viewMonth && 
                    today.getFullYear() === viewYear
                  const isSelected = selectedDate && dayInfo.isCurrentMonth &&
                    selectedDate.getDate() === dayInfo.day &&
                    selectedDate.getMonth() === viewMonth &&
                    selectedDate.getFullYear() === viewYear
                  const eventCount = dayInfo.isCurrentMonth 
                    ? (eventsByDay.get(dayInfo.day)?.length || 0) 
                    : 0

                  return (
                    <CalendarDayCell
                      key={index}
                      day={dayInfo.day}
                      isCurrentMonth={dayInfo.isCurrentMonth}
                      isToday={isToday}
                      isSelected={!!isSelected}
                      eventCount={eventCount}
                      onClick={() => handleDayClick(dayInfo.day, dayInfo.isCurrentMonth)}
                    />
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Events List */}
        {showLoading ? (
          <EventListLoadingSkeleton />
        ) : events.length === 0 ? (
          <EmptyState onAddEvent={() => openNewForm()} />
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg capitalize">{eventListTitle}</CardTitle>
                  <CardDescription>
                    {displayedEvents.length} {displayedEvents.length === 1 ? t('zzpAgenda.eventSingular') : t('zzpAgenda.eventPlural')}
                  </CardDescription>
                </div>
                {selectedDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDate(null)}
                    className="h-8"
                  >
                    {t('zzpAgenda.showAllMonth')}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Mobile: Card list */}
              <div className="sm:hidden space-y-3">
                {displayedEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <CalendarBlank size={40} className="mb-3 opacity-50" />
                    <p className="font-medium">{t('zzpAgenda.noEventsOnDay')}</p>
                  </div>
                ) : (
                  displayedEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onEdit={() => openEditForm(event)}
                      onDelete={() => setDeletingEvent(event)}
                    />
                  ))
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden sm:block rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                      <TableHead className="font-semibold">{t('zzpAgenda.columnDateTime')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpAgenda.columnTitle')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpAgenda.columnLocation')}</TableHead>
                      <TableHead className="text-right font-semibold">{t('zzpAgenda.columnActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <CalendarBlank size={40} className="mb-3 opacity-50" />
                            <p className="font-medium">{t('zzpAgenda.noEventsOnDay')}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedEvents.map((event) => (
                        <TableRow key={event.id} className="hover:bg-secondary/30">
                          <TableCell className="font-medium whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Clock size={16} className="text-muted-foreground" />
                              <div>
                                <div>{formatDateTime(event.start_datetime)}</div>
                                <div className="text-xs text-muted-foreground">
                                  - {formatTime(event.end_datetime)}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{event.title}</div>
                            {event.notes && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {event.notes}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {event.location ? (
                              <div className="flex items-center gap-1">
                                <MapPin size={14} />
                                <span className="truncate max-w-[150px]">{event.location}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditForm(event)}
                                className="h-8 w-8"
                              >
                                <PencilSimple size={16} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletingEvent(event)}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <TrashSimple size={16} />
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

      {/* Event Form Dialog */}
      <EventFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) setEditingEvent(undefined)
        }}
        event={editingEvent}
        onSave={handleSaveEvent}
        selectedDate={selectedDate || undefined}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!deletingEvent}
        onOpenChange={(open) => {
          if (!open) setDeletingEvent(undefined)
        }}
        onConfirm={handleDeleteEvent}
        eventTitle={deletingEvent?.title || ''}
      />
    </div>
  )
}

export default ZZPAgendaPage
