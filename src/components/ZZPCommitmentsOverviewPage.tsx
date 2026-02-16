import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { zzpApi, ZZPCommitment, ZZPCommitmentOverview } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { navigateTo } from '@/lib/navigation'
import { toast } from 'sonner'

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const todayStr = () => new Date().toISOString().slice(0, 10)
const isExpired = (item: ZZPCommitment) => !!item.end_date && item.end_date < todayStr() && !item.next_due_date
const expenseCategory = (type: ZZPCommitment['type']) => (type === 'subscription' ? 'Abonnement' : type === 'lease' ? 'Lease' : 'Lening')
const errorWithStatus = (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status) return `${error.response.status}: ${parseApiError(error)}`
  return parseApiError(error)
}

const addYears = (date: string, years: number) => {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next.toISOString().slice(0, 10)
}

export const ZZPCommitmentsOverviewPage = () => {
  const [typeFilter, setTypeFilter] = useState<'all' | 'lease' | 'loan' | 'subscription'>('all')
  const [commitments, setCommitments] = useState<ZZPCommitment[]>([])
  const [overview, setOverview] = useState<ZZPCommitmentOverview | null>(null)

  const load = async () => {
    try {
      const [listResp, overviewResp] = await Promise.all([
        zzpApi.commitments.list(typeFilter === 'all' ? undefined : typeFilter),
        zzpApi.commitments.overview(),
      ])
      setCommitments(listResp.commitments)
      setOverview(overviewResp)
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

  const createExpenseFromCommitment = async (item: ZZPCommitment) => {
    const dueDate = item.next_due_date || todayStr()
    const amount = item.monthly_payment_cents || item.amount_cents
    try {
      const created = await zzpApi.expenses.create({
        vendor: item.name,
        description: `Automatisch aangemaakt vanuit verplichting: ${item.name}`,
        expense_date: dueDate,
        amount_cents: amount,
        vat_rate: item.btw_rate ?? 21,
        category: expenseCategory(item.type),
        commitment_id: item.id,
      })
      toast.success('Uitgave aangemaakt', {
        action: {
          label: 'Open uitgave',
          onClick: () => navigateTo(`/zzp/expenses#expense-${created.id}`),
        },
      })
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  const addExamples = async () => {
    const startDate = todayStr()
    try {
      await Promise.all([
        zzpApi.commitments.create({
          type: 'subscription',
          name: 'Demo abonnement boekhoudsoftware',
          amount_cents: 2900,
          recurring_frequency: 'monthly',
          start_date: startDate,
          contract_term_months: 12,
          btw_rate: 21,
        }),
        zzpApi.commitments.create({
          type: 'lease',
          name: 'Demo lease bedrijfsauto',
          amount_cents: 42500,
          monthly_payment_cents: 42500,
          principal_amount_cents: 1800000,
          interest_rate: 4.2,
          start_date: startDate,
          end_date: addYears(startDate, 4),
          btw_rate: 21,
        }),
        zzpApi.commitments.create({
          type: 'loan',
          name: 'Demo lening bedrijfsmiddelen',
          amount_cents: 61500,
          monthly_payment_cents: 61500,
          principal_amount_cents: 2500000,
          interest_rate: 5.1,
          start_date: startDate,
          end_date: addYears(startDate, 3),
          btw_rate: 0,
        }),
      ])
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
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{eur(item.monthly_payment_cents || item.amount_cents)}</span>
                <Button size="sm" variant="outline" onClick={() => createExpenseFromCommitment(item)}>Maak uitgave aan</Button>
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
    </div>
  )
}
