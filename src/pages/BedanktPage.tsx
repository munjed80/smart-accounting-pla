import { useEffect } from 'react'
import { navigateTo } from '@/lib/navigation'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle, Home } from 'lucide-react'
import { MarketingFooter } from '@/components/marketing/Footer'
import { CookieBanner } from '@/components/marketing/CookieBanner'

export const BedanktPage = () => {
  useSeoMeta({
    title: 'Bedankt | ZZPers Hub',
    description: 'Je aanvraag is succesvol ontvangen. Welkom bij ZZPers Hub — dé boekhoudtool voor zzp\'ers.',
    canonical: 'https://zzpershub.nl/bedankt',
  })

  useEffect(() => {
    // Add noindex so this conversion page is not indexed by search engines
    let noindexTag = document.querySelector('meta[name="robots"]')
    if (!noindexTag) {
      noindexTag = document.createElement('meta')
      noindexTag.setAttribute('name', 'robots')
      document.head.appendChild(noindexTag)
    }
    noindexTag.setAttribute('content', 'noindex, follow')

    return () => {
      // Reset robots meta on unmount so other pages are not affected
      const tag = document.querySelector('meta[name="robots"]')
      if (tag) {
        tag.setAttribute('content', 'index, follow')
      }
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-secondary to-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <button
            className="flex items-center gap-2 focus:outline-none"
            onClick={() => navigateTo('/')}
            aria-label="Ga naar home"
          >
            <span className="flex items-center gap-2">
              <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="1" width="13" height="17" rx="2" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M6 6h7M6 10h7M6 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="17" cy="16" r="4" fill="var(--accent)" />
                  <text x="17" y="19.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="white" fontFamily="system-ui">€</text>
                </svg>
              </span>
              <span className="brand-shimmer text-lg font-bold sm:text-xl">ZZPers Hub</span>
            </span>
          </button>
          <Button size="sm" onClick={() => navigateTo('/login')}>
            Inloggen
          </Button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-lg text-center">
          {/* Success icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent/10">
            <CheckCircle className="h-10 w-10 text-accent" />
          </div>

          {/* Heading */}
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Bedankt!</h1>

          {/* Message */}
          <p className="mb-3 text-lg text-muted-foreground">
            Je aanvraag / registratie / betaling is succesvol ontvangen.
          </p>
          <p className="mb-10 text-base text-muted-foreground">
            Je kunt nu verder met <span className="font-semibold text-foreground">ZZPers Hub</span>.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              onClick={() => navigateTo('/login')}
              className="w-full sm:w-auto"
            >
              Inloggen
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigateTo('/')}
              className="w-full border-border/60 transition-colors hover:border-primary/40 hover:bg-primary/5 sm:w-auto"
            >
              <Home className="mr-2 h-4 w-4" />
              Ga naar home
            </Button>
          </div>
        </div>
      </main>

      <MarketingFooter />
      <CookieBanner />
    </div>
  )
}
