/**
 * ProfitLossPage - Profit & Loss (Winst- en verliesrekening) Page
 * 
 * Frontend-only page showing the profit and loss statement overview.
 * This is a placeholder page with empty state and explanation
 * of what will appear here once transactions are processed.
 * 
 * Features:
 * - Dutch UI text
 * - Empty state with helpful tips
 * - Coming soon notice
 * - CTA buttons to navigate to workqueue and review pages
 * - Mobile-responsive design
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/EmptyState'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import {
  ChartLineUp,
  Stack,
  MagnifyingGlass,
  TrendUp,
  TrendDown,
  Info,
} from '@phosphor-icons/react'

interface ProfitLossPageProps {
  onNavigate?: (tab: string) => void
}

export const ProfitLossPage = ({ onNavigate }: ProfitLossPageProps) => {
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

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 max-w-4xl">
      <Card className="bg-card/80 backdrop-blur-sm mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ChartLineUp size={24} weight="duotone" className="text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-2xl">{t('profitLoss.title')}</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {t('profitLoss.comingSoon')}
                </Badge>
              </div>
              <CardDescription>{t('profitLoss.subtitle')}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Coming Soon Notice */}
      <Card className="bg-secondary/30 border-dashed mb-6">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">{t('profitLoss.comingSoon')}</p>
              <p className="text-sm text-muted-foreground">{t('profitLoss.comingSoonDescription')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
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

      {/* CTA Buttons */}
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
    </div>
  )
}

export default ProfitLossPage
