import { it, expect } from 'vitest'
import { validateInvoicePdf } from '@/lib/invoicePdf'

it('rejects HTML/JSON/error bodies before offering a PDF download', async () => {
  await expect(validateInvoicePdf(new Blob(['<html>503</html>']))).rejects.toThrow('geldig PDF')
  await expect(validateInvoicePdf(new Blob([]))).rejects.toThrow('geldig PDF')
  const pdf = new Blob(['%PDF-1.7 test'])
  expect(await validateInvoicePdf(pdf)).toBe(pdf)
})
