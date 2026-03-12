import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

type FaqItem = {
  question: string
  answer: string
}

type FaqSectionProps = {
  /** When false, the section heading and subtitle are hidden (used on standalone /faq page). Defaults to true. */
  showHeading?: boolean
}

const faqItems: FaqItem[] = [
  // ZZP-first questions
  {
    question: 'Hoe maak ik gratis een factuur?',
    answer:
      "Maak een gratis account aan op ZZPers Hub — geen creditcard nodig. Ga daarna naar 'Facturen' en klik op '+ Nieuwe factuur'. Vul de klantgegevens in, voeg regelitems toe met omschrijving en bedrag, kies het btw-tarief en klik op 'Versturen'. Jouw professionele factuur wordt direct als PDF verstuurd naar de klant.",
  },
  {
    question: "Is ZZPers Hub geschikt voor zzp'ers?",
    answer:
      "Ja, ZZPers Hub is speciaal gemaakt voor zzp'ers, freelancers en zelfstandige ondernemers in Nederland. Je maakt snel professionele facturen, beheert klanten, registreert uren en houdt je btw-overzicht bij — zonder boekhoudkennis en zonder gedoe.",
  },
  {
    question: 'Kan ik klanten beheren?',
    answer:
      "Ja. Via 'Klanten' voeg je klanten toe met naam, e-mailadres, KvK-nummer en factuuradres. Opgeslagen klanten zijn direct beschikbaar bij het aanmaken van facturen en uren. Je kunt klantgegevens altijd aanpassen via het klantprofiel.",
  },
  {
    question: 'Kan ik uren registreren?',
    answer:
      "Ja. Via 'Uren' kun je uren op twee manieren bijhouden: handmatig (datum, klant, aantal uren) of via de ingebouwde timer (start en stop). Geregistreerde uren kun je direct omzetten in factuurregels.",
  },
  {
    question: 'Kan ik bonnetjes uploaden?',
    answer:
      "Ja. Bij elke uitgave kun je een foto of PDF van het bonnetje uploaden via de knop 'Bijlage toevoegen'. De uitgave en het bonnetje worden meegenomen in je btw-overzicht en zijn opvraagbaar voor je boekhouder.",
  },
  {
    question: 'Kan ik later met mijn boekhouder samenwerken?',
    answer:
      "Ja. Via 'Boekhouder' in het menu nodig je je accountant of boekhouder uit met diens e-mailadres. Na acceptatie krijgt de boekhouder leestoegang tot jouw dossier. Je behoudt altijd de controle en kunt de toegang op elk moment intrekken.",
  },
  {
    question: 'Wat kost het na de proefperiode?',
    answer:
      'De eerste 30 dagen zijn volledig gratis — geen creditcard nodig bij aanmelding. Daarna is ZZPers Hub €4,99 per maand. Je kunt op elk moment opzeggen; er zijn geen opzegtermijnen of verborgen kosten.',
  },
  // Getting started (detail)
  {
    question: 'Hoe maak ik mijn eerste factuur aan?',
    answer:
      "Ga naar 'Facturen' in het zijmenu en klik op '+ Nieuwe factuur'. Vul de klantgegevens in (of selecteer een bestaande klant), voeg regelitems toe met omschrijving, aantal en bedrag, en kies het btw-tarief (21%, 9% of 0%). Klik op 'Opslaan als concept' om op te slaan, of op 'Versturen' om de factuur direct als PDF naar de klant te e-mailen.",
  },
  {
    question: 'Hoe voeg ik uitgaven toe en upload ik bonnetjes?',
    answer:
      "Ga naar 'Uitgaven' en klik op '+ Nieuwe uitgave'. Vul de leverancier, datum, bedrag en btw-tarief in. Upload een foto of PDF van het bonnetje via de knop 'Bijlage toevoegen'. De uitgave wordt meegenomen in je btw-overzicht.",
  },
  // VAT
  {
    question: 'Wat laat het btw-overzicht zien?',
    answer:
      'Het btw-overzicht toont per aangifteperiode (kwartaal of maand) hoeveel btw je hebt gefactureerd (te betalen btw), hoeveel btw je hebt betaald op zakelijke kosten (terug te vorderen btw) en het saldo. Je ziet ook een uitsplitsing per btw-tarief (21%, 9%, 0%).',
  },
  {
    question: 'Wat betekent "concept" bij facturen?',
    answer:
      'Een factuur met de status "concept" is opgeslagen maar nog niet verzonden of definitief gemaakt. Je kunt een concept nog volledig aanpassen. Zodra je de factuur verstuurt of definitief markeert, wordt een volgnummer toegewezen en kan de factuur niet meer worden gewijzigd (conform boekhoudregels). Concepten tellen niet mee in je btw-aangifte.',
  },
  // Collaboration
  {
    question: 'Hoe nodig ik mijn accountant uit?',
    answer:
      "Ga naar 'Boekhouder' in je zijmenu en klik op 'Accountant toevoegen'. Voer het e-mailadres van je accountant in. Je accountant ontvangt een uitnodiging en, na acceptatie, leestoegang tot je dossier. Je kunt de toegang op elk moment intrekken via dezelfde pagina.",
  },
  // Payments
  {
    question: 'Hoe werkt de gratis proefperiode?',
    answer:
      'Je krijgt 30 dagen gratis toegang tot alle functies, zonder creditcard bij aanmelding. Na 30 dagen wordt je account automatisch beperkt tot alleen-lezen modus tenzij je een abonnement activeert. Je gegevens blijven bewaard. Je ontvangt een herinnering per e-mail voor het einde van de proefperiode.',
  },
  {
    question: 'Hoe activeer of annuleer ik mijn abonnement?',
    answer:
      "Ga naar 'Instellingen' → 'Abonnement' om je abonnement te activeren. De betaling verloopt via Mollie (iDEAL, creditcard). Je kunt op elk moment opzeggen via dezelfde pagina; je toegang blijft actief tot het einde van de betaalde periode. Er zijn geen opzegtermijnen of boetes.",
  },
  // Data/export
  {
    question: 'Hoe exporteer ik mijn gegevens (CSV/JSON)?',
    answer:
      "Via 'Instellingen' → 'Gegevensexport' kun je facturen, uitgaven en urenboekingen exporteren als CSV-bestand (compatibel met Excel) of als JSON. Selecteer het gewenste datumbereik en klik op 'Exporteren'. De download start direct in je browser.",
  },
]

export const FaqSection = ({ showHeading = true }: FaqSectionProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index))
  }

  return (
    <section id="faq" className="py-14 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {showHeading && (
          <>
            <h2 className="text-2xl font-bold sm:text-4xl mb-2">Veelgestelde vragen</h2>
            <p className="text-muted-foreground mb-10">Alles wat je wilt weten over gratis facturen maken en ZZPers Hub.</p>
          </>
        )}

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
              <div className={openIndex === index ? 'px-5 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20' : 'hidden'}>
                {item.answer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
