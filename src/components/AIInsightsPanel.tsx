/**
 * AI Insights Panel Component
 * 
 * Displays AI-generated insights and suggestions for ZZP users.
 * Part of the "Smart Accounting" experience.
 * 
 * Design Principles:
 * - AI assists, never blocks
 * - Every insight explains WHY (transparency)
 * - User can dismiss or take action
 * - Clean, non-intrusive UI
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { 
  Sparkle,
  Lightning,
  Lightbulb,
  Info,
  ArrowRight,
  X,
  CaretDown,
  CaretUp,
  Receipt,
  Clock,
  CurrencyCircleDollar,
  Calendar,
  User,
  Warning,
  CheckCircle,
} from '@phosphor-icons/react'
import { zzpApi, ZZPInsight, ZZPInsightsResponse, InsightSeverity } from '@/lib/api'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { navigateTo } from '@/lib/navigation'
import { parseApiError } from '@/lib/utils'
import { t } from '@/i18n'


// Map insight types to icons
const insightTypeIcons: Record<string, React.ElementType> = {
  invoice_overdue: Warning,
  invoice_followup: Receipt,
  unbilled_hours: Clock,
  btw_deadline: Calendar,
  missing_profile: User,
  no_recent_activity: Info,
}

// Map severity to colors and styles
const severityStyles: Record<InsightSeverity, { bg: string; border: string; text: string; icon: React.ElementType }> = {
  action_needed: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-600 dark:text-red-400',
    icon: Lightning,
  },
  suggestion: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-600 dark:text-amber-400',
    icon: Lightbulb,
  },
  info: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-600 dark:text-blue-400',
    icon: Info,
  },
}

interface InsightCardProps {
  insight: ZZPInsight
  onDismiss?: (id: string) => void
  onAction?: (insight: ZZPInsight) => void
}

const InsightCard = ({ insight, onDismiss, onAction }: InsightCardProps) => {
  const [showReason, setShowReason] = useState(false)
  const style = severityStyles[insight.severity]
  const TypeIcon = insightTypeIcons[insight.type] || Info
  const SeverityIcon = style.icon

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(cents / 100)
  }

  const handleAction = () => {
    if (insight.action?.route) {
      navigateTo(insight.action.route)
    }
    onAction?.(insight)
  }

  return (
    <div className={`relative rounded-lg border ${style.border} ${style.bg} p-4 transition-all hover:shadow-sm`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${style.bg} flex-shrink-0`}>
            <TypeIcon size={20} className={style.text} weight="duotone" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={`${style.bg} ${style.text} ${style.border} text-xs px-1.5 py-0`}>
                <SeverityIcon size={12} className="mr-1" />
                {insight.severity === 'action_needed' 
                  ? t('aiInsights.severityActionNeeded')
                  : insight.severity === 'suggestion'
                    ? t('aiInsights.severitySuggestion')
                    : t('aiInsights.severityInfo')
                }
              </Badge>
              {insight.amount_cents && insight.amount_cents > 0 && (
                <span className="text-xs font-medium text-muted-foreground">
                  {formatAmount(insight.amount_cents)}
                </span>
              )}
            </div>
            <h4 className="font-medium text-sm leading-tight mb-1">{insight.title}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">{insight.description}</p>
          </div>
        </div>
        
        {/* Dismiss button */}
        {insight.dismissible && onDismiss && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-50 hover:opacity-100"
                onClick={() => onDismiss(insight.id)}
              >
                <X size={14} />
                <span className="sr-only">{t('aiInsights.dismiss')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('aiInsights.dismiss')}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Why section (collapsible) */}
      <Collapsible open={showReason} onOpenChange={setShowReason}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {showReason ? <CaretUp size={12} className="mr-1" /> : <CaretDown size={12} className="mr-1" />}
            {t('aiInsights.why')}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 p-2 rounded bg-secondary/50 text-xs text-muted-foreground">
            <Sparkle size={12} className="inline mr-1 text-primary" />
            {insight.reason}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Action button */}
      {insight.action && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-2"
            onClick={handleAction}
          >
            {insight.action.label}
            <ArrowRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}

