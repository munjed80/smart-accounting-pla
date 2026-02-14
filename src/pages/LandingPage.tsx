import { useState } from 'react'
import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  ChevronDown, 
  CheckCircle, 
  Users, 
  FileText, 
  Calculator, 
  Clock, 
  Receipt, 
  Calendar,
  FolderOpen,
  ListChecks,
  ShieldCheck,
  ArrowRight,
  Menu,
  X
} from 'lucide-react'

// FeatureCard Component
interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
  return (
    <Card className="h-full border border-primary/10 bg-gradient-to-br from-background to-primary/5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl">
      <CardHeader>
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          {icon}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardContent>
    </Card>
  )
}

// PricingCard Component
interface PricingCardProps {
  title: string
  price: string
  features: string[]
  comingSoon?: boolean
  highlighted?: boolean
}

const PricingCard = ({ title, price, features, comingSoon = false, highlighted = false }: PricingCardProps) => {
  return (
    <Card className={`relative border ${highlighted ? 'scale-105 border-primary/50 bg-gradient-to-b from-primary/10 to-background shadow-2xl shadow-primary/15' : 'border-border bg-background/95'} transition-all duration-300 hover:shadow-xl`}>
      {comingSoon && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-semibold">
          Binnenkort
        </div>
      )}
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <div className="mt-4">
          <span className="text-4xl font-bold">{price}</span>
          {price !== 'Op maat' && <span className="text-muted-foreground">/maand</span>}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          variant={highlighted ? 'default' : 'outline'}
          onClick={() => navigateTo('/login')}
          disabled={comingSoon}
        >
          {comingSoon ? 'Binnenkort beschikbaar' : 'Start nu'}
        </Button>
      </CardFooter>
    </Card>
  )
}

// FAQItem Component
interface FAQItemProps {
  question: string
  answer: string
  isOpen: boolean
  onToggle: () => void
}

const FAQItem = ({ question, answer, isOpen, onToggle }: FAQItemProps) => {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        className="w-full py-4 px-6 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <span className="font-semibold text-foreground">{question}</span>
        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="px-6 pb-4">
          <p className="text-muted-foreground">{answer}</p>
        </div>
      )}
    </div>
  )
}

