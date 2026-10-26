import { expect, it, vi } from 'vitest'
import { navigateTo } from '@/lib/navigation'

it('opens a new page at the top after publishing route events', () => {
  window.history.replaceState({}, '', '/dashboard')
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const route = vi.fn()
  window.addEventListener('app:route-change', route)
  navigateTo('/zzp/belastinghulp/btw')
  expect(window.location.pathname).toBe('/zzp/belastinghulp/btw')
  expect(route).toHaveBeenCalledOnce()
  expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  window.removeEventListener('app:route-change', route)
  scroll.mockRestore()
})
