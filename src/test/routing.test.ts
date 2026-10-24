import { parseClientDossierRoute } from '@/lib/routing'
import { describe, it, expect } from 'vitest'
import { pathToTab, tabToPath } from '../lib/routing'
import { isPublicRoutePath } from '../lib/publicRoutes'

describe('public route guard', () => {
  it('keeps landing and auth pages public while app routes stay protected', () => {
    expect(isPublicRoutePath('/')).toBe(true)
    expect(isPublicRoutePath('/login')).toBe(true)
    expect(isPublicRoutePath('/register')).toBe(true)
    expect(isPublicRoutePath('/dashboard')).toBe(false)
    expect(isPublicRoutePath('/facturen')).toBe(false)
    expect(isPublicRoutePath('/zzp/invoices')).toBe(false)
  })
})

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



  it('maps zzp obligations routes', () => {
    expect(pathToTab('/zzp/verplichtingen/overzicht', false)).toBe('obligations-overview')
    expect(pathToTab('/zzp/verplichtingen/lease-leningen', false)).toBe('lease-loans')
    expect(pathToTab('/zzp/verplichtingen/abonnementen', false)).toBe('subscriptions')
    expect(tabToPath('obligations-overview', false)).toBe('/zzp/verplichtingen/overzicht')
  })

  it('falls back to role-based default for unknown routes', () => {
    expect(pathToTab('/something-else', true, false)).toBe('workqueue')
    expect(pathToTab('/something-else', false, false)).toBe('dashboard')
    expect(pathToTab('/something-else', false, true)).toBe('admin')
  })
})


it('restores the certificates dossier tab from a direct URL', () => {
  expect(parseClientDossierRoute('/accountant/clients/client-1/certificates')).toEqual({ clientId: 'client-1', tab: 'certificates' })
  expect(parseClientDossierRoute('/accountant/clients/client-1')).toEqual({ clientId: 'client-1', tab: 'invoices' })
  expect(parseClientDossierRoute('/accountant/clients')).toBeNull()
})


it('resolves ZZP dashboard links and direct invoice/quote details', () => {
  expect(pathToTab('/zzp/settings', false)).toBe('settings')
  expect(pathToTab('/zzp/btw-aangifte', false)).toBe('tax-btw')
  expect(pathToTab('/zzp/invoices/invoice-1', false)).toBe('invoices')
  expect(pathToTab('/zzp/offertes/quote-1', false)).toBe('offertes')
})
