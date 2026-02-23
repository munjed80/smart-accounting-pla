import { useState, useEffect } from 'react'
import { X, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'cookie_consent'

type ConsentSettings = {
  necessary: true
  functional: boolean
  analytics: boolean
  marketing: boolean
}

const defaultConsent: ConsentSettings = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
}

const getStoredConsent = (): ConsentSettings | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored) as ConsentSettings
    }
  } catch {
    // ignore parse errors
  }
  return null
}

const saveConsent = (settings: ConsentSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore storage errors
  }
}

export const CookieBanner = () => {
  const [visible, setVisible] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [pending, setPending] = useState<ConsentSettings>(defaultConsent)

  useEffect(() => {
    const stored = getStoredConsent()
    if (!stored) {
      setVisible(true)
    }
  }, [])

  const acceptAll = () => {
    const all: ConsentSettings = { necessary: true, functional: true, analytics: true, marketing: true }
    saveConsent(all)
    setVisible(false)
  }

  const rejectNonEssential = () => {
    saveConsent(defaultConsent)
    setVisible(false)
  }

  const openManage = () => {
    const stored = getStoredConsent() ?? defaultConsent
    setPending(stored)
    setManageOpen(true)
  }

  const saveManaged = () => {
    saveConsent(pending)
    setManageOpen(false)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <>
      {/* Cookie banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/98 backdrop-blur shadow-lg">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground max-w-2xl">
              Wij gebruiken cookies om de website goed te laten werken en, met uw toestemming, voor analyses. Lees meer in ons{' '}
              <a href="/cookies" className="underline hover:text-foreground transition-colors">cookiebeleid</a>.
            </p>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button size="sm" variant="ghost" onClick={openManage} className="flex items-center gap-1">
                <Settings className="h-3.5 w-3.5" />
                Beheren
              </Button>
              <Button size="sm" variant="outline" onClick={rejectNonEssential}>
                Alleen noodzakelijk
              </Button>
              <Button size="sm" onClick={acceptAll}>
                Alles accepteren
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Manage modal */}
      {manageOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setManageOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Cookie-instellingen</h2>
              <button onClick={() => setManageOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Necessary */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Noodzakelijk</p>
                  <p className="text-xs text-muted-foreground">Vereist voor het functioneren van de website (sessie, beveiliging).</p>
                </div>
                <span className="text-xs text-muted-foreground mt-0.5 shrink-0">Altijd aan</span>
              </div>

              {/* Functional */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Functioneel</p>
                  <p className="text-xs text-muted-foreground">Slaat uw voorkeuren op (taal, weergave-instellingen).</p>
                </div>
                <button
                  role="switch"
                  aria-checked={pending.functional}
                  onClick={() => setPending((p) => ({ ...p, functional: !p.functional }))}
                  className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors ${pending.functional ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${pending.functional ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Analytics */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Analyse</p>
                  <p className="text-xs text-muted-foreground">Helpt ons te begrijpen hoe de site wordt gebruikt (anoniem).</p>
                </div>
                <button
                  role="switch"
                  aria-checked={pending.analytics}
                  onClick={() => setPending((p) => ({ ...p, analytics: !p.analytics }))}
                  className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors ${pending.analytics ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${pending.analytics ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Marketing */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Marketing</p>
                  <p className="text-xs text-muted-foreground">Voor gepersonaliseerde advertenties. Standaard uitgeschakeld.</p>
                </div>
                <button
                  role="switch"
                  aria-checked={pending.marketing}
                  onClick={() => setPending((p) => ({ ...p, marketing: !p.marketing }))}
                  className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors ${pending.marketing ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${pending.marketing ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <Button className="flex-1" onClick={saveManaged}>Opslaan</Button>
              <Button variant="outline" className="flex-1" onClick={rejectNonEssential}>Alles weigeren</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
