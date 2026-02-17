import { useState } from 'react'
import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  CheckCircle, 
  FileText, 
  Calculator, 
  Clock, 
  Receipt,
  CreditCard,
  ListChecks,
  ShieldCheck,
  ArrowRight,
  Menu,
  X,
  Lock,
  Users,
  FileSignature,
  FolderLock
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

// TrustCard Component
interface TrustCardProps {
  icon: React.ReactNode
  title: string
}

const TrustCard = ({ icon, title }: TrustCardProps) => {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-4">
      <div className="flex-shrink-0 text-primary">
        {icon}
      </div>
      <span className="text-sm font-medium">{title}</span>
    </div>
  )
}

export const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navigation = [
    { name: 'ZZP', href: '#zzp' },
    { name: 'Accountants', href: '#accountant' },
    { name: 'Prijzen', href: '#prijzen' },
  ]

  const zzpFeatures = [
    {
      icon: <FileText className="h-8 w-8" />,
      title: 'Facturen maken en versturen',
      description: 'Professionele facturen aanmaken en direct versturen naar klanten.'
    },
    {
      icon: <Clock className="h-8 w-8" />,
      title: 'Urenregistratie',
      description: 'Eenvoudig uren bijhouden per project en klant.'
    },
    {
      icon: <Receipt className="h-8 w-8" />,
      title: 'Uitgaven beheren',
      description: 'Scan bonnetjes en beheer je zakelijke uitgaven.'
    },
    {
      icon: <CreditCard className="h-8 w-8" />,
      title: 'Bankaflettering met slimme match',
      description: 'Automatische bankaflettering met intelligente match voorstellen.'
    },
    {
      icon: <Calculator className="h-8 w-8" />,
      title: 'BTW aangifte met herkomst per rubriek',
      description: 'Volledige BTW lifecycle met onderbouwing per aangifteregel.'
    },
    {
      icon: <FileSignature className="h-8 w-8" />,
      title: 'Verplichtingen (lease, abonnementen)',
      description: 'Beheer terugkerende verplichtingen zoals lease en abonnementen.'
    }
  ]

  const accountantFeatures = [
    {
      icon: <ListChecks className="h-8 w-8" />,
      title: 'Werkoverzicht per klant',
      description: 'Centraal werkoverzicht voor alle klanten met prioriteiten.'
    },
    {
      icon: <Calculator className="h-8 w-8" />,
      title: 'BTW lifecycle + ondertekening',
      description: 'Volledige BTW flow met PKI ondertekening voor officiële indiening.'
    },
    {
      icon: <ShieldCheck className="h-8 w-8" />,
      title: 'Volledige audittrail',
      description: 'Alle wijzigingen worden gelogd met drilldown mogelijkheden.'
    },
    {
      icon: <FolderLock className="h-8 w-8" />,
      title: 'Periodevergrendeling',
      description: 'Vergrendel periodes na afronding voor data integriteit.'
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: 'Multi-client overzicht',
      description: 'Beheer meerdere klanten vanuit één centraal dashboard.'
    }
  ]

  const trustFeatures = [
    {
      icon: <Lock className="h-5 w-5" />,
      title: 'Gegevens blijven in Nederland/EU'
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: 'Rolgebaseerde toegang (machtigingen)'
    },
    {
      icon: <FileSignature className="h-5 w-5" />,
      title: 'Ondertekende aangiftes'
    },
    {
      icon: <CheckCircle className="h-5 w-5" />,
      title: 'Geen advertenties'
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
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
              Boekhouden zonder gedoe.
              <span className="text-primary block mt-2">Volledige controle voor ZZP en accountant.</span>
            </h1>
            <div className="mt-6 text-base sm:text-lg text-muted-foreground max-w-3xl mx-auto space-y-2">
              <p>• BTW aangifte met volledige herkomst</p>
              <p>• Bankaflettering met slimme voorstellen</p>
              <p>• Audittrail en periodevergrendeling</p>
              <p>• Klaar voor officiële indiening</p>
            </div>
            
            {/* CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="text-lg px-8 py-6"
                onClick={() => navigateTo('/login')}
              >
                Start voor €6,95 per maand
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="text-lg px-8 py-6"
                onClick={() => {
                  const contactSection = document.getElementById('contact')
                  if (contactSection) {
                    contactSection.scrollIntoView({ behavior: 'smooth' })
                  }
                }}
              >
                Ik ben accountant
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Voor ZZP Section */}
      <section id="zzp" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Voor ZZP</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {zzpFeatures.map((feature, index) => (
              <FeatureCard key={index} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Voor Accountants Section */}
      <section id="accountant" className="py-20 bg-gradient-to-b from-muted/40 to-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Voor accountants</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {accountantFeatures.map((feature, index) => (
              <FeatureCard key={index} {...feature} />
            ))}
          </div>
          <div className="text-center">
            <Button 
              size="lg"
              variant="outline"
              onClick={() => {
                const contactSection = document.getElementById('contact')
                if (contactSection) {
                  contactSection.scrollIntoView({ behavior: 'smooth' })
                }
              }}
            >
              Neem contact op
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="prijzen" className="py-20 bg-gradient-to-b from-primary/5 to-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Eenvoudige prijs</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* ZZP Plan */}
            <Card className="border border-primary/50 bg-gradient-to-b from-primary/10 to-background shadow-xl">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">ZZP Plan</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">€6,95</span>
                  <span className="text-muted-foreground"> per maand</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Onbeperkt facturen</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">BTW aangifte</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Bankaflettering</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Audittrail</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">PWA toegang</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  onClick={() => navigateTo('/login')}
                >
                  Start nu
                </Button>
              </CardFooter>
            </Card>

            {/* Accountant Plan */}
            <Card className="border border-border bg-background/95">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Accountant</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Accountants werken gratis samen met hun klanten. Neem contact op voor samenwerking.
                </p>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    const contactSection = document.getElementById('contact')
                    if (contactSection) {
                      contactSection.scrollIntoView({ behavior: 'smooth' })
                    }
                  }}
                >
                  Contact us
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {trustFeatures.map((feature, index) => (
              <TrustCard key={index} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="border-t border-border bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <span className="text-xl font-bold text-primary">Smart Accounting</span>
              <p className="mt-4 text-sm text-muted-foreground">
                Professioneel boekhoudplatform voor ZZP'ers en accountants.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Links</h3>
              <ul className="space-y-2">
                <li>
                  <Button 
                    variant="link" 
                    className="text-sm p-0 h-auto text-muted-foreground hover:text-foreground"
                    onClick={() => navigateTo('/login')}
                  >
                    Inloggen
                  </Button>
                </li>
                <li>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="mailto:info@smartaccounting.nl" className="text-sm text-muted-foreground hover:text-foreground">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                    Algemene voorwaarden
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Contact</h3>
              <p className="text-sm text-muted-foreground">
                Voor vragen en samenwerking:
              </p>
              <a href="mailto:info@smartaccounting.nl" className="text-sm text-primary hover:underline">
                info@smartaccounting.nl
              </a>
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
