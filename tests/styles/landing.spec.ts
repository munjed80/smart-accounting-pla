import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }, testInfo) => {
  // Most checks start after consent; the cookie check exercises the first visit.
  if (!testInfo.title.startsWith('cookie choice'))
    await page.addInitScript(() =>
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({
          necessary: true,
          functional: false,
          analytics: false,
          marketing: false,
        }),
      ),
    )
  await page.goto('/tests/styles/landing.html')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('homepage fits the viewport, has real destinations and an isolated light palette', async ({
  page,
}, testInfo) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Meer ondernemen.Minder uitzoekwerk.',
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  for (const link of await page.locator('.landing-page a[href^="#"]').all()) {
    const target = await link.getAttribute('href')
    expect(await page.locator(target!).count()).toBe(1)
  }
  await expect(
    page.getByRole('link', { name: 'Start 3 maanden gratis' }).first(),
  ).toHaveAttribute('href', '/register')
  await expect(page.locator('.lp-login')).toHaveAttribute('href', '/login')
  const background = await page
    .locator('.landing-page')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await expect(page.locator('.landing-page')).toHaveCSS(
    'background-color',
    background,
  )
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: testInfo.outputPath('homepage.png'),
    fullPage: true,
  })
  await page.screenshot({ path: testInfo.outputPath('hero.png') })
})

test('product tabs work with pointer and keyboard and show matching content', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Uitgaven' }).click()
  await expect(page.getByRole('tabpanel')).toContainText(
    'Een bonnetje hoort bij een uitgave.',
  )
  await expect(page.getByRole('tabpanel')).toContainText('€ 96,80')
  await page.getByRole('tab', { name: 'Uitgaven' }).press('ArrowRight')
  await expect(
    page.getByRole('tab', { name: 'Uren', exact: true }),
  ).toBeFocused()
  await expect(
    page.getByRole('tab', { name: 'Uren', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toContainText('Deze week')
  await page.getByRole('tab', { name: 'Uren', exact: true }).press('Home')
  await expect(page.getByRole('tabpanel')).toContainText('€ 1.512,50')
})

test('FAQ opens with the keyboard and the mobile menu closes on Escape or navigation', async ({
  page,
}, testInfo) => {
  const question = page.locator('summary').first()
  await question.focus()
  await question.press('Enter')
  await expect(page.locator('details').first()).toHaveAttribute('open', '')
  if (testInfo.project.name.startsWith('mobile')) {
    const toggle = page.locator('.lp-menu-toggle')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
    await toggle.click()
    await page
      .getByRole('navigation', { name: 'Mobiele navigatie' })
      .getByRole('link', { name: 'Het product' })
      .click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(
      page.getByRole('navigation', { name: 'Mobiele navigatie' }),
    ).toHaveCount(0)
  }
})

test('cookie choice is usable and persists after reloading', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Alleen noodzakelijk', exact: true })
    .click()
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('cookie_consent')!).analytics,
    ),
  ).toBe(false)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Alleen noodzakelijk', exact: true }),
  ).toHaveCount(0)
})

test('public root renders the homepage without an authenticated session', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.abort(),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Meer ondernemen.Minder uitzoekwerk.',
  )
  await expect(page.locator('.lp-login')).toHaveAttribute('href', '/login')
  await expect(
    page.getByRole('tab', { name: 'Facturen', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
  await page.getByRole('link', { name: 'Start 3 maanden gratis' }).first().click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.locator('#register-name')).toBeVisible()
  await page.goBack()
  await page.locator('.lp-login').click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('#login-email')).toBeVisible()
})

test('layout remains within narrow, tablet and wide viewports', async ({
  page,
}) => {
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => document.fonts.ready)
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true)
    const brand = (await page.locator('.lp-header .lp-brand').boundingBox())!
    const login = (await page.locator('.lp-login').boundingBox())!
    expect(brand.x + brand.width).toBeLessThan(login.x)
  }
})

