import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface IOSInstallModalProps {
  open: boolean
  onSkip: () => void
}

export const IOSInstallModal = ({ open, onSkip }: IOSInstallModalProps) => {
  const [showSteps, setShowSteps] = useState(false)

  useEffect(() => {
    if (open) {
      setShowSteps(false)
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/45">
      <div className="mx-auto mt-20 w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-5 shadow-xl sm:mt-28">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Voeg toe aan beginscherm</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSkip} aria-label="Sluiten">
            <X size={16} />
          </Button>
        </div>

        {!showSteps ? (
          <>
            <p className="text-sm text-muted-foreground">
              Open Safari delen-menu en kies ‘Zet op beginscherm’.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onSkip}>
                Overslaan
              </Button>
              <Button type="button" onClick={() => setShowSteps(true)}>
                Toevoegen
              </Button>
            </div>
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
              <li>Tik op Delen (⬆️)</li>
              <li>Kies ‘Zet op beginscherm’</li>
              <li>Bevestig met ‘Voeg toe’</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">Deze stap werkt alleen in Safari.</p>

            <div className="mt-5 flex justify-end">
              <Button type="button" variant="outline" onClick={onSkip}>
                Overslaan
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default IOSInstallModal
