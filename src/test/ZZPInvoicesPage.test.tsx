import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ZZPInvoicesPage } from '../components/ZZPInvoicesPage'
import * as api from '../lib/api'
import * as AuthContext from '../lib/AuthContext'

vi.mock('../lib/api', () => ({
  zzpApi: {
    invoices: { list: vi.fn() },
    customers: { list: vi.fn() },
    profile: { get: vi.fn() },
  },
  getApiBaseUrl: vi.fn(() => 'https://api.example.com/api/v1'),
}))

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../hooks/useDebounce', () => ({
  useDebounce: (v: string) => v,
}))

vi.mock('../hooks/useDelayedLoading', () => ({
  useDelayedLoading: (loading: boolean) => loading,
}))

vi.mock('../hooks/useQueryFilters', () => ({
  useQueryFilters: () => ({
    filters: { q: '', status: 'all', from: '', to: '', min: '', max: '', customer_id: '' },
    setFilter: vi.fn(),
    reset: vi.fn(),
  }),
}))

vi.mock('../lib/filtering', () => ({
  filterInvoices: (items: unknown[]) => items,
}))

vi.mock('../lib/navigation', () => ({ navigateTo: vi.fn() }))

vi.mock('../i18n', () => ({ t: (key: string) => key }))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

describe('ZZPInvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: { id: 'u1', role: 'zzp' },
    } as any)
    vi.mocked(api.zzpApi.customers.list).mockResolvedValue({ customers: [] } as any)
    vi.mocked(api.zzpApi.profile.get).mockResolvedValue(null as any)
  })

  it('renders empty state when API returns []', async () => {
    vi.mocked(api.zzpApi.invoices.list).mockResolvedValue([] as any)

    render(<ZZPInvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText('zzpInvoices.noInvoices')).toBeInTheDocument()
    })
  })

  it('shows inline error when API returns 500', async () => {
    const err = new Error('Server exploded') as Error & { statusCode: number }
    err.statusCode = 500
    vi.mocked(api.zzpApi.invoices.list).mockRejectedValue(err)

    render(<ZZPInvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText('Serverfout')).toBeInTheDocument()
      expect(screen.getByText('Opnieuw proberen')).toBeInTheDocument()
    })
  })

  it('renders empty state safely when API returns null', async () => {
    vi.mocked(api.zzpApi.invoices.list).mockResolvedValue(null as any)

    render(<ZZPInvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText('zzpInvoices.noInvoices')).toBeInTheDocument()
    })
  })

  it('renders empty state safely when API returns {}', async () => {
    vi.mocked(api.zzpApi.invoices.list).mockResolvedValue({} as any)

    render(<ZZPInvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText('zzpInvoices.noInvoices')).toBeInTheDocument()
    })
  })

  it('renders empty state safely when API returns {items: null}', async () => {
    vi.mocked(api.zzpApi.invoices.list).mockResolvedValue({ items: null } as any)

    render(<ZZPInvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText('zzpInvoices.noInvoices')).toBeInTheDocument()
    })
  })

  it('normalizes {data: []} API response correctly', async () => {
    vi.mocked(api.zzpApi.invoices.list).mockResolvedValue({ data: [] } as any)

    render(<ZZPInvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText('zzpInvoices.noInvoices')).toBeInTheDocument()
    })
  })

  it('normalizes {items: []} API response correctly', async () => {
    vi.mocked(api.zzpApi.invoices.list).mockResolvedValue({ items: [] } as any)

    render(<ZZPInvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText('zzpInvoices.noInvoices')).toBeInTheDocument()
    })
  })
})
