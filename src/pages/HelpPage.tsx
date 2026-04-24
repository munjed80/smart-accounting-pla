import { useState, useEffect, useMemo, useCallback } from 'react'
import { navigateTo } from '@/lib/navigation'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { MarketingFooter } from '@/components/marketing/Footer'

/**
 * Structured help content for one product page or topic.
 *
 * The fields are deliberately uniform so every section answers the same
 * questions: what is this page for, what can you do, when do you use it,
 * which buttons matter, and how does it connect to the rest of the product.
 * Optional `tip` and `limitation` keep the content honest without padding.
 */
type HelpSection = {
  id: string
  title: string
  /** One short sentence — the purpose of the page. */
  purpose: string
  /** Concrete things the user can do on the page. */
  whatYouCanDo: string[]
  /** Most important buttons / actions, named as they appear in the UI. */
  keyActions?: string[]
  /** When the user typically opens this page. */
  whenToUse?: string
  /** How this page links into the rest of the workflow (referenced as readable text). */
  connectsWith?: string[]
  /** Practical tip for first-time users. */
  tip?: string
  /** Honest note about a limitation of the page (only when relevant). */
  limitation?: string
}

type HelpGroup = {
  id: string
  title: string
  description: string
  sections: HelpSection[]
}

/**
 * The help content is grouped logically rather than alphabetically so users
 * can scan from "first steps" → "daily work" → "obligations" → "bookkeeping"
 * → "tax" → "integrations" → "collaboration" → "account". Each section's
 * facts come from the actual product code (`src/components/*` and
 * `src/lib/routing.ts`) — no invented features.
 */
