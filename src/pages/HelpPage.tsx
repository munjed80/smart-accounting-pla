import { useState } from 'react'
import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { MarketingFooter } from '@/components/marketing/Footer'

type HelpSection = {
  id: string
  title: string
  content: React.ReactNode
}

const helpSections: HelpSection[] = [
  {
    id: 'aan-de-slag',
    title: 'Aan de slag',
    content: (
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
        <p><strong className="text-foreground">Account aanmaken:</strong> Ga naar de startpagina en klik op "Start gratis (30 dagen proefperiode)". Vul uw naam, e-mailadres en wachtwoord in. U ontvangt een bevestigingsmail om uw account te activeren.</p>
        <p><strong className="text-foreground">Administratie inrichten:</strong> Na inloggen wordt u gevraagd uw bedrijfsgegevens in te voeren: handelsnaam, KvK-nummer, BTW-nummer en factuuradres. Vul dit zo compleet mogelijk in — deze gegevens worden gebruikt op uw facturen.</p>
        <p><strong className="text-foreground">Eerste klant toevoegen:</strong> Ga naar "Klanten" en klik op "+ Klant toevoegen". Voer de bedrijfsnaam, e-mailadres en eventuele KvK- of BTW-gegevens in.</p>
        <p><strong className="text-foreground">Als accountant:</strong> Meld u aan als accountant en nodig uw eerste klant uit via "Klanten" → "Klant uitnodigen". De klant ontvangt een machtigingsverzoek en u krijgt toegang tot zijn dossier na acceptatie.</p>
      </div>
    ),
  },
  {
    id: 'facturen',
    title: 'Facturen',
    content: (
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
        <p><strong className="text-foreground">Nieuwe factuur:</strong> Ga naar "Facturen" → "+ Nieuwe factuur". Selecteer een klant, voeg regelitems toe met omschrijving, aantal en prijs per eenheid. Kies het BTW-tarief (21%, 9% of 0%) per regel.</p>
        <p><strong className="text-foreground">Concept vs. definitief:</strong> Sla de factuur op als concept om later te bewerken, of klik op "Versturen" om een definitief factuurnummer toe te kennen en de factuur per e-mail als PDF te versturen.</p>
        <p><strong className="text-foreground">PDF downloaden:</strong> Open een factuur en klik op het download-icoon of "PDF downloaden" om een PDF-exemplaar op te slaan.</p>
        <p><strong className="text-foreground">Factuurstatus:</strong> U kunt facturen markeren als "Betaald" zodra de betaling is ontvangen. Betaalde facturen worden groen weergegeven in het overzicht.</p>
      </div>
    ),
  },
  {
    id: 'uitgaven',
    title: 'Uitgaven',
    content: (
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
        <p><strong className="text-foreground">Uitgave toevoegen:</strong> Ga naar "Uitgaven" → "+ Nieuwe uitgave". Voer de leverancier, datum, bedrag en BTW-tarief in. Selecteer de kostensoort (bijv. kantoorbenodigdheden, transport).</p>
        <p><strong className="text-foreground">Bonnetje uploaden:</strong> Voeg een foto of PDF van uw bon toe via "Bijlage toevoegen". Ondersteunde formaten: JPG, PNG, PDF. Maximum bestandsgrootte: 10 MB.</p>
        <p><strong className="text-foreground">BTW terugvorderen:</strong> Zakelijke uitgaven met BTW worden automatisch meegenomen in uw BTW-overzicht als terug te vorderen BTW (voorbelasting).</p>
        <p><strong className="text-foreground">Uitgaven exporteren:</strong> Exporteer uw uitgavenlijst via "Instellingen" → "Export" als CSV voor gebruik in Excel of een ander boekhoudprogramma.</p>
      </div>
    ),
  },
  {
    id: 'uren',
    title: 'Urenregistratie',
    content: (
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
        <p><strong className="text-foreground">Uren handmatig invoeren:</strong> Ga naar "Uren" → "+ Urenboeking". Kies datum, klant en project, voer het aantal uren in en voeg een omschrijving toe.</p>
        <p><strong className="text-foreground">Timer gebruiken:</strong> Klik op "Start timer" als u begint met werken en op "Stop timer" als u klaar bent. De duur wordt automatisch berekend en opgeslagen.</p>
        <p><strong className="text-foreground">Uren omzetten naar factuur:</strong> Selecteer één of meerdere urenboekingen en klik op "Maak factuur". De uren worden automatisch omgezet in factuurregels.</p>
        <p><strong className="text-foreground">Urenrapport:</strong> Via het overzicht kunt u uw uren filteren op klant, project of periode voor rapportage.</p>
      </div>
    ),
  },
  {
    id: 'btw',
    title: 'BTW',
    content: (
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
        <p><strong className="text-foreground">BTW-overzicht bekijken:</strong> Ga naar "BTW" voor een overzicht van uw aangifte-periode. U ziet de te betalen BTW (gefactureerd), de te vorderen BTW (uitgaven) en het saldo.</p>
        <p><strong className="text-foreground">Drilldown per rubriek:</strong> Klik op een BTW-rubriek (bijv. rubriek 1a) om te zien welke facturen en uitgaven bijdragen. U ziet de toewijzingsreden per boeking voor volledige traceerbaarheid.</p>
        <p><strong className="text-foreground">BTW-tarieven:</strong> Facturen en uitgaven kunnen worden aangemaakt met tarief 21%, 9% of 0%. Vrijgestelde omzet (art. 11 Wet OB) wordt ook ondersteund.</p>
        <p><strong className="text-foreground">Aangifte indienen:</strong> Het platform biedt een BTW-overzicht dat u kunt gebruiken als basis voor uw aangifte bij de Belastingdienst. Dien uw aangifte in via Mijn Belastingdienst of via uw accountant.</p>
      </div>
    ),
  },
  {
    id: 'exports',
    title: 'Exports',
    content: (
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
        <p><strong className="text-foreground">CSV-export:</strong> Ga naar "Instellingen" → "Gegevensexport". Selecteer het gewenste datumbereik en de gegevenssoort (facturen, uitgaven, uren). Klik op "Exporteer als CSV" — compatibel met Microsoft Excel en Google Sheets.</p>
        <p><strong className="text-foreground">JSON-export:</strong> Exporteer uw gegevens als JSON voor technische verwerking of archivering. Handig voor koppeling met andere systemen.</p>
        <p><strong className="text-foreground">PDF-facturen:</strong> Individuele factuur-PDF's kunt u downloaden via de factuurpagina. Voor bulkdownload: selecteer meerdere facturen en klik op "Download als ZIP".</p>
        <p><strong className="text-foreground">Voor accountants:</strong> Accountants kunnen via het klantdossier een volledig exportpakket downloaden voor dossiervorming.</p>
      </div>
    ),
  },
  {
    id: 'abonnement',
    title: 'Abonnement & betaling',
    content: (
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
        <p><strong className="text-foreground">Gratis proefperiode:</strong> U heeft 30 dagen gratis toegang tot alle functies. Geen creditcard vereist bij aanmelding. Na 30 dagen wordt uw account beperkt tot alleen-lezen tenzij u een abonnement activeert.</p>
        <p><strong className="text-foreground">Abonnement activeren:</strong> Ga naar "Instellingen" → "Abonnement" en klik op "Activeer abonnement". Betaal via iDEAL of creditcard via ons betalingssysteem (Mollie). Het abonnement kost €6,95 per maand (voor ZZP).</p>
        <p><strong className="text-foreground">Opzeggen:</strong> U kunt uw abonnement op elk moment opzeggen via "Instellingen" → "Abonnement" → "Abonnement opzeggen". Uw toegang blijft actief tot het einde van de betaalde periode. Geen opzegtermijn of boetes.</p>
        <p><strong className="text-foreground">Factuur ontvangen:</strong> Na elke betaling ontvangt u een factuur per e-mail van MHM IT.</p>
      </div>
    ),
  },
  {
    id: 'problemen',
    title: 'Problemen oplossen',
    content: (
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <div>
          <p className="font-medium text-foreground mb-1">Kan niet inloggen?</p>
          <p>Controleer uw e-mailadres en wachtwoord. Gebruik "Wachtwoord vergeten" op de loginpagina om een resetlink te ontvangen. Controleer ook uw spam-map.</p>
        </div>
        <div>
          <p className="font-medium text-foreground mb-1">Factuur wordt niet verstuurd?</p>
          <p>Controleer of het e-mailadres van de klant correct is ingevuld. Als de e-mail na 5 minuten nog niet is ontvangen, controleer dan de spammap van de ontvanger.</p>
        </div>
        <div>
          <p className="font-medium text-foreground mb-1">Upload mislukt?</p>
          <p>Controleer het bestandsformaat (JPG, PNG of PDF) en de bestandsgrootte (maximaal 10 MB). Probeer het bestand te comprimeren of zet het om naar PDF.</p>
        </div>
        <div>
          <p className="font-medium text-foreground mb-1">PWA installeren (als app)?</p>
          <p>Op Android: open het platform in Chrome en tik op "Toevoegen aan startscherm" in het browsermenu. Op iOS (Safari): tik op het Deel-icoon en kies "Zet op beginscherm".</p>
        </div>
        <div>
          <p className="font-medium text-foreground mb-1">Nog steeds een probleem?</p>
          <p>Neem contact op via het <button onClick={() => navigateTo('/contact')} className="underline hover:text-foreground">contactformulier</button>. Wij reageren binnen één werkdag.</p>
        </div>
      </div>
    ),
  },
]

