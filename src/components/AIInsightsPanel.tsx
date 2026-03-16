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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
} from '@/components/ui/collapsible'
import { 
  Sparkle,
  Lightning,
  Lightbulb,
  Info,
  ArrowRight,
  X,
  Receipt,
  Clock,
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

// Map severity to subtle left-border and icon color
const severityStyles: Record<InsightSeverity, { border: string; text: string; icon: React.ElementType }> = {
  action_needed: {
    border: 'border-l-red-400/50',
    text: 'text-red-500 dark:text-red-400',
    icon: Lightning,
  },
  suggestion: {
    border: 'border-l-amber-400/50',
    text: 'text-amber-500 dark:text-amber-400',
    icon: Lightbulb,
  },
  info: {
    border: 'border-l-blue-400/50',
    text: 'text-blue-400 dark:text-blue-300',
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
    <div className={`rounded-md border border-border/25 border-l-2 ${style.border} bg-card/50 transition-all hover:bg-accent/5`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <TypeIcon size={16} className={`${style.text} flex-shrink-0`} weight="duotone" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <h4 className="font-medium text-sm leading-tight">{insight.title}</h4>
            {insight.amount_cents && insight.amount_cents > 0 && (
              <span className="text-xs text-muted-foreground">· {formatAmount(insight.amount_cents)}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{insight.description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Why toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-40 hover:opacity-80"
                onClick={() => setShowReason(!showReason)}
              >
                <SeverityIcon size={12} className={style.text} />
                <span className="sr-only">{t('aiInsights.why')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('aiInsights.why')}</TooltipContent>
          </Tooltip>

          {/* Action button */}
          {insight.action && (
            <button
              onClick={handleAction}
              className="text-xs text-primary/60 hover:text-primary whitespace-nowrap transition-colors px-1"
            >
              {insight.action.label}
            </button>
          )}

          {/* Dismiss button */}
          {insight.dismissible && onDismiss && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-30 hover:opacity-80"
                  onClick={() => onDismiss(insight.id)}
                >
                  <X size={12} />
                  <span className="sr-only">{t('aiInsights.dismiss')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('aiInsights.dismiss')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Why section (collapsible) */}
      <Collapsible open={showReason} onOpenChange={setShowReason}>
        <CollapsibleContent>
          <div className="px-3 pb-2.5">
            <div className="rounded bg-secondary/40 text-xs text-muted-foreground px-2.5 py-1.5">
              <Sparkle size={11} className="inline mr-1 text-primary/60" />
              {insight.reason}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
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


  return (
    <Card className={`bg-card/80 backdrop-blur-sm border border-border/50 ${className}`}>
      {showHeader && (
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Sparkle size={14} weight="duotone" className="text-primary/60" />
              {t('aiInsights.title')}
            </CardTitle>
            {!isLoading && !error && visibleInsights.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {visibleInsights.length}
              </span>
            )}
          </div>
        </CardHeader>
      )}
      
      <CardContent className={showHeader ? 'pt-1' : 'pt-4'}>
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
          <div className="space-y-1.5">
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
