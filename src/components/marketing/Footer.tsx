import { navigateTo } from '@/lib/navigation'

const CURRENT_YEAR = new Date().getFullYear()

export const MarketingFooter = () => {
  return (
    <footer id="contact" className="border-t border-border bg-muted/50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand + company block */}
          <div className="space-y-3">
            <span className="text-xl font-bold text-primary">Smart Accounting</span>
            <p className="text-sm text-muted-foreground">Compliance Operating System voor ZZP'ers en accountants.</p>
            <p className="text-xs text-muted-foreground">Powered by MHM IT</p>
            <address className="not-italic text-xs text-muted-foreground leading-relaxed">
              MHM IT<br />
              Europaboulevard 371<br />
              1825RL Alkmaar<br />
              KvK: 69779716
            </address>
          </div>

          {/* Contact */}
          <div className="space-y-3 text-sm">
            <p className="font-medium">Contact</p>
            <a
              href="mailto:support@zzpershub.nl"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              support@zzpershub.nl
            </a>
            <a
              href="mailto:info@smartaccounting.nl"
              className="block text-muted-foreground hover:text-foreground transition-colors"
            >
              info@smartaccounting.nl
            </a>
          </div>

          {/* Legal */}
          <div className="space-y-3 text-sm">
            <p className="font-medium">Juridisch</p>
            <button
              onClick={() => navigateTo('/privacy')}
              className="block text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              Privacybeleid
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
          </div>

          {/* Platform */}
          <div className="space-y-3 text-sm">
            <p className="font-medium">Platform</p>
            <a href="#voor-zzp" className="block text-muted-foreground hover:text-foreground transition-colors">
              Voor ZZP
            </a>
            <a href="#voor-accountants" className="block text-muted-foreground hover:text-foreground transition-colors">
              Voor accountants
            </a>
            <a href="#faq" className="block text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </a>
            <a href="#prijzen" className="block text-muted-foreground hover:text-foreground transition-colors">
              Prijzen
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {CURRENT_YEAR} MHM IT — Smart Accounting. Alle rechten voorbehouden.
        </div>
      </div>
    </footer>
  )
}
