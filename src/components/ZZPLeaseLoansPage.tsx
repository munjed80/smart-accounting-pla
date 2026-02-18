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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-1 sm:mb-2">
              Lease & Leningen
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Beheer je leases en leningen
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2 h-10 sm:h-11">
            <span>Nieuwe lease/lening</span>
          </Button>
        </div>

        {/* Content Card */}
        <Card className="bg-card/80 backdrop-blur-sm border border-border/50 mb-6">
          <CardContent className="pt-6 space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-12">
                <div className="max-w-md mx-auto space-y-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Badge variant="secondary" className="text-xs">Beta</Badge>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Lease & Leningen Module</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Houd je leasecontracten en leningen bij. Track aflossingen, restschulden en betalingen.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button onClick={() => setOpen(true)} className="h-10 sm:h-11">
                      Voeg je eerste lease/lening toe
                    </Button>
                    <Button variant="outline" onClick={addExamples} className="h-10 sm:h-11">
                      Voeg voorbeelden toe
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="sm:hidden space-y-3">
                  {items.map(i => (
                    <div id={`commitment-${i.id}`} key={i.id} className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-base">{i.name}</p>
                        {isPaused(i) ? <Badge variant="secondary">Gepauzeerd</Badge> : isExpired(i) ? <Badge variant="secondary">Beëindigd</Badge> : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Provider</p>
                          <p className="font-medium">{i.provider || '-'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Contractnr</p>
                          <p className="font-medium">{i.contract_number || '-'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Betaaldag</p>
                          <p className="font-medium">{i.payment_day || '-'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Volgende vervaldatum</p>
                          <p className="font-medium">{i.next_due_date || '-'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Restschuld</p>
                          <p className="font-medium">{eur(i.remaining_balance_cents)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Afgelost</p>
                          <p className="font-medium">{eur(i.paid_to_date_cents)}</p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>Eindstatus: {i.end_date_status}</p>
                        <p>Laatste boeking: {i.last_booked_date || '-'}</p>
                        <p>Uitgaven: {(expensesByCommitmentId[i.id] || []).length}</p>
                        {(expensesByCommitmentId[i.id] || []).slice(0, 2).map(exp => (
                          <p key={exp.id}>• {exp.expense_date}: {eur(exp.amount_cents)}</p>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => fillFormFromItem(i)} className="h-9">
                          Bewerk
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={isPaused(i) || isExpired(i)} 
                          onClick={() => setSelectedExpenseCommitment(i)}
                          className="h-9"
                        >
                          Maak uitgave aan
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => showAmortization(i)} className="h-9">
                          Aflossing
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={async () => { 
                            try { 
                              await zzpApi.commitments.delete(i.id); 
                              load() 
                            } catch (error) { 
                              toast.error(errorWithStatus(error)) 
                            } 
                          }}
                          className="h-9"
                        >
                          Verwijder
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table view */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Naam</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Contractnr</TableHead>
                        <TableHead>Volgende vervaldatum</TableHead>
                        <TableHead>Laatste boeking</TableHead>
                        <TableHead>Uitgaven</TableHead>
                        <TableHead>Restschuld</TableHead>
                        <TableHead>Afgelost</TableHead>
                        <TableHead>Eindstatus</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(i => (
                        <TableRow id={`commitment-${i.id}`} key={i.id}>
                          <TableCell className="font-medium">{i.name}</TableCell>
                          <TableCell>{i.status}</TableCell>
                          <TableCell>{i.provider || '-'}</TableCell>
                          <TableCell>{i.contract_number || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {i.next_due_date || '-'} 
                              {isPaused(i) ? <Badge variant="secondary">Gepauzeerd</Badge> : isExpired(i) ? <Badge variant="secondary">Beëindigd</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>{i.last_booked_date || '-'}</TableCell>
                          <TableCell>{(expensesByCommitmentId[i.id] || []).length}</TableCell>
                          <TableCell>{eur(i.remaining_balance_cents)}</TableCell>
                          <TableCell>{eur(i.paid_to_date_cents)}</TableCell>
                          <TableCell>{i.end_date_status}</TableCell>
                          <TableCell>
                            <div className="flex gap-2 whitespace-nowrap">
                              <Button variant="outline" size="sm" onClick={() => fillFormFromItem(i)}>
                                Bewerk
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                disabled={isPaused(i) || isExpired(i)} 
                                onClick={() => setSelectedExpenseCommitment(i)}
                              >
                                Maak uitgave aan
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => showAmortization(i)}>
                                Aflossing
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm" 
                                onClick={async () => { 
                                  try { 
                                    await zzpApi.commitments.delete(i.id); 
                                    load() 
                                  } catch (error) { 
                                    toast.error(errorWithStatus(error)) 
                                  } 
                                }}
                              >
                                Verwijder
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Amortization Schedule Card */}
        {selected && (
          <Card className="bg-card/80 backdrop-blur-sm border border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Aflossingsschema: {selected.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible>
                <AccordionItem value="amort">
                  <AccordionTrigger>Toon aflossingsschema ({schedule.length} regels)</AccordionTrigger>
                  <AccordionContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Maand</TableHead>
                          <TableHead>Datum</TableHead>
                          <TableHead>Rente</TableHead>
                          <TableHead>Aflossing</TableHead>
                          <TableHead>Restschuld</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schedule.map(r => (
                          <TableRow key={r.month_index}>
                            <TableCell>{r.month_index}</TableCell>
                            <TableCell>{r.due_date}</TableCell>
                            <TableCell>{eur(r.interest_cents)}</TableCell>
                            <TableCell>{eur(r.principal_cents)}</TableCell>
                            <TableCell>{eur(r.remaining_balance_cents)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Dialog for Add/Edit */}
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyForm) } }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Lease/Lening bewerken' : 'Lease/Lening toevoegen'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Input placeholder="Naam" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Select value={form.type} onValueChange={(v: 'lease' | 'loan') => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lease">Lease</SelectItem>
                    <SelectItem value="loan">Lening</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Input placeholder="Provider" value={form.provider || ''} onChange={e => setForm({ ...form, provider: e.target.value || undefined })} />
                </div>
                <div className="space-y-2">
                  <Input placeholder="Contractnummer" value={form.contract_number || ''} onChange={e => setForm({ ...form, contract_number: e.target.value || undefined })} />
                </div>
                <div className="space-y-2">
                  <Input placeholder="Betaaldag (1-28)" type="number" min="1" max="28" value={form.payment_day || ''} onChange={e => setForm({ ...form, payment_day: Number(e.target.value || 0) || undefined })} />
                </div>
                <div className="space-y-2">
                  <Input placeholder="Hoofdsom (EUR)" type="number" min="0" value={form.principal_amount_cents ? form.principal_amount_cents / 100 : ''} onChange={e => setForm({ ...form, principal_amount_cents: Math.round(Number(e.target.value || 0) * 100) })} />
                </div>
                <div className="space-y-2">
                  <Input placeholder="Maandbetaling (EUR)" type="number" min="0" value={form.amount_cents ? form.amount_cents / 100 : ''} onChange={e => setForm({ ...form, amount_cents: Math.round(Number(e.target.value || 0) * 100), monthly_payment_cents: Math.round(Number(e.target.value || 0) * 100) })} />
                </div>
                <div className="space-y-2">
                  <Input placeholder="Rente (%)" type="number" min="0" max="100" value={form.interest_rate || ''} onChange={e => setForm({ ...form, interest_rate: Number(e.target.value || 0) })} />
                </div>
                <div className="space-y-2">
                  <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Input type="date" placeholder="Einddatum" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value || undefined })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Select value={form.status || 'active'} onValueChange={(v: 'active' | 'paused' | 'ended') => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Actief</SelectItem>
                      <SelectItem value="paused">Gepauzeerd</SelectItem>
                      <SelectItem value="ended">Beëindigd</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Button onClick={save} className="h-10 sm:h-11">Opslaan</Button>
          </DialogContent>
        </Dialog>

        <CommitmentExpenseDialog 
          open={!!selectedExpenseCommitment} 
          commitment={selectedExpenseCommitment} 
          isSubmitting={isCreatingExpense} 
          onOpenChange={(isOpen) => { if (!isOpen) setSelectedExpenseCommitment(null) }} 
          onConfirm={confirmCreateExpense} 
        />
      </div>
    </div>
  )
}
