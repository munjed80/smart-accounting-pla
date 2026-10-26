import { render, act } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useQuickCreate } from '@/hooks/useQuickCreate'
import { useQueryFilters } from '@/hooks/useQueryFilters'

beforeEach(() =>
  window.history.replaceState({}, '', '/zzp/invoices?action=new&status=draft'),
)
function Probe({ ready, open }: { ready: boolean; open: () => void }) {
  useQueryFilters({ status: 'all' })
  useQuickCreate('new', open, ready)
  return null
}
it('opens once after prerequisites load even when filters normalize the URL first', () => {
  const open = vi.fn()
  const view = render(<Probe ready={false} open={open} />)
  expect(window.location.search).toBe('?status=draft')
  expect(open).not.toHaveBeenCalled()
  view.rerender(<Probe ready open={open} />)
  view.rerender(<Probe ready open={open} />)
  expect(open).toHaveBeenCalledOnce()
  expect(window.location.search).toBe('?status=draft')
})
it('does not let a previous page consume a new page action during navigation', () => {
  const open = vi.fn()
  window.history.replaceState({}, '', '/zzp/invoices')
  render(<Probe ready open={open} />)
  act(() => {
    window.history.pushState({}, '', '/zzp/expenses?action=new')
    window.dispatchEvent(new CustomEvent('app:route-change'))
  })
  expect(open).not.toHaveBeenCalled()
  expect(window.location.search).toContain('action=new')
})
it('consumes same-page navigation only once despite both routing events', () => {
  const open = vi.fn()
  window.history.replaceState({}, '', '/zzp/invoices')
  render(<Probe ready open={open} />)
  act(() => {
    window.history.pushState({}, '', '/zzp/invoices?action=new&status=draft')
    window.dispatchEvent(new CustomEvent('app:route-change'))
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(open).toHaveBeenCalledOnce()
})
it('removes only its action and preserves other parameters, hash and history state', () => {
  window.history.replaceState(
    { route: 5 },
    '',
    '/zzp/time?action=new&project=42#entries',
  )
  const open = vi.fn()
  function TimeProbe() {
    useQuickCreate('new', open)
    return null
  }
  render(<TimeProbe />)
  expect(window.location.href).toContain('/zzp/time?project=42#entries')
  expect(window.history.state).toEqual({ route: 5 })
  expect(open).toHaveBeenCalledOnce()
})
