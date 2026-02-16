import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { zzpApi, ZZPCommitment, ZZPCommitmentOverview, ZZPInvoice } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { navigateTo } from '@/lib/navigation'
import { toast } from 'sonner'
import { CommitmentExpenseDialog } from '@/components/CommitmentExpenseDialog'
import { createDemoCommitments } from '@/lib/commitments'

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const todayStr = () => new Date().toISOString().slice(0, 10)
const isExpired = (item: ZZPCommitment) => !!item.end_date && item.end_date < todayStr() && !item.next_due_date
const expenseCategory = (type: ZZPCommitment['type']) => (type === 'subscription' ? 'Abonnement' : type === 'lease' ? 'Lease' : 'Lening')
const errorWithStatus = (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status) return `${error.response.status}: ${parseApiError(error)}`
  return parseApiError(error)
}

const toMonthKey = (date: string) => date.slice(0, 7)
const getThreeMonthsAgo = () => {
  const date = new Date()
  date.setMonth(date.getMonth() - 3)
  return date.toISOString().slice(0, 10)
}

export const ZZPCommitmentsOverviewPage = () => {
  const [typeFilter, setTypeFilter] = useState<'all' | 'lease' | 'loan' | 'subscription'>('all')
  const [commitments, setCommitments] = useState<ZZPCommitment[]>([])
  const [allCommitments, setAllCommitments] = useState<ZZPCommitment[]>([])
  const [overview, setOverview] = useState<ZZPCommitmentOverview | null>(null)
  const [paidInvoices, setPaidInvoices] = useState<ZZPInvoice[]>([])
  const [selectedExpenseCommitment, setSelectedExpenseCommitment] = useState<ZZPCommitment | null>(null)
  const [isCreatingExpense, setIsCreatingExpense] = useState(false)
  const [lastBookedOnByCommitmentId, setLastBookedOnByCommitmentId] = useState<Record<string, string>>({})

  const load = async () => {
    try {
      const [listResp, allListResp, overviewResp, paidInvoiceResp] = await Promise.all([
        zzpApi.commitments.list(typeFilter === 'all' ? undefined : typeFilter),
        zzpApi.commitments.list(),
        zzpApi.commitments.overview(),
        zzpApi.invoices.list({ status: 'paid', from_date: getThreeMonthsAgo() }),
      ])
      setCommitments(listResp.commitments)
      setAllCommitments(allListResp.commitments)
      setOverview(overviewResp)
      setPaidInvoices(paidInvoiceResp.invoices)
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  useEffect(() => { load() }, [typeFilter])

  const monthlyPoints = useMemo(() => commitments.slice(0, 6).map((item) => ({
    name: item.name,
    value: item.monthly_payment_cents || item.amount_cents,
  })), [commitments])

  const max = Math.max(1, ...monthlyPoints.map(p => p.value))

  const cashflowStress = useMemo(() => {
    const monthlyObligationsCents = allCommitments.reduce((total, item) => {
      if (item.type === 'subscription' && item.recurring_frequency === 'yearly') {
        return total + Math.round(item.amount_cents / 12)
      }
      return total + (item.monthly_payment_cents || item.amount_cents)
    }, 0)

    const revenueByMonth = paidInvoices.reduce<Record<string, number>>((acc, invoice) => {
      const monthKey = toMonthKey(invoice.paid_at || invoice.issue_date)
      acc[monthKey] = (acc[monthKey] || 0) + invoice.total_cents
      return acc
    }, {})

    const paidMonths = Object.keys(revenueByMonth).sort()
    const avgMonthlyIncomeCents = paidMonths.length > 0
      ? Math.round(Object.values(revenueByMonth).reduce((sum, val) => sum + val, 0) / paidMonths.length)
      : 0

    const ratio = avgMonthlyIncomeCents > 0 ? monthlyObligationsCents / avgMonthlyIncomeCents : null

    return {
      paidMonths,
      avgMonthlyIncomeCents,
      monthlyObligationsCents,
      ratio,
      hasEnoughData: paidMonths.length >= 2,
    }
  }, [allCommitments, paidInvoices])

  const createExpenseFromCommitment = async (payload: { expense_date: string; amount_cents: number; vat_rate: number; notes?: string }) => {
    if (!selectedExpenseCommitment) return

    setIsCreatingExpense(true)
    try {
      const created = await zzpApi.expenses.create({
        vendor: selectedExpenseCommitment.name,
        description: `Automatisch aangemaakt vanuit verplichting: ${selectedExpenseCommitment.name}`,
        expense_date: payload.expense_date,
        amount_cents: payload.amount_cents,
        vat_rate: payload.vat_rate,
        category: expenseCategory(selectedExpenseCommitment.type),
        commitment_id: selectedExpenseCommitment.id,
        notes: payload.notes,
      })
      setLastBookedOnByCommitmentId(prev => ({ ...prev, [selectedExpenseCommitment.id]: payload.expense_date }))
      setSelectedExpenseCommitment(null)
      toast.success('Uitgave aangemaakt', {
        action: {
          label: 'Open uitgave',
          onClick: () => navigateTo(`/zzp/expenses#expense-${created.id}`),
        },
      })
    } catch (error) {
      toast.error(errorWithStatus(error))
    } finally {
      setIsCreatingExpense(false)
    }
  }

  const addExamples = async () => {
    try {
      await createDemoCommitments(todayStr())
      toast.success('Voorbeelden toegevoegd')
      load()
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  const stressStatus = !cashflowStress.ratio
    ? null
    : cashflowStress.ratio <= 0.4
      ? { label: 'Groen', className: 'bg-green-100 text-green-800 border-green-300' }
      : cashflowStress.ratio <= 0.7
        ? { label: 'Geel', className: 'bg-amber-100 text-amber-800 border-amber-300' }
        : { label: 'Rood', className: 'bg-red-100 text-red-800 border-red-300' }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold">Overzicht vaste verplichtingen</h1>
        <Select value={typeFilter} onValueChange={(v: 'all' | 'lease' | 'loan' | 'subscription') => setTypeFilter(v)}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle typen</SelectItem>
            <SelectItem value="lease">Lease</SelectItem>
            <SelectItem value="loan">Lening</SelectItem>
            <SelectItem value="subscription">Abonnement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card><CardHeader><CardTitle>Maandlasten</CardTitle></CardHeader><CardContent>{eur(overview.monthly_total_cents)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Komende 30 dagen</CardTitle></CardHeader><CardContent>{eur(overview.upcoming_total_cents)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Waarschuwingen</CardTitle></CardHeader><CardContent>{overview.warning_count}</CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Cashflow stress</CardTitle></CardHeader>
        <CardContent className='space-y-2'>
          {!cashflowStress.hasEnoughData ? (
            <p className='text-sm text-muted-foreground'>
              Nog niet genoeg betaalde facturen in de afgelopen 3 maanden om een betrouwbare stressscore te berekenen.
              Zodra er minimaal 2 maanden met betaalde facturen zijn, tonen we de ratio verplichtingen/inkomsten.
            </p>
          ) : (
            <>
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                <div>
                  <p className='text-xs text-muted-foreground'>Gem. maandinkomsten (3 maanden)</p>
                  <p className='font-medium'>{eur(cashflowStress.avgMonthlyIncomeCents)}</p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground'>Maandelijkse verplichtingen</p>
                  <p className='font-medium'>{eur(cashflowStress.monthlyObligationsCents)}</p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground'>Ratio</p>
                  <p className='font-medium'>{((cashflowStress.ratio || 0) * 100).toFixed(1)}%</p>
                </div>
              </div>
              {stressStatus ? <Badge className={stressStatus.className}>{stressStatus.label}</Badge> : null}
            </>
          )}
        </CardContent>
      </Card>

      {overview?.alerts?.map((alert, idx) => (
        <Alert key={`${alert.code}-${idx}`}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      ))}

      <Card>
        <CardHeader><CardTitle>Aankomende verplichtingen</CardTitle></CardHeader>
        {commitments.length === 0 && <CardContent><Button variant="outline" onClick={addExamples}>Voeg voorbeelden toe</Button></CardContent>}
        <CardContent className="space-y-2">
          {(overview?.upcoming || []).map(item => (
            <div id={`commitment-${item.id}`} key={item.id} className="rounded-md border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{item.name}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">Volgende vervaldatum: {item.next_due_date || '-'}</p>
                  {isExpired(item) ? <Badge variant="secondary">Afgelopen</Badge> : null}
                </div>
                {lastBookedOnByCommitmentId[item.id] ? <p className='text-xs text-muted-foreground mt-1'>Last booked on {lastBookedOnByCommitmentId[item.id]}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{eur(item.monthly_payment_cents || item.amount_cents)}</span>
                <Button size="sm" variant="outline" onClick={() => setSelectedExpenseCommitment(item)}>Maak uitgave aan</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Maandelijkse verplichtingen (top 6)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {monthlyPoints.map(point => (
            <div key={point.name}>
              <div className="flex justify-between text-sm"><span>{point.name}</span><span>{eur(point.value)}</span></div>
              <div className="h-2 bg-muted rounded"><div className="h-2 bg-primary rounded" style={{ width: `${(point.value / max) * 100}%` }} /></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <CommitmentExpenseDialog
        open={!!selectedExpenseCommitment}
        commitment={selectedExpenseCommitment}
        isSubmitting={isCreatingExpense}
        onOpenChange={(open) => { if (!open) setSelectedExpenseCommitment(null) }}
        onConfirm={createExpenseFromCommitment}
      />
    </div>
  )
}
