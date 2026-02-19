/**
 * ZZP Pages Loading Fix Tests
 *
 * Tests that ZZPLeaseLoansPage and ZZPSubscriptionsPage actually trigger their
 * API calls on mount (regression for the useState(true) guard bug).
 *
 * Also verifies that SmartDashboard no longer renders SubscriptionBanner.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ZZPLeaseLoansPage } from '../components/ZZPLeaseLoansPage'
import { ZZPSubscriptionsPage } from '../components/ZZPSubscriptionsPage'
import { SmartDashboard } from '../components/SmartDashboard'
import * as api from '../lib/api'
import * as AuthContext from '../lib/AuthContext'
import * as useEntitlements from '../hooks/useEntitlements'

// ── API mocks ──────────────────────────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  zzpApi: {
    commitments: {
      list: vi.fn(),
      suggestions: vi.fn(),
    },
    expenses: {
      list: vi.fn(),
    },
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

vi.mock('../components/PaywallModal', () => ({
  PaywallModal: () => null,
}))

vi.mock('../components/CommitmentExpenseDialog', () => ({
  CommitmentExpenseDialog: () => null,
}))

vi.mock('../lib/commitments', () => ({
  createDemoCommitments: vi.fn(),
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
describe('ZZPLeaseLoansPage loading fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthContext.useAuth).mockReturnValue({ user: defaultUser } as any)
  })

  it('calls the commitments and expenses API on mount (no premature guard exit)', async () => {
    vi.mocked(api.zzpApi.commitments.list).mockResolvedValue({ commitments: [] })
    vi.mocked(api.zzpApi.expenses.list).mockResolvedValue({ expenses: [] })

    render(<ZZPLeaseLoansPage />)

    await waitFor(() => {
      // list() is called twice (once for 'lease', once for 'loan')
      expect(api.zzpApi.commitments.list).toHaveBeenCalledWith('lease')
      expect(api.zzpApi.commitments.list).toHaveBeenCalledWith('loan')
      expect(api.zzpApi.expenses.list).toHaveBeenCalled()
    })
  })
})

describe('ZZPSubscriptionsPage loading fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthContext.useAuth).mockReturnValue({ user: defaultUser } as any)
  })

  it('calls commitments, suggestions, and expenses APIs on mount', async () => {
    vi.mocked(api.zzpApi.commitments.list).mockResolvedValue({ commitments: [] })
    vi.mocked(api.zzpApi.commitments.suggestions).mockResolvedValue({ suggestions: [] })
    vi.mocked(api.zzpApi.expenses.list).mockResolvedValue({ expenses: [] })

    render(<ZZPSubscriptionsPage />)

    await waitFor(() => {
      expect(api.zzpApi.commitments.list).toHaveBeenCalledWith('subscription')
      expect(api.zzpApi.commitments.suggestions).toHaveBeenCalled()
      expect(api.zzpApi.expenses.list).toHaveBeenCalled()
    })
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
