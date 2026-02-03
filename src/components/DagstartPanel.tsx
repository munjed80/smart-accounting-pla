/**
 * DagstartPanel - "Dagstart" Daily Start Panel
 * 
 * Simplified daily workflow for accountants - usable in 60 seconds.
 * Shows max 5 prioritized actions with WHY and CTA.
 * 
 * Features:
 * - Te beoordelen (X) → navigate to /accountant/review-queue
 * - Rode issues (X) → filter client list
 * - BTW binnen 7 dagen (X) → filter client list
 * - Achterstand documenten (X) → filter client list
 * 
 * All text is in Dutch with imperative verbs.
 */

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  WarningCircle,
  MagnifyingGlass,
  Calendar,
  Stack,
  ArrowRight,
  CheckCircle,
  Lightbulb,
} from '@phosphor-icons/react'
import { DashboardSummary, ClientStatusCard } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'

// Business logic thresholds
const VAT_URGENT_DAYS = 7
const BACKLOG_URGENT_COUNT = 10

// Priority levels
type Priority = 'urgent' | 'today' | 'soon'

interface DagstartAction {
  id: string
  icon: React.ElementType
  iconColor: 'red' | 'yellow' | 'blue' | 'green'
  label: string
  why: string
  count: number
  priority: Priority
  action: () => void
}

interface DagstartPanelProps {
  summary: DashboardSummary | null
  clients: ClientStatusCard[]
  isLoading?: boolean
  onFilterChange?: (filter: string) => void
}

