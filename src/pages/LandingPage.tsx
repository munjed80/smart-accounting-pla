import { useEffect, useState } from 'react'
import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle,
  ClipboardList,
  Clock,
  Download,
  FileCheck,
  FileText,
  GitBranch,
  History,
  Key,
  Lock,
  Receipt,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  UserCheck,
  Users,
  Wallet,
  X,
  Menu,
  Fingerprint,
} from 'lucide-react'
import { MarketingFooter } from '@/components/marketing/Footer'
import { CookieBanner } from '@/components/marketing/CookieBanner'
import { FaqSection } from '@/components/marketing/FaqSection'
import { HowItWorksSection } from '@/components/landing/HowItWorksSection'

const scrollToSection = (id: string) => {
  const section = document.getElementById(id)
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' })
  }
}

const zzpFeatures = [
  {
    icon: FileText,
    title: 'Facturen & betalingen',
    description: 'Professionele facturen, automatische BTW-berekening en directe e-mailverzending naar uw klanten.',
  },
  {
    icon: Receipt,
    title: 'Uitgaven & bonnen',
    description: 'Upload bonnetjes, koppel aan kosten en zie ze direct terug in uw BTW-overzicht.',
  },
  {
    icon: Clock,
    title: 'Urenregistratie',
    description: 'Registreer uren handmatig of via timer en zet ze direct om in factuurregels.',
  },
  {
    icon: CalendarDays,
    title: 'Agenda',
    description: 'Houd grip op opdrachten, deadlines en afspraken in uw geïntegreerde agenda.',
  },
  {
    icon: FileCheck,
    title: 'BTW-overzicht',
    description: 'Zie exact hoe elke rubriek wordt berekend — volledig transparant voor uw aangifte.',
  },
  {
    icon: Download,
    title: 'Exports (PDF/CSV/JSON)',
    description: 'Exporteer facturen als PDF en uw volledige administratie als CSV of JSON voor archivering.',
  },
  {
    icon: Users,
    title: 'Klantenbeheer',
    description: 'Beheer uw klantenbestand, klantgegevens en communicatiehistorie in één overzicht.',
  },
]

const accountantFeatures = [
  { icon: ClipboardList, title: 'Werklijst', description: 'Prioriteer en verwerk openstaande taken per klant vanuit één overzicht.' },
  { icon: UserCheck, title: 'Te beoordelen', description: 'Review en keur facturen en uitgaven van klanten goed of stuur terug.' },
  { icon: Briefcase, title: 'Dossier per klant', description: 'Volledig klantdossier met facturen, uitgaven, uren, BTW en perioden.' },
  { icon: Search, title: 'BTW rubrieken drilldown', description: 'Van rubriek tot bronboeking met toewijzingsreden — volledige traceerbaarheid.' },
  { icon: History, title: 'Audit trail', description: 'Automatische vastlegging van alle acties voor compliance en dossiervorming.' },
  { icon: GitBranch, title: 'Bank matching/reconciliatie', description: 'Koppel bankregels aan boekingen en werk efficiënt met bankimport.', beta: true },
  { icon: Key, title: 'PKI-ondertekening', description: 'Digitale handtekening voor documenten (voorbereid voor toekomstige certificering).', beta: true },
]

const testimonials = [
  {
    quote: 'Eindelijk inzicht in mijn BTW zonder gedoe. Ik zie precies hoe elke rubriek is opgebouwd.',
    initials: 'M.V.',
    author: 'M. Vermeer',
    role: 'ZZP — Freelance ontwerper',
  },
  {
    quote: 'De werkqueue en het audittrail geven ons kantoor echt grip op deadlines en kwaliteit. De drilldown per klant is een uitkomst.',
    initials: 'R.H.',
    author: 'R. Hendriks',
    role: 'Boekhouder — Klein administratiekantoor',
  },
  {
    quote: 'Eenvoudig, mobiel en professioneel. Ik gebruik het dagelijks op mijn telefoon en verstuur facturen onderweg.',
    initials: 'S.B.',
    author: 'S. Bakker',
    role: 'ZZP — Zelfstandig aannemer',
  },
]

const usps = [
  { icon: ClipboardList, title: 'Transparante BTW-berekening' },
  { icon: ShieldCheck, title: 'Volledige audit trail' },
  { icon: Fingerprint, title: 'Compliance-ready' },
  { icon: Smartphone, title: 'Mobiel & veilig' },
  { icon: Wallet, title: 'Eenvoudige prijsstructuur' },
  { icon: Lock, title: 'Controle op toegang en perioden' },
]

