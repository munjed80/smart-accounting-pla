/**
 * Belastinghulp – Uitleg & Hulp
 *
 * Guided help page with wizard-like step cards, expandable sections,
 * and contextual navigation for ZZP tax topics. Designed to walk
 * users through the process rather than present a wall of text.
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Info,
  Lightbulb,
  Receipt,
  CurrencyEur,
  FileText,
  WarningCircle,
  CheckCircle,
  ListChecks,
  ArrowRight,
  CalendarCheck,
  Folder,
  ShieldWarning,
} from '@phosphor-icons/react'
import { navigateTo } from '@/lib/navigation'

/* ------------------------------------------------------------------ */
/*  Step card component                                                */
/* ------------------------------------------------------------------ */

interface StepCardProps {
  stepNumber: number
  title: string
  description: string
  isLast?: boolean
  children?: React.ReactNode
}

const StepCard = ({ stepNumber, title, description, isLast, children }: StepCardProps) => (
  <div className="flex gap-4">
    <div className="flex flex-col items-center">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
        {stepNumber}
      </div>
      {!isLast && <div className="mt-2 w-px flex-1 bg-border" />}
    </div>
    <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-8'}`}>
      <h3 className="font-semibold leading-none">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  </div>
)

/* ------------------------------------------------------------------ */
/*  Checklist item component                                           */
/* ------------------------------------------------------------------ */

interface ChecklistItemProps {
  label: string
  hint?: string
}

const ChecklistItem = ({ label, hint }: ChecklistItemProps) => (
  <li className="flex items-start gap-2">
    <CheckCircle size={18} weight="duotone" className="text-green-600 mt-0.5 shrink-0" />
    <div>
      <span className="text-sm">{label}</span>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  </li>
)

/* ------------------------------------------------------------------ */
/*  Section navigation helper                                          */
/* ------------------------------------------------------------------ */

type SectionId =
  | 'btw'
  | 'inkomstenbelasting'
  | 'documenten'
  | 'fouten'
  | 'kwartaal'
  | 'jaar'

interface GuidanceSection {
  id: SectionId
  label: string
  icon: React.ReactNode
}

