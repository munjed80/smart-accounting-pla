import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowClockwise, X } from '@phosphor-icons/react'

export const PWAUpdatePrompt = () => {
  const [showUpdate, setShowUpdate] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD || import.meta.env.VITE_ENABLE_PWA !== 'true') {
      return
    }

    if (!('serviceWorker' in navigator)) {
      return
    }

    let cancelled = false

    const subscribeToRegistration = async () => {
      const registration = await navigator.serviceWorker.getRegistration('/')
      if (!registration || cancelled) {
        return
      }

      if (registration.waiting) {
        setWaitingWorker(registration.waiting)
        setShowUpdate(true)
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (!installing) {
          return
        }

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(registration.waiting ?? null)
            setShowUpdate(true)
          }
        })
      })
    }

    void subscribeToRegistration()

    return () => {
      cancelled = true
    }
  }, [])

  const handleUpdate = () => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
    window.location.reload()
  }

  const handleDismiss = () => {
    setShowUpdate(false)
  }

  if (!showUpdate) {
    return null
  }

  return (
    <Alert className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 bg-background border-primary">
      <div className="flex items-center gap-3">
        <ArrowClockwise size={20} className="text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <AlertDescription className="text-sm">
            <p className="font-semibold mb-1">Nieuwe versie beschikbaar</p>
            <p className="text-xs text-muted-foreground">
              Klik op herladen om bij te werken
            </p>
          </AlertDescription>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={handleUpdate}
          >
            Herladen
          </Button>
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
