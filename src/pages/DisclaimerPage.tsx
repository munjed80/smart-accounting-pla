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
              Het platform is bedoeld om informatie overzichtelijk en actueel weer te geven. Desondanks kan de volledigheid, juistheid of actualiteit van informatie niet worden gegarandeerd. Gebruik van de informatie blijft voor eigen risico.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Aansprakelijkheidsbeperking</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground leading-relaxed">
              <li>Het platform is niet bedoeld als vervanging voor professioneel fiscaal of juridisch advies.</li>
              <li>Gebruikers blijven verantwoordelijk voor controle van gegevens, aangiften en exports.</li>
              <li>Externe websites waarnaar eventueel wordt verwezen vallen buiten de inhoud van het platform.</li>
              <li>Maak regelmatig gebruik van exportmogelijkheden wanneer u een eigen administratiekopie wilt bewaren.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Beschikbaarheid</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Het platform streeft naar goede beschikbaarheid, maar kan niet garanderen dat het altijd en zonder onderbreking beschikbaar is. Gepland of ongepland onderhoud kan leiden tot tijdelijke onbeschikbaarheid.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Intellectueel eigendom</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              De inhoud van dit platform, inclusief teksten, afbeeldingen, logo's en software, is beschermd door intellectuele-eigendomsrechten. Gebruik is toegestaan binnen de normale werking van het platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Toepasselijk recht</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Op deze disclaimer is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in het arrondissement Noord-Holland.
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