// Priority badge component
const PriorityBadge = ({ priority }: { priority: Priority }) => {
  const config = {
    urgent: { text: t('dagstart.urgent'), className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
    today: { text: t('dagstart.today'), className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
    soon: { text: t('dagstart.soon'), className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  }
  
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config[priority].className}`}>
      {config[priority].text}
    </Badge>
  )
}

// Action item component
const ActionItem = ({ action }: { action: DagstartAction }) => {
  const Icon = action.icon
  const colorClasses = {
    red: 'text-red-600 dark:text-red-400 bg-red-500/10',
    yellow: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    green: 'text-green-600 dark:text-green-400 bg-green-500/10',
  }
  
  return (
    <button
      onClick={action.action}
      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left group border border-transparent hover:border-border"
    >
      <div className={`p-2.5 rounded-lg ${colorClasses[action.iconColor]} flex-shrink-0`}>
        <Icon size={20} weight="fill" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-foreground">
            {action.label}
          </span>
          <Badge variant="secondary" className="text-xs">
            {action.count}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {action.why}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <PriorityBadge priority={action.priority} />
        <ArrowRight 
          size={16} 
          className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" 
        />
      </div>
    </button>
  )
}

export const DagstartPanel = ({ summary, clients, isLoading, onFilterChange }: DagstartPanelProps) => {
  // Derive actions from summary and clients data
  const actions = useMemo((): DagstartAction[] => {
    if (!summary) return []
    
    const allActions: DagstartAction[] = []
    
    // 1. Te beoordelen - Documents needing review
    const totalDocsToReview = clients.reduce((sum, c) => sum + c.documents_needing_review_count, 0)
    if (totalDocsToReview > 0) {
      allActions.push({
        id: 'review',
        icon: MagnifyingGlass,
        iconColor: 'yellow',
        label: t('dagstart.toReview'),
        why: t('dagstart.toReviewWhy'),
        count: totalDocsToReview,
        priority: totalDocsToReview > BACKLOG_URGENT_COUNT ? 'urgent' : 'today',
        action: () => navigateTo('/accountant/review-queue'),
      })
    }
    
    // 2. Rode issues - Critical red issues
    if (summary.clients_with_red_issues > 0) {
      allActions.push({
        id: 'red_issues',
        icon: WarningCircle,
        iconColor: 'red',
        label: t('dagstart.redIssues'),
        why: t('dagstart.redIssuesWhy'),
        count: summary.clients_with_red_issues,
        priority: 'urgent',
        action: () => {
          if (onFilterChange) {
            onFilterChange('has_red')
          }
          // Scroll to client list
          document.getElementById('client-list-section')?.scrollIntoView({ behavior: 'smooth' })
        },
      })
    }
    
    // 3. BTW binnen 7 dagen - VAT deadlines within 7 days
    const vatUrgentClients = clients.filter(c => 
      c.days_to_vat_deadline !== null && c.days_to_vat_deadline <= VAT_URGENT_DAYS
    ).length
    
    if (vatUrgentClients > 0) {
      allActions.push({
        id: 'vat_urgent',
        icon: Calendar,
        iconColor: 'red',
        label: t('dagstart.vatDue'),
        why: t('dagstart.vatDueWhy'),
        count: vatUrgentClients,
        priority: 'urgent',
        action: () => {
          if (onFilterChange) {
            onFilterChange('deadline_7d')
          }
          document.getElementById('client-list-section')?.scrollIntoView({ behavior: 'smooth' })
        },
      })
    }
    
    // 4. Achterstand documenten - Document backlog
    if (summary.document_backlog_total > 0) {
      allActions.push({
        id: 'backlog',
        icon: Stack,
        iconColor: summary.document_backlog_total > BACKLOG_URGENT_COUNT ? 'yellow' : 'blue',
        label: t('dagstart.docBacklog'),
        why: t('dagstart.docBacklogWhy'),
        count: summary.document_backlog_total,
        priority: summary.document_backlog_total > BACKLOG_URGENT_COUNT ? 'today' : 'soon',
        action: () => {
          if (onFilterChange) {
            onFilterChange('all')
          }
          // Navigate to review queue to handle backlog
          navigateTo('/accountant/review-queue')
        },
      })
    }
    
    // 5. Inactive clients (30+ days)
    const inactiveClients = clients.filter(c => {
      if (!c.last_activity_at) return true // Never active = inactive
      const lastActivity = new Date(c.last_activity_at)
      const daysSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
      return daysSince >= 30
    }).length
    
    if (inactiveClients > 0 && allActions.length < 5) {
      allActions.push({
        id: 'inactive',
        icon: Lightbulb,
        iconColor: 'blue',
        label: t('dagstart.inactiveClients'),
        why: t('dagstart.inactiveClientsWhy'),
        count: inactiveClients,
        priority: 'soon',
        action: () => {
          if (onFilterChange) {
            onFilterChange('stale_30d')
          }
          document.getElementById('client-list-section')?.scrollIntoView({ behavior: 'smooth' })
        },
      })
    }
    
    // Sort by priority (urgent first) and return max 5
    const priorityOrder: Record<Priority, number> = {
      urgent: 0,
      today: 1,
      soon: 2,
    }
    
    return allActions
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 5)
  }, [summary, clients, onFilterChange])
  
  // Show skeleton while loading
  if (isLoading) {
    return (
      <Card className="mb-6 bg-gradient-to-r from-primary/5 via-background to-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            🌅 {t('dagstart.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }
  
  // If no actions, show positive message
  if (actions.length === 0) {
    return (
      <Card className="mb-6 bg-gradient-to-r from-green-500/5 via-background to-green-500/5 border-green-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle size={20} className="text-green-600" weight="fill" />
            {t('dagstart.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <CheckCircle size={48} className="mx-auto mb-3 text-green-500 opacity-80" weight="duotone" />
            <p className="text-lg font-medium text-green-700 dark:text-green-400 mb-1">
              {t('dagstart.allDone')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('dagstart.allDoneDesc')}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card className="mb-6 bg-gradient-to-r from-primary/5 via-background to-primary/5 border-primary/20 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            🌅 {t('dagstart.title')}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {actions.length} {actions.length === 1 ? t('dagstart.actionSingular') : t('dagstart.actionPlural')}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {/* Action list */}
        <div className="space-y-2">
          {actions.map((action) => (
            <ActionItem key={action.id} action={action} />
          ))}
        </div>
        
        {/* Quick tip */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground text-center">
            💡 {t('dagstart.tip')}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
