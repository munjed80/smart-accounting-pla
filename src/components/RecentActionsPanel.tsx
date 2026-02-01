/**
 * RecentActionsPanel - Recent Actions Panel for Dashboard
 * 
 * Shows the last 3 bulk operations on the accountant dashboard.
 * Includes a link to the full Action Log page.
 * 
 * Features:
 * - Compact display of recent actions
 * - Status indicators
 * - Quick link to view all
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  WarningCircle,
  Gauge,
  PaperPlaneTilt,
  Lock,
  ArrowRight,
} from '@phosphor-icons/react'
import { t } from '@/i18n'
import { useActionLog, ActionLogEntry, ActionType } from '@/hooks/useActionLog'
import { formatDistanceToNow } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import { navigateTo } from '@/lib/navigation'

// Helper to get action type icon
const getActionTypeIcon = (type: ActionType) => {
  switch (type) {
    case 'recalculate':
      return ArrowsClockwise
    case 'ack_yellow':
      return CheckCircle
    case 'generate_vat':
      return Gauge
    case 'send_reminders':
      return PaperPlaneTilt
    case 'lock_period':
      return Lock
    default:
      return ArrowsClockwise
  }
}

// Helper to get action type short name
const getActionTypeShortName = (type: ActionType): string => {
  switch (type) {
    case 'recalculate':
      return t('bulkOps.recalculate')
    case 'ack_yellow':
      return t('bulkOps.ackYellow')
    case 'generate_vat':
      return t('bulkOps.vatDraft')
    case 'send_reminders':
      return t('bulkOps.sendReminder')
    case 'lock_period':
      return t('reminders.bulkLockPeriod')
    default:
      return type
  }
}

// Helper to determine overall status
const getOverallStatus = (entry: ActionLogEntry): 'success' | 'partial' | 'failed' => {
  const { success, failed } = entry.result_counts
  if (failed === 0) return 'success'
  if (success === 0) return 'failed'
  return 'partial'
}

// Status indicator component
const StatusIndicator = ({ status }: { status: 'success' | 'partial' | 'failed' }) => {
  const config = {
    success: {
      icon: CheckCircle,
      className: 'text-green-600 dark:text-green-400',
    },
    partial: {
      icon: WarningCircle,
      className: 'text-amber-600 dark:text-amber-400',
    },
    failed: {
      icon: XCircle,
      className: 'text-red-600 dark:text-red-400',
    },
  }
  
  const Icon = config[status].icon
  return <Icon size={14} className={config[status].className} weight="fill" />
}

// Recent action row component
const RecentActionRow = ({ entry }: { entry: ActionLogEntry }) => {
  const Icon = getActionTypeIcon(entry.action_type)
  const status = getOverallStatus(entry)
  const { success, failed } = entry.result_counts
  
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors">
      <Icon size={16} className="text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {getActionTypeShortName(entry.action_type)}
          </span>
          <StatusIndicator status={status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {entry.selected_count} klanten • {success}/{failed} gelukt/mislukt
        </p>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {formatDistanceToNow(new Date(entry.timestamp), { 
          addSuffix: true, 
          locale: nlLocale 
        })}
      </span>
    </div>
  )
}

export const RecentActionsPanel = () => {
  const { getRecent, count } = useActionLog()
  const recentActions = getRecent(3)
  
  if (count === 0) {
    return null // Don't show panel if no actions yet
  }
  
  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">{t('actionLog.recentActions')}</CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigateTo('/accountant/acties')}
            className="text-xs"
          >
            {t('actionLog.viewAll')}
            <ArrowRight size={14} className="ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border">
          {recentActions.map((entry) => (
            <RecentActionRow key={entry.id} entry={entry} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default RecentActionsPanel
