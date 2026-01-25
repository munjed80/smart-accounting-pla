import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useKV } from '@github/spark/hooks'
import { 
  Receipt, 
  MagnifyingGlass,
  Sparkle,
  CheckCircle,
  Clock,
  TrendUp,
  TrendDown,
  Brain
} from '@phosphor-icons/react'
import { format } from 'date-fns'

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

export const SmartTransactionList = () => {
  const [transactions] = useKV<StoredTransaction[]>('transactions', [])
  const [searchTerm, setSearchTerm] = useState('')
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredTransactions = (transactions || []).filter((transaction) => {
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = 
      transaction.booking_number.toLowerCase().includes(searchLower) ||
      transaction.description.toLowerCase().includes(searchLower) ||
      transaction.account_name.toLowerCase().includes(searchLower)
    
    const matchesAccount = accountFilter === 'all' || transaction.account_code === accountFilter
    const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter
    
    return matchesSearch && matchesAccount && matchesStatus
  })

  const uniqueAccounts = Array.from(
    new Set((transactions || []).map(t => `${t.account_code}|${t.account_name}`))
  ).map(str => {
    const [code, name] = str.split('|')
    return { code, name }
  })

  const totalExpenses = (transactions || [])
    .filter(t => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + t.amount, 0)

  const totalVAT = (transactions || [])
    .reduce((sum, t) => sum + t.vat_amount, 0)

  const avgConfidence = (transactions || []).length > 0
    ? (transactions || []).reduce((sum, t) => sum + t.confidence, 0) / (transactions || []).length
    : 0

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
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
            Smart Transactions
          </h2>
          <p className="text-muted-foreground mt-1">
            AI-processed and auto-categorized transactions
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Total Expenses</CardDescription>
              <TrendDown size={20} className="text-destructive" weight="duotone" />
            </div>
            <CardTitle className="text-3xl">{formatCurrency(totalExpenses)}</CardTitle>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Total VAT</CardDescription>
              <Receipt size={20} className="text-muted-foreground" weight="duotone" />
            </div>
            <CardTitle className="text-3xl">{formatCurrency(totalVAT)}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription>Avg. AI Confidence</CardDescription>
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
                All Transactions
              </CardTitle>
              <CardDescription>
                {filteredTransactions.length} of {(transactions || []).length} transactions
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <div className="relative flex-1">
              <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-full sm:w-[250px]">
                <SelectValue placeholder="Filter by account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {uniqueAccounts.map((account) => (
                  <SelectItem key={account.code} value={account.code}>
                    {account.code} - {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="POSTED">Posted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12">
              <Receipt size={64} className="mx-auto mb-4 text-muted-foreground" weight="duotone" />
              <p className="text-lg font-medium mb-2">No transactions yet</p>
              <p className="text-sm text-muted-foreground">
                Upload invoices in the AI Upload tab to create transactions automatically
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
                          {transaction.status}
                        </Badge>
                        <Badge variant="outline" className={getConfidenceColor(transaction.confidence)}>
                          <Sparkle size={14} className="mr-1" weight="fill" />
                          {transaction.confidence}% AI
                        </Badge>
                      </div>

                      <p className="font-medium text-lg mb-1">{transaction.description}</p>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-3">
                        <div>
                          <span className="text-muted-foreground">Date:</span>
                          <span className="ml-2 font-medium">
                            {format(new Date(transaction.date), 'dd-MM-yyyy')}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Account:</span>
                          <span className="ml-2 font-medium">{transaction.account_code}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Net:</span>
                          <span className="ml-2 font-medium">{formatCurrency(transaction.net_amount)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">VAT:</span>
                          <span className="ml-2 font-medium">{formatCurrency(transaction.vat_amount)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold">{formatCurrency(transaction.amount)}</div>
                      <div className="text-sm text-muted-foreground mt-1">{transaction.account_name}</div>
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
