/**
 * ApiErrorState - Consistent error UX for API error responses
 * 
 * Handles different HTTP error codes with appropriate Dutch messages:
 * - 401/403: "Geen toegang" (No access)
 * - 404: "Niet beschikbaar" (Not available)
 * - 5xx: "Tijdelijke storing" (Temporary outage)
 * 
 * Provides retry and navigation actions where relevant.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import {
  Lock,
  WarningCircle,
  CloudSlash,
  ArrowClockwise,
  UsersThree,
  ArrowRight,
} from '@phosphor-icons/react'

export type ApiErrorType = 'unauthorized' | 'forbidden' | 'not_found' | 'server_error' | 'unknown'

interface ApiErrorStateProps {
  /** The type of error to display */
  type: ApiErrorType
  /** Optional additional error message or details */
  message?: string
  /** Optional callback for retry action */
  onRetry?: () => void
  /** Optional callback for navigation (for tab-based navigation) */
  onNavigate?: (tab: string) => void
  /** Whether to show the "Go to clients" button */
  showGoToClients?: boolean
}

/**
 * Parse an error object and determine the ApiErrorType
 */
export const parseApiError = (error: unknown): { type: ApiErrorType; message: string } => {
  // Default values
  let type: ApiErrorType = 'unknown'
  let message = ''
  
  if (!error) {
    return { type, message }
  }
  
  // Handle axios/fetch error response structure
  const err = error as { 
    response?: { 
      status?: number
      data?: { detail?: string; message?: string; code?: string } 
    }
    message?: string
  }
  
  const status = err.response?.status
  const detail = err.response?.data?.detail || err.response?.data?.message || err.message || ''
  
  if (status === 401) {
    type = 'unauthorized'
    message = detail
  } else if (status === 403) {
    type = 'forbidden'
    message = detail
  } else if (status === 404) {
    type = 'not_found'
    message = detail
  } else if (status && status >= 500) {
    type = 'server_error'
    message = detail
  } else if (detail) {
    type = 'unknown'
    message = typeof detail === 'string' ? detail : String(detail)
  }
  
  // Log warning for debugging (no secrets)
  if (type !== 'unknown') {
    console.warn(`[ApiError] ${type}: HTTP ${status}${message ? ` - ${message}` : ''}`)
  }
  
  return { type, message }
}

// Error configuration by type
const errorConfig = {
  unauthorized: {
    icon: Lock,
    title: () => t('apiError.unauthorized'),
    description: () => t('apiError.unauthorizedDescription'),
    iconColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  forbidden: {
    icon: Lock,
    title: () => t('apiError.forbidden'),
    description: () => t('apiError.forbiddenDescription'),
    iconColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  not_found: {
    icon: WarningCircle,
    title: () => t('apiError.notFound'),
    description: () => t('apiError.notFoundDescription'),
    iconColor: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-muted',
  },
  server_error: {
    icon: CloudSlash,
    title: () => t('apiError.serverError'),
    description: () => t('apiError.serverErrorDescription'),
    iconColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  unknown: {
    icon: WarningCircle,
    title: () => t('apiError.unknown'),
    description: () => t('apiError.unknownDescription'),
    iconColor: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-muted',
  },
}

export const ApiErrorState = ({
  type,
  message,
  onRetry,
  onNavigate,
  showGoToClients = true,
}: ApiErrorStateProps) => {
  const config = errorConfig[type]
  const Icon = config.icon

  const handleGoToClients = () => {
    if (onNavigate) {
      onNavigate('clients')
    } else {
      navigateTo('/accountant/clients')
    }
  }

  const handleRetry = () => {
    if (onRetry) {
      onRetry()
    } else {
      window.location.reload()
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
          
          {/* Show additional error message if provided (excluding sensitive info) */}
          {message && type !== 'unauthorized' && (
            <p className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-md">
              {message}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            {/* Retry button - show for server errors and unknown errors */}
            {(type === 'server_error' || type === 'unknown' || type === 'not_found') && (
              <Button variant="outline" onClick={handleRetry} className="gap-2">
                <ArrowClockwise size={18} />
                {t('apiError.retry')}
              </Button>
            )}

            {/* Go to clients button */}
            {showGoToClients && (
              <Button onClick={handleGoToClients} className="gap-2">
                <UsersThree size={18} />
                {t('requireClient.goToClients')}
                <ArrowRight size={16} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ApiErrorState
