import { test, expect } from '@playwright/test'
import {
  dashboardUser,
  dashboardAdministration,
  dashboardSummary,
  dashboardMonths,
} from '../fixtures/dashboard'

for (const basis of ['factuurstelsel', 'kasstelsel'] as const) {
  test(`VAT confirmation and reference export on ${basis}`, async ({
    page,
  }, testInfo) => {
    let policy: {
      basis: string
      effective_from: string
      confirmed_at: string
    } | null = null
    const requests: unknown[] = []
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'fixture')
      localStorage.setItem('pwa_ios_install_dismissed', String(Date.now()))
    })
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname.replace('/api/v1', '')
      if (path === '/zzp/btw-policy' && route.request().method() === 'PUT') {
        const payload = route.request().postDataJSON()
        requests.push(payload)
        policy = {
          basis: payload.basis,
          effective_from: payload.effective_from,
          confirmed_at: new Date().toISOString(),
        }
        await route.fulfill({ json: policy })
        return
      }
      if (path === '/zzp/btw-aangifte/xml') {
        await route.fulfill({
          contentType: 'application/xml',
          headers: {
            'Content-Disposition': 'attachment; filename="btw-reference.xml"',
            'Access-Control-Expose-Headers': 'Content-Disposition',
          },
          body: '<ZZPBTWReference submitted="false" purpose="reference-only-not-a-tax-return"/>',
        })
        return
      }
      const net = policy
        ? policy.basis === 'factuurstelsel'
          ? 10000
          : 5000
        : 0
      const vat = policy ? (policy.basis === 'factuurstelsel' ? 2100 : 1050) : 0
      const overview = {
        quarter: 'Q4 2026',
        quarter_start: '2026-10-01',
        quarter_end: '2026-12-31',
        deadline: '2027-01-31',
        days_until_deadline: 90,
        basis: policy?.basis || 'unconfirmed',
        policy_confirmed: !!policy,
        recognized_invoice_count: policy ? 1 : 0,
        submission_available: false,
        omzet_cents: net,
        output_vat_cents: vat,
        input_vat_cents: 0,
        net_vat_cents: vat,
        unpaid_vat_cents: 1050,
        invoice_summary: {
          total_count: 1,
          paid_count: 0,
          sent_count: 1,
          draft_count: 0,
          total_omzet_cents: net,
          total_vat_cents: vat,
        },
        expense_summary: {
          total_count: 0,
          total_amount_cents: 0,
          total_vat_deductible_cents: 0,
        },
        vat_rate_breakdown: [
          {
            vat_rate: '21',
            omzet_cents: net,
            vat_cents: vat,
            transaction_count: 1,
          },
        ],
        warnings: [],
        is_ready: !!policy,
        readiness_notes: [
          'Dit overzicht is een voorbereiding, geen ingediende aangifte.',
        ],
        data_status: policy ? 'ONLY_INVOICES' : 'ONLY_UNPAID',
        data_status_reason: 'Verkoopbedragen aanwezig',
        generated_at: new Date().toISOString(),
      }
      const data = {
        '/auth/me': dashboardUser,
        '/administrations': [dashboardAdministration],
        '/me/subscription': { can_use_pro_features: false },
        '/zzp/dashboard': dashboardSummary,
        '/zzp/dashboard/monthly-invoices': dashboardMonths,
        '/zzp/btw-aangifte': {
          current_quarter: overview,
          previous_quarters: [],
          profile_complete: true,
          btw_number: 'NL123456789B01',
          vat_policy: policy,
        },
      }[path]
      await route.fulfill({ status: data ? 200 : 404, json: data || {} })
    })
    await page.goto('/tests/styles/dashboard.html')
    await page.getByRole('link', { name: 'Naar het btw-overzicht' }).click()
    await expect(
      page.getByRole('heading', { name: 'BTW-stelsel bevestigen' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Download referentie-XML' }),
    ).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('basis-confirmation.png'),
      fullPage: true,
    })
    await expect(
      page.getByRole('heading', { name: 'BTW-stelsel bevestigen' }),
    ).toBeInViewport()
    await page.getByLabel('Stelsel', { exact: true }).selectOption(basis)
    const confirm = page.getByRole('button', { name: /Bevestigen vanaf Q/ })
    await expect(confirm).toBeDisabled()
    await page.getByRole('checkbox').check()
    await confirm.click()
    await expect(
      page.getByRole('heading', { name: 'Beschikbaar voor controle' }),
    ).toBeVisible()
    await expect(
      page.getByText('Verkoop-btw:', { exact: false }),
    ).toContainText(basis === 'factuurstelsel' ? '21,00' : '10,50')
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ basis, acknowledge: true })
    await expect(
      page.getByText('Klaar om in te dienen', { exact: true }),
    ).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download referentie-XML' }).click()
    expect((await download).suggestedFilename()).toBe('btw-reference.xml')
    await page.screenshot({
      path: testInfo.outputPath(`${basis}.png`),
      fullPage: true,
    })
  })
}
