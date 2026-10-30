import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PREPAID_PLANS, billingCatalog } from '@/lib/billingCatalog'
import { PrijzenPage } from '@/pages/PrijzenPage'
import { MarketingFooter } from '@/components/marketing/Footer'

afterEach(cleanup)
it('renders the public price from the same catalog used by checkout', () => {
  render(<PrijzenPage />)
  expect(PREPAID_PLANS.map(plan => [plan.months, plan.amount])).toEqual([[1,6],[3,14],[6,25],[12,39]])
  for (const plan of PREPAID_PLANS) {
    expect(billingCatalog[plan.code].prepaid).toBe(true)
    const card = screen.getByRole('heading', { name: plan.label, exact: true }).closest('article')!
    expect(card.textContent!.replace(/\s/g, '')).toContain(plan.price.replace(/\s/g, ''))
  }
  expect(screen.getByText('Start 3 maanden gratis')).toBeVisible()
  expect(screen.queryByText(/eerste jaar/)).not.toBeInTheDocument()
})
it('does not offer an inactive newsletter subscription or fake social destinations', () => {
  const { container } = render(<MarketingFooter />)
  expect(container.querySelector('form')).toBeNull()
  expect(container.textContent).not.toMatch(/KvK/i)
  expect(container.querySelector('a[href="#"]')).toBeNull()
  expect(screen.getByText('info@zzpershub.nl')).toHaveAttribute('href', 'mailto:info@zzpershub.nl')
})
