import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { leasesLoansService, LeaseLoan, LeaseLoanInput } from '@/lib/localLeasesLoans'

const eurFormatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })
const eur = (cents?: number | null) => eurFormatter.format((cents ?? 0) / 100)

const todayStr = () => new Date().toISOString().slice(0, 10)

const defaultForm = (): LeaseLoanInput => ({
  type: 'loan',
  name: '',
  principal_cents: 0,
  interest_rate_percent: null,
  start_date: todayStr(),
  end_date: null,
  payment_interval: 'monthly',
  payment_cents: null,
  remaining_cents: null,
  notes: null,
})

const typeLabel = (type: string) => (type === 'lease' ? 'Lease' : 'Lening')

const intervalLabel = (interval: string) => {
  if (interval === 'yearly') return 'Jaarlijks'
  if (interval === 'quarterly') return 'Per kwartaal'
  return 'Maandelijks'
}

export const ZZPLeaseLoansPage = () => {
  const [items, setItems] = useState<LeaseLoan[]>(() => leasesLoansService.list())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<LeaseLoanInput>(defaultForm())

  const reload = () => setItems(leasesLoansService.list())

  const openNew = () => {
    setEditingId(null)
    setForm(defaultForm())
    setModalOpen(true)
  }

  const openEdit = (item: LeaseLoan) => {
    setEditingId(item.id)
    setForm({
      type: item.type,
      name: item.name,
      principal_cents: item.principal_cents,
      interest_rate_percent: item.interest_rate_percent ?? null,
      start_date: item.start_date,
      end_date: item.end_date ?? null,
      payment_interval: item.payment_interval,
      payment_cents: item.payment_cents ?? null,
      remaining_cents: item.remaining_cents ?? null,
      notes: item.notes ?? null,
    })
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('Naam is verplicht.')
      return
    }
    if (form.principal_cents <= 0) {
      toast.error('Hoofdsom moet groter zijn dan 0.')
      return
    }
    if (!form.start_date) {
      toast.error('Startdatum is verplicht.')
      return
    }

    if (editingId) {
      leasesLoansService.update(editingId, form)
      toast.success('Lease/lening bijgewerkt.')
    } else {
      leasesLoansService.create(form)
      toast.success('Lease/lening toegevoegd.')
    }
    setModalOpen(false)
    reload()
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('Lease/lening verwijderen?')) return
    leasesLoansService.delete(id)
    toast.success('Verwijderd.')
    reload()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-1">
              Lease & Leningen
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Beheer je leases en leningen
            </p>
          </div>
          <Button onClick={openNew} className="gap-2 h-10 sm:h-11 shrink-0">
            Nieuwe lease/lening
          </Button>
        </div>

        {/* List */}
        {items.length === 0 ? (
          <Card className="bg-card/80 backdrop-blur-sm border border-border/50">
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <div className="max-w-md mx-auto space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Lease & Leningen Module</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Houd je leasecontracten en leningen bij. Track aflossingen, restschulden en betalingen.
                    </p>
                  </div>
                  <Button onClick={openNew} variant="outline">
                    Voeg je eerste lease/lening toe
                  </Button>
                </div>
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
                        <Badge variant="secondary">{typeLabel(item.type)}</Badge>
                        <Badge variant="outline" className="text-xs">{intervalLabel(item.payment_interval)}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>Hoofdsom: <span className="font-medium text-foreground">{eur(item.principal_cents)}</span></span>
                        {item.payment_cents != null && item.payment_cents > 0 && (
                          <span>Betaling: <span className="font-medium text-foreground">{eur(item.payment_cents)}</span></span>
                        )}
                        {item.remaining_cents != null && (
                          <span>Restschuld: <span className="font-medium text-foreground">{eur(item.remaining_cents)}</span></span>
                        )}
                        {item.interest_rate_percent != null && (
                          <span>Rente: <span className="font-medium text-foreground">{item.interest_rate_percent}%</span></span>
                        )}
                        <span>Start: <span className="font-medium text-foreground">{item.start_date}</span></span>
                        {item.end_date && (
                          <span>Einde: <span className="font-medium text-foreground">{item.end_date}</span></span>
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
              <DialogTitle>{editingId ? 'Lease/Lening bewerken' : 'Nieuwe lease/lening'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label>Naam *</Label>
                <Input
                  placeholder="bijv. Auto lease"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v: 'lease' | 'loan') => setForm({ ...form, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lease">Lease</SelectItem>
                      <SelectItem value="loan">Lening</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Betalingsinterval</Label>
                  <Select value={form.payment_interval} onValueChange={(v: 'monthly' | 'quarterly' | 'yearly') => setForm({ ...form, payment_interval: v })}>
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
                  <Label>Hoofdsom (EUR) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={form.principal_cents > 0 ? form.principal_cents / 100 : ''}
                    onChange={e => setForm({ ...form, principal_cents: Math.round(Number(e.target.value || 0) * 100) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Periodieke betaling (EUR)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={form.payment_cents != null && form.payment_cents > 0 ? form.payment_cents / 100 : ''}
                    onChange={e => setForm({ ...form, payment_cents: e.target.value ? Math.round(Number(e.target.value) * 100) : null })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Restschuld (EUR)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={form.remaining_cents != null && form.remaining_cents > 0 ? form.remaining_cents / 100 : ''}
                    onChange={e => setForm({ ...form, remaining_cents: e.target.value ? Math.round(Number(e.target.value) * 100) : null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Rente (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="bijv. 4.5"
                    value={form.interest_rate_percent ?? ''}
                    onChange={e => setForm({ ...form, interest_rate_percent: e.target.value ? Number(e.target.value) : null })}
                  />
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
                  <Label>Einddatum</Label>
                  <Input
                    type="date"
                    value={form.end_date ?? ''}
                    onChange={e => setForm({ ...form, end_date: e.target.value || null })}
                  />
                </div>
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
