import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VATSubmissionHistory } from '@/components/VATSubmissionHistory'
import { vatApi } from '@/lib/api'
vi.mock('@/lib/api', () => ({ vatApi: { listSubmissions: vi.fn(), markSubmitted: vi.fn() }, getErrorMessage: (error: Error) => error.message }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const row = (id: string, status: string) => ({ id, status, created_at: '2026-10-26T10:00:00Z', submission_type: 'BTW', method: 'DIGIPOORT' })
it('allows older submission pages and renders Digipoort states without crashing', async () => {
  vi.mocked(vatApi.listSubmissions)
    .mockResolvedValueOnce({ submissions: [row('first', 'QUEUED')], total_count: 21 } as any)
    .mockResolvedValueOnce({ submissions: [row('second', 'ACCEPTED')], total_count: 21 } as any)
  render(<VATSubmissionHistory clientId="client-a" />)
  expect(await screen.findByText('In wachtrij')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Volgende pagina' }))
  expect(await screen.findByText('Geaccepteerd')).toBeVisible()
  expect(vatApi.listSubmissions).toHaveBeenLastCalledWith('client-a', undefined, 2, 20)
  expect(screen.getByRole('button', { name: 'Volgende pagina' })).toBeDisabled()
})
it('ignores responses from a previous client', async () => {
  let resolveOld: (value: any) => void = () => undefined
  vi.mocked(vatApi.listSubmissions)
    .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    .mockResolvedValueOnce({ submissions: [row('new', 'RECEIVED')], total_count: 1 } as any)
  const { rerender } = render(<VATSubmissionHistory clientId="client-a" />)
  rerender(<VATSubmissionHistory clientId="client-b" />)
  expect(await screen.findByText('Ontvangen')).toBeVisible()
  resolveOld({ submissions: [row('old', 'REJECTED')], total_count: 1 })
  await waitFor(() => expect(screen.queryByText('Afgewezen')).toBeNull())
})
