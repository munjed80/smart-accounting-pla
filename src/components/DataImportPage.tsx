/**
 * Data Import Page – "Data importeren"
 *
 * Three import flows: Klanten, Facturen, Uitgaven.
 * Each flow: download template → upload CSV → preview → confirm.
 * All text in Dutch. Mobile responsive.
 */

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Users,
  Invoice,
  Receipt,
  DownloadSimple,
  UploadSimple,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Warning,
  FileText,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import {
  zzpImportApi,
  getErrorMessage,
  type ImportPreviewRow,
  type ImportRowError,
} from '@/lib/api'

// ============================================================================
// CSV Template Definitions
// ============================================================================

const CUSTOMER_TEMPLATE =
  'naam;email;adres;postcode;stad;kvk_nummer;btw_nummer\n' +
  'Voorbeeld BV;info@voorbeeld.nl;Keizersgracht 123;1015 AA;Amsterdam;12345678;NL123456789B01\n'

const INVOICE_TEMPLATE =
  'factuurnummer;datum;klant_naam;bedrag_incl_btw;btw_bedrag;status\n' +
  'INV-2024-0001;01-01-2024;Voorbeeld BV;1210,00;210,00;betaald\n'

const EXPENSE_TEMPLATE =
  'datum;bedrag;btw_bedrag;categorie;omschrijving;leverancier\n' +
  '15-03-2024;121,00;21,00;kantoor;Kantoorbenodigdheden;Staples BV\n'

// ============================================================================
// Types
// ============================================================================

type ImportType = 'customers' | 'invoices' | 'expenses'
type ImportStep = 'overview' | 'upload' | 'preview' | 'result'

interface ImportResult {
  imported_count: number
  skipped_count: number
  total_count: number
  errors: ImportRowError[]
  message: string
}

// ============================================================================
// Helpers
// ============================================================================

