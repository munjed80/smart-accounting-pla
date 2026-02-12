import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowClockwise, X } from '@phosphor-icons/react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export const PWAUpdatePrompt = () => {
  const [showUpdate, setShowUpdate] = useState(false)

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.error('SW registration error:', error)
    },
  })

  useEffect(() => {
    if (needRefresh) {
      setShowUpdate(true)
    }
  }, [needRefresh])

  const handleUpdate = () => {
    updateServiceWorker(true)
  }

  const handleDismiss = () => {
    setShowUpdate(false)
    setNeedRefresh(false)
    setOfflineReady(false)
  }

  if (!showUpdate && !offlineReady) {
    return null
  }

  return (
    <Alert className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 bg-background border-primary">
      <div className="flex items-center gap-3">
        <ArrowClockwise size={20} className="text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <AlertDescription className="text-sm">
            {needRefresh ? (
              <>
                <p className="font-semibold mb-1">Nieuwe versie beschikbaar</p>
                <p className="text-xs text-muted-foreground">
                  Klik op herladen om bij te werken
                </p>
              </>
            ) : (
              <p className="font-semibold">App is klaar voor offline gebruik</p>
            )}
          </AlertDescription>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {needRefresh && (
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs"
              onClick={handleUpdate}
            >
              Herladen
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleDismiss}
          >
            <X size={16} />
          </Button>
        </div>
      </div>
    </Alert>
  )
}
