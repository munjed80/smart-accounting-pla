import catalog from '../../backend/app/core/billing_plans.json'

export const billingCatalog = catalog
export const STARTER_PRICE_NL = new Intl.NumberFormat('nl-NL', {
  style: 'currency', currency: 'EUR',
}).format(Number(catalog.starter.price_monthly)).replace(/\s/g, '')

export const PRO_PRICE_NL = new Intl.NumberFormat('nl-NL', {
  style: 'currency', currency: 'EUR',
}).format(Number(catalog.zzp_pro.price_monthly)).replace(/\s/g, '')
