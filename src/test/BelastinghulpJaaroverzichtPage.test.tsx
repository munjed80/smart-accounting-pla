import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BelastinghulpJaaroverzichtPage } from '../components/BelastinghulpJaaroverzichtPage'

vi.mock('../lib/api', () => ({
  zzpIncomeTaxApi: {
    getOverview: vi.fn(),
  },
  zzpBtwApi: {
    getOverview: vi.fn(),
  },
  zzpApi: {
    bank: {
      listTransactions: vi.fn(),
    },
    invoices: {
      list: vi.fn(),
    },
  },
  logApiError: vi.fn(),
}))

vi.mock('../lib/navigation', () => ({
  navigateTo: vi.fn(),
}))

import { zzpApi, zzpBtwApi, zzpIncomeTaxApi } from '../lib/api'

describe('BelastinghulpJaaroverzichtPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(zzpIncomeTaxApi.getOverview).mockResolvedValue({
      overview: {
        year: 2026,
        year_start: '2026-01-01',
        year_end: '2026-12-31',
        filing_deadline: '2027-05-01',
        omzet_cents: 500000,
        kosten_cents: 120000,
        winst_cents: 380000,
        invoice_count: 8,
        paid_invoice_count: 5,
        draft_invoice_count: 2,
        unpaid_invoice_count: 1,
        expense_count: 9,
        cost_breakdown: [],
        hours_indicator: {
          total_hours: 100,
          target_hours: 1225,
          percentage: 8,
          data_available: true,
          note: '',
        },
        warnings: [
          { id: 'W1', severity: 'warning', title: 'Conceptfacturen', description: 'x' },
        ],
        checklist: [],
        is_complete: false,
        completeness_notes: [],
        generated_at: '2026-04-01T00:00:00Z',
      },
      available_years: [2026, 2025, 2024],
      profile_complete: true,
      kvk_number: '123',
      btw_number: 'NL123',
    })

    vi.mocked(zzpBtwApi.getOverview).mockImplementation(async (year, quarter) => ({
      current_quarter: {
        quarter: `Q${quarter} ${year}`,
        quarter_start: `${year}-01-01`,
        quarter_end: `${year}-03-31`,
        deadline: `${year}-04-30`,
        days_until_deadline: 0,
        omzet_cents: 100000,
        output_vat_cents: 21000,
        input_vat_cents: 5000,
        net_vat_cents: 16000,
        vat_rate_breakdown: [],
        invoice_summary: {
          total_count: 1,
          paid_count: 1,
          sent_count: 0,
          draft_count: 0,
          total_omzet_cents: 100000,
          total_vat_cents: 21000,
        },
        expense_summary: {
          total_count: 1,
          total_amount_cents: 10000,
          total_vat_deductible_cents: 5000,
        },
        warnings: [],
        is_ready: true,
        readiness_notes: [],
        generated_at: '2026-04-01T00:00:00Z',
      },
      previous_quarters: [],
      profile_complete: true,
      btw_number: 'NL123',
    }))

    vi.mocked(zzpApi.bank.listTransactions)
      .mockResolvedValueOnce({ transactions: [], total: 12, page: 1, page_size: 1 })
      .mockResolvedValueOnce({ transactions: [], total: 3, page: 1, page_size: 1 })
      .mockResolvedValueOnce({ transactions: [], total: 2, page: 1, page_size: 1 })

    vi.mocked(zzpApi.invoices.list).mockResolvedValue({
      invoices: [
        {
          id: '1',
          administration_id: 'a',
          customer_id: 'c1',
          customer_name: 'Klant A',
          invoice_number: '2026-1',
          status: 'paid',
          issue_date: '2026-01-10',
          subtotal_cents: 200000,
          vat_total_cents: 42000,
          total_cents: 242000,
          amount_paid_cents: 242000,
          lines: [],
          created_at: '2026-01-10T00:00:00Z',
          updated_at: '2026-01-10T00:00:00Z',
        },
      ],
      total: 1,
    })
  })

  it('renders year totals and data sections', async () => {
    render(<BelastinghulpJaaroverzichtPage />)

    await waitFor(() => {
      expect(screen.getByText('Jaarcijfers')).toBeDefined()
    })

    expect(screen.getByText('Totale omzet')).toBeDefined()
    expect(screen.getByText('Kwartaal BTW snapshots')).toBeDefined()
    expect(screen.getByText('Transacties')).toBeDefined()
    expect(screen.getByText('Omzet per klant')).toBeDefined()
    expect(screen.getByText('Klant A')).toBeDefined()
  })

  it('keeps fallback warnings when VAT quarter load fails', async () => {
    vi.mocked(zzpBtwApi.getOverview).mockRejectedValueOnce(new Error('failed'))

    render(<BelastinghulpJaaroverzichtPage />)

    await waitFor(() => {
      expect(screen.getByText('Waarschuwingen voor ontbrekende data')).toBeDefined()
    })

    expect(screen.getByText(/BTW-snapshot voor Q1 kon niet worden geladen/)).toBeDefined()
  })
})
