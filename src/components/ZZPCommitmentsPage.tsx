import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { zzpApi, getErrorMessage, type ZZPCommitment, type ZZPCommitmentCreate } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { LegacyCommitmentImport } from './LegacyCommitmentImport'
import { CommitmentExpenseDialog } from './CommitmentExpenseDialog'
import { toast } from 'sonner'

const euro = (value: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value / 100)
const labels = { monthly: 'Maandelijks', quarterly: 'Per kwartaal', yearly: 'Jaarlijks' }
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const blank = (subscription: boolean) => ({ type: subscription ? 'subscription' : 'loan', name: '', amount: '', principal: '', interest: '', frequency: 'monthly', start: localToday(), end: '', remaining: '', vat: subscription ? '21' : '0', notice: '', contractMonths: '', notes: '', status: 'active', autoRenew: subscription })
type Form = ReturnType<typeof blank>

export function ZZPCommitmentsPage({ subscriptions = false }: { subscriptions?: boolean }) {
  const { user } = useAuth()
  const client = useQueryClient()
  const queryKey = ['zzp-commitments', user?.id]
  const { data, isLoading, error, refetch } = useQuery({ queryKey, queryFn: () => zzpApi.commitments.list(), enabled: !!user?.id })
  const rows = (data?.commitments ?? []).filter(row => subscriptions ? row.type === 'subscription' : row.type !== 'subscription')
  const [editing, setEditing] = useState<ZZPCommitment | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(() => blank(subscriptions))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [expense, setExpense] = useState<ZZPCommitment | null>(null)
  const [booking, setBooking] = useState(false)
  const [ending, setEnding] = useState<ZZPCommitment | null>(null)

  const edit = (item: ZZPCommitment) => {
    setEditing(item)
    setForm({ type: item.type, name: item.name, amount: String((item.monthly_payment_cents || item.amount_cents) / 100), principal: item.principal_amount_cents != null ? String(item.principal_amount_cents / 100) : '', interest: String(item.interest_rate ?? ''), frequency: item.recurring_frequency ?? 'monthly', start: item.start_date, end: item.end_date ?? '', remaining: item.remaining_balance_override_cents != null ? String(item.remaining_balance_override_cents / 100) : '', vat: String(item.vat_rate ?? item.btw_rate ?? 0), notice: String(item.notice_period_days ?? ''), contractMonths: String(item.contract_term_months ?? ''), notes: item.notes ?? '', status: item.status, autoRenew: item.auto_renew })
    setSaveError(''); setOpen(true)
  }
  useEffect(() => {
    const id = window.location.hash.replace('#commitment-', '')
    if (!id || !data) return
    const item = data.commitments.find(row => row.id === id)
    if (item) edit(item)
    window.history.replaceState({}, '', window.location.pathname + window.location.search)
  }, [data])

  const refresh = () => { void client.invalidateQueries({ queryKey: ['zzp-commitments', user?.id] }); void client.invalidateQueries({ queryKey: ['zzp-dashboard', user?.id] }); void client.invalidateQueries({ queryKey: ['zzp-commitments-overview', user?.id] }) }
  const save = async () => {
    setSaveError(''); setSaving(true)
    try {
      const cents = (value: string) => Math.round(Number(value.replace(',', '.')) * 100)
      const amount = cents(form.amount)
      if (form.name.trim().length < 2 || !Number.isFinite(amount) || amount <= 0 || !form.start) throw new Error('Vul een naam, startdatum en geldig positief bedrag in.')
      if (form.end && form.end < form.start) throw new Error('Einddatum moet na de startdatum liggen.')
      if (form.type !== 'subscription' && !(cents(form.principal) > 0)) throw new Error('Vul de hoofdsom in.')
      const payload: ZZPCommitmentCreate = { type: form.type as ZZPCommitmentCreate['type'], name: form.name.trim(), amount_cents: amount, monthly_payment_cents: form.type === 'subscription' ? undefined : amount, principal_amount_cents: form.type === 'subscription' ? undefined : cents(form.principal), interest_rate: form.interest ? Number(form.interest.replace(',', '.')) : undefined, recurring_frequency: form.frequency as ZZPCommitmentCreate['recurring_frequency'], start_date: form.start, end_date: form.end || undefined, vat_rate: Number(form.vat), notice_period_days: form.notice ? Number(form.notice) : undefined, contract_term_months: form.contractMonths ? Number(form.contractMonths) : undefined, notes: form.notes, status: form.status as ZZPCommitmentCreate['status'], auto_renew: form.autoRenew, remaining_balance_override_cents: form.remaining ? cents(form.remaining) : undefined }
      if (editing) await zzpApi.commitments.update(editing.id, { ...payload, end_date: form.end || null, contract_term_months: form.contractMonths ? Number(form.contractMonths) : null, notice_period_days: form.notice ? Number(form.notice) : null, remaining_balance_override_cents: form.remaining ? cents(form.remaining) : null })
      else await zzpApi.commitments.create(payload)
      setOpen(false); refresh(); toast.success('Verplichting opgeslagen.')
    } catch (error) { setSaveError(getErrorMessage(error)) }
    finally { setSaving(false) }
  }
  const field = (key: keyof Form, label: string, type = 'text') => <div className="space-y-1"><Label htmlFor={`commitment-${key}`}>{label}</Label><Input id={`commitment-${key}`} type={type} value={String(form[key])} onChange={event => setForm(prev => ({ ...prev, [key]: event.target.value }))}/></div>
  const monthly = rows.filter(row => row.status === 'active').reduce((sum, row) => sum + Math.round((row.monthly_payment_cents || row.amount_cents) / (row.recurring_frequency === 'yearly' ? 12 : row.recurring_frequency === 'quarterly' ? 3 : 1)), 0)

  return <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{subscriptions ? 'Abonnementen' : 'Lease & leningen'}</h1><p className="text-sm text-muted-foreground">Dezelfde bedrijfsgegevens als in je verplichtingenoverzicht en bij je boekhouder.</p></div><Button onClick={() => { setEditing(null); setForm(blank(subscriptions)); setSaveError(''); setOpen(true) }}>Nieuwe verplichting</Button></div>
    <LegacyCommitmentImport onImported={refresh}/>
    <Card><CardHeader><CardTitle>Maandelijkse lasten</CardTitle></CardHeader><CardContent>{euro(monthly)}</CardContent></Card>
    {error && <Alert variant="destructive"><AlertDescription>{getErrorMessage(error)} <Button variant="outline" onClick={() => refetch()}>Opnieuw proberen</Button></AlertDescription></Alert>}
    {isLoading && <p role="status">Verplichtingen laden...</p>}
    {!isLoading && !error && rows.length === 0 && <p className="text-muted-foreground">Nog geen verplichtingen toegevoegd.</p>}
    {rows.map(row => <Card key={row.id} id={`commitment-${row.id}`}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4"><div className="min-w-0"><h2 className="font-semibold">{row.name}</h2><p className="text-sm text-muted-foreground">{euro(row.monthly_payment_cents || row.amount_cents)} · {labels[row.recurring_frequency ?? 'monthly']} · {row.next_due_date ?? 'Geen volgende betaling'}</p><Badge variant="outline">{row.status}</Badge>{row.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{row.notes}</p>}{row.remaining_balance_cents != null && <p className="text-sm">Restschuld: {euro(row.remaining_balance_cents)}{row.remaining_balance_override_cents != null ? ' (handmatig)' : ' (schatting)'}</p>}</div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => edit(row)}>Bewerken</Button><Button variant="outline" disabled={row.status !== 'active'} onClick={() => setExpense(row)}>Maak uitgave</Button><Button variant="outline" disabled={row.status === 'ended'} onClick={() => setEnding(row)}>Beëindigen</Button></div></CardContent></Card>)}
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value) }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? 'Verplichting bewerken' : 'Nieuwe verplichting'}</DialogTitle></DialogHeader><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {!subscriptions && <div className="space-y-1"><Label>Type</Label><Select value={form.type} onValueChange={type => setForm(prev => ({ ...prev, type }))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="lease">Lease</SelectItem><SelectItem value="loan">Lening</SelectItem></SelectContent></Select></div>}
      {field('name', 'Naam')}{field('amount', 'Bedrag per betaalperiode (€)')}
      <div className="space-y-1"><Label>Betaalfrequentie</Label><Select value={form.frequency} onValueChange={frequency => setForm(prev => ({ ...prev, frequency }))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Object.entries(labels).map(([value,label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      {!subscriptions && <>{field('principal','Hoofdsom (€)')}{field('interest','Jaarlijkse rente (%)')}{field('remaining','Handmatige restschuld (€), optioneel')}</>}
      {field('start','Startdatum','date')}{field('end','Einddatum, optioneel','date')}{field('contractMonths','Contractduur in maanden, optioneel','number')}{field('notice','Opzegtermijn in dagen, optioneel','number')}
      <div className="space-y-1"><Label>BTW</Label><Select value={form.vat} onValueChange={vat => setForm(prev => ({ ...prev, vat }))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[0,9,21].map(rate => <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Status</Label><Select value={form.status} onValueChange={status => setForm(prev => ({ ...prev, status }))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="active">Actief</SelectItem><SelectItem value="paused">Gepauzeerd</SelectItem><SelectItem value="ended">Beëindigd</SelectItem></SelectContent></Select></div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={form.autoRenew} onChange={e => setForm(prev => ({ ...prev, autoRenew:e.target.checked }))}/>Automatisch verlengen</label>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="commitment-notes">Notities</Label><Textarea id="commitment-notes" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes:e.target.value }))}/></div>
    </div>{saveError && <p role="alert" className="text-destructive">{saveError}</p>}<Button disabled={saving} onClick={save}>{saving ? 'Opslaan...' : 'Opslaan'}</Button></DialogContent></Dialog>
    <Dialog open={!!ending} onOpenChange={value => { if (!saving && !value) setEnding(null) }}><DialogContent><DialogHeader><DialogTitle>Verplichting beëindigen?</DialogTitle></DialogHeader><p>{ending?.name} blijft bewaard met de gekoppelde uitgaven.</p><Button disabled={saving} onClick={async () => { if (!ending) return; setSaving(true); try { await zzpApi.commitments.update(ending.id,{status:'ended'}); setEnding(null); refresh() } catch(error) { toast.error(getErrorMessage(error)) } finally { setSaving(false) } }}>Beëindigen</Button></DialogContent></Dialog>
    <CommitmentExpenseDialog open={!!expense} commitment={expense} isSubmitting={booking} onOpenChange={value => { if (!booking && !value) setExpense(null) }} onConfirm={async payload => { if (!expense) return; setBooking(true); try { await zzpApi.commitments.createExpense(expense.id,payload); setExpense(null); refresh(); toast.success('Uitgave aangemaakt.') } catch(error) { toast.error(getErrorMessage(error)) } finally { setBooking(false) } }}/>
  </div>
}
