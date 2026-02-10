/**
 * Client Audit Tab
 * 
 * Displays audit log for the client with:
 * - Timeline of all bookkeeping actions
 * - Filter by action type and entity type
 * 
 * All UI text is Dutch (nl.ts).
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  bookkeepingApi, 
  AuditLogEntry,
  AuditLogAction,
  getErrorMessage 
} from '@/lib/api'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { 
  ClockCounterClockwise,
  Plus,
  PencilSimple,
  Check,
  Trash,
  ArrowCounterClockwise,
  LockSimple,
  LockSimpleOpen,
  MagnifyingGlass,
  Stamp,
  Warning,
  User,
} from '@phosphor-icons/react'
import { t } from '@/i18n'

interface ClientAuditTabProps {
  clientId: string
}

const formatDateTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t('common.justNow')
  if (diffMins < 60) return `${diffMins} ${t('common.minutesAgo')}`
  if (diffHours < 24) return `${diffHours} ${t('common.hoursAgo')}`
  if (diffDays < 7) return `${diffDays} ${t('common.daysAgo')}`
  
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

const ActionIcon = ({ action }: { action: string }) => {
  switch (action) {
    case 'CREATE':
      return <Plus size={16} weight="bold" className="text-green-600" />
    case 'UPDATE':
      return <PencilSimple size={16} weight="bold" className="text-blue-600" />
    case 'POST':
      return <Check size={16} weight="bold" className="text-green-600" />
    case 'DELETE':
      return <Trash size={16} weight="bold" className="text-red-600" />
    case 'REVERSE':
      return <ArrowCounterClockwise size={16} weight="bold" className="text-amber-600" />
    case 'LOCK_PERIOD':
      return <LockSimple size={16} weight="bold" className="text-purple-600" />
    case 'UNLOCK_PERIOD':
      return <LockSimpleOpen size={16} weight="bold" className="text-purple-600" />
    case 'START_REVIEW':
      return <MagnifyingGlass size={16} weight="bold" className="text-blue-600" />
    case 'FINALIZE_PERIOD':
      return <Stamp size={16} weight="bold" className="text-indigo-600" />
    default:
      return <ClockCounterClockwise size={16} className="text-gray-600" />
  }
}

const ActionBadge = ({ action }: { action: string }) => {
  const getColor = () => {
    switch (action) {
      case 'CREATE':
        return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30'
      case 'UPDATE':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
      case 'POST':
        return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30'
      case 'DELETE':
        return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30'
      case 'REVERSE':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
      case 'LOCK_PERIOD':
      case 'UNLOCK_PERIOD':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30'
      case 'START_REVIEW':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
      case 'FINALIZE_PERIOD':
        return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30'
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/30'
    }
  }

  const getLabel = () => {
    // Try to get translation, fallback to action name
    const key = `audit.actions.${action}` as any
    const translated = t(key)
    return translated !== key ? translated : action
  }

  return (
    <Badge variant="outline" className={getColor()}>
      <ActionIcon action={action} />
      <span className="ml-1">{getLabel()}</span>
    </Badge>
  )
}

const ALL_ACTIONS: AuditLogAction[] = [
  'CREATE', 'UPDATE', 'POST', 'DELETE', 'REVERSE',
  'LOCK_PERIOD', 'UNLOCK_PERIOD', 'START_REVIEW', 'FINALIZE_PERIOD'
]

export const ClientAuditTab = ({ clientId }: ClientAuditTabProps) => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState<string>('ALL')
  const [entityFilter, setEntityFilter] = useState<string>('ALL')
  const [totalCount, setTotalCount] = useState(0)
  const showSkeleton = useDelayedLoading(isLoading, 300, entries.length > 0)

  const fetchEntries = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const options: { action?: string; entityType?: string; limit: number } = { limit: 100 }
      if (actionFilter !== 'ALL') {
        options.action = actionFilter
      }
      if (entityFilter !== 'ALL') {
        options.entityType = entityFilter
      }
      
      const response = await bookkeepingApi.listAuditLog(clientId, options)
      setEntries(response.entries)
      setTotalCount(response.total_count)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (clientId) {
      fetchEntries()
    }
  }, [clientId, actionFilter, entityFilter])

  if (isLoading && showSkeleton) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-64" />
                  <Skeleton className="h-4 w-32 mt-1" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <Warning size={18} />
        <AlertTitle>{t('errors.loadFailed')}</AlertTitle>
        <AlertDescription>
          {error}
          <Button onClick={fetchEntries} variant="outline" size="sm" className="mt-2">
            {t('common.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClockCounterClockwise size={24} weight="duotone" className="text-primary" />
              {t('audit.title')}
            </CardTitle>
            <CardDescription>
              {t('audit.subtitle')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('audit.filterByAction')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('audit.allActions')}</SelectItem>
                {ALL_ACTIONS.map((action) => (
                  <SelectItem key={action} value={action}>
                    {t(`audit.actions.${action}` as any) || action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('audit.filterByEntity')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('audit.allEntities')}</SelectItem>
                <SelectItem value="journal_entry">{t('audit.entityTypes.journal_entry')}</SelectItem>
                <SelectItem value="period">{t('audit.entityTypes.period')}</SelectItem>
                <SelectItem value="document">{t('audit.entityTypes.document')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="text-center py-12">
            <ClockCounterClockwise size={64} className="mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold mb-2">{t('audit.noEntries')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('audit.noEntriesDescription')}
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {/* Timeline */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
              
              {entries.map((entry, index) => (
                <div key={entry.id} className="relative flex gap-4 pb-6">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background border-2 border-border">
                    <ActionIcon action={entry.action} />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 pt-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <ActionBadge action={entry.action} />
                          {entry.entity_type && (
                            <Badge variant="outline" className="text-xs">
                              {t(`audit.entityTypes.${entry.entity_type}` as any) || entry.entity_type}
                            </Badge>
                          )}
                        </div>
                        {entry.entity_description && (
                          <p className="text-sm font-medium">{entry.entity_description}</p>
                        )}
                        {entry.actor_name && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <User size={14} />
                            {entry.actor_name}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-muted-foreground">
                          {formatRelativeTime(entry.created_at)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(entry.created_at)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Payload preview (if present) */}
                    {entry.payload && Object.keys(entry.payload).length > 0 && (
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono text-muted-foreground">
                        {Object.entries(entry.payload).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-semibold">{key}:</span> {String(value)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {totalCount > entries.length && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {entries.length} {t('common.showingOf')} {totalCount} {t('common.showing')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default ClientAuditTab
