import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

type FaqItem = {
  question: string
  answer: string
}

const faqItems: FaqItem[] = [
  // Getting started
  {
    question: 'Hoe maak ik mijn eerste factuur aan?',
    answer:
      'Ga naar "Facturen" in het zijmenu en klik op "+ Nieuwe factuur". Vul de klantgegevens in (of selecteer een bestaande klant), voeg regelitems toe met omschrijving, aantal en bedrag, en kies het BTW-tarief (21%, 9% of 0%). Klik op "Opslaan als concept" om op te slaan, of op "Versturen" om de factuur direct als PDF naar de klant te e-mailen.',
  },
  {
    question: 'Hoe voeg ik klanten toe?',
    answer:
      'Open "Klanten" in het zijmenu en klik op "+ Klant toevoegen". Vul de bedrijfsnaam of naam, e-mailadres, KvK-nummer en factuuradres in. Opgeslagen klanten zijn direct beschikbaar bij het aanmaken van facturen en uren. U kunt klantgegevens later altijd aanpassen via het klantprofiel.',
  },
  {
    question: 'Hoe registreer ik uren (handmatig en via check-in)?',
    answer:
      'Via "Uren" in het menu kunt u uren op twee manieren bijhouden. Handmatig: klik op "+ Urenboeking", kies datum, klant/project en voer het aantal uren in. Via check-in/check-out: klik op "Start timer" als u begint en op "Stop timer" als u klaar bent — de duur wordt automatisch berekend. Beide methoden laten u uren direct koppelen aan een klant en omzetten in een factuur.',
  },
  {
    question: 'Hoe voeg ik uitgaven toe en upload ik bonnetjes?',
    answer:
      'Ga naar "Uitgaven" en klik op "+ Nieuwe uitgave". Vul de leverancier, datum, bedrag en BTW-tarief in. Upload een foto of PDF van het bonnetje via de knop "Bijlage toevoegen". De uitgave wordt meegenomen in uw BTW-overzicht en winst- en verliesrekening. Geüploade bijlagen zijn opvraagbaar voor uw accountant.',
  },
  // VAT
  {
    question: 'Wat laat het BTW-overzicht zien?',
    answer:
      'Het BTW-overzicht toont per aangifte-periode (kwartaal of maand) hoeveel BTW u heeft gefactureerd (te betalen BTW), hoeveel BTW u heeft betaald op zakelijke kosten (terug te vorderen BTW) en het saldo (het te betalen of terug te vorderen bedrag). U ziet ook een uitsplitsing per BTW-tarief (21%, 9%, 0%).',
  },
  {
    question: 'Hoe werkt de BTW-drilldown en wat zijn rubrieken?',
    answer:
      'Klik op een BTW-rubriek in het overzicht om te zien welke facturen en uitgaven bijdragen aan dat bedrag. Rubrieken zijn de vakjes van het Nederlandse BTW-aangifteformulier (bijv. rubriek 1a voor 21% BTW). Door de drilldown kunt u zelf controleren of elk bedrag klopt voordat u aangifte doet — dit is de volledige traceerbaarheid die het platform biedt.',
  },
  {
    question: 'Wat betekent "concept" bij facturen?',
    answer:
      'Een factuur met de status "concept" is opgeslagen maar nog niet verzonden of definitief gemaakt. U kunt een concept nog volledig aanpassen: bedragen, klant, regelitems. Zodra u de factuur verstuurt of definitief markeert, wordt een volgnummer toegewezen en kan de factuur niet meer worden gewijzigd (conform boekhoudregels). Concepten tellen niet mee in uw BTW-aangifte.',
  },
  // Collaboration
  {
    question: 'Hoe nodig ik mijn accountant uit?',
    answer:
      'Ga naar "Boekhouder" in uw zijmenu en klik op "Accountant toevoegen". Voer het e-mailadres van uw accountant in. Uw accountant ontvangt een uitnodiging en, na acceptatie, machtiging om uw dossier in te zien. Dit werkt als een digitale machtiging (vergelijkbaar met een volmacht): u geeft expliciet toestemming en kunt die op elk moment intrekken via dezelfde pagina.',
  },
  {
    question: 'Wat kan mijn accountant zien en doen?',
    answer:
      'Uw accountant heeft leestoegang tot uw facturen, uitgaven, urenregistraties en BTW-gegevens. De accountant kan aantekeningen maken en kwesties aanmaken (bijv. ontbrekende bonnetjes) die u vervolgens kunt oplossen. De accountant kan geen facturen namens u versturen of gegevens verwijderen. Alle acties van uw accountant worden gelogd in het audittrail.',
  },
  // Payments
  {
    question: 'Hoe werkt de gratis proefperiode?',
    answer:
      'U krijgt 30 dagen gratis toegang tot alle functies, zonder creditcard bij aanmelding. Na 30 dagen wordt uw account automatisch beperkt tot alleen-lezen modus tenzij u een abonnement activeert. Uw gegevens blijven bewaard. U ontvangt een herinnering per e-mail voor het einde van de proefperiode.',
  },
  {
    question: 'Hoe activeer of annuleer ik mijn abonnement?',
    answer:
      'Ga naar "Instellingen" → "Abonnement" om uw abonnement te activeren. De betaling verloopt via Mollie (iDEAL, creditcard). U kunt op elk moment opzeggen via dezelfde pagina; uw toegang blijft actief tot het einde van de betaalde periode. Er zijn geen opzegtermijnen of boetes.',
  },
  // Data/export
  {
    question: 'Hoe exporteer ik mijn gegevens (CSV/JSON)?',
    answer:
      'Via "Instellingen" → "Gegevensexport" kunt u uw facturen, uitgaven en urenboekingen exporteren als CSV-bestand (compatibel met Excel) of als JSON. Selecteer het gewenste datumbereik en klik op "Exporteren". De download start direct in uw browser.',
  },
  {
    question: 'Waar worden back-ups opgeslagen?',
    answer:
      'Smart Accounting slaat uw gegevens op beveiligde servers op. Er zijn geen automatische back-updownloads — back-ups worden beheerd door de hostingprovider. Wilt u zelf een kopie van uw gegevens bewaren, gebruik dan de exportfunctie (CSV/JSON) en sla het bestand lokaal op. Dit is de enige manier om zelf een offline kopie te hebben.',
  },
]

export const FaqSection = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index))
  }

  return (
    <section id="faq" className="py-14 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold sm:text-4xl mb-2">Veelgestelde vragen</h2>
        <p className="text-muted-foreground mb-10">Alles wat u wilt weten over het gebruik van Smart Accounting.</p>

        <div className="space-y-2">
          {faqItems.map((item, index) => (
            <div key={index} className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => toggle(index)}
                className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium hover:bg-muted/40 transition-colors"
                aria-expanded={openIndex === index}
              >
                <span>{item.question}</span>
                {openIndex === index ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground ml-3" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground ml-3" />
                )}
              </button>
              {openIndex === index && (
                <div className="px-5 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
