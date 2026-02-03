/**
 * ProfitLossPage - Profit & Loss (Winst- en verliesrekening) Page
 * 
 * Working screen showing the P&L statement with real data from
 * the /accountant/clients/{clientId}/reports/pnl endpoint.
 * 
 * Features:
 * - Real P&L data from backend API
 * - Revenue, COGS, gross profit, operating expenses, net income
 * - Period selectors (last 30 days / this quarter / this year)
 * - "Concept" disclaimer in Dutch
 * - Mobile-responsive design
 * 
 * Data source: ledgerApi.getProfitAndLoss()
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/EmptyState'
import { RequireActiveClient } from '@/components/RequireActiveClient'
import { ApiErrorState, parseApiError, ApiErrorType } from '@/components/ApiErrorState'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { ledgerApi, ProfitAndLossResponse } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import {
  ChartLineUp,
  Stack,
  MagnifyingGlass,
  TrendUp,
  TrendDown,
  Info,
  Warning,
  Calendar,
  Coins,
  Receipt,
  ArrowRight,
} from '@phosphor-icons/react'

interface ProfitLossPageProps {
  onNavigate?: (tab: string) => void
}

type PeriodOption = 'last30' | 'thisQuarter' | 'thisYear'

export const ProfitLossPage = ({ onNavigate }: ProfitLossPageProps) => {
  const { activeClientId, activeClientName } = useActiveClient()
  const [pnlData, setPnlData] = useState<ProfitAndLossResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [apiError, setApiError] = useState<{ type: ApiErrorType; message: string } | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('thisQuarter')

  // Calculate period dates based on selection
  const getPeriodDates = (period: PeriodOption): { startDate: string; endDate: string } => {
    const today = new Date()
    const endDate = today.toISOString().split('T')[0]
    
    let startDate: string
    switch (period) {
      case 'last30':
        const thirtyDaysAgo = new Date(today)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        startDate = thirtyDaysAgo.toISOString().split('T')[0]
        break
      case 'thisQuarter':
        const quarter = Math.floor(today.getMonth() / 3)
        const quarterStart = new Date(today.getFullYear(), quarter * 3, 1)
        startDate = quarterStart.toISOString().split('T')[0]
        break
      case 'thisYear':
      default:
        startDate = `${today.getFullYear()}-01-01`
        break
    }
    
    return { startDate, endDate }
  }

  // Load P&L data
  useEffect(() => {
    const loadPnlData = async () => {
      if (!activeClientId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setApiError(null)

      try {
        const { startDate, endDate } = getPeriodDates(selectedPeriod)
        const response = await ledgerApi.getProfitAndLoss(activeClientId, startDate, endDate)
        setPnlData(response)
      } catch (err) {
        const parsedError = parseApiError(err)
        setApiError(parsedError)
      } finally {
        setIsLoading(false)
      }
    }

    loadPnlData()
  }, [activeClientId, selectedPeriod])

  const handleGoToWorkqueue = () => {
    if (onNavigate) {
      onNavigate('workqueue')
    } else {
      navigateTo('/accountant')
    }
  }

  const handleGoToReview = () => {
    if (onNavigate) {
      onNavigate('reviewqueue')
    } else {
      navigateTo('/accountant/review-queue')
    }
  }

  const handleGoToClients = () => {
    if (onNavigate) {
      onNavigate('clients')
    } else {
      navigateTo('/accountant/clients')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const getPeriodLabel = (period: PeriodOption) => {
    switch (period) {
      case 'last30':
        return 'Laatste 30 dagen'
      case 'thisQuarter':
        return 'Dit kwartaal'
      case 'thisYear':
        return 'Dit boekjaar'
    }
  }

  // No active client selected - use RequireActiveClient component
  if (!activeClientId) {
    return (
      <RequireActiveClient
        headerIcon={<ChartLineUp size={24} weight="duotone" className="text-primary" />}
        headerTitle={t('profitLoss.title')}
        headerSubtitle={t('profitLoss.subtitle')}
        onNavigate={onNavigate}
      />
    )
  }

  // API error occurred - use ApiErrorState component
  if (apiError && !isLoading) {
    return (
      <div className="container mx-auto py-6 px-4 sm:px-6 max-w-5xl">
        <Card className="bg-card/80 backdrop-blur-sm mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ChartLineUp size={24} weight="duotone" className="text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">{t('profitLoss.title')}</CardTitle>
                <CardDescription>{t('profitLoss.subtitle')}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <ApiErrorState
          type={apiError.type}
          message={apiError.message}
          onRetry={() => window.location.reload()}
          onNavigate={onNavigate}
        />
      </div>
    )
  }

  // Check if P&L has any data
  const hasData = pnlData && (
    pnlData.revenue.accounts.length > 0 ||
    pnlData.operating_expenses.accounts.length > 0 ||
    pnlData.cost_of_goods_sold.accounts.length > 0
  )

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 max-w-5xl">
      {/* Header */}
      <Card className="bg-card/80 backdrop-blur-sm mb-6">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ChartLineUp size={24} weight="duotone" className="text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-2xl">{t('profitLoss.title')}</CardTitle>
                  <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-400">
                    Concept
                  </Badge>
                </div>
                <CardDescription>
                  {activeClientName ? `${activeClientName} – ` : ''}{t('profitLoss.subtitle')}
                </CardDescription>
              </div>
            </div>
            
            {/* Period selector */}
            <div className="flex gap-2">
              {(['last30', 'thisQuarter', 'thisYear'] as PeriodOption[]).map((period) => (
                <Button
                  key={period}
                  variant={selectedPeriod === period ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPeriod(period)}
                >
                  {getPeriodLabel(period)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Disclaimer */}
      <Card className="bg-secondary/30 border-dashed mb-6">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">Concept – Niet definitief</p>
              <p className="text-sm text-muted-foreground">
                Dit is een voorlopig overzicht gebaseerd op de huidige transacties. 
                De definitieve cijfers kunnen afwijken na afronding van de periode.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !apiError && !hasData && (
        <>
          <EmptyState
            title={t('profitLoss.noDataYet')}
            description={t('profitLoss.noDataDescription')}
            icon={
              <div className="flex items-center gap-2">
                <TrendUp size={48} weight="duotone" className="text-green-500" />
                <TrendDown size={48} weight="duotone" className="text-red-500" />
              </div>
            }
            tips={[
              t('profitLoss.tips.fromTransactions'),
              t('profitLoss.tips.categorizedExpenses'),
              t('profitLoss.tips.periodSelection'),
            ]}
          />
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <Button onClick={handleGoToWorkqueue} className="gap-2">
              <Stack size={18} />
              {t('profitLoss.goToWorkqueue')}
            </Button>
            <Button variant="outline" onClick={handleGoToReview} className="gap-2">
              <MagnifyingGlass size={18} />
              {t('profitLoss.goToReview')}
            </Button>
          </div>
        </>
      )}

      {/* P&L Data */}
      {!isLoading && !apiError && hasData && pnlData && (
        <>
          {/* Period indicator */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Calendar size={16} />
            <span>
              {formatDate(pnlData.start_date)} – {formatDate(pnlData.end_date)}
            </span>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card className={pnlData.revenue.total > 0 ? 'bg-green-500/10 border-green-500/30' : ''}>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <TrendUp size={20} className="text-green-600" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Omzet</p>
                    <p className="text-xl font-semibold font-mono">
                      {formatCurrency(pnlData.revenue.total)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={pnlData.operating_expenses.total > 0 ? 'bg-red-500/10 border-red-500/30' : ''}>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/20">
                    <TrendDown size={20} className="text-red-600" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Kosten</p>
                    <p className="text-xl font-semibold font-mono">
                      {formatCurrency(pnlData.operating_expenses.total + pnlData.cost_of_goods_sold.total)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={pnlData.net_income > 0 ? 'bg-primary/10 border-primary/30' : pnlData.net_income < 0 ? 'bg-destructive/10 border-destructive/30' : ''}>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Coins size={20} className="text-primary" weight="duotone" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Netto resultaat</p>
                    <p className={`text-xl font-semibold font-mono ${pnlData.net_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(pnlData.net_income)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed P&L */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Gedetailleerd overzicht</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Revenue */}
              {pnlData.revenue.accounts.length > 0 && (
                <div>
                  <h3 className="font-semibold text-green-600 mb-3 flex items-center gap-2">
                    <TrendUp size={18} />
                    Omzet
                  </h3>
                  <div className="space-y-2 pl-6">
                    {pnlData.revenue.accounts.map((account) => (
                      <div key={account.account_id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {account.account_code} – {account.account_name}
                        </span>
                        <span className="font-mono">{formatCurrency(account.balance)}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Totaal omzet</span>
                      <span className="font-mono text-green-600">{formatCurrency(pnlData.revenue.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Cost of Goods Sold */}
              {pnlData.cost_of_goods_sold.accounts.length > 0 && (
                <div>
                  <h3 className="font-semibold text-orange-600 mb-3 flex items-center gap-2">
                    <Receipt size={18} />
                    Kostprijs verkopen
                  </h3>
                  <div className="space-y-2 pl-6">
                    {pnlData.cost_of_goods_sold.accounts.map((account) => (
                      <div key={account.account_id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {account.account_code} – {account.account_name}
                        </span>
                        <span className="font-mono">{formatCurrency(Math.abs(account.balance))}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Totaal kostprijs</span>
                      <span className="font-mono text-orange-600">{formatCurrency(pnlData.cost_of_goods_sold.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Gross Profit */}
              {(pnlData.revenue.total > 0 || pnlData.cost_of_goods_sold.total > 0) && (
                <div className="bg-muted/50 p-4 rounded-lg">
                  <div className="flex justify-between font-semibold text-lg">
                    <span className="flex items-center gap-2">
                      <ArrowRight size={18} />
                      Brutowinst
                    </span>
                    <span className={`font-mono ${pnlData.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(pnlData.gross_profit)}
                    </span>
                  </div>
                </div>
              )}

              {/* Operating Expenses */}
              {pnlData.operating_expenses.accounts.length > 0 && (
                <div>
                  <h3 className="font-semibold text-red-600 mb-3 flex items-center gap-2">
                    <TrendDown size={18} />
                    Bedrijfskosten
                  </h3>
                  <div className="space-y-2 pl-6">
                    {pnlData.operating_expenses.accounts.map((account) => (
                      <div key={account.account_id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {account.account_code} – {account.account_name}
                        </span>
                        <span className="font-mono">{formatCurrency(Math.abs(account.balance))}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Totaal bedrijfskosten</span>
                      <span className="font-mono text-red-600">{formatCurrency(pnlData.operating_expenses.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Operating Income */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex justify-between font-semibold text-lg">
                  <span className="flex items-center gap-2">
                    <ArrowRight size={18} />
                    Bedrijfsresultaat
                  </span>
                  <span className={`font-mono ${pnlData.operating_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(pnlData.operating_income)}
                  </span>
                </div>
              </div>

              {/* Other Income */}
              {pnlData.other_income.accounts.length > 0 && (
                <div>
                  <h3 className="font-semibold text-blue-600 mb-3">Overige opbrengsten</h3>
                  <div className="space-y-2 pl-6">
                    {pnlData.other_income.accounts.map((account) => (
                      <div key={account.account_id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {account.account_code} – {account.account_name}
                        </span>
                        <span className="font-mono">{formatCurrency(account.balance)}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Totaal overige opbrengsten</span>
                      <span className="font-mono">{formatCurrency(pnlData.other_income.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Expenses */}
              {pnlData.other_expenses.accounts.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-600 mb-3">Overige kosten</h3>
                  <div className="space-y-2 pl-6">
                    {pnlData.other_expenses.accounts.map((account) => (
                      <div key={account.account_id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {account.account_code} – {account.account_name}
                        </span>
                        <span className="font-mono">{formatCurrency(Math.abs(account.balance))}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Totaal overige kosten</span>
                      <span className="font-mono">{formatCurrency(pnlData.other_expenses.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Net Income */}
              <div className={`p-4 rounded-lg ${pnlData.net_income >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                <div className="flex justify-between font-bold text-xl">
                  <span className="flex items-center gap-2">
                    <Coins size={24} />
                    Netto resultaat
                  </span>
                  <span className={`font-mono ${pnlData.net_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(pnlData.net_income)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export default ProfitLossPage
