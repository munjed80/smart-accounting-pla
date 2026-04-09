/**
 * Shared components and helpers for the Belastinghulp (tax) section.
 *
 * Keeps the individual tax pages DRY by centralising formatting helpers
 * and repeated UI primitives.
 */

import { Button } from '@/components/ui/button'
import { WarningCircle, Info, CaretRight } from '@phosphor-icons/react'
import { navigateTo } from '@/lib/navigation'

// ============================================================================
// Currency helpers
// ============================================================================

/** Format a cents value as Dutch-locale EUR currency string. */
export const formatCurrency = (cents: number): string => {
  const euros = cents / 100
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(euros)
}

/** Format a cents value as absolute EUR currency string (no negative sign). */
export const formatCurrencyAbs = (cents: number): string =>
  formatCurrency(Math.abs(cents))

// ============================================================================
// Warning item
// ============================================================================

/** Shape of a warning returned by both BTW and Income Tax endpoints. */
export interface TaxWarning {
  id: string
  severity: 'error' | 'warning' | 'info'
  title: string
  description: string
  action_hint?: string
  related_route?: string
}

/** Renders a single warning with severity colouring and an optional link. */
export const TaxWarningItem = ({ warning }: { warning: TaxWarning }) => {
  const severityConfig: Record<string, { icon: React.ReactNode; bg: string }> = {
    error: {
      icon: <WarningCircle size={18} weight="fill" className="text-red-500" />,
      bg: 'border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900',
    },
    warning: {
      icon: <WarningCircle size={18} weight="fill" className="text-amber-500" />,
      bg: 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900',
    },
    info: {
      icon: <Info size={18} weight="fill" className="text-blue-500" />,
      bg: 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900',
    },
  }

  const config = severityConfig[warning.severity] || severityConfig.info

  return (
    <div className={`rounded-lg border p-3 text-sm space-y-1 ${config.bg}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex-shrink-0">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium">{warning.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{warning.description}</p>
          {warning.action_hint && (
            <p className="text-xs mt-1 font-medium">{warning.action_hint}</p>
          )}
          {warning.related_route && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs mt-1"
              onClick={() => navigateTo(warning.related_route!)}
            >
              Bekijken <CaretRight size={12} className="ml-0.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
