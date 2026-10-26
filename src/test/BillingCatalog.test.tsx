import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { STARTER_PRICE_NL, PRO_PRICE_NL, billingCatalog } from '@/lib/billingCatalog'
import { PrijzenPage } from '@/pages/PrijzenPage'
import { MarketingFooter } from '@/components/marketing/Footer'

afterEach(cleanup)
it('renders the public price from the same catalog used by checkout', () => {
  render(<PrijzenPage />)
  expect(Number(billingCatalog.starter.price_monthly)).toBe(4.95)
  expect(STARTER_PRICE_NL).toBe('€4,95')
  expect(PRO_PRICE_NL).toBe('€6,95')
  expect(screen.getByText(/Daarna €4,95/)).toBeVisible()
})
it('does not offer an inactive newsletter subscription or fake social destinations', () => {
  const { container } = render(<MarketingFooter />)
  expect(container.querySelector('form')).toBeNull()
  expect(container.querySelector('a[href="#"]')).toBeNull()
  expect(screen.getByText('info@zzpershub.nl')).toHaveAttribute('href', 'mailto:info@zzpershub.nl')
})
