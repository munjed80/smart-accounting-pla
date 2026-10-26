import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { VatPolicySetup } from '@/components/VatPolicySetup'
import { zzpBtwApi } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  zzpBtwApi: { confirmPolicy: vi.fn() },
  getErrorMessage: (e: Error) => e.message,
}))
beforeEach(() => vi.clearAllMocks())
it('requires an explicit basis and acknowledgement and sends the selected quarter start', async () => {
  const saved = vi.fn().mockResolvedValue(undefined)
  vi.mocked(zzpBtwApi.confirmPolicy).mockResolvedValue({
    basis: 'factuurstelsel',
    effective_from: '2026-01-01',
    confirmed_at: '2026-01-01T00:00:00Z',
  })
  render(<VatPolicySetup year={2026} quarter={1} onSaved={saved} />)
  const button = screen.getByRole('button', {
    name: 'Bevestigen vanaf Q1 2026',
  })
  expect(button).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Stelsel'), {
    target: { value: 'factuurstelsel' },
  })
  expect(button).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(button)
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  expect(zzpBtwApi.confirmPolicy).toHaveBeenCalledWith(
    'factuurstelsel',
    '2026-01-01',
  )
})
it('preserves a server rejection instead of reporting success', async () => {
  vi.mocked(zzpBtwApi.confirmPolicy).mockRejectedValue(
    new Error('Afgesloten periode'),
  )
  const saved = vi.fn()
  render(<VatPolicySetup year={2026} quarter={1} onSaved={saved} />)
  fireEvent.change(screen.getByLabelText('Stelsel'), {
    target: { value: 'kasstelsel' },
  })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(
    screen.getByRole('button', { name: 'Bevestigen vanaf Q1 2026' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Afgesloten periode',
  )
  expect(saved).not.toHaveBeenCalled()
})
it('shows earlier history without offering to overwrite the confirmed basis', () => {
  render(
    <VatPolicySetup
      policy={{
        basis: 'kasstelsel',
        effective_from: '2026-04-01',
        confirmed_at: '',
      }}
      year={2026}
      quarter={1}
      onSaved={vi.fn()}
    />,
  )
  expect(
    screen.getByText(/Eerdere perioden blijven historische schattingen/),
  ).toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('does not confirm future periods', () => {
  render(<VatPolicySetup year={2100} quarter={1} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Stelsel'), {
    target: { value: 'factuurstelsel' },
  })
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button')).toBeDisabled()
})

it('allows confirmation on the first morning of a started quarter', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 0, 1, 9))
  try {
    render(<VatPolicySetup year={2026} quarter={1} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Stelsel'), { target: { value: 'factuurstelsel' } })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button')).toBeEnabled()
  } finally {
    vi.useRealTimers()
  }
})
