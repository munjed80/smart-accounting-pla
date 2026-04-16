import { useState } from 'react'
import { navigateTo } from '@/lib/navigation'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowRight,
  CheckCircle,
  ClipboardList,
  FileText,
  ShieldCheck,
  Smartphone,
  Star,
  Users,
  Wallet,
  X,
  Menu,
} from 'lucide-react'
import { MarketingFooter } from '@/components/marketing/Footer'
import { CookieBanner } from '@/components/marketing/CookieBanner'
import { HowItWorksSection } from '@/components/landing/HowItWorksSection'
import { HeroProductMockup } from '@/components/landing/HeroProductMockup'
import { ProductShowcaseSection } from '@/components/landing/ProductShowcaseSection'




const usps = [
  { icon: FileText, title: 'Professionele facturen in seconden', description: 'Maak en verstuur facturen met een paar klikken. Automatische nummering en PDF-export.' },
  { icon: Smartphone, title: 'Werkt op mobiel & desktop', description: 'Gebruik ZZPers Hub overal — als PWA op je telefoon of in de browser op je laptop.' },
  { icon: ClipboardList, title: 'Transparant BTW-overzicht', description: 'Altijd inzicht in je BTW-verplichtingen met automatische berekeningen en drilldown.' },
  { icon: Wallet, title: 'Eenvoudige, eerlijke prijs', description: 'Geen verborgen kosten. Start gratis, daarna vanaf €4,95 per maand.' },
  { icon: Users, title: 'Klanten en uren op één plek', description: 'Beheer je klanten, registreer uren en zet ze direct om in facturen.' },
  { icon: ShieldCheck, title: 'Veilig en privacybewust', description: 'Je gegevens worden veilig opgeslagen in Europa, volledig AVG-conform.' },
]

