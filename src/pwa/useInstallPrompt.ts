import { useCallback, useEffect, useMemo, useState } from 'react'
import { isIosSafari, isStandalone } from '@/pwa/installHelpers'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const IOS_DISMISSED_KEY = 'pwa_ios_install_dismissed'
const IOS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000

const hasActiveIosDismissCooldown = () => {
  if (typeof window === 'undefined') {
    return false
  }

  const rawValue = window.localStorage.getItem(IOS_DISMISSED_KEY)
  if (!rawValue) {
    return false
  }

  const dismissedAt = Number(rawValue)
  if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) {
    return false
  }

  return Date.now() - dismissedAt < IOS_COOLDOWN_MS
}

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
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(IOS_DISMISSED_KEY, String(Date.now()))
    }
  }, [])

  const showIosHelper = useMemo(() => {
    if (!isIosSafari()) {
      return false
    }

    if (isStandalone() || installed || dismissed || deferredPrompt) {
      return false
    }

    return !hasActiveIosDismissCooldown()
  }, [deferredPrompt, dismissed, installed])

  return {
    canInstall: Boolean(deferredPrompt) && !installed && !dismissed,
    showIosHelper,
    promptInstall,
    dismiss,
  }
}
