import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChartBar, WarningCircle, FileText, Receipt, ArrowsClockwise, Bank, UsersThree } from '@phosphor-icons/react'
import { logApiError, zzpApi, zzpBtwApi, zzpIncomeTaxApi } from '@/lib/api'
import type { BTWQuarterOverview, IncomeTaxYearOverview, ZZPInvoice } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'

type TransactionsSummary = {
  total: number
  matched: number
  unmatched: number
  needs_review: number
}

type ClientRevenueItem = {
  customer_id: string
  customer_name: string
  revenue_cents: number
  paid_invoice_count: number
}

const formatCurrency = (cents: number): string => {
  const euros = cents / 100
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(euros)
}

const getDateRangeForYear = (year: number): { from: string; to: string } => ({
  from: `${year}-01-01`,
  to: `${year}-12-31`,
})

const buildClientRevenue = (invoices: ZZPInvoice[]): ClientRevenueItem[] => {
  const buckets = new Map<string, ClientRevenueItem>()
  for (const invoice of invoices) {
    const key = invoice.customer_id || `unknown:${invoice.customer_name || 'Onbekend'}`
    const existing = buckets.get(key)
    if (existing) {
      existing.revenue_cents += invoice.subtotal_cents || 0
      existing.paid_invoice_count += 1
      continue
    }
    buckets.set(key, {
      customer_id: invoice.customer_id || '',
      customer_name: invoice.customer_name || 'Onbekende klant',
      revenue_cents: invoice.subtotal_cents || 0,
      paid_invoice_count: 1,
    })
  }

  return [...buckets.values()]
    .sort((a, b) => b.revenue_cents - a.revenue_cents)
    .slice(0, 5)
}

