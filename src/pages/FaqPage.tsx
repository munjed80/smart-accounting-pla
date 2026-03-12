import { useEffect } from 'react'
import { navigateTo } from '@/lib/navigation'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { MarketingFooter } from '@/components/marketing/Footer'
import { FaqSection } from '@/components/marketing/FaqSection'
import { CookieBanner } from '@/components/marketing/CookieBanner'

export const FaqPage = () => {
  useSeoMeta({
    title: 'Veelgestelde vragen | ZZPers Hub',
    description: "Lees de veelgestelde vragen over facturen maken, klanten beheren, uren registreren en werken met ZZPers Hub.",
    canonical: 'https://zzpershub.nl/faq',
  })

  useEffect(() => {
    const scriptId = 'ld-json-faq-page'
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.type = 'application/ld+json'
      script.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Hoe maak ik gratis een factuur?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Maak een gratis account aan op ZZPers Hub — geen creditcard nodig. Ga daarna naar 'Facturen' en klik op '+ Nieuwe factuur'. Vul de klantgegevens in, voeg regelitems toe met omschrijving en bedrag, kies het btw-tarief en klik op 'Versturen'. Jouw professionele factuur wordt direct als PDF verstuurd naar de klant.",
            },
          },
          {
            '@type': 'Question',
            name: "Is ZZPers Hub geschikt voor zzp'ers?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Ja, ZZPers Hub is speciaal gemaakt voor zzp'ers, freelancers en zelfstandige ondernemers in Nederland. Je maakt snel professionele facturen, beheert klanten, registreert uren en houdt je btw-overzicht bij.",
            },
          },
          {
            '@type': 'Question',
            name: 'Wat kost het na de proefperiode?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'De eerste 30 dagen zijn volledig gratis — geen creditcard nodig bij aanmelding. Daarna is ZZPers Hub €4,99 per maand. Je kunt op elk moment opzeggen; er zijn geen opzegtermijnen of verborgen kosten.',
            },
          },
          {
            '@type': 'Question',
            name: 'Hoe werkt de gratis proefperiode?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Je krijgt 30 dagen gratis toegang tot alle functies, zonder creditcard bij aanmelding. Na 30 dagen wordt je account automatisch beperkt tot alleen-lezen modus tenzij je een abonnement activeert. Je gegevens blijven bewaard.',
            },
          },
          {
            '@type': 'Question',
            name: 'Kan ik mijn boekhouder toegang geven?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Ja. Via 'Boekhouder' in het menu nodig je je accountant of boekhouder uit met diens e-mailadres. Na acceptatie krijgt de boekhouder leestoegang tot jouw dossier.",
            },
          },
        ],
      })
      document.head.appendChild(script)
    }
    return () => {
      document.getElementById(scriptId)?.remove()
    }
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={() => navigateTo('/')} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
            ZZPers Hub
          </button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigateTo('/login')}>Inloggen</Button>
            <Button size="sm" onClick={() => navigateTo('/login')}>Start gratis</Button>
          </div>
        </div>
      </nav>

      <main>
        <div className="mx-auto max-w-3xl px-4 pt-12 pb-2 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold mb-2">Veelgestelde vragen</h1>
          <p className="text-sm text-muted-foreground">
            Alles wat je wilt weten over ZZPers Hub, gratis facturen maken en zzp-administratie.
          </p>
        </div>

        <FaqSection showHeading={false} />

        <section className="py-12 border-t border-border/60">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold sm:text-2xl mb-3">Staat uw vraag er niet bij?</h2>
            <p className="text-muted-foreground mb-6">Neem contact op en wij helpen u graag verder binnen één werkdag.</p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button onClick={() => navigateTo('/login')}>
                Start gratis
                <ArrowRight className="ml-2 h-4 w-4" />
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