const sections: GuidanceSection[] = [
  { id: 'btw', label: 'BTW Aangifte', icon: <Receipt size={18} weight="duotone" /> },
  { id: 'inkomstenbelasting', label: 'Inkomstenbelasting', icon: <CurrencyEur size={18} weight="duotone" /> },
  { id: 'documenten', label: 'Documenten', icon: <Folder size={18} weight="duotone" /> },
  { id: 'fouten', label: 'Veelgemaakte fouten', icon: <WarningCircle size={18} weight="duotone" /> },
  { id: 'kwartaal', label: 'Kwartaalchecklist', icon: <CalendarCheck size={18} weight="duotone" /> },
  { id: 'jaar', label: 'Jaarchecklist', icon: <ListChecks size={18} weight="duotone" /> },
]

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export const BelastinghulpUitlegPage = () => {
  const [activeSection, setActiveSection] = useState<SectionId>('btw')

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Uitleg &amp; Hulp</h1>
        <p className="text-muted-foreground mt-1">
          Stap-voor-stap uitleg over belastingzaken voor ZZP&apos;ers. Kies een onderwerp om te beginnen.
        </p>
      </div>

      {/* Quick-tip card */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Lightbulb size={24} weight="duotone" className="text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <CardTitle className="text-blue-900 dark:text-blue-200">Tip</CardTitle>
              <CardDescription className="text-blue-700 dark:text-blue-300">
                Houd je boekhouding bij gedurende het hele jaar. Zo voorkom je stress bij de aangifte en mis je geen aftrekposten.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Section navigator */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <Button
            key={s.id}
            variant={activeSection === s.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSection(s.id)}
            className="gap-1.5"
          >
            {s.icon}
            {s.label}
          </Button>
        ))}
      </div>

      {/* ============================================================ */}
      {/*  1. BTW Aangifte                                              */}
      {/* ============================================================ */}
      {activeSection === 'btw' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Receipt size={24} weight="duotone" className="text-primary" />
              <div>
                <CardTitle>BTW Aangifte – stap voor stap</CardTitle>
                <CardDescription>
                  Elk kwartaal (of maand) geef je je BTW door aan de Belastingdienst. Hieronder leggen we uit hoe dat werkt.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <StepCard
              stepNumber={1}
              title="Verzamel je facturen en bonnetjes"
              description="Zorg dat al je verkoopfacturen en inkoopfacturen in het systeem staan. Controleer of de BTW-bedragen kloppen."
            >
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/invoices')} className="gap-1.5">
                <FileText size={16} /> Naar facturen <ArrowRight size={14} />
              </Button>
            </StepCard>
            <StepCard
              stepNumber={2}
              title="Controleer je uitgaven"
              description="Bekijk of alle zakelijke uitgaven met BTW correct zijn ingevoerd. Vergeet geen kleine aankopen."
            >
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/expenses')} className="gap-1.5">
                <Receipt size={16} /> Naar uitgaven <ArrowRight size={14} />
              </Button>
            </StepCard>
            <StepCard
              stepNumber={3}
              title="Bekijk je BTW-overzicht"
              description="Op de BTW-pagina zie je het verschil tussen ontvangen en betaalde BTW. Dit is het bedrag dat je moet afdragen of terugkrijgt."
            >
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/belastinghulp/btw')} className="gap-1.5">
                <CurrencyEur size={16} /> Naar BTW-pagina <ArrowRight size={14} />
              </Button>
            </StepCard>
            <StepCard
              stepNumber={4}
              isLast
              title="Dien je aangifte in"
              description="Log in op Mijn Belastingdienst Zakelijk en vul de bedragen in. Bewaar een kopie van je aangifte in je administratie."
            />

            {/* Extra info as accordion */}
            <Separator className="my-4" />
            <Accordion type="single" collapsible>
              <AccordionItem value="kor">
                <AccordionTrigger>Wat als ik de KOR (Kleineondernemersregeling) gebruik?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Als je minder dan € 20.000 omzet per jaar hebt, kun je kiezen voor de KOR.
                    Je hoeft dan geen BTW te berekenen aan klanten, maar kunt ook geen BTW aftrekken
                    van je inkopen. Meld je aan bij de Belastingdienst als je hiervoor in aanmerking komt.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="intracommunautair">
                <AccordionTrigger>Hoe zit het met buitenlandse klanten of leveranciers?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Bij leveringen aan of inkopen van EU-landen kunnen speciale BTW-regels gelden
                    (intracommunautaire prestaties). Houd hier rekening mee in je aangifte. Raadpleeg
                    de Belastingdienst of een boekhouder als je hierover twijfelt.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/*  2. Inkomstenbelasting jaaraangifte                           */}
      {/* ============================================================ */}
      {activeSection === 'inkomstenbelasting' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CurrencyEur size={24} weight="duotone" className="text-primary" />
              <div>
                <CardTitle>Inkomstenbelasting – jaaraangifte</CardTitle>
                <CardDescription>
                  Eén keer per jaar doe je aangifte inkomstenbelasting. Hieronder de stappen.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <StepCard
              stepNumber={1}
              title="Sluit je boekjaar af"
              description="Zorg dat alle facturen, uitgaven en bankafschriften van het afgelopen jaar compleet zijn. Controleer of je jaaroverzicht klopt."
            >
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/belastinghulp/jaaroverzicht')} className="gap-1.5">
                <FileText size={16} /> Naar jaaroverzicht <ArrowRight size={14} />
              </Button>
            </StepCard>
            <StepCard
              stepNumber={2}
              title="Bereken je winst"
              description="Je winst = omzet minus zakelijke kosten. Trek hier de ondernemersaftrekken van af (zelfstandigenaftrek, startersaftrek) als je aan de voorwaarden voldoet."
            />
            <StepCard
              stepNumber={3}
              title="Verzamel je aftrekposten"
              description="Denk aan de zelfstandigenaftrek (minimaal 1.225 uur per jaar), startersaftrek (eerste drie jaar), MKB-winstvrijstelling (14% korting op je winst) en eventueel investeringsaftrek."
            />
            <StepCard
              stepNumber={4}
              isLast
              title="Vul de aangifte in"
              description="Gebruik het aangifteformulier op Mijn Belastingdienst. De deadline is meestal 1 mei. Vraag uitstel aan als je meer tijd nodig hebt."
            />

            {/* Extra info as accordion */}
            <Separator className="my-4" />
            <Accordion type="single" collapsible>
              <AccordionItem value="zelfstandigenaftrek">
                <AccordionTrigger>Hoe werkt de zelfstandigenaftrek?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Als ZZP&apos;er heb je recht op zelfstandigenaftrek als je aan het urencriterium
                    voldoet (minimaal 1.225 uur per jaar besteed aan je onderneming). Deze aftrek
                    verlaagt je belastbaar inkomen. Het bedrag wordt jaarlijks aangepast door de
                    overheid.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="startersaftrek">
                <AccordionTrigger>Wat is de startersaftrek?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Ben je in de afgelopen vijf jaar minder dan drie keer ondernemer geweest? Dan
                    kun je de startersaftrek krijgen bovenop de zelfstandigenaftrek. Dit verlaagt
                    je belasting nog verder.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="mkb">
                <AccordionTrigger>Wat is de MKB-winstvrijstelling?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Elke ondernemer die aangifte doet via de inkomstenbelasting heeft recht op de
                    MKB-winstvrijstelling. Dit is een korting van 14% op je winst na aftrek van de
                    ondernemersaftrekken.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/*  3. Documenten voorbereiden                                   */}
      {/* ============================================================ */}
      {activeSection === 'documenten' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Folder size={24} weight="duotone" className="text-primary" />
              <div>
                <CardTitle>Welke documenten heb je nodig?</CardTitle>
                <CardDescription>
                  Een overzicht van wat je klaar moet hebben voor je aangifte.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h4 className="font-semibold text-sm mb-3">Voor BTW-aangifte (per kwartaal)</h4>
                <ul className="space-y-2">
                  <ChecklistItem label="Alle verkoopfacturen van het kwartaal" />
                  <ChecklistItem label="Alle inkoopfacturen en bonnetjes" />
                  <ChecklistItem label="Creditnota's (als je die hebt verstuurd of ontvangen)" />
                  <ChecklistItem label="Bankafschriften ter controle" />
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-3">Voor inkomstenbelasting (jaarlijks)</h4>
                <ul className="space-y-2">
                  <ChecklistItem label="Jaarrekening of winst-en-verliesrekening" />
                  <ChecklistItem label="Overzicht zakelijke kosten (met bonnetjes)" />
                  <ChecklistItem label="Urenregistratie (voor zelfstandigenaftrek)" />
                  <ChecklistItem label="Investeringsoverzicht (voor investeringsaftrek)" />
                  <ChecklistItem label="Overzicht privé-gebruik zakelijke goederen" />
                  <ChecklistItem label="Jaaropgave van bank en verzekeraar" />
                </ul>
              </div>
            </div>

            <Separator className="my-6" />

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/invoices')} className="gap-1.5">
                <FileText size={16} /> Naar facturen <ArrowRight size={14} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/expenses')} className="gap-1.5">
                <Receipt size={16} /> Naar uitgaven <ArrowRight size={14} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/belastinghulp/jaaroverzicht')} className="gap-1.5">
                <CurrencyEur size={16} /> Naar jaaroverzicht <ArrowRight size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/*  4. Veelgemaakte fouten                                       */}
      {/* ============================================================ */}
      {activeSection === 'fouten' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <WarningCircle size={24} weight="duotone" className="text-orange-600" />
              <div>
                <CardTitle>Veelgemaakte fouten</CardTitle>
                <CardDescription>
                  Voorkom deze veelvoorkomende fouten bij je belastingaangifte.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="m1">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-orange-600 border-orange-300">1</Badge>
                    BTW niet op tijd aangeven
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">
                    De deadline voor BTW-aangifte is meestal de laatste werkdag van de maand na het
                    kwartaal. Te laat aangifte doen kan leiden tot een boete. Zet een herinnering in
                    je agenda.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="m2">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-orange-600 border-orange-300">2</Badge>
                    Privé- en zakelijke kosten door elkaar
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Houd je privé-uitgaven strikt gescheiden van zakelijke kosten. Gebruik bij
                    voorkeur een aparte zakelijke bankrekening. Gemengde kosten (zoals een auto
                    of telefoon) splits je op basis van zakelijk gebruik.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="m3">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-orange-600 border-orange-300">3</Badge>
                    Bonnetjes niet bewaren
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Bewaar alle bonnetjes en facturen minimaal 7 jaar. Zonder bewijs kun je kosten
                    niet aftrekken bij een controle. Scan je bonnetjes digitaal in om verlies te
                    voorkomen.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="m4">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-orange-600 border-orange-300">4</Badge>
                    Uren niet bijhouden
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Voor de zelfstandigenaftrek moet je minimaal 1.225 uur per jaar aan je
                    onderneming besteden. Zonder urenregistratie kun je dit niet bewijzen bij een
                    controle. Registreer je uren dagelijks.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="m5">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-orange-600 border-orange-300">5</Badge>
                    Aftrekposten vergeten
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Veel ZZP&apos;ers vergeten aftrekbare kosten zoals een thuiswerkplek, zakelijke
                    verzekeringen, vakliteratuur, en reiskosten. Maak een lijst van al je zakelijke
                    uitgaven en controleer of je niets mist.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/*  5. Einde-kwartaal checklist                                  */}
      {/* ============================================================ */}
      {activeSection === 'kwartaal' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CalendarCheck size={24} weight="duotone" className="text-primary" />
              <div>
                <CardTitle>Einde-kwartaal checklist</CardTitle>
                <CardDescription>
                  Loop deze stappen door aan het einde van elk kwartaal.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">1</span>
                <div>
                  <p className="text-sm font-medium">Controleer of alle facturen zijn ingevoerd</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Zowel verkoopfacturen als inkoopfacturen moeten compleet zijn.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">2</span>
                <div>
                  <p className="text-sm font-medium">Verwerk alle bonnetjes en uitgaven</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Scan en verwerk alle ontvangstbewijzen voordat je ze kwijtraakt.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">3</span>
                <div>
                  <p className="text-sm font-medium">Controleer je bankafschriften</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Zorg dat alle banktransacties gekoppeld zijn aan de juiste facturen of uitgaven.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">4</span>
                <div>
                  <p className="text-sm font-medium">Bekijk je BTW-overzicht</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Controleer de BTW-bedragen en bereid je aangifte voor.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">5</span>
                <div>
                  <p className="text-sm font-medium">Dien je BTW-aangifte in</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Deadline: uiterlijk de laatste werkdag van de maand na het kwartaal.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">6</span>
                <div>
                  <p className="text-sm font-medium">Controleer openstaande debiteuren</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Stuur herinneringen voor onbetaalde facturen.
                  </p>
                </div>
              </li>
            </ol>

            <Separator className="my-6" />

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/belastinghulp/btw')} className="gap-1.5">
                <Receipt size={16} /> Naar BTW-pagina <ArrowRight size={14} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/invoices')} className="gap-1.5">
                <FileText size={16} /> Naar facturen <ArrowRight size={14} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/expenses')} className="gap-1.5">
                <Receipt size={16} /> Naar uitgaven <ArrowRight size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/*  6. Einde-jaar checklist                                      */}
      {/* ============================================================ */}
      {activeSection === 'jaar' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <ListChecks size={24} weight="duotone" className="text-primary" />
              <div>
                <CardTitle>Einde-jaar checklist</CardTitle>
                <CardDescription>
                  Bereid je voor op het afsluiten van je boekjaar en je jaarlijkse aangifte.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">1</span>
                <div>
                  <p className="text-sm font-medium">Rond alle kwartaalchecklists af</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Zorg dat alle vier kwartalen volledig zijn verwerkt.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">2</span>
                <div>
                  <p className="text-sm font-medium">Controleer je urenregistratie</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Heb je minimaal 1.225 uur geregistreerd? Dit is nodig voor de zelfstandigenaftrek.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">3</span>
                <div>
                  <p className="text-sm font-medium">Maak een overzicht van investeringen</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Heb je bedrijfsmiddelen aangeschaft? Controleer of je recht hebt op investeringsaftrek.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">4</span>
                <div>
                  <p className="text-sm font-medium">Bereken je winst en verlies</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Bekijk je jaaroverzicht voor het totaalplaatje van omzet, kosten en winst.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">5</span>
                <div>
                  <p className="text-sm font-medium">Controleer privégebruik zakelijke goederen</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Gebruik je een zakelijke auto, telefoon of computer ook privé? Houd hier rekening mee.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">6</span>
                <div>
                  <p className="text-sm font-medium">Bereid je inkomstenbelasting-aangifte voor</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Verzamel alle documenten en begin op tijd met je aangifte. Deadline is meestal 1 mei.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">7</span>
                <div>
                  <p className="text-sm font-medium">Archiveer je administratie</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sla alles op (digitaal en/of fysiek). De bewaarplicht is minimaal 7 jaar.
                  </p>
                </div>
              </li>
            </ol>

            <Separator className="my-6" />

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/belastinghulp/jaaroverzicht')} className="gap-1.5">
                <CurrencyEur size={16} /> Naar jaaroverzicht <ArrowRight size={14} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateTo('/zzp/belastinghulp/inkomstenbelasting')} className="gap-1.5">
                <FileText size={16} /> Naar inkomstenbelasting <ArrowRight size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-muted bg-muted/30 px-4 py-3">
        <ShieldWarning size={18} weight="duotone" className="text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium">Disclaimer:</span> De informatie op deze pagina is
          bedoeld als algemene toelichting en vormt geen fiscaal, juridisch of financieel advies.
          Raadpleeg altijd een gekwalificeerde belastingadviseur of boekhouder voor advies dat
          past bij jouw specifieke situatie. Aan deze informatie kunnen geen rechten worden ontleend.
        </p>
      </div>
    </div>
  )
}
