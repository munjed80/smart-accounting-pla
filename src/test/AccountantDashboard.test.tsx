import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AccountantHomePage } from '@/components/AccountantHomePage'
import { api } from '@/lib/api'

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'accountant', role: 'accountant' } }) }))
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
  getErrorMessage: (e: unknown) => e instanceof Error ? e.message : 'Error',
}))
vi.mock('@/components/DagstartPanel', () => ({ DagstartPanel: () => null }))
vi.mock('@/components/PriorityClientsPanel', () => ({ PriorityClientsPanel: () => null }))
vi.mock('@/components/RecentActionsPanel', () => ({ RecentActionsPanel: () => null }))
vi.mock('@/components/PlatformModulesCard', () => ({ PlatformModulesCard: () => null }))
vi.mock('@/components/WorkQueueSection', () => ({ WorkQueueSection: () => null }))
vi.mock('@/components/BulkOperationModal', () => ({ BulkOperationModal: () => null }))

const card = (id: string) => ({ id, name: `Client ${id}`, readiness_score: 100,
  red_issue_count: 0, yellow_issue_count: 0, documents_needing_review_count: 0,
  days_to_vat_deadline: null, last_activity_at: null })

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(api.get).mockImplementation(async (url, config) => {
    if (url === '/accountant/dashboard/summary') return { data: { total_clients: 30, alerts_by_severity: {} } } as any
    const offset = (config?.params as { offset?: number })?.offset ?? 0
    return { data: { clients: [card(offset ? 'second-page' : 'first-page')], total_count: 30,
      filtered_count: 30, priority_clients: [], portfolio_counts: {} } } as any
  })
})

describe('accountant dashboard data loading', () => {
  it('requests bounded server pages and changes the requested offset', async () => {
    render(<AccountantHomePage />)
    await screen.findByText('Client first-page')
    expect(api.get).toHaveBeenCalledWith('/accountant/dashboard/clients', expect.objectContaining({ params: expect.objectContaining({ limit: 25, offset: 0 }) }))
    fireEvent.click(screen.getByRole('button', { name: /Volgende/i }))
    await waitFor(() => expect(within(screen.getByRole('table')).getByText('Client second-page')).toBeInTheDocument())
    expect(api.get).toHaveBeenCalledWith('/accountant/dashboard/clients', expect.objectContaining({ params: expect.objectContaining({ limit: 25, offset: 25 }) }))
  })

  it('loads the client list even when the summary fails', async () => {
    vi.mocked(api.get).mockImplementation(async url => {
      if (url === '/accountant/dashboard/summary') throw new Error('Summary unavailable')
      return { data: { clients: [card('visible')], total_count: 1, filtered_count: 1, priority_clients: [], portfolio_counts: {} } } as any
    })
    render(<AccountantHomePage />)
    expect(await screen.findByText('Client visible')).toBeInTheDocument()
    expect(screen.getByText('Summary unavailable')).toBeInTheDocument()
  })
})
