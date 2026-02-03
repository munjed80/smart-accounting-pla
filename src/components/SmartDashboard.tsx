import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/lib/AuthContext'
import { transactionApi, TransactionStats, administrationApi, Administration, getErrorMessage } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { NoAdministrationsEmptyState } from '@/components/EmptyState'
import { 
  Receipt, 
  TrendUp, 
  TrendDown,
  FileText, 
  Brain,
  Sparkle,
  CheckCircle,
  ArrowsClockwise,
  WarningCircle
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import { t } from '@/i18n'

export const SmartDashboard = () => {
  const { user } = useAuth()
  const [stats, setStats] = useState<TransactionStats | null>(null)
  const [administrations, setAdministrations] = useState<Administration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchData = async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      // First fetch administrations
      const admins = await administrationApi.list()
      setAdministrations(admins)
      
      // Only fetch stats if administrations exist (avoids premature API errors)
      if (admins.length > 0) {
        try {
          const statsData = await transactionApi.getStats()
          setStats(statsData)
        } catch {
          // Stats may be unavailable if no transactions - this is expected for fresh accounts
          setStats(null)
        }
      } else {
        setStats(null)
      }
      setLastRefresh(new Date())
    } catch (error) {
      console.error('Failed to fetch administrations:', error)
      setFetchError(getErrorMessage(error))
      setAdministrations([])
      setStats(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleRefresh = () => {
    fetchData()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
                <Brain size={40} weight="duotone" className="text-primary" />
                Smart Dashboard
              </h1>
              <p className="text-muted-foreground">
                Welcome, <span className="font-semibold">{user?.full_name}</span>
              </p>
            </div>
          </div>
          
          {/* Loading skeleton for stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
                <CardHeader className="pb-3">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Loading skeleton for content cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <Card key={i} className="bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-40 mb-2" />
                  <Skeleton className="h-4 w-56" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }
  
  // Show error state if fetching administrations failed
  if (fetchError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
                <Brain size={40} weight="duotone" className="text-primary" />
                Smart Dashboard
              </h1>
              <p className="text-muted-foreground">
                Welcome, <span className="font-semibold">{user?.full_name}</span>
              </p>
            </div>
          </div>
          
          <Alert variant="destructive">
            <WarningCircle size={18} />
            <AlertDescription className="ml-2 flex items-center justify-between">
              <span>{fetchError}</span>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-4">
                <ArrowsClockwise size={16} className="mr-2" />
                {t('common.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }
  
  // Show empty state if user has no administrations
  if (administrations.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
                <Brain size={40} weight="duotone" className="text-primary" />
                Smart Dashboard
              </h1>
              <p className="text-muted-foreground">
                Welcome, <span className="font-semibold">{user?.full_name}</span>
              </p>
            </div>
          </div>
          
          <div className="mt-12">
            <NoAdministrationsEmptyState
              userRole={user?.role as 'zzp' | 'accountant' | 'admin'}
              onCreateAdministration={() => navigateTo('/onboarding')}
            />
          </div>
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
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
              <Brain size={40} weight="duotone" className="text-primary" />
              Smart Dashboard
            </h1>
            <p className="text-muted-foreground">
              Welcome back, <span className="font-semibold">{user?.full_name}</span>
            </p>
          </div>
          <div className="text-right">
            <Button onClick={handleRefresh} variant="outline" size="sm" disabled={isLoading}>
              <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Last updated: {format(lastRefresh, 'HH:mm:ss')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText size={18} weight="duotone" />
                Total Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                {stats?.total_transactions || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stats?.draft_count || 0} drafts, {stats?.posted_count || 0} posted
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-accent/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendDown size={18} weight="duotone" />
                Total Debit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-accent">
                {formatCurrency(Number(stats?.total_debit || 0))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Sum of all debits
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendUp size={18} weight="duotone" />
                Total Credit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatCurrency(Number(stats?.total_credit || 0))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Sum of all credits
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-accent/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Sparkle size={18} weight="duotone" />
                Draft Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-accent">
                {stats?.draft_count || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Awaiting review
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle size={24} weight="duotone" className="text-accent" />
                Processing Status
              </CardTitle>
              <CardDescription>Transaction approval workflow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-accent" />
                    <span className="font-medium">Posted</span>
                  </div>
                  <span className="text-2xl font-bold">{stats?.posted_count || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="font-medium">Draft / Pending Review</span>
                  </div>
                  <span className="text-2xl font-bold">{stats?.draft_count || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <span className="font-medium">Total</span>
                  </div>
                  <span className="text-2xl font-bold">{stats?.total_transactions || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt size={24} weight="duotone" />
                Recent Transactions
              </CardTitle>
              <CardDescription>Latest AI-processed invoices</CardDescription>
            </CardHeader>
            <CardContent>
              {stats?.recent_transactions && stats.recent_transactions.length > 0 ? (
                <div className="space-y-3">
                  {stats.recent_transactions.map((transaction) => (
                    <div 
                      key={transaction.id} 
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Receipt size={20} className="text-primary" weight="duotone" />
                        <div>
                          <p className="font-medium text-sm">{transaction.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(transaction.transaction_date), 'dd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatCurrency(Number(transaction.total_amount))}</p>
                        <Badge 
                          variant="outline" 
                          className={
                            transaction.status === 'POSTED' 
                              ? 'bg-accent/20 text-accent-foreground' 
                              : 'bg-amber-500/20 text-amber-700'
                          }
                        >
                          {transaction.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Receipt size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" weight="duotone" />
                  <p className="text-muted-foreground">No transactions yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload invoices to get started
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
