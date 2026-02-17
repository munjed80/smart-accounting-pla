import { ArrowClockwise } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface SwUpdateBannerProps {
  visible: boolean
  onApply: () => void
  onDismiss: () => void
  isZzp: boolean
}

export const SwUpdateBanner = ({ visible, onApply, onDismiss, isZzp }: SwUpdateBannerProps) => {
  if (!visible) {
    return null
  }

  return (
    <Alert
      className={`fixed left-4 right-4 z-40 border-primary bg-background sm:left-auto sm:w-96 ${isZzp ? 'bottom-24' : 'bottom-4'}`}
    >
      <div className="flex items-center gap-3">
        <ArrowClockwise size={18} className="text-primary shrink-0" />
        <AlertDescription className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Nieuwe versie beschikbaar</p>
          <p className="text-xs text-muted-foreground">Werk bij voor de nieuwste verbeteringen.</p>
        </AlertDescription>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" className="h-8 text-xs" onClick={onApply}>Bijwerken</Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onDismiss}>Later</Button>
        </div>
      </div>
    </Alert>
  )
}

export default SwUpdateBanner
