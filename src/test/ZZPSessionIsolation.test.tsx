import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { authApi } from '@/lib/api'

vi.mock('@/lib/api', () => ({ authApi: { me: vi.fn(), login: vi.fn() }, getErrorMessage: (e: Error) => e.message }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })

it('clears private query data and ignores a session response after logout', async () => {
  localStorage.setItem('access_token', 'old-token')
  let resolveSession!: (data: any) => void
  vi.mocked(authApi.me).mockImplementation(() => new Promise(resolve => { resolveSession = resolve }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider> })
  client.setQueryData(['private-dashboard', 'a'], { amount: 42000 })
  act(() => result.current.logout())
  expect(client.getQueryCache().getAll()).toHaveLength(0)
  expect(localStorage.getItem('access_token')).toBeNull()
  await act(async () => { resolveSession({ id: 'a', full_name: 'Old user', role: 'zzp' }) })
  expect(result.current.user).toBeNull()
  expect(result.current.isAuthenticated).toBe(false)
  expect(result.current.isLoading).toBe(false)
})

it('removes the login token when fetching the new identity fails', async () => {
  vi.mocked(authApi.login).mockResolvedValue({ access_token: 'new-token' } as any)
  vi.mocked(authApi.me).mockRejectedValue(new Error('Identity request failed'))
  const client = new QueryClient()
  const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider> })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  await act(async () => { await expect(result.current.login({ username: 'a@example.com', password: 'password' })).rejects.toThrow('Identity request failed') })
  expect(localStorage.getItem('access_token')).toBeNull()
  expect(result.current.user).toBeNull()
})
