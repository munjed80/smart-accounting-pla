import { useEffect, useState } from 'react'
import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowRight,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle,
  ClipboardList,
  Clock,
  FileCheck,
  FileText,
  Lock,
  Receipt,
  ShieldCheck,
  Smartphone,
  Star,
  UserPlus,
  Wallet,
  X,
  Menu,
  Fingerprint,
} from 'lucide-react'
import { MarketingFooter } from '@/components/marketing/Footer'
import { CookieBanner } from '@/components/marketing/CookieBanner'
import { FaqSection } from '@/components/marketing/FaqSection'

const scrollToSection = (id: string) => {
  const section = document.getElementById(id)
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' })
  }
}

const zzpFeatures = [
  {
    icon: FileText,
    title: 'Facturen maken en versturen',
    description: 'Professionele facturen, automatische BTW-berekening en directe e-mailverzending naar uw klanten.',
  },
  {
    icon: Clock,
    title: 'Urenregistratie',
    description: 'Registreer uren handmatig of via timer en zet ze direct om in factuurregels.',
  },
  {
    icon: Receipt,
    title: 'Uitgaven & bonnetjes',
    description: 'Upload bonnetjes, koppel aan kosten en zie ze direct terug in uw BTW-overzicht.',
  },
  {
    icon: CalendarDays,
    title: 'Klanten & agenda',
    description: 'Beheer uw klantenbestand en houd grip op opdrachten en deadlines.',
  },
  {
    icon: FileCheck,
    title: 'BTW-overzicht met drilldown',
    description: 'Zie exact hoe elke rubriek wordt berekend — volledig transparant voor uw aangifte.',
  },
  {
    icon: Smartphone,
    title: 'Mobiel als app (PWA)',
    description: 'Installeer op iOS en Android. Altijd toegankelijk, ook offline.',
  },
]

const accountantFeatures = [
  { title: 'Multi-client hub', description: 'Beheer alle klantdossiers vanuit één overzicht.' },
  { title: 'Werkqueue', description: 'Prioriteer en verwerk openstaande taken per klant.' },
  { title: 'BTW-traceerbaarheid', description: 'Volledig audittrail van rubriek tot bronboek.' },
  { title: 'Periodebeheer', description: 'Sluit perioden af en voorkom terugwerkende aanpassingen.' },
  { title: 'Beoordelingslijst', description: 'Review en goedkeur facturen en uitgaven van klanten.' },
  { title: 'Bankreconciliatie', description: 'Koppel bankregels aan boekingen.', beta: true },
  { title: 'PKI-ondertekening', description: 'Digitale handtekening voor documenten.', beta: true },
  { title: 'Compliance logging', description: 'Automatische vastlegging van alle acties voor dossiervorming.' },
]

const steps = [
  {
    icon: UserPlus,
    step: '1',
    title: 'Account aanmaken (gratis)',
    description: 'Maak binnen een minuut een account aan en start uw 30 dagen gratis proef.',
  },
  {
    icon: Building2,
    step: '2',
    title: 'Uw administratie inrichten',
    description: 'Voer uw bedrijfsgegevens, BTW-nummer en eerste klant in.',
  },
  {
    icon: FileText,
    step: '3',
    title: 'Facturen sturen',
    description: 'Maak uw eerste factuur en verzend direct als PDF per e-mail.',
  },
  {
    icon: Receipt,
    step: '4',
    title: 'Kosten en uren bijhouden',
    description: 'Upload bonnetjes en registreer gewerkte uren per project.',
  },
  {
    icon: FileCheck,
    step: '5',
    title: 'BTW controleren & indienen',
    description: 'Controleer uw BTW-overzicht met volledige drilldown en dien in met vertrouwen.',
  },
]

