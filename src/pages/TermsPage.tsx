import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { MarketingFooter } from '@/components/marketing/Footer'

const LAST_UPDATED = '23 februari 2026'

export const TermsPage = () => {
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
        <h1 className="text-3xl font-bold mb-1">Algemene voorwaarden</h1>
        <p className="text-sm font-medium mb-2" style={{ color: 'var(--accent2)' }}>Versie 1.0</p>
        <p className="text-sm text-muted-foreground mb-10">Laatste update: {LAST_UPDATED}</p>

        <div className="space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Partijen</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Deze voorwaarden zijn van toepassing op de overeenkomst tussen MHM IT (hierna "aanbieder") en u als gebruiker (hierna "gebruiker") van het platform Smart Accounting.
            </p>
            <address className="not-italic mt-3 text-sm text-muted-foreground leading-relaxed">
              MHM IT<br />
              Europaboulevard 371<br />
              1825RL Alkmaar<br />
              KvK: 69779716<br />
              E-mail: <a href="mailto:support@zzpershub.nl" className="underline hover:text-foreground">support@zzpershub.nl</a>
            </address>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. De dienst</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Smart Accounting is een online boekhoudplatform voor ZZP'ers en accountants. De dienst omvat facturatie, urenregistratie, uitgavenbeheer, BTW-overzichten en samenwerkingsfuncties voor accountants. De aanbieder levert de dienst als Software-as-a-Service (SaaS) en is geen belastingadviseur.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Gratis proefperiode en abonnement</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground leading-relaxed">
              <li>Nieuwe gebruikers ontvangen een gratis proefperiode van 30 dagen met toegang tot alle functies.</li>
              <li>Na afloop van de proefperiode is een betaald abonnement vereist voor voortgezet gebruik.</li>
              <li>Het abonnement voor ZZP-gebruikers bedraagt €6,95 per maand (excl. BTW), maandelijks opzegbaar.</li>
              <li>Accountants/kantoren: prijsafspraken worden individueel vastgesteld.</li>
              <li>Bij niet-betaling wordt de toegang beperkt tot alleen-lezen; gegevens blijven bewaard.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Verplichtingen van de gebruiker</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground leading-relaxed">
              <li>De gebruiker is verantwoordelijk voor de juistheid van ingevoerde gegevens.</li>
              <li>De gebruiker mag het platform niet gebruiken voor onwettige activiteiten.</li>
              <li>Toegangsgegevens (wachtwoord) dienen geheim te worden gehouden.</li>
              <li>De gebruiker is verantwoordelijk voor zijn eigen belastingaangiften; het platform ondersteunt maar vervangt geen belastingadviseur.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Beschikbaarheid en onderhoud</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              De aanbieder streeft naar een hoge beschikbaarheid van het platform maar garandeert geen ononderbroken toegang. Gepland onderhoud wordt indien mogelijk van tevoren aangekondigd. De aanbieder is niet aansprakelijk voor schade als gevolg van tijdelijke onbeschikbaarheid.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Eigendom van gegevens</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Alle door de gebruiker ingevoerde gegevens (facturen, klantgegevens, enz.) blijven eigendom van de gebruiker. De aanbieder verwerkt deze gegevens uitsluitend ten behoeve van de dienstverlening. Bij beëindiging van het account kunnen gegevens worden geëxporteerd via de exportfunctie.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Aansprakelijkheid</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              De aansprakelijkheid van de aanbieder is beperkt tot directe schade en maximaal het bedrag dat de gebruiker in de afgelopen 3 maanden heeft betaald voor de dienst. De aanbieder is niet aansprakelijk voor indirecte schade, gevolgschade of verlies van gegevens als gevolg van gebruiksfouten.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Intellectueel eigendom</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Het platform, de software en alle bijbehorende documentatie zijn eigendom van MHM IT. De gebruiker krijgt een beperkt, niet-exclusief gebruiksrecht voor de duur van het abonnement. Kopiëren, distribueren of reverse engineering van de software is niet toegestaan.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Opzegging</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Beide partijen kunnen de overeenkomst op elk moment beëindigen. De gebruiker kan opzeggen via "Instellingen" → "Abonnement". Na opzegging blijft de toegang actief tot het einde van de betaalde periode. De aanbieder kan de overeenkomst per direct beëindigen bij misbruik of niet-betaling.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Toepasselijk recht</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter in het arrondissement Noord-Holland.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Wijzigingen</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              De aanbieder kan deze voorwaarden wijzigen. Wezenlijke wijzigingen worden minimaal 30 dagen van tevoren per e-mail aangekondigd. Voortgezet gebruik na de ingangsdatum geldt als acceptatie van de gewijzigde voorwaarden.
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
