import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { MarketingFooter } from '@/components/marketing/Footer'

const LAST_UPDATED = '23 februari 2026'

export const CookiesPage = () => {
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
        <h1 className="text-3xl font-bold mb-2">Cookiebeleid</h1>
        <p className="text-sm text-muted-foreground mb-10">Laatste update: {LAST_UPDATED}</p>

        <div className="space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Wat zijn cookies?</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Cookies zijn kleine tekstbestanden die op uw apparaat worden opgeslagen wanneer u een website bezoekt. Wij gebruiken ook vergelijkbare technieken zoals localStorage voor het opslaan van uw cookievoorkeur.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Welke cookies gebruiken wij?</h2>

            <div className="space-y-5">
              {/* Necessary */}
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Noodzakelijke cookies</h3>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Altijd actief</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  Vereist voor het basisfunctioneren van de website. Zonder deze cookies werkt de dienst niet.
                </p>
                <table className="w-full text-xs text-muted-foreground">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left pb-1 font-medium">Naam</th>
                      <th className="text-left pb-1 font-medium">Doel</th>
                      <th className="text-left pb-1 font-medium">Bewaartermijn</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1 pr-4">session_id</td>
                      <td className="py-1 pr-4">Gebruikerssessie bijhouden</td>
                      <td className="py-1">Sessie</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-4">cookie_consent</td>
                      <td className="py-1 pr-4">Cookievoorkeur opslaan (localStorage)</td>
                      <td className="py-1">1 jaar</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Functional */}
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Functionele cookies</h3>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Optioneel</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  Slaan uw voorkeuren op, zoals taal- of weergave-instellingen, zodat u ze niet opnieuw hoeft in te stellen.
                </p>
                <table className="w-full text-xs text-muted-foreground">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left pb-1 font-medium">Naam</th>
                      <th className="text-left pb-1 font-medium">Doel</th>
                      <th className="text-left pb-1 font-medium">Bewaartermijn</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1 pr-4">ui_prefs</td>
                      <td className="py-1 pr-4">Weergavevoorkeuren (localStorage)</td>
                      <td className="py-1">1 jaar</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Analytics */}
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Analysecookies</h3>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Optioneel — standaard uit</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Helpen ons begrijpen hoe bezoekers de website gebruiken (bijv. welke pagina's het meest worden bezocht). Gegevens worden anoniem verzameld. Momenteel niet actief; infrastructuur is aanwezig voor toekomstig gebruik na uw toestemming.
                </p>
              </div>

              {/* Marketing */}
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Marketingcookies</h3>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Optioneel — standaard uit</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Voor het tonen van gepersonaliseerde advertenties. Wij maken momenteel geen gebruik van marketingcookies van derden. Standaard uitgeschakeld; alleen actief na uw expliciete toestemming.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Hoe kunt u uw voorkeur aanpassen?</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              U kunt uw cookievoorkeur op elk moment aanpassen via de cookiebanner onderaan de pagina (klik op "Beheren"). U kunt ook cookies verwijderen via de instellingen van uw browser. Houd er rekening mee dat het verwijderen van noodzakelijke cookies de werking van de dienst kan beïnvloeden.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Rechtsgrond</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Noodzakelijke cookies worden geplaatst op grond van ons gerechtvaardigd belang (Art. 6 lid 1 sub f AVG) en zijn noodzakelijk voor de uitvoering van de dienst. Optionele cookies (functioneel, analyse, marketing) worden alleen geplaatst na uw uitdrukkelijke toestemming (Art. 6 lid 1 sub a AVG).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Contact</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Vragen over ons cookiebeleid? Stuur een e-mail naar{' '}
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
