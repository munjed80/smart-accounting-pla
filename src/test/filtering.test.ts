import { describe, expect, it } from 'vitest'
import { filterInvoices, filterTimeEntries, getTimeEntryTotals } from '@/lib/filtering'

describe('invoice filtering', () => {
  it('filters by status, date range and search query', () => {
    const invoices: any[] = [
      { id: '1', status: 'paid', issue_date: '2026-01-05', customer_id: 'c1', invoice_number: 'INV-1', customer_name: 'Acme', total_cents: 10000, notes: 'consulting', lines: [{ description: 'January', reference: 'R1' }] },
      { id: '2', status: 'draft', issue_date: '2026-01-20', customer_id: 'c2', invoice_number: 'INV-2', customer_name: 'Beta', total_cents: 20000, notes: 'support', lines: [{ description: 'February', reference: 'R2' }] },
    ]

    const result = filterInvoices(invoices, {
      q: 'acme',
      status: 'paid',
      from: '2026-01-01',
      to: '2026-01-31',
      min: '',
      max: '',
      customer_id: '',
    })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })
})

describe('time filtering and totals', () => {
  it('filters by date and billable and calculates totals', () => {
    const entries: any[] = [
      { id: '1', entry_date: '2026-02-01', description: 'Design', hours: 2, billable: true, is_invoiced: false, customer_id: 'c1', project_name: 'Website' },
      { id: '2', entry_date: '2026-02-03', description: 'Admin', hours: 1, billable: false, is_invoiced: false, customer_id: 'c1', project_name: 'Backoffice' },
    ]

    const result = filterTimeEntries(entries, {
      q: '',
      from: '2026-02-01',
      to: '2026-02-02',
      billable: 'billable',
      invoiced: 'all',
      customer_id: '',
      project: '',
      min_minutes: '',
      max_minutes: '',
    }, { c1: 'Acme' })

    expect(result).toHaveLength(1)
    const totals = getTimeEntryTotals(result as any)
    expect(totals.totalHours).toBe(2)
    expect(totals.billableHours).toBe(2)
  })
})
