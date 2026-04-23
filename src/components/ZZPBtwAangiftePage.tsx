/**
 * ZZP BTW Overzicht Page
 *
 * Self-service quarterly VAT overview for ZZP users.
 * Shows the key "af te dragen" number prominently, quarterly breakdown,
 * warnings, and download options (XML + JSON + print).
 *
 * Calm, simple, self-service oriented UI for non-accountants.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PageContainer, PageHeader } from '@/components/ui/page'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Calculator,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  WarningCircle,
  FileText,
  Receipt,
  CurrencyEur,
  CalendarBlank,
  DownloadSimple,
  Printer,
  FileXls,
  CaretRight,
  ArrowsClockwise,
  Sparkle,
} from '@phosphor-icons/react'
import { zzpBtwApi, logApiError } from '@/lib/api'
import type { BTWAangifteResponse, BTWQuarterOverview } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import {
  formatCurrency,
  formatCurrencyAbs,
  TaxWarningItem,
  SoftNote,
  IconChip,
  Disclaimer,
  sectionCardClass,
} from '@/components/belastinghulp/shared'
import { toast } from 'sonner'

// ============================================================================
// Constants
// ============================================================================

const QUARTER_MONTHS: Record<number, string> = {
  1: 'jan – mrt',
  2: 'apr – jun',
  3: 'jul – sep',
  4: 'okt – dec',
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Explanation tooltip block (kept as a thin wrapper for back-compat with
 * the local props used inside this page; visually a soft Agenda-style
 * note via the shared `SoftNote` primitive).
 */
const ExplainBlock = ({
  title,
  description,
  source,
  checkHint,
}: {
  title: string
  description: string
  source?: string
  checkHint?: string
}) => (
  <SoftNote
    tone="info"
    size="sm"
    title={title}
    description={description}
    source={source}
    checkHint={checkHint}
  />
)

