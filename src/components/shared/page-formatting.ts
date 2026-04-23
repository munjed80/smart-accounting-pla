/**
 * Shared formatting and response-normalization helpers used by the
 * ZZP Invoices and ZZP Offertes pages.
 *
 * Extracted (deduplicated) from src/components/ZZPInvoicesPage.tsx and
 * src/components/ZZPOffertesPage.tsx as part of the giant-file refactor.
 * Behavior is unchanged - the function bodies are byte-identical to the
 * originals from both files.
 */
import { ApiHttpError } from '@/lib/errors'

/** Format an integer cent amount as an EUR currency string in Dutch locale. */
export function formatAmountEUR(amountCents: number): string {
  const safeAmount = Number(amountCents)
  const normalizedAmount = Number.isFinite(safeAmount) ? safeAmount : 0
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(normalizedAmount / 100)
}

/** Format an ISO date string for display in Dutch locale, '—' for empty/invalid. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const parsedDate = new Date(isoDate)
  if (Number.isNaN(parsedDate.getTime())) return '—'

  return new Intl.DateTimeFormat('nl-NL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsedDate)
}

/**
 * Extract an HTTP status code from any error-shaped value.
 * Recognizes ApiHttpError, Axios-style {response:{status}}, and plain {statusCode}.
 */
export const getStatusCodeFromError = (error: unknown): number | null => {
  if (error instanceof ApiHttpError && error.statusCode) return error.statusCode
  if (typeof error === 'object' && error !== null) {
    const maybeStatus = (error as { statusCode?: unknown }).statusCode
    if (typeof maybeStatus === 'number') return maybeStatus
    const responseStatus = (error as { response?: { status?: unknown } }).response?.status
    if (typeof responseStatus === 'number') return responseStatus
  }
  return null
}

/**
 * Normalize any API list response shape into a typed array.
 * Handles: [], {invoices:[]}, {data:[]}, {items:[]}, null, {}, {items:null}
 */
export function normalizeListResponse<T>(response: unknown, primaryKey?: string): T[] {
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

/** Return only the YYYY-MM-DD prefix of an ISO datetime string. */
export const extractDatePart = (isoString: string | undefined): string => {
  if (!isoString) return ''
  return isoString.split('T')[0]
}

/**
 * Parse a user-entered EUR amount string (e.g. "12,50" or "12.5") into integer cents.
 * Returns null for invalid or negative input.
 */
export const parseAmountToCents = (value: string): number | null => {
  const normalized = value.replace(',', '.')
  const parsed = parseFloat(normalized)
  if (isNaN(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}
