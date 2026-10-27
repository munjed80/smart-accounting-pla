import { api } from '../api'
import { validateInvoicePdf } from '../invoicePdf'

export interface CreditNote {
  id: string
  number: string
  issue_date: string
  reason: string
  subtotal_cents: number
  vat_cents: number
  total_cents: number
  refunded_cents: number
  original_invoice_number: string
  lines: {
    invoice_line_id: string
    quantity: string
    description: string
    net_cents: number
    vat_cents: number
    vat_rate: string
  }[]
}
export interface CreditSummary {
  administration_id: string
  invoice_id: string
  total: number
  credited_cents: number
  refunded_cents: number
  outstanding_cents: number
  refund_due_cents: number
  available_lines: {
    id: string
    description: string
    quantity: string
    available_quantity: string
    vat_rate: string
    unit_price_cents: number
    net_cents: number
    vat_cents: number
  }[]
  credit_notes: CreditNote[]
  refunds: {
    total: number
    items: {
      id: string
      credit_note_number: string
      amount_cents: number
      refund_date: string
      reference: string
    }[]
  }
}
export const creditNotesApi = {
  list: async (
    id: string,
    offset = 0,
    refundOffset = 0,
  ): Promise<CreditSummary> =>
    (
      await api.get(`/zzp/invoices/${id}/credits`, {
        params: { limit: 20, offset, refund_offset: refundOffset },
      })
    ).data,
  issue: async (
    id: string,
    payload: {
      issue_date: string
      reason: string
      lines: { invoice_line_id: string; quantity: string }[]
    },
    key: string,
  ): Promise<{ id: string; number: string }> =>
    (
      await api.post(`/zzp/invoices/${id}/credits`, payload, {
        headers: { 'Idempotency-Key': key },
      })
    ).data,
  refund: async (
    id: string,
    payload: { refund_date: string; amount_cents: number; reference: string },
    key: string,
  ): Promise<{ id: string; registered_only: true }> =>
    (
      await api.post(`/zzp/credit-notes/${id}/refunds`, payload, {
        headers: { 'Idempotency-Key': key },
      })
    ).data,
  pdf: async (id: string): Promise<Blob> => {
    const response = await api.get(`/zzp/credit-notes/${id}/pdf`, {
      responseType: 'blob',
    })
    return validateInvoicePdf(response.data)
  },
}
