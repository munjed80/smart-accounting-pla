import { useEffect, useState } from 'react'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { zzpApi, ZZPCommitment, ZZPCommitmentCreate, ZZPAmortizationRow } from '@/lib/api'
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
const emptyForm: ZZPCommitmentCreate = { type: 'loan', name: '', amount_cents: 0, start_date: todayStr() }

export const ZZPLeaseLoansPage = () => {
  const [items, setItems] = useState<ZZPCommitment[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ZZPCommitmentCreate>(emptyForm)
  const [selected, setSelected] = useState<ZZPCommitment | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<ZZPAmortizationRow[]>([])

  const load = async () => {
    try {
      const [lease, loan] = await Promise.all([zzpApi.commitments.list('lease'), zzpApi.commitments.list('loan')])
      setItems([...lease.commitments, ...loan.commitments])
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name || !form.principal_amount_cents || form.amount_cents <= 0) return
    try {
      if (editingId) await zzpApi.commitments.update(editingId, form)
      else await zzpApi.commitments.create(form)
      setOpen(false)
      setForm(emptyForm)
      setEditingId(null)
      load()
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  const showAmortization = async (item: ZZPCommitment) => {
    try {
      setSelected(item)
      setSchedule(await zzpApi.commitments.amortization(item.id))
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
        amount_cents: item.monthly_payment_cents || item.amount_cents,
        vat_rate: item.btw_rate ?? 21,
        category: item.type === 'lease' ? 'Lease' : 'Lening',
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
    <div className='flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center'>
      <h1 className='text-xl sm:text-2xl font-semibold'>Lease & Leningen</h1>
      <Button onClick={() => setOpen(true)} className='w-full sm:w-auto'>Nieuwe lease/lening</Button>
    </div>

    <Card><CardContent className='pt-4 overflow-x-auto'>
      {items.length === 0 && <div className='mb-3'><Button variant='outline' onClick={addExamples}>Voeg voorbeelden toe</Button></div>}
      <Table>
        <TableHeader><TableRow><TableHead>Naam</TableHead><TableHead>Type</TableHead><TableHead>Volgende vervaldatum</TableHead><TableHead>Maandbedrag</TableHead><TableHead>Rente</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {items.map(i => <TableRow id={`commitment-${i.id}`} key={i.id}>
            <TableCell>{i.name}</TableCell><TableCell>{i.type}</TableCell>
            <TableCell><div className='flex items-center gap-2'>{i.next_due_date || '-'} {isExpired(i) ? <Badge variant='secondary'>Afgelopen</Badge> : null}</div></TableCell>
            <TableCell>{eur(i.monthly_payment_cents || i.amount_cents)}</TableCell>
            <TableCell>{i.interest_rate || 0}%</TableCell>
            <TableCell className='space-x-2 whitespace-nowrap'>
              <Button variant='outline' size='sm' onClick={() => { setForm({ ...i, start_date: i.start_date.slice(0, 10), end_date: i.end_date || undefined, type: i.type as 'lease' | 'loan' }); setEditingId(i.id); setOpen(true) }}>Bewerk</Button>
              <Button variant='outline' size='sm' onClick={() => createExpense(i)}>Maak uitgave aan</Button>
              <Button variant='outline' size='sm' onClick={() => showAmortization(i)}>Aflossing</Button>
              <Button variant='destructive' size='sm' onClick={async () => { try { await zzpApi.commitments.delete(i.id); load() } catch (error) { toast.error(errorWithStatus(error)) } }}>Verwijder</Button>
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </CardContent></Card>

    {selected && <Card><CardHeader><CardTitle>Aflossingsschema: {selected.name}</CardTitle></CardHeader><CardContent className='overflow-x-auto'>
      <Table><TableHeader><TableRow><TableHead>Maand</TableHead><TableHead>Datum</TableHead><TableHead>Rente</TableHead><TableHead>Aflossing</TableHead><TableHead>Restschuld</TableHead></TableRow></TableHeader>
      <TableBody>{schedule.map(r => <TableRow key={r.month_index}><TableCell>{r.month_index}</TableCell><TableCell>{r.due_date}</TableCell><TableCell>{eur(r.interest_cents)}</TableCell><TableCell>{eur(r.principal_cents)}</TableCell><TableCell>{eur(r.remaining_balance_cents)}</TableCell></TableRow>)}</TableBody></Table>
    </CardContent></Card>}

    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyForm) } }}><DialogContent><DialogHeader><DialogTitle>{editingId ? 'Lease/Lening bewerken' : 'Lease/Lening toevoegen'}</DialogTitle></DialogHeader>
      <div className='space-y-2'>
        <Input placeholder='Naam' value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Select value={form.type} onValueChange={(v: 'lease' | 'loan') => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='lease'>Lease</SelectItem><SelectItem value='loan'>Lening</SelectItem></SelectContent></Select>
        <Input placeholder='Hoofdsom (EUR)' type='number' min='0' onChange={e => setForm({ ...form, principal_amount_cents: Math.round(Number(e.target.value || 0) * 100) })} />
        <Input placeholder='Maandbetaling (EUR)' type='number' min='0' onChange={e => setForm({ ...form, amount_cents: Math.round(Number(e.target.value || 0) * 100), monthly_payment_cents: Math.round(Number(e.target.value || 0) * 100) })} />
        <Input placeholder='Rente (%)' type='number' min='0' max='100' onChange={e => setForm({ ...form, interest_rate: Number(e.target.value || 0) })} />
        <Input type='date' value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
        <Input type='date' value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value || undefined })} />
      </div>
      <Button onClick={save}>Opslaan</Button>
    </DialogContent></Dialog>
  </div>
}
