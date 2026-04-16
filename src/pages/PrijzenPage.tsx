import { navigateTo } from '@/lib/navigation'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, CheckCircle } from 'lucide-react'
import { MarketingFooter } from '@/components/marketing/Footer'
import { CookieBanner } from '@/components/marketing/CookieBanner'

export const PrijzenPage = () => {
  useSeoMeta({
    title: "Pakketten en prijzen | ZZPers Hub",
    description: "Bekijk de prijzen van ZZPers Hub. Start 90 dagen gratis en maak professionele facturen als zzp'er. Daarna slechts €4,99 per maand. Geen creditcard vereist.",
    canonical: 'https://zzpershub.nl/prijzen',
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={() => navigateTo('/')} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
            ZZPers Hub
          </button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigateTo('/login')}>Inloggen</Button>
            <Button size="sm" onClick={() => navigateTo('/register')}>Start gratis</Button>
          </div>
        </div>
      </nav>

      <main>
        <section className="bg-gradient-to-b from-primary/5 to-muted/30 py-14 sm:py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-bold sm:text-center sm:text-4xl lg:text-5xl mb-2">Pakketten en prijzen</h1>
            <p className="text-muted-foreground sm:text-center mb-10 lg:text-lg">Eenvoudig en transparant — geen verborgen kosten.</p>

            <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
              {/* ZZP card */}
              <Card className="border-primary/50 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent" />
                <CardHeader>
                  <CardTitle className="text-2xl">ZZP</CardTitle>
                  <div>
                    <p className="text-3xl font-bold text-primary">Gratis</p>
                    <p className="text-sm text-muted-foreground">eerste 90 dagen</p>
                  </div>
                  <p className="text-lg font-semibold">Daarna €4,99 <span className="text-sm font-normal text-muted-foreground">/ maand</span></p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm lg:text-base">
                    {[
                      'Facturatie & klantbeheer',
                      'Urenregistratie',
                      'BTW-overzicht met drilldown',
                      'Uitgaven & bonnetjes',
                      'Bankimport',
                      'Mobiele app (PWA)',
                      'Accountant uitnodigen',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-accent shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" onClick={() => navigateTo('/register')}>
                    Start 90 dagen gratis
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>

              {/* Accountant card */}
              <Card className="border-border/80">
                <CardHeader>
                  <CardTitle className="text-2xl">Accountant</CardTitle>
                  <p className="text-xl font-semibold">Op aanvraag</p>
                  <p className="text-sm text-muted-foreground">Prijsafspraken op basis van klantvolume.</p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm lg:text-base">
                    {[
                      'Multi-client hub',
                      'Werkqueue & beoordelingslijst',
                      'Audittrail & compliance',
                      'Periodebeheer',
                      'BTW-traceerbaarheid',
                      'Klantuitnodigingen',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" className="w-full" onClick={() => navigateTo('/contact')}>
                    Contact opnemen
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </section>

        {/* FAQ teaser */}
        <section className="py-12 border-t border-border/60">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold sm:text-2xl mb-3">Nog vragen over onze pakketten?</h2>
            <p className="text-muted-foreground mb-6">Bekijk onze veelgestelde vragen of neem direct contact op.</p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button variant="outline" onClick={() => navigateTo('/faq')}>
                Veelgestelde vragen
              </Button>
              <Button variant="outline" onClick={() => navigateTo('/contact')}>
                Contact opnemen
              </Button>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
      <CookieBanner />
    </div>
  )
}
