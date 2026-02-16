import { useEffect, useState } from 'react'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { zzpApi, ZZPCommitment, ZZPCommitmentCreate, ZZPCommitmentSuggestion } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { navigateTo } from '@/lib/navigation'
import { toast } from 'sonner'

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const todayStr = () => new Date().toISOString().slice(0, 10)
const isExpired = (item: ZZPCommitment) => !!item.end_date && item.end_date < todayStr() && !item.next_due_date
const errorWithStatus = (error: unknown) => axios.isAxiosError(error) && error.response?.status ? `${error.response.status}: ${parseApiError(error)}` : parseApiError(error)

const addYears = (date: string, years: number) => {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next.toISOString().slice(0, 10)
}

export const ZZPSubscriptionsPage = () => {
  const [items, setItems] = useState<ZZPCommitment[]>([])
  const [suggestions, setSuggestions] = useState<ZZPCommitmentSuggestion[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ZZPCommitmentCreate>({ type: 'subscription', name: '', amount_cents: 0, recurring_frequency: 'monthly', start_date: todayStr() })

  const load = async () => {
    try {
      const [list, suggestionResp] = await Promise.all([zzpApi.commitments.list('subscription'), zzpApi.commitments.suggestions()])
      setItems(list.commitments)
      setSuggestions(suggestionResp.suggestions)
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name || form.amount_cents <= 0 || !form.recurring_frequency) return
    try {
      if (editingId) await zzpApi.commitments.update(editingId, form)
      else await zzpApi.commitments.create(form)
      setForm({ type: 'subscription', name: '', amount_cents: 0, recurring_frequency: 'monthly', start_date: todayStr() })
      setEditingId(null)
      load()
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  const createExpense = async (item: ZZPCommitment) => {
    try {
      const created = await zzpApi.expenses.create({
        vendor: item.name,
        description: `Automatisch aangemaakt vanuit verplichting: ${item.name}`,
        expense_date: item.next_due_date || todayStr(),
        amount_cents: item.amount_cents,
        vat_rate: item.btw_rate ?? 21,
        category: 'Abonnement',
        commitment_id: item.id,
      })
      toast.success('Uitgave aangemaakt', {
        action: { label: 'Open uitgave', onClick: () => navigateTo(`/zzp/expenses#expense-${created.id}`) },
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

  return <div className='space-y-4 pb-4'>
    <h1 className='text-xl sm:text-2xl font-semibold'>Abonnementen & Recurring Kosten</h1>
    <Card><CardHeader><CardTitle>Nieuw abonnement</CardTitle></CardHeader><CardContent className='grid grid-cols-1 md:grid-cols-3 gap-2'>
      <Input placeholder='Naam' value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Input type='number' min='0' placeholder='Bedrag (EUR)' onChange={e => setForm({ ...form, amount_cents: Math.round(Number(e.target.value || 0) * 100) })} />
      <Select value={form.recurring_frequency} onValueChange={(v: 'monthly' | 'yearly') => setForm({ ...form, recurring_frequency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='monthly'>Maandelijks</SelectItem><SelectItem value='yearly'>Jaarlijks</SelectItem></SelectContent></Select>
      <Input type='date' value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
      <Input type='number' min='1' placeholder='Contractduur (maanden)' onChange={e => setForm({ ...form, contract_term_months: Number(e.target.value || 0) })} />
      <Input type='number' min='0' max='100' placeholder='BTW %' onChange={e => setForm({ ...form, btw_rate: Number(e.target.value || 0) })} />
      <Input type='date' value={form.renewal_date || ''} onChange={e => setForm({ ...form, renewal_date: e.target.value || undefined })} />
      <Button onClick={save}>{editingId ? 'Bijwerken' : 'Opslaan'}</Button>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Abonnementen</CardTitle></CardHeader><CardContent className='overflow-x-auto'>
      {items.length === 0 && <div className='mb-3'><Button variant='outline' onClick={addExamples}>Voeg voorbeelden toe</Button></div>}
      <Table><TableHeader><TableRow><TableHead>Naam</TableHead><TableHead>Frequentie</TableHead><TableHead>Volgende vervaldatum</TableHead><TableHead>Bedrag</TableHead><TableHead /></TableRow></TableHeader><TableBody>
        {items.map(i => <TableRow id={`commitment-${i.id}`} key={i.id}><TableCell>{i.name}</TableCell><TableCell>{i.recurring_frequency}</TableCell><TableCell><div className='flex items-center gap-2'>{i.next_due_date || '-'} {isExpired(i) ? <Badge variant='secondary'>Afgelopen</Badge> : null}</div></TableCell><TableCell>{eur(i.amount_cents)}</TableCell><TableCell className='space-x-2 whitespace-nowrap'><Button variant='outline' size='sm' onClick={() => { setEditingId(i.id); setForm({ ...i, type: 'subscription', recurring_frequency: (i.recurring_frequency || 'monthly') as 'monthly' | 'yearly', start_date: i.start_date.slice(0, 10), end_date: i.end_date || undefined, renewal_date: i.renewal_date || undefined }) }}>Bewerk</Button><Button variant='outline' size='sm' onClick={() => createExpense(i)}>Maak uitgave aan</Button><Button variant='destructive' size='sm' onClick={async () => { try { await zzpApi.commitments.delete(i.id); load() } catch (error) { toast.error(errorWithStatus(error)) } }}>Verwijder</Button></TableCell></TableRow>)}
      </TableBody></Table>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Suggesties op basis van bankfeed</CardTitle></CardHeader><CardContent className='space-y-2'>
      {suggestions.length === 0 && <p className='text-sm text-muted-foreground'>Nog geen suggesties gevonden.</p>}
      {suggestions.map(s => <div key={s.bank_transaction_id} className='border rounded p-2 text-sm flex justify-between'><span>{s.description}</span><span>{eur(s.amount_cents)} · {(s.confidence * 100).toFixed(0)}%</span></div>)}
    </CardContent></Card>
  </div>
}
