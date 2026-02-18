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
  HandCoins,
  Lock,
  Receipt,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Users,
  Wallet,
  Workflow,
  Wrench,
  X,
  Menu,
  Fingerprint,
} from 'lucide-react'

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
    description: 'Professionele facturen, automatische BTW-berekening.',
  },
  {
    icon: Clock,
    title: 'Urenregistratie',
    description: 'Registreer uren en zet ze direct om in facturen.',
  },
  {
    icon: Receipt,
    title: 'Uitgaven & kostenbeheer',
    description: 'Upload bonnetjes en koppel aan je administratie.',
  },
  {
    icon: CalendarDays,
    title: 'Agenda & planning',
    description: 'Houd overzicht op opdrachten.',
  },
  {
    icon: FileCheck,
    title: 'BTW-aangifte met traceability',
    description: 'Zie exact hoe elke rubriek wordt berekend.',
  },
  {
    icon: Smartphone,
    title: 'Mobiel als app (PWA)',
    description: 'Installeer op iOS en Android.',
  },
]

const accountantModules = [
  'Multi-client hub',
  'Werkqueue',
  'Audit trail',
  'Period locking',
  'PKI signing',
  'BTW/ICP workflows',
  'Compliance logging',
]

const steps = [
  {
    icon: UserPlus,
    title: '1. Account aanmaken (gratis)',
    description: 'Maak binnen een minuut een account aan en start direct met je administratie.',
  },
  {
    icon: Workflow,
    title: '2. Facturen & administratie starten',
    description: 'Beheer facturen, uren en kosten in één centrale workflow.',
  },
  {
    icon: HandCoins,
    title: '3. BTW indienen met volledige controle',
    description: 'Controleer alle berekeningen met transparante auditinformatie.',
  },
]

const testimonials = [
  {
    quote:
      'Ik factureer sneller en zie precies hoe mijn BTW is opgebouwd. Het geeft rust dat alles op één plek staat.',
    author: 'Sanne V., ZZP marketeer',
  },
  {
    quote:
      'Voor ons kantoor is de combinatie van werkqueue en audit trail erg waardevol. We houden beter grip op deadlines.',
    author: 'Teamlead, klein administratiekantoor',
  },
  {
    quote:
      'Als freelancer wil ik geen complex systeem. Dit platform is duidelijk, mobiel en professioneel.',
    author: 'Ruben D., freelance developer',
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
        'Boekhouden en compliance in één slim platform voor ZZP’ers en accountants. Start met 1 maand gratis, daarna €6,95 per maand voor ZZP.',
      )
    }

    ensureMetaDescription()
  }, [])

  const navigation = [
    { name: 'Voor ZZP', href: '#voor-zzp' },
    { name: 'Voor accountants', href: '#voor-accountants' },
    { name: 'Hoe werkt het', href: '#hoe-werkt-het' },
    { name: 'Prijzen', href: '#prijzen' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
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

      <section className="relative overflow-hidden border-b border-primary/10">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/15 via-background to-emerald-700/10" />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Boekhouden en compliance in één slim platform</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Voor ZZP’ers én accountants. Facturen, uren, BTW, audit en PKI — alles geïntegreerd.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="w-full max-w-sm sm:w-auto" onClick={() => navigateTo('/login')}>
                Start 1 maand gratis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="w-full max-w-sm sm:w-auto" onClick={() => scrollToSection('voor-accountants')}>
                Ik ben accountant
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Daarna €6,95 per maand. Geen verplichtingen.</p>
            <p className="mt-2 text-sm font-medium text-primary">Binnen 60 seconden gestart.</p>
          </div>
        </div>
      </section>

      <section id="voor-zzp" className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 sm:mb-10">
            <h2 className="text-2xl font-bold sm:text-4xl">Alles wat een ZZP’er nodig heeft</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {zzpFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <Card key={feature.title} className="border-border/80">
                  <CardHeader>
                    <div className="mb-2 text-emerald-600">
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
            </Button>
          </div>
        </div>
      </section>

      <section id="voor-accountants" className="bg-muted/40 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl">Platform voor accountants</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accountantModules.map((module) => (
              <div key={module} className="flex items-center gap-3 rounded-lg border border-border bg-background p-4">
                <Briefcase className="h-5 w-5 text-emerald-600" />
                <span className="text-sm font-medium">{module}</span>
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

      <section id="hoe-werkt-het" className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl">Hoe werkt het?</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon
              return (
                <Card key={step.title} className="border-border/80">
                  <CardHeader>
                    <div className="mb-2 text-emerald-600">
                      <Icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{step.description}</CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl">Wat zeggen gebruikers</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {testimonials.map((item) => (
              <Card key={item.author} className="border-border/80">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">“{item.quote}”</p>
                  <p className="mt-4 text-sm font-semibold">{item.author}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-4xl">Waarom dit platform?</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {usps.map((usp) => {
              const Icon = usp.icon
              return (
                <Card key={usp.title} className="border-border/80">
                  <CardHeader>
                    <div className="mb-2 text-emerald-600">
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

      <section id="prijzen" className="bg-gradient-to-b from-primary/5 to-muted/30 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold sm:text-center sm:text-4xl">Prijzen</h2>
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="border-primary/50 shadow-lg">
              <CardHeader>
                <CardTitle className="text-2xl">ZZP</CardTitle>
                <p className="text-2xl font-bold text-primary">€0 eerste maand</p>
                <p className="text-muted-foreground">Daarna €6,95 / maand</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {['Facturatie', 'Uren', 'BTW', 'Audit', 'Bankimport', 'Mobiele app'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={() => navigateTo('/login')}>
                  Start 1 maand gratis
                </Button>
              </CardFooter>
            </Card>

            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-2xl">Accountant</CardTitle>
                <p className="text-xl font-semibold">Contact voor prijs</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {accountantModules.slice(0, 6).map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
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

      <footer id="contact" className="border-t border-border bg-muted/50">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div>
            <span className="text-xl font-bold text-primary">Smart Accounting</span>
            <p className="mt-3 text-sm text-muted-foreground">Smart Accounting — Compliance Operating System.</p>
          </div>
          <div className="space-y-3 text-sm">
            <p className="font-medium">Over ons</p>
            <a href="mailto:info@smartaccounting.nl" className="block text-muted-foreground hover:text-foreground">
              Contact
            </a>
            <a href="#" className="block text-muted-foreground hover:text-foreground">
              Support
            </a>
          </div>
          <div className="space-y-3 text-sm">
            <a href="#" className="block text-muted-foreground hover:text-foreground">
              Privacybeleid
            </a>
            <a href="#" className="block text-muted-foreground hover:text-foreground">
              Algemene voorwaarden
            </a>
          </div>
          <div className="space-y-3 text-sm">
            <a href="#" className="block text-muted-foreground hover:text-foreground">
              API
            </a>
            <a href="#" className="block text-muted-foreground hover:text-foreground">
              Security
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