export const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  const navigation = [
    { name: 'Product', href: '#product' },
    { name: 'ZZP', href: '#zzp' },
    { name: 'Boekhouder', href: '#boekhouder' },
    { name: 'Prijzen', href: '#prijzen' },
    { name: 'FAQ', href: '#faq' },
  ]

  const zzpFeatures = [
    {
      icon: <Users className="h-8 w-8" />,
      title: 'Klanten',
      description: 'Beheer al je klanten op één centrale plek. Overzichtelijk en georganiseerd.'
    },
    {
      icon: <FileText className="h-8 w-8" />,
      title: 'Facturen + PDF',
      description: 'Maak professionele facturen in seconden. Exporteer als PDF en verstuur direct.'
    },
    {
      icon: <Calculator className="h-8 w-8" />,
      title: 'BTW',
      description: 'Automatische BTW-berekening en -rapportage. Blijf compliant zonder gedoe.'
    },
    {
      icon: <Clock className="h-8 w-8" />,
      title: 'Uren inklokken/uitklokken',
      description: 'Track je tijd eenvoudig. Klok in en uit met één klik voor accurate urenregistratie.'
    },
    {
      icon: <Receipt className="h-8 w-8" />,
      title: 'Uitgaven scan',
      description: 'Scan bonnetjes met je telefoon. AI verwerkt automatisch je uitgaven.'
    },
    {
      icon: <Calendar className="h-8 w-8" />,
      title: 'Agenda',
      description: 'Houd al je afspraken bij. Synchroniseer met je werkzaamheden.'
    }
  ]

  const accountantFeatures = [
    {
      icon: <FolderOpen className="h-8 w-8" />,
      title: 'Dossiers',
      description: 'Overzichtelijk dossierbeheer voor al je klanten. Alle informatie centraal.'
    },
    {
      icon: <ListChecks className="h-8 w-8" />,
      title: 'Issues/Werklijst',
      description: 'Geautomatiseerde werklijst met aandachtspunten. Mis nooit meer iets belangrijks.'
    },
    {
      icon: <ShieldCheck className="h-8 w-8" />,
      title: 'Review/Goedkeuren',
      description: 'Efficiënte review-workflow. Keur transacties en documenten snel goed.'
    },
    {
      icon: <CheckCircle className="h-8 w-8" />,
      title: 'Consent workflow',
      description: 'Gestructureerde toestemmingsflow voor nieuwe klanten en wijzigingen.'
    }
  ]

  const steps = [
    {
      step: '1',
      title: 'Maak een account',
      description: 'Registreer gratis in 2 minuten. Kies je rol: ZZP\'er of Boekhouder.'
    },
    {
      step: '2',
      title: 'Stel je administratie in',
      description: 'Importeer je gegevens of start vanaf nul. Onze wizard begeleidt je.'
    },
    {
      step: '3',
      title: 'Begin met werken',
      description: 'Facturen maken, uren bijhouden, uitgaven scannen. Alles in één platform.'
    }
  ]

  const faqItems = [
    {
      question: 'Is Smart Accounting geschikt voor mijn situatie?',
      answer: 'Smart Accounting is speciaal ontwikkeld voor ZZP\'ers en hun boekhouders. Of je nu net begint of al jaren actief bent, ons platform groeit mee met je bedrijf.'
    },
    {
      question: 'Hoe werkt de samenwerking met mijn boekhouder?',
      answer: 'Je boekhouder krijgt real-time toegang tot je administratie via een consent workflow. Jullie kunnen samen werken aan je financiën, met duidelijke goedkeuringsprocessen.'
    },
    {
      question: 'Is mijn data veilig?',
      answer: 'Absoluut. We voldoen aan alle EU privacy-wetgeving (AVG/GDPR). Je data wordt versleuteld opgeslagen en alleen jij en je geautoriseerde boekhouder hebben toegang.'
    },
    {
      question: 'Kan ik mijn bestaande administratie importeren?',
      answer: 'Ja, we ondersteunen import van veelgebruikte formaten. Ons support team helpt je graag bij de migratie van je bestaande systeem.'
    },
    {
      question: 'Wat gebeurt er als ik van abonnement wil wisselen?',
      answer: 'Je kunt altijd up- of downgraden. Wijzigingen gaan direct in en we berekenen pro rata voor de resterende periode.'
    },
    {
      question: 'Krijg ik support als ik vastloop?',
      answer: 'Ja! Alle abonnementen bevatten email support. Pro en Boekhouder abonnementen krijgen prioriteit support en toegang tot onze kennisbank.'
    }
  ]

  const pricingPlans = [
    {
      title: 'Starter',
      price: '€19',
      features: [
        'Tot 10 facturen per maand',
        'Basis klantenbeheer',
        'BTW-rapportage',
        'Uitgaven scan',
        'Email support'
      ],
      comingSoon: false,
      highlighted: false
    },
    {
      title: 'Pro',
      price: '€39',
      features: [
        'Onbeperkt facturen',
        'Geavanceerd klantenbeheer',
        'BTW-rapportage',
        'Uitgaven scan + AI categorisatie',
        'Uren tracking',
        'Agenda integratie',
        'Boekhouder samenwerking',
        'Prioriteit support'
      ],
      comingSoon: false,
      highlighted: true
    },
    {
      title: 'Boekhouder',
      price: 'Op maat',
      features: [
        'Onbeperkt klantdossiers',
        'Geautomatiseerde werklijst',
        'Review & goedkeuringsflow',
        'Bulk operaties',
        'Grootboek & rapportage',
        'White-label optie',
        'Dedicated account manager',
        'API toegang'
      ],
      comingSoon: true,
      highlighted: false
    }
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-primary">Smart Accounting</span>
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.name}
                </a>
              ))}
              <Button variant="ghost" onClick={() => navigateTo('/login')}>
                Inloggen
              </Button>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="block px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                </a>
              ))}
              <div className="px-3 py-2">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    navigateTo('/login')
                  }}
                >
                  Inloggen
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-primary/10">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/20 via-background to-secondary/10" />
        <div className="absolute -top-24 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
          <div className="text-center">
            <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-4 py-1 text-sm font-medium text-primary">
              Slim boekhouden voor moderne ondernemers
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
              Boekhouden voor ZZP'ers,
              <span className="text-primary block mt-2">sneller dan ooit tevoren</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto">
              Facturen, BTW-aangifte, urenregistratie, uitgaven scannen en naadloze samenwerking met je boekhouder. 
              Alles in één slim platform.
            </p>
            
            {/* CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="text-lg px-8 py-6"
                onClick={() => navigateTo('/login')}
              >
                Start gratis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="text-lg px-8 py-6"
                onClick={() => navigateTo('/login')}
              >
                Inloggen
              </Button>
            </div>

            {/* Benefits */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
              <div className="rounded-xl border border-primary/15 bg-background/75 p-4 text-left shadow-sm backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">Geen creditcard nodig</p>
                </div>
              </div>
              <div className="rounded-xl border border-primary/15 bg-background/75 p-4 text-left shadow-sm backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">14 dagen gratis proberen</p>
                </div>
              </div>
              <div className="rounded-xl border border-primary/15 bg-background/75 p-4 text-left shadow-sm backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">Opzeggen wanneer je wilt</p>
                </div>
              </div>
            </div>

            {/* EU/Privacy Note */}
            <div className="mt-8">
              <p className="text-xs text-muted-foreground">
                🔒 100% EU privacy compliant (AVG/GDPR) • Data versleuteld opgeslagen in Nederland
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Trust Strip */}
      <section id="product" className="border-y border-border bg-gradient-to-r from-muted/40 to-primary/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <p className="text-sm font-semibold text-primary mb-4">VERTROUWD DOOR PROFESSIONALS</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center justify-items-center">
              <div className="text-2xl font-bold text-muted-foreground">500+ ZZP'ers</div>
              <div className="text-2xl font-bold text-muted-foreground">50+ Boekhouders</div>
              <div className="text-2xl font-bold text-muted-foreground">99.9% Uptime</div>
              <div className="text-2xl font-bold text-muted-foreground">AVG Compliant</div>
            </div>
          </div>
        </div>
      </section>

      {/* Voor ZZP Section */}
      <section id="zzp" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Voor ZZP'ers</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Alle tools die je nodig hebt om je administratie efficiënt te beheren
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {zzpFeatures.map((feature, index) => (
              <FeatureCard key={index} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Voor Boekhouders Section */}
      <section id="boekhouder" className="py-20 bg-gradient-to-b from-muted/40 to-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Voor Boekhouders</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Professionele tools voor efficiënt dossierbeheer en samenwerking
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {accountantFeatures.map((feature, index) => (
              <FeatureCard key={index} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Hoe werkt het Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Hoe werkt het?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              In 3 simpele stappen aan de slag
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-lg shadow-primary/30">
                    {step.step}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="prijzen" className="py-20 bg-gradient-to-b from-primary/5 to-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Transparante prijzen</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Kies het plan dat bij jou past. Altijd opzegbaar, geen verborgen kosten.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <PricingCard key={index} {...plan} />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Veelgestelde vragen</h2>
            <p className="text-lg text-muted-foreground">
              Alles wat je moet weten over Smart Accounting
            </p>
          </div>
          <Card className="border-primary/15 shadow-lg shadow-primary/10">
            <CardContent className="p-0">
              {faqItems.map((faq, index) => (
                <FAQItem
                  key={index}
                  question={faq.question}
                  answer={faq.answer}
                  isOpen={openFaqIndex === index}
                  onToggle={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <span className="text-xl font-bold text-primary">Smart Accounting</span>
              <p className="mt-4 text-sm text-muted-foreground max-w-md">
                Het slimme boekhoudplatform voor ZZP'ers en boekhouders. 
                Moderne administratie zonder gedoe.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Juridisch</h3>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                    Algemene Voorwaarden
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                    Cookie Policy
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Contact</h3>
              <ul className="space-y-2">
                <li>
                  <a href="mailto:info@smartaccounting.nl" className="text-sm text-muted-foreground hover:text-foreground">
                    info@smartaccounting.nl
                  </a>
                </li>
                <li>
                  <Button 
                    variant="link" 
                    className="text-sm p-0 h-auto text-muted-foreground hover:text-foreground"
                    onClick={() => navigateTo('/login')}
                  >
                    Inloggen
                  </Button>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border">
            <p className="text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} Smart Accounting Platform. Alle rechten voorbehouden.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
