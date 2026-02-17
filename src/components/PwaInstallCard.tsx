import { DownloadSimple, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface PwaInstallCardProps {
  canInstall: boolean
  showIosHelper: boolean
  onInstall: () => void
  onDismiss: () => void
}

export const PwaInstallCard = ({ canInstall, showIosHelper, onInstall, onDismiss }: PwaInstallCardProps) => {
  if (!canInstall && !showIosHelper) {
    return null
  }

  return (
    <Alert className="mx-4 mt-3 border-primary/40 bg-card sm:mx-6 lg:mx-8">
      <div className="flex items-start gap-3">
        <DownloadSimple size={18} className="mt-0.5 text-primary shrink-0" />
        <AlertDescription className="flex-1">
          {canInstall ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Installeer Smart Accounting</p>
              <p className="text-xs text-muted-foreground">Snellere toegang en beter offline gebruik op dit apparaat.</p>
              <Button size="sm" className="h-8 text-xs" onClick={onInstall}>Installeren</Button>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-semibold">Voeg toe aan beginscherm</p>
              <p className="text-xs text-muted-foreground">
                Open Safari delen-menu en kies <strong>'Zet op beginscherm'</strong>.
              </p>
            </div>
          )}
        </AlertDescription>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDismiss} aria-label="Sluiten">
          <X size={14} />
        </Button>
      </div>
    </Alert>
  )
}

export default PwaInstallCard
