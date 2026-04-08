/**
 * ZZP BTW Aangifte Page
 *
 * Self-service VAT declaration workspace for ZZP users.
 * Shows quarterly overview of omzet, output/input VAT, net VAT, warnings,
 * and a "ready to submit" summary card.
 *
 * Calm, simple, self-service oriented UI for non-accountants.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
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
  Info,
  FileText,
  Receipt,
  CurrencyEur,
  CalendarBlank,
  DownloadSimple,
  Printer,
  CaretRight,
} from '@phosphor-icons/react'
import { zzpBtwApi, logApiError } from '@/lib/api'
import type { BTWAangifteResponse, BTWQuarterOverview, BTWWarning } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'

// ============================================================================
// Helpers
// ============================================================================

const formatCurrency = (cents: number): string => {
  const euros = cents / 100
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(euros)
}

const formatCurrencyAbs = (cents: number): string => formatCurrency(Math.abs(cents))

// ============================================================================
// Sub-components
// ============================================================================

/** Explanation tooltip block */
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
  <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-900 p-3 text-xs space-y-1">
    <p className="font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1">
      <Info size={14} weight="fill" className="text-blue-500 flex-shrink-0" />
      {title}
    </p>
    <p className="text-blue-800 dark:text-blue-300">{description}</p>
    {source && <p className="text-blue-600 dark:text-blue-400 italic">Bron: {source}</p>}
    {checkHint && <p className="text-blue-700 dark:text-blue-300">✓ Check: {checkHint}</p>}
  </div>
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
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
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