const helpGroups: HelpGroup[] = [
  {
    id: 'aan-de-slag',
    title: '1. Aan de slag',
    description: 'De eerste stappen om je administratie in te richten en het platform te leren kennen.',
    sections: [
      {
        id: 'account-en-administratie',
        title: 'Account aanmaken & administratie inrichten',
        purpose:
          'Hier zet je je account en bedrijfsgegevens op zodat alles wat je later doet (facturen, BTW, jaaroverzicht) automatisch klopt.',
        whatYouCanDo: [
          'Een account aanmaken met je e-mailadres en een wachtwoord.',
          'Je bedrijfsgegevens invullen: handelsnaam, KvK-nummer, BTW-nummer, adres en bankrekening.',
          'Eventueel meerdere administraties beheren als je voor meer dan één onderneming werkt.',
        ],
        keyActions: [
          '"Start gratis (90 dagen proefperiode)" op de startpagina',
          '"Bedrijfsgegevens" in Instellingen invullen',
        ],
        whenToUse:
          'Direct bij je eerste login. Vul de bedrijfsgegevens compleet in voordat je je eerste factuur maakt — die gegevens komen op de PDF terecht.',
        connectsWith: [
          'Instellingen — voor het wijzigen van bedrijfsgegevens, bankrekening en abonnement.',
          'Facturen — gebruikt jouw bedrijfsgegevens als afzender op elke factuur.',
        ],
        tip: 'Zorg dat je BTW- en KvK-nummer correct staan voordat je gaat factureren. Achteraf wijzigen geldt alleen voor nieuwe facturen.',
      },
      {
        id: 'rondleiding',
        title: 'Het menu en navigatie',
        purpose:
          'Korte uitleg over hoe het platform is opgebouwd zodat je weet waar je iets kunt vinden.',
        whatYouCanDo: [
          'Links navigeren via het zijmenu (op desktop) of de onderbalk (op mobiel).',
          'Belastinghulp uitklappen voor BTW, Inkomstenbelasting, Uitleg en Jaaroverzicht.',
          'Bovenin per onderdeel filteren en zoeken (klanten, facturen, uitgaven, uren, agenda, …).',
        ],
        whenToUse: 'Gebruik dit als snelle plattegrond als je iets niet kunt vinden.',
        tip: 'Op mobiel zit het hele menu achter het hamburger-icoon linksboven. De belangrijkste onderdelen staan ook in de onderbalk.',
      },
    ],
  },
  {
    id: 'dagelijks-werk',
    title: '2. Dagelijks werk',
    description: 'De pagina\'s die je het vaakst gebruikt: overzicht, klanten, facturen, offertes, uitgaven, uren en agenda.',
    sections: [
      {
        id: 'overzicht',
        title: 'Overzicht (Dashboard)',
        purpose:
          'Je startpagina na het inloggen. Geeft in één oogopslag de stand van zaken van je administratie.',
        whatYouCanDo: [
          'Belangrijkste cijfers bekijken: aantal facturen, uitgaven, omzet en lopende verplichtingen.',
          'Actiepunten zien — meldingen die jouw aandacht nodig hebben (fouten, waarschuwingen, tips).',
          'De omzetgrafiek van de laatste maanden bekijken.',
          'Direct doorklikken naar de modules waar werk ligt.',
        ],
        keyActions: ['Vernieuwen-knop rechtsboven om de cijfers opnieuw te laden'],
        whenToUse: 'Open dit elke werkdag even om te zien of er actiepunten zijn (openstaande facturen, te boeken uitgaven, naderende deadlines).',
        connectsWith: [
          'Facturen, Uitgaven en Boekingen — via de actiekaarten klik je direct door.',
        ],
      },
      {
        id: 'klanten',
        title: 'Klanten',
        purpose: 'Hier beheer je je klantenbestand — bedrijven en personen aan wie je factureert.',
        whatYouCanDo: [
          'Klant toevoegen, bewerken of verwijderen.',
          'Per klant adres, e-mail, telefoon, KvK- en BTW-nummer en bankgegevens vastleggen.',
          'Zoeken op klantnaam en filteren op status (actief/inactief).',
          'Aantallen actieve en inactieve klanten in één oogopslag zien op de cijferkaarten.',
        ],
        keyActions: [
          '"+ Klant toevoegen"',
          'Bewerk- en verwijderknop per klant',
          'Detailpaneel om alle gegevens te bekijken',
        ],
        whenToUse: 'Voor je je eerste factuur of offerte maakt. Een klant moet bestaan voordat je voor hem kunt factureren.',
        connectsWith: [
          'Facturen en Offertes — kiezen je klant uit deze lijst.',
          'Uren — uren kun je toewijzen aan een klant zodat ze later op de juiste factuur komen.',
        ],
        tip: 'Vul het BTW-nummer in voor zakelijke klanten binnen de EU. Dat is nodig om eventueel met BTW-verlegging te kunnen werken.',
      },
      {
        id: 'facturen',
        title: 'Facturen',
        purpose: 'Maken, verzenden en bijhouden van verkoopfacturen aan klanten.',
        whatYouCanDo: [
          'Een nieuwe factuur opstellen met meerdere regelitems (omschrijving, aantal, prijs, BTW-tarief 0/9/21%).',
          'Een factuur opslaan als concept of definitief versturen — bij versturen krijgt hij een definitief factuurnummer.',
          'PDF downloaden, per e-mail versturen, kopiëren of een deelbare link maken.',
          'De status volgen: concept, verzonden, betaald, te laat, geannuleerd.',
          'Filteren op status, datumbereik, klant of bedrag en zoeken op factuurnummer of klantnaam.',
          'Per maand zien hoeveel openstaat, hoeveel is betaald en wat te laat is.',
        ],
        keyActions: [
          '"+ Nieuwe factuur" / "Factuur toevoegen"',
          '"Versturen" om definitief te maken',
          '"Betaald" om de status bij te werken zodra het geld binnen is',
          'Download / E-mail / Print / Kopieer knoppen per factuur',
        ],
        whenToUse: 'Zodra je werk hebt geleverd of een aanbetaling moet ontvangen.',
        connectsWith: [
          'Klanten — als afzender van de factuur.',
          'Uren — geregistreerde uren kun je in één klik omzetten naar factuurregels.',
          'BTW Overzicht — betaalde facturen tellen automatisch mee voor de BTW-aangifte (kasstelsel: pas geteld als de factuur is betaald).',
          'Inkomstenbelasting & Jaaroverzicht — facturen vormen je omzet.',
        ],
        tip: 'Markeer een factuur direct als "betaald" zodra het geld op je rekening staat. Anders blijft hij als openstaand staan en klopt je BTW-overzicht niet.',
      },
      {
        id: 'offertes',
        title: 'Offertes',
        purpose: 'Voorstellen versturen aan (potentiële) klanten voordat het echte werk begint.',
        whatYouCanDo: [
          'Offerte opstellen met regelitems, vergelijkbaar met een factuur.',
          'Status bijhouden: concept, verzonden, geaccepteerd, verlopen, geweigerd, omgezet naar factuur.',
          'Een geaccepteerde offerte met één klik omzetten naar een factuur — alle regels worden overgenomen.',
          'PDF downloaden, kopiëren, delen of versturen.',
          'Filteren op status, klant, datum en bedrag.',
        ],
        keyActions: [
          '"+ Offerte toevoegen"',
          '"Omzetten naar factuur" zodra een offerte is geaccepteerd',
        ],
        whenToUse: 'Wanneer je eerst een prijsopgave wilt sturen voordat je daadwerkelijk gaat factureren.',
        connectsWith: [
          'Klanten — bepaalt de ontvanger.',
          'Facturen — een geaccepteerde offerte wordt hier een factuur.',
        ],
      },
      {
        id: 'uitgaven',
        title: 'Uitgaven',
        purpose: 'Bijhouden van je zakelijke kosten en de BTW die je daarop kunt terugvorderen.',
        whatYouCanDo: [
          'Uitgave toevoegen met leverancier, datum, bedrag en BTW-tarief (0/9/21%).',
          'Een categorie kiezen (bijv. kantoorkosten, reiskosten, marketing, verzekeringen).',
          'Een bonnetje of factuur als bijlage uploaden (foto of PDF).',
          'Filteren op categorie, maand of zoeken in omschrijving.',
          'Cijferkaarten zien voor totale uitgaven, totale BTW en het maandgemiddelde.',
        ],
        keyActions: [
          '"+ Uitgave toevoegen"',
          'Camera-icoon om een bon te scannen',
          'Bewerk- en verwijderknop per uitgave',
        ],
        whenToUse: 'Bij voorkeur direct na elke aankoop, of in batches per week.',
        connectsWith: [
          'Documenten / Slim uploaden — uploads daar kunnen worden omgezet naar een uitgave met vooringevulde gegevens.',
          'BTW Overzicht — de betaalde BTW op uitgaven (voorbelasting) komt hier automatisch in.',
          'Inkomstenbelasting & Jaaroverzicht — uitgaven verlagen je belastbare winst.',
        ],
        tip: 'Hang altijd een bon of factuur als bijlage aan een uitgave. Voor de Belastingdienst geldt: geen bewijs, geen aftrek.',
      },
      {
        id: 'uren',
        title: 'Uren',
        purpose: 'Werkuren registreren — handmatig of met een timer — en die later in één klik factureren.',
        whatYouCanDo: [
          'Urenboeking toevoegen met datum, klant, project, aantal uren en omschrijving.',
          'Een timer starten en stoppen voor je huidige werksessie.',
          'Filteren op periode, klant, factureerbaar/niet-factureerbaar, of al/niet gefactureerd.',
          'De weekgrafiek bekijken (uren per dag, laatste 7 dagen).',
          'Geselecteerde uren omzetten naar facturen — per dag, week, maand of eigen periode.',
          'Uren als CSV exporteren.',
        ],
        keyActions: [
          '"+ Uren toevoegen"',
          '"Start timer" / "Stop timer"',
          '"Factureer geselecteerde uren"',
          '"Exporteer als CSV"',
        ],
        whenToUse: 'Tijdens of direct na het werk. Zo blijft je registratie compleet en kun je later zonder gedoe factureren.',
        connectsWith: [
          'Klanten — uren worden gekoppeld aan een bestaande klant.',
          'Facturen — uren worden hier omgezet naar factuurregels.',
        ],
        tip: 'Gebruik de timer om vergeten kwartiertjes te vermijden. Stop hem zodra je iets anders gaat doen — pauzes hoor je niet te factureren.',
      },
      {
        id: 'agenda',
        title: 'Agenda',
        purpose: 'Eigen agenda voor afspraken, klusdagen en deadlines, los van Outlook of Google.',
        whatYouCanDo: [
          'Wisselen tussen maand- en weekweergave.',
          'Afspraak toevoegen, bewerken, dupliceren of verwijderen.',
          'Terugkerende afspraken instellen (dagelijks, wekelijks, maandelijks).',
          'Een kleur/categorie aan een afspraak hangen.',
          'Een afspraak exporteren als ICS-bestand zodat je hem in een andere agenda kunt openen.',
          'Zoeken in afspraken.',
        ],
        keyActions: [
          '"+ Afspraak toevoegen"',
          'Pijltjes om door maanden te navigeren',
          'Dubbelklik op een dag om snel een afspraak te maken (desktop)',
        ],
        whenToUse: 'Voor klantafspraken, deadlines (bijv. BTW-aangifte) en eigen werkblokken.',
        tip: 'Toetsenbord-shortcuts: pijltjes om te navigeren, Enter om te openen, "N" voor een nieuwe afspraak, Escape om te sluiten.',
      },
    ],
  },
  {
    id: 'verplichtingen',
    title: '3. Verplichtingen & vaste lasten',
    description: 'Overzicht van wat je elke maand of elk kwartaal kwijt bent: leases, leningen, abonnementen.',
    sections: [
      {
        id: 'verplichtingen-overzicht',
        title: 'Verplichtingen Overzicht',
        purpose:
          'Eén dashboard voor al je vaste lasten samen: leases, leningen en abonnementen.',
        whatYouCanDo: [
          'Filteren op type (alle / lease / lening / abonnement), op frequentie (maand / kwartaal / jaar) en status (actief / gepauzeerd / beëindigd).',
          'Cijferkaarten zien voor totaal per maand, per jaar en de verwachte BTW-teruggave.',
          'De top 5 grootste verplichtingen bekijken.',
          'Komende vervaldata zien, gesorteerd op eerstvolgende betaling.',
          'Een schatting van de BTW-teruggave per kwartaal per categorie zien.',
          'Een indicatie krijgen van de maandelijkse cashflow-druk.',
        ],
        whenToUse: 'Aan het begin van de maand om te kijken wat eraan komt, of bij liquiditeitsplanning.',
        connectsWith: [
          'Lease & Leningen en Abonnementen — die voeden dit overzicht.',
        ],
      },
      {
        id: 'lease-leningen',
        title: 'Lease & Leningen',
        purpose: 'Beheer van je lopende lease- en leningcontracten.',
        whatYouCanDo: [
          'Een lease of lening toevoegen met naam, type, hoofdsom, rente, start- en einddatum.',
          'Betalingsfrequentie kiezen (maand / kwartaal / jaar) en het termijnbedrag.',
          'Resterende schuld en notities vastleggen.',
          'Status bijhouden (actief / beëindigd).',
          'Bestaande verplichtingen bewerken of verwijderen.',
        ],
        keyActions: ['"+ Toevoegen"', 'Bewerk- en verwijderknop per regel'],
        whenToUse: 'Wanneer je een nieuwe lease of lening afsluit, of bij wijzigingen in een bestaand contract.',
        connectsWith: [
          'Verplichtingen Overzicht — toont al je leases en leningen samengevat.',
        ],
        limitation:
          'Lease- en leninggegevens worden lokaal in je browser bewaard. Wissel je van apparaat of browser, dan staan ze niet automatisch op het andere apparaat.',
      },
      {
        id: 'abonnementen',
        title: 'Abonnementen',
        purpose: 'Beheer van terugkerende abonnementen (software, telefoon, verzekeringen, etc.).',
        whatYouCanDo: [
          'Abonnement toevoegen met naam, bedrag, interval (maand / kwartaal / jaar) en startdatum.',
          'BTW-tarief kiezen (0/9/21%) en automatische verlenging aan- of uitzetten.',
          'Contractduur, opzegtermijn en notities vastleggen.',
          'Per abonnement de jaarkosten en de geschatte BTW-teruggave zien.',
          'Bestaande abonnementen bewerken of verwijderen.',
        ],
        keyActions: ['"+ Toevoegen"', 'Bewerk- en verwijderknop per abonnement'],
        whenToUse: 'Bij elk nieuw of opgezegd abonnement, en periodiek om te checken of er iets niet meer nodig is.',
        connectsWith: [
          'Verplichtingen Overzicht — toont alle abonnementen samengevat.',
        ],
        limitation:
          'Abonnementsgegevens worden lokaal in je browser bewaard. Wissel je van apparaat of browser, dan staan ze niet automatisch op het andere apparaat.',
      },
    ],
  },
  {
    id: 'boekhouding',
    title: '4. Boekhouding & administratie',
    description: 'Documenten, boekingen en de tools om je administratie compleet te houden.',
    sections: [
      {
        id: 'documenten',
        title: 'Documenten',
        purpose:
          'Centraal postvak voor binnengekomen bonnen en facturen voordat je ze verwerkt tot een uitgave.',
        whatYouCanDo: [
          'Documenten uploaden (PDF of afbeelding).',
          'Wisselen tussen tabbladen Alle / Bonnen / Facturen.',
          'Het type, de upload-datum, het herkende bedrag en de leverancier per document zien.',
          'De verwerkingsstatus volgen (in verwerking, klaar, fout).',
          'Een document omzetten naar een uitgave — herkende gegevens worden vooringevuld.',
          'Een document verwijderen of opnieuw bekijken.',
        ],
        keyActions: ['Upload-knop', '"Omzetten naar uitgave"', 'Verwijderknop'],
        whenToUse: 'Direct nadat je een bon of factuur ontvangt — dan vergeet je hem niet.',
        connectsWith: [
          'Uitgaven — een verwerkt document landt daar als uitgave (met automatisch een bijlage).',
          'Slim uploaden (AI-upload) — alternatieve route voor dezelfde verwerking.',
        ],
      },
      {
        id: 'slim-uploaden',
        title: 'Slim uploaden (AI-upload)',
        purpose:
          'Snelle uploadpagina waar AI de gegevens uit je bonnen en facturen probeert te halen (datum, leverancier, bedrag, BTW).',
        whatYouCanDo: [
          'Een of meerdere bestanden tegelijk uploaden.',
          'De voortgang per bestand zien (in afwachting, uploaden, geüpload, fout).',
          'Mislukte verwerkingen opnieuw laten proberen via "Opnieuw verwerken".',
          'Verwerkte documenten verwijderen of doorzetten naar een uitgave.',
        ],
        keyActions: ['Bestand kiezen / slepen', '"Opnieuw verwerken"', 'Verwijderknop'],
        whenToUse: 'Als je in één keer een stapel bonnen wilt wegwerken en de AI het zware werk wilt laten doen.',
        connectsWith: [
          'Documenten — verwerkte uploads landen daar in je postvak.',
          'Uitgaven — uiteindelijke bestemming van een geboekte bon.',
        ],
        tip: 'De AI kijkt automatisch elke paar seconden of er nieuwe verwerkte documenten zijn. Geduld werkt — je hoeft niet handmatig te verversen.',
      },
      {
        id: 'boekingen',
        title: 'Boekingen',
        purpose:
          'Inzage in alle journaalposten en boekingsregels die voortkomen uit je facturen, uitgaven en koppelingen.',
        whatYouCanDo: [
          'Filteren op datumbereik en op rekening (alle rekeningen of een specifieke).',
          'Per regel datum, omschrijving, rekening, debet, credit en saldo zien.',
          'Het actuele saldo per rekening bekijken.',
          'De lijst handmatig vernieuwen.',
        ],
        keyActions: ['Datumfilter', 'Rekeningselectie', 'Vernieuw-knop'],
        whenToUse: 'Als je wilt controleren waarom een bedrag op een bepaalde plek in je BTW- of jaaroverzicht staat, of om je eigen boekhouding te begrijpen.',
        connectsWith: [
          'Facturen, Uitgaven, Webshop Boekingen — die zijn de bron van de boekingen die je hier ziet.',
          'BTW Overzicht en Jaaroverzicht — gebaseerd op dezelfde boekingen.',
        ],
        limitation:
          'Boekingen is read-only. Je past hier zelf geen boekingen aan — corrigeren doe je in de bron (factuur of uitgave).',
      },
    ],
  },
  {
    id: 'belasting',
    title: '5. Belastinghulp',
    description: 'Voorbereidingstools voor BTW-aangifte, inkomstenbelasting en je jaaroverzicht.',
    sections: [
      {
        id: 'btw-overzicht',
        title: 'BTW Overzicht',
        purpose:
          'Per kwartaal een overzicht van wat je moet afdragen of terugkrijgt aan BTW, op basis van het kasstelsel.',
        whatYouCanDo: [
          'Een kwartaal kiezen via de selector bovenaan.',
          'Het bedrag "Af te dragen BTW" prominent in beeld zien.',
          'Cijferkaarten bekijken voor totale omzet, totale BTW, te betalen BTW en terug te vorderen BTW.',
          'Per maand binnen het kwartaal de details opvragen.',
          'Waarschuwingen lezen (met urgentie: fout / let op / informatie).',
          'Het overzicht downloaden of printen.',
        ],
        keyActions: ['Kwartaalselector', 'Download (XML/JSON)', 'Print-knop'],
        whenToUse: 'Aan het einde van elk kwartaal als voorbereiding op je BTW-aangifte bij de Belastingdienst.',
        connectsWith: [
          'Facturen — alleen betaalde facturen tellen mee voor de af te dragen BTW (kasstelsel).',
          'Uitgaven — leveren de terug te vorderen BTW (voorbelasting).',
          'Boekingen — voor de onderliggende journaalposten.',
        ],
        tip: 'Sent en overdue facturen tellen niet mee voor de BTW die je moet afdragen — pas zodra ze betaald zijn. Dat heet kasstelsel.',
        limitation:
          'Dit overzicht is een hulpmiddel, geen officiële aangifte. De aangifte zelf doe je via Mijn Belastingdienst of via je accountant.',
      },
      {
        id: 'inkomstenbelasting',
        title: 'Inkomstenbelasting',
        purpose:
          'Voorbereiding op je jaarlijkse aangifte inkomstenbelasting met een overzicht van omzet, kosten en winst.',
        whatYouCanDo: [
          'Een belastingjaar kiezen.',
          'De jaarlijkse cijfers bekijken: omzet, kosten en winst.',
          'Een voorbereidingschecklist met genummerde stappen volgen.',
          'Top 5 klanten qua omzet inzien.',
          'Waarschuwingen en tips lezen.',
          'De trend over meerdere jaren bekijken.',
          'Het overzicht downloaden (PDF/Excel) of printen.',
        ],
        keyActions: ['Jaar-selector', 'Download / Print'],
        whenToUse: 'Vanaf januari, bij het voorbereiden van je IB-aangifte over het vorige jaar.',
        connectsWith: [
          'Facturen en Uitgaven — basis voor de cijfers.',
          'Jaaroverzicht — bredere context voor hetzelfde jaar.',
        ],
        limitation:
          'Dit is een voorbereiding, geen officiële aangifte. De aangifte zelf doe je in Mijn Belastingdienst of via je accountant.',
      },
      {
        id: 'uitleg-hulp',
        title: 'Uitleg & hulp (belastinguitleg)',
        purpose:
          'Begeleiding in begrijpelijke taal over hoe BTW, inkomstenbelasting en je administratieve verplichtingen werken.',
        whatYouCanDo: [
          'Door genummerde stappen klikken die uitleggen wat je per kwartaal en per jaar moet doen.',
          'Onderwerpen uitklappen voor extra detail (bijv. wat zijn aftrekbare kosten, hoe werkt zelfstandigenaftrek).',
          'Doorklikken naar de bijbehorende functionele pagina (BTW Overzicht, Inkomstenbelasting, Jaaroverzicht).',
        ],
        whenToUse: 'Als je twijfelt of een term niet kent. Open dit voordat je begint met je aangifte zodat je weet wat je doet.',
        connectsWith: ['BTW Overzicht', 'Inkomstenbelasting', 'Jaaroverzicht'],
        limitation:
          'Algemene uitleg; geen persoonlijk fiscaal advies. Bij twijfel: vraag je accountant of de Belastingdienst.',
      },
      {
        id: 'jaaroverzicht',
        title: 'Jaaroverzicht',
        purpose:
          'Eén verzamelpagina per jaar met alle belangrijke financiële informatie bij elkaar: inkomstenbelasting, BTW per kwartaal en transactiestatistieken.',
        whatYouCanDo: [
          'Een jaar kiezen (huidig of een van de afgelopen jaren).',
          'De inkomstenbelasting-samenvatting van dat jaar zien.',
          'De BTW-cijfers van Q1 t/m Q4 in één overzicht zien.',
          'Het aantal transacties zien (totaal, gematched, niet-gematched, ter beoordeling).',
          'Top 5 klanten qua omzet bekijken.',
          'Verzamelde waarschuwingen uit alle bronnen lezen.',
          'De data handmatig vernieuwen.',
        ],
        whenToUse: 'Aan het einde van een jaar en bij je IB-aangifte, als je alles compact bij elkaar wilt zien.',
        connectsWith: [
          'BTW Overzicht — voor de detailcijfers per kwartaal.',
          'Inkomstenbelasting — voor de jaarlijkse cijfers en checklist.',
          'Boekingen — voor onderliggende mutaties.',
        ],
      },
    ],
  },
  {
    id: 'webshop',
    title: '6. Webshop & integraties',
    description: 'Koppelingen met externe systemen zoals Shopify en WooCommerce, en de review van geïmporteerde verkopen.',
    sections: [
      {
        id: 'integraties',
        title: 'Integraties',
        purpose:
          'Koppel je webshop (Shopify of WooCommerce) zodat verkopen automatisch in je administratie verschijnen.',
        whatYouCanDo: [
          'Een Shopify- of WooCommerce-shop verbinden via een veilige koppeling.',
          'De status van elke koppeling zien (verbonden, niet verbonden, fout).',
          'Een handmatige synchronisatie starten.',
          'Per koppeling productmappings naar grootboekrekeningen instellen en categorieën aan BTW-tarieven koppelen.',
          'De voortgang volgen via een stapsgewijze workflow (verbinden → mappings → review → boeken).',
          'Detail-tabs bekijken: orders en synchronisatielogs.',
          'Een koppeling verbreken.',
        ],
        keyActions: ['"Verbinden"', '"Synchroniseren"', '"Verbreken"'],
        whenToUse: 'Eenmalig als je je webshop wilt aansluiten. Daarna alleen bij wijzigingen of als de sync vastloopt.',
        connectsWith: [
          'Webshop Boekingen — daar verschijnen de orders die uit deze koppelingen komen.',
        ],
        limitation:
          'Integraties zijn alleen beschikbaar voor het Pro-abonnement. Op een gratis account zie je een upgrade-melding.',
      },
      {
        id: 'webshop-boekingen',
        title: 'Webshop Boekingen (verkoop-review)',
        purpose:
          'Werkbankje om geïmporteerde Shopify/WooCommerce-orders te controleren, te corrigeren en in je boekhouding te plaatsen.',
        whatYouCanDo: [
          'Tussen tabs wisselen voor orders, refunds en de review-detail.',
          'Filteren op status, type en webshop-platform.',
          'Per order de status zien: nieuw, controle nodig, gemapped, goedgekeurd, geboekt, overgeslagen, duplicaat of fout.',
          'Een mapping bewerken (grootboekrekening, BTW-tarief) en daarna goedkeuren.',
          'Goedgekeurde orders in bulk in de boekhouding zetten ("posten").',
          'Een order overslaan als hij niet hoort te worden geboekt.',
        ],
        keyActions: [
          'Filterdropdowns (status, type, platform)',
          '"Goedkeuren" en "Boeken"',
          '"Overslaan"',
        ],
        whenToUse: 'Wanneer er nieuwe orders binnenkomen die nog beoordeeld moeten worden — meestal na een sync.',
        connectsWith: [
          'Integraties — leveren de orders aan.',
          'Boekingen — eindbestemming van een geboekte order.',
          'BTW Overzicht — geboekte verkopen tellen mee voor de BTW.',
        ],
        limitation:
          'Ook deze pagina is Pro-only.',
      },
    ],
  },
  {
    id: 'samenwerken',
    title: '7. Samenwerken & data',
    description: 'Samenwerken met je boekhouder en bestaande gegevens in één keer importeren.',
    sections: [
      {
        id: 'boekhouder',
        title: 'Boekhouder (toegang delen)',
        purpose:
          'Hier beheer je welke boekhouder of accountant toegang heeft tot jouw administratie.',
        whatYouCanDo: [
          'Openstaande verzoeken van boekhouders bekijken (naam, e-mail, administratie).',
          'Een verzoek goedkeuren of afwijzen.',
          'Actieve koppelingen zien — wie nu toegang heeft en sinds wanneer.',
          'De toegang van een boekhouder op elk moment intrekken.',
        ],
        keyActions: ['"Goedkeuren"', '"Afwijzen"', '"Intrekken"'],
        whenToUse: 'Als je boekhouder een toegangsverzoek heeft gestuurd, of als je iemand uit je administratie wilt verwijderen.',
        connectsWith: [
          'Instellingen — hier zie je je administratie en account; je boekhouder werkt vanuit zijn eigen werkomgeving.',
        ],
        tip: 'Je behoudt altijd zelf de controle. Een boekhouder krijgt leestoegang en eventueel werkrechten — verwijderen kan met één klik.',
      },
      {
        id: 'data-importeren',
        title: 'Data importeren',
        purpose:
          'Bestaande klanten, facturen of uitgaven uit een ander systeem in één keer overzetten via een CSV-bestand.',
        whatYouCanDo: [
          'Kiezen welke gegevens je wilt importeren: Klanten, Facturen of Uitgaven.',
          'Een leeg CSV-template downloaden met de juiste kolommen en voorbeeldregels.',
          'Een ingevuld CSV-bestand uploaden.',
          'Een voorbeeld zien van wat geïmporteerd gaat worden, inclusief validatie per regel (✓ goed, ⚠ let op, ✗ fout).',
          'De daadwerkelijke import bevestigen of afbreken.',
          'Aan het einde een samenvatting zien (X geïmporteerd, Y overgeslagen).',
        ],
        keyActions: [
          '"Template downloaden"',
          '"Bestand kiezen"',
          '"Importeren"',
        ],
        whenToUse: 'Bij de overstap vanaf een ander pakket, of als je in bulk klanten / facturen / uitgaven wilt invoeren.',
        connectsWith: ['Klanten, Facturen en Uitgaven — daar landen de geïmporteerde regels.'],
        tip: 'Begin met een kleine testset (2–3 regels) om te zien of de mapping klopt voordat je honderden regels in één keer importeert.',
      },
    ],
  },
  {
    id: 'account',
    title: '8. Account & instellingen',
    description: 'Je profiel, bedrijfsgegevens, abonnement en notificaties.',
    sections: [
      {
        id: 'instellingen',
        title: 'Instellingen',
        purpose:
          'Centrale plek voor je account, bedrijfsgegevens, administraties, notificaties, abonnement en data-export.',
        whatYouCanDo: [
          'Je profiel beheren: naam, e-mailadres, wachtwoord wijzigen.',
          'Je bedrijfsprofiel invullen of aanpassen: handelsnaam, KvK, BTW-nummer, adres, telefoon, website, bankrekening.',
          'Je administratie(s) beheren — extra administratie toevoegen als je voor meer dan één onderneming werkt.',
          'Notificaties instellen (push en e-mail).',
          'Je abonnement bekijken, opzeggen of opnieuw activeren.',
          'Versie- en build-informatie zien.',
          'Een data-export starten van je gegevens.',
        ],
        keyActions: [
          '"Opslaan" na elke wijziging',
          '"Wachtwoord wijzigen"',
          '"Abonnement opzeggen" / "Reactiveren"',
          '"Exporteer mijn gegevens"',
        ],
        whenToUse: 'Bij de eerste inrichting, en daarna alleen bij wijzigingen.',
        tip: 'Wijzigingen in je bedrijfsprofiel werken alleen voor nieuwe facturen. Bestaande facturen behouden de gegevens van het moment van versturen — dat is bewust, want een verzonden factuur mag niet meer veranderen.',
      },
      {
        id: 'abonnement',
        title: 'Abonnement & betaling',
        purpose: 'Beheer van je abonnement en facturatie.',
        whatYouCanDo: [
          '90 dagen gratis proefperiode gebruiken zonder creditcard.',
          'Een abonnement activeren via Instellingen → Abonnement.',
          'Betalen via iDEAL of creditcard.',
          'Je abonnement op elk moment opzeggen — toegang blijft tot het einde van de betaalde periode.',
          'Na elke betaling automatisch een factuur per e-mail ontvangen.',
        ],
        keyActions: [
          '"Activeer abonnement"',
          '"Abonnement opzeggen"',
          '"Reactiveren"',
        ],
        whenToUse: 'Aan het einde van je proefperiode, of wanneer je naar Pro wilt om bijvoorbeeld webshopkoppelingen te activeren.',
        connectsWith: [
          'Integraties en Webshop Boekingen — die zijn alleen beschikbaar op een Pro-abonnement.',
        ],
        tip: 'Geen opzegtermijn of boetes — je betaalt per maand en kunt direct stoppen.',
      },
    ],
  },
  {
    id: 'problemen',
    title: '9. Problemen oplossen',
    description: 'Veelvoorkomende problemen en hoe je ze snel oplost.',
    sections: [
      {
        id: 'inloggen',
        title: 'Kan niet inloggen',
        purpose: 'Stappen om weer toegang te krijgen tot je account.',
        whatYouCanDo: [
          'Controleer of je e-mailadres en wachtwoord goed staan (let op hoofdletters).',
          'Gebruik "Wachtwoord vergeten" op de loginpagina om een resetlink te ontvangen.',
          'Kijk in je spam-map als de e-mail niet binnenkomt.',
        ],
        tip: 'Werkt het na een wachtwoord-reset nog niet? Probeer eerst uit te loggen in alle browsertabs en sluit de browser helemaal voor je opnieuw inlogt.',
      },
      {
        id: 'factuur-niet-verstuurd',
        title: 'Factuur wordt niet ontvangen',
        purpose: 'Wat te doen als de klant je factuur niet ziet.',
        whatYouCanDo: [
          'Controleer of het e-mailadres van de klant correct is.',
          'Wacht een paar minuten en laat de klant de spam-map checken.',
          'Verstuur de factuur opnieuw, of download de PDF en stuur hem zelf via je eigen e-mail.',
        ],
      },
      {
        id: 'upload-mislukt',
        title: 'Upload van een bon mislukt',
        purpose: 'Snelle checks bij een mislukte upload.',
        whatYouCanDo: [
          'Controleer het bestandsformaat: JPG, PNG of PDF.',
          'Controleer de bestandsgrootte: maximaal 10 MB.',
          'Comprimeer een grote foto, of zet hem om naar PDF.',
          'Probeer in Slim uploaden de actie "Opnieuw verwerken" als de upload zelf wel lukte maar de AI faalde.',
        ],
      },
      {
        id: 'pwa-installeren',
        title: 'Het platform als app installeren (PWA)',
        purpose: 'Het platform werkt ook als app op je telefoon of laptop.',
        whatYouCanDo: [
          'Op Android (Chrome): open het platform en kies in het menu "Toevoegen aan startscherm".',
          'Op iOS (Safari): tik op het Deel-icoon en kies "Zet op beginscherm".',
          'Op desktop (Chrome/Edge): klik op het installatie-icoon in de adresbalk.',
        ],
        tip: 'Geïnstalleerd opent het platform sneller en werkt het deels ook offline (laatst geladen schermen blijven zichtbaar).',
      },
      {
        id: 'meer-hulp',
        title: 'Mijn vraag staat er niet bij',
        purpose: 'Hoe je persoonlijke ondersteuning krijgt.',
        whatYouCanDo: [
          'Open het contactformulier en omschrijf je probleem zo concreet mogelijk (welk scherm, welke knop, welke foutmelding).',
          'Voeg een screenshot toe als dat kan — dat versnelt de afhandeling enorm.',
        ],
        tip: 'We reageren in de regel binnen één werkdag.',
      },
    ],
  },
]

