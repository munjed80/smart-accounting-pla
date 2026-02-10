import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/lib/AuthContext'
import { zzpApi, ZZPDashboardResponse, administrationApi, Administration, getErrorMessage } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { NoAdministrationsEmptyState } from '@/components/EmptyState'
import { AIInsightsPanel } from '@/components/AIInsightsPanel'
import { 
  Receipt, 
  TrendUp, 
  TrendDown,
  FileText, 
  House,
  Sparkle,
  Clock,
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  Warning,
  Info,
  CurrencyEur,
  CalendarCheck
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import { t } from '@/i18n'

export const SmartDashboard = () => {
  const { user } = useAuth()

  // Fetch administrations using react-query
  const { 
    data: administrations = [], 
    isLoading: isLoadingAdmins,
    error: adminError 
  } = useQuery<Administration[], Error>({
    queryKey: ['administrations'],
    queryFn: () => administrationApi.list(),
    refetchOnWindowFocus: false,
  })

  // Fetch dashboard data using react-query
  const { 
    data: dashboardData,
    isLoading: isLoadingDashboard,
    isFetching,
    error: dashboardError,
    refetch
  } = useQuery<ZZPDashboardResponse | null, Error>({
    queryKey: ['zzp-dashboard'],
    queryFn: async () => {
      if (administrations.length === 0) {
        return null
      }
      try {
        return await zzpApi.dashboard.get()
      } catch {
        // Dashboard data may be unavailable for fresh accounts - this is expected
        return null
      }
    },
    enabled: !isLoadingAdmins && administrations.length > 0,
    refetchOnWindowFocus: false,
  })

  // Determine loading states
  // Only show full skeleton on initial load when we have no data yet
  const isInitialLoading = isLoadingAdmins || (isLoadingDashboard && !dashboardData && administrations.length > 0)
  const fetchError = adminError || dashboardError

  const handleRefresh = () => {
    refetch()
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(cents / 100)
  }

  const getCurrentMonthName = () => {
    return format(new Date(), 'MMMM', { locale: nlLocale })
  }
  
  // Show loading state only on initial load (not on background refetches)
  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 opacity-100">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
                <House size={40} weight="duotone" className="text-primary" />
                {t('dashboard.overzichtTitle')}
              </h1>
              <p className="text-muted-foreground">
                {t('dashboard.welcomeBack')}, <span className="font-semibold">{user?.full_name}</span>
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
  
  // Show error state if fetching failed
  if (fetchError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
                <House size={40} weight="duotone" className="text-primary" />
                {t('dashboard.overzichtTitle')}
              </h1>
              <p className="text-muted-foreground">
                {t('dashboard.welcomeBack')}, <span className="font-semibold">{user?.full_name}</span>
              </p>
            </div>
          </div>
          
          <Alert variant="destructive">
            <WarningCircle size={18} />
            <AlertDescription className="ml-2 flex items-center justify-between">
              <span>{getErrorMessage(fetchError)}</span>
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
                <House size={40} weight="duotone" className="text-primary" />
                {t('dashboard.overzichtTitle')}
              </h1>
              <p className="text-muted-foreground">
                {t('dashboard.welcomeBack')}, <span className="font-semibold">{user?.full_name}</span>
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

  // Get severity icon for action items
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <WarningCircle size={18} weight="fill" className="text-destructive" />
      case 'warning':
        return <Warning size={18} weight="fill" className="text-amber-500" />
      default:
        return <Info size={18} weight="fill" className="text-blue-500" />
    }
  }

  // Get badge variant for action severity
  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'bg-destructive/20 text-destructive border-destructive/30'
      case 'warning':
        return 'bg-amber-500/20 text-amber-700 border-amber-500/30'
      default:
        return 'bg-blue-500/20 text-blue-700 border-blue-500/30'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 opacity-100">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
              <House size={40} weight="duotone" className="text-primary" />
              {t('dashboard.overzichtTitle')}
            </h1>
            <p className="text-muted-foreground">
              {t('dashboard.welcomeBack')}, <span className="font-semibold">{user?.full_name}</span>
            </p>
          </div>
          <div className="text-right">
            <Button onClick={handleRefresh} variant="outline" size="sm" disabled={isFetching}>
              <ArrowsClockwise size={18} className={`mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>

        {/* Main KPI Cards - ZZP focused metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Open Invoices Card */}
          <Card 
            className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => navigateTo('/zzp/invoices')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText size={18} weight="duotone" className="text-primary" />
                {t('dashboard.openInvoices')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                {formatCurrency(dashboardData?.invoices.open_total_cents || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {dashboardData?.invoices.open_count || 0} {(dashboardData?.invoices.open_count || 0) === 1 ? t('dashboard.invoice') : t('dashboard.invoices')}
                {(dashboardData?.invoices.overdue_count || 0) > 0 && (
                  <span className="text-destructive ml-1">
                    ({dashboardData?.invoices.overdue_count} {t('dashboard.overdue').toLowerCase()})
                  </span>
                )}
              </p>
            </CardContent>
          </Card>

          {/* Paid This Month Card */}
          <Card 
            className="bg-card/80 backdrop-blur-sm border-2 border-accent/20 cursor-pointer hover:border-accent/40 transition-colors"
            onClick={() => navigateTo('/zzp/invoices')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendUp size={18} weight="duotone" className="text-accent" />
                {t('dashboard.paidThisMonth')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-accent">
                {formatCurrency(dashboardData?.invoices.paid_this_month_cents || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {dashboardData?.invoices.paid_this_month_count || 0} {(dashboardData?.invoices.paid_this_month_count || 0) === 1 ? t('dashboard.invoice') : t('dashboard.invoices')} in {getCurrentMonthName()}
              </p>
            </CardContent>
          </Card>

          {/* Expenses This Month Card */}
          <Card 
            className="bg-card/80 backdrop-blur-sm border-2 border-border cursor-pointer hover:border-muted-foreground/40 transition-colors"
            onClick={() => navigateTo('/zzp/expenses')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendDown size={18} weight="duotone" />
                {t('dashboard.expensesThisMonth')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatCurrency(dashboardData?.expenses.this_month_total_cents || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {dashboardData?.expenses.this_month_count || 0} {t('dashboard.expenses')} in {getCurrentMonthName()}
              </p>
            </CardContent>
          </Card>

          {/* Hours This Week Card */}
          <Card 
            className="bg-card/80 backdrop-blur-sm border-2 border-accent/20 cursor-pointer hover:border-accent/40 transition-colors"
            onClick={() => navigateTo('/zzp/time')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock size={18} weight="duotone" className="text-accent" />
                {t('dashboard.hoursThisWeek')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-accent">
                {dashboardData?.time.this_week_hours || 0}u
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {dashboardData?.time.this_week_billable_hours || 0}u {t('dashboard.billableHours')}
                {(dashboardData?.time.this_week_value_cents || 0) > 0 && (
                  <span className="text-accent ml-1">
                    ({formatCurrency(dashboardData?.time.this_week_value_cents || 0)})
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Second row: BTW tracker + Actions needed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* BTW Tracker Card */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CurrencyEur size={24} weight="duotone" className="text-primary" />
                {t('dashboard.btwEstimate')}
              </CardTitle>
              <CardDescription>
                {dashboardData?.btw?.quarter || 'Q1 2024'} - deadline {dashboardData?.btw?.deadline ? format(new Date(dashboardData.btw.deadline), 'd MMMM yyyy', { locale: nlLocale }) : 'TBD'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Net VAT payable */}
                <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-3">
                    <CalendarCheck size={20} className="text-primary" weight="duotone" />
                    <span className="font-medium">{t('dashboard.btwToPayLabel')}</span>
                  </div>
                  <span className="text-2xl font-bold text-primary">
                    {formatCurrency(dashboardData?.btw.vat_payable_cents || 0)}
                  </span>
                </div>
                
                {/* Breakdown */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{t('dashboard.btwCollectedFrom')}</span>
                    <span className="font-medium">{formatCurrency(dashboardData?.btw.vat_collected_cents || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{t('dashboard.btwDeductibleFrom')}</span>
                    <span className="font-medium">- {formatCurrency(dashboardData?.btw.vat_deductible_cents || 0)}</span>
                  </div>
                </div>
                
                {/* Days until deadline */}
                {(dashboardData?.btw.days_until_deadline || 0) <= 30 && (
                  <div className={`text-xs px-2 py-1 rounded ${(dashboardData?.btw.days_until_deadline || 0) <= 14 ? 'bg-amber-500/20 text-amber-700' : 'bg-blue-500/20 text-blue-700'}`}>
                    {t('dashboard.daysUntilDeadline').replace('{days}', String(dashboardData?.btw.days_until_deadline || 0))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions Needed Card */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkle size={24} weight="duotone" className="text-amber-500" />
                {t('dashboard.actionsNeeded')}
              </CardTitle>
              <CardDescription>{t('dashboard.actionsNeededDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboardData?.actions && dashboardData.actions.length > 0 ? (
                <div className="space-y-3">
                  {dashboardData.actions.map((action) => (
                    <div 
                      key={action.id}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/5 transition-colors ${getSeverityBadgeClass(action.severity)}`}
                      onClick={() => action.route && navigateTo(action.route)}
                    >
                      {getSeverityIcon(action.severity)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{action.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{action.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle size={48} className="mx-auto mb-4 text-accent opacity-50" weight="duotone" />
                  <p className="text-muted-foreground">{t('dashboard.noActionsNeeded')}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('dashboard.noActionsNeededDescription')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* AI Insights Panel + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <AIInsightsPanel maxItems={4} />
          </div>
          <div className="hidden lg:block">
            {/* Quick actions */}
            <Card className="bg-card/80 backdrop-blur-sm h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkle size={20} weight="duotone" className="text-primary" />
                  {t('dashboard.quickActions')}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t('dashboard.quickActionsDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2 h-10"
                  onClick={() => navigateTo('/zzp/invoices')}
                >
                  <FileText size={18} />
                  {t('dashboard.newInvoice')}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2 h-10"
                  onClick={() => navigateTo('/zzp/time')}
                >
                  <Clock size={18} />
                  {t('dashboard.logHours')}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2 h-10"
                  onClick={() => navigateTo('/zzp/expenses')}
                >
                  <TrendDown size={18} />
                  {t('dashboard.addExpense')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
