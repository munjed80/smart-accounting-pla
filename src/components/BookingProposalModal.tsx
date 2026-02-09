/**
 * Booking Proposal Modal Component
 * 
 * Allows accountants to review and edit AI-suggested bookings before posting:
 * - Edit date, description
 * - Edit journal lines (account, debit/credit, VAT)
 * - Validate balanced entries
 * - Submit to create journal_entry + link to source document
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  bookkeepingApi,
  DocumentReviewItem,
  JournalLineCreate,
  JournalEntryCreate,
  getErrorMessage,
} from '@/lib/api'
import { Calendar, Trash, Plus, WarningCircle } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { t } from '@/i18n'

interface BookingLine {
  id: string // temporary ID for React key
  account_id: string
  account_name?: string
  description: string
  debit_amount: number
  credit_amount: number
  vat_code_id?: string
  vat_amount?: number
}

interface BookingProposalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: DocumentReviewItem
  clientId: string
  onSuccess: () => void
}

export const BookingProposalModal = ({
  open,
  onOpenChange,
  document,
  clientId,
  onSuccess,
}: BookingProposalModalProps) => {
  const [entryDate, setEntryDate] = useState('')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<BookingLine[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Initialize form with document data
  useEffect(() => {
    if (open && document) {
      // Use invoice date or current date
      const defaultDate = document.invoice_date || new Date().toISOString().split('T')[0]
      setEntryDate(defaultDate)
      
      // Set description from supplier + invoice number
      const desc = document.supplier_name 
        ? `${document.supplier_name}${document.invoice_number ? ' - ' + document.invoice_number : ''}`
        : 'Inkoop'
      setDescription(desc)
      
      // Create default lines based on document amounts
      // This is a simple 2-line entry: debit expense, credit creditor
      const netAmount = (document.total_amount || 0) - (document.vat_amount || 0)
      const vatAmount = document.vat_amount || 0
      const totalAmount = document.total_amount || 0
      
      const defaultLines: BookingLine[] = [
        {
          id: crypto.randomUUID(),
          account_id: '4000', // Expense account (placeholder)
          account_name: 'Inkopen/Kosten',
          description: 'Netto bedrag',
          debit_amount: netAmount,
          credit_amount: 0,
          vat_amount: 0,
        },
      ]
      
      // Add VAT line if present
      if (vatAmount > 0) {
        defaultLines.push({
          id: crypto.randomUUID(),
          account_id: '1510', // VAT to reclaim
          account_name: 'BTW Te Vorderen',
          description: 'BTW',
          debit_amount: vatAmount,
          credit_amount: 0,
          vat_amount: vatAmount,
        })
      }
      
      // Add creditor line (credit side)
      defaultLines.push({
        id: crypto.randomUUID(),
        account_id: '1600', // Creditors
        account_name: 'Crediteuren',
        description: document.supplier_name || 'Leverancier',
        debit_amount: 0,
        credit_amount: totalAmount,
        vat_amount: 0,
      })
      
      setLines(defaultLines)
      setValidationError(null)
    }
  }, [open, document])

  // Calculate totals
  const totalDebit = lines.reduce((sum, line) => sum + line.debit_amount, 0)
  const totalCredit = lines.reduce((sum, line) => sum + line.credit_amount, 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  const handleUpdateLine = (id: string, field: keyof BookingLine, value: string | number) => {
    setLines(lines.map(line => 
      line.id === id 
        ? { ...line, [field]: field.includes('amount') ? parseFloat(String(value)) || 0 : value }
        : line
    ))
  }

  const handleAddLine = () => {
    setLines([...lines, {
      id: crypto.randomUUID(),
      account_id: '',
      description: '',
      debit_amount: 0,
      credit_amount: 0,
    }])
  }

  const handleRemoveLine = (id: string) => {
    if (lines.length > 2) {
      setLines(lines.filter(line => line.id !== id))
    }
  }

  const handleSubmit = async () => {
    // Validation
    if (!entryDate) {
      setValidationError('Datum is verplicht')
      return
    }
    if (!description.trim()) {
      setValidationError('Omschrijving is verplicht')
      return
    }
    if (lines.length === 0) {
      setValidationError('Minimaal één regel is verplicht')
      return
    }
    if (lines.some(line => !line.account_id)) {
      setValidationError('Alle regels moeten een grootboekrekening hebben')
      return
    }
    if (!isBalanced) {
      setValidationError('Debet en credit moeten in balans zijn')
      return
    }

    try {
      setIsSubmitting(true)
      setValidationError(null)

      // Convert to API format
      const journalLines: JournalLineCreate[] = lines.map(line => ({
        account_id: line.account_id,
        description: line.description || undefined,
        debit_amount: line.debit_amount,
        credit_amount: line.credit_amount,
        vat_code_id: line.vat_code_id,
        vat_amount: line.vat_amount,
      }))

      const journalEntry: JournalEntryCreate = {
        entry_date: entryDate,
        description,
        reference: document.invoice_number || undefined,
        document_id: document.id,
        source_type: 'DOCUMENT',
        source_id: document.id,
        lines: journalLines,
        auto_post: true, // Post immediately
      }

      // Create journal entry
      await bookkeepingApi.createJournalEntry(clientId, journalEntry)

      toast.success(t('common.success'), {
        description: 'Boeking succesvol aangemaakt en geboekt',
      })

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const errorMsg = getErrorMessage(err)
      setValidationError(errorMsg)
      toast.error(t('common.error'), {
        description: errorMsg,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar size={24} />
            Boeking Controleren & Goedkeuren
          </DialogTitle>
          <DialogDescription>
            Controleer de voorgestelde boeking en pas indien nodig aan voordat u deze post.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Document info banner */}
          <Alert>
            <AlertDescription>
              <strong>{document.original_filename}</strong>
              {document.supplier_name && ` • ${document.supplier_name}`}
              {document.total_amount !== null && ` • €${document.total_amount.toFixed(2)}`}
            </AlertDescription>
          </Alert>

          {/* Date and Description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="entry_date">Datum</Label>
              <Input
                id="entry_date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="description">Omschrijving</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Journal Lines Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Boekingsregels</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLine}
              >
                <Plus size={16} className="mr-2" />
                Regel Toevoegen
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Grootboek</TableHead>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead className="w-[120px] text-right">Debet</TableHead>
                    <TableHead className="w-[120px] text-right">Credit</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Input
                          value={line.account_id}
                          onChange={(e) => handleUpdateLine(line.id, 'account_id', e.target.value)}
                          placeholder="4000"
                          className="font-mono text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.description}
                          onChange={(e) => handleUpdateLine(line.id, 'description', e.target.value)}
                          placeholder="Omschrijving..."
                          className="text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.debit_amount}
                          onChange={(e) => handleUpdateLine(line.id, 'debit_amount', e.target.value)}
                          className="font-mono text-sm text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.credit_amount}
                          onChange={(e) => handleUpdateLine(line.id, 'credit_amount', e.target.value)}
                          className="font-mono text-sm text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveLine(line.id)}
                          disabled={lines.length <= 2}
                        >
                          <Trash size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell colSpan={2} className="text-right">Totaal:</TableCell>
                    <TableCell className="text-right font-mono">
                      €{totalDebit.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      €{totalCredit.toFixed(2)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Balance indicator */}
            <div className="mt-2">
              {isBalanced ? (
                <p className="text-sm text-green-600">✓ Boeking is in balans</p>
              ) : (
                <p className="text-sm text-red-600">
                  ⚠ Niet in balans (verschil: €{Math.abs(totalDebit - totalCredit).toFixed(2)})
                </p>
              )}
            </div>
          </div>

          {/* Validation error */}
          {validationError && (
            <Alert className="bg-destructive/10 border-destructive/40">
              <WarningCircle size={18} className="text-destructive" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !isBalanced}
          >
            {isSubmitting ? 'Bezig met boeken...' : 'Boeken & Goedkeuren'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
