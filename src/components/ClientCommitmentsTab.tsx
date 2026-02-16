import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { accountantApi, accountantDossierApi, ZZPCommitment, ZZPCommitmentOverview } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { WarningCircle } from '@phosphor-icons/react'

interface ClientCommitmentsTabProps {
  clientId: string
}

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)

export const ClientCommitmentsTab = ({ clientId }: ClientCommitmentsTabProps) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasApprovedMandate, setHasApprovedMandate] = useState(false)
  const [items, setItems] = useState<ZZPCommitment[]>([])
  const [overview, setOverview] = useState<ZZPCommitmentOverview | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const mandates = await accountantApi.getMandates()
        const approved = mandates.mandates.some(m => m.client_user_id === clientId && m.status === 'approved')
        setHasApprovedMandate(approved)

        if (!approved) {
          setItems([])
          setOverview(null)
          return
        }

        const listResp = await accountantDossierApi.getCommitments(clientId)
        setItems(listResp.commitments)

        try {
          const overviewResp = await accountantDossierApi.getCommitmentsOverview(clientId)
          setOverview(overviewResp)
        } catch {
          setOverview(null)
        }
      } catch (err) {
        setError(parseApiError(err))
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [clientId])

  const summary = useMemo(() => {
    const monthlyCents = items.reduce((sum, item) => {
      if (item.type === 'subscription' && item.recurring_frequency === 'yearly') return sum + Math.round(item.amount_cents / 12)
      return sum + (item.monthly_payment_cents || item.amount_cents)
    }, 0)

    const upcomingCents = items.reduce((sum, item) => {
      const hasUpcoming = !!item.next_due_date
      if (!hasUpcoming) return sum
      return sum + (item.monthly_payment_cents || item.amount_cents)
    }, 0)

    return { monthlyCents, upcomingCents }
  }, [items])

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Verplichtingen</CardTitle></CardHeader>
        <CardContent><p className='text-sm text-muted-foreground'>Verplichtingen laden...</p></CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant='destructive'>
        <WarningCircle size={18} />
        <AlertTitle>Verplichtingen konden niet worden geladen</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!hasApprovedMandate) {
    return (
      <Alert>
        <AlertTitle>Geen toegang tot verplichtingen</AlertTitle>
        <AlertDescription>Deze sectie is zichtbaar wanneer er een goedgekeurd mandaat actief is voor deze cliënt.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        <Card><CardHeader><CardTitle>Totaal maandlasten</CardTitle></CardHeader><CardContent>{eur(overview?.monthly_total_cents ?? summary.monthlyCents)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Komende betalingen</CardTitle></CardHeader><CardContent>{eur(overview?.upcoming_total_cents ?? summary.upcomingCents)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Aantal verplichtingen</CardTitle></CardHeader><CardContent>{items.length}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Aankomende verplichtingen</CardTitle></CardHeader>
        <CardContent className='space-y-2'>
          {items.length === 0 && <p className='text-sm text-muted-foreground'>Geen verplichtingen gevonden.</p>}
          {items.map((item) => (
            <div key={item.id} className='rounded-md border p-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <p className='font-medium'>{item.name}</p>
                <p className='text-xs text-muted-foreground'>Type: {item.type} · Volgende vervaldatum: {item.next_due_date || '-'}</p>
              </div>
              <div className='flex items-center gap-2'>
                <span className='text-sm font-medium'>{eur(item.monthly_payment_cents || item.amount_cents)}</span>
                <Badge variant='secondary'>Alleen lezen</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
