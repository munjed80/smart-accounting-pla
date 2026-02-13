import { ZZPTimeEntry } from '@/lib/api'

export type InvoicePeriodMode = 'daily' | 'weekly' | 'monthly' | 'custom'

export const toLocalISODate = (value: Date): string => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const startOfDay = (value: Date): Date => {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

const addDays = (value: Date, days: number): Date => {
  const d = new Date(value)
  d.setDate(d.getDate() + days)
  return d
}

const getMonday = (value: Date): Date => {
  const d = startOfDay(value)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d
}

export const getInvoicePeriodRange = (
  mode: InvoicePeriodMode,
  now: Date = new Date(),
): { start: string; end: string } | null => {
  const localNow = startOfDay(now)

  if (mode === 'custom') return null

  if (mode === 'daily') {
    const day = toLocalISODate(localNow)
    return { start: day, end: day }
  }

  if (mode === 'weekly') {
    const monday = getMonday(localNow)
    const sunday = addDays(monday, 6)
    return {
      start: toLocalISODate(monday),
      end: toLocalISODate(sunday),
    }
  }

  const monthStart = new Date(localNow.getFullYear(), localNow.getMonth(), 1)
  const monthEnd = new Date(localNow.getFullYear(), localNow.getMonth() + 1, 0)
  return {
    start: toLocalISODate(monthStart),
    end: toLocalISODate(monthEnd),
  }
}

export const hoursToMinutes = (hoursValue: number | string | null | undefined): number => {
  return Math.round(Number(hoursValue || 0) * 60)
}

export const totalMinutesForEntries = (entries: ZZPTimeEntry[]): number => {
  return entries.reduce((sum, entry) => sum + hoursToMinutes(entry.hours), 0)
}

export const minutesToHours = (minutes: number): number => minutes / 60

export const formatDurationHHMMSS = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}
