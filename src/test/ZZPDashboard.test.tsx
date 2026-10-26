import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SmartDashboard } from '@/components/SmartDashboard'
import { zzpApi, administrationApi } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'
import {
  dashboardUser,
  dashboardAdministration,
  dashboardSummary,
  dashboardMonths,
  dashboardReceipts,
} from '../../tests/fixtures/dashboard'

vi.mock('@/lib/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/lib/api', () => ({
  administrationApi: { list: vi.fn() },
  zzpApi: {
    dashboard: { get: vi.fn(), monthlyInvoices: vi.fn(), receipts: vi.fn() },
  },
  getErrorMessage: (e: Error) => e.message,
}))
vi.mock('@/i18n', () => ({ t: (key: string) => key }))
const mount = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <SmartDashboard />
      </QueryClientProvider>,
    ),
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ user: dashboardUser } as any)
  vi.mocked(administrationApi.list).mockResolvedValue([
    dashboardAdministration,
  ] as any)
  vi.mocked(zzpApi.dashboard.get).mockResolvedValue(
    structuredClone(dashboardSummary) as any,
  )
  vi.mocked(zzpApi.dashboard.monthlyInvoices).mockResolvedValue(
    structuredClone(dashboardMonths),
  )
  vi.mocked(zzpApi.dashboard.receipts).mockResolvedValue(dashboardReceipts)
})

describe('ZZP overview financial contracts', () => {
  it('provides four real creation destinations and remaining-balance invoice filters', async () => {
    mount()
    await screen.findByText('1 factuur te laat')
    const quick = screen.getByRole('navigation', { name: 'Snel aan de slag' })
    expect(
      within(quick)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/zzp/invoices?action=new',
      '/zzp/expenses?action=new',
      '/zzp/documents?action=upload',
      '/zzp/time?action=new',
    ])
    expect(
      screen.getByRole('link', { name: /Nog te ontvangen/ }),
    ).toHaveAttribute('href', '/zzp/invoices?status=open')
    expect(
      screen.getByRole('link', { name: /Daarvan te laat/ }),
    ).toHaveAttribute('href', '/zzp/invoices?status=overdue')
  })
  it('opens the receipt source for the exact month and preserves invoice drilldown links', async () => {
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: /Ontvangen deze maand/ }),
    )
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Deelbetaling oktober')
    expect(zzpApi.dashboard.receipts).toHaveBeenCalledWith(2026, 10, 20, 0)
    expect(
      within(dialog).getByRole('link', { name: '2026-0042' }),
    ).toHaveAttribute('href', '/zzp/invoices/i1')
  })
  it('uses one signed VAT estimate and exposes a refund', async () => {
    vi.mocked(zzpApi.dashboard.get).mockResolvedValue({
      ...dashboardSummary,
      btw: { ...dashboardSummary.btw, net_vat_cents: -5000 },
    } as any)
    mount()
    await screen.findByText('Terug te vragen')
    expect(
      screen.getAllByRole('heading', { name: 'Je btw-overzicht' }),
    ).toHaveLength(1)
    expect(screen.queryByText('Te reserveren voor btw')).not.toBeInTheDocument()
  })
  it('retains figures on a background refresh failure and labels them as previously retrieved', async () => {
    const { client } = mount()
    await screen.findByText('1 factuur te laat')
    vi.mocked(zzpApi.dashboard.get).mockRejectedValue(new Error('Disconnected'))
    await client.invalidateQueries({ queryKey: ['zzp-dashboard'] })
    await screen.findByText('Disconnected')
    expect(
      screen.getByRole('button', { name: /Ontvangen deze maand/ }),
    ).toHaveTextContent('5.929,00')
    expect(
      screen.getByText(/Je ziet de laatst opgehaalde bedragen/),
    ).toBeInTheDocument()
  })
  it('does not present unavailable receipt data as zero or hide unaffected sections', async () => {
    vi.mocked(zzpApi.dashboard.monthlyInvoices).mockResolvedValue({
      ...dashboardMonths,
      months: [{ ...dashboardMonths.months[0], received_total: undefined }],
    })
    mount()
    await screen.findByText(
      'Ontvangsten per maand zijn niet beschikbaar. Probeer het opnieuw.',
    )
    expect(
      screen.getByRole('button', { name: /Ontvangen deze maand/ }),
    ).toHaveTextContent('5.929,00')
    expect(
      screen.queryByText('Nog geen maandoverzicht beschikbaar.'),
    ).not.toBeInTheDocument()
  })
  it('deduplicates queue entries by identity and orders errors before informational tasks', async () => {
    vi.mocked(zzpApi.dashboard.get).mockResolvedValue({
      ...dashboardSummary,
      actions: [...dashboardSummary.actions]
        .reverse()
        .concat(dashboardSummary.actions[0]),
    } as any)
    mount()
    await screen.findByText('1 factuur te laat')
    const tasks = screen.getByRole('region', { name: 'Dit vraagt aandacht' })
    expect(within(tasks).getAllByRole('listitem')).toHaveLength(4)
    expect(within(tasks).getAllByRole('listitem')[0]).toHaveTextContent(
      '1 factuur te laat',
    )
  })
  it('rejects a mismatched administration response', async () => {
    vi.mocked(zzpApi.dashboard.get).mockResolvedValue({
      ...dashboardSummary,
      administration_id: 'other',
    } as any)
    mount()
    await screen.findByText(
      'Je administratie is gewijzigd. Vernieuw de pagina.',
    )
    expect(screen.queryByText('1 factuur te laat')).not.toBeInTheDocument()
  })
  it('does not request ZZP data for an accountant', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...dashboardUser, role: 'accountant' },
    } as any)
    mount()
    await screen.findByRole('link', { name: /Naar je overzicht/ })
    expect(administrationApi.list).not.toHaveBeenCalled()
    expect(zzpApi.dashboard.get).not.toHaveBeenCalled()
  })
  it('does not show fictitious zeros while figures are loading', async () => {
    vi.mocked(zzpApi.dashboard.get).mockReturnValue(new Promise(() => {}))
    mount()
    await screen.findByRole('status', { name: 'Financieel overzicht laden' })
    expect(
      screen.queryByRole('button', { name: /Ontvangen deze maand/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Je bent bij.')).not.toBeInTheDocument()
    await waitFor(() => expect(zzpApi.dashboard.get).toHaveBeenCalledOnce())
  })
})
