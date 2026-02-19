/**
 * ZZP Pages Tests
 *
 * Tests for ZZPLeaseLoansPage and ZZPSubscriptionsPage after the local-first
 * rebuild.  Both pages now use localStorage exclusively — no backend API calls.
 *
 * Also verifies that SmartDashboard does not render SubscriptionBanner.
 */

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
    },
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
describe('ZZPSubscriptionsPage — local-first', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthContext.useAuth).mockReturnValue({ user: defaultUser } as any)
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders without errors and shows the "Nieuw abonnement" button', () => {
    render(<ZZPSubscriptionsPage />)
    // Multiple "Nieuw abonnement" buttons may appear (header + empty state)
    expect(screen.getAllByText('Nieuw abonnement').length).toBeGreaterThan(0)
  })

  it('shows the page title', () => {
    render(<ZZPSubscriptionsPage />)
    expect(screen.getByText(/Abonnementen & Recurring Kosten/)).toBeInTheDocument()
  })

  it('shows the empty state when no entries exist', () => {
    render(<ZZPSubscriptionsPage />)
    expect(screen.getByText(/Nog geen abonnementen/)).toBeInTheDocument()
  })

  it('does not make any network calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    render(<ZZPSubscriptionsPage />)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('persists and shows an entry after it is added via localStorage', () => {
    // Pre-populate localStorage
    const entry = {
      id: 'sub-1',
      name: 'Adobe Creative Cloud',
      amount_cents: 5999,
      interval: 'monthly',
      start_date: '2024-01-01',
      vat_rate: 21,
      auto_renew: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    localStorage.setItem('zzp_recurring_costs_v1', JSON.stringify([entry]))

    render(<ZZPSubscriptionsPage />)
    expect(screen.getByText('Adobe Creative Cloud')).toBeInTheDocument()
  })
})

describe('ZZPLeaseLoansPage — local-first', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthContext.useAuth).mockReturnValue({ user: defaultUser } as any)
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders without errors and shows the "Nieuwe lease/lening" button', () => {
    render(<ZZPLeaseLoansPage />)
    expect(screen.getByText('Nieuwe lease/lening')).toBeInTheDocument()
  })

  it('shows the page title', () => {
    render(<ZZPLeaseLoansPage />)
    // Multiple elements may contain "Lease & Leningen" text (h1 + h3 "Module")
    expect(screen.getAllByText(/Lease & Leningen/).length).toBeGreaterThan(0)
  })

  it('shows the empty state with description when no entries exist', () => {
    render(<ZZPLeaseLoansPage />)
    expect(screen.getByText(/Lease & Leningen Module/)).toBeInTheDocument()
  })

  it('does not make any network calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    render(<ZZPLeaseLoansPage />)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('persists and shows an entry after it is added via localStorage', () => {
    const entry = {
      id: 'loan-1',
      type: 'loan',
      name: 'Auto lening',
      principal_cents: 1500000,
      start_date: '2024-01-01',
      payment_interval: 'monthly',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    localStorage.setItem('zzp_leases_loans_v1', JSON.stringify([entry]))

    render(<ZZPLeaseLoansPage />)
    expect(screen.getByText('Auto lening')).toBeInTheDocument()
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
      },
      subscription: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      canUseFeature: () => true,
      isAccountantBypass: false,
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
