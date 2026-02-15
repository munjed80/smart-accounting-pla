import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ZZPAccountantLinksPage } from '@/components/ZZPAccountantLinksPage'
import { zzpApi } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  zzpApi: {
    getMandates: vi.fn(),
    getActiveLinks: vi.fn(),
    approveMandate: vi.fn(),
    rejectMandate: vi.fn(),
    revokeLink: vi.fn(),
  },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Unknown error'),
}))

vi.mock('@/hooks/useDelayedLoading', () => ({
  useDelayedLoading: vi.fn(() => false),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/i18n', () => ({
  t: (key: string) => key,
}))

describe('ZZPAccountantLinksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps pending requests visible when active links endpoint fails', async () => {
    vi.mocked(zzpApi.getMandates).mockResolvedValue({
      mandates: [
        {
          id: 'assignment-1',
          accountant_user_id: 'accountant-1',
          accountant_email: 'bookkeeper@example.com',
          accountant_name: 'Book Keeper',
          client_company_id: 'company-1',
          client_company_name: 'Test Company',
          status: 'pending',
          created_at: '2026-01-01T10:00:00Z',
          updated_at: '2026-01-01T10:00:00Z',
        },
      ],
      total_count: 1,
    })
    vi.mocked(zzpApi.getActiveLinks).mockRejectedValue(new Error('Active links unavailable'))

    render(<ZZPAccountantLinksPage />)

    await waitFor(() => {
      expect(screen.getByText('bookkeeper@example.com')).toBeInTheDocument()
    })

    expect(screen.getByText('Active links unavailable')).toBeInTheDocument()
  })
})
