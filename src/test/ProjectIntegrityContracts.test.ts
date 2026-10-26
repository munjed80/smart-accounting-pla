import { expect, it, vi } from 'vitest'
import { zzpApi } from '@/lib/api/zzp'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn().mockResolvedValue({}), get: vi.fn().mockResolvedValue({ data: new Blob(['image']) }) } }))

it('uses the registered invoice payment action paths', async () => {
  await zzpApi.invoices.markPaid('invoice-a', { payment_method: 'cash' })
  expect(api.post).toHaveBeenCalledWith('/zzp/invoices/invoice-a/mark-paid', { payment_method: 'cash' })
  await zzpApi.invoices.markUnpaid('invoice-a')
  expect(api.post).toHaveBeenCalledWith('/zzp/invoices/invoice-a/mark-unpaid')
})

it('downloads receipt evidence through the authenticated client', async () => {
  await zzpApi.documents.download('document-a')
  expect(api.get).toHaveBeenCalledWith('/zzp/documents/document-a/file', { responseType: 'blob' })
})
