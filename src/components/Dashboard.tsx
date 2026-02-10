import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { transactionApi, TransactionStats, Transaction, getErrorMessage } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { 
  Receipt, 
  TrendUp, 
  FileText, 
  CheckCircle,
  Clock,
  ArrowsClockwise,
  WarningCircle
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import { t } from '@/i18n'

export const Dashboard = () => {
  const { user } = useAuth()
  const [stats, setStats] = useState<TransactionStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Use delayed loading to prevent skeleton flash
  const showLoading = useDelayedLoading(isLoading, 300, !!stats)

  const fetchStats = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await transactionApi.getStats()
      setStats(data)
      setLastRefresh(new Date())
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      console.error('Failed to fetch stats:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const handleTransactionClick = async (transactionId: string) => {
    try {
      const fullTransaction = await transactionApi.getById(transactionId)
      setSelectedTransaction(fullTransaction)
      setIsDialogOpen(true)
    } catch (err) {
      console.error('Failed to fetch transaction details:', err)
    }
  }

  const handleTransactionUpdated = () => {
    fetchStats()
    setIsDialogOpen(false)
    setSelectedTransaction(null)
  }

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
        return t('transactionStatus.draft')
      case 'POSTED':
        return t('transactionStatus.posted')
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
              <div className="font-semibold mb-2">{t('dashboard.failedToConnect')}</div>
              <div className="text-sm text-muted-foreground mb-4">{error}</div>
              <Button onClick={fetchStats} size="sm" variant="outline">
                <ArrowsClockwise size={16} className="mr-2" />
                {t('common.retry')}
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
              {t('dashboard.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('dashboard.welcomeBack')}, <span className="font-semibold">{user?.full_name}</span>
            </p>
          </div>
          <div className="text-right">
            <Button onClick={fetchStats} variant="outline" size="sm" disabled={isLoading}>
              <ArrowsClockwise size={18} className="mr-2" />
              {t('common.refresh')}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              {t('dashboard.lastUpdated')}: {format(lastRefresh, 'HH:mm:ss')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText size={18} />
                {t('dashboard.totalTransactions')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <div className="text-3xl font-bold text-primary" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
                  {stats?.total_transactions || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-accent/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock size={18} />
                {t('dashboard.draftBookings')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <div className="text-3xl font-bold text-accent" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
                  {stats?.draft_count || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle size={18} />
                {t('dashboard.postedBookings')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <div className="text-3xl font-bold text-primary" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
                  {stats?.posted_count || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-accent/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendUp size={18} />
                {t('dashboard.balance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showLoading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div className="space-y-1" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
                  <div className="text-sm text-muted-foreground">
                    {t('dashboard.debit')}: {formatCurrency(stats?.total_debit || 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t('dashboard.credit')}: {formatCurrency(stats?.total_credit || 0)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt size={24} className="text-primary" />
              {t('dashboard.recentTransactions')}
            </CardTitle>
            <CardDescription>{t('dashboard.recentTransactionsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {showLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : stats?.recent_transactions && stats.recent_transactions.length > 0 ? (
              <div className="space-y-4" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
                {stats.recent_transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    onClick={() => handleTransactionClick(transaction.id)}
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
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {transaction.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(transaction.transaction_date), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
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
                <p>{t('dashboard.noTransactions')}</p>
                <p className="text-sm mt-2">{t('dashboard.noTransactionsDescription')}</p>
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
