import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { zzpApi, ZZPCommitment, ZZPCommitmentCreate, ZZPCommitmentSuggestion, ZZPExpense } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { navigateTo } from '@/lib/navigation'
import { toast } from 'sonner'
import { CommitmentExpenseDialog } from '@/components/CommitmentExpenseDialog'
import { createDemoCommitments } from '@/lib/commitments'

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const todayStr = () => new Date().toISOString().slice(0, 10)
const isExpired = (item: ZZPCommitment) => item.status === 'ended' || item.end_date_status === 'ended'
const isPaused = (item: ZZPCommitment) => item.status === 'paused'
const errorWithStatus = (error: unknown) => axios.isAxiosError(error) && error.response?.status ? `${error.response.status}: ${parseApiError(error)}` : parseApiError(error)

const defaultForm = (): ZZPCommitmentCreate => ({ type: 'subscription', name: '', amount_cents: 0, recurring_frequency: 'monthly', start_date: todayStr(), auto_renew: true, btw_rate: 21, status: 'active' })

export const ZZPSubscriptionsPage = () => {
  const [items, setItems] = useState<ZZPCommitment[]>([])
  const [suggestions, setSuggestions] = useState<ZZPCommitmentSuggestion[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedExpenseCommitment, setSelectedExpenseCommitment] = useState<ZZPCommitment | null>(null)
  const [isCreatingExpense, setIsCreatingExpense] = useState(false)
  const [expenses, setExpenses] = useState<ZZPExpense[]>([])
  const [form, setForm] = useState<ZZPCommitmentCreate>(defaultForm())

  const load = async () => {
    try {
      const [list, suggestionResp, expenseResp] = await Promise.all([zzpApi.commitments.list('subscription'), zzpApi.commitments.suggestions(), zzpApi.expenses.list()])
      setItems(list.commitments)
      setSuggestions(suggestionResp.suggestions)
      setExpenses(expenseResp.expenses)
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  useEffect(() => { load() }, [])

  const yearlyCostCents = useMemo(() => form.recurring_frequency === 'yearly' ? form.amount_cents : form.amount_cents * 12, [form])
  const estimatedVatReclaimCents = useMemo(() => {
    if (!form.btw_rate || form.btw_rate <= 0) return 0
    return Math.round(yearlyCostCents * (form.btw_rate / 100) / (1 + form.btw_rate / 100))
  }, [form.btw_rate, yearlyCostCents])


  const expensesByCommitmentId = useMemo(() => expenses.reduce<Record<string, ZZPExpense[]>>((acc, expense) => {
    if (!expense.commitment_id) return acc
    acc[expense.commitment_id] = [...(acc[expense.commitment_id] || []), expense]
    return acc
  }, {}), [expenses])
  const isActive = (item: ZZPCommitment) => !isExpired(item)

  const save = async () => {
    if (!form.name || form.amount_cents <= 0 || !form.recurring_frequency) {
      toast.error('Vul naam, bedrag en frequentie in.')
      return
    }

    const hasDuplicate = items.some(item => item.id !== editingId && isActive(item) && item.name.trim().toLowerCase() === form.name.trim().toLowerCase() && item.amount_cents === form.amount_cents)
    if (hasDuplicate && !window.confirm('Er bestaat al een actief abonnement met dezelfde naam en bedrag. Toch opslaan?')) return

    try {
      if (editingId) await zzpApi.commitments.update(editingId, form)
      else await zzpApi.commitments.create(form)
      setForm(defaultForm())
      setEditingId(null)
      load()
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

  const addExamples = async () => {
    try {
      await createDemoCommitments(todayStr())
      toast.success('Voorbeelden toegevoegd')
      load()
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  const editItem = (i: ZZPCommitment) => {
    setEditingId(i.id)
    setForm({ ...i, type: 'subscription', recurring_frequency: (i.recurring_frequency || 'monthly') as 'monthly' | 'yearly', start_date: i.start_date.slice(0, 10), end_date: i.end_date || undefined, renewal_date: i.renewal_date || undefined })
  }

  return <div className='space-y-4 pb-4'>
    <h1 className='text-xl sm:text-2xl font-semibold'>Abonnementen & Recurring Kosten</h1>
    <Card><CardHeader><CardTitle>Nieuw abonnement</CardTitle></CardHeader><CardContent className='grid grid-cols-1 md:grid-cols-3 gap-2'>
      <Input placeholder='Naam' value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Input type='number' min='0' placeholder='Bedrag (EUR)' value={form.amount_cents ? form.amount_cents / 100 : ''} onChange={e => setForm({ ...form, amount_cents: Math.round(Number(e.target.value || 0) * 100) })} />
      <Select value={form.recurring_frequency} onValueChange={(v: 'monthly' | 'yearly') => setForm({ ...form, recurring_frequency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='monthly'>Maandelijks</SelectItem><SelectItem value='yearly'>Jaarlijks</SelectItem></SelectContent></Select>
      <Input type='date' value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
      <Input type='number' min='1' placeholder='Contractduur (maanden)' value={form.contract_term_months || ''} onChange={e => setForm({ ...form, contract_term_months: Number(e.target.value || 0) || undefined })} />
      <Select value={String(form.btw_rate ?? 21)} onValueChange={(v) => setForm({ ...form, btw_rate: Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='0'>0%</SelectItem><SelectItem value='9'>9%</SelectItem><SelectItem value='21'>21%</SelectItem></SelectContent></Select>
      <Input type='number' min='0' placeholder='Opzegtermijn (dagen)' value={form.notice_period_days || ''} onChange={e => setForm({ ...form, notice_period_days: Number(e.target.value || 0) || undefined })} />
      <Select value={form.auto_renew === false ? 'false' : 'true'} onValueChange={v => setForm({ ...form, auto_renew: v === 'true' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='true'>Automatisch verlengen</SelectItem><SelectItem value='false'>Niet automatisch verlengen</SelectItem></SelectContent></Select>
      <Input type='date' value={form.renewal_date || ''} onChange={e => setForm({ ...form, renewal_date: e.target.value || undefined })} />
      <Select value={form.status || 'active'} onValueChange={(v: 'active' | 'paused' | 'ended') => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='active'>Actief</SelectItem><SelectItem value='paused'>Gepauzeerd</SelectItem><SelectItem value='ended'>Beëindigd</SelectItem></SelectContent></Select>
      <div className='md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded border p-3 text-sm'>
        <div><p className='text-muted-foreground'>Jaarlijkse kosten</p><p className='font-medium'>{eur(yearlyCostCents)}</p></div>
        <div><p className='text-muted-foreground'>Geschatte BTW-teruggave</p><p className='font-medium'>{form.btw_rate && form.btw_rate > 0 ? eur(estimatedVatReclaimCents) : 'n.v.t.'}</p></div>
      </div>
      <div className='md:col-span-3'>
        <Button onClick={save}>{editingId ? 'Bijwerken' : 'Opslaan'}</Button>
      </div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Abonnementen</CardTitle></CardHeader><CardContent className='space-y-3'>
      {items.length === 0 && <div><Button variant='outline' onClick={addExamples}>Voeg voorbeelden toe</Button></div>}

      <div className='sm:hidden space-y-2'>
        {items.map(i => <div id={`commitment-${i.id}`} key={i.id} className='rounded-md border p-3 space-y-2'>
          <div className='flex items-center justify-between gap-2'>
            <p className='font-medium'>{i.name}</p>
            {isPaused(i) ? <Badge variant='secondary'>Gepauzeerd</Badge> : isExpired(i) ? <Badge variant='secondary'>Beëindigd</Badge> : null}
          </div>
          <p className='text-sm text-muted-foreground'>Frequentie: {i.recurring_frequency}</p>
          <p className='text-sm text-muted-foreground'>Volgende vervaldatum: {i.next_due_date || '-'}</p>
          <p className='text-sm text-muted-foreground'>Opzegtermijn: {i.notice_period_days || 0} dagen</p>
          <p className='text-sm text-muted-foreground'>Auto-renew: {i.auto_renew ? 'Ja' : 'Nee'}</p>
          <p className='text-sm font-medium'>{eur(i.amount_cents)}</p>
          <p className='text-xs text-muted-foreground'>Laatste boeking: {i.last_booked_date || '-'}</p>
          <p className='text-xs text-muted-foreground'>Gekoppelde uitgaven: {(expensesByCommitmentId[i.id] || []).length}</p>
          {(expensesByCommitmentId[i.id] || []).slice(0, 2).map(exp => <p key={exp.id} className='text-xs text-muted-foreground'>• {exp.expense_date}: {eur(exp.amount_cents)}</p>)}
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' size='sm' onClick={() => editItem(i)}>Bewerk</Button>
            <Button variant='outline' size='sm' disabled={isPaused(i) || isExpired(i)} onClick={() => setSelectedExpenseCommitment(i)}>Maak uitgave aan</Button>
            <Button variant='destructive' size='sm' onClick={async () => { try { await zzpApi.commitments.delete(i.id); load() } catch (error) { toast.error(errorWithStatus(error)) } }}>Verwijder</Button>
          </div>
        </div>)}
      </div>

      <div className='hidden sm:block overflow-x-auto'>
        <Table>
          <TableHeader><TableRow><TableHead>Naam</TableHead><TableHead>Status</TableHead><TableHead>Frequentie</TableHead><TableHead>Volgende vervaldatum</TableHead><TableHead>Opzegtermijn</TableHead><TableHead>Auto-renew</TableHead><TableHead>Bedrag</TableHead><TableHead>Laatste boeking</TableHead><TableHead>Uitgaven</TableHead><TableHead /></TableRow></TableHeader><TableBody>
            {items.map(i => <TableRow id={`commitment-${i.id}`} key={i.id}><TableCell>{i.name}</TableCell><TableCell>{i.status}</TableCell><TableCell>{i.recurring_frequency}</TableCell><TableCell><div className='flex items-center gap-2'>{i.next_due_date || '-'} {isPaused(i) ? <Badge variant='secondary'>Gepauzeerd</Badge> : isExpired(i) ? <Badge variant='secondary'>Beëindigd</Badge> : null}</div></TableCell><TableCell>{i.notice_period_days || 0} dgn</TableCell><TableCell>{i.auto_renew ? 'Ja' : 'Nee'}</TableCell><TableCell>{eur(i.amount_cents)}</TableCell><TableCell className='text-xs text-muted-foreground'>{i.last_booked_date || '-'}</TableCell><TableCell>{(expensesByCommitmentId[i.id] || []).length}</TableCell><TableCell className='space-x-2 whitespace-nowrap'><Button variant='outline' size='sm' onClick={() => editItem(i)}>Bewerk</Button><Button variant='outline' size='sm' disabled={isPaused(i) || isExpired(i)} onClick={() => setSelectedExpenseCommitment(i)}>Maak uitgave aan</Button><Button variant='destructive' size='sm' onClick={async () => { try { await zzpApi.commitments.delete(i.id); load() } catch (error) { toast.error(errorWithStatus(error)) } }}>Verwijder</Button></TableCell></TableRow>)}
          </TableBody></Table>
      </div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Suggesties op basis van bankfeed</CardTitle></CardHeader><CardContent className='space-y-2'>
      {suggestions.length === 0 && <p className='text-sm text-muted-foreground'>Nog geen suggesties gevonden.</p>}
      {suggestions.map(s => <div key={s.bank_transaction_id} className='border rounded p-2 text-sm flex justify-between'><span>{s.description}</span><span>{eur(s.amount_cents)} · {(s.confidence * 100).toFixed(0)}%</span></div>)}
    </CardContent></Card>

    <CommitmentExpenseDialog open={!!selectedExpenseCommitment} commitment={selectedExpenseCommitment} isSubmitting={isCreatingExpense} onOpenChange={(open) => { if (!open) setSelectedExpenseCommitment(null) }} onConfirm={confirmCreateExpense} />
  </div>
}