function downloadTemplate(type: ImportType) {
  let content: string
  let filename: string

  switch (type) {
    case 'customers':
      content = CUSTOMER_TEMPLATE
      filename = 'klanten_template.csv'
      break
    case 'invoices':
      content = INVOICE_TEMPLATE
      filename = 'facturen_template.csv'
      break
    case 'expenses':
      content = EXPENSE_TEMPLATE
      filename = 'uitgaven_template.csv'
      break
  }

  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function getColumnHeaders(type: ImportType): string[] {
  switch (type) {
    case 'customers':
      return ['naam', 'email', 'adres', 'postcode', 'stad', 'kvk_nummer', 'btw_nummer']
    case 'invoices':
      return ['factuurnummer', 'datum', 'klant_naam', 'bedrag_incl_btw', 'btw_bedrag', 'status']
    case 'expenses':
      return ['datum', 'bedrag', 'btw_bedrag', 'categorie', 'omschrijving', 'leverancier']
  }
}

function getColumnLabel(col: string): string {
  const map: Record<string, string> = {
    naam: t('dataImport.colNaam'),
    email: t('dataImport.colEmail'),
    adres: t('dataImport.colAdres'),
    postcode: t('dataImport.colPostcode'),
    stad: t('dataImport.colStad'),
    kvk_nummer: t('dataImport.colKvkNummer'),
    btw_nummer: t('dataImport.colBtwNummer'),
    factuurnummer: t('dataImport.colFactuurnummer'),
    datum: t('dataImport.colDatum'),
    klant_naam: t('dataImport.colKlantNaam'),
    bedrag_incl_btw: t('dataImport.colBedragInclBtw'),
    btw_bedrag: t('dataImport.colBtwBedrag'),
    status: t('dataImport.colStatus'),
    bedrag: t('dataImport.colBedrag'),
    categorie: t('dataImport.colCategorie'),
    omschrijving: t('dataImport.colOmschrijving'),
    leverancier: t('dataImport.colLeverancier'),
  }
  return map[col] ?? col
}

// Map parsed data keys back to display columns
function getDisplayValue(row: ImportPreviewRow, col: string): string {
  const dataKeyMap: Record<string, string> = {
    naam: 'name',
    email: 'email',
    adres: 'address_street',
    postcode: 'address_postal_code',
    stad: 'address_city',
    kvk_nummer: 'kvk_number',
    btw_nummer: 'btw_number',
    factuurnummer: 'invoice_number',
    datum: 'issue_date',
    klant_naam: 'customer_name',
    bedrag_incl_btw: 'total_cents',
    btw_bedrag: 'vat_total_cents',
    status: 'status',
    bedrag: 'amount_cents',
    categorie: 'category',
    omschrijving: 'description',
    leverancier: 'vendor',
  }

  // For expenses, datum maps to expense_date
  if (col === 'datum' && 'expense_date' in row.data) {
    return String(row.data['expense_date'] ?? '')
  }
  if (col === 'btw_bedrag' && 'vat_amount_cents' in row.data) {
    const cents = row.data['vat_amount_cents']
    if (typeof cents === 'number') return `€${(cents / 100).toFixed(2)}`
    return ''
  }

  const key = dataKeyMap[col] ?? col
  const val = row.data[key]

  // Format cents as currency
  if ((col === 'bedrag_incl_btw' || col === 'bedrag') && typeof val === 'number') {
    return `€${(val / 100).toFixed(2)}`
  }
  if (col === 'btw_bedrag' && typeof val === 'number') {
    return `€${(val / 100).toFixed(2)}`
  }

  return val != null ? String(val) : ''
}

// ============================================================================
// Component
// ============================================================================

export function DataImportPage() {
  const [step, setStep] = useState<ImportStep>('overview')
  const [importType, setImportType] = useState<ImportType>('customers')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [validRows, setValidRows] = useState(0)
  const [errorRows, setErrorRows] = useState(0)
  const [allErrors, setAllErrors] = useState<ImportRowError[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setSelectedFile(null)
    setPreviewRows([])
    setTotalRows(0)
    setValidRows(0)
    setErrorRows(0)
    setAllErrors([])
    setResult(null)
    setIsUploading(false)
    setIsImporting(false)
  }, [])

  const handleStartImport = (type: ImportType) => {
    resetState()
    setImportType(type)
    setStep('upload')
  }

  const handleBackToOverview = () => {
    resetState()
    setStep('overview')
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)

    // Auto-preview on file select
    setIsUploading(true)
    try {
      let response
      switch (importType) {
        case 'customers':
          response = await zzpImportApi.customers.preview(file)
          break
        case 'invoices':
          response = await zzpImportApi.invoices.preview(file)
          break
        case 'expenses':
          response = await zzpImportApi.expenses.preview(file)
          break
      }

      setPreviewRows(response.preview_rows)
      setTotalRows(response.total_rows)
      setValidRows(response.valid_rows)
      setErrorRows(response.error_rows)
      setAllErrors(response.errors)
      setStep('preview')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsUploading(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!selectedFile) return

    setIsImporting(true)
    try {
      let response
      switch (importType) {
        case 'customers':
          response = await zzpImportApi.customers.confirm(selectedFile)
          break
        case 'invoices':
          response = await zzpImportApi.invoices.confirm(selectedFile)
          break
        case 'expenses':
          response = await zzpImportApi.expenses.confirm(selectedFile)
          break
      }

      setResult(response)
      setStep('result')
      toast.success(response.message)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsImporting(false)
    }
  }

  const getTypeLabel = (type: ImportType): string => {
    switch (type) {
      case 'customers': return t('dataImport.customersTitle')
      case 'invoices': return t('dataImport.invoicesTitle')
      case 'expenses': return t('dataImport.expensesTitle')
    }
  }

  // =========================================================================
  // Overview – Three cards
  // =========================================================================
  if (step === 'overview') {
    return (
      <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">{t('dataImport.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('dataImport.description')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Klanten */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-950">
                  <Users size={24} className="text-blue-600 dark:text-blue-400" weight="duotone" />
                </div>
                <div>
                  <CardTitle className="text-lg">{t('dataImport.customersTitle')}</CardTitle>
                  <CardDescription>{t('dataImport.customersDescription')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => downloadTemplate('customers')}
              >
                <DownloadSimple size={16} className="mr-2" />
                {t('dataImport.downloadTemplate')}
              </Button>
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleStartImport('customers')}
              >
                <UploadSimple size={16} className="mr-2" />
                {t('dataImport.uploadCsv')}
              </Button>
            </CardContent>
          </Card>

          {/* Facturen */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-50 p-2 dark:bg-green-950">
                  <Invoice size={24} className="text-green-600 dark:text-green-400" weight="duotone" />
                </div>
                <div>
                  <CardTitle className="text-lg">{t('dataImport.invoicesTitle')}</CardTitle>
                  <CardDescription>{t('dataImport.invoicesDescription')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => downloadTemplate('invoices')}
              >
                <DownloadSimple size={16} className="mr-2" />
                {t('dataImport.downloadTemplate')}
              </Button>
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleStartImport('invoices')}
              >
                <UploadSimple size={16} className="mr-2" />
                {t('dataImport.uploadCsv')}
              </Button>
            </CardContent>
          </Card>

          {/* Uitgaven */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-orange-50 p-2 dark:bg-orange-950">
                  <Receipt size={24} className="text-orange-600 dark:text-orange-400" weight="duotone" />
                </div>
                <div>
                  <CardTitle className="text-lg">{t('dataImport.expensesTitle')}</CardTitle>
                  <CardDescription>{t('dataImport.expensesDescription')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => downloadTemplate('expenses')}
              >
                <DownloadSimple size={16} className="mr-2" />
                {t('dataImport.downloadTemplate')}
              </Button>
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleStartImport('expenses')}
              >
                <UploadSimple size={16} className="mr-2" />
                {t('dataImport.uploadCsv')}
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-sm text-muted-foreground">{t('dataImport.csvRequirements')}</p>
      </div>
    )
  }

  // =========================================================================
  // Upload step – File picker
  // =========================================================================
  if (step === 'upload') {
    return (
      <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" onClick={handleBackToOverview}>
          <ArrowLeft size={16} className="mr-2" />
          {t('dataImport.backToOverview')}
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>{getTypeLabel(importType)}</CardTitle>
            <CardDescription>{t('dataImport.csvRequirements')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 gap-4">
              <FileText size={48} className="text-muted-foreground" />
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <span className="animate-pulse">Laden...</span>
                ) : (
                  <>
                    <UploadSimple size={16} className="mr-2" />
                    {t('dataImport.selectFile')}
                  </>
                )}
              </Button>
              {selectedFile && (
                <p className="text-sm text-muted-foreground">{selectedFile.name}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadTemplate(importType)}
            >
              <DownloadSimple size={16} className="mr-2" />
              {t('dataImport.downloadTemplate')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // =========================================================================
  // Preview step – Table with validation
  // =========================================================================
  if (step === 'preview') {
    const columns = getColumnHeaders(importType)

    return (
      <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
        <Button variant="ghost" size="sm" onClick={handleBackToOverview}>
          <ArrowLeft size={16} className="mr-2" />
          {t('dataImport.backToOverview')}
        </Button>

        <div>
          <h2 className="text-xl font-bold">{t('dataImport.previewTitle')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {t('dataImport.previewDescription')}
          </p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{t('dataImport.totalRows')}: {totalRows}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400">
              <CheckCircle size={14} className="mr-1" />
              {t('dataImport.validRows')}: {validRows}
            </Badge>
          </div>
          {errorRows > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-400">
                <XCircle size={14} className="mr-1" />
                {t('dataImport.errorRows')}: {errorRows}
              </Badge>
            </div>
          )}
        </div>

        {/* Preview table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">{t('dataImport.rowNumber')}</TableHead>
                  {columns.map((col) => (
                    <TableHead key={col}>{getColumnLabel(col)}</TableHead>
                  ))}
                  <TableHead className="w-16">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => (
                  <TableRow
                    key={row.row_number}
                    className={!row.valid ? 'bg-red-50 dark:bg-red-950/30' : ''}
                  >
                    <TableCell className="font-mono text-xs">{row.row_number}</TableCell>
                    {columns.map((col) => {
                      const hasError = row.errors.some((e) => {
                        // Match field to column
                        const fieldToCol: Record<string, string> = {
                          naam: 'naam',
                          email: 'email',
                          factuurnummer: 'factuurnummer',
                          datum: 'datum',
                          klant_naam: 'klant_naam',
                          bedrag_incl_btw: 'bedrag_incl_btw',
                          btw_bedrag: 'btw_bedrag',
                          bedrag: 'bedrag',
                          categorie: 'categorie',
                          leverancier: 'leverancier',
                        }
                        return fieldToCol[e.field] === col || e.field === col
                      })
                      return (
                        <TableCell
                          key={col}
                          className={hasError ? 'text-red-600 dark:text-red-400 font-medium' : ''}
                        >
                          {getDisplayValue(row, col)}
                          {hasError && (
                            <div className="text-xs text-red-500 mt-0.5">
                              {row.errors
                                .filter((e) => e.field === col)
                                .map((e) => e.message)
                                .join(', ')}
                            </div>
                          )}
                        </TableCell>
                      )
                    })}
                    <TableCell>
                      {row.valid ? (
                        <CheckCircle size={18} className="text-green-600" weight="fill" />
                      ) : (
                        <XCircle size={18} className="text-red-500" weight="fill" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Error summary (if more than preview) */}
        {allErrors.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Warning size={18} className="text-amber-500" />
                Validatiefouten ({allErrors.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {allErrors.slice(0, 20).map((err, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    <span className="font-mono text-xs">Rij {err.row}</span> –{' '}
                    <span className="font-medium">{err.field}</span>: {err.message}
                  </p>
                ))}
                {allErrors.length > 20 && (
                  <p className="text-sm text-muted-foreground italic">
                    ...en {allErrors.length - 20} meer fouten
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleConfirmImport}
            disabled={isImporting || validRows === 0}
            className="sm:w-auto"
          >
            {isImporting ? (
              <span className="animate-pulse">Importeren...</span>
            ) : (
              <>
                <UploadSimple size={16} className="mr-2" />
                {t('dataImport.importButton')} ({validRows} rijen)
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleBackToOverview} className="sm:w-auto">
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    )
  }

  // =========================================================================
  // Result step
  // =========================================================================
  if (step === 'result' && result) {
    return (
      <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto">
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle size={32} className="text-green-600" weight="fill" />
              <div>
                <CardTitle className="text-lg">{t('dataImport.importSuccess')}</CardTitle>
                <CardDescription>{result.message}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">{t('dataImport.totalRows')}</span>
                <span className="font-medium">{result.total_count}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle size={14} />
                  {t('dataImport.importedCount')}
                </span>
                <span className="font-medium text-green-600">{result.imported_count}</span>
              </div>
              {result.skipped_count > 0 && (
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-amber-600 flex items-center gap-1">
                    <Warning size={14} />
                    {t('dataImport.skippedCount')}
                  </span>
                  <span className="font-medium text-amber-600">{result.skipped_count}</span>
                </div>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">Fouten bij overgeslagen rijen:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {result.errors.slice(0, 10).map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      Rij {err.row}: {err.field} – {err.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={handleBackToOverview}>
          <ArrowLeft size={16} className="mr-2" />
          {t('dataImport.backToOverview')}
        </Button>
      </div>
    )
  }

  return null
}
