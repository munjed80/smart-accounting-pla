/**
 * ClientAccessError - Displays error states for client access issues
 * 
 * Used when:
 * - No client selected
 * - Client access is pending approval
 * - Client access has been revoked
 * - Client not assigned
 * - Scope/permission missing
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import {
  User,
  Clock,
  XCircle,
  UsersThree,
  WarningCircle,
  ArrowRight,
  ShieldSlash,
} from '@phosphor-icons/react'

export type ClientAccessErrorType = 'no_client' | 'pending_approval' | 'access_revoked' | 'not_assigned' | 'scope_missing'

interface ClientAccessErrorProps {
  type: ClientAccessErrorType
  clientName?: string
  missingScope?: string
  onGoToClients?: () => void
}

const errorConfig = {
  no_client: {
    icon: User,
    title: () => t('clientSwitcher.noClientSelected'),
    description: () => t('clientSwitcher.selectClientFirst'),
    variant: 'default' as const,
    iconColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  pending_approval: {
    icon: Clock,
    title: () => t('errors.pendingApproval'),
    description: () => t('errors.pendingApprovalDescription'),
    variant: 'default' as const,
    iconColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  access_revoked: {
    icon: XCircle,
    title: () => t('errors.accessRevoked'),
    description: () => t('errors.accessRevokedDescription'),
    variant: 'destructive' as const,
    iconColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  not_assigned: {
    icon: WarningCircle,
    title: () => t('errors.clientNotAssigned'),
    description: () => t('errors.clientNotAssignedDescription'),
    variant: 'destructive' as const,
    iconColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  scope_missing: {
    icon: ShieldSlash,
    title: () => t('errors.scopeMissing'),
    description: () => t('errors.scopeMissingDescription'),
    variant: 'default' as const,
    iconColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
}

export const ClientAccessError = ({
  type,
  clientName,
  missingScope,
  onGoToClients,
}: ClientAccessErrorProps) => {
  const config = errorConfig[type]
  const Icon = config.icon

  const handleGoToClients = () => {
    if (onGoToClients) {
      onGoToClients()
    } else {
      navigateTo('/accountant/clients')
    }
  }

  return (
    <div className="container max-w-2xl mx-auto px-4 py-12">
      <Card className={`${config.bgColor} ${config.borderColor} border-2`}>
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className={`w-20 h-20 rounded-full ${config.bgColor} flex items-center justify-center`}>
              <Icon size={48} weight="duotone" className={config.iconColor} />
            </div>
          </div>
          <CardTitle className="text-xl">{config.title()}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            {config.description()}
          </p>
          
          {clientName && type !== 'no_client' && (
            <p className="text-sm text-muted-foreground">
              <strong>{t('clientSwitcher.client')}:</strong> {clientName}
            </p>
          )}

          {missingScope && type === 'scope_missing' && (
            <p className="text-sm text-muted-foreground">
              <strong>{t('permissions.title')}:</strong> {t(`permissions.scopes.${missingScope}` as any) || missingScope}
            </p>
          )}

          <Button onClick={handleGoToClients} className="gap-2">
            <UsersThree size={18} />
            {t('clientSwitcher.goToClients')}
            <ArrowRight size={16} />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Hook to parse API error responses and determine client access error type
 */
export const parseClientAccessError = (error: unknown): ClientAccessErrorType | null => {
  if (!error || typeof error !== 'object') return null
  
  // Check for axios/fetch response structure
  const err = error as { response?: { data?: { code?: string; detail?: string | { code?: string } }; status?: number } }
  
  if (err.response?.status === 403) {
    const detail = err.response.data?.detail
    const code = typeof detail === 'object' ? detail?.code : err.response.data?.code
    const detailStr = typeof detail === 'string' ? detail : ''
    
    if (code === 'PENDING_APPROVAL' || detailStr.includes('PENDING_APPROVAL')) {
      return 'pending_approval'
    }
    if (code === 'ACCESS_REVOKED' || detailStr.includes('ACCESS_REVOKED')) {
      return 'access_revoked'
    }
    if (code === 'NOT_ASSIGNED' || detailStr.includes('NOT_ASSIGNED')) {
      return 'not_assigned'
    }
    if (code === 'SCOPE_MISSING' || detailStr.includes('SCOPE_MISSING')) {
      return 'scope_missing'
    }
  }
  
  return null
}

export default ClientAccessError
