/**
 * Accountant Master Dashboard
 * 
 * Design Principles:
 * - All clients in ONE screen
 * - Error-driven, not data-driven
 * - Accountant only clicks when there's a problem
 * - Status: GREEN (no action), YELLOW (attention soon), RED (immediate action)
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/AuthContext'
import { 
  accountantDashboardApi, 
  accountantClientApi,
  AccountantDashboardResponse, 
  ClientOverview, 
  DashboardIssue,
  ClientIssuesResponse,
  ClientStatus,
  IssueSeverity,
  BTWQuarterStatus,
  AccountantClientListItem,
  getErrorMessage 
} from '@/lib/api'
import { 
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  Warning,
  CaretRight,
  Users,
  FileX,
  ClockCountdown,
  Eye,
  Plus,
  EnvelopeSimple,
  UserPlus,
} from '@phosphor-icons/react'
import { format, formatDistanceToNow } from 'date-fns'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'

// Status indicator colors
const statusColors: Record<ClientStatus, { bg: string; text: string; border: string }> = {
  GREEN: { bg: 'bg-green-500/20', text: 'text-green-700 dark:text-green-400', border: 'border-green-500/40' },
  YELLOW: { bg: 'bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-500/40' },
  RED: { bg: 'bg-red-500/20', text: 'text-red-700 dark:text-red-400', border: 'border-red-500/40' },
}

const severityColors: Record<IssueSeverity, { bg: string; text: string; border: string; icon: typeof WarningCircle }> = {
  ERROR: { bg: 'bg-red-500/20', text: 'text-red-700 dark:text-red-400', border: 'border-red-500/30', icon: WarningCircle },
  WARNING: { bg: 'bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-500/30', icon: Warning },
  INFO: { bg: 'bg-blue-500/20', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-500/30', icon: CheckCircle },
}

const btwStatusLabels: Record<BTWQuarterStatus, { label: string; color: string }> = {
  ON_TRACK: { label: t('vat.onTrack'), color: 'text-green-600 dark:text-green-400' },
  PENDING_DOCS: { label: t('vat.pendingDocs'), color: 'text-amber-600 dark:text-amber-400' },
  DEADLINE_APPROACHING: { label: t('vat.deadlineApproaching'), color: 'text-orange-600 dark:text-orange-400' },
  OVERDUE: { label: t('vat.overdue'), color: 'text-red-600 dark:text-red-400' },
  NOT_APPLICABLE: { label: t('vat.notApplicable'), color: 'text-gray-500' },
}

// Status badge component
const StatusBadge = ({ status }: { status: ClientStatus }) => {
  const colors = statusColors[status]
  return (
    <Badge 
      variant="outline" 
      className={`${colors.bg} ${colors.text} ${colors.border} font-semibold`}
    >
      {status === 'GREEN' && <CheckCircle size={14} className="mr-1" weight="fill" />}
      {status === 'YELLOW' && <Warning size={14} className="mr-1" weight="fill" />}
      {status === 'RED' && <WarningCircle size={14} className="mr-1" weight="fill" />}
      {status}
    </Badge>
  )
}

// Issue item component
const IssueItem = ({ issue }: { issue: DashboardIssue }) => {
  const severity = severityColors[issue.severity]
  const Icon = severity.icon
  
  return (
    <div className={`p-3 rounded-lg ${severity.bg} border ${severity.border}`}>
      <div className="flex items-start gap-3">
        <Icon size={20} weight="fill" className={severity.text} />
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm ${severity.text}`}>{issue.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{issue.description}</p>
          <p className="text-xs font-medium mt-2">
            <span className="text-muted-foreground">Action:</span> {issue.suggested_action}
          </p>
        </div>
      </div>
    </div>
  )
}

// Client row component
const ClientRow = ({ 
  client, 
  onReviewIssues 
}: { 
  client: ClientOverview
  onReviewIssues: (client: ClientOverview) => void 
}) => {
  return (
    <TableRow className={client.status !== 'GREEN' ? 'bg-muted/30' : ''}>
      <TableCell className="font-medium">
        <div>
          <p className="font-semibold">{client.name}</p>
          {client.kvk_number && (
            <p className="text-xs text-muted-foreground">KVK: {client.kvk_number}</p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={client.status} />
      </TableCell>
      <TableCell>
        {client.last_document_upload ? (
          <span className="text-sm">
            {formatDistanceToNow(new Date(client.last_document_upload), { addSuffix: true })}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{t('accountant.noUploads')}</span>
        )}
      </TableCell>
      <TableCell>
        <div>
          <span className={`text-sm font-medium ${btwStatusLabels[client.btw_quarter_status].color}`}>
            {btwStatusLabels[client.btw_quarter_status].label}
          </span>
          <p className="text-xs text-muted-foreground">{client.current_quarter}</p>
        </div>
      </TableCell>
      <TableCell>
        {client.error_count > 0 || client.warning_count > 0 ? (
          <div className="flex gap-2">
            {client.error_count > 0 && (
              <Badge variant="destructive" className="text-xs">
                {client.error_count} {client.error_count === 1 ? 'fout' : 'fouten'}
              </Badge>
            )}
            {client.warning_count > 0 && (
              <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-400">
                {client.warning_count} {client.warning_count === 1 ? 'waarschuwing' : 'waarschuwingen'}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {client.status !== 'GREEN' ? (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onReviewIssues(client)}
            className="text-xs"
          >
            <Eye size={14} className="mr-1" />
            {t('accountant.reviewIssues')}
            <CaretRight size={14} className="ml-1" />
          </Button>
        ) : (
          <span className="text-sm text-green-600 dark:text-green-400">{t('accountant.ok')}</span>
        )}
      </TableCell>
    </TableRow>
  )
}

export const AccountantDashboard = () => {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState<AccountantDashboardResponse | null>(null)
  const [assignedClients, setAssignedClients] = useState<AccountantClientListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  
  // Issue dialog state
  const [selectedClient, setSelectedClient] = useState<ClientOverview | null>(null)
  const [clientIssues, setClientIssues] = useState<ClientIssuesResponse | null>(null)
  const [isLoadingIssues, setIsLoadingIssues] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  
  // Add client dialog state
  const [isAddClientOpen, setIsAddClientOpen] = useState(false)
  const [newClientEmail, setNewClientEmail] = useState('')
  const [isAddingClient, setIsAddingClient] = useState(false)
  const [addClientError, setAddClientError] = useState<string | null>(null)
  const [addClientSuccess, setAddClientSuccess] = useState<string | null>(null)

  const fetchDashboard = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await accountantDashboardApi.getDashboard()
      setDashboard(data)
      setLastRefresh(new Date())
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      console.error('Failed to fetch dashboard:', err)
    } finally {
      setIsLoading(false)
    }
  }
  
  const fetchAssignedClients = async () => {
    try {
      const data = await accountantClientApi.listClients()
      setAssignedClients(data.clients)
    } catch (err) {
      console.error('Failed to fetch assigned clients:', err)
    }
  }

  const fetchClientIssues = async (clientId: string) => {
    try {
      setIsLoadingIssues(true)
      const data = await accountantDashboardApi.getClientIssues(clientId)
      setClientIssues(data)
    } catch (err) {
      console.error('Failed to fetch client issues:', err)
    } finally {
      setIsLoadingIssues(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
    fetchAssignedClients()
  }, [])

  const handleReviewIssues = async (client: ClientOverview) => {
    setSelectedClient(client)
    setIsDialogOpen(true)
    await fetchClientIssues(client.id)
  }
  
  const handleAddClient = async () => {
    if (!newClientEmail.trim()) return
    
    setIsAddingClient(true)
    setAddClientError(null)
    setAddClientSuccess(null)
    
    try {
      const result = await accountantClientApi.assignByEmail({ client_email: newClientEmail.trim() })
      setAddClientSuccess(`Successfully added ${result.administration_name}`)
      setNewClientEmail('')
      // Refresh both dashboard and clients list
      await fetchDashboard()
      await fetchAssignedClients()
      // Close dialog after short delay to show success message
      setTimeout(() => {
        setIsAddClientOpen(false)
        setAddClientSuccess(null)
      }, SUCCESS_MESSAGE_DISPLAY_MS)
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      // Try to extract code from the error
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const response = (err as { response?: { data?: { detail?: { code?: string, message?: string } | string } } }).response
        const detail = response?.data?.detail
        if (typeof detail === 'object' && detail?.code) {
          switch (detail.code) {
            case 'USER_NOT_FOUND':
              setAddClientError(t('accountant.userNotFound'))
              return
            case 'NOT_ZZP_USER':
              setAddClientError(t('accountant.notZzpUser'))
              return
            case 'NO_ADMINISTRATION':
              setAddClientError(t('accountant.noAdministration'))
              return
          }
        }
      }
      setAddClientError(errorMessage)
    } finally {
      setIsAddingClient(false)
    }
  }
  
  const handleSelectClient = (administrationId: string) => {
    // Store selected client in localStorage for review queue
    localStorage.setItem('selectedClientId', administrationId)
    // Navigate to review queue
    navigateTo('/accountant/review-queue')
  }
  
  // Duration to show success message before closing dialog
  const SUCCESS_MESSAGE_DISPLAY_MS = 2000

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setSelectedClient(null)
    setClientIssues(null)
  }

  // Check if user is accountant
  if (user?.role !== 'accountant' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-7xl mx-auto">
          <Alert className="bg-amber-500/10 border-amber-500/40">
            <Warning className="h-5 w-5 text-amber-600" />
            <AlertTitle>{t('accountant.accessRestricted')}</AlertTitle>
            <AlertDescription>
              {t('accountant.accountantOnly')}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-8">
        <div className="max-w-7xl mx-auto">
          <Alert className="bg-destructive/10 border-destructive/40">
            <WarningCircle className="h-5 w-5 text-destructive" />
            <AlertDescription className="ml-2">
              <div className="font-semibold mb-2">{t('accountant.failedToLoadDashboard')}</div>
              <div className="text-sm text-muted-foreground mb-4">{error}</div>
              <Button onClick={fetchDashboard} size="sm" variant="outline">
                <ArrowsClockwise size={16} className="mr-2" />
                {t('common.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">
              {t('accountant.clientOverview')}
            </h1>
            <p className="text-muted-foreground">
              {dashboard?.total_clients || 0} {t('accountant.clientsCount')} • 
              {dashboard?.clients_needing_attention || 0} {t('accountant.needsAttention')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setIsAddClientOpen(true)} size="sm">
              <UserPlus size={18} className="mr-2" />
              {t('accountant.addClient')}
            </Button>
            <Button onClick={fetchDashboard} variant="outline" size="sm" disabled={isLoading}>
              <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-card/80 backdrop-blur-sm border-2 border-green-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle size={18} weight="fill" className="text-green-500" />
                {t('accountant.noActionNeeded')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {(dashboard?.total_clients || 0) - (dashboard?.clients_needing_attention || 0)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-amber-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Warning size={18} weight="fill" className="text-amber-500" />
                {t('accountant.attentionSoon')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                  {(dashboard?.clients_needing_attention || 0) - (dashboard?.clients_with_errors || 0)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-red-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <WarningCircle size={18} weight="fill" className="text-red-500" />
                {t('accountant.immediateAction')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                  {dashboard?.clients_with_errors || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Client Table */}
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users size={24} />
              {t('accountant.allClients')}
            </CardTitle>
            <CardDescription>
              {t('accountant.sortedByStatus')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : dashboard?.clients && dashboard.clients.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('accountant.client')}</TableHead>
                    <TableHead>{t('accountant.clientStatus')}</TableHead>
                    <TableHead>{t('accountant.lastUpload')}</TableHead>
                    <TableHead>BTW {dashboard.clients[0]?.current_quarter}</TableHead>
                    <TableHead>{t('accountant.issues')}</TableHead>
                    <TableHead>{t('accountant.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.clients.map((client) => (
                    <ClientRow 
                      key={client.id} 
                      client={client} 
                      onReviewIssues={handleReviewIssues}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">{t('accountant.noClients')}</p>
                <p className="text-sm mt-2 mb-4">
                  {t('accountant.noClientsDescription')}
                </p>
                <Button onClick={() => setIsAddClientOpen(true)}>
                  <UserPlus size={18} className="mr-2" />
                  {t('accountant.addFirstClient')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Issues Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedClient && <StatusBadge status={selectedClient.status} />}
                {selectedClient?.name}
              </DialogTitle>
              <DialogDescription>
                {clientIssues?.total_issues || 0} {t('accountant.issuesRequiringAttention')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              {isLoadingIssues ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : clientIssues?.issues && clientIssues.issues.length > 0 ? (
                clientIssues.issues.map((issue) => (
                  <IssueItem key={issue.id} issue={issue} />
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle size={48} className="mx-auto mb-4 text-green-500 opacity-50" />
                  <p>{t('accountant.noIssuesFound')}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <Button variant="outline" onClick={handleCloseDialog}>
                {t('common.close')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        
        {/* Add Client Dialog */}
        <Dialog open={isAddClientOpen} onOpenChange={(open) => {
          setIsAddClientOpen(open)
          if (!open) {
            setNewClientEmail('')
            setAddClientError(null)
            setAddClientSuccess(null)
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus size={20} />
                {t('accountant.addClientByEmail')}
              </DialogTitle>
              <DialogDescription>
                {t('accountant.addClientDescription')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="client-email">{t('accountant.clientEmail')}</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="client-email"
                      type="email"
                      placeholder="klant@email.nl"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      className="pl-9"
                      disabled={isAddingClient}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddClient()
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
              
              {addClientError && (
                <Alert className="bg-destructive/10 border-destructive/40">
                  <WarningCircle className="h-4 w-4" />
                  <AlertDescription className="ml-2">{addClientError}</AlertDescription>
                </Alert>
              )}
              
              {addClientSuccess && (
                <Alert className="bg-green-500/10 border-green-500/40">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="ml-2 text-green-700">{addClientSuccess}</AlertDescription>
                </Alert>
              )}
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsAddClientOpen(false)}
                disabled={isAddingClient}
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleAddClient}
                disabled={isAddingClient || !newClientEmail.trim()}
              >
                {isAddingClient ? (
                  <>
                    <ArrowsClockwise size={16} className="mr-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <Plus size={16} className="mr-2" />
                    {t('accountant.addClient')}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