/** Big number stat card */
const StatCard = ({
  label,
  value,
  subtitle,
  icon,
  variant = 'default',
  explainTitle,
  explainDescription,
  explainSource,
  explainCheck,
}: {
  label: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  variant?: 'default' | 'positive' | 'negative' | 'neutral'
  explainTitle?: string
  explainDescription?: string
  explainSource?: string
  explainCheck?: string
}) => {
  const colorMap = {
    default: 'text-foreground',
    positive: 'text-green-600 dark:text-green-400',
    negative: 'text-red-600 dark:text-red-400',
    neutral: 'text-muted-foreground',
  }

  return (
    <Card className={cn(sectionCardClass, 'relative overflow-hidden transition-colors hover:border-primary/30')}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <IconChip icon={icon} tone="tip" size="sm" />
          <span>{label}</span>
        </div>
        <p className={`text-2xl font-bold ${colorMap[variant]}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {explainTitle && (
          <ExplainBlock
            title={explainTitle}
            description={explainDescription || ''}
            source={explainSource}
            checkHint={explainCheck}
          />
        )}
      </CardContent>
    </Card>
  )
}

/** Hero card: prominent "af te dragen" number */
const HeroCard = ({ overview, quarterMonths }: { overview: BTWQuarterOverview; quarterMonths: string }) => {
  const isPayable = overview.net_vat_cents >= 0
  const label = isPayable ? 'BTW af te dragen' : 'BTW terug te vragen'
  const accentText = isPayable
    ? 'text-red-500 dark:text-red-300'
    : 'text-emerald-500 dark:text-emerald-300'
  const accentStripe = isPayable
    ? 'border-l-red-500/70 dark:border-l-red-400/60'
    : 'border-l-emerald-500/70 dark:border-l-emerald-400/60'

  return (
    <Card
      className={cn(
        sectionCardClass,
        'overflow-hidden border-l-4 transition-colors hover:border-primary/30',
        accentStripe,
      )}
    >
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">{overview.quarter}</h2>
              <span className="text-sm text-muted-foreground">({quarterMonths})</span>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 cursor-help"
                    >
                      Voorlopig · {overview.basis === 'kasstelsel' ? 'kasstelsel' : overview.basis}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Berekend op {overview.basis === 'kasstelsel' ? 'kasstelsel (cash basis)' : overview.basis}: alleen
                    betaalde facturen tellen mee voor de af te dragen BTW. Het bedrag is voorlopig totdat je de
                    aangifte indient bij de Belastingdienst.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn('text-4xl sm:text-5xl font-bold tracking-tight', accentText)}>
              {formatCurrencyAbs(overview.net_vat_cents)}
            </p>
          </div>
          <div className="text-sm text-muted-foreground space-y-1 sm:text-right">
            <p>
              BTW ontvangen: <span className="font-medium text-foreground">{formatCurrency(overview.output_vat_cents)}</span>
            </p>
            <p>
              Voorbelasting: <span className="font-medium text-emerald-600 dark:text-emerald-300">−{formatCurrencyAbs(overview.input_vat_cents)}</span>
            </p>
            <Separator className="my-2 bg-border/40" />
            <p className="font-medium text-foreground">
              {isPayable ? 'Te betalen' : 'Terug te vragen'}: {formatCurrencyAbs(overview.net_vat_cents)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Banner that explains *why* the headline number looks the way it does
 * when the quarter has only partial data (e.g. only drafts, only unpaid
 * invoices, no expenses…).  Visible above the metric cards so the user
 * understands the connection to the rest of their data.
 */
const PartialStateBanner = ({ overview }: { overview: BTWQuarterOverview }) => {
  if (overview.data_status === 'COMPLETE' || overview.data_status === 'NO_DATA') {
    return null
  }

  const linkFor = (
    label: string,
    route: string,
  ) => (
    <Button
      variant="link"
      size="sm"
      className="h-auto p-0 text-xs"
      onClick={() => navigateTo(route)}
    >
      {label} <CaretRight size={12} className="ml-0.5" />
    </Button>
  )

  let cta: React.ReactNode = null
  switch (overview.data_status) {
    case 'ONLY_DRAFTS':
      cta = linkFor('Naar conceptfacturen', '/zzp/invoices?status=draft')
      break
    case 'ONLY_UNPAID':
      cta = linkFor('Naar openstaande facturen', '/zzp/invoices?status=sent')
      break
    case 'ONLY_INVOICES':
      cta = linkFor('Voeg uitgaven toe', '/zzp/expenses')
      break
    case 'ONLY_EXPENSES':
      cta = linkFor('Naar facturen', '/zzp/invoices')
      break
  }

  return (
    <SoftNote
      tone="warning"
      title="Onvolledige BTW-basis"
      description={overview.data_status_reason}
    >
      {overview.unpaid_vat_cents > 0 && overview.data_status !== 'ONLY_INVOICES' && (
        <p className="text-xs text-muted-foreground">
          Op verstuurde, nog niet betaalde facturen staat <span className="font-medium text-foreground">{formatCurrency(overview.unpaid_vat_cents)}</span>{' '}
          aan BTW open – dit telt op kasstelsel pas mee zodra de betaling binnenkomt.
        </p>
      )}
      {cta}
    </SoftNote>
  )
}

/**
 * Dedicated empty state for quarters that genuinely contain nothing.
 * Replaces the misleading "€ 0,00 BTW af te dragen" hero with a clear
 * explanation and direct CTAs into the data-entry flows.
 *
 * Also surfaces any backend warnings (notably ERROR-severity warnings
 * coming from the route fallback) so a server-side failure isn't
 * silently displayed as "no data".
 */
const EmptyQuarterCard = ({
  overview,
  quarterMonths,
}: {
  overview: BTWQuarterOverview
  quarterMonths: string
}) => {
  const isError = overview.data_status === 'ERROR'
  const errorWarnings = overview.warnings.filter((w) => w.severity === 'error')
  return (
    <Card
      className={cn(
        'bg-card/80 backdrop-blur-sm border-2 border-dashed transition-colors',
        isError ? 'border-red-500/30' : 'border-primary/20',
      )}
    >
      <CardContent className="p-6 sm:p-8 text-center space-y-4">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">{overview.quarter}</h2>
          <span className="text-sm text-muted-foreground">({quarterMonths})</span>
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              isError && 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
            )}
          >
            {isError ? 'Fout bij berekenen' : 'Nog niets te declareren'}
          </Badge>
        </div>
        <div className="flex justify-center">
          <IconChip
            icon={
              isError ? (
                <WarningCircle size={32} weight="duotone" />
              ) : (
                <Calculator size={32} weight="duotone" />
              )
            }
            tone={isError ? 'error' : 'neutral'}
            size="lg"
          />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <p className="text-sm font-medium">
            {isError
              ? 'Het BTW-overzicht kon niet worden berekend'
              : 'Geen facturen of uitgaven in dit kwartaal'}
          </p>
          <p className="text-xs text-muted-foreground">
            {overview.data_status_reason ||
              (isError
                ? 'Probeer het later opnieuw of neem contact op met support.'
                : 'Voeg facturen of zakelijke uitgaven toe om de BTW-berekening te starten.')}
          </p>
        </div>

        {errorWarnings.length > 0 && (
          <div className="space-y-2 max-w-md mx-auto text-left">
            {errorWarnings.map((w) => (
              <TaxWarningItem key={w.id} warning={w} />
            ))}
          </div>
        )}

        {!isError && (
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <Button size="sm" onClick={() => navigateTo('/zzp/invoices')}>
              <FileText size={16} className="mr-1" />
              Maak een factuur
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/expenses')}>
              <Receipt size={16} className="mr-1" />
              Voeg uitgave toe
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Lists the concrete data sources behind the BTW numbers, with deep links.
 * Makes the page feel connected to the rest of the product instead of an
 * isolated card with totals.
 */
const SourcesPanel = ({ overview }: { overview: BTWQuarterOverview }) => {
  const items: Array<{
    icon: React.ReactNode
    title: string
    detail: string
    route: string
    cta: string
  }> = [
    {
      icon: <FileText size={16} weight="duotone" />,
      title: 'Betaalde facturen',
      detail:
        overview.invoice_summary.paid_count > 0
          ? `${overview.invoice_summary.paid_count} factuur${overview.invoice_summary.paid_count !== 1 ? 'en' : ''} · ${formatCurrency(overview.invoice_summary.total_omzet_cents)} omzet`
          : 'Geen betaalde facturen in dit kwartaal',
      route: '/zzp/invoices?status=paid',
      cta: 'Bekijk facturen',
    },
    {
      icon: <Receipt size={16} weight="duotone" />,
      title: 'Zakelijke uitgaven',
      detail:
        overview.expense_summary.total_count > 0
          ? `${overview.expense_summary.total_count} uitgave${overview.expense_summary.total_count !== 1 ? 'n' : ''} · ${formatCurrency(overview.expense_summary.total_vat_deductible_cents)} aftrekbare BTW`
          : 'Geen geregistreerde uitgaven in dit kwartaal',
      route: '/zzp/expenses',
      cta: 'Bekijk uitgaven',
    },
  ]

  if (overview.invoice_summary.sent_count > 0) {
    items.push({
      icon: <CurrencyEur size={16} weight="duotone" />,
      title: 'Openstaande facturen',
      detail: `${overview.invoice_summary.sent_count} factuur${overview.invoice_summary.sent_count !== 1 ? 'en' : ''} · ${formatCurrency(overview.unpaid_vat_cents)} BTW (telt nog niet mee op kasstelsel)`,
      route: '/zzp/invoices?status=sent',
      cta: 'Bekijk openstaand',
    })
  }

  return (
    <Card className={cn(sectionCardClass)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <IconChip icon={<Sparkle size={16} weight="duotone" />} tone="tip" size="sm" />
          Bronnen in dit overzicht
        </CardTitle>
        <CardDescription className="text-xs">
          De BTW-berekening komt rechtstreeks uit deze onderdelen van je administratie.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((item) => (
          <div
            key={item.title}
            className="flex items-start justify-between gap-3 py-2 border-b border-border/40 last:border-b-0"
          >
            <div className="flex items-start gap-3 min-w-0">
              <IconChip icon={item.icon} tone="tip" size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs flex-shrink-0 text-primary hover:text-primary"
              onClick={() => navigateTo(item.route)}
            >
              {item.cta}
              <CaretRight size={12} className="ml-0.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * Compact comparison strip with the most recent previous quarters.
 * Clicking a quarter switches the page to that period.  This grounds the
 * current number in historical context and stops the page from feeling
 * like a single isolated card.
 */
const PreviousQuartersStrip = ({
  quarters,
  onSelect,
}: {
  quarters: BTWQuarterOverview[]
  onSelect: (year: number, quarter: number) => void
}) => {
  if (!quarters.length) return null

  return (
    <Card className={cn(sectionCardClass)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <IconChip icon={<ArrowsClockwise size={16} weight="duotone" />} tone="tip" size="sm" />
          Eerdere kwartalen
        </CardTitle>
        <CardDescription className="text-xs">
          Klik om een kwartaal te openen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {quarters.map((q) => {
            const match = q.quarter.match(/Q(\d)\s+(\d{4})/)
            const qNum = match ? Number(match[1]) : null
            const yNum = match ? Number(match[2]) : null
            const isPayable = q.net_vat_cents >= 0
            const isEmpty = q.data_status === 'NO_DATA'
            return (
              <button
                key={q.quarter}
                type="button"
                onClick={() => qNum && yNum && onSelect(yNum, qNum)}
                className="text-left rounded-lg border border-border/50 bg-card/60 p-3 hover:border-primary/30 hover:bg-card/80 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{q.quarter}</p>
                  {isEmpty ? (
                    <Badge variant="outline" className="text-[10px] border-border/50">leeg</Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        isPayable
                          ? 'text-red-600 dark:text-red-300 border-red-500/30 bg-red-500/5'
                          : 'text-emerald-600 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/5',
                      )}
                    >
                      {isPayable ? 'af te dragen' : 'terug'}
                    </Badge>
                  )}
                </div>
                <p
                  className={cn(
                    'text-base font-semibold mt-1',
                    isEmpty
                      ? 'text-muted-foreground'
                      : isPayable
                        ? 'text-red-500 dark:text-red-300'
                        : 'text-emerald-500 dark:text-emerald-300',
                  )}
                >
                  {isEmpty ? '—' : formatCurrencyAbs(q.net_vat_cents)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {q.invoice_summary.paid_count} betaald · {q.expense_summary.total_count} uitgaven
                </p>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/** Quarter overview detail section */
const QuarterDetail = ({
  overview,
  showExplanations = true,
  selectedYear,
  selectedQuarter,
}: {
  overview: BTWQuarterOverview
  showExplanations?: boolean
  selectedYear?: number
  selectedQuarter?: number
}) => {
  const [downloadingXml, setDownloadingXml] = useState(false)

  const handleDownloadXml = async () => {
    setDownloadingXml(true)
    try {
      await zzpBtwApi.downloadXml(selectedYear, selectedQuarter)
      toast.success('XML gedownload')
    } catch (err) {
      logApiError(err, 'BTW XML download')
      toast.error('Fout bij downloaden van XML')
    } finally {
      setDownloadingXml(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Key metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Omzet (ex. BTW)"
          value={formatCurrency(overview.omzet_cents)}
          subtitle={`${overview.invoice_summary.paid_count} betaalde facturen`}
          icon={<CurrencyEur size={18} weight="duotone" />}
          explainTitle={showExplanations ? 'Wat is dit?' : undefined}
          explainDescription="Je totale omzet exclusief BTW, berekend uit betaalde facturen dit kwartaal."
          explainSource="Betaalde facturen (subtotaal)"
          explainCheck="Klopt het aantal facturen? Zijn alle betalingen bijgewerkt?"
        />
        <StatCard
          label="Af te dragen BTW"
          value={formatCurrency(overview.output_vat_cents)}
          subtitle={
            overview.unpaid_vat_cents > 0
              ? `BTW gefactureerd · nog ${formatCurrency(overview.unpaid_vat_cents)} open op verstuurde facturen`
              : 'BTW die je hebt gefactureerd'
          }
          icon={<ArrowUp size={18} weight="bold" className="text-red-500" />}
          variant="negative"
          explainTitle={showExplanations ? 'Wat is dit?' : undefined}
          explainDescription="De BTW die je op facturen aan klanten hebt berekend. Dit bedrag moet je afdragen aan de Belastingdienst."
          explainSource="BTW-bedrag op betaalde facturen"
          explainCheck="Zijn alle facturen met het juiste BTW-tarief aangemaakt?"
        />
        <StatCard
          label="Voorbelasting (aftrekbaar)"
          value={formatCurrency(overview.input_vat_cents)}
          subtitle={`${overview.expense_summary.total_count} uitgaven`}
          icon={<ArrowDown size={18} weight="bold" className="text-green-500" />}
          variant="positive"
          explainTitle={showExplanations ? 'Wat is dit?' : undefined}
          explainDescription="De BTW die je zelf hebt betaald op zakelijke uitgaven. Dit mag je aftrekken van de af te dragen BTW."
          explainSource="BTW op geregistreerde uitgaven"
          explainCheck="Heb je alle bonnetjes en facturen van leveranciers ingevoerd?"
        />
      </div>

      {/* VAT rate breakdown */}
      {overview.vat_rate_breakdown.length > 0 && (
        <Card className={cn(sectionCardClass)}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <IconChip icon={<Calculator size={16} weight="duotone" />} tone="tip" size="sm" />
              BTW-tarief verdeling
            </CardTitle>
            <CardDescription>Uitsplitsing per BTW-tarief</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {overview.vat_rate_breakdown.map((item) => (
                <div key={item.vat_rate} className="flex items-center justify-between py-2 border-b border-border/40 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="min-w-[60px] justify-center bg-primary/5 border-primary/20">{item.vat_rate}%</Badge>
                    <span className="text-sm text-muted-foreground">{item.transaction_count} transacties</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatCurrency(item.omzet_cents)} omzet</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.vat_cents)} BTW</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data sources summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className={cn(sectionCardClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <IconChip icon={<FileText size={16} weight="duotone" />} tone="tip" size="sm" />
              Facturen
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Betaald</span>
              <span className="font-medium">{overview.invoice_summary.paid_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Openstaand</span>
              <span>{overview.invoice_summary.sent_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Concept</span>
              <span>{overview.invoice_summary.draft_count}</span>
            </div>
            <Separator className="my-2 bg-border/40" />
            <div className="flex justify-between font-medium">
              <span>Totaal omzet</span>
              <span>{formatCurrency(overview.invoice_summary.total_omzet_cents)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(sectionCardClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <IconChip icon={<Receipt size={16} weight="duotone" />} tone="tip" size="sm" />
              Uitgaven
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Aantal</span>
              <span className="font-medium">{overview.expense_summary.total_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Totaal bedrag</span>
              <span>{formatCurrency(overview.expense_summary.total_amount_cents)}</span>
            </div>
            <Separator className="my-2 bg-border/40" />
            <div className="flex justify-between font-medium">
              <span>Aftrekbare BTW</span>
              <span className="text-emerald-600 dark:text-emerald-300">{formatCurrency(overview.expense_summary.total_vat_deductible_cents)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warnings */}
      {overview.warnings.length > 0 && (
        <Card className={cn(sectionCardClass)}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <IconChip icon={<WarningCircle size={16} weight="duotone" />} tone="warning" size="sm" />
              Aandachtspunten
            </CardTitle>
            <CardDescription>Controleer deze punten voor je aangifte</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.warnings.map((warning) => (
              <TaxWarningItem key={warning.id} warning={warning} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Ready to submit card */}
      <Card
        className={cn(
          sectionCardClass,
          'border-l-4',
          overview.is_ready
            ? 'border-l-emerald-500/70 dark:border-l-emerald-400/60'
            : 'border-l-amber-500/70 dark:border-l-amber-400/60',
        )}
      >
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <IconChip
              icon={
                overview.is_ready
                  ? <CheckCircle size={24} weight="duotone" />
                  : <WarningCircle size={24} weight="duotone" />
              }
              tone={overview.is_ready ? 'success' : 'warning'}
              size="lg"
            />
            <div className="flex-1 space-y-2">
              <h3 className="text-lg font-semibold">
                {overview.is_ready ? 'Klaar om in te dienen' : 'Nog niet compleet'}
              </h3>
              <div className="space-y-1">
                {overview.readiness_notes.map((note, i) => (
                  <p key={i} className="text-sm text-muted-foreground">{note}</p>
                ))}
              </div>
              {overview.is_ready && (
                <div className="pt-3 space-y-2">
                  <ExplainBlock
                    title="Hoe dien je je BTW-aangifte in?"
                    description="Log in op Mijn Belastingdienst (mijn.belastingdienst.nl) en vul de bedragen in bij je BTW-aangifte. Je kunt de samenvatting hieronder downloaden als referentie."
                  />
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleDownloadXml}
                      disabled={downloadingXml}
                    >
                      <FileXls size={16} className="mr-1" />
                      {downloadingXml ? 'Downloaden...' : 'Download XML voor Belastingdienst'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                    >
                      <Printer size={16} className="mr-1" />
                      Printen
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const data = JSON.stringify(overview, null, 2)
                        const blob = new Blob([data], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `btw-overzicht-${overview.quarter.replace(' ', '-')}.json`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      <DownloadSimple size={16} className="mr-1" />
                      Download JSON
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Skeleton Loading State
// ============================================================================

const LoadingSkeleton = () => (
  <div className="space-y-6">
    {/* Hero skeleton */}
    <Card className="border-2">
      <CardContent className="p-6 sm:p-8">
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-12 w-48" />
      </CardContent>
    </Card>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
    <Card>
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  </div>
)

// ============================================================================
// Main Page Component
// ============================================================================

export const ZZPBtwAangiftePage = () => {
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentQuarter = Math.floor(currentDate.getMonth() / 3) + 1

  const [data, setData] = useState<BTWAangifteResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [selectedQuarter, setSelectedQuarter] = useState<number>(currentQuarter)

  const yearOptions = useMemo(() => {
    const years: number[] = []
    for (let y = currentYear - 2; y <= currentYear; y++) {
      years.push(y)
    }
    return years
  }, [currentYear])

  const fetchData = useCallback(async (year: number, quarter: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await zzpBtwApi.getOverview(year, quarter)
      setData(result)
    } catch (err) {
      logApiError(err, 'ZZPBtwOverzicht')
      setError('Er is een fout opgetreden bij het laden van je BTW-overzicht. Probeer het later opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedYear, selectedQuarter)
  }, [fetchData, selectedYear, selectedQuarter])

  const activeOverview = data?.current_quarter
  const quarterMonths = QUARTER_MONTHS[selectedQuarter] || ''

  return (
    <PageContainer width="wide">
      <div className="space-y-6" data-testid="zzp-btw-aangifte-page">
        <PageHeader
          icon={<Calculator size={32} weight="duotone" />}
          title="BTW Overzicht"
          description="Bereid je kwartaalaangifte voor — overzichtelijk en stap voor stap."
          actions={
            <>
              {data?.btw_number && (
                <Badge variant="outline" className="text-xs border-primary/20 bg-primary/5">
                  BTW: {data.btw_number}
                </Badge>
              )}
              <Select value={String(selectedQuarter)} onValueChange={(v) => setSelectedQuarter(Number(v))}>
                <SelectTrigger className="w-[100px] bg-card/80 backdrop-blur-sm">
                  <SelectValue placeholder="Kwartaal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Q1</SelectItem>
                  <SelectItem value="2">Q2</SelectItem>
                  <SelectItem value="3">Q3</SelectItem>
                  <SelectItem value="4">Q4</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-[100px] bg-card/80 backdrop-blur-sm">
                  <SelectValue placeholder="Jaar" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />

        {/* Deadline banner */}
        {activeOverview && activeOverview.days_until_deadline > 0 && activeOverview.days_until_deadline <= 30 && (
          <SoftNote
            tone="warning"
            icon={<CalendarBlank size={16} weight="duotone" />}
            title={`Deadline: ${new Date(activeOverview.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            description={`Nog ${activeOverview.days_until_deadline} dag${activeOverview.days_until_deadline !== 1 ? 'en' : ''} om je BTW-aangifte in te dienen voor ${activeOverview.quarter}.`}
          />
        )}

        {/* Profile incomplete banner */}
        {data && !data.profile_complete && (
          <SoftNote
            tone="error"
            title="Bedrijfsprofiel incompleet"
            description={
              <>
                Vul je bedrijfsgegevens aan (BTW-nummer, KVK, IBAN) voor een complete aangifte.{' '}
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigateTo('/settings')}>
                  Naar instellingen
                </Button>
              </>
            }
          />
        )}

        {/* Loading state */}
        {loading && <LoadingSkeleton />}

        {/* Error state */}
        {error && !loading && (
          <Card className={cn(sectionCardClass, 'border-l-4 border-l-red-500/70')}>
            <CardContent className="p-6 text-center space-y-3">
              <div className="flex justify-center">
                <IconChip
                  icon={<WarningCircle size={32} weight="duotone" />}
                  tone="error"
                  size="lg"
                />
              </div>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => fetchData(selectedYear, selectedQuarter)}>Opnieuw proberen</Button>
            </CardContent>
          </Card>
        )}

        {/* Main content */}
        {!loading && !error && activeOverview && (
          <>
            {activeOverview.data_status === 'NO_DATA' || activeOverview.data_status === 'ERROR' ? (
              <EmptyQuarterCard overview={activeOverview} quarterMonths={quarterMonths} />
            ) : (
              <>
                <HeroCard overview={activeOverview} quarterMonths={quarterMonths} />
                <PartialStateBanner overview={activeOverview} />
                <QuarterDetail
                  overview={activeOverview}
                  showExplanations
                  selectedYear={selectedYear}
                  selectedQuarter={selectedQuarter}
                />
              </>
            )}
            <SourcesPanel overview={activeOverview} />
            {data?.previous_quarters && data.previous_quarters.length > 0 && (
              <PreviousQuartersStrip
                quarters={data.previous_quarters}
                onSelect={(y, q) => {
                  setSelectedYear(y)
                  setSelectedQuarter(q)
                }}
              />
            )}
          </>
        )}

        {/* No data state */}
        {!loading && !error && !activeOverview && data && (
          <Card className={cn(sectionCardClass, 'border-2 border-dashed border-primary/20')}>
            <CardContent className="p-6 text-center space-y-3">
              <div className="flex justify-center">
                <IconChip icon={<Calculator size={32} weight="duotone" />} tone="neutral" size="lg" />
              </div>
              <p className="text-sm text-muted-foreground">Geen data beschikbaar voor het geselecteerde kwartaal.</p>
            </CardContent>
          </Card>
        )}

        {/* Disclaimer */}
        <Disclaimer>
          <span className="font-medium text-foreground">Disclaimer:</span>{' '}
          Dit overzicht is bedoeld ter voorbereiding en vervangt geen officiële BTW-aangifte. De berekening is gebaseerd op de gegevens die je hebt ingevoerd. Raadpleeg een belastingadviseur als je twijfelt.
        </Disclaimer>
      </div>
    </PageContainer>
  )
}
