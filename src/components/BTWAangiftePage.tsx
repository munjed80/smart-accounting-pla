/**
 * BTW Aangifte Page
 * 
 * Dutch VAT return page for accountants showing:
 * - VAT boxes with amounts
 * - Anomalies list (RED/YELLOW)
 * - ICP supplies summary
 * - Export-ready layout
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import {
  FileText,
  ArrowsClockwise,
  WarningCircle,
  Warning,
  CheckCircle,
  Export,
  CurrencyEur,
  Globe,
  Buildings,
  Info,
  FileArrowDown,
  DownloadSimple,
} from '@phosphor-icons/react'
import { format } from 'date-fns'

// Types
interface VatBox {
  box_code: string
  box_name: string
  turnover_amount: string
  vat_amount: string
  transaction_count: number
}

interface VatCodeSummary {
  vat_code_id: string
  vat_code: string
  vat_code_name: string
  vat_rate: string
  category: string
  base_amount: string
  vat_amount: string
  transaction_count: number
}

interface VatAnomaly {
  id: string
  code: string
  severity: 'RED' | 'YELLOW'
  title: string
  description: string
  journal_entry_id?: string
  journal_line_id?: string
  document_id?: string
  suggested_fix?: string
  amount_discrepancy?: string
}

interface ICPEntry {
  customer_vat_number: string
  country_code: string
  customer_name?: string
  customer_id?: string
  taxable_base: string
  transaction_count: number
}

interface BTWAangifteReport {
  period_id: string
  period_name: string
  start_date: string
  end_date: string
  generated_at: string
  boxes: Record<string, VatBox>
  vat_code_summaries: VatCodeSummary[]
  total_turnover: string
  total_vat_payable: string
  total_vat_receivable: string
  net_vat: string
  anomalies: VatAnomaly[]
  has_red_anomalies: boolean
  has_yellow_anomalies: boolean
  icp_entries: ICPEntry[]
  total_icp_supplies: string
}

// Dutch VAT box display order and grouping
const VAT_BOX_GROUPS = {
  "Binnenlandse prestaties": ["1a", "1b", "1c", "1d", "1e"],
  "EU-transacties": ["2a", "3a", "3b"],
  "Verlegging": ["4a", "4b"],
  "Berekening": ["5a", "5b", "5c", "5d", "5e", "5f", "5g"],
}

// Format currency for Dutch locale
const formatCurrency = (amount: string | number) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(num)
}

// Severity badge component
const SeverityBadge = ({ severity }: { severity: 'RED' | 'YELLOW' }) => {
  if (severity === 'RED') {
    return (
      <Badge variant="destructive" className="gap-1">
        <WarningCircle size={14} weight="fill" />
        Blokkerende fout
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40 gap-1">
      <Warning size={14} weight="fill" />
      Waarschuwing
    </Badge>
  )
}

// VAT Box Row component
const VatBoxRow = ({ box, showTurnover = true }: { box: VatBox, showTurnover?: boolean }) => {
  const turnover = parseFloat(box.turnover_amount)
  const vat = parseFloat(box.vat_amount)
  const isCalculationBox = box.box_code.startsWith('5')
  const isSubtotalBox = ['5a', '5c', '5g'].includes(box.box_code)
  
  return (
    <TableRow className={isSubtotalBox ? 'font-semibold bg-muted/30' : ''}>
      <TableCell className="font-mono">{box.box_code}</TableCell>
      <TableCell className="max-w-[300px]">{box.box_name}</TableCell>
      {showTurnover && (
        <TableCell className="text-right">
          {!isCalculationBox && turnover !== 0 ? formatCurrency(turnover) : '-'}
        </TableCell>
      )}
      <TableCell className="text-right">
        {vat !== 0 ? formatCurrency(vat) : '-'}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {!isCalculationBox && box.transaction_count > 0 ? box.transaction_count : '-'}
      </TableCell>
    </TableRow>
  )
}

// Anomaly card component
const AnomalyCard = ({ 
  anomaly, 
  onViewEntry 
}: { 
  anomaly: VatAnomaly
  onViewEntry?: (entryId: string) => void 
}) => {
  const isRed = anomaly.severity === 'RED'
  const bgColor = isRed ? 'bg-red-500/10' : 'bg-amber-500/10'
  const borderColor = isRed ? 'border-red-500/30' : 'border-amber-500/30'
  const textColor = isRed ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
  
  return (
    <div className={`p-4 rounded-lg ${bgColor} border ${borderColor}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <SeverityBadge severity={anomaly.severity} />
            <code className="text-xs bg-muted px-2 py-0.5 rounded">{anomaly.code}</code>
          </div>
          <h4 className={`font-medium ${textColor}`}>{anomaly.title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{anomaly.description}</p>
          {anomaly.suggested_fix && (
            <p className="text-sm mt-2">
              <span className="font-medium">Suggestie:</span> {anomaly.suggested_fix}
            </p>
          )}
          {anomaly.amount_discrepancy && (
            <p className="text-sm mt-1">
              <span className="font-medium">Verschil:</span> {formatCurrency(anomaly.amount_discrepancy)}
            </p>
          )}
        </div>
        {anomaly.journal_entry_id && onViewEntry && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onViewEntry(anomaly.journal_entry_id!)}
          >
            Bekijk boeking
          </Button>
        )}
      </div>
    </div>
  )
}

// ICP Entry row component
const ICPEntryRow = ({ entry }: { entry: ICPEntry }) => {
  return (
    <TableRow>
      <TableCell className="font-mono">{entry.customer_vat_number}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-muted-foreground" />
          {entry.country_code}
        </div>
      </TableCell>
      <TableCell>{entry.customer_name || '-'}</TableCell>
      <TableCell className="text-right">{formatCurrency(entry.taxable_base)}</TableCell>
      <TableCell className="text-right text-muted-foreground">{entry.transaction_count}</TableCell>
    </TableRow>
  )
}

// Main component
export const BTWAangiftePage = ({
  clientId,
  periodId,
  report,
  isLoading,
  onRefresh,
  onViewEntry,
  onDownloadSubmissionPackage,
  onDownloadReport,
  onDownloadIcpPackage,
}: {
  clientId: string
  periodId: string
  report: BTWAangifteReport | null
  isLoading: boolean
  onRefresh: () => void
  onViewEntry?: (entryId: string) => void
  onDownloadSubmissionPackage?: () => void
  onDownloadReport?: () => void
  onDownloadIcpPackage?: () => void
}) => {
  const [activeTab, setActiveTab] = useState('boxes')
  
  // Use delayed loading to prevent skeleton flash
  const showLoading = useDelayedLoading(isLoading, 300, !!report)
  
  if (showLoading) {
    return (
      <Card className="opacity-0 animate-in fade-in duration-300">
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    )
  }
  
  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={24} />
            BTW Aangifte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Geen gegevens</AlertTitle>
            <AlertDescription>
              Selecteer een periode om de BTW aangifte te bekijken.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }
  
  const netVat = parseFloat(report.net_vat)
  const isRefund = netVat < 0
  
  return (
    <div className="space-y-6 opacity-0 animate-in fade-in duration-500">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CurrencyEur size={24} weight="duotone" />
              BTW Aangifte - {report.period_name}
            </CardTitle>
            <CardDescription>
              Periode: {format(new Date(report.start_date), 'd MMM yyyy')} - {format(new Date(report.end_date), 'd MMM yyyy')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <ArrowsClockwise size={16} className="mr-2" />
              Vernieuwen
            </Button>
            {onDownloadSubmissionPackage && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={onDownloadSubmissionPackage}
                disabled={report.has_red_anomalies}
              >
                <FileArrowDown size={16} className="mr-2" />
                Download indienbestand
              </Button>
            )}
            {onDownloadReport && (
              <Button variant="outline" size="sm" onClick={onDownloadReport}>
                <DownloadSimple size={16} className="mr-2" />
                Download rapport
              </Button>
            )}
            {onDownloadIcpPackage && report.icp_entries.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onDownloadIcpPackage}
              >
                <Globe size={16} className="mr-2" />
                Download ICP opgaaf
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Totaal omzet</div>
              <div className="text-2xl font-bold">{formatCurrency(report.total_turnover)}</div>
            </div>
            <div className="p-4 rounded-lg bg-blue-500/10">
              <div className="text-sm text-muted-foreground">Verschuldigde BTW</div>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                {formatCurrency(report.total_vat_payable)}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-green-500/10">
              <div className="text-sm text-muted-foreground">Voorbelasting</div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                {formatCurrency(report.total_vat_receivable)}
              </div>
            </div>
            <div className={`p-4 rounded-lg ${isRefund ? 'bg-green-500/20' : 'bg-amber-500/20'}`}>
              <div className="text-sm text-muted-foreground">
                {isRefund ? 'Te ontvangen' : 'Te betalen'}
              </div>
              <div className={`text-2xl font-bold ${isRefund ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {formatCurrency(Math.abs(netVat))}
              </div>
            </div>
          </div>
          
          {/* Status alerts */}
          {report.has_red_anomalies && (
            <Alert className="bg-red-500/10 border-red-500/40 mb-4">
              <WarningCircle className="h-4 w-4" />
              <AlertTitle>Blokkerende fouten gevonden</AlertTitle>
              <AlertDescription>
                Er zijn {report.anomalies.filter(a => a.severity === 'RED').length} blokkerende fouten 
                die opgelost moeten worden voordat de aangifte ingediend kan worden.
              </AlertDescription>
            </Alert>
          )}
          
          {!report.has_red_anomalies && report.has_yellow_anomalies && (
            <Alert className="bg-amber-500/10 border-amber-500/40 mb-4">
              <Warning className="h-4 w-4" />
              <AlertTitle>Waarschuwingen</AlertTitle>
              <AlertDescription>
                Er zijn {report.anomalies.filter(a => a.severity === 'YELLOW').length} waarschuwingen. 
                Controleer deze voordat u de aangifte indient.
              </AlertDescription>
            </Alert>
          )}
          
          {!report.has_red_anomalies && !report.has_yellow_anomalies && (
            <Alert className="bg-green-500/10 border-green-500/40 mb-4">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Gereed voor aangifte</AlertTitle>
              <AlertDescription>
                Geen fouten of waarschuwingen gevonden. De BTW aangifte kan worden ingediend.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      
      {/* Tabbed content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="boxes">BTW Rubrieken</TabsTrigger>
          <TabsTrigger value="codes">Per BTW code</TabsTrigger>
          <TabsTrigger value="anomalies" className="relative">
            Afwijkingen
            {report.anomalies.length > 0 && (
              <Badge 
                variant={report.has_red_anomalies ? "destructive" : "secondary"} 
                className="ml-2"
              >
                {report.anomalies.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="icp">
            ICP Opgaaf
            {report.icp_entries.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {report.icp_entries.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        
        {/* BTW Boxes Tab */}
        <TabsContent value="boxes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>BTW Aangifte Rubrieken</CardTitle>
              <CardDescription>
                Overzicht van alle rubrieken volgens het formaat van de Belastingdienst
              </CardDescription>
            </CardHeader>
            <CardContent>
              {Object.entries(VAT_BOX_GROUPS).map(([groupName, boxCodes]) => (
                <div key={groupName} className="mb-6">
                  <h4 className="font-semibold mb-2">{groupName}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Rubriek</TableHead>
                        <TableHead>Omschrijving</TableHead>
                        {!groupName.includes('Berekening') && (
                          <TableHead className="text-right w-32">Omzet</TableHead>
                        )}
                        <TableHead className="text-right w-32">BTW</TableHead>
                        <TableHead className="text-right w-24">Aantal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {boxCodes.map(code => {
                        const box = report.boxes[code]
                        if (!box) return null
                        return (
                          <VatBoxRow 
                            key={code} 
                            box={box}
                            showTurnover={!groupName.includes('Berekening')} 
                          />
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* VAT Codes Tab */}
        <TabsContent value="codes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Uitsplitsing per BTW code</CardTitle>
              <CardDescription>
                Totalen per gebruikte BTW code
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BTW Code</TableHead>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead>Categorie</TableHead>
                    <TableHead className="text-right">Tarief</TableHead>
                    <TableHead className="text-right">Grondslag</TableHead>
                    <TableHead className="text-right">BTW</TableHead>
                    <TableHead className="text-right">Aantal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.vat_code_summaries.map(summary => (
                    <TableRow key={summary.vat_code_id}>
                      <TableCell className="font-mono">{summary.vat_code}</TableCell>
                      <TableCell>{summary.vat_code_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{summary.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{summary.vat_rate}%</TableCell>
                      <TableCell className="text-right">{formatCurrency(summary.base_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(summary.vat_amount)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {summary.transaction_count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Anomalies Tab */}
        <TabsContent value="anomalies" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Afwijkingen en waarschuwingen</CardTitle>
              <CardDescription>
                Gedetecteerde problemen die aandacht vereisen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.anomalies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
                  <p>Geen afwijkingen gevonden</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Red anomalies first */}
                  {report.anomalies
                    .filter(a => a.severity === 'RED')
                    .map(anomaly => (
                      <AnomalyCard 
                        key={anomaly.id} 
                        anomaly={anomaly}
                        onViewEntry={onViewEntry}
                      />
                    ))}
                  
                  {/* Then yellow anomalies */}
                  {report.anomalies
                    .filter(a => a.severity === 'YELLOW')
                    .map(anomaly => (
                      <AnomalyCard 
                        key={anomaly.id} 
                        anomaly={anomaly}
                        onViewEntry={onViewEntry}
                      />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* ICP Tab */}
        <TabsContent value="icp" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Buildings size={20} />
                    ICP Opgaaf (Opgaaf ICL)
                  </CardTitle>
                  <CardDescription>
                    Intracommunautaire leveringen aan EU-afnemers
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Totaal ICP</div>
                  <div className="text-xl font-bold">{formatCurrency(report.total_icp_supplies)}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {report.icp_entries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Globe size={48} className="mx-auto mb-4" />
                  <p>Geen intracommunautaire leveringen in deze periode</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>BTW-nummer afnemer</TableHead>
                      <TableHead>Land</TableHead>
                      <TableHead>Naam</TableHead>
                      <TableHead className="text-right">Totaal bedrag</TableHead>
                      <TableHead className="text-right">Transacties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.icp_entries.map(entry => (
                      <ICPEntryRow key={entry.customer_vat_number} entry={entry} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Footer with generation info */}
      <div className="text-sm text-muted-foreground text-center">
        Gegenereerd op {format(new Date(report.generated_at), 'd MMMM yyyy HH:mm')}
      </div>
    </div>
  )
}

export default BTWAangiftePage
