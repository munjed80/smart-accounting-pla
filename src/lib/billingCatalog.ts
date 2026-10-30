import catalog from '../../backend/app/core/billing_plans.json'

export const billingCatalog = catalog
export const STARTER_PRICE_NL = new Intl.NumberFormat('nl-NL', {
  style: 'currency', currency: 'EUR',
}).format(Number(catalog.starter.price_monthly)).replace(/\s/g, '')

export const PRO_PRICE_NL = new Intl.NumberFormat('nl-NL', {
  style: 'currency', currency: 'EUR',
}).format(Number(catalog.zzp_pro.price_monthly)).replace(/\s/g, '')

export const PREPAID_PLANS = (['zzp_1m', 'zzp_3m', 'zzp_6m', 'zzp_12m'] as const).map(code => ({
  code,
  months: catalog[code].months,
  amount: Number(catalog[code].amount),
  label: `${catalog[code].months} ${catalog[code].months === 1 ? 'maand' : 'maanden'}`,
  price: new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(Number(catalog[code].amount)),
  monthlyEquivalent: new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(catalog[code].amount) / catalog[code].months),
}))
export type PrepaidPlanCode = typeof PREPAID_PLANS[number]['code']
export const MONTHLY_PRICE_NL = PREPAID_PLANS[0].price
export const isPrepaidPlan = (code?: string | null) => PREPAID_PLANS.some(plan => plan.code === code)
