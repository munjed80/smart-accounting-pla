import { useState } from 'react'
import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { Linkedin, Twitter } from 'lucide-react'

const CURRENT_YEAR = new Date().getFullYear()

export const MarketingFooter = () => {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault()
    setSubscribed(true)
    setEmail('')
  }

  return (
    <footer id="contact" className="border-t border-border bg-muted/50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Brand row */}
        <div className="mb-10 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="text-primary shrink-0">
              <rect x="3" y="1" width="13" height="17" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M6 6h7M6 10h7M6 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="17" cy="16" r="4" fill="oklch(0.72 0.18 150)" />
              <text x="17" y="19.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="white" fontFamily="system-ui">€</text>
            </svg>
            <span className="text-sm font-bold text-foreground">ZZPers Hub</span>
          </div>
          <p className="text-xs text-muted-foreground max-w-xs sm:text-right">Gratis facturen maken voor zzp'ers. Eenvoudig, professioneel, overzichtelijk.</p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: Product */}
          <div className="space-y-3 text-sm">
            <p className="font-semibold">Product</p>
            <a href="/#voor-zzp" className="block text-muted-foreground hover:text-foreground transition-colors">
              Voor ZZP'ers
            </a>
            <a href="/#voor-accountants" className="block text-muted-foreground hover:text-foreground transition-colors">
              Voor boekhouders
            </a>
            <a href="/prijzen" className="block text-muted-foreground hover:text-foreground transition-colors">
              Pakketten
            </a>
            <button
              onClick={() => navigateTo('/faq')}
              className="block text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              FAQ / Startgids
            </button>
            <button
              onClick={() => navigateTo('/login')}
              className="block text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              Inloggen
            </button>
            <button
              onClick={() => navigateTo('/register')}
              className="block text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              Start gratis
            </button>
          </div>

          {/* Column 2: Legal */}
          <div className="space-y-3 text-sm">
            <p className="font-semibold">Juridisch</p>
            <button
              onClick={() => navigateTo('/privacy')}
              className="block text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              Privacyverklaring
            </button>
            <button
              onClick={() => navigateTo('/cookies')}
              className="block text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              Cookiebeleid
            </button>
            <button
              onClick={() => navigateTo('/terms')}
              className="block text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              Algemene voorwaarden
            </button>
            <button
              onClick={() => navigateTo('/disclaimer')}
              className="block text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              Disclaimer
            </button>
          </div>

          {/* Column 3: Company */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Bedrijf</p>
            <p className="text-xs text-muted-foreground font-medium">Powered by MHM IT</p>
            <address className="not-italic text-xs text-muted-foreground leading-relaxed">
              Europaboulevard 371<br />
              1825 RL Alkmaar<br />
              KvK: 69779716
            </address>
            <div className="flex items-center gap-3 pt-1">
              <a
                href="#"
                aria-label="ZZPers Hub op LinkedIn"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                <Linkedin className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="ZZPers Hub op X / Twitter"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                <Twitter className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Column 4: Contact */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Contact</p>
            <p className="text-xs text-muted-foreground">Vragen of interesse? Neem contact op en wij reageren binnen één werkdag.</p>
            <a
              href="mailto:info@zzpershub.nl"
              className="block text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              info@zzpershub.nl
            </a>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => navigateTo('/contact')}
            >
              Contact opnemen
            </Button>
          </div>
        </div>

        {/* Newsletter CTA */}
        <div className="mt-10 rounded-lg border border-border/80 bg-background p-6">
          <p className="text-sm font-semibold mb-1">Blijf op de hoogte</p>
          <p className="text-xs text-muted-foreground mb-3">Ontvang tips, updates en nieuws over ZZPers Hub direct in je inbox.</p>
          {subscribed ? (
            <p className="text-sm font-medium text-accent">Bedankt voor je aanmelding! 🎉</p>
          ) : (
            <form onSubmit={handleSubscribe} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="email"
                required
                placeholder="jouw@email.nl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button type="submit" size="sm" variant="outline">
                Aanmelden
              </Button>
            </form>
          )}
        </div>

        <div className="mt-8 border-t border-border pt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between text-xs text-muted-foreground">
          <span>© {CURRENT_YEAR} ZZPers Hub — Alle rechten voorbehouden.</span>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="hover:text-foreground transition-colors"
            aria-label="Terug naar boven"
          >
            ↑ Terug naar boven
          </button>
        </div>
      </div>
    </footer>
  )
}
