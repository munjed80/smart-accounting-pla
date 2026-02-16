import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { accountantDossierApi, AccountantCommitmentItem } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { parseApiError } from '@/lib/utils'
import { WarningCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface ClientCommitmentsTabProps {
  clientId: string
}

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)

export const ClientCommitmentsTab = ({ clientId }: ClientCommitmentsTabProps) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasApprovedMandate, setHasApprovedMandate] = useState(true)
  const [items, setItems] = useState<AccountantCommitmentItem[]>([])
  const [monthlyTotalCents, setMonthlyTotalCents] = useState(0)
  const [upcoming30DaysTotalCents, setUpcoming30DaysTotalCents] = useState(0)
  const [warningCount, setWarningCount] = useState(0)
  const [cashflowStressLabel, setCashflowStressLabel] = useState('Onvoldoende data')
  const [total, setTotal] = useState(0)
  const [missingThisPeriodCount, setMissingThisPeriodCount] = useState(0)
  const [typeFilter, setTypeFilter] = useState<'all' | 'lease' | 'loan' | 'subscription'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'ended'>('all')

  useEffect(() => {
    const load = async () => {
      if (!clientId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)
      setHasApprovedMandate(true)

      try {
        const periodKey = new Date().toISOString().slice(0, 7)
        const response = await accountantDossierApi.getCommitments(clientId, {
          type: typeFilter === 'all' ? undefined : typeFilter,
          status: statusFilter === 'all' ? undefined : statusFilter,
          period_key: periodKey,
        })
        setItems(response.commitments)
        setMonthlyTotalCents(response.monthly_total_cents)
        setUpcoming30DaysTotalCents(response.upcoming_30_days_total_cents)
        setWarningCount(response.warning_count)
        setCashflowStressLabel(response.cashflow_stress_label)
        setTotal(response.total)
        setMissingThisPeriodCount(response.missing_this_period_count)
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          const code = err.response?.data?.detail?.code
          if (code === 'MANDATE_NOT_APPROVED') {
            setHasApprovedMandate(false)
            setItems([])
            setTotal(0)
            return
          }
        }
        setError(parseApiError(err))
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [clientId, typeFilter, statusFilter])

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (a.next_due_date || '9999-12-31').localeCompare(b.next_due_date || '9999-12-31')).slice(0, 10),
    [items],
  )

  if (!clientId) {
    return (
      <Alert>
        <AlertTitle>Geen klant geselecteerd</AlertTitle>
        <AlertDescription>Selecteer een klant om verplichtingen te bekijken.</AlertDescription>
      </Alert>
    )
  }

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
        <AlertTitle>Geen machtiging. Vraag toegang aan via Machtigingen.</AlertTitle>
        <AlertDescription className='mt-2'>
          <Button variant='outline' size='sm' onClick={() => navigateTo('/accountant/clients')}>
            Naar Machtigingen
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3'>
        <Card><CardHeader><CardTitle>Maandlasten</CardTitle></CardHeader><CardContent>{eur(monthlyTotalCents)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Komende 30 dagen</CardTitle></CardHeader><CardContent>{eur(upcoming30DaysTotalCents)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Waarschuwingen</CardTitle></CardHeader><CardContent>{warningCount}</CardContent></Card>
        <Card><CardHeader><CardTitle>Cashflow stress</CardTitle></CardHeader><CardContent>{cashflowStressLabel}</CardContent></Card>
        <Card><CardHeader><CardTitle>Ontbreekt deze periode</CardTitle></CardHeader><CardContent>{missingThisPeriodCount}</CardContent></Card>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
          <SelectTrigger><SelectValue placeholder='Type filter' /></SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>Alle types</SelectItem>
            <SelectItem value='subscription'>Abonnementen</SelectItem>
            <SelectItem value='lease'>Lease</SelectItem>
            <SelectItem value='loan'>Leningen</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
          <SelectTrigger><SelectValue placeholder='Status filter' /></SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>Alle statussen</SelectItem>
            <SelectItem value='active'>Actief</SelectItem>
            <SelectItem value='paused'>Gepauzeerd</SelectItem>
            <SelectItem value='ended'>Beëindigd</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Komende verplichtingen (top 10)</CardTitle></CardHeader>
        <CardContent className='space-y-2'>
          {total === 0 && <p className='text-sm text-muted-foreground'>Nog geen verplichtingen gevonden voor deze klant.</p>}
          {sortedItems.map((item) => (
            <div key={item.id} className='rounded-md border p-3 flex flex-col gap-2'>
              <div className='flex items-start justify-between gap-2'>
                <div>
                  <p className='font-medium'>{item.name}</p>
                  <p className='text-xs text-muted-foreground'>Type: {item.type} · Status: {item.status}</p>
                </div>
                <Badge variant='secondary'>Alleen lezen</Badge>
              </div>
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm'>
                <div><span className='text-muted-foreground'>Bedrag:</span> {eur(item.monthly_payment_cents || item.amount_cents)}</div>
                <div><span className='text-muted-foreground'>Volgende:</span> {item.next_due_date || '-'}</div>
                <div><span className='text-muted-foreground'>Laatste boeking:</span> {item.last_booked_date || '-'}</div>
                <div>
                  <span className='text-muted-foreground'>Gekoppelde uitgaven:</span> {item.linked_expenses_count}
                  {item.linked_expenses_count > 0 && (
                    <Button
                      variant='link'
                      size='sm'
                      className='h-auto p-0 ml-2'
                      onClick={() => navigateTo(`/accountant/clients/${clientId}/expenses?commitmentId=${item.id}`)}
                    >
                      Bekijk uitgaven
                    </Button>
                  )}
                </div>
              </div>
              {!item.has_expense_in_period && item.status === 'active' && (
                <p className='text-xs text-amber-700'>Ontbreekt deze periode</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
