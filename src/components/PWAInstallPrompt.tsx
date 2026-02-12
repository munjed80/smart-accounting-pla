import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Download, X, DeviceMobile } from '@phosphor-icons/react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  useEffect(() => {
    // Check if iOS
    const userAgent = window.navigator.userAgent.toLowerCase()
    const iOS = /iphone|ipad|ipod/.test(userAgent)
    setIsIOS(iOS)

    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isInWebAppiOS = (window.navigator as any).standalone === true

    if (isStandalone || isInWebAppiOS) {
      return // Already installed, don't show prompt
    }

    // Listen for beforeinstallprompt event (Android, desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // Check if user has dismissed the prompt before
      const dismissed = localStorage.getItem('pwa-install-dismissed')
      if (!dismissed) {
        setShowPrompt(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // If no prompt available (e.g., iOS), show instructions
      if (isIOS) {
        setShowIOSInstructions(true)
      }
      return
    }

    // Show the install prompt
    deferredPrompt.prompt()

    // Wait for user choice
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      console.log('PWA installed')
    }

    // Clear the prompt
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    setShowIOSInstructions(false)
    localStorage.setItem('pwa-install-dismissed', 'true')
  }

  // Don't show anything if not ready
  if (!showPrompt && !showIOSInstructions) {
    return null
  }

  // iOS instructions
  if (showIOSInstructions) {
    return (
      <Alert className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 bg-background border-primary">
        <div className="flex items-start gap-3">
          <DeviceMobile size={24} className="text-primary flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <AlertDescription className="text-sm space-y-2">
              <p className="font-semibold">Installeer de app op iOS:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Tik op het Deel-icoon <span className="inline-block">⎋</span></li>
                <li>Scroll naar beneden en tik op "Zet op beginscherm"</li>
                <li>Tik op "Voeg toe"</li>
              </ol>
            </AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={handleDismiss}
          >
            <X size={16} />
          </Button>
        </div>
      </Alert>
    )
  }

  // Install prompt for Android/desktop
  return (
    <Alert className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 bg-background border-primary">
      <div className="flex items-center gap-3">
        <Download size={20} className="text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <AlertDescription className="text-sm">
            <p className="font-semibold mb-1">Installeer de app</p>
            <p className="text-xs text-muted-foreground">
              Snellere toegang en offline werken
            </p>
          </AlertDescription>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={handleInstallClick}
          >
            Installeer
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
