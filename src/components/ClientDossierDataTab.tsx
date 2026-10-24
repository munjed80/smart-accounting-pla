import { useEffect, useMemo, useState, useRef } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { accountantDossierApi, getErrorMessage, ZZPExpense, ZZPInvoice, ZZPTimeEntry } from '@/lib/api'
import { DownloadSimple, ArrowClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface Props {
  clientId: string
  type: 'invoices' | 'expenses' | 'hours'
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoke URL after a small delay to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

export function ClientDossierDataTab({ clientId, type }: Props) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown | null>(null)
  const [invoices, setInvoices] = useState<ZZPInvoice[]>([])
  const [expenses, setExpenses] = useState<ZZPExpense[]>([])
  const [hours, setHours] = useState<ZZPTimeEntry[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 50
  const version = useRef(0)
  const search = window.location.search
  const commitmentIdFilter = useMemo(() => {
    if (type !== 'expenses') return null
    const params = new URLSearchParams(window.location.search)
    return params.get('commitmentId')
  }, [type, search])

  const load = async () => {
    if (!clientId) {
      setError({ message: 'Geen klant geselecteerd.' })
      setIsLoading(false)
      return
    }

    const request = ++version.current
    const pagination = { limit: pageSize, offset: (page - 1) * pageSize }
    setIsLoading(true)
    setError(null)
    try {
      if (type === 'invoices') {
        const response = await accountantDossierApi.getInvoices(clientId, pagination)
        if (request !== version.current) return
        setTotal(response.total)
        setInvoices(response.invoices)
      } else if (type === 'expenses') {
        const response = await accountantDossierApi.getExpenses(
          clientId,
          { ...pagination, ...(commitmentIdFilter ? { commitment_id: commitmentIdFilter } : {}) },
        )
        if (request !== version.current) return
        setTotal(response.total)
        setExpenses(response.expenses)
      } else {
        const response = await accountantDossierApi.getHours(clientId, pagination)
        if (request !== version.current) return
        setTotal(response.total)
        setHours(response.entries)
      }
    } catch (err: unknown) {
      if (request === version.current) setError(err)
    } finally {
      if (request === version.current) setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
    return () => { version.current += 1 }
  }, [clientId, type, commitmentIdFilter, page])

  const handleExport = async () => {
    setIsExporting(true)
    try {
      let blob: Blob
      let filename: string
      
      if (type === 'invoices') {
        blob = await accountantDossierApi.exportInvoicesCsv(clientId)
        filename = `facturen-${new Date().toISOString().split('T')[0]}.csv`
      } else if (type === 'expenses') {
        blob = await accountantDossierApi.exportExpensesCsv(
          clientId,
          commitmentIdFilter ? { commitment_id: commitmentIdFilter } : undefined
        )
        filename = `uitgaven-${new Date().toISOString().split('T')[0]}.csv`
      } else {
        blob = await accountantDossierApi.exportHoursCsv(clientId)
        filename = `uren-${new Date().toISOString().split('T')[0]}.csv`
      }
      
      downloadBlob(blob, filename)
      toast.success('Export succesvol gedownload')
    } catch (err) {
      toast.error('Export mislukt: ' + getErrorMessage(err))
    } finally {
      setIsExporting(false)
    }
  }

  if (isLoading) {
    return <Skeleton className="h-28 w-full" />
  }

  if (error) {
    return (
      <Alert className="bg-destructive/10 border-destructive/40">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>
            {getErrorMessage(error)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load()}
            className="shrink-0"
          >
            <ArrowClockwise size={16} className="mr-2" />
            Opnieuw proberen
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const hasData = type === 'invoices' ? invoices.length > 0 : type === 'expenses' ? expenses.length > 0 : hours.length > 0
  const emptyMessage = type === 'invoices' 
    ? 'Geen facturen gevonden' 
    : type === 'expenses' 
      ? (commitmentIdFilter ? 'Geen uitgaven gevonden voor deze verplichting' : 'Geen uitgaven gevonden')
      : 'Geen uren gevonden'

  return (
    <div>
      {hasData && (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={handleExport}
            disabled={isExporting}
            variant="outline"
            size="sm"
          >
            <DownloadSimple size={16} className="mr-2" />
            {isExporting ? 'Exporteren...' : 'Exporteer CSV'}
          </Button>
        </div>
      )}

      {!hasData ? (
        <div className="text-sm text-muted-foreground">{emptyMessage}</div>
      ) : type === 'invoices' ? (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{invoice.invoice_number}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{invoice.customer_name || '-'} · € {(invoice.total_cents / 100).toFixed(2)} · {invoice.status}</CardContent>
            </Card>
          ))}
        </div>
      ) : type === 'expenses' ? (
        <div className="space-y-3">
          {expenses.map((expense) => (
            <Card key={expense.id}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{expense.vendor}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{expense.description || '-'} · € {(expense.amount_cents / 100).toFixed(2)} · {expense.expense_date}</CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {hours.map((entry) => (
            <Card key={entry.id}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{entry.description}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{entry.entry_date} · {entry.hours} uur · {entry.billable ? 'Declarabel' : 'Niet declarabel'}</CardContent>
            </Card>
          ))}
        </div>
      )}
      {total > pageSize && (
        <div className="mt-4 flex items-center justify-between gap-3" aria-label="Paginering">
          <span className="text-sm text-muted-foreground">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} van {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Vorige</Button>
            <Button variant="outline" size="sm" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Volgende</Button>
          </div>
        </div>
      )}
    </div>
  )
}
