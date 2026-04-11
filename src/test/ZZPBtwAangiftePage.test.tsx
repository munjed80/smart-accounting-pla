/**
 * ZZPBtwAangiftePage Tests
 *
 * Tests the BTW Aangifte self-service page rendering and data display.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ZZPBtwAangiftePage } from '../components/ZZPBtwAangiftePage'

// Mock the API module
vi.mock('../lib/api', () => ({
  zzpBtwApi: {
    getOverview: vi.fn(),
  },
  logApiError: vi.fn(),
}))

// Mock navigation
vi.mock('../lib/navigation', () => ({
  navigateTo: vi.fn(),
}))

import { zzpBtwApi } from '../lib/api'

const mockOverviewResponse = {
  current_quarter: {
    quarter: 'Q2 2026',
    quarter_start: '2026-04-01',
    quarter_end: '2026-06-30',
    deadline: '2026-07-31',
    days_until_deadline: 30,
    omzet_cents: 500000,
    output_vat_cents: 105000,
    input_vat_cents: 21000,
    net_vat_cents: 84000,
    vat_rate_breakdown: [
      { vat_rate: '21.00', omzet_cents: 500000, vat_cents: 105000, transaction_count: 5 },
    ],
    invoice_summary: {
      total_count: 7,
      paid_count: 5,
      sent_count: 1,
      draft_count: 1,
      total_omzet_cents: 500000,
      total_vat_cents: 105000,
    },
    expense_summary: {
      total_count: 10,
      total_amount_cents: 100000,
      total_vat_deductible_cents: 21000,
    },
    warnings: [
      {
        id: 'W001',
        severity: 'info' as const,
        title: '1 conceptfactuur niet meegeteld',
        description: 'Conceptfacturen worden niet meegenomen.',
        action_hint: 'Ga naar Facturen.',
        related_route: '/zzp/invoices?status=draft',
      },
    ],
    is_ready: true,
    readiness_notes: ['Je gegevens zien er compleet uit voor deze periode.'],
    generated_at: '2026-04-08T12:00:00Z',
  },
  previous_quarters: [
    {
      quarter: 'Q1 2026',
      quarter_start: '2026-01-01',
      quarter_end: '2026-03-31',
      deadline: '2026-04-30',
      days_until_deadline: 0,
      omzet_cents: 300000,
      output_vat_cents: 63000,
      input_vat_cents: 15000,
      net_vat_cents: 48000,
      vat_rate_breakdown: [],
      invoice_summary: {
        total_count: 3,
        paid_count: 3,
        sent_count: 0,
        draft_count: 0,
        total_omzet_cents: 300000,
        total_vat_cents: 63000,
      },
      expense_summary: {
        total_count: 5,
        total_amount_cents: 50000,
        total_vat_deductible_cents: 15000,
      },
      warnings: [],
      is_ready: true,
      readiness_notes: [],
      generated_at: '2026-04-08T12:00:00Z',
    },
  ],
  profile_complete: true,
  btw_number: 'NL123456789B01',
}

describe('ZZPBtwAangiftePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page title and subtitle', async () => {
    vi.mocked(zzpBtwApi.getOverview).mockResolvedValue(mockOverviewResponse)

    render(<ZZPBtwAangiftePage />)

    expect(screen.getByText('BTW Overzicht')).toBeDefined()
    expect(screen.getByText(/Bereid je kwartaalaangifte voor/)).toBeDefined()
  })

  it('displays loading skeleton initially', () => {
    vi.mocked(zzpBtwApi.getOverview).mockReturnValue(new Promise(() => {})) // never resolves

    render(<ZZPBtwAangiftePage />)

    // Should show skeleton elements
    const page = screen.getByTestId('zzp-btw-aangifte-page')
    expect(page).toBeDefined()
  })

  it('displays key financial figures after loading', async () => {
    vi.mocked(zzpBtwApi.getOverview).mockResolvedValue(mockOverviewResponse)

    render(<ZZPBtwAangiftePage />)

    await waitFor(() => {
      // Check for omzet label
      expect(screen.getByText('Omzet (ex. BTW)')).toBeDefined()
    })

    // Check output VAT label
    expect(screen.getByText('Af te dragen BTW')).toBeDefined()

    // Check input VAT label
    expect(screen.getByText('Voorbelasting (aftrekbaar)')).toBeDefined()
  })

  it('displays BTW number when available', async () => {
    vi.mocked(zzpBtwApi.getOverview).mockResolvedValue(mockOverviewResponse)

    render(<ZZPBtwAangiftePage />)

    await waitFor(() => {
      expect(screen.getByText(/NL123456789B01/)).toBeDefined()
    })
  })

  it('displays warnings when present', async () => {
    vi.mocked(zzpBtwApi.getOverview).mockResolvedValue(mockOverviewResponse)

    render(<ZZPBtwAangiftePage />)

    await waitFor(() => {
      expect(screen.getByText('1 conceptfactuur niet meegeteld')).toBeDefined()
    })
  })

  it('shows ready-to-submit card when ready', async () => {
    vi.mocked(zzpBtwApi.getOverview).mockResolvedValue(mockOverviewResponse)

    render(<ZZPBtwAangiftePage />)

    await waitFor(() => {
      expect(screen.getByText('Klaar om in te dienen')).toBeDefined()
    })
  })

  it('shows error state when API fails', async () => {
    vi.mocked(zzpBtwApi.getOverview).mockRejectedValue(new Error('Network error'))

    render(<ZZPBtwAangiftePage />)

    await waitFor(() => {
      expect(screen.getByText(/Er is een fout opgetreden/)).toBeDefined()
    })
  })

  it('shows profile incomplete banner when profile is not complete', async () => {
    const incompleteProfile = {
      ...mockOverviewResponse,
      profile_complete: false,
      btw_number: null,
    }
    vi.mocked(zzpBtwApi.getOverview).mockResolvedValue(incompleteProfile)

    render(<ZZPBtwAangiftePage />)

    await waitFor(() => {
      expect(screen.getByText('Bedrijfsprofiel incompleet')).toBeDefined()
    })
  })
})
