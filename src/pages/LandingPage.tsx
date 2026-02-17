import { useEffect, useState } from 'react'
import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { t } from '@/i18n'
import {
  ArrowRight,
  CheckCircle,
  FileText,
  Clock,
  Landmark,
  ShieldCheck,
  Smartphone,
  Users,
  FolderLock,
  FileSignature,
  BellRing,
  KeyRound,
  Workflow,
  SearchCheck,
  Scale,
  Lock,
  Euro,
  WifiOff,
  Download,
  Menu,
  X,
  Database,
  Calculator,
  Shield,
  Building2,
  ClipboardList,
} from 'lucide-react'

const scrollToSection = (id: string) => {
  const section = document.getElementById(id)
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' })
  }
}

export const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    document.title = 'Smart Accounting voor ZZP en accountants | PWA boekhouden met compliance'

    const ensureMetaDescription = () => {
      let tag = document.querySelector('meta[name="description"]')
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute('name', 'description')
        document.head.appendChild(tag)
      }
      tag.setAttribute(
        'content',
        'Smart Accounting helpt ZZP’ers en accountants met auditbare boekhouding, PWA mobiel werken, PKI-ondertekende BTW-submissies en transparante prijzen vanaf €6,95 per maand.',
      )
    }

    ensureMetaDescription()
  }, [])

  const navigation = [
    { name: 'Platform', href: '#doelgroepen' },
    { name: 'PWA', href: '#pwa' },
    { name: 'Prijzen', href: '#prijzen' },
    { name: 'Security', href: '#security' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <span className="text-xl font-bold text-primary">Smart Accounting</span>

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
          </div>
        )}
      </nav>

      <section className="relative overflow-hidden border-b border-primary/10">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/15 via-background to-accent-secondary-9/10" />
        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">{t('platform.title')}</h1>
          <p className="mx-auto mt-6 max-w-3xl text-base text-muted-foreground sm:text-lg">
            {t('platform.subtitle')}
          </p>

          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Button size="lg" className="px-8 py-6 text-lg" onClick={() => navigateTo('/login')}>
              {t('platform.startZzp')}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-accent-secondary-9 text-accent-secondary-11 hover:bg-accent-secondary-3"
              onClick={() => scrollToSection('contact')}
            >
              {t('platform.contactAccountants')}
            </Button>
          </div>
        </div>
      </section>

      <section id="doelgroepen" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">{t('platform.platformForAccountants')}</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                id: 'core-accounting',
                icon: <Database className="h-6 w-6" />,
                title: t('platform.coreAccountingTitle'),
                bullets: [
                  t('platform.coreAccountingBullet1'),
                  t('platform.coreAccountingBullet2'),
                  t('platform.coreAccountingBullet3'),
                ],
                status: 'live',
              },
              {
                id: 'tax-automation',
                icon: <Calculator className="h-6 w-6" />,
                title: t('platform.taxAutomationTitle'),
                bullets: [
                  t('platform.taxAutomationBullet1'),
                  t('platform.taxAutomationBullet2'),
                  t('platform.taxAutomationBullet3'),
                ],
                status: 'live',
              },
              {
                id: 'compliance-layer',
                icon: <Shield className="h-6 w-6" />,
                title: t('platform.complianceLayerTitle'),
                bullets: [
                  t('platform.complianceLayerBullet1'),
                  t('platform.complianceLayerBullet2'),
                  t('platform.complianceLayerBullet3'),
                  t('platform.complianceLayerBullet4'),
                ],
                status: 'live',
              },
              {
                id: 'banking-financing',
                icon: <Building2 className="h-6 w-6" />,
                title: t('platform.bankingFinancingTitle'),
                bullets: [
                  t('platform.bankingFinancingBullet1'),
                  t('platform.bankingFinancingBullet2'),
                  t('platform.bankingFinancingBullet3'),
                ],
                status: 'coming-soon',
              },
              {
                id: 'annual-reporting',
                icon: <ClipboardList className="h-6 w-6" />,
                title: t('platform.annualReportingTitle'),
                bullets: [
                  t('platform.annualReportingBullet1'),
                  t('platform.annualReportingBullet2'),
                  t('platform.annualReportingBullet3'),
                ],
                status: 'in-development',
              },
            ].map((module) => (
              <Card key={module.id} className="border-border/80">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="text-accent-secondary-11">{module.icon}</div>
                    <Badge
                      variant={module.status === 'live' ? 'default' : 'secondary'}
                      className={module.status === 'live' ? 'bg-accent-secondary-9 text-white' : ''}
                    >
                      {module.status === 'live' ? 'Live' : module.status === 'in-development' ? 'In Development' : 'Coming Soon'}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {module.bullets.map((bullet, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-secondary-11" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">{t('platform.whyDifferent')}</h2>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: <Database className="h-5 w-5" />, text: t('platform.diff1') },
              { icon: <Calculator className="h-5 w-5" />, text: t('platform.diff2') },
              { icon: <Shield className="h-5 w-5" />, text: t('platform.diff3') },
              { icon: <Building2 className="h-5 w-5" />, text: t('platform.diff4') },
              { icon: <ClipboardList className="h-5 w-5" />, text: t('platform.diff5') },
              { icon: <Workflow className="h-5 w-5" />, text: t('platform.diff6') },
            ].map((diff, idx) => (
              <Card key={idx} className="border-border/80">
                <CardHeader>
                  <div className="mb-2 text-accent-secondary-11">{diff.icon}</div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{diff.text}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="pwa" className="py-20">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">PWA feature showcase</h2>
            <ul className="mt-6 space-y-4">
              <li className="flex items-start gap-3"><Download className="mt-0.5 h-5 w-5 text-emerald-700" />Install on iOS/Android</li>
              <li className="flex items-start gap-3"><WifiOff className="mt-0.5 h-5 w-5 text-emerald-700" />Works offline</li>
              <li className="flex items-start gap-3"><Smartphone className="mt-0.5 h-5 w-5 text-emerald-700" />Push / update experience</li>
            </ul>
          </div>
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-emerald-700/10">
            <CardHeader>
              <CardTitle>Altijd bereikbaar, ook onderweg</CardTitle>
              <CardDescription>Gebruik Smart Accounting als app-ervaring zonder appstore-frictie.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>• Installeer direct vanaf browser op mobiel en desktop.</p>
              <p>• Bekijk cijfers en werk taken af terwijl je offline bent.</p>
              <p>• Ontvang updates en meldingen zonder handmatig beheer.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="prijzen" className="bg-gradient-to-b from-primary/5 to-muted/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Pricing</h2>
          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
            <Card className="border-primary/50 shadow-xl">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">ZZP</CardTitle>
                <div>
                  <span className="text-5xl font-extrabold text-primary">€6,95</span>
                  <span className="text-muted-foreground"> / maand</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  {['Urenregistratie', 'Facturen & Automatische BTW', 'Bankmatch + Reconciliatie', 'Audit trail', 'PWA toegang'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-700" /> {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={() => navigateTo('/login')}>Start voor €6,95</Button>
              </CardFooter>
            </Card>

            <Card className="border-accent-secondary-9/40 bg-background">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Accountant</CardTitle>
                <p className="text-3xl font-bold text-accent-secondary-11">Contact</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  {['Multi-client hub', 'Periode locking', 'PKI-signing BTW submissions', 'Werk Queue + Alerts', 'Rollen & Machtigingen'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-accent-secondary-11" /> {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full border-accent-secondary-9 text-accent-secondary-11 hover:bg-accent-secondary-3" onClick={() => scrollToSection('contact')}>
                  Contact us
                </Button>
              </CardFooter>
            </Card>
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
            {t('platform.pricingDisclaimer')}
          </p>
        </div>
      </section>

      <section id="security" className="py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Trust & Security</h2>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { icon: <Lock className="h-5 w-5" />, title: 'EU hosting' },
              { icon: <KeyRound className="h-5 w-5" />, title: 'Role-based access' },
              { icon: <FileSignature className="h-5 w-5" />, title: 'PKI signing' },
              { icon: <ShieldCheck className="h-5 w-5" />, title: 'Audit logs' },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-sm font-medium">
                <span className="text-emerald-700">{item.icon}</span>
                {item.title}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer id="contact" className="border-t border-border bg-muted/50">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div>
            <span className="text-xl font-bold text-primary">Smart Accounting</span>
            <p className="mt-3 text-sm text-muted-foreground">Boekhouding voor ZZP, accountants en integratiepartners.</p>
          </div>
          <a href="mailto:info@smartaccounting.nl" className="text-sm text-muted-foreground hover:text-foreground">Contact</a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground">Privacy</a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground">TOS</a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground">Docs</a>
        </div>
      </footer>
    </div>
  )
}