export const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useSeoMeta({
    title: "Jouw boekhouding, simpel en duidelijk | ZZPers Hub",
    description: "Altijd weten wat je moet betalen. Facturen, uitgaven, BTW-overzicht en jaaroverzicht op één plek — speciaal voor zzp'ers. Start 90 dagen gratis, daarna €4,99/maand.",
    canonical: 'https://zzpershub.nl/',
  })

  const navigation = [
    { name: 'Functies', href: '#product-showcase' },
    { name: 'Waarom ZZPers Hub?', href: '#waarom' },
    { name: 'Voor boekhouders', href: '#voor-accountants' },
    { name: 'Pakketten', href: '/prijzen' },
    { name: 'FAQ', href: '/faq' },
    { name: 'Help', href: '/help' },
    { name: 'Contact', href: '/contact' },
  ]

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('#')) {
      e.preventDefault()
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
      setMobileMenuOpen(false)
    } else {
      setMobileMenuOpen(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-[3.75rem] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <span className="flex items-center gap-2.5 select-none">
            <span className="logo-icon-container relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-accent/20 ring-1 ring-primary/30">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="text-primary">
                <rect x="3" y="1" width="13" height="17" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M6 6h7M6 10h7M6 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="17" cy="16" r="4" fill="var(--accent)" />
                <text x="17" y="19.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="white" fontFamily="system-ui">€</text>
              </svg>
            </span>
            <span className="brand-shimmer text-lg font-bold sm:text-xl">ZZPers Hub</span>
          </span>

          <div className="hidden items-center space-x-6 md:flex">
            {navigation.map((item) => (
              <a key={item.name} href={item.href} onClick={(e) => handleNavClick(e, item.href)} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                {item.name}
              </a>
            ))}
            <Button variant="ghost" onClick={() => navigateTo('/login')}>
              Inloggen
            </Button>
            <Button size="sm" onClick={() => navigateTo('/register')}>
              Start gratis
            </Button>
          </div>

          <div className="md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen((open) => !open)}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-border px-2 pb-3 pt-2 md:hidden">
            <div className="flex items-center gap-2 px-3 py-2 mb-1">
              <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-accent/20 ring-1 ring-primary/30">
                <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="text-primary">
                  <rect x="3" y="1" width="13" height="17" rx="2" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M6 6h7M6 10h7M6 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="17" cy="16" r="4" fill="var(--accent)" />
                  <text x="17" y="19.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="white" fontFamily="system-ui">€</text>
                </svg>
              </span>
              <span className="brand-shimmer text-base font-bold">ZZPers Hub</span>
            </div>
            {navigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="block rounded-md px-3 py-2 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => handleNavClick(e, item.href)}
              >
                {item.name}
              </a>
            ))}
            <Button variant="ghost" className="mt-2 w-full justify-start" onClick={() => navigateTo('/login')}>
              Inloggen
            </Button>
            <Button className="mt-2 w-full" onClick={() => navigateTo('/register')}>
              Start gratis
            </Button>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-primary/10">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/15 via-background to-accent/10" />
        <div className="hero-glow-bg absolute inset-0 -z-10" />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
            {/* Left — text content */}
            <div className="flex-1 text-center lg:text-left">
              {/* Premium badge */}
              <div className="hero-badge-premium mb-6 inline-flex items-center gap-2 rounded-full border border-accent/45 bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent shadow-[inset_0_1px_0_oklch(1_0_0/0.08),0_1px_8px_oklch(0_0_0/0.25)] backdrop-blur-sm">
                <Star className="h-3.5 w-3.5 shrink-0 fill-current opacity-90" />
                <span>90 dagen gratis uitproberen — geen creditcard vereist</span>
              </div>
              {/* Headline */}
              <h1 className="text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl lg:tracking-[-0.03em]">
                <span className="block">Jouw boekhouding,</span>
                <span className="hero-gradient-text block">simpel en duidelijk</span>
              </h1>
              {/* Subtitle */}
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0 lg:mt-6 lg:max-w-lg lg:text-xl lg:leading-[1.7]">
                Facturen, uitgaven, BTW-overzicht en jaaroverzicht — alles op één plek. Speciaal voor zzp'ers, zonder boekhoudkennis.
              </p>
              {/* ZZP feature highlights */}
              <div className="mt-7 flex flex-wrap justify-center gap-2 lg:justify-start">
                {['Facturen', 'Klanten', 'Uren', 'Uitgaven', 'BTW-overzicht', 'Mobiel'].map((label) => (
                  <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-semibold text-accent/95 shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] transition-all duration-150 hover:border-accent/50 hover:bg-accent/15 hover:shadow-[0_0_8px_oklch(0.75_0.22_150/0.2)]">
                    <CheckCircle className="h-3 w-3 shrink-0" />
                    {label}
                  </span>
                ))}
              </div>
              {/* CTA buttons */}
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <Button
                  size="lg"
                  className="btn-premium-glow w-full max-w-sm sm:w-auto"
                  onClick={() => navigateTo('/register')}
                >
                  Start gratis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full max-w-sm border-border/60 transition-colors hover:border-primary/40 hover:bg-primary/5 sm:w-auto"
                  onClick={() => navigateTo('/login')}
                >
                  Inloggen
                </Button>
              </div>
              {/* Helper text */}
              <div className="mt-5 space-y-1.5">
                <p className="text-sm text-muted-foreground">90 dagen gratis, daarna €4,99 per maand. Geen verplichtingen.</p>
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold lg:justify-start" style={{ color: 'var(--accent2)' }}>
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                  Binnen 60 seconden gestart.
                </p>
              </div>
            </div>

            {/* Right — product visual */}
            <div className="w-full flex-shrink-0 px-4 sm:px-8 lg:w-[52%] lg:px-0">
              <HeroProductMockup />
            </div>
          </div>
        </div>
      </section>

      {/* Hoe werkt het — 3-step premium workflow */}
      <HowItWorksSection />

      {/* For Accountants — secondary, brief mention */}
      <section id="voor-accountants" className="bg-muted/40 py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Samenwerken met boekhouder</p>
            <h2 className="text-2xl font-bold sm:text-4xl lg:text-5xl">Nodig je boekhouder uit</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl lg:text-lg lg:leading-relaxed">
              Wil je je administratie delen met een boekhouder of accountant? Dat kan met één klik. Zij krijgen leestoegang tot jouw dossier — jij behoudt altijd de controle.
            </p>
          </div>
          <div className="mt-8">
            <Button size="lg" variant="outline" onClick={() => navigateTo('/contact')}>
              Contact opnemen
            </Button>
          </div>
        </div>
      </section>

      {/* Trust section — factual statements, no fake testimonials */}
      <section className="py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl lg:text-5xl mb-3">Gebouwd voor de Nederlandse markt</h2>
          <p className="text-muted-foreground max-w-2xl mb-10 lg:text-lg">Vertrouwd, transparant en volledig conform Nederlandse regelgeving.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: CheckCircle, text: 'Nederlandse BTW-tarieven en rubrieken ingebouwd' },
              { icon: CheckCircle, text: 'Voldoet aan Nederlandse boekhoudregels' },
              { icon: CheckCircle, text: 'Gegevens veilig opgeslagen in Europa' },
              { icon: CheckCircle, text: 'KvK: 69779716 — Alkmaar' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.text} className="flex items-start gap-3 rounded-lg border border-border/80 bg-background p-4">
                  <Icon className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                  <p className="text-sm font-medium lg:text-base">{item.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Why this platform */}
      <section id="waarom" className="py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl lg:text-5xl">Waarom ZZPers Hub?</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl lg:text-lg">Gemaakt voor zzp'ers die snel willen werken zonder gedoe.</p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {usps.map((usp) => {
              const Icon = usp.icon
              return (
                <Card key={usp.title} className="border-border/80">
                  <CardHeader>
                    <div className="mb-2 text-accent">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg lg:text-xl">{usp.title}</CardTitle>
                    <CardDescription>{usp.description}</CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="prijzen" className="bg-gradient-to-b from-primary/5 to-muted/30 py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-center sm:text-4xl lg:text-5xl mb-2">Prijzen</h2>
          <p className="text-muted-foreground sm:text-center mb-10 lg:text-lg">Eenvoudig en transparant — geen verborgen kosten.</p>
          <div className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            {/* Free */}
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-2xl">Free</CardTitle>
                <div>
                  <p className="text-3xl font-bold text-primary">Gratis</p>
                  <p className="text-sm text-muted-foreground">3 maanden gratis</p>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm lg:text-base">
                  {['Facturatie (max 5 facturen)', 'Klantbeheer (max 3 klanten)', 'BTW-overzicht (basis)', 'Mobiele app (PWA)'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-accent shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full" onClick={() => navigateTo('/register')}>
                  Start gratis maand
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>

            {/* Starter */}
            <Card className="border-primary/50 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent" />
              <CardHeader>
                <CardTitle className="text-2xl">Starter</CardTitle>
                <div>
                  <p className="text-3xl font-bold text-primary">€4,99 <span className="text-sm font-normal text-muted-foreground">/ maand</span></p>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm lg:text-base">
                  {['Facturatie & klantbeheer', 'Urenregistratie', 'BTW-overzicht met drilldown', 'Uitgaven & bonnetjes', 'Bankimport', 'Mobiele app (PWA)', 'Accountant uitnodigen'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-accent shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={() => navigateTo('/register')}>
                  Kies Starter
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>

            {/* Pro */}
            <Card className="border-primary/50 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-accent to-primary" />
              <CardHeader>
                <CardTitle className="text-2xl">Pro</CardTitle>
                <div>
                  <p className="text-3xl font-bold text-primary">€6,95 <span className="text-sm font-normal text-muted-foreground">/ maand</span></p>
                  <p className="text-sm text-muted-foreground"><s>€11,99</s> — introductieprijs</p>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm lg:text-base">
                  {[
                    'Alles van Starter',
                    'BTW-aangifte met Digipoort',
                    'Bankrekening koppeling',
                    'Exports (PDF, CSV)',
                    '10 GB opslag',
                    'Prioriteit support',
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
                  Kies Pro
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Accountant card below */}
          <div className="mx-auto mt-6 max-w-5xl">
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-2xl">Accountant</CardTitle>
                <p className="text-xl font-semibold">Op aanvraag</p>
                <p className="text-sm text-muted-foreground">Prijsafspraken op basis van klantvolume.</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm lg:text-base">
                  {['Multi-client hub', 'Werkqueue & beoordelingslijst', 'Audittrail & compliance', 'Periodebeheer', 'BTW-traceerbaarheid', 'Klantuitnodigingen'].map((item) => (
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

      {/* Product Showcase */}
      <ProductShowcaseSection />

      {/* Help / Startgids */}
      <section className="py-14 sm:py-16 lg:py-24 border-t border-border/60">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold sm:text-3xl lg:text-4xl mb-3">Hulp nodig om te starten?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto lg:text-lg">Onze uitgebreide startgids helpt u snel op weg — van account aanmaken tot BTW-aangifte.</p>
          <Button variant="outline" size="lg" onClick={() => navigateTo('/help')}>
            Bekijk de Startgids
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-accent/5 py-14 sm:py-20 lg:py-28 border-t border-primary/10">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl lg:text-5xl">Klaar om te beginnen?</h2>
          <p className="mt-4 text-muted-foreground lg:text-lg lg:leading-relaxed">
            Start vandaag nog met uw gratis proefperiode van 90 dagen. Geen creditcard, geen verplichtingen.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={() => navigateTo('/register')}>
              Start gratis
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigateTo('/contact')}>
              Contact opnemen
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <MarketingFooter />

      {/* Cookie Banner */}
      <CookieBanner />
    </div>
  )
}
