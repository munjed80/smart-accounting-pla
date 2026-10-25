import { toast } from 'sonner'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react'
import { ZZPInvoicesPage, InvoiceFormDialog } from '../components/ZZPInvoicesPage'
import * as api from '../lib/api'
import * as AuthContext from '../lib/AuthContext'

vi.mock('../lib/api', () => ({
  zzpApi: {
    invoices: { list: vi.fn(), updateStatus: vi.fn(), get: vi.fn(), preview: vi.fn(), downloadPdf: vi.fn(), suggestPrice: vi.fn().mockResolvedValue({ suggested_price_euros: null }) },
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


const customer = {id:'c1',name:'Customer A',status:'active'} as any
const invoice = {id:'i1',customer_id:'c1',invoice_number:'INV-001',status:'draft',issue_date:'2026-10-25',due_date:'2026-11-01',notes:'Old notes',subtotal_cents:1999,vat_total_cents:420,total_cents:2419,lines:[{id:'l1',description:'Work',quantity:1,unit_price_cents:1999,vat_rate:21}]} as any
const form = (extra: any = {}) => <InvoiceFormDialog open onOpenChange={vi.fn()} customers={[customer]} businessProfile={null} onSave={vi.fn()} invoice={invoice} {...extra}/>
beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/zzp/invoices')
  vi.mocked(AuthContext.useAuth).mockReturnValue({user:{id:'u1',role:'zzp'}} as any)
  vi.mocked(api.zzpApi.invoices.list).mockResolvedValue({invoices:[],total:0} as any)
  vi.mocked(api.zzpApi.customers.list).mockResolvedValue({customers:[customer]} as any)
  vi.mocked(api.zzpApi.profile.get).mockResolvedValue(null as any)
})
it('opens invoice details after following a direct URL', async () => {
  window.history.replaceState({}, '', '/zzp/invoices/i1')
  vi.mocked(api.zzpApi.invoices.get).mockResolvedValue(invoice)
  render(<ZZPInvoicesPage />)
  expect(await screen.findByRole('dialog')).toHaveTextContent('INV-001')
})
it('sends null when clearing optional fields, and returns matching totals', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(form({onSave:save}))
  expect(screen.getByText('€ 24,19')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('zzpInvoices.formNotes'), {target:{value:''}})
  fireEvent.change(screen.getByLabelText('zzpInvoices.formDueDate'), {target:{value:''}})
  fireEvent.click(screen.getByRole('button',{name:'zzpInvoices.saveInvoice'}))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({notes:null,due_date:null,delivery_date:null}), true, expect.any(String)))
})
it('protects unsaved work while allowing an explicit discard', async () => {
  const close = vi.fn()
  render(form({onOpenChange:close}))
  fireEvent.change(screen.getByLabelText('zzpInvoices.formNotes'), {target:{value:'Unsaved'}})
  fireEvent.click(screen.getByRole('button',{name:'common.cancel'}))
  expect(close).not.toHaveBeenCalled()
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('Wijzigingen niet opgeslagen')
  fireEvent.click(screen.getByRole('button',{name:'Verder bewerken'}))
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'common.cancel'}))
  fireEvent.click(screen.getByRole('button',{name:'Wijzigingen verwerpen'}))
  expect(close).toHaveBeenCalledWith(false)
})
it('keeps the creation key when retrying a failed save', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(undefined)
  render(form({onSave:save}))
  fireEvent.click(screen.getByRole('button',{name:'zzpInvoices.saveInvoice'}))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button',{name:'zzpInvoices.saveInvoice'}))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[0][2]).toBe(save.mock.calls[1][2])
})
it('requests a PDF preview without saving the invoice', async () => {
  const save = vi.fn()
  vi.mocked(api.zzpApi.invoices.preview).mockRejectedValue(new Error('Preview unavailable'))
  render(form({onSave:save}))
  fireEvent.click(screen.getByRole('button',{name:'Voorbeeld PDF'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Preview unavailable')
  expect(api.zzpApi.invoices.preview).toHaveBeenCalledWith(expect.objectContaining({invoice_number:'INV-001',lines:[expect.objectContaining({unit_price_cents:1999})]}))
  expect(save).not.toHaveBeenCalled()
})

it('shows a download failure without announcing success', async () => {
  vi.mocked(api.zzpApi.invoices.downloadPdf).mockRejectedValue(new Error('PDF service unavailable'))
  render(form({isReadOnly:true}))
  fireEvent.click(screen.getByRole('button',{name:'PDF downloaden'}))
  expect(await screen.findByText('PDF service unavailable')).toBeInTheDocument()
  expect(toast.success).not.toHaveBeenCalled()
})
