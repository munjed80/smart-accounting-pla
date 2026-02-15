import { describe, it, expect } from 'vitest'
import { pathToTab, tabToPath } from '../lib/routing'

describe('routing mappings for accountant pages', () => {
  it('maps accountant URLs to expected tabs', () => {
    expect(pathToTab('/accountant', true)).toBe('workqueue')
    expect(pathToTab('/accountant/review-queue', true)).toBe('reviewqueue')
    expect(pathToTab('/accountant/clients', true)).toBe('clients')
    expect(pathToTab('/accountant/reminders', true)).toBe('reminders')
    expect(pathToTab('/accountant/bank', true)).toBe('bank')
  })

  it('maps accountant tabs back to stable URLs', () => {
    expect(tabToPath('workqueue', true)).toBe('/accountant')
    expect(tabToPath('reviewqueue', true)).toBe('/accountant/review-queue')
    expect(tabToPath('clients', true)).toBe('/accountant/clients')
    expect(tabToPath('acties', true)).toBe('/accountant/acties')
    expect(tabToPath('bank', true)).toBe('/accountant/bank')
  })

  it('falls back to role-based default for unknown routes', () => {
    expect(pathToTab('/something-else', true, false)).toBe('workqueue')
    expect(pathToTab('/something-else', false, false)).toBe('dashboard')
    expect(pathToTab('/something-else', false, true)).toBe('admin')
  })
})
