import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StartGuide } from '@/components/landing/StartGuide'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('landing start guide', () => {
  it('renders a useful first frame before playback and supports direct step navigation', () => {
    render(<StartGuide />)
    expect(screen.getByRole('heading', { name: 'Begin met je bedrijfsgegevens.' })).toBeInTheDocument()
    expect(screen.getAllByText('Profiel opslaan').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '3 Factuur maken' }))
    expect(screen.getByRole('heading', { name: 'Zet je werk op een factuur.' })).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveValue('30')
    fireEvent.click(screen.getByRole('button', { name: 'Volgende stap' }))
    expect(screen.getByRole('heading', { name: 'Controleer en verstuur.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volgende stap' }))
    expect(screen.getByText(/ze voert geen bankbetaling uit/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volgende stap' })).toBeDisabled()
  })

  it('plays, pauses, seeks, reaches the final paid state and restarts', () => {
    vi.useFakeTimers()
    render(<StartGuide />)
    fireEvent.click(screen.getByRole('button', { name: 'Uitleg afspelen' }))
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.getByText('Studio Noord (voorbeeld)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pauzeren' }))
    act(() => vi.advanceTimersByTime(20000))
    expect(screen.getByRole('slider')).toHaveValue('6')
    fireEvent.change(screen.getByRole('slider'), { target: { value: '74' } })
    fireEvent.click(screen.getByRole('button', { name: 'Uitleg afspelen' }))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('status')).toHaveTextContent('Je bent klaar')
    expect(screen.getByRole('button', { name: 'Opnieuw afspelen' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Startgids opnieuw beginnen' }))
    expect(screen.getByRole('slider')).toHaveValue('0')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('does not advance while the page is hidden and clears its timer on unmount', () => {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const { unmount } = render(<StartGuide />)
    fireEvent.click(screen.getByRole('button', { name: 'Uitleg afspelen' }))
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('slider')).toHaveValue('0')
    hidden.mockRestore()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
