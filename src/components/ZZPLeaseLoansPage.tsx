import { useEffect, useState } from 'react'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { zzpApi, ZZPCommitment, ZZPCommitmentCreate, ZZPAmortizationRow, ZZPExpense } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { navigateTo } from '@/lib/navigation'
import { toast } from 'sonner'
import { CommitmentExpenseDialog } from '@/components/CommitmentExpenseDialog'
import { createDemoCommitments } from '@/lib/commitments'

const eur = (cents?: number | null) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100)
const todayStr = () => new Date().toISOString().slice(0, 10)
const isExpired = (item: ZZPCommitment) => item.status === 'ended' || item.end_date_status === 'ended'
const isPaused = (item: ZZPCommitment) => item.status === 'paused'
const errorWithStatus = (error: unknown) => axios.isAxiosError(error) && error.response?.status ? `${error.response.status}: ${parseApiError(error)}` : parseApiError(error)

const emptyForm: ZZPCommitmentCreate = { type: 'loan', name: '', amount_cents: 0, start_date: todayStr(), auto_renew: true, status: 'active' }

export const ZZPLeaseLoansPage = () => {
  const [items, setItems] = useState<ZZPCommitment[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ZZPCommitmentCreate>(emptyForm)
  const [selected, setSelected] = useState<ZZPCommitment | null>(null)
  const [selectedExpenseCommitment, setSelectedExpenseCommitment] = useState<ZZPCommitment | null>(null)
  const [isCreatingExpense, setIsCreatingExpense] = useState(false)
  const [expenses, setExpenses] = useState<ZZPExpense[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<ZZPAmortizationRow[]>([])

  const load = async () => {
    try {
      const [lease, loan, expenseResp] = await Promise.all([zzpApi.commitments.list('lease'), zzpApi.commitments.list('loan'), zzpApi.expenses.list()])
      setItems([...lease.commitments, ...loan.commitments])
      setExpenses(expenseResp.expenses)
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name || !form.principal_amount_cents || form.amount_cents <= 0) {
      toast.error('Vul naam, hoofdsom en maandbetaling in.')
      return
    }
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

  const confirmCreateExpense = async (payload: { expense_date: string; amount_cents: number; vat_rate: number; description: string; notes?: string }) => {
    if (!selectedExpenseCommitment) return
    setIsCreatingExpense(true)

    try {
      const created = await zzpApi.commitments.createExpense(selectedExpenseCommitment.id, payload)
      setSelectedExpenseCommitment(null)
      toast.success('Uitgave aangemaakt', { action: { label: 'Open uitgave', onClick: () => navigateTo(`/zzp/expenses#expense-${created.expense_id}`) } })
      load()
    } catch (error) {
      toast.error(errorWithStatus(error))
    } finally {
      setIsCreatingExpense(false)
    }
  }


  const expensesByCommitmentId = items.reduce<Record<string, ZZPExpense[]>>((acc, _item) => acc, {})
  expenses.forEach((expense) => {
    if (!expense.commitment_id) return
    expensesByCommitmentId[expense.commitment_id] = [...(expensesByCommitmentId[expense.commitment_id] || []), expense]
  })
  const addExamples = async () => {
    try {
      await createDemoCommitments(todayStr())
      toast.success('Voorbeelden toegevoegd')
      load()
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  const fillFormFromItem = (i: ZZPCommitment) => {
    setForm({ ...i, start_date: i.start_date.slice(0, 10), end_date: i.end_date || undefined, type: i.type as 'lease' | 'loan' })
    setEditingId(i.id)
    setOpen(true)
  }

  return <div className='space-y-4 pb-4'>
    <div className='flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center'>
      <h1 className='text-xl sm:text-2xl font-semibold'>Lease & Leningen</h1>
      <Button onClick={() => setOpen(true)}>Nieuwe lease/lening</Button>
    </div>

    <Card><CardContent className='pt-4 space-y-3'>
      {items.length === 0 && <div><Button variant='outline' onClick={addExamples}>Voeg voorbeelden toe</Button></div>}

      <div className='sm:hidden space-y-2'>
        {items.map(i => <div id={`commitment-${i.id}`} key={i.id} className='rounded-md border p-3 space-y-2'>
          <div className='flex items-center justify-between gap-2'>
            <p className='font-medium'>{i.name}</p>
            {isPaused(i) ? <Badge variant='secondary'>Gepauzeerd</Badge> : isExpired(i) ? <Badge variant='secondary'>Beëindigd</Badge> : null}
          </div>
          <p className='text-sm text-muted-foreground'>Provider: {i.provider || '-'}</p>
          <p className='text-sm text-muted-foreground'>Contractnr: {i.contract_number || '-'}</p>
          <p className='text-sm text-muted-foreground'>Betaaldag: {i.payment_day || '-'}</p>
          <p className='text-sm text-muted-foreground'>Volgende vervaldatum: {i.next_due_date || '-'}</p>
          <p className='text-sm'>Restschuld: {eur(i.remaining_balance_cents)}</p>
          <p className='text-sm'>Afgelost: {eur(i.paid_to_date_cents)}</p>
          <p className='text-sm'>Eindstatus: {i.end_date_status}</p>
          <p className='text-xs text-muted-foreground'>Laatste boeking: {i.last_booked_date || '-'}</p>
          <p className='text-xs text-muted-foreground'>Uitgaven: {(expensesByCommitmentId[i.id] || []).length}</p>
          {(expensesByCommitmentId[i.id] || []).slice(0, 2).map(exp => <p key={exp.id} className='text-xs text-muted-foreground'>• {exp.expense_date}: {eur(exp.amount_cents)}</p>)}
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' size='sm' onClick={() => fillFormFromItem(i)}>Bewerk</Button>
            <Button variant='outline' size='sm' disabled={isPaused(i) || isExpired(i)} onClick={() => setSelectedExpenseCommitment(i)}>Maak uitgave aan</Button>
            <Button variant='outline' size='sm' onClick={() => showAmortization(i)}>Aflossing</Button>
            <Button variant='destructive' size='sm' onClick={async () => { try { await zzpApi.commitments.delete(i.id); load() } catch (error) { toast.error(errorWithStatus(error)) } }}>Verwijder</Button>
          </div>
        </div>)}
      </div>

      <div className='hidden sm:block overflow-x-auto'>
        <Table>
          <TableHeader><TableRow><TableHead>Naam</TableHead><TableHead>Status</TableHead><TableHead>Provider</TableHead><TableHead>Contractnr</TableHead><TableHead>Volgende vervaldatum</TableHead><TableHead>Laatste boeking</TableHead><TableHead>Uitgaven</TableHead><TableHead>Restschuld</TableHead><TableHead>Afgelost</TableHead><TableHead>Eindstatus</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {items.map(i => <TableRow id={`commitment-${i.id}`} key={i.id}>
              <TableCell>{i.name}</TableCell>
              <TableCell>{i.status}</TableCell>
              <TableCell>{i.provider || '-'}</TableCell>
              <TableCell>{i.contract_number || '-'}</TableCell>
              <TableCell><div className='flex items-center gap-2'>{i.next_due_date || '-'} {isPaused(i) ? <Badge variant='secondary'>Gepauzeerd</Badge> : isExpired(i) ? <Badge variant='secondary'>Beëindigd</Badge> : null}</div></TableCell>
              <TableCell>{i.last_booked_date || '-'}</TableCell><TableCell>{(expensesByCommitmentId[i.id] || []).length}</TableCell><TableCell>{eur(i.remaining_balance_cents)}</TableCell>
              <TableCell>{eur(i.paid_to_date_cents)}</TableCell>
              <TableCell>{i.end_date_status}</TableCell>
              <TableCell className='space-x-2 whitespace-nowrap'>
                <Button variant='outline' size='sm' onClick={() => fillFormFromItem(i)}>Bewerk</Button>
                <Button variant='outline' size='sm' disabled={isPaused(i) || isExpired(i)} onClick={() => setSelectedExpenseCommitment(i)}>Maak uitgave aan</Button>
                <Button variant='outline' size='sm' onClick={() => showAmortization(i)}>Aflossing</Button>
                <Button variant='destructive' size='sm' onClick={async () => { try { await zzpApi.commitments.delete(i.id); load() } catch (error) { toast.error(errorWithStatus(error)) } }}>Verwijder</Button>
              </TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
    </CardContent></Card>

    {selected && <Card><CardHeader><CardTitle>Aflossingsschema: {selected.name}</CardTitle></CardHeader><CardContent>
      <Accordion type='single' collapsible>
        <AccordionItem value='amort'>
          <AccordionTrigger>Toon aflossingsschema ({schedule.length} regels)</AccordionTrigger>
          <AccordionContent className='overflow-x-auto'>
            <Table><TableHeader><TableRow><TableHead>Maand</TableHead><TableHead>Datum</TableHead><TableHead>Rente</TableHead><TableHead>Aflossing</TableHead><TableHead>Restschuld</TableHead></TableRow></TableHeader>
              <TableBody>{schedule.map(r => <TableRow key={r.month_index}><TableCell>{r.month_index}</TableCell><TableCell>{r.due_date}</TableCell><TableCell>{eur(r.interest_cents)}</TableCell><TableCell>{eur(r.principal_cents)}</TableCell><TableCell>{eur(r.remaining_balance_cents)}</TableCell></TableRow>)}</TableBody></Table>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </CardContent></Card>}

    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyForm) } }}><DialogContent><DialogHeader><DialogTitle>{editingId ? 'Lease/Lening bewerken' : 'Lease/Lening toevoegen'}</DialogTitle></DialogHeader>
      <div className='space-y-2'>
        <Input placeholder='Naam' value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Select value={form.type} onValueChange={(v: 'lease' | 'loan') => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='lease'>Lease</SelectItem><SelectItem value='loan'>Lening</SelectItem></SelectContent></Select>
        <Input placeholder='Provider' value={form.provider || ''} onChange={e => setForm({ ...form, provider: e.target.value || undefined })} />
        <Input placeholder='Contractnummer' value={form.contract_number || ''} onChange={e => setForm({ ...form, contract_number: e.target.value || undefined })} />
        <Input placeholder='Betaaldag (1-28)' type='number' min='1' max='28' value={form.payment_day || ''} onChange={e => setForm({ ...form, payment_day: Number(e.target.value || 0) || undefined })} />
        <Input placeholder='Hoofdsom (EUR)' type='number' min='0' value={form.principal_amount_cents ? form.principal_amount_cents / 100 : ''} onChange={e => setForm({ ...form, principal_amount_cents: Math.round(Number(e.target.value || 0) * 100) })} />
        <Input placeholder='Maandbetaling (EUR)' type='number' min='0' value={form.amount_cents ? form.amount_cents / 100 : ''} onChange={e => setForm({ ...form, amount_cents: Math.round(Number(e.target.value || 0) * 100), monthly_payment_cents: Math.round(Number(e.target.value || 0) * 100) })} />
        <Input placeholder='Rente (%)' type='number' min='0' max='100' value={form.interest_rate || ''} onChange={e => setForm({ ...form, interest_rate: Number(e.target.value || 0) })} />
        <Input type='date' value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
        <Input type='date' value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value || undefined })} />
        <Select value={form.status || 'active'} onValueChange={(v: 'active' | 'paused' | 'ended') => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='active'>Actief</SelectItem><SelectItem value='paused'>Gepauzeerd</SelectItem><SelectItem value='ended'>Beëindigd</SelectItem></SelectContent></Select>
      </div>
      <Button onClick={save}>Opslaan</Button>
    </DialogContent></Dialog>

    <CommitmentExpenseDialog open={!!selectedExpenseCommitment} commitment={selectedExpenseCommitment} isSubmitting={isCreatingExpense} onOpenChange={(isOpen) => { if (!isOpen) setSelectedExpenseCommitment(null) }} onConfirm={confirmCreateExpense} />
  </div>
}
