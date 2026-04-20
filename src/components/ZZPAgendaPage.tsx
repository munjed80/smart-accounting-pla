/**
 * ZZP Agenda Page
 *
 * Full CRUD functionality for managing calendar events.
 *
 * Premium UI with:
 * - Month AND week calendar views (toggle)
 * - Search/filter with debounce
 * - Event duration badges
 * - Recurring events (none/daily/weekly/monthly)
 * - Color/category labels
 * - Double-click to create event on desktop
 * - Duplicate events
 * - Hover tooltip preview on calendar cells
 * - ICS/iCal export
 * - Keyboard navigation (arrows, Enter, N, Escape)
 * - Event count summary card
 * - Loading/skeleton states
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  MagnifyingGlass,
  Copy,
  DownloadSimple,
  ArrowsCounterClockwise,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthContext'
import { zzpApi, ZZPCalendarEvent, ZZPCalendarEventCreate, ZZPCalendarEventUpdate } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { NetworkError } from '@/lib/errors'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

// --- Constants ---

const WEEKDAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

const WEEK_START_HOUR = 7
const WEEK_END_HOUR = 22
const WEEK_HOURS = Array.from({ length: WEEK_END_HOUR - WEEK_START_HOUR + 1 }, (_, i) => WEEK_START_HOUR + i)

const EVENT_COLORS: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  blue:   { bg: 'bg-blue-100 dark:bg-blue-900/30',   border: 'border-l-blue-500',   dot: 'bg-blue-500',   label: 'Blauw' },
  green:  { bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-l-green-500',  dot: 'bg-green-500',  label: 'Groen' },
  red:    { bg: 'bg-red-100 dark:bg-red-900/30',     border: 'border-l-red-500',    dot: 'bg-red-500',    label: 'Rood' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-l-orange-500', dot: 'bg-orange-500', label: 'Oranje' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-l-purple-500', dot: 'bg-purple-500', label: 'Paars' },
  pink:   { bg: 'bg-pink-100 dark:bg-pink-900/30',   border: 'border-l-pink-500',   dot: 'bg-pink-500',   label: 'Roze' },
}

// --- Helper Functions ---

const formatDateTime = (isoString: string): string => {
  if (!isoString) return '-'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const formatTime = (isoString: string): string => {
  if (!isoString) return '-'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const formatDateForInput = (date: Date): string => {
  if (!date || isNaN(date.getTime())) return new Date().toISOString().split('T')[0]
  return date.toISOString().split('T')[0]
}

const formatTimeForInput = (date: Date): string => {
  if (!date || isNaN(date.getTime())) return '09:00'
  return date.toTimeString().slice(0, 5)
}

const toISOString = (dateStr: string, timeStr: string): string => {
  return `${dateStr}T${timeStr}:00`
}

const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month + 1, 0).getDate()
}

const getFirstDayOfMonth = (year: number, month: number): number => {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

const isSameDay = (d1: Date, d2: Date): boolean => {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
}

const getWeekStart = (date: Date): Date => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const formatDuration = (startIso: string, endIso: string): string => {
  if (!startIso || !endIso) return '-'
  const endMs = new Date(endIso).getTime()
  const startMs = new Date(startIso).getTime()
  if (isNaN(startMs) || isNaN(endMs)) return '-'
  const ms = endMs - startMs
  if (ms <= 0) return '0m'
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}u`
  return `${hours}u ${minutes}m`
}

const generateICS = (events: ZZPCalendarEvent[], label: string): string => {
  const escape = (s: string) => (s || '').replace(/[\\;,]/g, c => `\\${c}`).replace(/\n/g, '\\n')
  const toICSDate = (iso: string) => {
    if (!iso) return '19700101T000000Z'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '19700101T000000Z'
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ZZP Boekhouden//Agenda//NL',
    `X-WR-CALNAME:${escape(label)}`,
    'CALSCALE:GREGORIAN',
  ]
  const safeEvents = Array.isArray(events) ? events : []
  safeEvents.forEach(ev => {
    if (!ev?.title || !ev?.start_datetime || !ev?.end_datetime) return
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@zzp-boekhouden`,
      `DTSTART:${toICSDate(ev.start_datetime)}`,
      `DTEND:${toICSDate(ev.end_datetime)}`,
      `SUMMARY:${escape(ev.title)}`,
      ev.location ? `LOCATION:${escape(ev.location)}` : '',
      ev.notes ? `DESCRIPTION:${escape(ev.notes)}` : '',
      'END:VEVENT',
    )
  })
  lines.push('END:VCALENDAR')
  return lines.filter(Boolean).join('\r\n')
}

const getDotClass = (color: string | null | undefined): string => {
  if (!color || !EVENT_COLORS[color]) return 'bg-primary'
  return EVENT_COLORS[color].dot
}

// --- Sub-Components ---

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

const ColorPicker = ({
  value,
  onChange,
}: {
  value: string | null | undefined
  onChange: (color: string | null) => void
}) => (
  <div className="flex items-center gap-2 flex-wrap">
    <button
      type="button"
      onClick={() => onChange(null)}
      className={`h-7 w-7 rounded-full border-2 bg-primary transition-all ${!value ? 'border-foreground scale-110' : 'border-transparent'}`}
      title="Standaard"
    />
    {Object.entries(EVENT_COLORS).map(([key, val]) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        className={`h-7 w-7 rounded-full border-2 ${val.dot} transition-all ${value === key ? 'border-foreground scale-110' : 'border-transparent'}`}
        title={val.label}
      />
    ))}
  </div>
)

const EventFormDialog = ({
  open,
  onOpenChange,
  event,
  onSave,
  selectedDate,
  isDuplicate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  event?: ZZPCalendarEvent
  onSave: (data: ZZPCalendarEventCreate) => Promise<void>
  selectedDate?: Date
  isDuplicate?: boolean
}) => {
  const isEdit = !!event && !isDuplicate

  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [recurrence, setRecurrence] = useState<string>('none')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [titleError, setTitleError] = useState('')
  const [startError, setStartError] = useState('')
  const [endError, setEndError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      if (event) {
        const start = event.start_datetime ? new Date(event.start_datetime) : new Date()
        const end = event.end_datetime ? new Date(event.end_datetime) : new Date()
        setTitle(event.title || '')
        setStartDate(formatDateForInput(start))
        setStartTime(formatTimeForInput(start))
        setEndDate(formatDateForInput(end))
        setEndTime(formatTimeForInput(end))
        setLocation(event.location || '')
        setNotes(event.notes || '')
        setRecurrence(event.recurrence || 'none')
        setRecurrenceEndDate(event.recurrence_end_date || '')
        setColor(event.color || null)
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
        setRecurrence('none')
        setRecurrenceEndDate('')
        setColor(null)
      }
      setTitleError('')
      setStartError('')
      setEndError('')
      setIsSubmitting(false)
    }
  }, [open, event, selectedDate])

  const handleSave = async () => {
    let hasError = false
    if (!title.trim()) { setTitleError(t('zzpAgenda.formTitleRequired')); hasError = true }
    if (!startDate || !startTime) { setStartError(t('zzpAgenda.formStartRequired')); hasError = true }
    if (!endDate || !endTime) { setEndError(t('zzpAgenda.formEndRequired')); hasError = true }
    if (startDate && startTime && endDate && endTime) {
      const s = new Date(toISOString(startDate, startTime))
      const e = new Date(toISOString(endDate, endTime))
      if (e <= s) { setEndError(t('zzpAgenda.formEndAfterStart')); hasError = true }
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
        recurrence: recurrence === 'none' ? null : recurrence,
        recurrence_end_date: (recurrence !== 'none' && recurrenceEndDate) ? recurrenceEndDate : null,
        color: color || null,
      })
    } catch (error) {
      // Error is already handled by the parent onSave handler (handleSaveEvent).
      // Catch here to prevent unhandled promise rejection from crashing the page.
      console.error('[EventFormDialog] Save failed:', error)
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
            {isEdit ? t('zzpAgenda.editEventDescription') : t('zzpAgenda.newEventDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-title" className="text-sm font-medium">
              {t('zzpAgenda.formTitle')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event-title"
              placeholder={t('zzpAgenda.formTitlePlaceholder')}
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleError('') }}
              className={`h-11 ${titleError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              disabled={isSubmitting}
              autoFocus
            />
            {titleError && <p className="text-sm text-destructive flex items-center gap-1"><XCircle size={14} />{titleError}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('zzpAgenda.formStart')} <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setStartError(''); if (!endDate || e.target.value > endDate) setEndDate(e.target.value) }} className={`h-11 ${startError ? 'border-destructive' : ''}`} disabled={isSubmitting} />
              <Input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setStartError('') }} className={`h-11 ${startError ? 'border-destructive' : ''}`} disabled={isSubmitting} />
            </div>
            {startError && <p className="text-sm text-destructive flex items-center gap-1"><XCircle size={14} />{startError}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('zzpAgenda.formEnd')} <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setEndError('') }} className={`h-11 ${endError ? 'border-destructive' : ''}`} disabled={isSubmitting} />
              <Input type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); setEndError('') }} className={`h-11 ${endError ? 'border-destructive' : ''}`} disabled={isSubmitting} />
            </div>
            {endError && <p className="text-sm text-destructive flex items-center gap-1"><XCircle size={14} />{endError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-location" className="text-sm font-medium">
              {t('zzpAgenda.formLocation')}
              <span className="text-xs text-muted-foreground font-normal ml-1">({t('zzpAgenda.helperOptional')})</span>
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input id="event-location" placeholder={t('zzpAgenda.formLocationPlaceholder')} value={location} onChange={(e) => setLocation(e.target.value)} className="h-11 pl-10" disabled={isSubmitting} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-notes" className="text-sm font-medium">
              {t('zzpAgenda.formNotes')}
              <span className="text-xs text-muted-foreground font-normal ml-1">({t('zzpAgenda.helperOptional')})</span>
            </Label>
            <Textarea id="event-notes" placeholder={t('zzpAgenda.formNotesPlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[80px] resize-none" disabled={isSubmitting} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('zzpAgenda.formRecurrence')}</Label>
            <Select value={recurrence} onValueChange={setRecurrence} disabled={isSubmitting}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('zzpAgenda.formRecurrenceNone')}</SelectItem>
                <SelectItem value="daily">{t('zzpAgenda.formRecurrenceDaily')}</SelectItem>
                <SelectItem value="weekly">{t('zzpAgenda.formRecurrenceWeekly')}</SelectItem>
                <SelectItem value="monthly">{t('zzpAgenda.formRecurrenceMonthly')}</SelectItem>
              </SelectContent>
            </Select>
            {recurrence !== 'none' && (
              <div className="space-y-1 pt-1">
                <Label className="text-xs text-muted-foreground">
                  {t('zzpAgenda.formRecurrenceEndDate')} <span className="ml-1">({t('zzpAgenda.helperOptional')})</span>
                </Label>
                <Input type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} className="h-10" disabled={isSubmitting} />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('zzpAgenda.formColor')}</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
        <DialogFooter className="pt-4 border-t border-border/50 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="h-11">{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={isSubmitting || !isFormValid} className="h-11 min-w-[140px]">
            {isSubmitting ? (<><SpinnerGap size={18} className="mr-2 animate-spin" />{t('common.saving')}</>) : (<><CheckCircle size={18} className="mr-2" weight="fill" />{t('zzpAgenda.saveEvent')}</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('zzpAgenda.deleteEvent')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('zzpAgenda.deleteEventConfirm')}<br />
          <span className="font-medium">{eventTitle}</span><br /><br />
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

const EmptyState = ({ onAddEvent }: { onAddEvent: () => void }) => (
  <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
    <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <CalendarBlank size={40} weight="duotone" className="text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('zzpAgenda.noEvents')}</h3>
      <p className="text-muted-foreground mb-8 max-w-md">{t('zzpAgenda.noEventsDescription')}</p>
      <Button onClick={onAddEvent} size="lg" className="gap-2 h-12 px-6">
        <Plus size={20} weight="bold" />
        {t('zzpAgenda.addFirstEvent')}
      </Button>
    </CardContent>
  </Card>
)

const EventCard = ({
  event,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  event: ZZPCalendarEvent
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
}) => {
  if (!event) return null
  const colorKey = event.color
  const colorStyle = colorKey && EVENT_COLORS[colorKey]
  return (
    <Card className={`bg-card/80 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-colors ${colorStyle ? `border-l-4 ${colorStyle.border}` : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <CalendarBlank size={20} className="text-primary" weight="duotone" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold truncate">{event.title || '-'}</h4>
                {event.recurrence && event.recurrence !== 'none' && (
                  <ArrowsCounterClockwise size={14} className="text-muted-foreground flex-shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={12} />
                  <span>{formatDateTime(event.start_datetime)} - {formatTime(event.end_datetime)}</span>
                </div>
                <Badge variant="secondary" className="text-xs h-5 px-1.5">
                  {formatDuration(event.start_datetime, event.end_datetime)}
                </Badge>
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
          <Button variant="ghost" size="sm" onClick={onDuplicate} className="h-9 px-3 gap-2" title={t('zzpAgenda.duplicateEvent')}>
            <Copy size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-9 px-3 gap-2">
            <PencilSimple size={16} />
            {t('common.edit')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="h-9 px-3 gap-2 text-destructive hover:text-destructive">
            <TrashSimple size={16} />
            {t('common.delete')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

const CalendarDayCell = ({
  day,
  isCurrentMonth,
  isToday,
  isSelected,
  events,
  onClick,
  onDoubleClick,
}: {
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  events: ZZPCalendarEvent[]
  onClick: () => void
  onDoubleClick: () => void
}) => {
  const safeEvents = Array.isArray(events) ? events : []
  const eventCount = safeEvents.length
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={[
          'relative h-12 sm:h-16 w-full p-1 sm:p-2 text-center border border-border/30 rounded-md transition-all',
          'hover:bg-primary/5 hover:border-primary/30',
          !isCurrentMonth ? 'text-muted-foreground/50 bg-secondary/20' : 'bg-card/50',
          isToday ? 'ring-2 ring-primary/50 bg-primary/5' : '',
          isSelected ? 'bg-primary/10 border-primary/50' : '',
        ].join(' ')}
      >
        <span className={`text-xs sm:text-sm font-medium ${isToday ? 'text-primary font-bold' : ''}`}>{day}</span>
        {eventCount > 0 && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
            {eventCount <= 3 ? (
              safeEvents.map((ev, i) => (
                <div key={i} className={`h-1.5 w-1.5 rounded-full ${getDotClass(ev.color)}`} />
              ))
            ) : (
              <>
                <div className={`h-1.5 w-1.5 rounded-full ${getDotClass(safeEvents[0]?.color)}`} />
                <div className={`h-1.5 w-1.5 rounded-full ${getDotClass(safeEvents[1]?.color)}`} />
                <span className="text-[10px] text-primary font-medium">+{eventCount - 2}</span>
              </>
            )}
          </div>
        )}
      </button>
      {eventCount > 0 && (
        <div className="hidden sm:block absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-popover border border-border shadow-md rounded-md p-2 min-w-[140px] max-w-[200px] text-xs">
            {safeEvents.slice(0, 3).map((ev, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5">
                <div className={`h-2 w-2 rounded-full flex-shrink-0 ${getDotClass(ev.color)}`} />
                <span className="truncate font-medium">{ev.title || '-'}</span>
              </div>
            ))}
            {eventCount > 3 && <div className="text-muted-foreground mt-1">+{eventCount - 3} meer</div>}
          </div>
        </div>
      )}
    </div>
  )
}

const WeekView = ({
  weekStart,
  events,
  today,
  selectedDate,
  onDayClick,
  onDoubleClick,
}: {
  weekStart: Date
  events: ZZPCalendarEvent[]
  today: Date
  selectedDate: Date | null
  onDayClick: (date: Date) => void
  onDoubleClick: (date: Date) => void
}) => {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
  const safeEvents = Array.isArray(events) ? events : []
  const eventsByDay = days.map(day => safeEvents.filter(ev => ev?.start_datetime && isSameDay(new Date(ev.start_datetime), day)))
  const hourHeight = 48

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-8 border-b border-border/50">
        <div className="w-14" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today)
          const isSelected = !!(selectedDate && isSameDay(day, selectedDate))
          return (
            <div key={i} onClick={() => onDayClick(day)} className={`text-center py-2 cursor-pointer transition-colors hover:bg-primary/5 ${isToday ? 'text-primary font-bold' : ''} ${isSelected ? 'bg-primary/10' : ''}`}>
              <div className="text-xs text-muted-foreground">{['Ma','Di','Wo','Do','Vr','Za','Zo'][i]}</div>
              <div className={`text-sm font-semibold ${isToday ? 'h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto' : ''}`}>{day.getDate()}</div>
            </div>
          )
        })}
      </div>
      <div className="relative grid grid-cols-8 overflow-y-auto max-h-[500px]">
        <div className="w-14">
          {WEEK_HOURS.map(hour => (
            <div key={hour} className="text-right pr-2 text-xs text-muted-foreground flex items-start justify-end" style={{ height: hourHeight }}>
              <span className="mt-0.5">{String(hour).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>
        {days.map((day, dayIdx) => {
          const dayEvents = eventsByDay[dayIdx]
          const isToday = isSameDay(day, today)
          return (
            <div key={dayIdx} className={`relative border-l border-border/30 cursor-pointer ${isToday ? 'bg-primary/5' : ''}`} style={{ minHeight: hourHeight * WEEK_HOURS.length }} onDoubleClick={() => onDoubleClick(day)}>
              {WEEK_HOURS.map(hour => (
                <div key={hour} className="absolute left-0 right-0 border-t border-border/20" style={{ top: (hour - WEEK_START_HOUR) * hourHeight }} />
              ))}
              {dayEvents.map((ev, evIdx) => {
                if (!ev?.start_datetime || !ev?.end_datetime) return null
                const start = new Date(ev.start_datetime)
                const end = new Date(ev.end_datetime)
                if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
                const startHour = start.getHours() + start.getMinutes() / 60
                const endHour = end.getHours() + end.getMinutes() / 60
                const clampedStart = Math.max(startHour, WEEK_START_HOUR)
                const clampedEnd = Math.min(endHour, WEEK_END_HOUR + 1)
                const top = (clampedStart - WEEK_START_HOUR) * hourHeight
                const height = Math.max((clampedEnd - clampedStart) * hourHeight, 20)
                const colorKey = ev.color
                const colorStyle = colorKey && EVENT_COLORS[colorKey]
                return (
                  <div key={evIdx} className={`absolute left-0.5 right-0.5 rounded text-xs p-1 overflow-hidden border-l-2 ${colorStyle ? `${colorStyle.bg} ${colorStyle.border}` : 'bg-primary/20 border-l-primary'}`} style={{ top, height }} title={ev.title}>
                    <div className="font-medium truncate">{ev.title}</div>
                    <div className="text-muted-foreground">{formatTime(ev.start_datetime)}</div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const MobileWeekView = ({
  weekStart,
  events,
  today,
  selectedDate,
  onDayClick,
  onCreateEvent,
}: {
  weekStart: Date
  events: ZZPCalendarEvent[]
  today: Date
  selectedDate: Date | null
  onDayClick: (date: Date) => void
  onCreateEvent: (date: Date) => void
}) => {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
  const safeEvents = Array.isArray(events) ? events : []
  const activeDay = selectedDate || today
  const dayEvents = safeEvents
    .filter(ev => ev?.start_datetime && isSameDay(new Date(ev.start_datetime), activeDay))
    .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime())

  return (
    <div>
      {/* Horizontal day strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-hide">
        {days.map((day, i) => {
          const dayIsToday = isSameDay(day, today)
          const isActive = isSameDay(day, activeDay)
          const dayEventCount = safeEvents.filter(ev => ev?.start_datetime && isSameDay(new Date(ev.start_datetime), day)).length
          return (
            <button
              key={i}
              onClick={() => onDayClick(day)}
              className={[
                'flex flex-col items-center flex-shrink-0 rounded-xl px-3 py-2 min-w-[52px] transition-all',
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-secondary',
                dayIsToday && !isActive ? 'ring-2 ring-primary/40' : '',
              ].join(' ')}
            >
              <span className="text-[10px] font-medium uppercase opacity-70">
                {WEEKDAY_NAMES[i]}
              </span>
              <span className={`text-lg font-bold leading-tight ${isActive ? '' : dayIsToday ? 'text-primary' : ''}`}>
                {day.getDate()}
              </span>
              {dayEventCount > 0 && (
                <div className={`h-1.5 w-1.5 rounded-full mt-0.5 ${isActive ? 'bg-primary-foreground' : 'bg-primary'}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Events list for selected day */}
      <div className="mt-3 space-y-2">
        {dayEvents.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <CalendarBlank size={32} className="mb-2 opacity-50" weight="duotone" />
            <p className="text-sm font-medium">{t('zzpAgenda.noEventsOnDay')}</p>
            <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => onCreateEvent(activeDay)}>
              <Plus size={16} />
              {t('zzpAgenda.newEvent')}
            </Button>
          </div>
        ) : (
          dayEvents.map((ev) => {
            const colorKey = ev.color
            const colorStyle = colorKey && EVENT_COLORS[colorKey]
            return (
              <div
                key={`${ev.id}-${ev.start_datetime}`}
                className={`flex items-center gap-3 rounded-lg border p-3 ${colorStyle ? `border-l-4 ${colorStyle.border} ${colorStyle.bg}` : 'bg-card/50 border-border/50'}`}
              >
                <div className="flex-shrink-0 text-center min-w-[44px]">
                  <div className="text-sm font-bold">{formatTime(ev.start_datetime)}</div>
                  <div className="text-[10px] text-muted-foreground">{formatTime(ev.end_datetime)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate flex items-center gap-1.5">
                    {ev.title}
                    {ev.recurrence && ev.recurrence !== 'none' && (
                      <ArrowsCounterClockwise size={12} className="text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                  {ev.location && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin size={10} />
                      <span className="truncate">{ev.location}</span>
                    </div>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                  {formatDuration(ev.start_datetime, ev.end_datetime)}
                </Badge>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// --- Main Page Component ---

export const ZZPAgendaPage = () => {
  const { user } = useAuth()
  const [events, setEvents] = useState<ZZPCalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const showLoading = useDelayedLoading(isLoading, 300, Array.isArray(events) && events.length > 0)

  const [viewMode, setViewMode] = useState<'month' | 'week'>(() => {
    try { return (localStorage.getItem('zzpAgendaViewMode') as 'month' | 'week') || 'month' } catch { return 'month' }
  })

  const [today, setToday] = useState(() => new Date())

  // Refresh "today" when the user returns to the tab (e.g., after midnight)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = new Date()
        setToday(prev => isSameDay(prev, now) ? prev : now)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const [searchRaw, setSearchRaw] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = useCallback((val: string) => {
    setSearchRaw(val)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setSearchQuery(val), 300)
  }, [])

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ZZPCalendarEvent | undefined>()
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [deletingEvent, setDeletingEvent] = useState<ZZPCalendarEvent | undefined>()
  const [formInitialDate, setFormInitialDate] = useState<Date | undefined>()

  useEffect(() => {
    try { localStorage.setItem('zzpAgendaViewMode', viewMode) } catch { /* localStorage may be unavailable */ }
  }, [viewMode])

  const loadEvents = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      let response
      if (viewMode === 'week') {
        const fromDate = formatDateForInput(weekStart)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        const toDate = formatDateForInput(weekEnd)
        response = await zzpApi.calendarEvents.list({ from_date: fromDate, to_date: toDate })
      } else {
        response = await zzpApi.calendarEvents.list({ year: viewYear, month: viewMonth + 1 })
      }
      setEvents(Array.isArray(response.events) ? response.events : [])
    } catch (error) {
      console.error('Failed to load events:', error)
      if (!(error instanceof NetworkError)) {
        toast.error(parseApiError(error))
      }
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, viewYear, viewMonth, viewMode, weekStart])

  useEffect(() => { loadEvents() }, [loadEvents])

  const eventsByDay = useMemo(() => {
    const map = new Map<number, ZZPCalendarEvent[]>()
    if (!Array.isArray(events)) return map
    events.forEach(event => {
      if (!event?.start_datetime) return
      const eventDate = new Date(event.start_datetime)
      if (isNaN(eventDate.getTime())) return
      if (eventDate.getMonth() === viewMonth && eventDate.getFullYear() === viewYear) {
        const day = eventDate.getDate()
        const existing = map.get(day) || []
        existing.push(event)
        map.set(day, existing)
      }
    })
    return map
  }, [events, viewMonth, viewYear])

  const displayedEvents = useMemo(() => {
    const safeEvents = Array.isArray(events) ? events : []
    let base: ZZPCalendarEvent[]
    if (selectedDate && selectedDate.getMonth() === viewMonth && selectedDate.getFullYear() === viewYear) {
      base = safeEvents.filter(event => event?.start_datetime && isSameDay(new Date(event.start_datetime), selectedDate))
    } else {
      base = [...safeEvents].sort((a, b) => {
        const aTime = a?.start_datetime ? new Date(a.start_datetime).getTime() : 0
        const bTime = b?.start_datetime ? new Date(b.start_datetime).getTime() : 0
        return aTime - bTime
      })
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      base = base.filter(ev =>
        (ev?.title || '').toLowerCase().includes(q) ||
        (ev?.location || '').toLowerCase().includes(q) ||
        (ev?.notes || '').toLowerCase().includes(q)
      )
    }
    return base
  }, [events, selectedDate, viewMonth, viewYear, searchQuery])

  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth)
    const firstDayOfMonth = getFirstDayOfMonth(viewYear, viewMonth)
    const days: Array<{ day: number; isCurrentMonth: boolean }> = []
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1
    const prevMonthYear = viewMonth === 0 ? viewYear - 1 : viewYear
    const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonth)
    for (let i = firstDayOfMonth - 1; i >= 0; i--) days.push({ day: daysInPrevMonth - i, isCurrentMonth: false })
    for (let i = 1; i <= daysInMonth; i++) days.push({ day: i, isCurrentMonth: true })
    const totalCells = Math.ceil(days.length / 7) * 7
    for (let i = 1; days.length < totalCells; i++) days.push({ day: i, isCurrentMonth: false })
    return days
  }, [viewYear, viewMonth])

  const summaryStats = useMemo(() => {
    const safeEvents = Array.isArray(events) ? events : []
    const now = new Date()
    const thisMonthEvents = safeEvents.filter(ev => {
      if (!ev?.start_datetime) return false
      const d = new Date(ev.start_datetime)
      return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const weekS = getWeekStart(now)
    const weekE = new Date(weekS); weekE.setDate(weekS.getDate() + 6)
    const thisWeekEvents = safeEvents.filter(ev => {
      if (!ev?.start_datetime) return false
      const d = new Date(ev.start_datetime)
      return !isNaN(d.getTime()) && d >= weekS && d <= weekE
    })
    const futureEvents = safeEvents.filter(ev => {
      if (!ev?.start_datetime) return false
      const d = new Date(ev.start_datetime)
      return !isNaN(d.getTime()) && d >= now
    }).sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime())
    const nextEvent = futureEvents[0] || null
    const nextEventDays = nextEvent ? Math.max(0, Math.floor((new Date(nextEvent.start_datetime).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null
    return { thisMonthCount: thisMonthEvents.length, thisWeekCount: thisWeekEvents.length, nextEvent, nextEventDays }
  }, [events])

  const goToPrev = useCallback(() => {
    if (viewMode === 'week') {
      const prev = new Date(weekStart); prev.setDate(weekStart.getDate() - 7); setWeekStart(prev); setSelectedDate(null)
    } else {
      if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) } else { setViewMonth(viewMonth - 1) }
      setSelectedDate(null)
    }
  }, [viewMode, viewMonth, viewYear, weekStart])

  const goToNext = useCallback(() => {
    if (viewMode === 'week') {
      const next = new Date(weekStart); next.setDate(weekStart.getDate() + 7); setWeekStart(next); setSelectedDate(null)
    } else {
      if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) } else { setViewMonth(viewMonth + 1) }
      setSelectedDate(null)
    }
  }, [viewMode, viewMonth, viewYear, weekStart])

  const goToToday = useCallback(() => {
    setViewYear(today.getFullYear()); setViewMonth(today.getMonth())
    setWeekStart(getWeekStart(today)); setSelectedDate(today)
  }, [today])

  const handleSaveEvent = useCallback(async (data: ZZPCalendarEventCreate) => {
    if (!user?.id) return
    try {
      if (editingEvent && !isDuplicating) {
        await zzpApi.calendarEvents.update(editingEvent.id, data as ZZPCalendarEventUpdate)
      } else {
        await zzpApi.calendarEvents.create(data)
      }
      toast.success(isDuplicating ? t('zzpAgenda.eventDuplicated') : t('zzpAgenda.eventSaved'))
      // Close dialog and reset form state BEFORE reloading events,
      // so the dialog doesn't stay open during the data fetch.
      setIsFormOpen(false)
      setEditingEvent(undefined)
      setIsDuplicating(false)
      // Reload events in the background — errors are handled within loadEvents.
      await loadEvents()
    } catch (error) {
      console.error('Failed to save event:', error)
      // Skip duplicate toast for network errors — the offline banner already covers those.
      if (!(error instanceof NetworkError)) {
        toast.error(parseApiError(error))
      }
    }
  }, [user?.id, editingEvent, isDuplicating, loadEvents])

  const handleDeleteEvent = useCallback(async () => {
    if (!user?.id || !deletingEvent) return
    try {
      await zzpApi.calendarEvents.delete(deletingEvent.id)
      toast.success(t('zzpAgenda.eventDeleted'))
      setDeletingEvent(undefined)
      await loadEvents()
    } catch (error) {
      console.error('Failed to delete event:', error)
      if (!(error instanceof NetworkError)) {
        toast.error(parseApiError(error))
      }
      setDeletingEvent(undefined)
    }
  }, [user?.id, deletingEvent, loadEvents])

  const openNewForm = useCallback((date?: Date) => {
    setEditingEvent(undefined)
    setIsDuplicating(false)
    setFormInitialDate(date)
    setIsFormOpen(true)
  }, [])

  const openEditForm = useCallback((event: ZZPCalendarEvent) => {
    setEditingEvent(event)
    setIsDuplicating(false)
    setFormInitialDate(undefined)
    setIsFormOpen(true)
  }, [])

  const duplicateEvent = useCallback((event: ZZPCalendarEvent) => {
    if (!event?.start_datetime || !event?.end_datetime) return
    const start = new Date(event.start_datetime); start.setDate(start.getDate() + 7)
    const end = new Date(event.end_datetime); end.setDate(end.getDate() + 7)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return
    // Create a copy with shifted dates; treat as a new event (isDuplicating=true)
    const copy: ZZPCalendarEvent = { ...event, start_datetime: start.toISOString(), end_datetime: end.toISOString() }
    setEditingEvent(copy)
    setIsDuplicating(true)
    setFormInitialDate(undefined)
    setIsFormOpen(true)
  }, [])

  const handleDayClick = useCallback((day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return
    const clickedDate = new Date(viewYear, viewMonth, day)
    setSelectedDate(prev => prev && isSameDay(prev, clickedDate) ? null : clickedDate)
  }, [viewYear, viewMonth])

  const handleDayDoubleClick = useCallback((day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return
    openNewForm(new Date(viewYear, viewMonth, day))
  }, [viewYear, viewMonth, openNewForm])

  const handleExportICS = useCallback(() => {
    const label = viewMode === 'week'
      ? `Agenda week ${weekStart.toLocaleDateString('nl-NL')}`
      : `Agenda ${MONTH_NAMES[viewMonth]} ${viewYear}`
    const ics = generateICS(events, label)
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = viewMode === 'week'
      ? `agenda-week-${formatDateForInput(weekStart)}.ics`
      : `agenda-${MONTH_NAMES[viewMonth]}-${viewYear}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }, [events, viewMode, viewMonth, viewYear, weekStart])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFormOpen || deletingEvent) return
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault(); openNewForm(selectedDate || undefined)
      } else if (e.key === 'Escape') {
        setSelectedDate(null)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (selectedDate) { const p = new Date(selectedDate); p.setDate(p.getDate() - 1); setSelectedDate(p); setViewYear(p.getFullYear()); setViewMonth(p.getMonth()) } else goToPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (selectedDate) { const n = new Date(selectedDate); n.setDate(n.getDate() + 1); setSelectedDate(n); setViewYear(n.getFullYear()); setViewMonth(n.getMonth()) } else goToNext()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (selectedDate) { const p = new Date(selectedDate); p.setDate(p.getDate() - 7); setSelectedDate(p); setViewYear(p.getFullYear()); setViewMonth(p.getMonth()) }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (selectedDate) { const n = new Date(selectedDate); n.setDate(n.getDate() + 7); setSelectedDate(n); setViewYear(n.getFullYear()); setViewMonth(n.getMonth()) }
      } else if (e.key === 'Enter') {
        if (selectedDate) openNewForm(selectedDate)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFormOpen, deletingEvent, selectedDate, openNewForm, goToPrev, goToNext])

  const eventListTitle = useMemo(() => {
    if (viewMode === 'week') {
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
      return `${t('zzpAgenda.eventsInWeek')} ${weekStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} \u2013 ${weekEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`
    }
    if (selectedDate && selectedDate.getMonth() === viewMonth && selectedDate.getFullYear() === viewYear) {
      return `${t('zzpAgenda.eventsOnDay')} ${selectedDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}`
    }
    return `${t('zzpAgenda.eventsInMonth')} ${MONTH_NAMES[viewMonth]}`
  }, [viewMode, weekStart, selectedDate, viewMonth, viewYear])

  const navLabel = useMemo(() => {
    if (viewMode === 'week') {
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
      return `${weekStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} \u2013 ${weekEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return `${MONTH_NAMES[viewMonth]} ${viewYear}`
  }, [viewMode, weekStart, viewMonth, viewYear])

  const formSelectedDate = isDuplicating && editingEvent
    ? new Date(editingEvent.start_datetime)
    : (formInitialDate || selectedDate || undefined)

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
            <p className="text-sm sm:text-base text-muted-foreground">{t('zzpAgenda.pageDescription')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleExportICS} className="gap-2 h-10">
              <DownloadSimple size={16} />
              <span className="hidden sm:inline">{t('zzpAgenda.exportIcs')}</span>
            </Button>
            <Button onClick={() => openNewForm(selectedDate || undefined)} className="gap-2 h-10 sm:h-11 flex-1 sm:flex-none">
              <Plus size={18} weight="bold" />
              {t('zzpAgenda.newEvent')}
            </Button>
          </div>
        </div>

        {/* Summary Card */}
        {!showLoading && Array.isArray(events) && events.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardContent className="p-3 sm:p-4">
                <div className="text-2xl font-bold text-primary">{summaryStats.thisMonthCount}</div>
                <div className="text-xs text-muted-foreground">{t('zzpAgenda.summaryThisMonth')} {MONTH_NAMES[today.getMonth()]}</div>
              </CardContent>
            </Card>
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardContent className="p-3 sm:p-4">
                <div className="text-2xl font-bold text-primary">{summaryStats.thisWeekCount}</div>
                <div className="text-xs text-muted-foreground">{t('zzpAgenda.summaryThisWeek')}</div>
              </CardContent>
            </Card>
            {summaryStats.nextEvent && (
              <Card className="bg-card/80 backdrop-blur-sm col-span-2 sm:col-span-1">
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs text-muted-foreground mb-1">{t('zzpAgenda.summaryNextEvent')}</div>
                  <div className="font-semibold truncate text-sm">{summaryStats.nextEvent.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {summaryStats.nextEventDays === 0
                      ? t('zzpAgenda.summaryNextEventToday')
                      : `${t('zzpAgenda.summaryNextEventIn')} ${summaryStats.nextEventDays} ${t('zzpAgenda.summaryNextEventDays')}`}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Calendar View */}
        {showLoading ? <CalendarLoadingSkeleton /> : (
          <Card className="bg-card/80 backdrop-blur-sm mb-6" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
            <CardContent className="p-4 sm:p-6">
              {/* Navigation — mobile: stacked, touch-friendly */}
              <div className="flex flex-col gap-3 mb-4 sm:hidden">
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="icon" onClick={goToPrev} className="h-10 w-10"><CaretLeft size={20} /></Button>
                  <h2 className="text-lg font-semibold capitalize text-center flex-1 px-2">{navLabel}</h2>
                  <Button variant="outline" size="icon" onClick={goToNext} className="h-10 w-10"><CaretRight size={20} /></Button>
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={goToToday} className="h-9 px-3">
                    {t('zzpAgenda.today')}
                  </Button>
                  <div className="flex rounded-md border border-border overflow-hidden">
                    <button onClick={() => setViewMode('month')} className={`px-3 h-9 text-sm transition-colors ${viewMode === 'month' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
                      {t('zzpAgenda.viewMonth')}
                    </button>
                    <button onClick={() => setViewMode('week')} className={`px-3 h-9 text-sm transition-colors border-l border-border ${viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
                      {t('zzpAgenda.viewWeek')}
                    </button>
                  </div>
                </div>
              </div>
              {/* Navigation — desktop: single row */}
              <div className="hidden sm:flex items-center justify-between mb-4 gap-2">
                <h2 className="text-xl font-semibold capitalize">{navLabel}</h2>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={goToToday} className="h-9 px-3">
                    {t('zzpAgenda.today')}
                  </Button>
                  <div className="flex rounded-md border border-border overflow-hidden">
                    <button onClick={() => setViewMode('month')} className={`px-3 h-9 text-sm transition-colors ${viewMode === 'month' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
                      {t('zzpAgenda.viewMonth')}
                    </button>
                    <button onClick={() => setViewMode('week')} className={`px-3 h-9 text-sm transition-colors border-l border-border ${viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
                      {t('zzpAgenda.viewWeek')}
                    </button>
                  </div>
                  <Button variant="outline" size="icon" onClick={goToPrev} className="h-9 w-9"><CaretLeft size={18} /></Button>
                  <Button variant="outline" size="icon" onClick={goToNext} className="h-9 w-9"><CaretRight size={18} /></Button>
                </div>
              </div>

              {viewMode === 'week' ? (
                <>
                  {/* Desktop: full timeline grid */}
                  <div className="hidden sm:block">
                    <WeekView weekStart={weekStart} events={events} today={today} selectedDate={selectedDate}
                      onDayClick={(date) => setSelectedDate(prev => prev && isSameDay(prev, date) ? null : date)}
                      onDoubleClick={(date) => openNewForm(date)}
                    />
                  </div>
                  {/* Mobile: day strip + event list */}
                  <div className="sm:hidden">
                    <MobileWeekView weekStart={weekStart} events={events} today={today} selectedDate={selectedDate}
                      onDayClick={(date) => setSelectedDate(prev => prev && isSameDay(prev, date) ? null : date)}
                      onCreateEvent={(date) => openNewForm(date)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {WEEKDAY_NAMES.map((day) => (
                      <div key={day} className="h-8 flex items-center justify-center text-xs font-semibold text-muted-foreground">{day}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((dayInfo, index) => {
                      const isToday = dayInfo.isCurrentMonth && today.getDate() === dayInfo.day && today.getMonth() === viewMonth && today.getFullYear() === viewYear
                      const isSelected = !!(selectedDate && dayInfo.isCurrentMonth && selectedDate.getDate() === dayInfo.day && selectedDate.getMonth() === viewMonth && selectedDate.getFullYear() === viewYear)
                      const dayEvents = dayInfo.isCurrentMonth ? (eventsByDay.get(dayInfo.day) || []) : []
                      return (
                        <CalendarDayCell key={index} day={dayInfo.day} isCurrentMonth={dayInfo.isCurrentMonth}
                          isToday={isToday} isSelected={isSelected} events={dayEvents}
                          onClick={() => handleDayClick(dayInfo.day, dayInfo.isCurrentMonth)}
                          onDoubleClick={() => handleDayDoubleClick(dayInfo.day, dayInfo.isCurrentMonth)}
                        />
                      )
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Events List */}
        {showLoading ? <EventListLoadingSkeleton /> : !Array.isArray(events) || events.length === 0 ? (
          <EmptyState onAddEvent={() => openNewForm()} />
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg capitalize">{eventListTitle}</CardTitle>
                  <CardDescription>{displayedEvents.length} {displayedEvents.length === 1 ? t('zzpAgenda.eventSingular') : t('zzpAgenda.eventPlural')}</CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setViewMode('month'); setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDate(today) }}>{t('zzpAgenda.today')}</Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setViewMode('week'); setWeekStart(getWeekStart(today)); setSelectedDate(null) }}>{t('zzpAgenda.thisWeek')}</Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setViewMode('month'); setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDate(null) }}>{t('zzpAgenda.thisMonth')}</Button>
                  {selectedDate && <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)} className="h-8">{t('zzpAgenda.showAllMonth')}</Button>}
                </div>
              </div>
              <div className="relative mt-2">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input placeholder={t('zzpAgenda.searchPlaceholder')} value={searchRaw} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9 h-9" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="sm:hidden space-y-3">
                {displayedEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <CalendarBlank size={40} className="mb-3 opacity-50" />
                    <p className="font-medium">{searchQuery ? t('zzpAgenda.noSearchResults') : t('zzpAgenda.noEventsOnDay')}</p>
                  </div>
                ) : (
                  displayedEvents.map((event) => (
                    <EventCard key={`${event.id}-${event.start_datetime}`} event={event}
                      onEdit={() => openEditForm(event)}
                      onDelete={() => setDeletingEvent(event)}
                      onDuplicate={() => duplicateEvent(event)}
                    />
                  ))
                )}
              </div>
              <div className="hidden sm:block rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                      <TableHead className="font-semibold">{t('zzpAgenda.columnDateTime')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpAgenda.columnDuration')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpAgenda.columnTitle')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpAgenda.columnLocation')}</TableHead>
                      <TableHead className="text-right font-semibold">{t('zzpAgenda.columnActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <CalendarBlank size={40} className="mb-3 opacity-50" />
                            <p className="font-medium">{searchQuery ? t('zzpAgenda.noSearchResults') : t('zzpAgenda.noEventsOnDay')}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedEvents.map((event) => {
                        const colorKey = event.color
                        const colorStyle = colorKey && EVENT_COLORS[colorKey]
                        return (
                          <TableRow key={`${event.id}-${event.start_datetime}`} className={`hover:bg-secondary/30 ${colorStyle ? `border-l-2 ${colorStyle.border}` : ''}`}>
                            <TableCell className="font-medium whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <Clock size={16} className="text-muted-foreground" />
                                <div>
                                  <div>{formatDateTime(event.start_datetime)}</div>
                                  <div className="text-xs text-muted-foreground">- {formatTime(event.end_datetime)}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {formatDuration(event.start_datetime, event.end_datetime)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 font-medium">
                                {event.recurrence && event.recurrence !== 'none' && <ArrowsCounterClockwise size={14} className="text-muted-foreground flex-shrink-0" />}
                                {event.title}
                              </div>
                              {event.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{event.notes}</p>}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {event.location ? (
                                <div className="flex items-center gap-1"><MapPin size={14} /><span className="truncate max-w-[150px]">{event.location}</span></div>
                              ) : <span className="text-muted-foreground/50">-</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => duplicateEvent(event)} className="h-8 w-8" title={t('zzpAgenda.duplicateEvent')}><Copy size={16} /></Button>
                                <Button variant="ghost" size="icon" onClick={() => openEditForm(event)} className="h-8 w-8"><PencilSimple size={16} /></Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeletingEvent(event)} className="h-8 w-8 text-destructive hover:text-destructive"><TrashSimple size={16} /></Button>
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

      <EventFormDialog
        open={isFormOpen}
        onOpenChange={(open) => { setIsFormOpen(open); if (!open) { setEditingEvent(undefined); setIsDuplicating(false); setFormInitialDate(undefined) } }}
        event={editingEvent}
        onSave={handleSaveEvent}
        selectedDate={formSelectedDate}
        isDuplicate={isDuplicating}
      />

      <DeleteConfirmDialog
        open={!!deletingEvent}
        onOpenChange={(open) => { if (!open) setDeletingEvent(undefined) }}
        onConfirm={handleDeleteEvent}
        eventTitle={deletingEvent?.title || ''}
      />
    </div>
  )
}

export default ZZPAgendaPage
