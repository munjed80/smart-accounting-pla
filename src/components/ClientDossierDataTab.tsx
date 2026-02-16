import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { accountantDossierApi, getErrorMessage, ZZPExpense, ZZPInvoice, ZZPTimeEntry } from '@/lib/api'

interface Props {
  clientId: string
  type: 'invoices' | 'expenses' | 'hours'
}

export function ClientDossierDataTab({ clientId, type }: Props) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusCode, setStatusCode] = useState<number | null>(null)
  const [invoices, setInvoices] = useState<ZZPInvoice[]>([])
  const [expenses, setExpenses] = useState<ZZPExpense[]>([])
  const [hours, setHours] = useState<ZZPTimeEntry[]>([])
  const commitmentIdFilter = useMemo(() => {
    if (type !== 'expenses') return null
    const params = new URLSearchParams(window.location.search)
    return params.get('commitmentId')
  }, [type])

  useEffect(() => {
    const load = async () => {
      if (!clientId) {
        setError('Geen klant geselecteerd.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)
      setStatusCode(null)
      try {
        if (type === 'invoices') {
          const response = await accountantDossierApi.getInvoices(clientId)
          setInvoices(response.invoices)
        } else if (type === 'expenses') {
          const response = await accountantDossierApi.getExpenses(
            clientId,
            commitmentIdFilter ? { commitment_id: commitmentIdFilter } : undefined,
          )
          setExpenses(response.expenses)
        } else {
          const response = await accountantDossierApi.getHours(clientId)
          setHours(response.entries)
        }
      } catch (err: unknown) {
        const maybeResponse = (err as { response?: { status?: number } } | null)?.response
        setStatusCode(maybeResponse?.status ?? null)
        setError(getErrorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [clientId, type, commitmentIdFilter])

  if (isLoading) {
    return <Skeleton className="h-28 w-full" />
  }

  if (error) {
    return (
      <Alert className="bg-destructive/10 border-destructive/40">
        <AlertDescription>
          {statusCode ? `HTTP ${statusCode}: ` : ''}
          {error}
        </AlertDescription>
      </Alert>
    )
  }

  if (type === 'invoices') {
    if (!invoices.length) return <div className="text-sm text-muted-foreground">Geen facturen gevonden</div>
    return (
      <div className="space-y-3">
        {invoices.map((invoice) => (
          <Card key={invoice.id}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{invoice.invoice_number}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{invoice.customer_name || '-'} · € {(invoice.total_cents / 100).toFixed(2)} · {invoice.status}</CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (type === 'expenses') {
    if (!expenses.length) {
      return (
        <div className="text-sm text-muted-foreground">
          {commitmentIdFilter ? 'Geen uitgaven gevonden voor deze verplichting' : 'Geen uitgaven gevonden'}
        </div>
      )
    }
    return (
      <div className="space-y-3">
        {expenses.map((expense) => (
          <Card key={expense.id}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{expense.vendor}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{expense.description || '-'} · € {(expense.amount_cents / 100).toFixed(2)} · {expense.expense_date}</CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!hours.length) return <div className="text-sm text-muted-foreground">Geen uren gevonden</div>
  return (
    <div className="space-y-3">
      {hours.map((entry) => (
        <Card key={entry.id}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{entry.description}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{entry.entry_date} · {entry.hours} uur · {entry.billable ? 'Declarabel' : 'Niet declarabel'}</CardContent>
        </Card>
      ))}
    </div>
  )
}
