import { navigateTo } from '@/lib/navigation'

const CURRENT_YEAR = new Date().getFullYear()

export const MarketingFooter = () => {
  return (
    <footer className="border-t border-border bg-muted/50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="space-y-3 text-sm">
            <p className="font-semibold">Smart Accounting</p>
            <p className="max-w-xs text-muted-foreground">
              Boekhouden, BTW-inzicht en samenwerking in één rustig platform.
            </p>
            <button
              onClick={() => navigateTo('/login')}
              className="block text-primary hover:text-primary/80 transition-colors text-left font-medium"
            >
              Start gratis
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <p className="font-semibold">Product</p>
            <a href="/#voor-zzp" className="block text-muted-foreground hover:text-foreground transition-colors">
              Voor ZZP'ers
            </a>
            <a href="/#voor-accountants" className="block text-muted-foreground hover:text-foreground transition-colors">
              Voor boekhouders
            </a>
            <a href="/#prijzen" className="block text-muted-foreground hover:text-foreground transition-colors">
              Prijzen
            </a>
            <button
              onClick={() => navigateTo('/help')}
              className="block text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              Startgids
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <p className="font-semibold">Platform</p>
            <p className="text-muted-foreground">Transparante BTW-berekening</p>
            <p className="text-muted-foreground">Audit trail en periodecontrole</p>
            <p className="text-muted-foreground">Exports voor archivering</p>
            <p className="text-muted-foreground">Mobiel te gebruiken als PWA</p>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {CURRENT_YEAR} Smart Accounting — Productinformatie.
        </div>
      </div>
    </footer>
  )
}
