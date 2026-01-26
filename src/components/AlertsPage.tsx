/**
 * Alerts Dashboard Page
 * 
 * Displays active alerts for accountants:
 * - Grouped by severity (CRITICAL, WARNING, INFO)
 * - Link to underlying issue/document/period
 * - Acknowledge and resolve workflows
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Alert as AlertComponent, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/lib/AuthContext'
import { 
  observabilityApi,
  Alert,
  AlertGroupedResponse,
  AlertSeverity_Ops,
  getErrorMessage 
} from '@/lib/api'
import { 
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  Warning,
  Info,
  Eye,
  Check,
  X,
  Bell,
  BellSlash,
  Clock,
  Link as LinkIcon
} from '@phosphor-icons/react'
import { format, formatDistanceToNow } from 'date-fns'

// Severity display configuration
const severityConfig: Record<AlertSeverity_Ops, { 
  bg: string
  text: string
  border: string
  icon: typeof WarningCircle
  label: string
}> = {
  CRITICAL: { 
    bg: 'bg-red-500/20', 
    text: 'text-red-700 dark:text-red-400', 
    border: 'border-red-500/40',
    icon: WarningCircle,
    label: 'Critical'
  },
  WARNING: { 
    bg: 'bg-amber-500/20', 
    text: 'text-amber-700 dark:text-amber-400', 
    border: 'border-amber-500/40',
    icon: Warning,
    label: 'Warning'
  },
  INFO: { 
    bg: 'bg-blue-500/20', 
    text: 'text-blue-700 dark:text-blue-400', 
    border: 'border-blue-500/40',
    icon: Info,
    label: 'Info'
  },
}

// Alert card component
const AlertCard = ({ 
  alert, 
  onAcknowledge, 
  onResolve,
  onViewDetails,
}: { 
  alert: Alert
  onAcknowledge: (alert: Alert) => void
  onResolve: (alert: Alert) => void
  onViewDetails: (alert: Alert) => void
}) => {
  const config = severityConfig[alert.severity]
  const Icon = config.icon
  const isAcknowledged = !!alert.acknowledged_at
  
  return (
    <div className={`p-4 rounded-lg ${config.bg} border ${config.border} mb-3`}>
      <div className="flex items-start gap-3">
        <Icon size={24} weight="fill" className={config.text} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={`${config.bg} ${config.text} ${config.border} text-xs`}>
              {alert.alert_code.replace(/_/g, ' ')}
            </Badge>
            {isAcknowledged && (
              <Badge variant="outline" className="text-xs bg-muted">
                <Eye size={12} className="mr-1" />
                Acknowledged
              </Badge>
            )}
          </div>
          <h4 className={`font-semibold ${config.text}`}>{alert.title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
          
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
            </span>
            {alert.entity_type && (
              <span className="flex items-center gap-1">
                <LinkIcon size={14} />
                {alert.entity_type}
              </span>
            )}
          </div>
          
          <div className="flex gap-2 mt-3">
            {!isAcknowledged && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onAcknowledge(alert)}
              >
                <Eye size={14} className="mr-1" />
                Acknowledge
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onResolve(alert)}
            >
              <Check size={14} className="mr-1" />
              Resolve
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => onViewDetails(alert)}
            >
              <Info size={14} className="mr-1" />
              Details
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Alert details dialog
const AlertDetailsDialog = ({
  alert,
  isOpen,
  onClose,
  onResolve,
}: {
  alert: Alert | null
  isOpen: boolean
  onClose: () => void
  onResolve: (notes: string) => void
}) => {
  const [notes, setNotes] = useState('')
  const [isResolving, setIsResolving] = useState(false)
  
  if (!alert) return null
  
  const config = severityConfig[alert.severity]
  const Icon = config.icon
  
  const handleResolve = async () => {
    setIsResolving(true)
    await onResolve(notes)
    setIsResolving(false)
    setNotes('')
  }
  
  // Parse context if available
  let context: Record<string, unknown> | null = null
  if (alert.context) {
    try {
      context = JSON.parse(alert.context)
    } catch {
      // Ignore parse errors
    }
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon size={24} className={config.text} weight="fill" />
            Alert Details
          </DialogTitle>
          <DialogDescription>
            {alert.alert_code.replace(/_/g, ' ')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-1">{alert.title}</h4>
            <p className="text-sm text-muted-foreground">{alert.message}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Created:</span>
              <p>{format(new Date(alert.created_at), 'PPpp')}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Severity:</span>
              <p className={config.text}>{config.label}</p>
            </div>
            {alert.acknowledged_at && (
              <div>
                <span className="text-muted-foreground">Acknowledged:</span>
                <p>{format(new Date(alert.acknowledged_at), 'PPpp')}</p>
              </div>
            )}
            {alert.entity_type && (
              <div>
                <span className="text-muted-foreground">Related Entity:</span>
                <p>{alert.entity_type} ({alert.entity_id?.slice(0, 8)}...)</p>
              </div>
            )}
          </div>
          
          {context && (
            <div>
              <span className="text-sm text-muted-foreground">Additional Context:</span>
              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                {JSON.stringify(context, null, 2)}
              </pre>
            </div>
          )}
          
          {!alert.resolved_at && (
            <div>
              <label className="text-sm text-muted-foreground">Resolution Notes (optional):</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter notes about how this alert was resolved..."
                className="mt-1"
              />
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {!alert.resolved_at && (
            <Button onClick={handleResolve} disabled={isResolving}>
              <Check size={14} className="mr-1" />
              {isResolving ? 'Resolving...' : 'Resolve Alert'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const AlertsPage = () => {
  const { user } = useAuth()
  const [alertsData, setAlertsData] = useState<AlertGroupedResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  
  // Dialog state
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  
  // Active tab
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | 'warning' | 'info'>('all')

  const fetchAlerts = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await observabilityApi.getAlertsGrouped()
      setAlertsData(data)
      setLastRefresh(new Date())
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      console.error('Failed to fetch alerts:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts()
  }, [])

  const handleAcknowledge = async (alert: Alert) => {
    try {
      await observabilityApi.acknowledgeAlert(alert.id)
      await fetchAlerts()
    } catch (err) {
      console.error('Failed to acknowledge alert:', err)
    }
  }

  const handleResolve = async (alert: Alert) => {
    setSelectedAlert(alert)
    setIsDetailsOpen(true)
  }

  const handleResolveConfirm = async (notes: string) => {
    if (!selectedAlert) return
    
    try {
      await observabilityApi.resolveAlert(selectedAlert.id, notes || undefined)
      setIsDetailsOpen(false)
      setSelectedAlert(null)
      await fetchAlerts()
    } catch (err) {
      console.error('Failed to resolve alert:', err)
    }
  }

  const handleViewDetails = (alert: Alert) => {
    setSelectedAlert(alert)
    setIsDetailsOpen(true)
  }

  const handleCloseDetails = () => {
    setIsDetailsOpen(false)
    setSelectedAlert(null)
  }

  // Check if user is accountant
  if (user?.role !== 'accountant' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-7xl mx-auto">
          <AlertComponent className="bg-amber-500/10 border-amber-500/40">
            <Warning className="h-5 w-5 text-amber-600" />
            <AlertTitle>Access Restricted</AlertTitle>
            <AlertDescription>
              This page is only available for accountants.
            </AlertDescription>
          </AlertComponent>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-7xl mx-auto">
          <AlertComponent className="bg-destructive/10 border-destructive/40">
            <WarningCircle className="h-5 w-5 text-destructive" />
            <AlertDescription className="ml-2">
              <div className="font-semibold mb-2">Failed to load alerts</div>
              <div className="text-sm text-muted-foreground mb-4">{error}</div>
              <Button onClick={fetchAlerts} size="sm" variant="outline">
                <ArrowsClockwise size={16} className="mr-2" />
                Retry
              </Button>
            </AlertDescription>
          </AlertComponent>
        </div>
      </div>
    )
  }

  const allAlerts = alertsData 
    ? [...alertsData.critical, ...alertsData.warning, ...alertsData.info]
    : []

  const getAlertsForTab = () => {
    if (!alertsData) return []
    switch (activeTab) {
      case 'critical': return alertsData.critical
      case 'warning': return alertsData.warning
      case 'info': return alertsData.info
      default: return allAlerts
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1 flex items-center gap-2">
              <Bell size={32} />
              Alerts
            </h1>
            <p className="text-muted-foreground">
              {alertsData?.counts.total || 0} active alerts
            </p>
          </div>
          <div className="text-right">
            <Button onClick={fetchAlerts} variant="outline" size="sm" disabled={isLoading}>
              <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Updated: {format(lastRefresh, 'HH:mm:ss')}
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className={`bg-card/80 backdrop-blur-sm border-2 ${alertsData?.counts.critical ? 'border-red-500/40' : 'border-muted'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <WarningCircle size={18} weight="fill" className="text-red-500" />
                Critical
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                  {alertsData?.counts.critical || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`bg-card/80 backdrop-blur-sm border-2 ${alertsData?.counts.warning ? 'border-amber-500/40' : 'border-muted'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Warning size={18} weight="fill" className="text-amber-500" />
                Warning
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                  {alertsData?.counts.warning || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`bg-card/80 backdrop-blur-sm border-2 ${alertsData?.counts.info ? 'border-blue-500/40' : 'border-muted'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Info size={18} weight="fill" className="text-blue-500" />
                Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {alertsData?.counts.info || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-green-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle size={18} weight="fill" className="text-green-500" />
                All Clear
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : alertsData?.counts.total === 0 ? (
                <div className="text-xl font-bold text-green-600 dark:text-green-400">
                  ✓ No Alerts
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {alertsData?.counts.total || 0} pending
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alerts List */}
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell size={24} />
              Active Alerts
            </CardTitle>
            <CardDescription>
              Alerts requiring attention, grouped by severity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">
                  All ({alertsData?.counts.total || 0})
                </TabsTrigger>
                <TabsTrigger value="critical" className="text-red-600 dark:text-red-400">
                  Critical ({alertsData?.counts.critical || 0})
                </TabsTrigger>
                <TabsTrigger value="warning" className="text-amber-600 dark:text-amber-400">
                  Warning ({alertsData?.counts.warning || 0})
                </TabsTrigger>
                <TabsTrigger value="info" className="text-blue-600 dark:text-blue-400">
                  Info ({alertsData?.counts.info || 0})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value={activeTab}>
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                ) : getAlertsForTab().length > 0 ? (
                  <div>
                    {getAlertsForTab().map((alert) => (
                      <AlertCard
                        key={alert.id}
                        alert={alert}
                        onAcknowledge={handleAcknowledge}
                        onResolve={handleResolve}
                        onViewDetails={handleViewDetails}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <BellSlash size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No {activeTab === 'all' ? '' : activeTab} alerts</p>
                    <p className="text-sm mt-2">
                      {activeTab === 'all' 
                        ? 'All systems are operating normally'
                        : `No ${activeTab} level alerts at this time`}
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Alert Details Dialog */}
        <AlertDetailsDialog
          alert={selectedAlert}
          isOpen={isDetailsOpen}
          onClose={handleCloseDetails}
          onResolve={handleResolveConfirm}
        />
      </div>
    </div>
  )
}
