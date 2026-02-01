/**
 * AccountantClientsPage - Manage client links with consent workflow
 * 
 * Features:
 * - View all client links (ACTIVE, PENDING, REVOKED)
 * - Tabs: "Actief" and "In afwachting"
 * - Invite new clients via email
 * - Select client to set as active
 * - Navigate to client dossier
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { accountantApi, ClientLink, getErrorMessage } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import {
  Plus,
  UserPlus,
  CheckCircle,
  Clock,
  XCircle,
  CaretRight,
  Envelope,
  User,
  WarningCircle,
  Warning,
  UsersThree,
  FolderOpen,
} from '@phosphor-icons/react'

// Status badge colors
const statusStyles: Record<string, { bg: string; text: string; border: string }> = {
  ACTIVE: { 
    bg: 'bg-green-500/20', 
    text: 'text-green-700 dark:text-green-400', 
    border: 'border-green-500/40' 
  },
  PENDING: { 
    bg: 'bg-amber-500/20', 
    text: 'text-amber-700 dark:text-amber-400', 
    border: 'border-amber-500/40' 
  },
  REVOKED: { 
    bg: 'bg-gray-500/20', 
    text: 'text-gray-700 dark:text-gray-400', 
    border: 'border-gray-500/40' 
  },
}

const StatusBadge = ({ status }: { status: string }) => {
  const styles = statusStyles[status] || statusStyles.PENDING
  const statusLabels: Record<string, string> = {
    ACTIVE: t('accountantClients.statusActive'),
    PENDING: t('accountantClients.statusPending'),
    REVOKED: t('accountantClients.statusRevoked'),
  }
  
  return (
    <Badge 
      variant="outline" 
      className={`${styles.bg} ${styles.text} ${styles.border} font-medium`}
    >
      {status === 'ACTIVE' && <CheckCircle size={14} className="mr-1" weight="fill" />}
      {status === 'PENDING' && <Clock size={14} className="mr-1" weight="fill" />}
      {status === 'REVOKED' && <XCircle size={14} className="mr-1" weight="fill" />}
      {statusLabels[status] || status}
    </Badge>
  )
}

// Client card component
const ClientCard = ({ 
  link, 
  onSelect, 
  onOpenDossier,
  isSelected,
}: { 
  link: ClientLink
  onSelect: () => void
  onOpenDossier: () => void
  isSelected: boolean
}) => {
  const isActive = link.status === 'ACTIVE'
  const isPending = link.status === 'PENDING'
  const isRevoked = link.status === 'REVOKED'
  
  return (
    <Card className={`${isSelected ? 'ring-2 ring-primary' : ''} ${isRevoked ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Client info */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User size={20} className="text-primary" weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base truncate">
                  {link.client_name || link.client_email}
                </h3>
                <StatusBadge status={link.status} />
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {link.client_email}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {link.administration_name}
              </p>
              
              {/* Issue counts for active clients */}
              {isActive && (link.open_red_count > 0 || link.open_yellow_count > 0) && (
                <div className="flex gap-2 mt-2">
                  {link.open_red_count > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      <WarningCircle size={12} className="mr-1" />
                      {link.open_red_count} {t('accountantClients.redIssues')}
                    </Badge>
                  )}
                  {link.open_yellow_count > 0 && (
                    <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-400">
                      <Warning size={12} className="mr-1" />
                      {link.open_yellow_count} {t('accountantClients.yellowIssues')}
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Pending state message */}
              {isPending && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                  <Clock size={12} />
                  {t('accountantClients.awaitingApproval')}
                </p>
              )}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-2 sm:flex-col">
            {isActive && (
              <>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={onSelect}
                  className="flex-1 sm:flex-none"
                >
                  <CheckCircle size={16} className="mr-1" />
                  {t('accountantClients.select')}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onOpenDossier}
                  className="flex-1 sm:flex-none"
                >
                  <FolderOpen size={16} className="mr-1" />
                  {t('accountantClients.openDossier')}
                </Button>
              </>
            )}
            {isPending && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                <Clock size={14} className="mr-1" />
                {t('accountantClients.awaitingApproval')}
              </Badge>
            )}
            {isRevoked && (
              <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/30">
                <XCircle size={14} className="mr-1" />
                {t('accountantClients.statusRevoked')}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Invite dialog component
const InviteClientDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (status: string) => void
}) => {
  const [email, setEmail] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleInvite = async () => {
    // Validate email
    if (!email || !email.includes('@')) {
      setError(t('inviteDialog.errorInvalidEmail'))
      return
    }

    setError(null)
    setIsInviting(true)

    try {
      const result = await accountantApi.inviteClient({ email })
      
      // Show success message based on status
      if (result.status === 'PENDING') {
        toast.success(t('inviteDialog.successNewPending'))
      } else if (result.status === 'ACTIVE') {
        toast.success(t('inviteDialog.successAlreadyActive'))
      }
      
      // Reset form and close
      setEmail('')
      onOpenChange(false)
      onSuccess(result.status)
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      
      // Map backend errors to Dutch messages
      if (errorMessage.includes('not found') || errorMessage.includes('USER_NOT_FOUND')) {
        setError(t('inviteDialog.errorUserNotFound'))
      } else if (errorMessage.includes('not a ZZP') || errorMessage.includes('NOT_ZZP_USER')) {
        setError(t('inviteDialog.errorNotZzp'))
      } else if (errorMessage.includes('no administration') || errorMessage.includes('NO_ADMINISTRATION')) {
        setError(t('inviteDialog.errorNoAdministration'))
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsInviting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={24} className="text-primary" />
            {t('inviteDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('inviteDialog.description')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="client-email">{t('inviteDialog.emailLabel')}</Label>
            <div className="relative">
              <Envelope className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                id="client-email"
                type="email"
                placeholder={t('inviteDialog.emailPlaceholder')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
                className="pl-10"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isInviting) {
                    handleInvite()
                  }
                }}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <WarningCircle size={14} />
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isInviting}
          >
            {t('inviteDialog.cancel')}
          </Button>
          <Button 
            onClick={handleInvite} 
            disabled={isInviting || !email}
          >
            {isInviting ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                {t('inviteDialog.inviting')}
              </>
            ) : (
              <>
                <UserPlus size={16} className="mr-2" />
                {t('inviteDialog.invite')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Empty state component
const EmptyState = ({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) => (
  <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
      <UsersThree size={64} weight="duotone" className="text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="gap-2">
          <Plus size={18} />
          {actionLabel}
        </Button>
      )}
    </CardContent>
  </Card>
)

// Loading skeleton
const LoadingSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <Card key={i}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
)

export const AccountantClientsPage = () => {
  const { 
    allLinks, 
    activeClient, 
    setActiveClient, 
    refreshLinks, 
    isLoading,
    pendingCount,
  } = useActiveClient()
  
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('active')

  // Filter links by status
  const activeLinks = allLinks.filter(link => link.status === 'ACTIVE')
  const pendingLinks = allLinks.filter(link => link.status === 'PENDING')

  // Handle client selection
  const handleSelectClient = (link: ClientLink) => {
    setActiveClient({
      id: link.client_user_id,
      name: link.client_name,
      email: link.client_email,
      administrationId: link.administration_id,
      administrationName: link.administration_name,
    })
    
    // Navigate to review queue after selection
    navigateTo('/accountant/review-queue')
  }

  // Handle open dossier
  const handleOpenDossier = (link: ClientLink) => {
    // Set as active client if not already
    if (!activeClient || activeClient.id !== link.client_user_id) {
      setActiveClient({
        id: link.client_user_id,
        name: link.client_name,
        email: link.client_email,
        administrationId: link.administration_id,
        administrationName: link.administration_name,
      })
    }
    
    // Navigate to client dossier
    navigateTo(`/accountant/clients/${link.administration_id}/issues`)
  }

  // Handle invite success
  const handleInviteSuccess = (status: string) => {
    refreshLinks()
    
    // Switch to pending tab if new invite is pending
    if (status === 'PENDING') {
      setActiveTab('pending')
    }
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t('accountantClients.title')}</h1>
          <p className="text-muted-foreground">
            {activeLinks.length} {t('accountantClients.statusActive').toLowerCase()}, {pendingLinks.length} {t('accountantClients.statusPending').toLowerCase()}
          </p>
        </div>
        <Button onClick={() => setIsInviteOpen(true)} className="gap-2">
          <Plus size={18} />
          {t('accountantClients.addClient')}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="active" className="gap-2">
            <CheckCircle size={16} />
            {t('accountantClients.tabActive')}
            {activeLinks.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeLinks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            <Clock size={16} />
            {t('accountantClients.tabPending')}
            {pendingLinks.length > 0 && (
              <Badge variant="secondary" className="ml-1 bg-amber-500/20 text-amber-700 dark:text-amber-400">
                {pendingLinks.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Active clients tab */}
        <TabsContent value="active" className="mt-0">
          {isLoading ? (
            <LoadingSkeleton />
          ) : activeLinks.length === 0 ? (
            <EmptyState
              title={t('accountantClients.noActiveClients')}
              description={t('accountantClients.noActiveClientsDescription')}
              actionLabel={t('accountantClients.addClient')}
              onAction={() => setIsInviteOpen(true)}
            />
          ) : (
            <div className="space-y-3">
              {activeLinks.map((link) => (
                <ClientCard
                  key={link.assignment_id}
                  link={link}
                  onSelect={() => handleSelectClient(link)}
                  onOpenDossier={() => handleOpenDossier(link)}
                  isSelected={activeClient?.id === link.client_user_id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Pending clients tab */}
        <TabsContent value="pending" className="mt-0">
          {isLoading ? (
            <LoadingSkeleton />
          ) : pendingLinks.length === 0 ? (
            <EmptyState
              title={t('accountantClients.noPendingClients')}
              description={t('accountantClients.noPendingClientsDescription')}
            />
          ) : (
            <div className="space-y-3">
              {pendingLinks.map((link) => (
                <ClientCard
                  key={link.assignment_id}
                  link={link}
                  onSelect={() => {}}
                  onOpenDossier={() => {}}
                  isSelected={false}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Invite dialog */}
      <InviteClientDialog
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
        onSuccess={handleInviteSuccess}
      />
    </div>
  )
}

export default AccountantClientsPage
