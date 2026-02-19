import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { recurringCostsService, RecurringCost, RecurringCostInput } from '@/lib/localRecurringCosts'

const eurFormatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })
const eur = (cents: number) => eurFormatter.format(cents / 100)
const todayStr = () => new Date().toISOString().slice(0, 10)

const defaultForm = (): RecurringCostInput => ({
  name: '',
  amount_cents: 0,
  interval: 'monthly',
  start_date: todayStr(),
  vat_rate: 21,
  auto_renew: true,
  contract_months: null,
  notice_days: null,
  notes: null,
})

export const ZZPSubscriptionsPage = () => {
  const [items, setItems] = useState<RecurringCost[]>(() => recurringCostsService.list())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RecurringCostInput>(defaultForm())

  const reload = () => setItems(recurringCostsService.list())

  const openNew = () => {
    setEditingId(null)
    setForm(defaultForm())
    setModalOpen(true)
  }

  const openEdit = (item: RecurringCost) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      amount_cents: item.amount_cents,
      interval: item.interval,
      start_date: item.start_date,
      vat_rate: item.vat_rate,
      auto_renew: item.auto_renew,
      contract_months: item.contract_months ?? null,
      notice_days: item.notice_days ?? null,
      notes: item.notes ?? null,
    })
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('Naam is verplicht.')
      return
    }
    if (form.amount_cents <= 0) {
      toast.error('Bedrag moet groter zijn dan 0.')
      return
    }
    if (!form.start_date) {
      toast.error('Startdatum is verplicht.')
      return
    }

    if (editingId) {
      recurringCostsService.update(editingId, form)
      toast.success('Abonnement bijgewerkt.')
    } else {
      recurringCostsService.create(form)
      toast.success('Abonnement toegevoegd.')
    }
    setModalOpen(false)
    reload()
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('Abonnement verwijderen?')) return
    recurringCostsService.delete(id)
    toast.success('Abonnement verwijderd.')
    reload()
  }

  const yearlyCostCents = useMemo(() => {
    if (form.interval === 'yearly') return form.amount_cents
    if (form.interval === 'quarterly') return form.amount_cents * 4
    return form.amount_cents * 12
  }, [form.amount_cents, form.interval])

  const estimatedVatReclaimCents = useMemo(() => {
    if (!form.vat_rate || form.vat_rate <= 0) return 0
    return Math.round((yearlyCostCents * form.vat_rate) / 100 / (1 + form.vat_rate / 100))
  }, [form.vat_rate, yearlyCostCents])

  const intervalLabel = (interval: string) => {
    if (interval === 'yearly') return 'Jaarlijks'
    if (interval === 'quarterly') return 'Per kwartaal'
    return 'Maandelijks'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-1">
              Abonnementen & Recurring Kosten
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Beheer je terugkerende kosten en abonnementen
            </p>
          </div>
          <Button onClick={openNew} className="gap-2 h-10 sm:h-11 shrink-0">
            Nieuw abonnement
          </Button>
        </div>

        {/* List */}
        {items.length === 0 ? (
          <Card className="bg-card/80 backdrop-blur-sm border border-border/50">
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  Nog geen abonnementen toegevoegd. Voeg je eerste abonnement toe om je terugkerende kosten bij te houden.
                </p>
                <Button onClick={openNew} variant="outline">
                  Nieuw abonnement
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <Card key={item.id} className="bg-card/80 backdrop-blur-sm border border-border/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-base">{item.name}</p>
                        <Badge variant="secondary">{intervalLabel(item.interval)}</Badge>
                        {item.auto_renew && <Badge variant="outline" className="text-xs">Auto-renew</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>Bedrag: <span className="font-medium text-foreground">{eur(item.amount_cents)}</span></span>
                        <span>BTW: <span className="font-medium text-foreground">{item.vat_rate}%</span></span>
                        <span>Startdatum: <span className="font-medium text-foreground">{item.start_date}</span></span>
                        {item.notice_days != null && item.notice_days > 0 && (
                          <span>Opzegtermijn: <span className="font-medium text-foreground">{item.notice_days} dgn</span></span>
                        )}
                        {item.contract_months != null && item.contract_months > 0 && (
                          <span>Contractduur: <span className="font-medium text-foreground">{item.contract_months} mnd</span></span>
                        )}
                      </div>
                      {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                        Bewerk
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                        Verwijder
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        <Dialog open={modalOpen} onOpenChange={(v) => { setModalOpen(v); if (!v) setEditingId(null) }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Abonnement bewerken' : 'Nieuw abonnement'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label>Naam *</Label>
                <Input
                  placeholder="bijv. Adobe Creative Cloud"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Bedrag (EUR) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={form.amount_cents > 0 ? form.amount_cents / 100 : ''}
                    onChange={e => setForm({ ...form, amount_cents: Math.round(Number(e.target.value || 0) * 100) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Interval</Label>
                  <Select value={form.interval} onValueChange={(v: 'monthly' | 'quarterly' | 'yearly') => setForm({ ...form, interval: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Maandelijks</SelectItem>
                      <SelectItem value="quarterly">Per kwartaal</SelectItem>
                      <SelectItem value="yearly">Jaarlijks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Startdatum *</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>BTW-tarief</Label>
                  <Select value={String(form.vat_rate)} onValueChange={v => setForm({ ...form, vat_rate: Number(v) as 0 | 9 | 21 })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="9">9%</SelectItem>
                      <SelectItem value="21">21%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Contractduur (maanden)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="bijv. 12"
                    value={form.contract_months ?? ''}
                    onChange={e => setForm({ ...form, contract_months: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Opzegtermijn (dagen)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="bijv. 30"
                    value={form.notice_days ?? ''}
                    onChange={e => setForm({ ...form, notice_days: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Automatisch verlengen</Label>
                <Select value={form.auto_renew ? 'true' : 'false'} onValueChange={v => setForm({ ...form, auto_renew: v === 'true' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ja</SelectItem>
                    <SelectItem value="false">Nee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Notities</Label>
                <Textarea
                  placeholder="Optionele notities"
                  value={form.notes ?? ''}
                  onChange={e => setForm({ ...form, notes: e.target.value || null })}
                  rows={2}
                />
              </div>

              {/* Cost summary */}
              {form.amount_cents > 0 && (
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-secondary/30 p-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Jaarlijkse kosten</p>
                    <p className="font-semibold">{eur(yearlyCostCents)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Geschatte BTW-teruggave</p>
                    <p className="font-semibold">{form.vat_rate > 0 ? eur(estimatedVatReclaimCents) : 'n.v.t.'}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} className="flex-1">
                  {editingId ? 'Bijwerken' : 'Toevoegen'}
                </Button>
                <Button variant="outline" onClick={() => setModalOpen(false)}>
                  Annuleren
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