/** Warning item */
const WarningItem = ({ warning }: { warning: BTWWarning }) => {
  const severityConfig = {
    error: { icon: <WarningCircle size={18} weight="fill" className="text-red-500" />, bg: 'border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900' },
    warning: { icon: <WarningCircle size={18} weight="fill" className="text-amber-500" />, bg: 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900' },
    info: { icon: <Info size={18} weight="fill" className="text-blue-500" />, bg: 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900' },
  }

  const config = severityConfig[warning.severity] || severityConfig.info

  return (
    <div className={`rounded-lg border p-3 text-sm space-y-1 ${config.bg}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex-shrink-0">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium">{warning.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{warning.description}</p>
          {warning.action_hint && (
            <p className="text-xs mt-1 font-medium">{warning.action_hint}</p>
          )}
          {warning.related_route && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs mt-1"
              onClick={() => navigateTo(warning.related_route!)}
            >
              Bekijken <CaretRight size={12} className="ml-0.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Quarter overview detail section */
const QuarterDetail = ({ overview, showExplanations = true }: { overview: BTWQuarterOverview; showExplanations?: boolean }) => {
  const isPayable = overview.net_vat_cents >= 0
  const netVariant = isPayable ? 'negative' : 'positive'
  const netLabel = isPayable ? 'Te betalen aan Belastingdienst' : 'Terug te vragen van Belastingdienst'

  return (
    <div className="space-y-6">
      {/* Key metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          subtitle="BTW die je hebt gefactureerd"
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
        <StatCard
          label={netLabel}
          value={formatCurrencyAbs(overview.net_vat_cents)}
          subtitle={isPayable ? 'Je betaalt dit bedrag' : 'Je krijgt dit bedrag terug'}
          icon={<Calculator size={18} weight="duotone" />}
          variant={netVariant}
          explainTitle={showExplanations ? 'Hoe wordt dit berekend?' : undefined}
          explainDescription={`Af te dragen BTW (${formatCurrency(overview.output_vat_cents)}) min voorbelasting (${formatCurrency(overview.input_vat_cents)}) = ${formatCurrency(overview.net_vat_cents)}`}
          explainSource="Berekening: output BTW − input BTW"
          explainCheck="Controleer of zowel omzet als uitgaven compleet zijn."
        />
      </div>

      {/* VAT rate breakdown */}
      {overview.vat_rate_breakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">BTW-tarief verdeling</CardTitle>
            <CardDescription>Uitsplitsing per BTW-tarief</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overview.vat_rate_breakdown.map((item) => (
                <div key={item.vat_rate} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="min-w-[60px] justify-center">{item.vat_rate}%</Badge>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText size={16} weight="duotone" />
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
            <Separator className="my-2" />
            <div className="flex justify-between font-medium">
              <span>Totaal omzet</span>
              <span>{formatCurrency(overview.invoice_summary.total_omzet_cents)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Receipt size={16} weight="duotone" />
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
            <Separator className="my-2" />
            <div className="flex justify-between font-medium">
              <span>Aftrekbare BTW</span>
              <span className="text-green-600 dark:text-green-400">{formatCurrency(overview.expense_summary.total_vat_deductible_cents)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warnings */}
      {overview.warnings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <WarningCircle size={18} weight="duotone" />
              Aandachtspunten
            </CardTitle>
            <CardDescription>Controleer deze punten voor je aangifte</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.warnings.map((warning) => (
              <WarningItem key={warning.id} warning={warning} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Ready to submit card */}
      <Card className={overview.is_ready ? 'border-green-200 dark:border-green-900' : 'border-amber-200 dark:border-amber-900'}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`rounded-full p-3 ${overview.is_ready ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
              {overview.is_ready
                ? <CheckCircle size={28} weight="fill" className="text-green-600 dark:text-green-400" />
                : <WarningCircle size={28} weight="fill" className="text-amber-600 dark:text-amber-400" />
              }
            </div>
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
                    description="Log in op Mijn Belastingdienst (mijn.belastingdienst.nl) en vul de bedragen in bij je BTW-aangifte. Je kunt de samenvatting hieronder printen of downloaden als referentie."
                  />
                  <div className="flex flex-wrap gap-2 pt-2">
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
                        a.download = `btw-aangifte-${overview.quarter.replace(' ', '-')}.json`
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
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
  const [data, setData] = useState<BTWAangifteResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedQuarter, setSelectedQuarter] = useState<string>('current')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await zzpBtwApi.getOverview()
      setData(result)
    } catch (err) {
      logApiError(err, 'ZZPBtwAangifte')
      setError('Er is een fout opgetreden bij het laden van je BTW-overzicht. Probeer het later opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Determine which quarter to display
  const activeOverview = selectedQuarter === 'current'
    ? data?.current_quarter
    : data?.previous_quarters.find(q => q.quarter === selectedQuarter)

  // Build quarter options for dropdown
  const quarterOptions = data
    ? [
        { value: 'current', label: data.current_quarter.quarter },
        ...data.previous_quarters.map(q => ({ value: q.quarter, label: q.quarter })),
      ]
    : []

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="zzp-btw-aangifte-page">
      {/* Page Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">BTW Aangifte</h1>
            <p className="text-muted-foreground text-sm">
              Bereid je kwartaalaangifte voor — overzichtelijk en stap voor stap.
            </p>
          </div>

          {data && (
            <div className="flex items-center gap-3">
              {data.btw_number && (
                <Badge variant="outline" className="text-xs">
                  BTW: {data.btw_number}
                </Badge>
              )}
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Kwartaal" />
                </SelectTrigger>
                <SelectContent>
                  {quarterOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Deadline banner */}
        {activeOverview && activeOverview.days_until_deadline > 0 && activeOverview.days_until_deadline <= 30 && (
          <Alert className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
            <CalendarBlank size={18} weight="fill" className="text-amber-500" />
            <AlertTitle className="text-sm font-medium">
              Deadline: {new Date(activeOverview.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </AlertTitle>
            <AlertDescription className="text-xs">
              Nog {activeOverview.days_until_deadline} dag{activeOverview.days_until_deadline !== 1 ? 'en' : ''} om je BTW-aangifte in te dienen voor {activeOverview.quarter}.
            </AlertDescription>
          </Alert>
        )}

        {/* Profile incomplete banner */}
        {data && !data.profile_complete && (
          <Alert className="border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900">
            <WarningCircle size={18} weight="fill" className="text-red-500" />
            <AlertTitle className="text-sm font-medium">Bedrijfsprofiel incompleet</AlertTitle>
            <AlertDescription className="text-xs">
              Vul je bedrijfsgegevens aan (BTW-nummer, KVK, IBAN) voor een complete aangifte.{' '}
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigateTo('/settings')}>
                Naar instellingen
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Loading state */}
      {loading && <LoadingSkeleton />}

      {/* Error state */}
      {error && !loading && (
        <Card className="border-red-200">
          <CardContent className="p-6 text-center space-y-3">
            <WarningCircle size={40} weight="duotone" className="text-red-400 mx-auto" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Opnieuw proberen</Button>
          </CardContent>
        </Card>
      )}

      {/* Main content */}
      {!loading && !error && activeOverview && (
        <QuarterDetail overview={activeOverview} showExplanations={selectedQuarter === 'current'} />
      )}

      {/* No data state */}
      {!loading && !error && !activeOverview && data && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Calculator size={40} weight="duotone" className="text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Geen data beschikbaar voor het geselecteerde kwartaal.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
