/**
 * AccountantActionsPage - Action Log Page
 * 
 * Displays a history of all bulk operations performed by the accountant.
 * Data is stored in localStorage via the useActionLog hook.
 * 
 * Features:
 * - List of all actions with timestamp, type, and result counts
 * - Expandable details per action
 * - Status indicators (success/partial/failed)
 * - Dutch UI text
 * - Mobile-responsive design
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  WarningCircle,
  CaretDown,
  CaretRight,
  Clock,
  Gauge,
  PaperPlaneTilt,
  Lock,
  Trash,
} from '@phosphor-icons/react'
import { t } from '@/i18n'
import { useActionLog, ActionLogEntry, ActionType } from '@/hooks/useActionLog'
import { formatDistanceToNow } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'

// Helper to get action type display name
const getActionTypeName = (type: ActionType): string => {
  switch (type) {
    case 'recalculate':
      return t('reminders.bulkRecalculate')
    case 'ack_yellow':
      return t('reminders.bulkAckYellow')
    case 'generate_vat':
      return t('reminders.bulkVatDraft')
    case 'send_reminders':
      return t('reminders.bulkSendReminders')
    case 'lock_period':
      return t('reminders.bulkLockPeriod')
    default:
      return type
  }
}

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

// Helper to determine overall status
const getOverallStatus = (entry: ActionLogEntry): 'success' | 'partial' | 'failed' => {
  const { success, failed } = entry.result_counts
  if (failed === 0) return 'success'
  if (success === 0) return 'failed'
  return 'partial'
}

// Status badge component
const StatusBadge = ({ status }: { status: 'success' | 'partial' | 'failed' }) => {
  const config = {
    success: {
      label: t('actionLog.statusSuccess'),
      className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    },
    partial: {
      label: t('actionLog.statusPartial'),
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    },
    failed: {
      label: t('actionLog.statusFailed'),
      className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    },
  }
  
  return (
    <Badge variant="outline" className={config[status].className}>
      {config[status].label}
    </Badge>
  )
}

// Action row component
const ActionRow = ({ 
  entry, 
  isExpanded, 
  onToggle 
}: { 
  entry: ActionLogEntry
  isExpanded: boolean
  onToggle: () => void 
}) => {
  const Icon = getActionTypeIcon(entry.action_type)
  const status = getOverallStatus(entry)
  const { success, failed, skipped } = entry.result_counts
  
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <TableRow className="cursor-pointer hover:bg-muted/50">
          <TableCell>
            <div className="flex items-center gap-2">
              <Icon size={16} className="text-muted-foreground" />
              <span className="font-medium">{getActionTypeName(entry.action_type)}</span>
            </div>
          </TableCell>
          <TableCell className="text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock size={14} />
              {formatDistanceToNow(new Date(entry.timestamp), { 
                addSuffix: true, 
                locale: nlLocale 
              })}
            </div>
          </TableCell>
          <TableCell className="text-center">{entry.selected_count}</TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <span className="text-green-600 dark:text-green-400 text-sm">{success}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-red-600 dark:text-red-400 text-sm">{failed}</span>
              {skipped > 0 && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-amber-600 dark:text-amber-400 text-sm">{skipped}</span>
                </>
              )}
            </div>
          </TableCell>
          <TableCell>
            <StatusBadge status={status} />
          </TableCell>
          <TableCell className="text-right">
            {isExpanded 
              ? <CaretDown size={16} className="text-muted-foreground" /> 
              : <CaretRight size={16} className="text-muted-foreground" />
            }
          </TableCell>
        </TableRow>
      </CollapsibleTrigger>
      <CollapsibleContent asChild>
        <TableRow className="bg-muted/30">
          <TableCell colSpan={6}>
            <div className="py-2 space-y-2">
              {/* VAT period info */}
              {entry.vat_period && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t('bulkOps.vatPeriodLabel')}: </span>
                  Q{entry.vat_period.quarter} {entry.vat_period.year}
                </p>
              )}
              
              {/* Reminder info */}
              {entry.reminder_info && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t('bulkOps.reminderTitleLabel')}: </span>
                  {entry.reminder_info.title}
                </p>
              )}
              
              {/* Client results summary */}
              <div className="mt-2">
                <p className="text-sm font-medium mb-1">{t('actionLog.details')}:</p>
                <ScrollArea className="h-32">
                  <div className="space-y-1">
                    {entry.client_results.map((client) => (
                      <div 
                        key={client.client_id} 
                        className="flex items-center justify-between text-sm p-1 rounded hover:bg-background"
                      >
                        <span className="truncate flex-1">{client.client_name}</span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ml-2 ${
                            client.status === 'SUCCESS' 
                              ? 'text-green-600 dark:text-green-400' 
                              : client.status === 'FAILED'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {client.status === 'SUCCESS' 
                            ? t('bulkOps.resultSuccess')
                            : client.status === 'FAILED'
                            ? t('bulkOps.resultFailed')
                            : t('bulkOps.resultSkipped')
                          }
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TableCell>
        </TableRow>
      </CollapsibleContent>
    </Collapsible>
  )
}

export const AccountantActionsPage = () => {
  const { entries, clearLog, count } = useActionLog()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  
  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }
  
  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 max-w-5xl">
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">{t('actionLog.title')}</CardTitle>
              <CardDescription>{t('actionLog.subtitle')}</CardDescription>
            </div>
            {count > 0 && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  if (window.confirm('Weet je zeker dat je alle acties wilt verwijderen?')) {
                    clearLog()
                  }
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash size={16} className="mr-1" />
                {t('common.clearAll')}
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ArrowsClockwise size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">{t('actionLog.noActionsYet')}</p>
              <p className="text-sm mt-1">{t('actionLog.noActionsDescription')}</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('actionLog.actionType')}</TableHead>
                    <TableHead>{t('actionLog.timestamp')}</TableHead>
                    <TableHead className="text-center">{t('actionLog.clientCount')}</TableHead>
                    <TableHead>{t('actionLog.resultsCount')}</TableHead>
                    <TableHead>{t('actionLog.status')}</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <ActionRow
                      key={entry.id}
                      entry={entry}
                      isExpanded={expandedIds.has(entry.id)}
                      onToggle={() => toggleExpanded(entry.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AccountantActionsPage
