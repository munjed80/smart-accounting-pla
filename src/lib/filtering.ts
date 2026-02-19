import { ZZPInvoice, ZZPTimeEntry } from '@/lib/api'

export type InvoiceStatusFilter = 'all' | ZZPInvoice['status']
export type TimeBillableFilter = 'all' | 'billable' | 'non_billable'
export type TimeInvoicedFilter = 'all' | 'invoiced' | 'not_invoiced'

export type InvoiceFilters = {
  q: string
  status: InvoiceStatusFilter
  from: string
  to: string
  min: string
  max: string
  customer_id: string
}

export type TimeEntryFilters = {
  q: string
  from: string
  to: string
  billable: TimeBillableFilter
  invoiced: TimeInvoicedFilter
  customer_id: string
  project: string
  min_minutes: string
  max_minutes: string
}

const normalizeDate = (value?: string) => (value ? value.split('T')[0] : '')
const toNumber = (value: string) => {
  if (!value) return null
  const normalized = value.replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const getDateRange = (from: string, to: string) => {
  if (!from || !to) return { from, to }
  return from <= to ? { from, to } : { from: to, to: from }
}

export const filterInvoices = (invoices: ZZPInvoice[], filters: InvoiceFilters): ZZPInvoice[] => {
  const { from, to } = getDateRange(filters.from, filters.to)
  const min = toNumber(filters.min)
  const max = toNumber(filters.max)
  const query = filters.q.trim().toLowerCase()

  return invoices.filter((invoice) => {
    if (filters.status !== 'all' && invoice.status !== filters.status) return false
    if (filters.customer_id && invoice.customer_id !== filters.customer_id) return false

    const issueDate = normalizeDate(invoice.issue_date)
    if (from && issueDate < from) return false
    if (to && issueDate > to) return false

    if (min !== null && invoice.total_cents < Math.round(min * 100)) return false
    if (max !== null && invoice.total_cents > Math.round(max * 100)) return false

    if (query) {
      const text = [
        invoice.invoice_number,
        invoice.customer_name,
        invoice.notes,
        ...invoice.lines.map((line) => `${line.description} ${line.reference || ''}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (!text.includes(query)) return false
    }

    return true
  })
}

export const filterTimeEntries = (
  entries: ZZPTimeEntry[],
  filters: TimeEntryFilters,
  customerMap: Record<string, string>,
): ZZPTimeEntry[] => {
  const { from, to } = getDateRange(filters.from, filters.to)
  const minMinutes = toNumber(filters.min_minutes)
  const maxMinutes = toNumber(filters.max_minutes)
  const query = filters.q.trim().toLowerCase()

  return entries.filter((entry) => {
    const entryDate = normalizeDate(entry.entry_date)
    if (from && entryDate < from) return false
    if (to && entryDate > to) return false

    if (filters.customer_id && entry.customer_id !== filters.customer_id) return false

    if (filters.project && !`${entry.project_name || ''}`.toLowerCase().includes(filters.project.toLowerCase())) return false

    if (filters.billable === 'billable' && !entry.billable) return false
    if (filters.billable === 'non_billable' && entry.billable) return false

    if (filters.invoiced === 'invoiced' && !entry.is_invoiced) return false
    if (filters.invoiced === 'not_invoiced' && entry.is_invoiced) return false

    const minutes = Math.round(Number(entry.hours || 0) * 60)
    if (minMinutes !== null && minutes < minMinutes) return false
    if (maxMinutes !== null && minutes > maxMinutes) return false

    if (query) {
      const text = [
        entry.description,
        entry.project_name,
        entry.customer_id ? customerMap[entry.customer_id] : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (!text.includes(query)) return false
    }

    return true
  })
}

export const getTimeEntryTotals = (entries: ZZPTimeEntry[]) => {
  const totalHours = entries.reduce((acc, entry) => acc + Number(entry.hours || 0), 0)
  const billableHours = entries
    .filter((entry) => entry.billable)
    .reduce((acc, entry) => acc + Number(entry.hours || 0), 0)

  return { totalHours, billableHours }
}
