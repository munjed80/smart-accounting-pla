import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getErrorMessage, periodApi, vatApi, type Period, type VATAnomaly, type VATReportResponse, type ICPReportResponse } from '@/lib/api'
import {
  ArrowsClockwise,
  CheckCircle,
  DownloadSimple,
  FileArrowDown,
  Globe,
  Warning,
  WarningCircle,
  Eye,
  ArrowClockwise,
  CurrencyEur,
  CalendarBlank,
  FileText,
  Spinner,
  XCircle,
  Info,
} from '@phosphor-icons/react'
import { BTWBoxDrilldown } from './BTWBoxDrilldown'
import { VATSubmissionHistory } from './VATSubmissionHistory'
import { navigateTo } from '@/lib/navigation'

// Box groups per Belastingdienst layout
const BOX_GROUPS: Record<string, string[]> = {
  'Binnenlandse prestaties': ['1a', '1b', '1c', '1d', '1e'],
  'EU-transacties': ['2a', '3a', '3b'],
  'Verlegging / inkoop': ['4a', '4b'],
  'Berekening (5a–5g)': ['5a', '5b', '5c', '5d', '5e', '5f', '5g'],
}

const ALL_BOX_CODES = Object.values(BOX_GROUPS).flat()

const formatMoney = (value: string | number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(
    typeof value === 'string' ? Number(value) : value
  )

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const PERIOD_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Concept',
  REVIEW: 'In review',
  READY_FOR_FILING: 'Klaar voor indiening',
  FINALIZED: 'Afgerond',
  LOCKED: 'Vergrendeld',
}

// Status card component for the summary row
const StatusCard = ({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  tone: 'neutral' | 'red' | 'amber' | 'green' | 'blue'
}) => {
  const toneClasses = {
    neutral: 'bg-muted/50 border-border',
    red: 'bg-red-500/10 border-red-500/30',
    amber: 'bg-amber-500/10 border-amber-500/30',
    green: 'bg-green-500/10 border-green-500/30',
    blue: 'bg-blue-500/10 border-blue-500/30',
  }
  const valueClasses = {
    neutral: 'text-foreground',
    red: 'text-red-700 dark:text-red-400',
    amber: 'text-amber-700 dark:text-amber-400',
    green: 'text-green-700 dark:text-green-400',
    blue: 'text-blue-700 dark:text-blue-400',
  }
  return (
    <div className={`flex-1 min-w-[140px] rounded-lg border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-xl font-semibold ${valueClasses[tone]}`}>{value}</div>
    </div>
  )
}

