import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { zzpApi, ZZPCommitment, ZZPCommitmentCreate, ZZPAmortizationRow } from '@/lib/api'
import { toast } from 'sonner'

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)

const emptyForm: ZZPCommitmentCreate = { type: 'loan', name: '', amount_cents: 0, start_date: new Date().toISOString().slice(0, 10) }

export const ZZPLeaseLoansPage = () => {
  const [items, setItems] = useState<ZZPCommitment[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ZZPCommitmentCreate>(emptyForm)
  const [selected, setSelected] = useState<ZZPCommitment | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<ZZPAmortizationRow[]>([])

  const load = async () => {
    const [lease, loan] = await Promise.all([zzpApi.commitments.list('lease'), zzpApi.commitments.list('loan')])
    setItems([...lease.commitments, ...loan.commitments])
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name || !form.principal_amount_cents || form.amount_cents <= 0) return
    if (editingId) await zzpApi.commitments.update(editingId, form)
    else await zzpApi.commitments.create(form)
    setOpen(false)
    setForm(emptyForm)
    setEditingId(null)
    load()
  }

  const showAmortization = async (item: ZZPCommitment) => {
    setSelected(item)
    setSchedule(await zzpApi.commitments.amortization(item.id))
  }

  const createExpense = async (item: ZZPCommitment) => {
    await zzpApi.expenses.create({
      vendor: item.name,
      description: `Automatisch aangemaakt vanuit verplichting: ${item.name}`,
      expense_date: item.next_due_date || new Date().toISOString().slice(0, 10),
      amount_cents: item.monthly_payment_cents || item.amount_cents,
      vat_rate: item.btw_rate ?? 21,
      category: 'algemeen',
      commitment_id: item.id,
    })
    toast.success('Uitgave aangemaakt')
  }

  return <div className='space-y-4 pb-4'>
    <div className='flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center'>
      <h1 className='text-xl sm:text-2xl font-semibold'>Lease & Leningen</h1>
      <Button onClick={() => setOpen(true)} className='w-full sm:w-auto'>Nieuwe lease/lening</Button>
    </div>

    <Card><CardContent className='pt-4 overflow-x-auto'>
      <Table>
        <TableHeader><TableRow><TableHead>Naam</TableHead><TableHead>Type</TableHead><TableHead>Volgende vervaldatum</TableHead><TableHead>Maandbedrag</TableHead><TableHead>Rente</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {items.map(i => <TableRow key={i.id}>
            <TableCell>{i.name}</TableCell><TableCell>{i.type}</TableCell>
            <TableCell>{i.next_due_date || '-'}</TableCell>
            <TableCell>{eur(i.monthly_payment_cents || i.amount_cents)}</TableCell>
            <TableCell>{i.interest_rate || 0}%</TableCell>
            <TableCell className='space-x-2'>
              <Button variant='outline' size='sm' onClick={() => { setForm({ ...i, start_date: i.start_date.slice(0,10), end_date: i.end_date || undefined, type: i.type as 'lease' | 'loan' }); setEditingId(i.id); setOpen(true) }}>Bewerk</Button>
              <Button variant='outline' size='sm' onClick={() => createExpense(i)}>Maak uitgave aan</Button>
              <Button variant='outline' size='sm' onClick={() => showAmortization(i)}>Aflossing</Button>
              <Button variant='destructive' size='sm' onClick={async () => { await zzpApi.commitments.delete(i.id); load() }}>Verwijder</Button>
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
        <Input placeholder='Hoofdsom (EUR)' type='number' onChange={e => setForm({ ...form, principal_amount_cents: Math.round(Number(e.target.value || 0) * 100) })} />
        <Input placeholder='Maandbetaling (EUR)' type='number' onChange={e => setForm({ ...form, amount_cents: Math.round(Number(e.target.value || 0) * 100), monthly_payment_cents: Math.round(Number(e.target.value || 0) * 100) })} />
        <Input placeholder='Rente (%)' type='number' min='0' max='100' onChange={e => setForm({ ...form, interest_rate: Number(e.target.value || 0) })} />
        <Input type='date' value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
        <Input type='date' value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value || undefined })} />
      </div>
      <Button onClick={save}>Opslaan</Button>
    </DialogContent></Dialog>
  </div>
}