/**
 * Flat list of every section, used for the JSON-LD FAQ schema and for
 * resolving a `#hash` deep-link to an open section on first render.
 */
const allSections: HelpSection[] = helpGroups.flatMap((g) => g.sections)

const SectionCard = ({
  section,
  isOpen,
  onToggle,
}: {
  section: HelpSection
  isOpen: boolean
  onToggle: () => void
}) => (
  <div id={section.id} className="scroll-mt-20 rounded-lg border border-border overflow-hidden">
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium hover:bg-muted/40 transition-colors"
      aria-expanded={isOpen}
      aria-controls={`${section.id}-content`}
    >
      <span>{section.title}</span>
      {isOpen ? (
        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
    <div
      id={`${section.id}-content`}
      className={isOpen ? 'border-t border-border bg-muted/20 px-5 py-5' : 'hidden'}
    >
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p className="text-foreground/90">{section.purpose}</p>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2">
            Wat kun je hier doen
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            {section.whatYouCanDo.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        {section.keyActions && section.keyActions.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2">
              Belangrijkste knoppen
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {section.keyActions.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {section.whenToUse && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2">
              Wanneer gebruik je dit
            </p>
            <p>{section.whenToUse}</p>
          </div>
        )}

        {section.connectsWith && section.connectsWith.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2">
              Verbonden met
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {section.connectsWith.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {section.tip && (
          <div className="rounded-md border border-accent/20 bg-accent/5 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground mb-1">Tip</p>
            <p>{section.tip}</p>
          </div>
        )}

        {section.limitation && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground mb-1">Goed om te weten</p>
            <p>{section.limitation}</p>
          </div>
        )}
      </div>
    </div>
  </div>
)

export const HelpPage = () => {
  // Multi-open accordion: a Set of currently expanded section ids. The first
  // section of the first group is open by default so the page never looks
  // empty on first load.
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set([helpGroups[0]?.sections[0]?.id].filter(Boolean) as string[]),
  )

  useSeoMeta({
    title: 'Startgids & Help | ZZPers Hub',
    description:
      'Complete in-app gids voor ZZPers Hub. Uitleg per pagina: dashboard, klanten, facturen, uitgaven, uren, agenda, BTW, inkomstenbelasting, integraties en meer.',
    canonical: 'https://zzpershub.nl/help',
  })

  // Open the section referenced by the URL hash on mount, and scroll it into view.
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
    if (!hash) return
    const section = allSections.find((s) => s.id === hash)
    if (!section) return
    setOpenIds((prev) => {
      const next = new Set(prev)
      next.add(section.id)
      return next
    })
    // Defer scroll until after render so the expanded section is in the DOM.
    requestAnimationFrame(() => {
      document.getElementById(section.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }, [])

  // Inject a FAQ JSON-LD payload so search engines can index the topics.
  useEffect(() => {
    const scriptId = 'ld-json-faq-help'
    const existing = document.getElementById(scriptId)
    if (existing) existing.remove()

    const script = document.createElement('script')
    script.id = scriptId
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: allSections.map((s) => ({
        '@type': 'Question',
        name: s.title,
        acceptedAnswer: {
          '@type': 'Answer',
          text: s.purpose,
        },
      })),
    })
    document.head.appendChild(script)
    return () => {
      document.getElementById(scriptId)?.remove()
    }
  }, [])

  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const allSectionIds = useMemo(() => allSections.map((s) => s.id), [])
  const allOpen = openIds.size === allSectionIds.length
  const expandAll = () => setOpenIds(new Set(allSectionIds))
  const collapseAll = () => setOpenIds(new Set())

  const scrollToGroup = (id: string) => {
    document.getElementById(`group-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={() => navigateTo('/')} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
            ZZPers Hub
          </button>
          <Button variant="ghost" onClick={() => navigateTo('/login')}>Inloggen</Button>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-2">Startgids &amp; Help</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Per pagina van het platform: wat het is, wat je er kunt doen, wanneer je het gebruikt en hoe het samenhangt met de rest.
        </p>

        {/* In-page table of contents */}
        <nav
          aria-label="Inhoudsopgave"
          className="mb-8 rounded-lg border border-border bg-muted/20 p-5"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground mb-3">
            In deze gids
          </p>
          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {helpGroups.map((group) => (
              <li key={group.id}>
                <button
                  onClick={() => scrollToGroup(group.id)}
                  className="text-left text-muted-foreground hover:text-foreground hover:underline"
                >
                  {group.title}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={allOpen ? collapseAll : expandAll}>
              {allOpen ? 'Alles inklappen' : 'Alles uitklappen'}
            </Button>
          </div>
        </nav>

        <div className="space-y-10">
          {helpGroups.map((group) => (
            <section
              key={group.id}
              id={`group-${group.id}`}
              className="scroll-mt-20"
              aria-labelledby={`group-${group.id}-title`}
            >
              <h2 id={`group-${group.id}-title`} className="text-xl font-semibold mb-1">
                {group.title}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">{group.description}</p>
              <div className="space-y-2">
                {group.sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    isOpen={openIds.has(section.id)}
                    onToggle={() => toggle(section.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-lg border border-accent/20 bg-accent/5 p-5">
          <h2 className="text-base font-semibold mb-2">Nog steeds een vraag?</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Staat je vraag er niet bij of werkt iets anders dan beschreven? Stuur een bericht via het contactformulier — we reageren in de regel binnen één werkdag.
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
