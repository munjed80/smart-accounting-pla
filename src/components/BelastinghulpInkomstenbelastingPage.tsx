/**
 * Belastinghulp – Inkomstenbelasting
 *
 * Self-service page for ZZP users to prepare their annual
 * income-tax return. Shows yearly summary of omzet, kosten,
 * winst, preparation checklist, warnings, and explanations.
 *
 * This is a preparation and guidance tool — NOT a filing tool.
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
  CurrencyEur,
  CheckCircle,
  WarningCircle,
  Info,
  FileText,
  Receipt,
  CalendarBlank,
  DownloadSimple,
  Printer,
  ArrowRight,
  Clock,
  ChartBar,
  ListChecks,
} from '@phosphor-icons/react'
import { zzpIncomeTaxApi, logApiError } from '@/lib/api'
import type {
  IncomeTaxResponse,
  IncomeTaxYearOverview,
  IncomeTaxWarning,
  IncomeTaxChecklistItem,
} from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { formatCurrency, TaxWarningItem } from '@/components/belastinghulp/shared'

// ============================================================================
// Sub-components
// ============================================================================

/** Explanation block — calm blue info card */
const ExplainBlock = ({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items?: string[]
}) => (
  <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-900 p-3 text-xs space-y-1">
    <p className="font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1">
      <Info size={14} weight="fill" className="text-blue-500 flex-shrink-0" />
      {title}
    </p>
    <p className="text-blue-800 dark:text-blue-300">{description}</p>
    {items && items.length > 0 && (
      <ul className="text-blue-700 dark:text-blue-300 space-y-0.5 mt-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1">
            <span className="mt-0.5">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
)

/** Big number stat card */
const StatCard = ({
  label,
  value,
  subtitle,
  icon,
  variant = 'default',
}: {
  label: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  variant?: 'default' | 'positive' | 'negative' | 'neutral'
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
      </CardContent>
    </Card>
  )
}

/** Warning item - uses shared TaxWarningItem */

/** Checklist item */
const ChecklistRow = ({ item }: { item: IncomeTaxChecklistItem }) => (
  <li className="flex items-start gap-3 py-2">
    <CheckCircle
      size={20}
      weight={item.done ? 'fill' : 'regular'}
      className={`mt-0.5 flex-shrink-0 ${
        item.done ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
      }`}
    />
    <div className="flex-1 min-w-0">
      <span className={`text-sm ${item.done ? 'text-muted-foreground line-through' : ''}`}>
        {item.label}
      </span>
      {!item.done && item.hint && (
        <p className="text-xs text-muted-foreground mt-0.5">{item.hint}</p>
      )}
    </div>
  </li>
)

/** Hours indicator section */
const HoursIndicator = ({ indicator }: { indicator: IncomeTaxYearOverview['hours_indicator'] }) => {
  const pctClamped = Math.min(indicator.percentage, 100)
  const barColor = indicator.percentage >= 100
    ? 'bg-green-500'
    : indicator.percentage >= 50
      ? 'bg-amber-500'
      : 'bg-red-400'

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock size={18} weight="duotone" />
          Urencriterium (indicatie)
        </CardTitle>
        <CardDescription>
          Om recht te hebben op zelfstandigenaftrek moet je minimaal {indicator.target_hours} uur per jaar aan je onderneming besteden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {indicator.data_available ? (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold">{Math.round(indicator.total_hours)} uur</p>
                <p className="text-xs text-muted-foreground">
                  van {indicator.target_hours} uur ({indicator.percentage}%)
                </p>
              </div>
              {indicator.percentage >= 100 && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">
                  Waarschijnlijk voldaan
                </Badge>
              )}
            </div>
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${pctClamped}%` }}
              />
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <Clock size={24} weight="duotone" className="text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Geen uren geregistreerd</p>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs mt-1"
              onClick={() => navigateTo('/zzp/time')}
            >
              Uren bijhouden <ArrowRight size={12} className="ml-0.5" />
            </Button>
          </div>
        )}
        <ExplainBlock
          title="Wat is het urencriterium?"
          description="Als ZZP'er kun je fiscale voordelen krijgen als je minimaal 1.225 uur per jaar aan je onderneming besteedt. Dit is een indicatie op basis van je geregistreerde uren — het is geen juridisch advies."
        />
      </CardContent>
    </Card>
  )
}

/** Export summary as plain text for filing */
const buildExportText = (overview: IncomeTaxYearOverview): string => {
  const lines = [
    `JAAROVERZICHT INKOMSTENBELASTING ${overview.year}`,
    `Gegenereerd: ${new Date(overview.generated_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    '',
    '─── Samenvatting ───',
    `Omzet (ex. BTW):      ${formatCurrency(overview.omzet_cents)}`,
    `Kosten:               ${formatCurrency(overview.kosten_cents)}`,
    `Winst uit onderneming: ${formatCurrency(overview.winst_cents)}`,
    '',
    `Betaalde facturen: ${overview.paid_invoice_count}`,
    `Openstaande facturen: ${overview.unpaid_invoice_count}`,
    `Conceptfacturen: ${overview.draft_invoice_count}`,
    `Uitgaven: ${overview.expense_count}`,
    '',
  ]

  if (overview.cost_breakdown.length > 0) {
    lines.push('─── Kosten per categorie ───')
    for (const cat of overview.cost_breakdown) {
      lines.push(`${cat.label}: ${formatCurrency(cat.amount_cents)} (${cat.count}x)`)
    }
    lines.push('')
  }

  if (overview.hours_indicator.data_available) {
    lines.push('─── Uren ───')
    lines.push(`Totaal geregistreerd: ${Math.round(overview.hours_indicator.total_hours)} uur`)
    lines.push(`Urencriterium (${overview.hours_indicator.target_hours}): ${overview.hours_indicator.percentage}%`)
    lines.push('')
  }

  lines.push('─── Let op ───')
  lines.push('Dit overzicht is een voorbereiding. Het vervangt geen officiële aangifte.')
  lines.push('Aftrekposten zoals zelfstandigenaftrek, startersaftrek en MKB-winstvrijstelling')
  lines.push('zijn NIET verwerkt — pas deze toe bij het invullen van je aangifte.')
  lines.push('')
  lines.push('Dien je aangifte in via Mijn Belastingdienst: mijn.belastingdienst.nl')

  return lines.join('\n')
}

/** Year detail section */
const YearDetail = ({ overview }: { overview: IncomeTaxYearOverview }) => {
  const isProfit = overview.winst_cents >= 0

  return (
    <div className="space-y-6">
      {/* Key metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Omzet"
          value={formatCurrency(overview.omzet_cents)}
          subtitle={`${overview.paid_invoice_count} betaalde facturen`}
          icon={<CurrencyEur size={18} weight="duotone" />}
        />
        <StatCard
          label="Kosten"
          value={formatCurrency(overview.kosten_cents)}
          subtitle={`${overview.expense_count} uitgaven`}
          icon={<Receipt size={18} weight="duotone" />}
          variant="negative"
        />
        <StatCard
          label="Winst uit onderneming"
          value={formatCurrency(overview.winst_cents)}
          subtitle={isProfit ? 'Vóór aftrekposten' : 'Verlies vóór aftrekposten'}
          icon={<ChartBar size={18} weight="duotone" />}
          variant={isProfit ? 'positive' : 'negative'}
        />
      </div>

      {/* Explanation cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ExplainBlock
          title="Wat telt als omzet?"
          description="Je omzet is het totale bedrag dat je hebt gefactureerd en ontvangen (exclusief BTW). Alleen betaalde facturen tellen mee."
          items={[
            'Betaalde facturen voor geleverde diensten/producten',
            'Exclusief BTW (die geef je apart aan)',
            'Conceptfacturen en openstaande facturen tellen niet mee',
          ]}
        />
        <ExplainBlock
          title="Wat telt als kosten?"
          description="Zakelijke uitgaven die je maakt voor je onderneming. Deze worden afgetrokken van je omzet om je winst te bepalen."
          items={[
            'Kantoorbenodigdheden, software, abonnementen',
            'Reiskosten, telefoon, verzekeringen',
            'Huur werkruimte, opleidingen',
            'Afschrijvingen op bedrijfsmiddelen',
          ]}
        />
      </div>

      {/* Cost breakdown */}
      {overview.cost_breakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt size={18} weight="duotone" />
              Kosten per categorie
            </CardTitle>
            <CardDescription>Verdeling van je zakelijke uitgaven</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overview.cost_breakdown.map((cat) => (
                <div key={cat.category} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{cat.label}</span>
                    <Badge variant="outline" className="text-xs">{cat.count}×</Badge>
                  </div>
                  <span className="text-sm font-medium">{formatCurrency(cat.amount_cents)}</span>
                </div>
              ))}
              <Separator className="my-2" />
              <div className="flex items-center justify-between font-medium">
                <span className="text-sm">Totaal kosten</span>
                <span className="text-sm">{formatCurrency(overview.kosten_cents)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice & expense summary cards */}
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
              <span className="font-medium">{overview.paid_invoice_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Openstaand</span>
              <span>{overview.unpaid_invoice_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Concept</span>
              <span>{overview.draft_invoice_count}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-medium">
              <span>Totaal omzet</span>
              <span>{formatCurrency(overview.omzet_cents)}</span>
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
              <span className="font-medium">{overview.expense_count}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-medium">
              <span>Totaal kosten</span>
              <span>{formatCurrency(overview.kosten_cents)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hours indicator */}
      <HoursIndicator indicator={overview.hours_indicator} />

      {/* Warnings */}
      {overview.warnings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <WarningCircle size={18} weight="duotone" />
              Aandachtspunten
            </CardTitle>
            <CardDescription>Controleer deze punten voordat je je aangifte indient</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.warnings.map((warning) => (
              <TaxWarningItem key={warning.id} warning={warning} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Preparation checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks size={18} weight="duotone" />
            Voorbereidingschecklist
          </CardTitle>
          <CardDescription>
            Zorg dat alle punten zijn afgevinkt voordat je je aangifte indient.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {overview.checklist.map((item) => (
              <ChecklistRow key={item.id} item={item} />
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Pre-filing review explanation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Wat moet je controleren voor je aangifte?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ExplainBlock
            title="Omzet controleren"
            description="Controleer of alle facturen van het jaar zijn ingevoerd en of de betaalstatus klopt. Alleen betaalde facturen tellen mee voor je omzet."
          />
          <ExplainBlock
            title="Kosten controleren"
            description="Ga na of je alle zakelijke uitgaven hebt ingevoerd. Bewaar bonnen en facturen — de Belastingdienst kan hierom vragen."
          />
          <ExplainBlock
            title="Aftrekposten"
            description="Bij het indienen van je aangifte kun je aftrekposten toepassen die hier niet zijn berekend. Denk aan:"
            items={[
              'Zelfstandigenaftrek (€7.030 in 2024)',
              'Startersaftrek (extra €2.123 in de eerste 3 jaar)',
              'MKB-winstvrijstelling (14% van de winst)',
              'Investeringsaftrek (KIA) voor grote aankopen',
            ]}
          />
          <ExplainBlock
            title="Privégebruik"
            description="Als je bedrijfsmiddelen ook privé gebruikt (auto, telefoon), moet je een deel van de kosten corrigeren. Dit kun je aangeven bij je aangifte."
          />
        </CardContent>
      </Card>

      {/* Readiness & export section */}
      <Card className={overview.is_complete ? 'border-green-200 dark:border-green-900' : 'border-amber-200 dark:border-amber-900'}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`rounded-full p-3 ${overview.is_complete ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
              {overview.is_complete
                ? <CheckCircle size={28} weight="fill" className="text-green-600 dark:text-green-400" />
                : <WarningCircle size={28} weight="fill" className="text-amber-600 dark:text-amber-400" />
              }
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="text-lg font-semibold">
                {overview.is_complete ? 'Gegevens compleet' : 'Nog niet compleet'}
              </h3>
              <div className="space-y-1">
                {overview.completeness_notes.map((note, i) => (
                  <p key={i} className="text-sm text-muted-foreground">{note}</p>
                ))}
              </div>

              <div className="pt-3 space-y-2">
                <ExplainBlock
                  title="Hoe dien je je inkomstenbelasting in?"
                  description="Log in op Mijn Belastingdienst (mijn.belastingdienst.nl) en vul je aangifte in. Je kunt het overzicht hieronder printen of downloaden als hulpmiddel bij het invullen."
                />
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer size={16} className="mr-1" />
                    Printen
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const text = buildExportText(overview)
                      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `inkomstenbelasting-${overview.year}-overzicht.txt`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    <DownloadSimple size={16} className="mr-1" />
                    Download overzicht
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <div className="rounded-lg border border-muted p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium">Disclaimer</p>
        <p>
          Dit overzicht is bedoeld ter voorbereiding en is geen vervanging voor professioneel
          fiscaal advies. De berekeningen zijn gebaseerd op de gegevens die je hebt ingevoerd.
          Aftrekposten, toeslagen en persoonlijke omstandigheden zijn niet meegenomen. Raadpleeg
          een belastingadviseur als je twijfelt.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Skeleton Loading State
// ============================================================================

const LoadingSkeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
    <Card>
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  </div>
)

// ============================================================================
// Main Page Component
// ============================================================================

export const BelastinghulpInkomstenbelastingPage = () => {
  const [data, setData] = useState<IncomeTaxResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<string>('')

  const fetchData = useCallback(async (year?: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await zzpIncomeTaxApi.getOverview(year)
      setData(result)
      setSelectedYear((prev) => prev || String(result.overview.year))
    } catch (err) {
      logApiError(err, 'BelastinghulpInkomstenbelasting')
      setError('Er is een fout opgetreden bij het laden van je jaaroverzicht. Probeer het later opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleYearChange = (yearStr: string) => {
    setSelectedYear(yearStr)
    fetchData(Number(yearStr))
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="zzp-inkomstenbelasting-page">
      {/* Page Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Inkomstenbelasting</h1>
            <p className="text-muted-foreground text-sm">
              Bereid je jaarlijkse aangifte inkomstenbelasting voor — overzichtelijk en stap voor stap.
            </p>
          </div>

          {data && (
            <div className="flex items-center gap-3">
              {data.kvk_number && (
                <Badge variant="outline" className="text-xs">
                  KVK: {data.kvk_number}
                </Badge>
              )}
              <Select value={selectedYear} onValueChange={handleYearChange}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Jaar" />
                </SelectTrigger>
                <SelectContent>
                  {data.available_years.map((yr) => (
                    <SelectItem key={yr} value={String(yr)}>{yr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Deadline banner */}
        {data && data.overview && (() => {
          const deadline = new Date(data.overview.filing_deadline)
          const now = new Date()
          const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          if (daysUntil > 0 && daysUntil <= 90) {
            return (
              <Alert className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
                <CalendarBlank size={18} weight="fill" className="text-amber-500" />
                <AlertTitle className="text-sm font-medium">
                  Deadline: {deadline.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </AlertTitle>
                <AlertDescription className="text-xs">
                  Nog {daysUntil} dag{daysUntil !== 1 ? 'en' : ''} om je aangifte inkomstenbelasting {data.overview.year} in te dienen.
                </AlertDescription>
              </Alert>
            )
          }
          return null
        })()}

        {/* Profile incomplete banner */}
        {data && !data.profile_complete && (
          <Alert className="border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900">
            <WarningCircle size={18} weight="fill" className="text-red-500" />
            <AlertTitle className="text-sm font-medium">Bedrijfsprofiel incompleet</AlertTitle>
            <AlertDescription className="text-xs">
              Vul je bedrijfsgegevens aan (KVK-nummer, BTW-nummer, IBAN) voor een compleet overzicht.{' '}
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
            <Button variant="outline" size="sm" onClick={() => fetchData()}>Opnieuw proberen</Button>
          </CardContent>
        </Card>
      )}

      {/* Main content */}
      {!loading && !error && data && (
        <YearDetail overview={data.overview} />
      )}
    </div>
  )
}