test('public account pages use one legible brand and the shared green palette', async ({ page }, testInfo) => {
  for (const [path, selector] of [
    ['/login', '#login-email'],
    ['/register', '#register-name'],
    ['/forgot-password', 'input[type="email"]'],
    ['/reset-password', '.brand-lockup'],
  ]) {
    await page.goto(path)
    await expect(page.locator(selector).first()).toBeVisible()
    await expect(page.locator('.brand-lockup')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Smart Accounting')
    if (path === '/reset-password') {
      await expect(page.getByLabel('Nieuw wachtwoord', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Wachtwoord wijzigen', exact: true })).toBeVisible()
    }
    await expect(page.locator('.brand-wordmark')).toHaveCSS('-webkit-text-fill-color', 'rgb(25, 46, 43)')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: testInfo.outputPath(`brand-${path.slice(1)}.png`), fullPage: true })
  }
})


test('existing registration offers an explicit verification request with cooldown', async ({ page }, testInfo) => {
  await page.route('**/api/v1/auth/register', route => route.fulfill({
    status: 409, json: { detail: 'Email already registered' },
  }))
  const requests: string[] = []
  await page.route('**/api/v1/auth/resend-verification', route => {
    requests.push(route.request().postDataJSON().email)
    return route.fulfill({ json: { message: 'If eligible, an email has been sent.' } })
  })
  await page.goto('/register')
  await page.getByLabel('Volledige naam', { exact: true }).fill('Sam Example')
  await page.getByLabel('E-mailadres', { exact: true }).fill('sam@example.com')
  await page.getByLabel('Wachtwoord', { exact: true }).fill('StrongPassword123')
  await page.getByRole('button', { name: 'Maak je gratis account aan', exact: true }).click()
  await expect(page.getByText('Dit e-mailadres is al geregistreerd')).toBeVisible()
  await page.getByRole('button', { name: 'Verificatie-e-mail opnieuw verzenden', exact: true }).click()
  await expect(page.getByRole('button', { name: /Opnieuw verzenden over/ })).toBeDisabled()
  expect(requests).toEqual(['sam@example.com'])
  await expect(page.getByRole('status').filter({ hasText: 'Dit e-mailadres' })).toContainText('Controleer ook je spammap')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('brand-verification-recovery.png'), fullPage: true })
})


test('unverified login can request a new activation link after API error conversion', async ({ page }) => {
  await page.route('**/api/v1/auth/token', route => route.fulfill({
    status: 403, json: { detail: { code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email' } },
  }))
  await page.route('**/api/v1/auth/resend-verification', route => route.fulfill({
    status: 429, json: { detail: 'Too many requests' },
  }))
  await page.goto('/login')
  await page.getByLabel('E-mailadres', { exact: true }).fill('sam@example.com')
  await page.getByLabel('Wachtwoord', { exact: true }).fill('StrongPassword123')
  await page.getByRole('button', { name: 'Inloggen', exact: true }).click()
  await page.getByRole('button', { name: 'Verificatie-e-mail opnieuw verzenden', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Je hebt te vaak een link aangevraagd')
  await expect(page.getByText(/Wacht.*opnieuw/)).toBeVisible()
})


test('public pricing and product coverage match the prepaid catalog', async ({ page }, testInfo) => {
  await page.goto('/')
  for (const label of ['Overzicht','Klanten','Facturen','Offertes','Uitgaven','Uren','Agenda']) {
    await expect(page.locator('#werkplek').getByRole('heading', { name: label, exact: true })).toBeVisible()
  }
  await expect(page.locator('#uren').getByText('Van urenoverzicht naar factuurregels')).toBeVisible()
  for (const provider of ['Shopify','WooCommerce']) await expect(page.locator('#koppelingen').getByRole('heading', { name: provider })).toBeVisible()
  await expect(page.locator('footer')).not.toContainText(/KvK/i)
  await page.locator('#koppelingen').screenshot({ path: testInfo.outputPath('brand-store-integrations.png') })
  await page.locator('.lp-paid-periods').screenshot({ path: testInfo.outputPath('brand-prepaid-home.png') })
  await page.goto('/prijzen')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Eerst drie maanden gratis')
  for (const amount of ['€ 6','€ 14','€ 25','€ 39']) await expect(page.locator('.prepaid-plan-price').filter({ hasText: amount })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('brand-prepaid-pricing.png'), fullPage: true })
})
