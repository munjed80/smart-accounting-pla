import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'

const CURRENT_YEAR = new Date().getFullYear()

export const MarketingFooter = () => {
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
            <a href="/#prijzen" className="block text-muted-foreground hover:text-foreground transition-colors">
              Pakketten
            </a>
            <button
              onClick={() => navigateTo('/help')}
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
              onClick={() => navigateTo('/login')}
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
          </div>

          {/* Column 4: Contact */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Contact</p>
            <p className="text-xs text-muted-foreground">Vragen of interesse? Neem contact op en wij reageren binnen één werkdag.</p>
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

        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {CURRENT_YEAR} ZZPers Hub — Alle rechten voorbehouden.
        </div>
      </div>
    </footer>
  )
}
