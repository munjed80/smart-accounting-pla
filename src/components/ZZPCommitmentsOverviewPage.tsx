import { useMemo, useState } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { zzpApi, ZZPCommitment } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { navigateTo } from '@/lib/navigation'
import { toast } from 'sonner'
import { CommitmentExpenseDialog } from '@/components/CommitmentExpenseDialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/AuthContext'

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const todayStr = () => new Date().toISOString().slice(0, 10)
const isExpired = (item: ZZPCommitment) => item.status === 'ended' || item.end_date_status === 'ended' || (!!item.end_date && item.end_date < todayStr() && !item.next_due_date)
const isPaused = (item: ZZPCommitment) => item.status === 'paused'
const errorWithStatus = (error: unknown) => axios.isAxiosError(error) && error.response?.status ? `${error.response.status}: ${parseApiError(error)}` : parseApiError(error)

const monthlyAmount = (item: ZZPCommitment) => Math.round((item.monthly_payment_cents || item.amount_cents) / (item.recurring_frequency === 'yearly' ? 12 : item.recurring_frequency === 'quarterly' ? 3 : 1))
const paymentFrequency = (item: ZZPCommitment) => item.recurring_frequency || 'monthly'
const estimateYearlyVatReclaim = (item: ZZPCommitment) => {
  const rate = item.vat_rate ?? item.btw_rate ?? 0
  if (![0, 9, 21].includes(rate) || rate <= 0) return 0
  const yearlyGross = monthlyAmount(item) * 12
  return Math.round(yearlyGross * (rate / 100) / (1 + rate / 100))
}

export const ZZPCommitmentsOverviewPage = () => {
  const [typeFilter, setTypeFilter] = useState<'all' | 'lease' | 'loan' | 'subscription'>('all')
  const [frequencyFilter, setFrequencyFilter] = useState<'all' | 'monthly' | 'quarterly' | 'yearly'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'ended'>('all')
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const listQuery = useQuery({ queryKey: ['zzp-commitments', user?.id], queryFn: () => zzpApi.commitments.list(), enabled: !!user?.id })
  const summaryQuery = useQuery({ queryKey: ['zzp-commitments-overview', user?.id], queryFn: () => zzpApi.commitments.overview(), enabled: !!user?.id })
  const commitments = listQuery.data?.commitments ?? []
  const overview = summaryQuery.data
  const [selectedExpenseCommitment, setSelectedExpenseCommitment] = useState<ZZPCommitment | null>(null)
  const [isCreatingExpense, setIsCreatingExpense] = useState(false)
  const load = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['zzp-commitments', user?.id] }),
    queryClient.invalidateQueries({ queryKey: ['zzp-commitments-overview', user?.id] }),
  ])

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


  const sortedUpcoming = useMemo(() => [...filteredCommitments].sort((a, b) => (a.next_due_date || '9999-12-31').localeCompare(b.next_due_date || '9999-12-31')), [filteredCommitments])
  const top5Largest = useMemo(() => [...commitments].filter(item => !isPaused(item) && !isExpired(item)).sort((a, b) => monthlyAmount(b) - monthlyAmount(a)).slice(0, 5), [commitments])
  const cashflowStress = {
    avgMonthlyIncomeCents: overview?.average_monthly_receipts_cents ?? 0,
    monthlyObligationsCents: overview?.monthly_total_cents ?? 0,
    ratio: overview?.average_monthly_receipts_cents ? overview.monthly_total_cents / overview.average_monthly_receipts_cents : null,
    hasEnoughData: (overview?.average_monthly_receipts_cents ?? 0) > 0,
  }

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

  return (
    <div className="space-y-4 pb-4">
      {(listQuery.isError || summaryQuery.isError) && <Alert variant="destructive"><AlertDescription>Verplichtingen laden mislukt. <Button variant="outline" onClick={() => void load()}>Opnieuw proberen</Button></AlertDescription></Alert>}
      {(listQuery.isLoading || summaryQuery.isLoading) && <p role="status">Verplichtingen laden…</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold">Overzicht vaste verplichtingen</h1>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
        <Select value={typeFilter} onValueChange={(v: 'all' | 'lease' | 'loan' | 'subscription') => setTypeFilter(v)}>
          <SelectTrigger><SelectValue placeholder='Type' /></SelectTrigger>
          <SelectContent><SelectItem value='all'>Alle typen</SelectItem><SelectItem value='lease'>Lease</SelectItem><SelectItem value='loan'>Lening</SelectItem><SelectItem value='subscription'>Abonnement</SelectItem></SelectContent>
        </Select>
        <Select value={frequencyFilter} onValueChange={(v: 'all' | 'monthly' | 'quarterly' | 'yearly') => setFrequencyFilter(v)}>
          <SelectTrigger><SelectValue placeholder='Frequentie' /></SelectTrigger>
          <SelectContent><SelectItem value='all'>Alle frequenties</SelectItem><SelectItem value='monthly'>Maandelijks</SelectItem><SelectItem value='quarterly'>Per kwartaal</SelectItem><SelectItem value='yearly'>Jaarlijks</SelectItem></SelectContent>
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
            <span>{eur(monthlyAmount(item))} / maand</span>
            <span className='text-muted-foreground'>Volgende: {item.next_due_date || '-'}</span>
          </div>
        ))}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Aankomende verplichtingen</CardTitle></CardHeader>
        {filteredCommitments.length === 0 && <CardContent><p>Geen verplichtingen voor deze filters. <Button variant="outline" onClick={() => navigateTo("/zzp/verplichtingen/abonnementen")}>Abonnement toevoegen</Button></p></CardContent>}
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
                <p className='text-xs text-muted-foreground'>Gekoppelde uitgaven: {overview?.linked_expense_counts?.[item.id] ?? 0}</p>
                <p className='text-xs text-muted-foreground'>Geschatte BTW-teruggave: {eur(estimateYearlyVatReclaim(item))}</p>
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

      <Card><CardHeader><CardTitle>Cashflow stress</CardTitle></CardHeader><CardContent className='space-y-2'><p className='text-xs text-muted-foreground'>Gemiddelde ontvangen factuurbedragen over de drie volledige maanden ({overview?.cashflow_from} – {overview?.cashflow_to}), inclusief maanden zonder ontvangsten. Dit is geen nettowinst.</p>
        {!cashflowStress.hasEnoughData ? <p className='text-sm text-muted-foreground'>Nog niet genoeg betaalde facturen om een betrouwbare stressscore te berekenen.</p> : <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'><div><p className='text-xs text-muted-foreground'>Gem. maandinkomsten</p><p className='font-medium'>{eur(cashflowStress.avgMonthlyIncomeCents)}</p></div><div><p className='text-xs text-muted-foreground'>Maandelijkse verplichtingen</p><p className='font-medium'>{eur(cashflowStress.monthlyObligationsCents)}</p></div><div><p className='text-xs text-muted-foreground'>Ratio</p><p className='font-medium'>{((cashflowStress.ratio || 0) * 100).toFixed(1)}%</p></div></div>}
      </CardContent></Card>

      {overview?.alerts?.map((alert, idx) => <Alert key={`${alert.code}-${idx}`}><AlertDescription>{alert.message}</AlertDescription></Alert>)}

      <CommitmentExpenseDialog open={!!selectedExpenseCommitment} commitment={selectedExpenseCommitment} isSubmitting={isCreatingExpense} onOpenChange={(open) => { if (!open) setSelectedExpenseCommitment(null) }} onConfirm={createExpenseFromCommitment} />
    </div>
  )
}
