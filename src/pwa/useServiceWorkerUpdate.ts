import { useCallback, useEffect, useRef, useState } from 'react'

export const useServiceWorkerUpdate = () => {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const hasReloadedRef = useRef(false)

  const devLog = useCallback((message: string) => {
    if (import.meta.env.DEV) {
      console.log(`[PWA update] ${message}`)
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD || import.meta.env.VITE_ENABLE_PWA !== 'true' || !('serviceWorker' in navigator)) {
      return
    }

    let cleanupInstallingListener: (() => void) | null = null
    let cleanupRegistrationListener: (() => void) | null = null

    const markUpdateAvailable = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting)
        setDismissed(false)
        devLog('update available')
      }
    }

    const handleControllerChange = () => {
      if (hasReloadedRef.current) {
        return
      }

      hasReloadedRef.current = true
      devLog('update applied')
      window.location.reload()
    }

    const attachRegistration = (registration: ServiceWorkerRegistration) => {
      markUpdateAvailable(registration)

      const handleUpdateFound = () => {
        const installingWorker = registration.installing
        if (!installingWorker) {
          return
        }

        const handleStateChange = () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            markUpdateAvailable(registration)
          }
        }

        installingWorker.addEventListener('statechange', handleStateChange)
        cleanupInstallingListener = () => {
          installingWorker.removeEventListener('statechange', handleStateChange)
        }
      }

      registration.addEventListener('updatefound', handleUpdateFound)
      cleanupRegistrationListener = () => {
        registration.removeEventListener('updatefound', handleUpdateFound)
      }
    }

    void navigator.serviceWorker.getRegistration('/').then((registration) => {
      if (registration) {
        attachRegistration(registration)
      }
    })

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    return () => {
      cleanupInstallingListener?.()
      cleanupRegistrationListener?.()
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [devLog])

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) {
      return
    }

    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  }, [waitingWorker])

  const dismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  return {
    updateAvailable: Boolean(waitingWorker) && !dismissed,
    applyUpdate,
    dismiss,
  }
}