export const HelpPage = () => {
  const [openSection, setOpenSection] = useState<string | null>('aan-de-slag')

  const toggle = (id: string) => {
    setOpenSection((prev) => (prev === id ? null : id))
  }

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
        <h1 className="text-3xl font-bold mb-2">Startgids & Help</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Alles wat u nodig heeft om snel aan de slag te gaan met Smart Accounting.
        </p>

        <div className="space-y-2">
          {helpSections.map((section) => (
            <div key={section.id} className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => toggle(section.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium hover:bg-muted/40 transition-colors"
                aria-expanded={openSection === section.id}
              >
                <span>{section.title}</span>
                {openSection === section.id ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground ml-3" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground ml-3" />
                )}
              </button>
              {openSection === section.id && (
                <div className="px-5 pb-5 pt-2 border-t border-border bg-muted/20">
                  {section.content}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-lg border border-accent/20 bg-accent/5 p-5">
          <h2 className="text-base font-semibold mb-2">Meer hulp nodig?</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Staat uw vraag er niet bij? Neem contact op via ons contactformulier en wij helpen u verder.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigateTo('/contact')}>
            Contact opnemen
          </Button>
        </div>

        <div className="mt-8">
          <Button variant="ghost" onClick={() => navigateTo('/')}>← Terug naar home</Button>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}
