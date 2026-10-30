import { test, expect } from '@playwright/test'
import {
  dashboardUser,
  dashboardAdministration,
  dashboardSummary,
  dashboardMonths,
  dashboardReceipts,
} from '../fixtures/dashboard'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'dashboard-fixture')
    localStorage.setItem('pwa_ios_install_dismissed', String(Date.now()))
  })
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const data = {
      '/auth/me': dashboardUser,
      '/administrations': [dashboardAdministration],
      '/zzp/dashboard': dashboardSummary,
      '/zzp/dashboard/monthly-invoices': dashboardMonths,
      '/zzp/dashboard/receipts': dashboardReceipts,
      '/me/subscription': {
        can_use_pro_features: false,
        status: 'TRIALING',
        in_trial: true,
      },
      '/zzp/invoices': { invoices: [], total: 0 },
      '/zzp/customers': {
        customers: [
          {
            id: 'c1',
            name: 'Example BV',
            email: 'customer@example.com',
            status: 'active',
          },
        ],
        total: 1,
      },
      '/zzp/profile': {
        company_name: 'Studio de Vries',
        kvk_number: '12345678',
        btw_number: 'NL123456789B01',
        iban: 'NL91ABNA0417164300',
        default_hourly_rate: 80,
      },
      '/zzp/expenses': {
        expenses: [],
        total: 0,
        total_amount_cents: 0,
        total_vat_cents: 0,
      },
      '/zzp/expenses/categories': { categories: ['algemeen'] },
      '/zzp/time-entries/open': [],
      '/zzp/time-entries/invoiced': [],
      '/zzp/work-sessions/active': null,
      '/zzp/documents/page': {
        documents: [],
        total: 0,
        counts: { NEW: 0, REVIEW: 0, PROCESSED: 0, FAILED: 0 },
      },
    }[path]
    await route.fulfill({
      status: data !== undefined ? 200 : 404,
      json:
        data !== undefined
          ? data
          : { detail: 'Unexpected fixture request: ' + path },
    })
  })
})

