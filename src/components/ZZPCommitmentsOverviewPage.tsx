import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { zzpApi, ZZPCommitment } from '@/lib/api'

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)

export const ZZPCommitmentsOverviewPage = () => {
  const [typeFilter, setTypeFilter] = useState<'all' | 'lease' | 'loan' | 'subscription'>('all')
  const [commitments, setCommitments] = useState<ZZPCommitment[]>([])
  const [overview, setOverview] = useState<{ monthly_total_cents: number; upcoming_total_cents: number; warning_count: number; by_type: Record<string, number> } | null>(null)

  const load = async () => {
    const [listResp, overviewResp] = await Promise.all([
      zzpApi.commitments.list(typeFilter === 'all' ? undefined : typeFilter),
      zzpApi.commitments.overview(),
    ])
    setCommitments(listResp.commitments)
    setOverview(overviewResp)
  }

  useEffect(() => { load() }, [typeFilter])

  const monthlyPoints = useMemo(() => commitments.slice(0, 6).map((item) => ({
    name: item.name,
    value: item.monthly_payment_cents || item.amount_cents,
  })), [commitments])

  const max = Math.max(1, ...monthlyPoints.map(p => p.value))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Overzicht vaste verplichtingen</h1>
        <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle typen</SelectItem>
            <SelectItem value="lease">Lease</SelectItem>
            <SelectItem value="loan">Lening</SelectItem>
            <SelectItem value="subscription">Abonnement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {overview && (
        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardHeader><CardTitle>Maandlasten</CardTitle></CardHeader><CardContent>{eur(overview.monthly_total_cents)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Komende 30 dagen</CardTitle></CardHeader><CardContent>{eur(overview.upcoming_total_cents)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Waarschuwingen</CardTitle></CardHeader><CardContent>{overview.warning_count} hoge betalingen</CardContent></Card>
        </div>
      )}

      {overview && overview.warning_count > 0 && (
        <Alert><AlertDescription>Let op: er zijn grote betalingen gepland in de komende 30 dagen.</AlertDescription></Alert>
      )}

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
