import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { MarketingFooter } from '@/components/marketing/Footer'

const LAST_UPDATED = '23 februari 2026'

export const DisclaimerPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={() => navigateTo('/')} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
            Smart Accounting
          </button>
          <Button variant="ghost" onClick={() => navigateTo('/login')}>Inloggen</Button>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-2">Disclaimer</h1>
        <p className="text-sm text-muted-foreground mb-10">Laatste update: {LAST_UPDATED}</p>

        <div className="space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Geen fiscaal advies</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Smart Accounting is een administratie- en boekhoudplatform. De inhoud van dit platform en alle gegenereerde rapporten, overzichten en berekeningen zijn uitsluitend bedoeld als hulpmiddel voor uw administratie. Het platform vervangt geen fiscaal adviseur, belastingadviseur of accountant. Voor fiscaal advies dient u een erkende adviseur te raadplegen.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Juistheid van informatie</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              MHM IT doet er alles aan om de informatie op dit platform correct en actueel te houden. Desondanks kunnen wij de volledigheid, juistheid of actualiteit van de informatie niet garanderen. Gebruik van de informatie is geheel voor eigen risico. MHM IT is niet aansprakelijk voor eventuele schade als gevolg van onjuiste of onvolledige informatie.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Aansprakelijkheidsbeperking</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground leading-relaxed">
              <li>MHM IT is niet aansprakelijk voor directe of indirecte schade voortvloeiend uit het gebruik van het platform.</li>
              <li>MHM IT is niet aansprakelijk voor fouten, verlies van gegevens of schade als gevolg van technische storingen of onderhoud.</li>
              <li>MHM IT is niet verantwoordelijk voor de inhoud van externe websites waarnaar eventueel wordt verwezen.</li>
              <li>De maximale aansprakelijkheid van MHM IT is beperkt tot het bedrag dat de gebruiker in de afgelopen drie maanden heeft betaald voor de dienst.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Beschikbaarheid</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              MHM IT streeft naar een maximale beschikbaarheid van het platform, maar kan niet garanderen dat het platform altijd en zonder onderbreking beschikbaar is. Geplande en ongeplande onderhoudswerkzaamheden kunnen leiden tot tijdelijke onbeschikbaarheid. MHM IT is niet aansprakelijk voor schade als gevolg van onbeschikbaarheid.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Intellectueel eigendom</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Alle rechten op de inhoud van dit platform, inclusief teksten, afbeeldingen, logo's en software, berusten bij MHM IT of diens licentiegevers. Niets uit dit platform mag worden verveelvoudigd, opgeslagen of openbaar gemaakt zonder voorafgaande schriftelijke toestemming van MHM IT.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Toepasselijk recht</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Op deze disclaimer is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in het arrondissement Noord-Holland.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Contact</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Vragen over deze disclaimer? Stuur een e-mail naar{' '}
              <a href="mailto:support@zzpershub.nl" className="underline hover:text-foreground">support@zzpershub.nl</a>.
            </p>
          </section>

        </div>

        <div className="mt-12">
          <Button variant="ghost" onClick={() => navigateTo('/')}>← Terug naar home</Button>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}
