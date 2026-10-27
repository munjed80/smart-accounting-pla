import { test, expect } from '@playwright/test'
import {
  dashboardUser,
  dashboardAdministration,
  dashboardSummary,
  dashboardMonths,
} from '../fixtures/dashboard'

test('issued invoice supports a credit, bounded refund registration and PDF download', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let credited = false
  let refunded = false
  const writes: {
    path: string
    payload: Record<string, unknown>
    key: string | undefined
  }[] = []
  const invoice = {
    id: 'i1',
    administration_id: 'a1',
    customer_id: 'c1',
    customer_name: 'Example BV',
    invoice_number: 'INV-2026-42',
    status: 'paid',
    issue_date: '2026-10-01',
    due_date: '2026-10-15',
    subtotal_cents: 20000,
    vat_total_cents: 4200,
    total_cents: 24200,
    amount_paid_cents: 24200,
    credited_cents: 0,
    refunded_cents: 0,
    notes: '',
    lines: [
      {
        id: 'l1',
        line_number: 1,
        description: 'Ontwerpwerk',
        quantity: 2,
        unit_price_cents: 10000,
        vat_rate: 21,
        line_total_cents: 20000,
        vat_amount_cents: 4200,
      },
    ],
  }
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'fixture')
    localStorage.setItem('pwa_ios_install_dismissed', String(Date.now()))
  })
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    if (route.request().method() === 'POST') {
      writes.push({
        path,
        payload: route.request().postDataJSON(),
        key: route.request().headers()['idempotency-key'],
      })
      if (path === '/zzp/invoices/i1/credits') {
        credited = true
        await route.fulfill({
          status: 201,
          json: { id: 'cn1', number: 'CN-2026-0001' },
        })
        return
      }
      if (path === '/zzp/credit-notes/cn1/refunds') {
        refunded = true
        await route.fulfill({
          status: 201,
          json: { id: 'r1', registered_only: true },
        })
        return
      }
    }
    if (path === '/zzp/credit-notes/cn1/pdf') {
      await route.fulfill({
        contentType: 'application/pdf',
        body: '%PDF-1.7 fixture',
      })
      return
    }
    const summary = {
      administration_id: 'a1',
      invoice_id: 'i1',
      total: credited ? 1 : 0,
      credited_cents: credited ? 12100 : 0,
      refunded_cents: refunded ? 12100 : 0,
      outstanding_cents: 0,
      refund_due_cents: credited && !refunded ? 12100 : 0,
      available_lines: [
        {
          ...invoice.lines[0],
          quantity: '2',
          available_quantity: credited ? '1' : '2',
          net_cents: 20000,
          vat_cents: 4200,
        },
      ],
      credit_notes: credited
        ? [
            {
              id: 'cn1',
              number: 'CN-2026-0001',
              issue_date: '2026-10-27',
              reason: 'Retour afgesproken',
              subtotal_cents: 10000,
              vat_cents: 2100,
              total_cents: 12100,
              refunded_cents: refunded ? 12100 : 0,
              original_invoice_number: invoice.invoice_number,
              lines: [],
            },
          ]
        : [],
      refunds: {
        total: refunded ? 1 : 0,
        items: refunded
          ? [
              {
                id: 'r1',
                credit_note_number: 'CN-2026-0001',
                refund_date: '2026-10-27',
                amount_cents: 12100,
                reference: 'Bank retour 42',
              },
            ]
          : [],
      },
    }
    const data = {
      '/auth/me': dashboardUser,
      '/administrations': [dashboardAdministration],
      '/me/subscription': { can_use_pro_features: true },
      '/zzp/dashboard': dashboardSummary,
      '/zzp/dashboard/monthly-invoices': dashboardMonths,
      '/zzp/invoices': { invoices: [invoice], total: 1 },
      '/zzp/invoices/i1': {
        ...invoice,
        credited_cents: summary.credited_cents,
        refunded_cents: summary.refunded_cents,
      },
      '/zzp/customers': {
        customers: [{ id: 'c1', name: 'Example BV', status: 'active' }],
        total: 1,
      },
      '/zzp/profile': {
        company_name: 'Studio de Vries',
        kvk_number: '12345678',
        btw_number: 'NL123456789B01',
        iban: 'NL91ABNA0417164300',
      },
      '/zzp/invoices/i1/credits': summary,
    }[path]
    await route.fulfill({
      status: data !== undefined ? 200 : 404,
      json: data || {},
    })
  })
  await page.goto('/tests/styles/dashboard.html')
  await expect(page.getByText('1 factuur te laat')).toBeVisible()
  await page.evaluate(() => {
    history.pushState({}, '', '/zzp/invoices/i1')
    window.dispatchEvent(new Event('app:route-change'))
  })
  const section = page.getByRole('region', {
    name: 'Creditnota’s en terugbetalingen',
  })
  await expect(section).toBeVisible()
  const issue = section.getByRole('button', { name: 'Creditnota uitgeven' })
  await expect(issue).toBeDisabled()
  await section.getByLabel('Te crediteren: Ontwerpwerk').fill('3')
  await expect(
    section.getByText('Controleer de hoeveelheden;', { exact: false }),
  ).toBeVisible()
  await section.getByLabel('Te crediteren: Ontwerpwerk').fill('1')
  await section.getByLabel('Reden', { exact: true }).fill('Retour afgesproken')
  await expect(
    section.getByText('Creditbedrag inclusief btw:', { exact: false }),
  ).toContainText('121,00')
  await section.getByRole('checkbox', { name: /Ik heb de regels/ }).check()
  await issue.click()
  await expect(section.getByRole('status').filter({ hasText: 'uitgegeven' })).toContainText(
    'Creditnota CN-2026-0001 uitgegeven',
  )
  await section.getByRole('combobox', { name: 'Creditnota', exact: true }).selectOption('cn1')
  await section.getByLabel('Terugbetaald bedrag in euro').fill('121,01')
  await section.getByLabel('Betalingskenmerk').fill('Bank retour 42')
  await section
    .getByRole('checkbox', { name: /Deze terugbetaling is werkelijk/ })
    .check()
  const register = section.getByRole('button', {
    name: 'Terugbetaling registreren',
  })
  await expect(register).toBeDisabled()
  await section.getByLabel('Terugbetaald bedrag in euro').fill('121,00')
  await register.click()
  await expect(
    section.getByText('Bank retour 42', { exact: true }),
  ).toBeVisible()
  const download = page.waitForEvent('download')
  await section
    .getByRole('button', { name: 'PDF creditnota CN-2026-0001' })
    .click()
  expect((await download).suggestedFilename()).toBe('CN-2026-0001.pdf')
  expect(writes).toHaveLength(2)
  expect(writes[0].key).toBeTruthy()
  expect(writes[1].payload.amount_cents).toBe(12100)
  expect(errors).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await section.screenshot({ path: testInfo.outputPath('credit-history.png') })
})