export const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    document.title = 'Smart Accounting | Boekhouden en compliance voor ZZP en accountants'

    const ensureMetaDescription = () => {
      let tag = document.querySelector('meta[name="description"]')
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute('name', 'description')
        document.head.appendChild(tag)
      }
      tag.setAttribute(
        'content',
        "Boekhouden en compliance in één slim platform voor ZZP'ers en accountants. Start met 30 dagen gratis, daarna €6,95 per maand voor ZZP.",
      )
    }

    ensureMetaDescription()
  }, [])

  const navigation = [
    { name: 'Voor ZZP', href: '#voor-zzp' },
    { name: 'Voor accountants', href: '#voor-accountants' },
    { name: 'Prijzen', href: '#prijzen' },
    { name: 'FAQ', href: '#faq' },
    { name: 'Help', href: '/help' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <span className="text-lg font-bold text-primary sm:text-xl">Smart Accounting</span>

          <div className="hidden items-center space-x-8 md:flex">
            {navigation.map((item) => (
              <a key={item.name} href={item.href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                {item.name}
              </a>
            ))}
            <Button variant="ghost" onClick={() => navigateTo('/login')}>
              Inloggen
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
            {navigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="block rounded-md px-3 py-2 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.name}
              </a>
            ))}
            <Button variant="ghost" className="mt-2 w-full justify-start" onClick={() => navigateTo('/login')}>
              Inloggen
            </Button>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-primary/10">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/15 via-background to-accent/10" />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <Star className="h-3 w-3" />
              30 dagen gratis uitproberen — geen creditcard vereist
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl lg:tracking-[-0.02em]">Boekhouden en compliance in één slim platform</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg lg:text-xl lg:leading-relaxed">
              Voor ZZP'ers én accountants. Facturen, uren, BTW-overzicht, samenwerking en audit — volledig geïntegreerd.
            </p>
            {/* Dual audience value props */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-2xl mx-auto text-left">
              <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
                <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">Voor ZZP'ers</p>
                <p className="text-xs text-muted-foreground lg:text-sm">Facturen, uitgaven, uren, agenda, BTW-aangifte en export — alles in één app.</p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Voor accountants</p>
                <p className="text-xs text-muted-foreground lg:text-sm">Werklijst, audit trail, BTW-traceerbaarheid, PKI-signing en klantdossiers.</p>
              </div>
            </div>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="w-full max-w-sm sm:w-auto" onClick={() => navigateTo('/login')}>
                Start gratis (30 dagen proefperiode)
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="w-full max-w-sm sm:w-auto" onClick={() => navigateTo('/login')}>
                Inloggen
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">30 dagen gratis, daarna €6,95 per maand. Geen verplichtingen.</p>
            <p className="mt-2 text-sm font-medium" style={{ color: 'var(--accent2)' }}>Binnen 60 seconden gestart.</p>
          </div>
        </div>
      </section>

      {/* Hoe werkt het — 3-step premium workflow */}
      <HowItWorksSection />

      {/* For ZZP */}
      <section id="voor-zzp" className="py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 sm:mb-10">
            <p className="text-sm font-semibold text-accent uppercase tracking-wider mb-2">Voor ZZP'ers</p>
            <h2 className="text-2xl font-bold sm:text-4xl lg:text-5xl">Alles wat een ZZP'er nodig heeft</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl lg:text-lg lg:leading-relaxed">Van eerste factuur tot kwartaalaangifte: alles in één overzichtelijk platform.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {zzpFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <Card key={feature.title} className="border-border/80">
                  <CardHeader>
                    <div className="mb-2" style={{ color: 'oklch(0.72 0.18 150)' }}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-base lg:text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="lg:text-base">{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <div className="mt-8">
            <Button size="lg" onClick={() => navigateTo('/login')}>
              Start gratis (30 dagen proefperiode)
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* For Accountants */}
      <section id="voor-accountants" className="bg-muted/40 py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Voor accountants &amp; kantoren</p>
            <h2 className="text-2xl font-bold sm:text-4xl lg:text-5xl">Platform voor accountants</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl lg:text-lg lg:leading-relaxed">
              Beheer meerdere klantdossiers, houd grip op deadlines en werk efficiënt samen met uw ZZP-klanten.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {accountantFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <div key={feature.title} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium lg:text-base">
                      {feature.title}
                      {feature.beta && (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">(coming soon)</span>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground lg:text-sm">{feature.description}</p>
                </div>
              )
            })}
          </div>
          <div className="mt-8">
            <Button size="lg" variant="outline" onClick={() => navigateTo('/contact')}>
              Contact opnemen
            </Button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-muted/40 py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl lg:text-5xl mb-10">Wat klanten zeggen</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {testimonials.map((item) => (
              <Card key={item.author} className="border-border/80">
                <CardContent className="pt-6">
                  <div className="flex gap-0.5 mb-3">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5" style={{ color: 'var(--accent2)', fill: 'var(--accent2)' }} />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground lg:text-base lg:leading-relaxed">"{item.quote}"</p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary shrink-0">
                      {item.initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.author}</p>
                      <p className="text-xs text-muted-foreground">{item.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why this platform */}
      <section className="py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl lg:text-5xl">Waarom dit platform?</h2>
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
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="border-primary/50 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent" />
              <CardHeader>
                <CardTitle className="text-2xl">ZZP</CardTitle>
                <div>
                  <p className="text-3xl font-bold text-primary">Gratis</p>
                  <p className="text-sm text-muted-foreground">eerste 30 dagen</p>
                </div>
                <p className="text-lg font-semibold">Daarna €6,95 <span className="text-sm font-normal text-muted-foreground">/ maand</span></p>
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
                <Button className="w-full" onClick={() => navigateTo('/login')}>
                  Start 30 dagen gratis
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>

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

      {/* FAQ */}
      <FaqSection />

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
            Start vandaag nog met uw gratis proefperiode van 30 dagen. Geen creditcard, geen verplichtingen.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={() => navigateTo('/login')}>
              Start gratis (30 dagen proefperiode)
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
