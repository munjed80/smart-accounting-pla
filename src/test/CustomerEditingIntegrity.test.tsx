import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CustomerFormDialog } from '../components/ZZPCustomersPage'
vi.mock('../i18n', () => ({ t: (key: string) => key }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
const customer = { id: 'c1', name: 'Studio A', email: 'old@example.com', btw_number: 'BE0123456789', status: 'active' } as any

describe('Customer editing', () => {
  it('saves other changes with an unchanged foreign VAT number and clears an optional value', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<CustomerFormDialog open onOpenChange={vi.fn()} customer={customer} onSave={onSave} />)
    fireEvent.change(document.getElementById('customer-name')!, { target: { value: 'Studio B' } })
    fireEvent.change(document.getElementById('customer-email')!, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'zzpCustomers.saveCustomer' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({name:'Studio B',email:null,btw_number:'BE0123456789'})))
  })
  it('explains validation failure instead of silently disabling save', async () => {
    const onSave = vi.fn()
    render(<CustomerFormDialog open onOpenChange={vi.fn()} customer={customer} onSave={onSave} />)
    fireEvent.change(document.getElementById('customer-email')!, { target: { value: 'invalid' } })
    const save = screen.getByRole('button', {name:'zzpCustomers.saveCustomer'})
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(await screen.findByText('zzpCustomers.formEmailInvalid')).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })
  it('preserves values and permits retry after the API rejects a save', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    render(<CustomerFormDialog open onOpenChange={vi.fn()} customer={customer} onSave={onSave} />)
    fireEvent.change(document.getElementById('customer-name')!, {target:{value:'Keep this name'}})
    const save = screen.getByRole('button', {name:'zzpCustomers.saveCustomer'})
    fireEvent.click(save)
    await waitFor(() => expect(save).toBeEnabled())
    expect(document.getElementById('customer-name')).toHaveValue('Keep this name')
    fireEvent.click(save)
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
  })
})
