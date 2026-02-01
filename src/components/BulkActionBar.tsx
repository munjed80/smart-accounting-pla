/**
 * BulkActionBar - Sticky Bulk Action Bar Component
 * 
 * Shows a sticky bar at the top when clients are selected.
 * Provides Dutch-labeled buttons for bulk operations:
 * - Herberekenen (Recalculate)
 * - Geel erkennen (Acknowledge Yellow)
 * - BTW concept (VAT Draft)
 * - Herinnering sturen (Send Reminders)
 * 
 * Features:
 * - Sticky positioning (top of viewport on mobile, below header on desktop)
 * - Selection count display
 * - Warning for large selections (>50)
 * - "Select all visible" and "Clear selection" buttons
 * - Mobile-responsive design
 */

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  ArrowsClockwise,
  CheckCircle,
  Gauge,
  PaperPlaneTilt,
  X,
  WarningCircle,
  CheckSquare,
} from '@phosphor-icons/react'
import { t } from '@/i18n'
import { useIsMobile } from '@/hooks/use-mobile'

export type BulkActionType = 'recalculate' | 'ack_yellow' | 'generate_vat' | 'send_reminders'

interface BulkActionBarProps {
  /** Number of selected clients */
  selectedCount: number
  /** Total number of visible clients (for "Select all") */
  visibleClientCount: number
  /** Handler for selecting all visible clients */
  onSelectAll: () => void
  /** Handler for clearing the selection */
  onClearSelection: () => void
  /** Handler for triggering a bulk action */
  onAction: (actionType: BulkActionType) => void
  /** Whether any action is currently processing */
  isProcessing?: boolean
}

export const BulkActionBar = ({
  selectedCount,
  visibleClientCount,
  onSelectAll,
  onClearSelection,
  onAction,
  isProcessing = false,
}: BulkActionBarProps) => {
  const isMobile = useIsMobile()
  const showLargeSelectionWarning = selectedCount > 50

  if (selectedCount === 0) {
    return null
  }

  return (
    <div 
      className={`
        sticky z-40 bg-primary/5 border border-primary/20 rounded-lg shadow-sm
        ${isMobile ? 'top-0' : 'top-4'}
        mb-4 transition-all duration-200
      `}
    >
      <div className="p-3 sm:p-4">
        {/* Selection info and actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          {/* Selection count badge */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="secondary" className="font-semibold px-3 py-1">
              {t('bulkOps.selectedClients').replace('{count}', String(selectedCount))}
            </Badge>
          </div>

          {/* Select all / Clear buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {selectedCount < visibleClientCount && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSelectAll}
                disabled={isProcessing}
                className="text-xs"
              >
                <CheckSquare size={14} className="mr-1" />
                {t('bulkOps.selectAllVisible')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              disabled={isProcessing}
              className="text-xs"
            >
              <X size={14} className="mr-1" />
              {t('bulkOps.clearSelection')}
            </Button>
          </div>

          {/* Action buttons - wrap on mobile */}
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onAction('recalculate')}
              disabled={isProcessing}
              className="flex-grow sm:flex-grow-0"
            >
              <ArrowsClockwise size={16} className="mr-1" />
              {t('bulkOps.recalculate')}
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onAction('ack_yellow')}
              disabled={isProcessing}
              className="flex-grow sm:flex-grow-0"
            >
              <CheckCircle size={16} className="mr-1" />
              {t('bulkOps.ackYellow')}
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onAction('generate_vat')}
              disabled={isProcessing}
              className="flex-grow sm:flex-grow-0"
            >
              <Gauge size={16} className="mr-1" />
              {t('bulkOps.vatDraft')}
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onAction('send_reminders')}
              disabled={isProcessing}
              className="flex-grow sm:flex-grow-0"
            >
              <PaperPlaneTilt size={16} className="mr-1" />
              {t('bulkOps.sendReminder')}
            </Button>
          </div>
        </div>

        {/* Large selection warning */}
        {showLargeSelectionWarning && (
          <Alert variant="default" className="mt-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
            <WarningCircle size={16} className="text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
              {t('bulkOps.largeSelectionWarning')}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}

export default BulkActionBar
