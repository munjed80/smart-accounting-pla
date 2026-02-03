/**
 * RequireActiveClient - Reusable component that gates content behind active client selection
 * 
 * For accountant screens that require a selected client to display data.
 * Shows a consistent Dutch empty state with CTA to go to clients page.
 * 
 * Usage:
 * - As a wrapper: <RequireActiveClient>{children}</RequireActiveClient>
 * - As a guard (no children): <RequireActiveClient headerTitle="Page" />
 */

import { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import {
  User,
  UsersThree,
  ArrowRight,
} from '@phosphor-icons/react'

interface RequireActiveClientProps {
  /** Content to render when an active client is selected (optional for guard-only usage) */
  children?: ReactNode
  /** Optional icon to show in the empty state header */
  headerIcon?: ReactNode
  /** Optional title for the header card */
  headerTitle?: string
  /** Optional subtitle for the header card */
  headerSubtitle?: string
  /** Optional callback for navigation (for tab-based navigation) */
  onNavigate?: (tab: string) => void
}

/**
 * Wraps content that requires an active client selection.
 * Shows a friendly Dutch empty state when no client is selected.
 * 
 * Can be used in two modes:
 * 1. Wrapper mode: Pass children, renders them when client is active
 * 2. Guard mode: No children, just returns the empty state (use in early-return pattern)
 */
export const RequireActiveClient = ({
  children,
  headerIcon,
  headerTitle,
  headerSubtitle,
  onNavigate,
}: RequireActiveClientProps) => {
  const { activeClientId } = useActiveClient()

  const handleGoToClients = () => {
    if (onNavigate) {
      onNavigate('clients')
    } else {
      navigateTo('/accountant/clients')
    }
  }

  // If active client is selected and children provided, render children
  if (activeClientId && children) {
    return <>{children}</>
  }
  
  // If active client is selected but no children (guard mode), return null
  // This allows the parent component to handle rendering
  if (activeClientId) {
    return null
  }

  // No active client - show empty state
  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 max-w-5xl">
      {/* Optional header card */}
      {(headerIcon || headerTitle) && (
        <Card className="bg-card/80 backdrop-blur-sm mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              {headerIcon && (
                <div className="p-2 rounded-lg bg-primary/10">
                  {headerIcon}
                </div>
              )}
              <div>
                {headerTitle && <CardTitle className="text-2xl">{headerTitle}</CardTitle>}
                {headerSubtitle && <CardDescription>{headerSubtitle}</CardDescription>}
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Empty state card */}
      <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-amber-500/30 max-w-xl mx-auto">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center">
              <User size={48} weight="duotone" className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <CardTitle className="text-xl">{t('requireClient.title')}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            {t('requireClient.description')}
          </p>
          
          <Button onClick={handleGoToClients} className="gap-2">
            <UsersThree size={18} />
            {t('requireClient.goToClients')}
            <ArrowRight size={16} />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default RequireActiveClient