// Loading skeleton
const InsightsSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="rounded-lg border border-border/50 p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      </div>
    ))}
  </div>
)

// Empty state
const EmptyInsights = () => (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <div className="h-14 w-14 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
      <CheckCircle size={28} className="text-green-500" weight="duotone" />
    </div>
    <h4 className="font-medium text-sm mb-1">{t('aiInsights.noInsights')}</h4>
    <p className="text-xs text-muted-foreground max-w-[200px]">
      {t('aiInsights.noInsightsDescription')}
    </p>
  </div>
)

interface AIInsightsPanelProps {
  maxItems?: number
  showHeader?: boolean
  className?: string
}

export const AIInsightsPanel = ({ 
  maxItems = 5, 
  showHeader = true,
  className = '' 
}: AIInsightsPanelProps) => {
  const [insights, setInsights] = useState<ZZPInsightsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const showSkeleton = useDelayedLoading(isLoading, 300, !!insights)

  // Load insights
  const loadInsights = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await zzpApi.insights.get()
      setInsights(data)
    } catch (err) {
      console.error('Failed to load insights:', err)
      setError(parseApiError(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadInsights()
  }, [])

  // Handle dismiss
  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]))
  }

  // Filter dismissed insights
  const visibleInsights = insights?.insights.filter(i => !dismissedIds.has(i.id)) || []
  const displayInsights = visibleInsights.slice(0, maxItems)
  const hasMore = visibleInsights.length > maxItems

  // Count by severity (excluding dismissed)
  const actionNeededCount = visibleInsights.filter(i => i.severity === 'action_needed').length
  const suggestionCount = visibleInsights.filter(i => i.severity === 'suggestion').length

  return (
    <Card className={`bg-card/80 backdrop-blur-sm border border-border/50 ${className}`}>
      {showHeader && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkle size={18} className="text-primary" weight="duotone" />
              </div>
              <div>
                <CardTitle className="text-base">{t('aiInsights.title')}</CardTitle>
                <CardDescription className="text-xs">
                  {t('aiInsights.subtitle')}
                </CardDescription>
              </div>
            </div>
            {!isLoading && !error && visibleInsights.length > 0 && (
              <div className="flex gap-2">
                {actionNeededCount > 0 && (
                  <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 text-xs">
                    <Lightning size={12} className="mr-1" />
                    {actionNeededCount}
                  </Badge>
                )}
                {suggestionCount > 0 && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs">
                    <Lightbulb size={12} className="mr-1" />
                    {suggestionCount}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
      )}
      
      <CardContent className={showHeader ? '' : 'pt-4'}>
        {showSkeleton ? (
          <InsightsSkeleton />
        ) : error ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">{t('aiInsights.error')}</p>
            <Button variant="outline" size="sm" onClick={loadInsights}>
              {t('aiInsights.errorRetry')}
            </Button>
          </div>
        ) : displayInsights.length === 0 ? (
          <EmptyInsights />
        ) : (
          <div className="space-y-3">
            {displayInsights.map((insight) => (
              <InsightCard 
                key={insight.id} 
                insight={insight}
                onDismiss={handleDismiss}
              />
            ))}
            
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => navigateTo('/zzp/insights')}
              >
                {t('aiInsights.viewAll')} ({visibleInsights.length - maxItems} {t('common.more')})
                <ArrowRight size={14} className="ml-1" />
              </Button>
            )}
          </div>
        )}
        
        {/* AI Transparency footer */}
        {!isLoading && !error && insights && (
          <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Sparkle size={12} />
            <span>{t('aiInsights.poweredBy')}</span>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {insights.ai_model_version}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {t('aiInsights.modelVersion')}: {insights.ai_model_version}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
