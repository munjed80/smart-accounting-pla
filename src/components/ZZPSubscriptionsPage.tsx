import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { zzpApi, ZZPCommitment, ZZPCommitmentCreate, ZZPCommitmentSuggestion } from '@/lib/api'
import { toast } from 'sonner'

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)

export const ZZPSubscriptionsPage = () => {
  const [items, setItems] = useState<ZZPCommitment[]>([])
  const [suggestions, setSuggestions] = useState<ZZPCommitmentSuggestion[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ZZPCommitmentCreate>({ type: 'subscription', name: '', amount_cents: 0, recurring_frequency: 'monthly', start_date: new Date().toISOString().slice(0, 10) })

  const load = async () => {
    const [list, suggestionResp] = await Promise.all([zzpApi.commitments.list('subscription'), zzpApi.commitments.suggestions()])
    setItems(list.commitments)
    setSuggestions(suggestionResp.suggestions)
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name || form.amount_cents <= 0 || !form.recurring_frequency) return
    if (editingId) await zzpApi.commitments.update(editingId, form)
    else await zzpApi.commitments.create(form)
    setForm({ type: 'subscription', name: '', amount_cents: 0, recurring_frequency: 'monthly', start_date: new Date().toISOString().slice(0, 10) })
    setEditingId(null)
    load()
  }

  const createExpense = async (item: ZZPCommitment) => {
    await zzpApi.expenses.create({
      vendor: item.name,
      description: `Automatisch aangemaakt vanuit verplichting: ${item.name}`,
      expense_date: item.next_due_date || new Date().toISOString().slice(0, 10),
      amount_cents: item.amount_cents,
      vat_rate: item.btw_rate ?? 21,
      category: 'software',
      commitment_id: item.id,
    })
    toast.success('Uitgave aangemaakt')
  }

  return <div className='space-y-4 pb-4'>
    <h1 className='text-xl sm:text-2xl font-semibold'>Abonnementen & Recurring Kosten</h1>
    <Card><CardHeader><CardTitle>Nieuw abonnement</CardTitle></CardHeader><CardContent className='grid grid-cols-1 md:grid-cols-3 gap-2'>
      <Input placeholder='Naam' value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Input type='number' placeholder='Bedrag (EUR)' onChange={e => setForm({ ...form, amount_cents: Math.round(Number(e.target.value || 0) * 100) })} />
      <Select value={form.recurring_frequency} onValueChange={(v: 'monthly' | 'yearly') => setForm({ ...form, recurring_frequency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='monthly'>Maandelijks</SelectItem><SelectItem value='yearly'>Jaarlijks</SelectItem></SelectContent></Select>
      <Input type='date' value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
      <Input type='number' placeholder='Contractduur (maanden)' onChange={e => setForm({ ...form, contract_term_months: Number(e.target.value || 0) })} />
      <Input type='number' min='0' max='100' placeholder='BTW %' onChange={e => setForm({ ...form, btw_rate: Number(e.target.value || 0) })} />
      <Input type='date' value={form.renewal_date || ''} onChange={e => setForm({ ...form, renewal_date: e.target.value || undefined })} />
      <Button onClick={save}>{editingId ? 'Bijwerken' : 'Opslaan'}</Button>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Abonnementen</CardTitle></CardHeader><CardContent className='overflow-x-auto'>
      <Table><TableHeader><TableRow><TableHead>Naam</TableHead><TableHead>Frequentie</TableHead><TableHead>Volgende vervaldatum</TableHead><TableHead>Bedrag</TableHead><TableHead /></TableRow></TableHeader><TableBody>
        {items.map(i => <TableRow key={i.id}><TableCell>{i.name}</TableCell><TableCell>{i.recurring_frequency}</TableCell><TableCell>{i.next_due_date || '-'}</TableCell><TableCell>{eur(i.amount_cents)}</TableCell><TableCell className='space-x-2'><Button variant='outline' size='sm' onClick={() => { setEditingId(i.id); setForm({ ...i, type: 'subscription', recurring_frequency: (i.recurring_frequency || 'monthly') as 'monthly' | 'yearly', start_date: i.start_date.slice(0,10), end_date: i.end_date || undefined, renewal_date: i.renewal_date || undefined }) }}>Bewerk</Button><Button variant='outline' size='sm' onClick={() => createExpense(i)}>Maak uitgave aan</Button><Button variant='destructive' size='sm' onClick={async () => { await zzpApi.commitments.delete(i.id); load() }}>Verwijder</Button></TableCell></TableRow>)}
      </TableBody></Table>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Suggesties op basis van bankfeed</CardTitle></CardHeader><CardContent className='space-y-2'>
      {suggestions.length === 0 && <p className='text-sm text-muted-foreground'>Nog geen suggesties gevonden.</p>}
      {suggestions.map(s => <div key={s.bank_transaction_id} className='border rounded p-2 text-sm flex justify-between'><span>{s.description}</span><span>{eur(s.amount_cents)} · {(s.confidence * 100).toFixed(0)}%</span></div>)}
    </CardContent></Card>
  </div>
}
