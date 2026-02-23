import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { MarketingFooter } from '@/components/marketing/Footer'

const LAST_UPDATED = '23 februari 2026'

export const PrivacyPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Minimal nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={() => navigateTo('/')} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
            Smart Accounting
          </button>
          <Button variant="ghost" onClick={() => navigateTo('/login')}>Inloggen</Button>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-2">Privacybeleid</h1>
        <p className="text-sm text-muted-foreground mb-10">Laatste update: {LAST_UPDATED}</p>

        <div className="prose prose-sm prose-invert max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Verantwoordelijke voor de verwerking</h2>
            <p className="text-muted-foreground leading-relaxed">
              MHM IT is de verwerkingsverantwoordelijke in de zin van de Algemene Verordening Gegevensbescherming (AVG).
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
            <h2 className="text-xl font-semibold mb-3">2. Welke gegevens verwerken wij?</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm leading-relaxed">
              <li>Accountgegevens: naam, e-mailadres, wachtwoord (gehasht), rol (ZZP/accountant).</li>
              <li>Bedrijfsgegevens: handelsnaam, KvK-nummer, BTW-nummer, factuuradres.</li>
              <li>Facturen en klantgegevens: factuurbedragen, BTW, relatiebeheer.</li>
              <li>Uitgaven en bonnetjes: bedragen, omschrijvingen, geüploade documenten.</li>
              <li>Urenregistraties: datum, duur, project/klant.</li>
              <li>Abonnements- en betalingsstatus (via Mollie).</li>
              <li>Gebruikslogboeken en audittrail: tijdstempels van acties in de applicatie.</li>
              <li>Technische gegevens: IP-adres (tijdelijk), browsertype, sessie-ID.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Doeleinden en rechtsgronden</h2>
            <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
              <p><strong className="text-foreground">Uitvoering van de overeenkomst (Art. 6 lid 1 sub b AVG):</strong> Verwerking noodzakelijk voor het leveren van de dienst, inclusief facturatie, urenregistratie, BTW-beheer en klantenondersteuning.</p>
              <p><strong className="text-foreground">Gerechtvaardigd belang (Art. 6 lid 1 sub f AVG):</strong> Beveiliging van het platform, fraudepreventie, systeemmonitoring en verbetering van de dienst op basis van geanonimiseerde gebruiksdata.</p>
              <p><strong className="text-foreground">Wettelijke verplichting (Art. 6 lid 1 sub c AVG):</strong> Bewaren van boekhoudkundige gegevens conform de Nederlandse bewaarplicht (7 jaar).</p>
              <p><strong className="text-foreground">Toestemming (Art. 6 lid 1 sub a AVG):</strong> Analytische en marketing-cookies, alleen na uitdrukkelijke toestemming via de cookiebanner.</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Bewaartermijnen</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm leading-relaxed">
              <li>Boekhoudkundige gegevens (facturen, uitgaven): 7 jaar na het boekjaar (wettelijke bewaarplicht).</li>
              <li>Accountgegevens: tot 30 dagen na beëindiging van het account, daarna verwijderd.</li>
              <li>Technische logs: maximaal 90 dagen.</li>
              <li>Cookies: zie het cookiebeleid voor specifieke termijnen.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Verwerkers en subverwerkers</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">
              Wij maken gebruik van de volgende verwerkers. Met alle verwerkers is een verwerkersovereenkomst gesloten.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm leading-relaxed">
              <li><strong className="text-foreground">Hostingprovider/VPS:</strong> Opslag van applicatiedata op beveiligde servers binnen de EU.</li>
              <li><strong className="text-foreground">E-mailprovider:</strong> Verzending van transactionele e-mails (facturen, notificaties).</li>
              <li><strong className="text-foreground">Mollie B.V.:</strong> Verwerking van betalingen en abonnementsdata. Mollie is gecertificeerd PCI-DSS. Zie ook het privacybeleid van Mollie.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Uw rechten</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-2">Op grond van de AVG heeft u de volgende rechten:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm leading-relaxed">
              <li><strong className="text-foreground">Inzage:</strong> U kunt opvragen welke gegevens wij over u verwerken.</li>
              <li><strong className="text-foreground">Rectificatie:</strong> U kunt onjuiste gegevens laten corrigeren.</li>
              <li><strong className="text-foreground">Verwijdering:</strong> U kunt uw account en bijbehorende gegevens laten verwijderen (behoudens wettelijke bewaarplichten).</li>
              <li><strong className="text-foreground">Bezwaar:</strong> U kunt bezwaar maken tegen verwerking op basis van gerechtvaardigd belang.</li>
              <li><strong className="text-foreground">Overdraagbaarheid:</strong> U kunt uw gegevens opvragen in een gestructureerd formaat (CSV/JSON via de exportfunctie).</li>
              <li><strong className="text-foreground">Klacht indienen:</strong> U heeft het recht om een klacht in te dienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).</li>
            </ul>
            <p className="text-muted-foreground text-sm leading-relaxed mt-2">
              Stuur verzoeken naar: <a href="mailto:support@zzpershub.nl" className="underline hover:text-foreground">support@zzpershub.nl</a>. Wij reageren binnen 30 dagen.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Beveiliging</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Wij nemen passende technische en organisatorische maatregelen om uw persoonsgegevens te beveiligen, waaronder versleutelde opslag van wachtwoorden, HTTPS-verbindingen, toegangscontrole en regelmatige beveiligingscontroles. Wij claimen geen specifieke certificeringen.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Wijzigingen</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Wij kunnen dit privacybeleid van tijd tot tijd aanpassen. De datum "Laatste update" bovenaan de pagina geeft aan wanneer de meest recente versie is gepubliceerd. Bij wezenlijke wijzigingen informeren wij u per e-mail.
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
