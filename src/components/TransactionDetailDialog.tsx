import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  CheckCircle, 
  XCircle, 
  PencilSimple, 
  FloppyDisk, 
  Trash,
  Plus,
  FileText,
  Calendar,
  CurrencyEur,
  User,
  WarningCircle,
  Info
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { transactionApi, Transaction, TransactionLine, getErrorMessage } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'

interface TransactionDetailDialogProps {
  transaction: Transaction | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onTransactionUpdated: () => void
}

export const TransactionDetailDialog = ({ 
  transaction, 
  open, 
  onOpenChange,
  onTransactionUpdated 
}: TransactionDetailDialogProps) => {
  const { user } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [editedTransaction, setEditedTransaction] = useState<Transaction | null>(null)

  useEffect(() => {
    if (transaction) {
      setEditedTransaction({ ...transaction })
      setIsEditing(transaction.status === 'draft')
    }
  }, [transaction])

  if (!transaction || !editedTransaction) return null

  const canEdit = user?.role === 'accountant' || user?.role === 'admin'
  const canApprove = user?.role === 'accountant' || user?.role === 'admin'
  const isDraft = transaction.status === 'draft'

  const handleSave = async () => {
    if (!editedTransaction) return

    try {
      setIsLoading(true)
      await transactionApi.update(editedTransaction.id, {
        transaction_date: editedTransaction.transaction_date,
        description: editedTransaction.description,
        lines: editedTransaction.lines,
      })
      toast.success('Transaction updated successfully')
      setIsEditing(false)
      onTransactionUpdated()
    } catch (error) {
      toast.error('Failed to update transaction: ' + getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  const handleApprove = async () => {
    try {
      setIsLoading(true)
      await transactionApi.approve(transaction.id)
      toast.success('Transaction approved and posted to ledger')
      onOpenChange(false)
      onTransactionUpdated()
    } catch (error) {
      toast.error('Failed to approve transaction: ' + getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  const handleReject = async () => {
    try {
      setIsLoading(true)
      await transactionApi.reject(transaction.id)
      toast.success('Transaction rejected and marked as void')
      onOpenChange(false)
      onTransactionUpdated()
    } catch (error) {
      toast.error('Failed to reject transaction: ' + getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  const addLine = () => {
    if (!editedTransaction) return
    
    const newLine: TransactionLine = {
      id: `temp-${Date.now()}`,
      ledger_account_code: '',
      ledger_account_name: '',
      debit_amount: 0,
      credit_amount: 0,
      vat_code: '',
      description: '',
    }
    
    setEditedTransaction({
      ...editedTransaction,
      lines: [...editedTransaction.lines, newLine],
    })
  }

  const removeLine = (lineId: string) => {
    if (!editedTransaction) return
    
    setEditedTransaction({
      ...editedTransaction,
      lines: editedTransaction.lines.filter(line => line.id !== lineId),
    })
  }

  const updateLine = (lineId: string, field: keyof TransactionLine, value: string | number) => {
    if (!editedTransaction) return
    
    setEditedTransaction({
      ...editedTransaction,
      lines: editedTransaction.lines.map(line =>
        line.id === lineId ? { ...line, [field]: value } : line
      ),
    })
  }

  const calculateBalance = () => {
    const totalDebit = editedTransaction.lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0)
    const totalCredit = editedTransaction.lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0)
    return { totalDebit, totalCredit, balance: totalDebit - totalCredit }
  }

  const { totalDebit, totalCredit, balance } = calculateBalance()
  const isBalanced = Math.abs(balance) < 0.01

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-accent/20 text-accent-foreground border-accent/40'
      case 'posted':
        return 'bg-primary/20 text-primary-foreground border-primary/40'
      case 'reconciled':
        return 'bg-green-500/20 text-green-700 border-green-500/40'
      case 'void':
        return 'bg-destructive/20 text-destructive-foreground border-destructive/40'
      default:
        return 'bg-secondary'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={28} className="text-primary" weight="duotone" />
              <div>
                <DialogTitle className="text-2xl">Transaction Details</DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1">
                  <span className="font-mono font-semibold">{transaction.booking_number}</span>
                  <Badge variant="outline" className={getStatusColor(transaction.status)}>
                    {transaction.status}
                  </Badge>
                </DialogDescription>
              </div>
            </div>
            {canEdit && isDraft && !isEditing && (
              <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                <PencilSimple size={18} className="mr-2" />
                Edit
              </Button>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="lines">Journal Lines ({editedTransaction.lines.length})</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="transaction-date" className="flex items-center gap-2">
                  <Calendar size={16} />
                  Transaction Date
                </Label>
                <Input
                  id="transaction-date"
                  type="date"
                  value={editedTransaction.transaction_date}
                  onChange={(e) => setEditedTransaction({ ...editedTransaction, transaction_date: e.target.value })}
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User size={16} />
                  Created By
                </Label>
                <Input
                  value={transaction.created_by_name || 'System'}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editedTransaction.description}
                onChange={(e) => setEditedTransaction({ ...editedTransaction, description: e.target.value })}
                disabled={!isEditing}
                rows={3}
              />
            </div>

            {transaction.document_id && (
              <Card className="bg-secondary/20 border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText size={18} />
                    Linked Document
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-mono">{transaction.document_id}</p>
                </CardContent>
              </Card>
            )}

            <Separator />

            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Debit</div>
                  <div className="text-2xl font-bold text-primary">{formatCurrency(totalDebit)}</div>
                </CardContent>
              </Card>

              <Card className="bg-accent/5 border-accent/20">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Credit</div>
                  <div className="text-2xl font-bold text-accent">{formatCurrency(totalCredit)}</div>
                </CardContent>
              </Card>

              <Card className={isBalanced ? 'bg-green-500/5 border-green-500/20' : 'bg-destructive/5 border-destructive/20'}>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Balance</div>
                  <div className={`text-2xl font-bold ${isBalanced ? 'text-green-600' : 'text-destructive'}`}>
                    {formatCurrency(balance)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {!isBalanced && isEditing && (
              <Alert className="bg-destructive/10 border-destructive/40">
                <WarningCircle className="h-5 w-5 text-destructive" />
                <AlertDescription className="ml-2">
                  <strong>Transaction is not balanced!</strong> Debit and credit amounts must be equal before posting.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="lines" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Journal entries for this transaction
              </p>
              {isEditing && (
                <Button onClick={addLine} size="sm" variant="outline">
                  <Plus size={18} className="mr-2" />
                  Add Line
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {editedTransaction.lines.map((line, index) => (
                <Card key={line.id} className="bg-secondary/20">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-2">
                        <Label className="text-xs">Account Code</Label>
                        <Input
                          value={line.ledger_account_code}
                          onChange={(e) => updateLine(line.id, 'ledger_account_code', e.target.value)}
                          disabled={!isEditing}
                          placeholder="1000"
                          className="mt-1"
                        />
                      </div>
                      
                      <div className="col-span-3">
                        <Label className="text-xs">Account Name</Label>
                        <Input
                          value={line.ledger_account_name}
                          onChange={(e) => updateLine(line.id, 'ledger_account_name', e.target.value)}
                          disabled={!isEditing}
                          placeholder="Cash"
                          className="mt-1"
                        />
                      </div>

                      <div className="col-span-2">
                        <Label className="text-xs">Debit</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.debit_amount || ''}
                          onChange={(e) => updateLine(line.id, 'debit_amount', parseFloat(e.target.value) || 0)}
                          disabled={!isEditing}
                          placeholder="0.00"
                          className="mt-1"
                        />
                      </div>

                      <div className="col-span-2">
                        <Label className="text-xs">Credit</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.credit_amount || ''}
                          onChange={(e) => updateLine(line.id, 'credit_amount', parseFloat(e.target.value) || 0)}
                          disabled={!isEditing}
                          placeholder="0.00"
                          className="mt-1"
                        />
                      </div>

                      <div className="col-span-2">
                        <Label className="text-xs">VAT Code</Label>
                        <Input
                          value={line.vat_code || ''}
                          onChange={(e) => updateLine(line.id, 'vat_code', e.target.value)}
                          disabled={!isEditing}
                          placeholder="21%"
                          className="mt-1"
                        />
                      </div>

                      {isEditing && (
                        <div className="col-span-1 flex items-end">
                          <Button
                            onClick={() => removeLine(line.id)}
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash size={18} />
                          </Button>
                        </div>
                      )}
                    </div>

                    {line.description && (
                      <div className="mt-3">
                        <Label className="text-xs">Description</Label>
                        <Textarea
                          value={line.description}
                          onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                          disabled={!isEditing}
                          rows={2}
                          className="mt-1"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {editedTransaction.lines.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <FileText size={48} className="mx-auto mb-4 opacity-50" />
                <p>No journal lines yet</p>
                {isEditing && (
                  <Button onClick={addLine} variant="outline" size="sm" className="mt-4">
                    <Plus size={18} className="mr-2" />
                    Add First Line
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="space-y-4 mt-4">
            <div className="space-y-3">
              <Card className="bg-secondary/20">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Created At:</span>
                      <p className="font-mono mt-1">{format(new Date(transaction.created_at), 'PPpp')}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created By:</span>
                      <p className="font-semibold mt-1">{transaction.created_by_name || 'System'}</p>
                    </div>
                    {transaction.updated_at && (
                      <>
                        <div>
                          <span className="text-muted-foreground">Last Updated:</span>
                          <p className="font-mono mt-1">{format(new Date(transaction.updated_at), 'PPpp')}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Updated By:</span>
                          <p className="font-semibold mt-1">{transaction.updated_by_name || 'N/A'}</p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {transaction.ai_confidence_score && (
                <Alert className="bg-primary/5 border-primary/20">
                  <Info className="h-5 w-5 text-primary" />
                  <AlertDescription className="ml-2">
                    <strong>AI Processing:</strong> This transaction was automatically created by the Spark OCR processor 
                    with {(transaction.ai_confidence_score * 100).toFixed(0)}% confidence.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          {isEditing ? (
            <>
              <Button onClick={() => {
                setEditedTransaction({ ...transaction })
                setIsEditing(false)
              }} variant="outline" disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isLoading || !isBalanced}>
                <FloppyDisk size={18} className="mr-2" />
                {isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                Close
              </Button>
              {canApprove && isDraft && (
                <>
                  <Button onClick={handleReject} variant="destructive" disabled={isLoading}>
                    <XCircle size={18} className="mr-2" />
                    Reject
                  </Button>
                  <Button onClick={handleApprove} disabled={isLoading || !isBalanced}>
                    <CheckCircle size={18} className="mr-2" />
                    {isLoading ? 'Approving...' : 'Approve & Post'}
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
