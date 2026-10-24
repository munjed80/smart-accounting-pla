import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActiveClientProvider, useActiveClient } from '@/lib/ActiveClientContext'
import { accountantApi } from '@/lib/api'

vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'staff', role: 'super_admin' }, isAuthenticated: true }) }))
vi.mock('@/lib/api', () => ({ accountantApi: { getClientLinks: vi.fn() } }))
const Probe = () => {
  const { activeClientId, isLoading } = useActiveClient()
  return <span>{isLoading ? 'Loading' : activeClientId ?? 'No client'}</span>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

it('validates the exact administration when the same owner has several companies', async () => {
  localStorage.setItem('activeClient', JSON.stringify({ id: 'owner', name: 'Company B', administrationId: 'b' }))
  vi.mocked(accountantApi.getClientLinks).mockResolvedValue({
    links: [{ client_user_id: 'owner', administration_id: 'a', status: 'PENDING' },
      { client_user_id: 'owner', administration_id: 'b', status: 'ACTIVE' }],
  } as any)
  render(<ActiveClientProvider><Probe /></ActiveClientProvider>)
  expect(await screen.findByText('b')).toBeInTheDocument()
  expect(accountantApi.getClientLinks).toHaveBeenCalledOnce()
  expect(localStorage.getItem('selectedClientId')).toBe('b')
})
