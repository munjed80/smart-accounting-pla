/** Regression coverage for server-backed commitments and dashboard isolation. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ZZPLeaseLoansPage } from '../components/ZZPLeaseLoansPage'
import { ZZPSubscriptionsPage } from '../components/ZZPSubscriptionsPage'
import { SmartDashboard } from '../components/SmartDashboard'
import * as api from '../lib/api'
import * as AuthContext from '../lib/AuthContext'
import * as useEntitlements from '../hooks/useEntitlements'

// ── API mocks (SmartDashboard still uses these) ────────────────────────────────
vi.mock('../lib/api', () => ({
  zzpApi: {
    dashboard: {
      get: vi.fn(),
      monthlyInvoices: vi.fn().mockResolvedValue({months:[]}),
    },
    commitments: { list: vi.fn(), create: vi.fn() },
  },
  administrationApi: {
    list: vi.fn(),
  },
  getErrorMessage: vi.fn((e: Error) => e.message),
}))

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../hooks/useEntitlements', () => ({
  useEntitlements: vi.fn(),
}))

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}))

vi.mock('../lib/navigation', () => ({
  navigateTo: vi.fn(),
}))

vi.mock('../components/EmptyState', () => ({
  NoAdministrationsEmptyState: () => <div>NoAdmins</div>,
}))

vi.mock('../components/AIInsightsPanel', () => ({
  AIInsightsPanel: () => <div>AIInsights</div>,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const defaultUser = {
  id: 'u1',
  email: 'zzp@example.com',
  full_name: 'ZZP User',
  role: 'zzp',
  is_email_verified: true,
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const withQueryClient = (ui: React.ReactElement) => (
  <QueryClientProvider client={makeQueryClient()}>{ui}</QueryClientProvider>
)

// ── Tests ──────────────────────────────────────────────────────────────────────
describe.each([
  ['subscriptions', ZZPSubscriptionsPage, 'Abonnementen'],
  ['leases', ZZPLeaseLoansPage, 'Lease & leningen'],
] as const)('%s — shared server commitments', (_name, Page, title) => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(AuthContext.useAuth).mockReturnValue({ user: defaultUser } as any)
    vi.mocked(api.zzpApi.commitments.list).mockResolvedValue({ commitments: [], total: 0 })
  })
  it('loads business records from the server', async () => {
    render(withQueryClient(<Page />))
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(await screen.findByText('Nog geen verplichtingen toegevoegd.')).toBeInTheDocument()
    expect(api.zzpApi.commitments.list).toHaveBeenCalledOnce()
  })
  it('does not silently show unowned legacy financial records', async () => {
    localStorage.setItem('zzp_recurring_costs_v1', JSON.stringify([{ id:'old-1', name:'Other account private expense', amount_cents:1000 }]))
    render(withQueryClient(<Page />))
    await screen.findByText('Nog geen verplichtingen toegevoegd.')
    expect(screen.queryByText('Other account private expense')).not.toBeInTheDocument()
    expect(screen.getByText('Lokale gegevens beoordelen')).toBeInTheDocument()
  })
})

describe('SmartDashboard — no SubscriptionBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthContext.useAuth).mockReturnValue({ user: defaultUser } as any)
    vi.mocked(useEntitlements.useEntitlements).mockReturnValue({
      entitlements: {
        is_paid: false,
        in_trial: true,
        can_use_pro_features: true,
        days_left_trial: 10,
        status: 'TRIALING',
        plan_code: null,
        force_paywall: false,
      },
      subscription: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      canUseFeature: () => true,
      isAccountantBypass: false,
      forcePaywall: false,
    })
    vi.mocked(api.administrationApi.list).mockResolvedValue([])
  })

  it('does not render the Proefperiode banner on the dashboard', async () => {
    render(withQueryClient(<SmartDashboard />))

    // Wait for the dashboard to finish loading
    await waitFor(() => {
      expect(api.administrationApi.list).toHaveBeenCalled()
    })

    // The trial banner text that SubscriptionBanner would render must NOT appear
    expect(screen.queryByText(/Proefperiode actief/)).not.toBeInTheDocument()
  })
})


describe('dashboard tenant isolation and outages', () => {
  const dashboard = (title: string) => ({ invoices: {}, btw: {}, time: {}, actions: [{ id: title, title, severity: 'info', route: '/settings' }] })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthContext.useAuth).mockReturnValue({ user: defaultUser } as any)
    vi.mocked(api.administrationApi.list).mockResolvedValue([{ id: 'admin' }] as any)
    vi.mocked(api.zzpApi.dashboard.monthlyInvoices).mockResolvedValue({ months: [] } as any)
  })
  it('does not reuse another user dashboard while its cache is fresh', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60000 } } })
    vi.mocked(api.zzpApi.dashboard.get).mockResolvedValueOnce(dashboard('Private account A') as any).mockResolvedValueOnce(dashboard('Account B only') as any)
    const view = render(<QueryClientProvider client={client}><SmartDashboard /></QueryClientProvider>)
    await screen.findByText('Private account A')
    vi.mocked(AuthContext.useAuth).mockReturnValue({ user: { ...defaultUser, id: 'u2' } } as any)
    view.rerender(<QueryClientProvider client={client}><SmartDashboard /></QueryClientProvider>)
    expect(screen.queryByText('Private account A')).not.toBeInTheDocument()
    await screen.findByText('Account B only')
    expect(api.zzpApi.dashboard.get).toHaveBeenCalledTimes(2)
  })
  it('shows a dashboard outage and retries the failed request', async () => {
    vi.mocked(api.zzpApi.dashboard.get).mockRejectedValueOnce(new Error('Dashboard unavailable')).mockResolvedValueOnce(dashboard('Recovered') as any)
    render(withQueryClient(<SmartDashboard />))
    await screen.findByText('Dashboard unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    await screen.findByText('Recovered')
  })
  it('shows a monthly-summary outage instead of an empty financial summary', async () => {
    vi.mocked(api.zzpApi.dashboard.get).mockResolvedValue(dashboard('Account A') as any)
    vi.mocked(api.zzpApi.dashboard.monthlyInvoices).mockRejectedValue(new Error('Monthly summary unavailable'))
    render(withQueryClient(<SmartDashboard />))
    await screen.findByText('Monthly summary unavailable')
  })
})


it('imports local records only after selecting them and confirming ownership', async () => {
  localStorage.clear()
  vi.mocked(AuthContext.useAuth).mockReturnValue({ user: defaultUser } as any)
  vi.mocked(api.zzpApi.commitments.list).mockResolvedValue({ commitments: [], total: 0 })
  vi.mocked(api.zzpApi.commitments.create).mockResolvedValue({ id: 'imported' } as any)
  localStorage.setItem('zzp_recurring_costs_v1', JSON.stringify([{ id: 'old-1', name: 'Reviewed record', amount_cents: 1200, interval: 'quarterly', start_date: '2026-01-01' }]))
  render(withQueryClient(<ZZPSubscriptionsPage />))
  expect(screen.queryByText(/Reviewed record/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Lokale gegevens beoordelen' }))
  expect(api.zzpApi.commitments.create).not.toHaveBeenCalled()
  const checks = screen.getAllByRole('checkbox')
  fireEvent.click(checks[0])
  const button = screen.getByRole('button', { name: '1 verplichting(en) importeren' })
  expect(button).toBeDisabled()
  fireEvent.click(checks[1])
  fireEvent.click(button)
  await waitFor(() => expect(api.zzpApi.commitments.create).toHaveBeenCalledWith(expect.objectContaining({ legacy_source_key: 'recurring:old-1', recurring_frequency: 'quarterly' })))
  expect(localStorage.getItem('zzp_recurring_costs_v1')).toContain('Reviewed record')
})