export const BelastinghulpJaaroverzichtPage = () => {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number>(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>(
    Array.from({ length: 5 }, (_, i) => currentYear - i),
  )
  const [overview, setOverview] = useState<IncomeTaxYearOverview | null>(null)
  const [vatSnapshots, setVatSnapshots] = useState<Array<BTWQuarterOverview | null>>([])
  const [transactions, setTransactions] = useState<TransactionsSummary | null>(null)
  const [topClients, setTopClients] = useState<ClientRevenueItem[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (targetYear: number) => {
    setLoading(true)
    setError(null)
    const sourceWarnings: string[] = []

    try {
      const incomeTax = await zzpIncomeTaxApi.getOverview(targetYear)
      setOverview(incomeTax.overview)
      if (incomeTax.available_years.length > 0) {
        setAvailableYears(incomeTax.available_years)
      }
      sourceWarnings.push(...incomeTax.overview.warnings.map((w) => w.title))
    } catch (err) {
      logApiError('Failed to load jaaroverzicht income-tax data', err, {
        route: 'BelastinghulpJaaroverzichtPage',
        endpoint: '/zzp/income-tax',
      })
      setOverview(null)
      setError('Het jaaroverzicht kon niet volledig worden geladen. Probeer het opnieuw.')
    }

    const vatResults = await Promise.all(
      [1, 2, 3, 4].map(async (quarter) => {
        try {
          const result = await zzpBtwApi.getOverview(targetYear, quarter)
          sourceWarnings.push(...result.current_quarter.warnings.map((w) => `${result.current_quarter.quarter}: ${w.title}`))
          return result.current_quarter
        } catch {
          sourceWarnings.push(`BTW-snapshot voor Q${quarter} kon niet worden geladen.`)
          return null
        }
      }),
    )
    setVatSnapshots(vatResults)

    try {
      const dateRange = getDateRangeForYear(targetYear)
      const [matched, unmatched, needsReview] = await Promise.all([
        zzpApi.bank.listTransactions({ status: 'MATCHED', date_from: dateRange.from, date_to: dateRange.to, page_size: 1, page: 1 }),
        zzpApi.bank.listTransactions({ status: 'NEW', date_from: dateRange.from, date_to: dateRange.to, page_size: 1, page: 1 }),
        zzpApi.bank.listTransactions({ status: 'NEEDS_REVIEW', date_from: dateRange.from, date_to: dateRange.to, page_size: 1, page: 1 }),
      ])
      setTransactions({
        matched: matched.total,
        unmatched: unmatched.total,
        needs_review: needsReview.total,
        total: matched.total + unmatched.total + needsReview.total,
      })
    } catch {
      sourceWarnings.push('Transactiesamenvatting is tijdelijk niet beschikbaar.')
      setTransactions(null)
    }

    try {
      const dateRange = getDateRangeForYear(targetYear)
      const paidInvoices = await zzpApi.invoices.list({
        status: 'paid',
        from_date: dateRange.from,
        to_date: dateRange.to,
      })
      setTopClients(buildClientRevenue(paidInvoices.invoices))
    } catch {
      sourceWarnings.push('Klantomzet kon niet worden berekend.')
      setTopClients([])
    }

    setWarnings(sourceWarnings)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadData(year)
  }, [loadData, year])

  const totalVatNetCents = useMemo(
    () => vatSnapshots.reduce((acc, quarter) => acc + (quarter?.net_vat_cents || 0), 0),
    [vatSnapshots],
  )

  return (
    <div className="space-y-6" data-testid="belastinghulp-jaaroverzicht-page">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jaaroverzicht</h1>
          <p className="text-muted-foreground mt-1">
            Samenvatting van omzet, kosten, BTW en transacties voor {year}.
          </p>
        </div>
        <div className="w-full md:w-44">
          <p className="text-xs text-muted-foreground mb-1">Boekjaar</p>
          <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((item) => (
                <SelectItem key={item} value={String(item)}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <WarningCircle size={16} />
          <AlertTitle>Niet alles kon geladen worden</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Jaarcijfers</CardTitle>
          <CardDescription>Belangrijkste bedragen voor je aangiftevoorbereiding</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, idx) => <Skeleton key={idx} className="h-28 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <button className="rounded-lg border p-4 text-left cursor-pointer hover:bg-muted/40" onClick={() => navigateTo('/zzp/invoices?status=paid')}>
                <p className="text-sm text-muted-foreground">Totale omzet</p>
                <p className="text-2xl font-semibold mt-1">{formatCurrency(overview?.omzet_cents || 0)}</p>
                <p className="text-xs text-muted-foreground mt-2">Bron: betaalde facturen</p>
              </button>
              <button className="rounded-lg border p-4 text-left cursor-pointer hover:bg-muted/40" onClick={() => navigateTo('/zzp/expenses')}>
                <p className="text-sm text-muted-foreground">Totale kosten</p>
                <p className="text-2xl font-semibold mt-1">{formatCurrency(overview?.kosten_cents || 0)}</p>
                <p className="text-xs text-muted-foreground mt-2">Bron: geregistreerde uitgaven</p>
              </button>
              <button className="rounded-lg border p-4 text-left cursor-pointer hover:bg-muted/40" onClick={() => navigateTo('/zzp/belastinghulp/inkomstenbelasting')}>
                <p className="text-sm text-muted-foreground">Geschatte winst</p>
                <p className="text-2xl font-semibold mt-1">{formatCurrency(overview?.winst_cents || 0)}</p>
                <p className="text-xs text-muted-foreground mt-2">Omzet minus kosten</p>
              </button>
              <button className="rounded-lg border p-4 text-left cursor-pointer hover:bg-muted/40" onClick={() => navigateTo('/zzp/belastinghulp/btw')}>
                <p className="text-sm text-muted-foreground">BTW saldo (jaar)</p>
                <p className="text-2xl font-semibold mt-1">{formatCurrency(totalVatNetCents)}</p>
                <p className="text-xs text-muted-foreground mt-2">Som van kwartaal-berekeningen</p>
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChartBar size={18} weight="duotone" />
            Kwartaal BTW snapshots
          </CardTitle>
          <CardDescription>Per kwartaal: omzet, voorbelasting en netto BTW</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((quarter, idx) => {
              const snapshot = vatSnapshots[idx]
              if (!snapshot) {
                return (
                  <div key={quarter} className="rounded-lg border border-dashed p-4">
                    <p className="font-medium">Q{quarter} {year}</p>
                    <p className="text-sm text-muted-foreground mt-2">Niet beschikbaar</p>
                  </div>
                )
              }

              return (
                <button
                  key={quarter}
                  className="rounded-lg border p-4 text-left cursor-pointer hover:bg-muted/40"
                  onClick={() => navigateTo(`/zzp/belastinghulp/btw?year=${year}&quarter=${quarter}`)}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{snapshot.quarter}</p>
                    {!snapshot.is_ready && <Badge variant="secondary">Controle nodig</Badge>}
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Omzet</span>
                      <span>{formatCurrency(snapshot.omzet_cents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Voorbelasting</span>
                      <span>{formatCurrency(snapshot.input_vat_cents)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Netto BTW</span>
                      <span>{formatCurrency(snapshot.net_vat_cents)}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bank size={18} weight="duotone" />
              Transacties
            </CardTitle>
            <CardDescription>Jaarstatus van gekoppelde banktransacties</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {transactions ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Totaal</span><span className="font-medium">{transactions.total}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Gematcht</span><span>{transactions.matched}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Niet gekoppeld</span><span>{transactions.unmatched}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Nog te beoordelen</span><span>{transactions.needs_review}</span></div>
              </>
            ) : (
              <p className="text-muted-foreground">Nog geen transactiesamenvatting beschikbaar.</p>
            )}
            <Button variant="link" className="h-auto px-0" onClick={() => navigateTo('/zzp/bank')}>
              Naar banktransacties
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersThree size={18} weight="duotone" />
              Omzet per klant
            </CardTitle>
            <CardDescription>Top klanten op basis van betaalde facturen in {year}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen klantomzet beschikbaar.</p>
            ) : (
              topClients.map((client) => (
                <button
                  key={`${client.customer_id}-${client.customer_name}`}
                  className="w-full rounded border px-3 py-2 text-left hover:bg-muted/40"
                  onClick={() => navigateTo(client.customer_id ? `/zzp/invoices?customer_id=${client.customer_id}&status=paid` : '/zzp/invoices?status=paid')}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{client.customer_name}</span>
                    <span>{formatCurrency(client.revenue_cents)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{client.paid_invoice_count} betaalde facturen</p>
                </button>
              ))
            )}
            <Button variant="link" className="h-auto px-0" onClick={() => navigateTo('/zzp/customers')}>
              Naar klanten
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Waarschuwingen voor ontbrekende data</CardTitle>
          <CardDescription>Controlepunten voordat je aangifte voorbereidt</CardDescription>
        </CardHeader>
        <CardContent>
          {warnings.length === 0 ? (
            <div className="rounded-lg border bg-green-50/40 dark:bg-green-950/20 p-3 text-sm">
              Geen opvallende ontbrekende gegevens gevonden.
            </div>
          ) : (
            <div className="space-y-2">
              {warnings.slice(0, 8).map((item, idx) => (
                <div key={`${item}-${idx}`} className="rounded-lg border p-3 text-sm flex items-start gap-2">
                  <WarningCircle size={16} className="mt-0.5 text-amber-500 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/invoices')}>
              <FileText size={14} className="mr-1" /> Facturen
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/expenses')}>
              <Receipt size={14} className="mr-1" /> Uitgaven
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/belastinghulp/btw')}>
              <ArrowsClockwise size={14} className="mr-1" /> BTW
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
