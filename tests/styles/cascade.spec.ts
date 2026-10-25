import { test, expect } from '@playwright/test'

const fixture = '/tests/styles/index.html'
test.beforeEach(async ({ page }) => {
  await page.goto(fixture)
  await expect(page.getByTestId('panel')).toBeVisible()
})

test('spacing, width, radii and palettes resolve at the document root', async ({ page }) => {
  const values = await page.getByTestId('panel').evaluate(el => {
    const s = getComputedStyle(el)
    return { padding: s.padding, width: s.width, radius: s.borderRadius }
  })
  expect(values).toEqual({ padding: '16px', width: '256px', radius: '10px' })
  await expect(page.getByTestId('gap')).toHaveCSS('gap', '16px')
  expect(await page.getByTestId('accent').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())).toBe('oklch(0.205 0 0)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('portals inherit spacing and the dialog fits the viewport naturally', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Open dialog' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate(el => !!el.closest('#root'))).toBe(false)
  await expect(dialog).toHaveCSS('padding', testInfo.project.name.startsWith('mobile') ? '16px' : '24px')
  const box = (await dialog.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  if (testInfo.project.name.startsWith('desktop')) {
    expect(box.height).toBeLessThan(350)
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(3)
  } else {
    expect(box.y).toBeCloseTo(0, 0)
    expect(box.height).toBeCloseTo(viewport.height, 0)
  }
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('the document scrolls while its header stays sticky', async ({ page }) => {
  await page.evaluate(() => window.scrollTo({ top: 350, behavior: 'instant' }))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
  await expect.poll(async () => (await page.getByTestId('header').boundingBox())!.y).toBeCloseTo(0, 0)
})

test('dark tokens and utilities use the same switch', async ({ page }) => {
  const lightBorder = await page.getByTestId('dark').evaluate(el => getComputedStyle(el).borderTopColor)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())).toBe('oklch(0.922 0 0)')
  await expect.poll(() => page.getByTestId('dark').evaluate(el => getComputedStyle(el).borderTopColor)).not.toBe(lightBorder)
})

test('reduced motion disables decorative animations and smooth scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByTestId('motion')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto')
})