const testimonials = [
  {
    quote: 'Eindelijk inzicht in mijn BTW zonder gedoe. Ik zie precies hoe elke rubriek is opgebouwd.',
    author: 'ZZP-gebruiker',
    role: 'Freelance marketeer',
  },
  {
    quote: 'De werkqueue en het audittrail geven ons kantoor echt grip op deadlines en kwaliteit.',
    author: 'Accountant',
    role: 'Klein administratiekantoor',
  },
  {
    quote: 'Eenvoudig, mobiel en professioneel. Ik gebruik het dagelijks op mijn telefoon.',
    author: 'Klein bedrijf',
    role: 'Zelfstandig ondernemer',
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
    { name: 'Hoe werkt het', href: '#hoe-werkt-het' },
    { name: 'Prijzen', href: '#prijzen' },
    { name: 'FAQ', href: '#faq' },
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
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <Star className="h-3 w-3" />
              30 dagen gratis uitproberen — geen creditcard vereist
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Boekhouden en compliance in één slim platform</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Voor ZZP'ers én accountants. Facturen, uren, BTW-overzicht, samenwerking en audit — volledig geïntegreerd.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="w-full max-w-sm sm:w-auto" onClick={() => navigateTo('/login')}>
                Start gratis proefperiode
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="w-full max-w-sm sm:w-auto" onClick={() => scrollToSection('voor-accountants')}>
                Ik ben accountant
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">30 dagen gratis, daarna €6,95 per maand. Geen verplichtingen.</p>
            <p className="mt-2 text-sm font-medium" style={{ color: 'var(--accent2)' }}>Binnen 60 seconden gestart.</p>
          </div>
        </div>
      </section>

      {/* For ZZP */}
      <section id="voor-zzp" className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 sm:mb-10">
            <p className="text-sm font-semibold text-accent uppercase tracking-wider mb-2">Voor ZZP'ers</p>
            <h2 className="text-2xl font-bold sm:text-4xl">Alles wat een ZZP'er nodig heeft</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl">Van eerste factuur tot kwartaalaangifte: alles in één overzichtelijk platform.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {zzpFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <Card key={feature.title} className="border-border/80">
                  <CardHeader>
                    <div className="mb-2 text-accent">
                      <Icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <div className="mt-8">
            <Button size="lg" onClick={() => navigateTo('/login')}>
              Start gratis proefperiode
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* For Accountants */}
      <section id="voor-accountants" className="bg-muted/40 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Voor accountants &amp; kantoren</p>
            <h2 className="text-2xl font-bold sm:text-4xl">Platform voor accountants</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl">
              Beheer meerdere klantdossiers, houd grip op deadlines en werk efficiënt samen met uw ZZP-klanten.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {accountantFeatures.map((feature) => (
              <div key={feature.title} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">
                    {feature.title}
                    {feature.beta && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">(Coming soon)</span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Button size="lg" variant="outline" onClick={() => scrollToSection('contact')}>
              Neem contact op
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="hoe-werkt-het" className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl mb-2">Hoe werkt het?</h2>
          <p className="text-muted-foreground mb-10">In 5 stappen van aanmelding tot BTW-aangifte.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((step) => {
              const Icon = step.icon
              return (
                <Card key={step.title} className="border-border/80">
                  <CardHeader>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {step.step}
                      </span>
                    </div>
                    <div className="mb-1 text-accent">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-sm">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-xs">{step.description}</CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-muted/40 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl mb-10">Wat zeggen gebruikers</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {testimonials.map((item) => (
              <Card key={item.author} className="border-border/80">
                <CardContent className="pt-6">
                  <div className="flex gap-0.5 mb-3">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5" style={{ color: 'var(--accent2)', fill: 'var(--accent2)' }} />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">"{item.quote}"</p>
                  <div className="mt-4">
                    <p className="text-sm font-semibold">{item.author}</p>
                    <p className="text-xs text-muted-foreground">{item.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why this platform */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl">Waarom dit platform?</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {usps.map((usp) => {
              const Icon = usp.icon
              return (
                <Card key={usp.title} className="border-border/80">
                  <CardHeader>
                    <div className="mb-2 text-accent">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">{usp.title}</CardTitle>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="prijzen" className="bg-gradient-to-b from-primary/5 to-muted/30 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-center sm:text-4xl mb-2">Prijzen</h2>
          <p className="text-muted-foreground sm:text-center mb-10">Eenvoudig en transparant — geen verborgen kosten.</p>
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
                <ul className="space-y-2 text-sm">
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
                <ul className="space-y-2 text-sm">
                  {['Multi-client hub', 'Werkqueue & beoordelingslijst', 'Audittrail & compliance', 'Periodebeheer', 'BTW-traceerbaarheid', 'Klantuitnodigingen'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full" onClick={() => scrollToSection('contact')}>
                  Neem contact op
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection />

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-accent/5 py-14 sm:py-20 border-t border-primary/10">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl">Klaar om te beginnen?</h2>
          <p className="mt-4 text-muted-foreground">
            Start vandaag nog met uw gratis proefperiode van 30 dagen. Geen creditcard, geen verplichtingen.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={() => navigateTo('/login')}>
              Start gratis proefperiode
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollToSection('contact')}>
              Neem contact op
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