// Anomaly row component
const AnomalyRow = ({ anomaly }: { anomaly: VATAnomaly }) => {
  const isRed = anomaly.severity === 'RED'
  return (
    <div
      className={`rounded-lg border p-4 ${
        isRed
          ? 'bg-red-500/10 border-red-500/30'
          : 'bg-amber-500/10 border-amber-500/30'
      }`}
    >
      <div className="flex items-start gap-3">
        {isRed ? (
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
        ) : (
          <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium ${isRed ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {anomaly.title}
            </span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              {anomaly.code}
            </code>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{anomaly.description}</p>
          {anomaly.suggested_fix && (
            <p className="text-xs mt-1.5 text-muted-foreground">
              <span className="font-medium">Suggestie:</span> {anomaly.suggested_fix}
            </p>
          )}
          {anomaly.amount_discrepancy && (
            <p className="text-xs mt-1 text-muted-foreground">
              <span className="font-medium">Verschil:</span> {formatMoney(anomaly.amount_discrepancy)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// Skeleton loading state
const LoadingSkeleton = () => (
  <div className="space-y-4">
    <div className="flex gap-4">
      <Skeleton className="h-24 flex-1 rounded-lg" />
      <Skeleton className="h-24 flex-1 rounded-lg" />
      <Skeleton className="h-24 flex-1 rounded-lg" />
      <Skeleton className="h-24 flex-1 rounded-lg" />
    </div>
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-64 w-full rounded-lg" />
    <Skeleton className="h-40 w-full rounded-lg" />
  </div>
)

// Main component
export const ClientVatTab = ({ clientId }: { clientId: string }) => {
  const [periods, setPeriods] = useState<Period[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('')
  const [report, setReport] = useState<VATReportResponse | null>(null)
  const [icpReport, setIcpReport] = useState<ICPReportResponse | null>(null)
  const [anomalies, setAnomalies] = useState<VATAnomaly[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [isMarkingReady, setIsMarkingReady] = useState(false)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [isBtwXmlLoading, setIsBtwXmlLoading] = useState(false)
  const [isIcpXmlLoading, setIsIcpXmlLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Drilldown state
  const [drilldownOpen, setDrilldownOpen] = useState(false)
  const [drilldownBoxCode, setDrilldownBoxCode] = useState<string>('')
  const [drilldownBoxName, setDrilldownBoxName] = useState<string>('')

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  )
  const redCount = useMemo(() => anomalies.filter((a) => a.severity === 'RED').length, [anomalies])
  const yellowCount = useMemo(() => anomalies.filter((a) => a.severity === 'YELLOW').length, [anomalies])

  const loadPeriods = async () => {
    try {
      const response = await periodApi.listPeriods(clientId)
      setPeriods(response.periods)
      if (!selectedPeriodId && response.periods.length > 0) {
        setSelectedPeriodId(response.periods[0].id)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const loadReport = async (periodId: string) => {
    try {
      setIsLoading(true)
      setError(null)
      const [vatData, icpData] = await Promise.all([
        vatApi.getReport(clientId, periodId),
        vatApi.getICPReport(clientId, periodId),
      ])
      setReport(vatData)
      setIcpReport(icpData)
      setAnomalies(vatData.anomalies)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPeriods()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  useEffect(() => {
    if (selectedPeriodId) {
      loadReport(selectedPeriodId)
    } else {
      setReport(null)
      setIcpReport(null)
      setAnomalies([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriodId])

  const handleValidate = async () => {
    // Diagnostic: log disabled conditions if handler fires unexpectedly
    if (import.meta.env.DEV) {
      console.log('[BTW] handleValidate fired', { selectedPeriodId, isValidating, isLoading })
    }
    if (!selectedPeriodId) return
    try {
      setIsValidating(true)
      setMessage(null)
      setError(null)
      if (import.meta.env.DEV) console.log('[BTW] Calling vatApi.validate', { clientId, selectedPeriodId })
      const response = await vatApi.validate(clientId, selectedPeriodId)
      if (import.meta.env.DEV) console.log('[BTW] vatApi.validate response received')
      setAnomalies(response.anomalies)
      setMessage(response.message)
      await loadReport(selectedPeriodId)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsValidating(false)
    }
  }

  const handleExportCsv = () => {
    if (import.meta.env.DEV) console.log('[BTW] handleExportCsv fired', { hasReport: !!report })
    if (!report) return
    const rows = [
      ['rubriek', 'omschrijving', 'omzet', 'btw'],
      ...ALL_BOX_CODES.map((code) => {
        const box = report.boxes[code]
        return [code, box?.box_name ?? '', box?.turnover_amount ?? '0.00', box?.vat_amount ?? '0.00']
      }),
    ]
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `btw-overzicht-${report.period_name}.csv`)
  }

  const handleExportPdf = async () => {
    if (import.meta.env.DEV) console.log('[BTW] handleExportPdf fired', { selectedPeriodId, hasReport: !!report })
    if (!selectedPeriodId || !report) return
    try {
      setIsPdfLoading(true)
      setError(null)
      if (import.meta.env.DEV) console.log('[BTW] Calling vatApi.downloadPdf', { clientId, selectedPeriodId })
      const blob = await vatApi.downloadPdf(clientId, selectedPeriodId)
      if (import.meta.env.DEV) console.log('[BTW] vatApi.downloadPdf blob received')
      downloadBlob(blob, `btw-overzicht-${report.period_name}.pdf`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsPdfLoading(false)
    }
  }

  const handleDownloadBtwXml = async () => {
    if (import.meta.env.DEV) console.log('[BTW] handleDownloadBtwXml fired', { selectedPeriodId, hasReport: !!report })
    if (!selectedPeriodId || !report) return
    try {
      setIsBtwXmlLoading(true)
      setError(null)
      if (import.meta.env.DEV) console.log('[BTW] Calling vatApi.downloadBtwSubmissionPackage', { clientId, selectedPeriodId })
      const blob = await vatApi.downloadBtwSubmissionPackage(clientId, selectedPeriodId)
      if (import.meta.env.DEV) console.log('[BTW] BTW XML blob received')
      downloadBlob(blob, `btw-aangifte-${report.period_name}-${report.start_date}.xml`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsBtwXmlLoading(false)
    }
  }

  const handleDownloadIcpXml = async () => {
    if (import.meta.env.DEV) console.log('[BTW] handleDownloadIcpXml fired', { selectedPeriodId, hasReport: !!report })
    if (!selectedPeriodId || !report) return
    try {
      setIsIcpXmlLoading(true)
      setError(null)
      if (import.meta.env.DEV) console.log('[BTW] Calling vatApi.downloadIcpSubmissionPackage', { clientId, selectedPeriodId })
      const blob = await vatApi.downloadIcpSubmissionPackage(clientId, selectedPeriodId)
      if (import.meta.env.DEV) console.log('[BTW] ICP XML blob received')
      downloadBlob(blob, `icp-opgaaf-${report.period_name}-${report.start_date}.xml`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsIcpXmlLoading(false)
    }
  }

  const handleMarkReady = async () => {
    if (import.meta.env.DEV) {
      console.log('[BTW] handleMarkReady fired', { selectedPeriodId, canMarkReady, redCount, isAlreadyReady: selectedPeriod?.status === 'READY_FOR_FILING' })
    }
    if (!selectedPeriodId) return
    try {
      setIsMarkingReady(true)
      setMessage(null)
      setError(null)
      if (import.meta.env.DEV) console.log('[BTW] Calling periodApi.updateStatus', { clientId, selectedPeriodId })
      const response = await periodApi.updateStatus(clientId, selectedPeriodId, { status: 'READY_FOR_FILING' })
      if (import.meta.env.DEV) console.log('[BTW] periodApi.updateStatus response received')
      setMessage(response.message)
      await Promise.all([loadPeriods(), loadReport(selectedPeriodId)])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsMarkingReady(false)
    }
  }

  const isAlreadyReady = selectedPeriod?.status === 'READY_FOR_FILING'
  const canMarkReady = !!selectedPeriodId && !isMarkingReady && redCount === 0 && !!report && !isAlreadyReady

  const getMarkReadyTitle = () => {
    if (!selectedPeriodId) return 'Selecteer eerst een periode'
    if (redCount > 0) return `${redCount} blokkerende fout${redCount !== 1 ? 'en' : ''} \u2013 los deze eerst op`
    if (isAlreadyReady) return 'Periode is al klaar voor indiening'
    if (!report) return 'Laad eerst een overzicht'
    return undefined
  }

  type StatusTone = 'neutral' | 'red' | 'amber' | 'green' | 'blue'
  const getPeriodStatusTone = (): StatusTone => {
    if (isAlreadyReady) return 'green'
    if (redCount > 0) return 'red'
    if (yellowCount > 0) return 'amber'
    if (report) return 'blue'
    return 'neutral'
  }

  return (
    <div className="space-y-6">
      {/* Control panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CurrencyEur size={22} weight="duotone" />
            BTW-aangifte
          </CardTitle>
          <CardDescription>
            Selecteer een periode, valideer de gegevens, exporteer het overzicht en markeer de
            periode als klaar voor handmatige indiening bij de Belastingdienst.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Row 1: period selector + action buttons */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <CalendarBlank size={13} />
                Periode
              </Label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer periode…" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((period) => (
                    <SelectItem value={period.id} key={period.id}>
                      {period.name} <span className="text-muted-foreground">({period.period_type})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleValidate}
              disabled={!selectedPeriodId || isValidating || isLoading}
              title={!selectedPeriodId ? 'Selecteer eerst een periode' : undefined}
            >
              {isValidating ? (
                <Spinner size={16} className="mr-2 animate-spin" />
              ) : (
                <ArrowsClockwise size={16} className="mr-2" />
              )}
              {isValidating ? 'Valideren…' : 'Valideren'}
            </Button>

            <Separator orientation="vertical" className="h-9 hidden sm:block" />

            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={!report || isPdfLoading}
              title={!report ? 'Laad eerst een overzicht' : undefined}
            >
              {isPdfLoading ? (
                <Spinner size={16} className="mr-2 animate-spin" />
              ) : (
                <DownloadSimple size={16} className="mr-2" />
              )}
              Download PDF
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={!report}
              title={!report ? 'Laad eerst een overzicht' : undefined}
            >
              <FileArrowDown size={16} className="mr-2" />
              Export CSV
            </Button>

            <Separator orientation="vertical" className="h-9 hidden sm:block" />

            <Button
              variant={isAlreadyReady ? 'secondary' : 'default'}
              onClick={handleMarkReady}
              disabled={!canMarkReady}
              title={getMarkReadyTitle()}
            >
              {isMarkingReady ? (
                <Spinner size={16} className="mr-2 animate-spin" />
              ) : (
                <CheckCircle size={16} className="mr-2" weight={isAlreadyReady ? 'fill' : 'regular'} />
              )}
              {isAlreadyReady ? 'Klaar voor indiening' : isMarkingReady ? 'Opslaan…' : 'Markeer als klaar'}
            </Button>
          </div>

          {/* Disabled-state hint — visible below buttons so user sees WHY actions are unavailable */}
          {!selectedPeriodId && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info size={13} />
              Selecteer een periode om de acties te activeren.
            </p>
          )}
          {selectedPeriodId && isLoading && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Spinner size={13} className="animate-spin" />
              Overzicht wordt geladen…
            </p>
          )}
          {selectedPeriodId && !isLoading && !report && !error && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Warning size={13} />
              Geen overzicht beschikbaar voor deze periode.
            </p>
          )}

          {/* Row 2: feedback messages */}
          {error && (
            <Alert className="bg-destructive/10 border-destructive/40">
              <XCircle className="h-4 w-4" />
              <AlertTitle className="flex items-center justify-between">
                <span>Fout</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => {
                    setError(null)
                    if (selectedPeriodId) {
                      loadReport(selectedPeriodId)
                    } else {
                      loadPeriods()
                    }
                  }}
                >
                  <ArrowClockwise size={14} className="mr-1" />
                  Opnieuw
                </Button>
              </AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {message && (
            <Alert className="bg-blue-500/10 border-blue-500/40">
              <CheckCircle className="h-4 w-4 text-blue-500" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {/* Row 3: status summary cards */}
          {selectedPeriodId && (
            <div className="flex flex-wrap gap-3 pt-1">
              <StatusCard
                icon={<WarningCircle size={14} />}
                label="Blokkerend"
                value={redCount}
                tone={redCount > 0 ? 'red' : 'neutral'}
              />
              <StatusCard
                icon={<Warning size={14} />}
                label="Waarschuwingen"
                value={yellowCount}
                tone={yellowCount > 0 ? 'amber' : 'neutral'}
              />
              <StatusCard
                icon={<CalendarBlank size={14} />}
                label="Status periode"
                value={selectedPeriod ? (PERIOD_STATUS_LABELS[selectedPeriod.status] ?? selectedPeriod.status) : '—'}
                tone={getPeriodStatusTone()}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empty state */}
      {!selectedPeriodId && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center text-muted-foreground">
            <CalendarBlank size={40} className="opacity-40" />
            <p className="text-base font-medium">Selecteer eerst een periode</p>
            <p className="text-sm max-w-sm">
              Kies een periode uit de keuzelijst hierboven om het BTW-overzicht te genereren.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {selectedPeriodId && isLoading && <LoadingSkeleton />}

      {/* Report content */}
      {selectedPeriodId && !isLoading && report && (
        <>
          {/* Summary figures */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Totaal omzet</div>
              <div className="text-xl font-bold">{formatMoney(report.total_turnover)}</div>
            </div>
            <div className="rounded-lg border bg-blue-500/10 border-blue-500/20 p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Verschuldigde BTW</div>
              <div className="text-xl font-bold text-blue-700 dark:text-blue-400">{formatMoney(report.total_vat_payable)}</div>
            </div>
            <div className="rounded-lg border bg-green-500/10 border-green-500/20 p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Voorbelasting</div>
              <div className="text-xl font-bold text-green-700 dark:text-green-400">{formatMoney(report.total_vat_receivable)}</div>
            </div>
            {(() => {
              const net = Number(report.net_vat)
              const isRefund = net < 0
              return (
                <div className={`rounded-lg border p-4 ${isRefund ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    {isRefund ? 'Te ontvangen (5g)' : 'Te betalen (5g)'}
                  </div>
                  <div className={`text-xl font-bold ${isRefund ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    {formatMoney(Math.abs(net))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Rubrieken table */}
          <Card>
            <CardHeader>
              <CardTitle>Rubrieken BTW-aangifte</CardTitle>
              <CardDescription>
                Overzicht per rubriek (1a–5g) conform het formulier van de Belastingdienst.
                Klik op een rij met boekingen om de herkomst te bekijken.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(BOX_GROUPS).map(([groupName, codes]) => {
                const isCalculationGroup = groupName.startsWith('Berekening')
                const groupBoxes = codes.map((code) => ({ code, box: report.boxes[code] })).filter(({ box }) => !!box)
                return (
                  <div key={groupName}>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {groupName}
                    </h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Rubriek</TableHead>
                          <TableHead>Omschrijving</TableHead>
                          {!isCalculationGroup && <TableHead className="text-right w-36">Omzet</TableHead>}
                          <TableHead className="text-right w-36">BTW</TableHead>
                          <TableHead className="text-center w-28">Actie</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupBoxes.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={isCalculationGroup ? 3 : 4} className="text-center text-muted-foreground text-sm py-4">
                              Geen boekingen in deze groep
                            </TableCell>
                          </TableRow>
                        ) : (
                          groupBoxes.map(({ code, box }) => {
                            const hasData = Number(box!.turnover_amount) !== 0 || Number(box!.vat_amount) !== 0
                            const isSubtotal = ['5a', '5c', '5g'].includes(code)
                            return (
                              <TableRow key={code} className={isSubtotal ? 'font-semibold bg-muted/20' : ''}>
                                <TableCell className="font-mono text-sm">{code}</TableCell>
                                <TableCell>{box!.box_name}</TableCell>
                                {!isCalculationGroup && (
                                  <TableCell className="text-right">
                                    {Number(box!.turnover_amount) !== 0 ? formatMoney(box!.turnover_amount) : <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                )}
                                <TableCell className="text-right">
                                  {Number(box!.vat_amount) !== 0 ? formatMoney(box!.vat_amount) : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-center">
                                  {hasData && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setDrilldownBoxCode(code)
                                        setDrilldownBoxName(box!.box_name)
                                        setDrilldownOpen(true)
                                      }}
                                    >
                                      <Eye size={14} className="mr-1" />
                                      Herkomst
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Afwijkingen */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Afwijkingen en controles
                {anomalies.length > 0 && (
                  <Badge variant={redCount > 0 ? 'destructive' : 'secondary'}>{anomalies.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Rode fouten blokkeren "Markeer als klaar". Gele waarschuwingen zijn toegestaan maar vereisen controle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {anomalies.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                  <CheckCircle size={36} weight="duotone" className="text-green-500" />
                  <p className="font-medium text-green-700 dark:text-green-400">Geen afwijkingen gevonden</p>
                  <p className="text-sm">De BTW-aangifte kan worden ingediend.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {redCount > 0 && (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                        Blokkerende fouten ({redCount})
                      </p>
                      {anomalies.filter((a) => a.severity === 'RED').map((a) => <AnomalyRow key={a.id} anomaly={a} />)}
                    </>
                  )}
                  {yellowCount > 0 && (
                    <>
                      {redCount > 0 && <Separator className="my-2" />}
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        Waarschuwingen ({yellowCount})
                      </p>
                      {anomalies.filter((a) => a.severity === 'YELLOW').map((a) => <AnomalyRow key={a.id} anomaly={a} />)}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ICP */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe size={18} />
                ICP overzicht (EU B2B)
              </CardTitle>
              <CardDescription>
                Intracommunautaire leveringen — Totaal: <strong>{formatMoney(icpReport?.total_supplies ?? 0)}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!icpReport || icpReport.entries.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                  <Globe size={32} className="opacity-40" />
                  <p className="text-sm">Geen intracommunautaire leveringen in deze periode</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>BTW-nummer</TableHead>
                      <TableHead>Land</TableHead>
                      <TableHead>Klant</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                      <TableHead className="text-right">Transacties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {icpReport.entries.map((entry) => (
                      <TableRow key={`${entry.customer_vat_number}-${entry.country_code}`}>
                        <TableCell className="font-mono text-sm">{entry.customer_vat_number}</TableCell>
                        <TableCell>{entry.country_code}</TableCell>
                        <TableCell>{entry.customer_name ?? '—'}</TableCell>
                        <TableCell className="text-right">{formatMoney(entry.taxable_base)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{entry.transaction_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Indienbestanden */}
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText size={18} weight="duotone" />
                Indienbestanden
              </CardTitle>
              <CardDescription>
                Download XML- of PDF-bestanden voor handmatige indiening bij de Belastingdienst.
                {redCount > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {' '}Los eerst {redCount} blokkerende fout{redCount !== 1 ? 'en' : ''} op.
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                variant="default"
                onClick={handleDownloadBtwXml}
                disabled={redCount > 0 || isBtwXmlLoading}
                title={redCount > 0 ? 'Los eerst blokkerende fouten op' : undefined}
              >
                {isBtwXmlLoading ? <Spinner size={16} className="mr-2 animate-spin" /> : <FileArrowDown size={16} className="mr-2" />}
                BTW indienbestand (XML)
              </Button>
              {icpReport && icpReport.entries.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleDownloadIcpXml}
                  disabled={redCount > 0 || isIcpXmlLoading}
                  title={redCount > 0 ? 'Los eerst blokkerende fouten op' : undefined}
                >
                  {isIcpXmlLoading ? <Spinner size={16} className="mr-2 animate-spin" /> : <Globe size={16} className="mr-2" />}
                  ICP opgaaf (XML)
                </Button>
              )}
              <Button variant="outline" onClick={handleExportPdf} disabled={isPdfLoading}>
                {isPdfLoading ? <Spinner size={16} className="mr-2 animate-spin" /> : <DownloadSimple size={16} className="mr-2" />}
                Rapport (PDF)
              </Button>
            </CardContent>
          </Card>

          {/* Generation timestamp */}
          <p className="text-xs text-center text-muted-foreground">
            Overzicht gegenereerd op{' '}
            {new Date(report.generated_at).toLocaleString('nl-NL', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </>
      )}

      {/* Submission history */}
      {selectedPeriodId && !isLoading && (
        <VATSubmissionHistory
          clientId={clientId}
          periodId={selectedPeriodId}
          onRefresh={() => loadReport(selectedPeriodId)}
        />
      )}

      {/* BTW Box Drilldown Drawer — always rendered so the Sheet can animate closed */}
      {selectedPeriodId && (
        <BTWBoxDrilldown
          open={drilldownOpen}
          onClose={() => setDrilldownOpen(false)}
          clientId={clientId}
          periodId={selectedPeriodId}
          boxCode={drilldownBoxCode}
          boxName={drilldownBoxName}
          onViewAudit={(entityId, entityType) => {
            setDrilldownOpen(false)
            navigateTo(`/accountant/clients/${clientId}/audit?entity_id=${entityId}&entity_type=${entityType}`)
          }}
        />
      )}
    </div>
  )
}
