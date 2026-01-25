import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useKV } from '@github/spark/hooks'
import { useAuth } from '@/lib/AuthContext'
import { DemoInvoiceGenerator } from '@/components/DemoInvoiceGenerator'
import { 
  Receipt, 
  TrendUp, 
  TrendDown,
  FileText, 
  Brain,
  Sparkle,
  CheckCircle,
  WarningCircle,
  ArrowsClockwise
} from '@phosphor-icons/react'
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'

interface StoredTransaction {
  id: string
  booking_number: string
  date: string
  description: string
  amount: number
  vat_amount: number
  net_amount: number
  account_code: string
  account_name: string
  confidence: number
  status: string
  created_at: string
  type: 'EXPENSE' | 'REVENUE'
}

export const SmartDashboard = () => {
  const { user } = useAuth()
  const [transactions] = useKV<StoredTransaction[]>('transactions', [])
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const handleRefresh = () => {
    setLastRefresh(new Date())
  }

  const thisMonth = {
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  }

  const transactionsThisMonth = (transactions || []).filter(t => 
    isWithinInterval(new Date(t.date), thisMonth)
  )

  const totalTransactions = (transactions || []).length
  const totalExpenses = (transactions || [])
    .filter(t => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + t.amount, 0)
  
  const totalVAT = (transactions || [])
    .reduce((sum, t) => sum + t.vat_amount, 0)

  const avgConfidence = (transactions || []).length > 0
    ? (transactions || []).reduce((sum, t) => sum + t.confidence, 0) / (transactions || []).length
    : 0

  const approvedCount = (transactions || []).filter(t => t.status === 'APPROVED').length
  const draftCount = (transactions || []).filter(t => t.status === 'DRAFT').length

  const recentTransactions = [...(transactions || [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  const accountBreakdown = (transactions || []).reduce((acc, t) => {
    const key = `${t.account_code} - ${t.account_name}`
    if (!acc[key]) {
      acc[key] = { total: 0, count: 0, code: t.account_code }
    }
    acc[key].total += t.amount
    acc[key].count += 1
    return acc
  }, {} as Record<string, { total: number; count: number; code: string }>)

  const topAccounts = Object.entries(accountBreakdown)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
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
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <ArrowsClockwise size={18} className="mr-2" />
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
                {totalTransactions}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {transactionsThisMonth.length} this month
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-accent/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendDown size={18} weight="duotone" />
                Total Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-accent">
                {formatCurrency(totalExpenses)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Including VAT
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Receipt size={18} weight="duotone" />
                Total VAT
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatCurrency(totalVAT)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Recoverable amount
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-accent/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Sparkle size={18} weight="duotone" />
                AI Confidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-accent">
                {avgConfidence.toFixed(0)}%
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Average accuracy
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 space-y-6">
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
                      <span className="font-medium">Approved</span>
                    </div>
                    <span className="text-2xl font-bold">{approvedCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <span className="font-medium">Pending Review</span>
                    </div>
                    <span className="text-2xl font-bold">{draftCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <span className="font-medium">AI Processed</span>
                    </div>
                    <span className="text-2xl font-bold">{totalTransactions}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendUp size={24} weight="duotone" className="text-primary" />
                  Top Expense Categories
                </CardTitle>
                <CardDescription>By total amount spent</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topAccounts.length > 0 ? (
                    topAccounts.map(([name, data]) => (
                      <div key={name} className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{name}</p>
                          <p className="text-xs text-muted-foreground">{data.count} transactions</p>
                        </div>
                        <span className="font-bold ml-4">{formatCurrency(data.total)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Receipt size={48} className="mx-auto mb-2 opacity-50" weight="duotone" />
                      <p>No transactions yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <DemoInvoiceGenerator />
          </div>
        </div>

        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt size={24} weight="duotone" />
              Recent Transactions
            </CardTitle>
            <CardDescription>Latest AI-processed invoices</CardDescription>
          </CardHeader>
          <CardContent>
            {recentTransactions.length > 0 ? (
              <div className="space-y-3">
                {recentTransactions.map((transaction) => (
                  <div 
                    key={transaction.id} 
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <Receipt size={24} className="text-primary" weight="duotone" />
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(transaction.date), 'dd MMM yyyy')} · {transaction.account_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{formatCurrency(transaction.amount)}</p>
                      <Badge 
                        variant="outline" 
                        className={
                          transaction.status === 'APPROVED' 
                            ? 'bg-accent/20 text-accent-foreground' 
                            : 'bg-amber-500/20 text-amber-700'
                        }
                      >
                        <Sparkle size={12} className="mr-1" weight="fill" />
                        {transaction.confidence}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Receipt size={64} className="mx-auto mb-4 text-muted-foreground opacity-50" weight="duotone" />
                <p className="text-lg font-medium mb-2">No transactions yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload invoices to see AI-processed transactions appear here
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
