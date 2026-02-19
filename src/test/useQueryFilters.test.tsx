import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useQueryFilters } from '@/hooks/useQueryFilters'

const Probe = () => {
  const { filters, setFilter, reset } = useQueryFilters({ q: '', status: 'all' })
  return (
    <div>
      <span data-testid="q">{filters.q}</span>
      <span data-testid="status">{filters.status}</span>
      <button onClick={() => setFilter('q', 'abc')}>set</button>
      <button onClick={() => reset()}>reset</button>
    </div>
  )
}

describe('useQueryFilters', () => {
  it('parses url params and resets', () => {
    window.history.replaceState({}, '', '/test?q=hello&status=paid')
    render(<Probe />)

    expect(screen.getByTestId('q').textContent).toBe('hello')
    expect(screen.getByTestId('status').textContent).toBe('paid')

    fireEvent.click(screen.getByText('set'))
    expect(window.location.search).toContain('q=abc')

    fireEvent.click(screen.getByText('reset'))
    expect(window.location.search).toBe('')
  })
})
