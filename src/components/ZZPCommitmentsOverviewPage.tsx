import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { zzpApi, ZZPCommitment, ZZPCommitmentOverview, ZZPExpense, ZZPInvoice } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { navigateTo } from '@/lib/navigation'
import { toast } from 'sonner'
import { CommitmentExpenseDialog } from '@/components/CommitmentExpenseDialog'
import { createDemoCommitments } from '@/lib/commitments'

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const todayStr = () => new Date().toISOString().slice(0, 10)
const isExpired = (item: ZZPCommitment) => item.status === 'ended' || item.end_date_status === 'ended' || (!!item.end_date && item.end_date < todayStr() && !item.next_due_date)
const isPaused = (item: ZZPCommitment) => item.status === 'paused'
const errorWithStatus = (error: unknown) => axios.isAxiosError(error) && error.response?.status ? `${error.response.status}: ${parseApiError(error)}` : parseApiError(error)

const toMonthKey = (date: string) => date.slice(0, 7)
const getThreeMonthsAgo = () => {
  const date = new Date()
  date.setMonth(date.getMonth() - 3)
  return date.toISOString().slice(0, 10)
}

const paymentFrequency = (item: ZZPCommitment) => item.recurring_frequency || 'monthly'
const estimateYearlyVatReclaim = (item: ZZPCommitment) => {
  const rate = item.vat_rate ?? item.btw_rate ?? 0
  if (![0, 9, 21].includes(rate) || rate <= 0) return 0
  const yearlyGross = paymentFrequency(item) === 'yearly' ? item.amount_cents : (item.monthly_payment_cents || item.amount_cents) * 12
  return Math.round(yearlyGross * (rate / 100) / (1 + rate / 100))
}

