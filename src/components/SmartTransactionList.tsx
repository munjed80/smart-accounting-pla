import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { transactionApi, TransactionListItem } from '@/lib/api'
import { 
  Receipt, 
  MagnifyingGlass,
  Sparkle,
  TrendDown,
  Brain,
  ArrowsClockwise
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { t } from '@/i18n'

export const SmartTransactionList = () => {
  const [transactions, setTransactions] = useState<TransactionListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchTransactions = async () => {
    setIsLoading(true)
    try {
      const statusParam = statusFilter !== 'all' ? statusFilter as 'DRAFT' | 'POSTED' : undefined
      const data = await transactionApi.getAll(statusParam)
      setTransactions(data)
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
      toast.error(t('smartTransactions.failedToLoad'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
  }, [statusFilter])

  const filteredTransactions = (transactions || []).filter((transaction) => {
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = 
      transaction.booking_number.toLowerCase().includes(searchLower) ||
      transaction.description.toLowerCase().includes(searchLower)
    
    return matchesSearch
  })

  const totalExpenses = (transactions || [])
    .reduce((sum, t) => sum + Number(t.total_amount), 0)

  const avgConfidence = (transactions || []).length > 0
    ? (transactions || []).reduce((sum, t) => sum + (t.ai_confidence_score || 0), 0) / (transactions || []).length
    : 0

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-accent/20 text-accent-foreground border-accent/40'
      case 'DRAFT':
        return 'bg-amber-500/20 text-amber-700 border-amber-500/40'
      case 'POSTED':
        return 'bg-primary/20 text-primary-foreground border-primary/40'
      default:
        return 'bg-secondary'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return t('transactionStatus.draft')
      case 'POSTED':
        return t('transactionStatus.posted')
      default:
        return status
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600'
    if (confidence >= 50) return 'text-amber-600'
    return 'text-destructive'
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent flex items-center gap-2">
            <Brain size={32} weight="duotone" className="text-primary" />
            {t('smartTransactions.title')}
          </h2>
          <p className="text-muted-foreground mt-1">
            {t('smartTransactions.subtitle')}
          </p>
        </div>
        <Button onClick={fetchTransactions} variant="outline" size="sm" disabled={isLoading}>
          <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>{t('smartTransactions.totalTransactions')}</CardDescription>
              <Receipt size={20} className="text-primary" weight="duotone" />
            </div>
            <CardTitle className="text-3xl">{transactions.length}</CardTitle>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>{t('smartTransactions.totalAmount')}</CardDescription>
              <TrendDown size={20} className="text-destructive" weight="duotone" />
            </div>
            <CardTitle className="text-3xl">{formatCurrency(totalExpenses)}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>{t('smartTransactions.avgAiConfidence')}</CardDescription>
              <Sparkle size={20} className="text-primary" weight="duotone" />
            </div>
            <CardTitle className="text-3xl">{avgConfidence.toFixed(0)}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Receipt size={24} weight="duotone" />
                {t('smartTransactions.allTransactions')}
              </CardTitle>
              <CardDescription>
                {filteredTransactions.length} {t('smartTransactions.transactionsOf')} {(transactions || []).length} {t('smartTransactions.transactions')}
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <div className="relative flex-1">
              <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('smartTransactions.searchTransactions')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder={t('smartTransactions.filterByStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('smartTransactions.allStatus')}</SelectItem>
                <SelectItem value="DRAFT">{t('transactionStatus.draft')}</SelectItem>
                <SelectItem value="POSTED">{t('transactionStatus.posted')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <ArrowsClockwise size={48} className="mx-auto mb-4 text-primary animate-spin" />
              <p className="text-muted-foreground">{t('smartTransactions.loadingTransactions')}</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-12">
              <Receipt size={64} className="mx-auto mb-4 text-muted-foreground" weight="duotone" />
              <p className="text-lg font-medium mb-2">{t('smartTransactions.noTransactionsYet')}</p>
              <p className="text-sm text-muted-foreground">
                {t('smartTransactions.uploadToCreate')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.map((transaction) => (
                <div 
                  key={transaction.id} 
                  className="border border-border rounded-lg p-4 hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Receipt size={20} className="text-primary" weight="duotone" />
                        <span className="font-mono text-sm font-medium">{transaction.booking_number}</span>
                        <Badge className={getStatusColor(transaction.status)}>
                          {getStatusLabel(transaction.status)}
                        </Badge>
                        {transaction.ai_confidence_score && (
                          <Badge variant="outline" className={getConfidenceColor(transaction.ai_confidence_score)}>
                            <Sparkle size={14} className="mr-1" weight="fill" />
                            {transaction.ai_confidence_score}% AI
                          </Badge>
                        )}
                      </div>

                      <p className="font-medium text-lg mb-1">{transaction.description}</p>
                      
                      <div className="text-sm mt-3">
                        <span className="text-muted-foreground">{t('smartTransactions.date')}:</span>
                        <span className="ml-2 font-medium">
                          {format(new Date(transaction.transaction_date), 'dd-MM-yyyy')}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold">{formatCurrency(Number(transaction.total_amount))}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
