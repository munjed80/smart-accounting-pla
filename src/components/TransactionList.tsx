import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { transactionApi, TransactionListItem, Transaction, getErrorMessage } from '@/lib/api'
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { 
  Receipt, 
  MagnifyingGlass,
  ArrowsClockwise,
  WarningCircle,
  Sparkle
} from '@phosphor-icons/react'
import { format } from 'date-fns'

export const TransactionList = () => {
  const [transactions, setTransactions] = useState<TransactionListItem[]>([])
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'DRAFT' | 'POSTED'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const showLoading = useDelayedLoading(isLoading, 300, !!transactions.length)

  const fetchTransactions = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const filter = statusFilter === 'all' ? undefined : statusFilter
      const data = await transactionApi.getAll(filter)
      setTransactions(data)
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      console.error('Failed to fetch transactions:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
  }, [statusFilter])

  const handleTransactionClick = async (transaction: TransactionListItem) => {
    try {
      const fullTransaction = await transactionApi.getById(transaction.id)
      setSelectedTransaction(fullTransaction)
      setIsDialogOpen(true)
    } catch (err) {
      console.error('Failed to fetch transaction details:', err)
    }
  }

  const handleTransactionUpdated = () => {
    fetchTransactions()
    setIsDialogOpen(false)
    setSelectedTransaction(null)
  }

  const filteredTransactions = transactions.filter((transaction) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      transaction.booking_number.toLowerCase().includes(searchLower) ||
      transaction.description.toLowerCase().includes(searchLower)
    )
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-accent/20 text-accent-foreground border-accent/40'
      case 'POSTED':
        return 'bg-primary/20 text-primary-foreground border-primary/40'
      default:
        return 'bg-secondary'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'Draft'
      case 'POSTED':
        return 'Posted'
      default:
        return status
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-7xl mx-auto">
          <Alert className="bg-destructive/10 border-destructive/40">
            <WarningCircle className="h-5 w-5 text-destructive" />
            <AlertDescription className="ml-2">
              <div className="font-semibold mb-2">Failed to load transactions</div>
              <div className="text-sm text-muted-foreground mb-4">{error}</div>
              <Button onClick={fetchTransactions} size="sm" variant="outline">
                <ArrowsClockwise size={16} className="mr-2" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2">
              All Transactions
            </h1>
            <p className="text-muted-foreground">
              Review, edit, and approve accounting transactions
            </p>
          </div>
          <Button onClick={fetchTransactions} variant="outline" size="sm" disabled={isLoading}>
            <ArrowsClockwise size={18} className="mr-2" />
            Refresh
          </Button>
        </div>

        <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <MagnifyingGlass className="absolute left-3 top-3 text-muted-foreground" size={18} />
                <Input
                  placeholder="Search by booking number or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="POSTED">Posted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt size={24} className="text-primary" />
              Transactions ({filteredTransactions.length})
            </CardTitle>
            <CardDescription>Click on any transaction to view details and take action</CardDescription>
          </CardHeader>
          <CardContent>
            {showLoading ? (
              <div className="space-y-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : filteredTransactions.length > 0 ? (
              <div className="space-y-3 transition-opacity duration-200" style={{ opacity: isLoading ? 0.5 : 1 }}>
                {filteredTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    onClick={() => handleTransactionClick(transaction)}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 border border-border hover:bg-secondary/50 hover:border-primary/30 transition-all cursor-pointer group"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-sm font-semibold group-hover:text-primary transition-colors">
                          {transaction.booking_number}
                        </span>
                        <Badge variant="outline" className={getStatusColor(transaction.status)}>
                          {getStatusLabel(transaction.status)}
                        </Badge>
                        {transaction.ai_confidence_score && transaction.ai_confidence_score > 0.7 && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                            <Sparkle size={12} className="mr-1" weight="fill" />
                            AI Generated
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {transaction.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(transaction.transaction_date), 'dd MMM yyyy')}
                        {transaction.created_by_name && ` • Created by ${transaction.created_by_name}`}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-lg font-semibold">
                        {formatCurrency(transaction.total_amount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Receipt size={48} className="mx-auto mb-4 opacity-50" />
                <p>No transactions found</p>
                <p className="text-sm mt-2">
                  {searchTerm ? 'Try adjusting your search' : 'Upload invoices to get started'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TransactionDetailDialog
        transaction={selectedTransaction}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onTransactionUpdated={handleTransactionUpdated}
      />
    </div>
  )
}
