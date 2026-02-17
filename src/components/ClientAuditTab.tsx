/**
 * Client Audit Tab
 * 
 * Displays comprehensive audit log for the client with:
 * - Timeline of all actions across all entities
 * - Filters: date range, action type, entity type, entity ID, user role
 * - Diff view (old_value/new_value) collapsible
 * - Mobile-friendly cards
 * 
 * All UI text is Dutch (nl.ts).
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { 
  accountantApi, 
  ComprehensiveAuditLogEntry,
  ComprehensiveAuditLogFilters,
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
  CaretDown,
  CaretRight,
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

const ALL_ACTIONS: string[] = [
  'create', 'update', 'delete', 'validate', 'finalize', 'post', 'reverse',
  'lock_period', 'unlock_period', 'start_review', 'finalize_period'
]

const USER_ROLES = ['zzp', 'accountant', 'system', 'admin']

export const ClientAuditTab = ({ clientId }: ClientAuditTabProps) => {
  const [entries, setEntries] = useState<ComprehensiveAuditLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState<string>('ALL')
  const [entityFilter, setEntityFilter] = useState<string>('ALL')
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [entityIdFilter, setEntityIdFilter] = useState<string>('')
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())
  const showSkeleton = useDelayedLoading(isLoading, 300, entries.length > 0)

  // Check for URL parameters on mount to pre-filter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const entityId = params.get('entity_id')
    const entityType = params.get('entity_type')
    
    if (entityId) {
      setEntityIdFilter(entityId)
    }
    if (entityType) {
      setEntityFilter(entityType)
    }
  }, [])

  const toggleExpanded = (entryId: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  const fetchEntries = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const filters: ComprehensiveAuditLogFilters = { page, page_size: pageSize }
      
      if (actionFilter !== 'ALL') {
        filters.action = actionFilter
      }
      if (entityFilter !== 'ALL') {
        filters.entity_type = entityFilter
      }
      if (userRoleFilter !== 'ALL') {
        filters.user_role = userRoleFilter
      }
      if (dateFrom) {
        filters.date_from = dateFrom
      }
      if (dateTo) {
        filters.date_to = dateTo
      }
      if (entityIdFilter.trim()) {
        filters.entity_id = entityIdFilter.trim()
      }
      
      const response = await accountantApi.getClientAuditLogs(clientId, filters)
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
  }, [clientId, actionFilter, entityFilter, userRoleFilter, dateFrom, dateTo, entityIdFilter, page])

  if (showSkeleton) {
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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClockCounterClockwise size={24} weight="duotone" className="text-primary" />
              {t('audit.title')}
            </CardTitle>
            <CardDescription>
              {t('audit.subtitle')}
            </CardDescription>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
          {/* Date From */}
          <div className="space-y-2">
            <Label htmlFor="date-from" className="text-xs">{t('audit.dateFrom')}</Label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              className="text-sm"
            />
          </div>

          {/* Date To */}
          <div className="space-y-2">
            <Label htmlFor="date-to" className="text-xs">{t('audit.dateTo')}</Label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              className="text-sm"
            />
          </div>

          {/* Action Filter */}
          <div className="space-y-2">
            <Label className="text-xs">{t('audit.action')}</Label>
            <Select value={actionFilter} onValueChange={(val) => { setActionFilter(val); setPage(1) }}>
              <SelectTrigger>
                <SelectValue placeholder={t('audit.allActions')} />
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
          </div>

          {/* Entity Type Filter */}
          <div className="space-y-2">
            <Label className="text-xs">{t('audit.entityTypeLabel')}</Label>
            <Select value={entityFilter} onValueChange={(val) => { setEntityFilter(val); setPage(1) }}>
              <SelectTrigger>
                <SelectValue placeholder={t('audit.allTypes')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('audit.allTypes')}</SelectItem>
                <SelectItem value="invoice">{t('audit.entityTypes.invoice')}</SelectItem>
                <SelectItem value="expense">{t('audit.entityTypes.expense')}</SelectItem>
                <SelectItem value="journal_entry">{t('audit.entityTypes.journal_entry')}</SelectItem>
                <SelectItem value="period">{t('audit.entityTypes.period')}</SelectItem>
                <SelectItem value="document">{t('audit.entityTypes.document')}</SelectItem>
                <SelectItem value="vat_submission">{t('audit.entityTypes.vat_submission')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User Role Filter */}
          <div className="space-y-2">
            <Label className="text-xs">{t('audit.userRole')}</Label>
            <Select value={userRoleFilter} onValueChange={(val) => { setUserRoleFilter(val); setPage(1) }}>
              <SelectTrigger>
                <SelectValue placeholder={t('audit.allRoles')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('audit.allRoles')}</SelectItem>
                {USER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entity ID Filter */}
          <div className="space-y-2">
            <Label htmlFor="entity-id" className="text-xs">{t('audit.entityId')}</Label>
            <Input
              id="entity-id"
              placeholder="UUID filter..."
              value={entityIdFilter}
              onChange={(e) => {
                setEntityIdFilter(e.target.value)
                setPage(1)
              }}
              className="text-sm font-mono"
            />
          </div>

          {/* Clear Filters Button */}
          <div className="space-y-2 flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActionFilter('ALL')
                setEntityFilter('ALL')
                setUserRoleFilter('ALL')
                setDateFrom('')
                setDateTo('')
                setEntityIdFilter('')
                setPage(1)
              }}
              className="w-full"
            >
              {t('audit.clearFilters')}
            </Button>
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
              <div className="absolute left-5 top-0 bottom-0 w-px bg-border hidden sm:block" />
              
              {entries.map((entry) => {
                const isExpanded = expandedEntries.has(entry.id)
                const hasDiff = entry.old_value || entry.new_value
                
                return (
                  <div key={entry.id} className="relative flex gap-4 pb-6">
                    {/* Timeline dot - hidden on mobile for cleaner view */}
                    <div className="relative z-10 hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background border-2 border-border">
                      <ActionIcon action={entry.action} />
                    </div>
                    
                    {/* Content - full width on mobile */}
                    <div className="flex-1 pt-1 sm:pt-0">
                      <Card className="border-l-4 border-l-primary/20">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between flex-wrap gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <ActionBadge action={entry.action} />
                                {entry.entity_type && (
                                  <Badge variant="outline" className="text-xs">
                                    {entry.entity_type}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {entry.user_role}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground truncate" title={entry.entity_id}>
                                ID: {entry.entity_id}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium text-muted-foreground">
                                {formatRelativeTime(entry.created_at)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(entry.created_at)}
                              </p>
                            </div>
                          </div>
                          
                          {/* Diff view (collapsible) */}
                          {hasDiff && (
                            <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(entry.id)}>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="mt-2 w-full justify-start gap-2">
                                  {isExpanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
                                  {t('audit.viewChanges')}
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-2">
                                {entry.old_value && (
                                  <div className="p-3 bg-red-500/10 rounded border border-red-500/20">
                                    <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">{t('audit.oldValue')}:</p>
                                    <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
                                      {JSON.stringify(entry.old_value, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {entry.new_value && (
                                  <div className="p-3 bg-green-500/10 rounded border border-green-500/20">
                                    <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2">{t('audit.newValue')}:</p>
                                    <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
                                      {JSON.stringify(entry.new_value, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        
        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
            <div className="text-sm text-muted-foreground">
              {t('audit.totalItems')} {totalCount} • {t('audit.page')} {page} {t('audit.of')} {Math.ceil(totalCount / pageSize)}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                {t('common.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(totalCount / pageSize)}
                onClick={() => setPage(page + 1)}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default ClientAuditTab
