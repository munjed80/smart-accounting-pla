/**
 * Belastinghulp – Uitleg & Hulp
 *
 * Informational page explaining common tax topics for ZZP users
 * in plain, user-friendly Dutch.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Info, Question, Lightbulb } from '@phosphor-icons/react'

interface HelpTopic {
  title: string
  description: string
}

const topics: HelpTopic[] = [
  {
    title: 'Wat is BTW-aangifte?',
    description:
      'Als ondernemer moet je per kwartaal (of per maand) BTW-aangifte doen. Hiermee geef je aan hoeveel BTW je hebt ontvangen van klanten en hoeveel BTW je hebt betaald aan leveranciers. Het verschil betaal je aan of ontvang je van de Belastingdienst.',
  },
  {
    title: 'Zelfstandigenaftrek',
    description:
      'Als ZZP\'er heb je recht op zelfstandigenaftrek als je aan het urencriterium voldoet (minimaal 1.225 uur per jaar). Deze aftrek verlaagt je belastbaar inkomen.',
  },
  {
    title: 'Startersaftrek',
    description:
      'Ben je net gestart als ondernemer? Dan kun je de eerste drie jaar extra aftrek krijgen bovenop de zelfstandigenaftrek. Dit verlaagt je belasting nog verder.',
  },
  {
    title: 'Kleineondernemersregeling (KOR)',
    description:
      'Als je minder dan € 20.000 omzet per jaar hebt, kun je kiezen voor de KOR. Je hoeft dan geen BTW te berekenen aan klanten, maar kunt ook geen BTW aftrekken van je inkopen.',
  },
  {
    title: 'Zakelijke kosten aftrekken',
    description:
      'Kosten die je maakt voor je bedrijf kun je aftrekken van je winst. Denk aan kantoorbenodigdheden, software-abonnementen, zakelijke reizen en een deel van je thuiswerkplek.',
  },
  {
    title: 'Urenregistratie',
    description:
      'Een goede urenregistratie is belangrijk voor de zelfstandigenaftrek en als bewijs bij controle door de Belastingdienst. Noteer dagelijks je gewerkte uren en de activiteiten die je hebt uitgevoerd.',
  },
]

export const BelastinghulpUitlegPage = () => {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Uitleg &amp; Hulp</h1>
        <p className="text-muted-foreground mt-1">
          Veelgestelde vragen en uitleg over belastingzaken voor ZZP&apos;ers.
        </p>
      </div>

      {/* Quick-tip card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Lightbulb size={24} weight="duotone" className="text-blue-600" />
            <div>
              <CardTitle className="text-blue-900">Tip</CardTitle>
              <CardDescription className="text-blue-700">
                Houd je boekhouding bij gedurende het hele jaar. Zo voorkom je stress bij de aangifte en mis je geen aftrekposten.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Help topics */}
      <div className="grid gap-4 sm:grid-cols-2">
        {topics.map((topic) => (
          <Card key={topic.title}>
            <CardHeader>
              <div className="flex items-start gap-3">
                <Question size={20} weight="duotone" className="text-primary mt-0.5 shrink-0" />
                <CardTitle className="text-base">{topic.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">{topic.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* More help */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Info size={24} weight="duotone" className="text-primary" />
            <div>
              <CardTitle>Meer informatie nodig?</CardTitle>
              <CardDescription>
                Bezoek de website van de Belastingdienst voor officiële informatie of neem contact op met een boekhouder via de Boekhouder-pagina in het menu.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}
