import { useCallback, useEffect, useMemo, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (typeof (window.navigator as Navigator & { standalone?: boolean }).standalone === 'boolean' &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))

export const useInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)

  const devLog = useCallback((message: string) => {
    if (import.meta.env.DEV) {
      console.log(`[PWA install] ${message}`)
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD || import.meta.env.VITE_ENABLE_PWA !== 'true') {
      return
    }

    setInstalled(isStandalone())

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setDismissed(false)
      devLog('install prompt shown')
    }

    const handleAppInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
      setDismissed(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [devLog])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return
    }

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setInstalled(true)
      devLog('install accepted')
    } else {
      devLog('install dismissed')
    }

    setDeferredPrompt(null)
    setDismissed(true)
  }, [deferredPrompt, devLog])

  const dismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  const isIosBrowser = useMemo(() => (typeof window !== 'undefined' ? isIos() : false), [])
  const isInstalled = installed

  return {
    canInstall: Boolean(deferredPrompt) && !isInstalled && !dismissed,
    showIosHelper: isIosBrowser && !isInstalled && !dismissed && !deferredPrompt,
    promptInstall,
    dismiss,
  }
}
