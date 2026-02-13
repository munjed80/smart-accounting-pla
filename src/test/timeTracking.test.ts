import { describe, expect, it } from 'vitest'
import { getInvoicePeriodRange, hoursToMinutes, minutesToHours, totalMinutesForEntries } from '@/lib/timeTracking'

describe('timeTracking helpers', () => {
  it('returns ISO week Monday-Sunday for weekly mode', () => {
    const range = getInvoicePeriodRange('weekly', new Date('2026-02-12T14:30:00'))
    expect(range).toEqual({ start: '2026-02-09', end: '2026-02-15' })
  })

  it('does not force period values for custom mode', () => {
    expect(getInvoicePeriodRange('custom', new Date('2026-02-12T14:30:00'))).toBeNull()
  })

  it('calculates totals using minutes to avoid rounding mismatch', () => {
    const entries = [
      { hours: '1.33' },
      { hours: '1.33' },
      { hours: '1.34' },
    ] as any

    const minutes = totalMinutesForEntries(entries)
    expect(minutes).toBe(hoursToMinutes('1.33') + hoursToMinutes('1.33') + hoursToMinutes('1.34'))
    expect(minutesToHours(minutes).toFixed(2)).toBe('4.00')
  })
})
