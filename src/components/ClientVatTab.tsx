import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getErrorMessage, periodApi, vatApi, type Period, type VATAnomaly, type VATReportResponse, type ICPReportResponse } from '@/lib/api'
import { ArrowsClockwise, CheckCircle, DownloadSimple, FileArrowDown, Globe, Warning, WarningCircle } from '@phosphor-icons/react'

const BOX_ORDER = ['1a', '1b', '1c', '1d', '2a', '3a', '3b', '3c', '4a', '4b', '5a', '5b', '5c', '5d', '5e', '5f', '5g'] as const

const formatMoney = (value: string | number) => new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
}).format(typeof value === 'string' ? Number(value) : value)

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const anomalyTone = (severity: VATAnomaly['severity']) => {
  if (severity === 'RED') return 'bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-400'
  return 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400'
}

export const ClientVatTab = ({ clientId }: { clientId: string }) => {
  const [periods, setPeriods] = useState<Period[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('')
  const [report, setReport] = useState<VATReportResponse | null>(null)
  const [icpReport, setIcpReport] = useState<ICPReportResponse | null>(null)
  const [anomalies, setAnomalies] = useState<VATAnomaly[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [isMarkingReady, setIsMarkingReady] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriodId])

  const redCount = useMemo(() => anomalies.filter((a) => a.severity === 'RED').length, [anomalies])
  const yellowCount = useMemo(() => anomalies.filter((a) => a.severity === 'YELLOW').length, [anomalies])

  const handleValidate = async () => {
    if (!selectedPeriodId) return
    try {
      setIsValidating(true)
      setError(null)
      const response = await vatApi.validate(clientId, selectedPeriodId)
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
    if (!report) return
    const rows = [
      ['rubriek', 'omschrijving', 'omzet', 'btw'],
      ...BOX_ORDER.map((code) => {
        const box = report.boxes[code]
        return [code, box?.box_name || '', box?.turnover_amount || '0.00', box?.vat_amount || '0.00']
      }),
    ]
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `btw-overzicht-${report.period_name}.csv`)
  }

  const handleExportPdf = async () => {
    if (!selectedPeriodId || !report) return
    try {
      const blob = await vatApi.downloadPdf(clientId, selectedPeriodId)
      downloadBlob(blob, `btw-overzicht-${report.period_name}.pdf`)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleDownloadBtwSubmissionPackage = async () => {
    if (!selectedPeriodId || !report) return
    try {
      setError(null)
      const blob = await vatApi.downloadBtwSubmissionPackage(clientId, selectedPeriodId)
      const filename = `btw-aangifte-${report.period_name}-${report.start_date}.xml`
      downloadBlob(blob, filename)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleDownloadIcpSubmissionPackage = async () => {
    if (!selectedPeriodId || !report) return
    try {
      setError(null)
      const blob = await vatApi.downloadIcpSubmissionPackage(clientId, selectedPeriodId)
      const filename = `icp-opgaaf-${report.period_name}-${report.start_date}.xml`
      downloadBlob(blob, filename)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleMarkReady = async () => {
    if (!selectedPeriodId) return
    try {
      setIsMarkingReady(true)
      setError(null)
      const response = await periodApi.updateStatus(clientId, selectedPeriodId, { status: 'READY_FOR_FILING' })
      setMessage(response.message)
      await Promise.all([loadPeriods(), loadReport(selectedPeriodId)])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsMarkingReady(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>BTW-aangifte</CardTitle>
          <CardDescription>Genereer een concept, valideer afwijkingen, exporteer en markeer de periode als klaar voor handmatige indiening.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs space-y-2">
              <Label>Periode</Label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer periode" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((period) => (
                    <SelectItem value={period.id} key={period.id}>{period.name} ({period.period_type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleValidate} disabled={!selectedPeriodId || isValidating}>
              <ArrowsClockwise size={16} className="mr-2" />
              {isValidating ? 'Valideren...' : 'Valideren'}
            </Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={!report}>
              <DownloadSimple size={16} className="mr-2" />Download BTW overzicht (PDF)
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={!report}>
              <FileArrowDown size={16} className="mr-2" />Export CSV
            </Button>
            <Button onClick={handleMarkReady} disabled={!selectedPeriodId || isMarkingReady || redCount > 0}>
              <CheckCircle size={16} className="mr-2" />
              {isMarkingReady ? 'Opslaan...' : 'Markeer als klaar'}
            </Button>
          </div>

          {error && (
            <Alert className="bg-destructive/10 border-destructive/40">
              <AlertTitle>Fout bij BTW workflow</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {message && (
            <Alert className="bg-blue-500/10 border-blue-500/40">
              <AlertTitle>Status</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Badge variant={redCount > 0 ? 'destructive' : 'outline'}>{redCount} blokkerend</Badge>
            <Badge variant="outline" className="bg-amber-500/10 border-amber-500/40">{yellowCount} waarschuwingen</Badge>
            {report && <Badge variant="outline">Netto 5g: {formatMoney(report.net_vat)}</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Submission Packages Section */}
      {report && (
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardHeader>
            <CardTitle>Indienbestanden (Phase A)</CardTitle>
            <CardDescription>
              Download XML-bestanden voor handmatige indiening bij de Belastingdienst.
              {redCount > 0 && ' Let op: Los eerst blokkerende fouten op voordat je indient.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button 
                variant="default" 
                onClick={handleDownloadBtwSubmissionPackage}
                disabled={redCount > 0}
              >
                <FileArrowDown size={20} className="mr-2" />
                Download BTW indienbestand (XML)
              </Button>
              {icpReport && icpReport.entries.length > 0 && (
                <Button 
                  variant="outline" 
                  onClick={handleDownloadIcpSubmissionPackage}
                  disabled={redCount > 0}
                >
                  <Globe size={20} className="mr-2" />
                  Download ICP opgaaf (XML)
                </Button>
              )}
              <Button 
                variant="outline" 
                onClick={handleExportPdf}
              >
                <DownloadSimple size={20} className="mr-2" />
                Download rapport (PDF)
              </Button>
            </div>
            {redCount > 0 && (
              <Alert className="mt-4 bg-red-500/10 border-red-500/40">
                <WarningCircle className="h-4 w-4" />
                <AlertTitle>Indienen nog niet mogelijk</AlertTitle>
                <AlertDescription>
                  Er zijn {redCount} blokkerende fouten. Los deze eerst op voordat je het indienbestand downloadt.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rubrieken BTW-aangifte</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">BTW gegevens laden...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rubriek</TableHead>
                  <TableHead>Omschrijving</TableHead>
                  <TableHead className="text-right">Omzet</TableHead>
                  <TableHead className="text-right">BTW</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BOX_ORDER.map((code) => {
                  const box = report?.boxes[code]
                  return (
                    <TableRow key={code}>
                      <TableCell className="font-mono">{code}</TableCell>
                      <TableCell>{box?.box_name || '—'}</TableCell>
                      <TableCell className="text-right">{formatMoney(box?.turnover_amount || 0)}</TableCell>
                      <TableCell className="text-right">{formatMoney(box?.vat_amount || 0)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ICP overzicht (EU B2B)</CardTitle>
          <CardDescription>Totaal ICP: {formatMoney(icpReport?.total_supplies || 0)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BTW-nummer</TableHead>
                <TableHead>Land</TableHead>
                <TableHead>Klant</TableHead>
                <TableHead className="text-right">Bedrag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(icpReport?.entries || []).map((entry) => (
                <TableRow key={`${entry.customer_vat_number}-${entry.country_code}`}>
                  <TableCell>{entry.customer_vat_number}</TableCell>
                  <TableCell>{entry.country_code}</TableCell>
                  <TableCell>{entry.customer_name || '-'}</TableCell>
                  <TableCell className="text-right">{formatMoney(entry.taxable_base)}</TableCell>
                </TableRow>
              ))}
              {(!icpReport || icpReport.entries.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">Geen ICP transacties in deze periode</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Afwijkingen</CardTitle>
          <CardDescription>Rode afwijkingen blokkeren "Markeer als klaar". Gele afwijkingen zijn toegestaan na controle.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {anomalies.length === 0 ? (
            <p className="text-sm text-green-700 dark:text-green-400">Geen afwijkingen gevonden.</p>
          ) : anomalies.map((anomaly) => (
            <div key={anomaly.id} className={`rounded-lg border p-3 ${anomalyTone(anomaly.severity)}`}>
              <div className="flex items-center gap-2 font-medium">
                {anomaly.severity === 'RED' ? <WarningCircle size={16} /> : <Warning size={16} />}
                {anomaly.title}
              </div>
              <p className="mt-1 text-sm">{anomaly.description}</p>
              {anomaly.suggested_fix && <p className="mt-1 text-xs">Suggestie: {anomaly.suggested_fix}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