test('overview fits mobile and desktop, renders actual chart bars and supports dark mode', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/styles/dashboard.html')
  await expect(page.getByText('1 factuur te laat')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Ontvangen deze maand/ }),
  ).toContainText('5.929,00')
  await expect(
    page.getByRole('link', { name: 'Nieuwe factuur' }),
  ).toHaveAttribute('href', '/zzp/invoices?action=new')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  const bars = await page
    .locator('.ov-chart-columns > span')
    .evaluateAll((elements) =>
      elements.map((el) => el.getBoundingClientRect().height),
    )
  expect(bars).toHaveLength(12)
  expect(Math.min(...bars)).toBeGreaterThan(30)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: testInfo.outputPath('overview.png'),
    fullPage: true,
  })
  const light = await page
    .locator('.zzp-overview')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await expect(page.locator('.zzp-overview')).not.toHaveCSS(
    'background-color',
    light,
  )
  await page.screenshot({
    path: testInfo.outputPath('overview-dark.png'),
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test('month selection, accessible data table and receipt source reconcile', async ({
  page,
}) => {
  await page.goto('/tests/styles/dashboard.html')
  await page.getByRole('button', { name: /juni 2026: gefactureerd/ }).click()
  await expect(page.locator('.ov-chart-inspector')).toContainText('juni 2026')
  await expect(
    page.getByRole('link', { name: 'Facturen bekijken', exact: true }),
  ).toHaveAttribute('href', '/zzp/invoices?from=2026-06-01&to=2026-06-30')
  await page.getByText('Bedragen per maand bekijken').click()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(7)
  await page.getByRole('button', { name: /Ontvangen deze maand/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Deelbetaling oktober')).toBeVisible()
  await expect(dialog.getByRole('link', { name: '2026-0042' })).toHaveAttribute(
    'href',
    '/zzp/invoices/i1',
  )
  expect(
    await dialog.evaluate(
      (el) => el.getBoundingClientRect().right <= innerWidth,
    ),
  ).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})

test('monthly failure does not remove cash figures or replace missing data with an empty chart', async ({
  page,
}) => {
  await page.route('**/api/v1/zzp/dashboard/monthly-invoices*', (route) =>
    route.fulfill({
      status: 503,
      json: { detail: 'Monthly summary unavailable' },
    }),
  )
  await page.goto('/tests/styles/dashboard.html')
  await expect(
    page.getByRole('button', { name: /Ontvangen deze maand/ }),
  ).toContainText('5.929,00')
  await expect(page.locator('.ov-activity').getByRole('alert')).toBeVisible()
  await expect(page.locator('.ov-chart')).toHaveCount(0)
  await expect(page.getByText('1 factuur te laat')).toBeVisible()
})

for (const [label, heading] of [
  ['Nieuwe factuur', 'Nieuwe factuur'],
  ['Uitgave toevoegen', 'Nieuwe uitgave'],
  ['Uren registreren', 'Uren toevoegen'],
] as const) {
  test(`quick action ${label} opens one real editor inside the responsive shell`, async ({
    page,
  }) => {
    await page.goto('/tests/styles/dashboard.html')
    await expect(page.getByText('1 factuur te laat')).toBeVisible()
    await expect(page.getByRole('main')).toHaveCount(1)
    await page.getByRole('link', { name: label, exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(
      page
        .getByRole('dialog')
        .getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible()
    await expect(page).not.toHaveURL(/action=new/)
  })
}
test('upload action opens the camera/file chooser without bypassing user file selection', async ({
  page,
}) => {
  await page.goto('/tests/styles/dashboard.html')
  await page
    .getByRole('link', { name: 'Bonnetje uploaden', exact: true })
    .click()
  await expect(
    page.getByText('Document toevoegen', { exact: true }),
  ).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Scan met camera' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: "Kies bestand (Foto's / Bestanden)" }),
  ).toBeVisible()
  await expect(page).not.toHaveURL(/action=upload/)
})

test('workspace and navigation share the homepage identity at mobile and desktop sizes', async ({ page }, testInfo) => {
  await page.goto('/tests/styles/dashboard.html')
  await expect(page.getByText('1 factuur te laat')).toBeVisible()
  await expect(page.locator('.app-shell-header .brand-lockup')).toBeVisible()
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).toContain('ZZP Sans')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: testInfo.outputPath('brand-workspace.png'), fullPage: true })
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.locator('.brand-lockup')).toBeVisible()
  await expect(drawer.locator('.workspace-sidebar')).toHaveCSS('background-color', 'rgb(28, 61, 52)')
  await expect(drawer.locator('.brand-wordmark')).toHaveCSS('color', 'rgb(241, 245, 236)')
  await expect.poll(async () => (await drawer.boundingBox())?.x).toBeCloseTo(0, 1)
  const navigation = drawer.getByRole('navigation', { name: 'Main navigation' })
  await expect(navigation.getByRole('menuitem')).toHaveText([
    'Overzicht', 'Klanten', 'Facturen', 'Offertes', 'Uitgaven', 'Uren', 'Agenda',
  ])
  const more = drawer.getByRole('button', { name: 'Meer opties', exact: true })
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await expect(navigation.getByRole('menuitem', { name: 'Documenten', exact: true })).toHaveCount(0)
  await more.click()
  await expect(navigation.getByRole('menuitem', { name: 'Documenten', exact: true })).toBeVisible()
  await more.click()
  await navigation.evaluate(el => { el.scrollTop = 0 })
  await expect(navigation.getByRole('menuitem', { name: 'Overzicht', exact: true })).toBeInViewport({ ratio: 1 })
  await expect(navigation.getByRole('menuitem', { name: 'Agenda', exact: true })).toBeInViewport({ ratio: 1 })
  const settings = drawer.getByRole('button', { name: 'Instellingen', exact: true })
  const logout = drawer.getByRole('button', { name: 'Uitloggen', exact: true })
  await expect(settings).toBeInViewport()
  await expect(logout).toBeInViewport()
  expect((await settings.boundingBox())!.y).toBeCloseTo((await logout.boundingBox())!.y, 0)
  const box = (await drawer.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width - 39)
  expect(box.y).toBe(0)
  expect(box.height).toBe(page.viewportSize()!.height)
  await page.screenshot({ path: testInfo.outputPath('brand-navigation.png') })
  await page.keyboard.press('Escape')
  await expect(drawer).not.toBeVisible()
})
