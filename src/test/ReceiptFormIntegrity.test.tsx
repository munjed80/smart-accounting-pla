import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExpenseFormDialog } from '@/components/ZZPExpensesPage'

vi.mock('@/lib/api', () => ({ zzpApi: { documents: { download: vi.fn() } } }))
vi.mock('@/lib/AuthContext', () => ({ useAuth: vi.fn() }))
afterEach(cleanup)

it('preserves the stored receipt reference when saving scanned expense data', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const data = { vendor: 'Receipt shop', amount_cents: 1000, vat_rate: 21, expense_date: '2026-10-26', category: 'overig', document_id: 'document-a' }
  render(<ExpenseFormDialog open onOpenChange={vi.fn()} categories={['overig']} scannedData={data} onSave={save} />)
  const button = await screen.findByRole('button', { name: 'Uitgave opslaan' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ document_id: 'document-a', amount_cents: 1000 })))
  expect(screen.getByRole('button', { name: 'Bonnetje downloaden' })).toBeVisible()
})
