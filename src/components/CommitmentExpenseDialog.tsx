import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ZZPCommitment } from '@/lib/api'

interface CommitmentExpenseDialogProps {
  open: boolean
  commitment: ZZPCommitment | null
  isSubmitting?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: { expense_date: string; amount_cents: number; vat_rate: number; notes?: string }) => Promise<void> | void
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export const CommitmentExpenseDialog = ({
  open,
  commitment,
  isSubmitting = false,
  onOpenChange,
  onConfirm,
}: CommitmentExpenseDialogProps) => {
  const [expenseDate, setExpenseDate] = useState(todayStr())
  const [amountEur, setAmountEur] = useState('0')
  const [vatRate, setVatRate] = useState('21')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!commitment || !open) return
    setExpenseDate(commitment.next_due_date || todayStr())
    setAmountEur(((commitment.monthly_payment_cents || commitment.amount_cents) / 100).toFixed(2))
    setVatRate(String(commitment.btw_rate ?? 21))
    setNotes('')
  }, [commitment, open])

  const handleSubmit = async () => {
    const amountCents = Math.round(Number(amountEur || 0) * 100)
    const parsedVatRate = Number(vatRate || 0)
    if (!expenseDate || amountCents <= 0) return

    await onConfirm({
      expense_date: expenseDate,
      amount_cents: amountCents,
      vat_rate: parsedVatRate,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Controleer uitgave voor {commitment?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="expense-date">Datum</Label>
            <Input id="expense-date" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Bedrag (EUR)</Label>
            <Input id="expense-amount" type="number" step="0.01" min="0" value={amountEur} onChange={(event) => setAmountEur(event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-vat">BTW %</Label>
            <Input id="expense-vat" type="number" min="0" max="100" value={vatRate} onChange={(event) => setVatRate(event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-notes">Notities</Label>
            <Textarea
              id="expense-notes"
              className="min-h-20"
              placeholder="Optioneel: extra toelichting voor deze uitgave"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>Maak uitgave aan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