export const ZZPCommitmentsOverviewPage = () => {
  const [typeFilter, setTypeFilter] = useState<'all' | 'lease' | 'loan' | 'subscription'>('all')
  const [frequencyFilter, setFrequencyFilter] = useState<'all' | 'monthly' | 'yearly'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'ended'>('all')
  const [commitments, setCommitments] = useState<ZZPCommitment[]>([])
  const [allCommitments, setAllCommitments] = useState<ZZPCommitment[]>([])
  const [overview, setOverview] = useState<ZZPCommitmentOverview | null>(null)
  const [paidInvoices, setPaidInvoices] = useState<ZZPInvoice[]>([])
  const [selectedExpenseCommitment, setSelectedExpenseCommitment] = useState<ZZPCommitment | null>(null)
  const [isCreatingExpense, setIsCreatingExpense] = useState(false)
  const [expenses, setExpenses] = useState<ZZPExpense[]>([])

  const load = async () => {
    try {
      const [allListResp, overviewResp, paidInvoiceResp, expenseResp] = await Promise.all([
        zzpApi.commitments.list(),
        zzpApi.commitments.overview(),
        zzpApi.invoices.list({ status: 'paid', from_date: getThreeMonthsAgo() }),
        zzpApi.expenses.list(),
      ])
      setCommitments(allListResp.commitments)
      setAllCommitments(allListResp.commitments)
      setOverview(overviewResp)
      setPaidInvoices(paidInvoiceResp.invoices)
      setExpenses(expenseResp.expenses)
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  useEffect(() => { load() }, [])

  const filteredCommitments = useMemo(() => commitments.filter(item => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (frequencyFilter !== 'all' && paymentFrequency(item) !== frequencyFilter) return false
    if (statusFilter !== 'all') {
      const ended = isExpired(item)
      if (statusFilter === 'active' && (ended || isPaused(item))) return false
      if (statusFilter === 'paused' && !isPaused(item)) return false
      if (statusFilter === 'ended' && !ended) return false
    }
    return true
  }), [commitments, typeFilter, frequencyFilter, statusFilter])


  const expensesByCommitmentId = useMemo(() => expenses.reduce<Record<string, ZZPExpense[]>>((acc, expense) => {
    if (!expense.commitment_id) return acc
    acc[expense.commitment_id] = [...(acc[expense.commitment_id] || []), expense]
    return acc
  }, {}), [expenses])

  const sortedUpcoming = useMemo(() => [...filteredCommitments].sort((a, b) => (a.next_due_date || '9999-12-31').localeCompare(b.next_due_date || '9999-12-31')), [filteredCommitments])
  const top5Largest = useMemo(
    () => [...allCommitments]
      .sort((a, b) => (b.monthly_payment_cents || b.amount_cents) - (a.monthly_payment_cents || a.amount_cents))
      .slice(0, 5),
    [allCommitments],
  )

  const cashflowStress = useMemo(() => {
    const monthlyObligationsCents = allCommitments.reduce((total, item) => {
      if (isPaused(item) || isExpired(item)) return total
      if (item.type === 'subscription' && item.recurring_frequency === 'yearly') return total + Math.round(item.amount_cents / 12)
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
    return { avgMonthlyIncomeCents, monthlyObligationsCents, ratio, hasEnoughData: paidMonths.length >= 2 }
  }, [allCommitments, paidInvoices])

  const createExpenseFromCommitment = async (payload: { expense_date: string; amount_cents: number; vat_rate: number; description: string; notes?: string }) => {
    if (!selectedExpenseCommitment) return
    setIsCreatingExpense(true)
    try {
      const created = await zzpApi.commitments.createExpense(selectedExpenseCommitment.id, {
        expense_date: payload.expense_date,
        amount_cents: payload.amount_cents,
        vat_rate: payload.vat_rate,
        description: payload.description,
        notes: payload.notes,
      })
      setSelectedExpenseCommitment(null)
      toast.success('Uitgave aangemaakt', { action: { label: 'Open uitgave', onClick: () => navigateTo(`/zzp/expenses#expense-${created.expense_id}`) } })
      load()
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

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold">Overzicht vaste verplichtingen</h1>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
        <Select value={typeFilter} onValueChange={(v: 'all' | 'lease' | 'loan' | 'subscription') => setTypeFilter(v)}>
          <SelectTrigger><SelectValue placeholder='Type' /></SelectTrigger>
          <SelectContent><SelectItem value='all'>Alle typen</SelectItem><SelectItem value='lease'>Lease</SelectItem><SelectItem value='loan'>Lening</SelectItem><SelectItem value='subscription'>Abonnement</SelectItem></SelectContent>
        </Select>
        <Select value={frequencyFilter} onValueChange={(v: 'all' | 'monthly' | 'yearly') => setFrequencyFilter(v)}>
          <SelectTrigger><SelectValue placeholder='Frequentie' /></SelectTrigger>
          <SelectContent><SelectItem value='all'>Alle frequenties</SelectItem><SelectItem value='monthly'>Maandelijks</SelectItem><SelectItem value='yearly'>Jaarlijks</SelectItem></SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v: 'all' | 'active' | 'paused' | 'ended') => setStatusFilter(v)}>
          <SelectTrigger><SelectValue placeholder='Status' /></SelectTrigger>
          <SelectContent><SelectItem value='all'>Alle statussen</SelectItem><SelectItem value='active'>Actief</SelectItem><SelectItem value='paused'>Gepauzeerd</SelectItem><SelectItem value='ended'>Beëindigd</SelectItem></SelectContent>
        </Select>
      </div>

      {overview && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Card><CardHeader><CardTitle>Maandlasten</CardTitle></CardHeader><CardContent>{eur(overview.monthly_total_cents)}</CardContent></Card><Card><CardHeader><CardTitle>Komende 30 dagen</CardTitle></CardHeader><CardContent>{eur(overview.upcoming_total_cents)}</CardContent></Card><Card><CardHeader><CardTitle>Waarschuwingen</CardTitle></CardHeader><CardContent>{overview.warning_count}</CardContent></Card></div>}

      {overview && (
        <Card>
          <CardHeader><CardTitle>Komende 30 dagen (top 10)</CardTitle></CardHeader>
          <CardContent className='space-y-2'>
            {overview.upcoming.length === 0 ? <p className='text-sm text-muted-foreground'>Geen aankomende verplichtingen in de komende 30 dagen.</p> : overview.upcoming.map(item => (
              <div key={`upcoming-${item.id}`} className='rounded border p-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <p className='font-medium text-sm'>{item.name}</p>
                  <p className='text-xs text-muted-foreground'>Vervaldatum: {item.next_due_date || '-'}</p>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='text-sm font-medium'>{eur(item.monthly_payment_cents || item.amount_cents)}</span>
                  <Button size='sm' variant='outline' disabled={isPaused(item) || isExpired(item)} onClick={() => setSelectedExpenseCommitment(item)}>Maak uitgave aan</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card><CardHeader><CardTitle>Top 5 grootste lasten</CardTitle></CardHeader><CardContent className='space-y-2'>
        {top5Largest.length === 0 ? <p className='text-sm text-muted-foreground'>Geen lasten gevonden voor de huidige filters.</p> : top5Largest.map(item => (
          <div key={item.id} className='rounded border p-2 text-sm grid grid-cols-1 sm:grid-cols-4 gap-1'>
            <span className='font-medium'>{item.name}</span>
            <span className='text-muted-foreground'>{item.type}</span>
            <span>{eur(item.monthly_payment_cents || item.amount_cents)}</span>
            <span className='text-muted-foreground'>Volgende: {item.next_due_date || '-'}</span>
          </div>
        ))}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Aankomende verplichtingen</CardTitle></CardHeader>
        {filteredCommitments.length === 0 && <CardContent><Button variant="outline" onClick={addExamples}>Voeg 3 voorbeelden toe</Button></CardContent>}
        <CardContent className="space-y-2">
          {sortedUpcoming.map(item => (
            <div id={`commitment-${item.id}`} key={item.id} className="rounded-md border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{item.name}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">Volgende vervaldatum: {item.next_due_date || '-'}</p>
                  {isPaused(item) ? <Badge variant="secondary">Gepauzeerd</Badge> : isExpired(item) ? <Badge variant="secondary">Beëindigd</Badge> : null}
                </div>
                <p className='text-xs text-muted-foreground mt-1'>Laatste boeking: {item.last_booked_date || '-'}</p>
                <p className='text-xs text-muted-foreground'>Gekoppelde uitgaven: {(expensesByCommitmentId[item.id] || []).length}</p>
                <p className='text-xs text-muted-foreground'>Geschatte BTW-teruggave: {eur(estimateYearlyVatReclaim(item))}</p>
                {(expensesByCommitmentId[item.id] || []).slice(0, 2).map(exp => <p key={exp.id} className='text-xs text-muted-foreground'>• {exp.expense_date}: {eur(exp.amount_cents)}</p>) }
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{eur(item.monthly_payment_cents || item.amount_cents)}</span>
                <Button size="sm" variant="outline" disabled={isPaused(item) || isExpired(item)} onClick={() => setSelectedExpenseCommitment(item)}>Maak uitgave aan</Button>
                <Button size="sm" variant="outline" onClick={() => navigateTo(`/zzp/verplichtingen/${item.type === 'subscription' ? 'abonnementen' : 'lease-leningen'}#commitment-${item.id}`)}>Bewerk</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Cashflow stress</CardTitle></CardHeader><CardContent className='space-y-2'>
        {!cashflowStress.hasEnoughData ? <p className='text-sm text-muted-foreground'>Nog niet genoeg betaalde facturen om een betrouwbare stressscore te berekenen.</p> : <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'><div><p className='text-xs text-muted-foreground'>Gem. maandinkomsten</p><p className='font-medium'>{eur(cashflowStress.avgMonthlyIncomeCents)}</p></div><div><p className='text-xs text-muted-foreground'>Maandelijkse verplichtingen</p><p className='font-medium'>{eur(cashflowStress.monthlyObligationsCents)}</p></div><div><p className='text-xs text-muted-foreground'>Ratio</p><p className='font-medium'>{((cashflowStress.ratio || 0) * 100).toFixed(1)}%</p></div></div>}
      </CardContent></Card>

      {overview?.alerts?.map((alert, idx) => <Alert key={`${alert.code}-${idx}`}><AlertDescription>{alert.message}</AlertDescription></Alert>)}

      <CommitmentExpenseDialog open={!!selectedExpenseCommitment} commitment={selectedExpenseCommitment} isSubmitting={isCreatingExpense} onOpenChange={(open) => { if (!open) setSelectedExpenseCommitment(null) }} onConfirm={createExpenseFromCommitment} />
    </div>
  )
}
