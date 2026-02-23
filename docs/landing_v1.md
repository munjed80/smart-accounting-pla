# Landing Page Upgrade v1 — Summary

## Doel

Upgrade van de publieke marketinglandingspagina en footer naar een sterkere, meer gestructureerde ervaring voor zowel ZZP'ers als accountants.

---

## Wijzigingen

### A. LandingPage (`src/pages/LandingPage.tsx`)

- **Hero sectie** — Dual-audience value propositions toegevoegd (ZZP'ers + accountants als twee afzonderlijke badge-blokjes). Primaire CTA gewijzigd naar "Start gratis (30 dagen proefperiode)", secundaire CTA naar "Inloggen".
- **Inline "Zo werkt het"** — 3-staps sectie direct onder de hero, vervangt de uitgebreide 5-staps kaarten verderop.
- **ZZP feature grid** — 7 items: Facturen & betalingen, Uitgaven & bonnen, Urenregistratie, Agenda, BTW-overzicht, Exports (PDF/CSV/JSON), Klantenbeheer. Icoonkleur gewijzigd naar groene tint (`oklch(0.72 0.18 150)`).
- **Accountant feature grid** — 7 items: Werklijst, Te beoordelen, Dossier per klant, BTW rubrieken drilldown, Audit trail, Bank matching/reconciliatie, PKI-ondertekening (coming soon). Elk item heeft een eigen icoon.
- **Testimonials** — 3 placeholder-getuigenissen met initialen + avatar-initialen badge + gedetailleerde rol (ZZP/Boekhouder).
- **Help / Startgids sectie** — Nieuwe sectie boven de finale CTA met link naar `/help`.
- **CTA-knoppen** — Accountant "Neem contact op" → `/contact`. Finale CTA ook → `/contact`.

### B. Footer (`src/components/marketing/Footer.tsx`)

Geherstructureerd naar 4 kolommen:

| Kolom | Inhoud |
|-------|--------|
| **Product** | Voor ZZP'ers, Voor boekhouders, Prijzen, FAQ/Startgids, Status (placeholder) |
| **Juridisch** | Privacyverklaring, Cookiebeleid, Algemene voorwaarden, Disclaimer |
| **Bedrijf** | Powered by MHM IT, adres, KvK |
| **Contact** | "Contact opnemen" button → `/contact` |

Footer bottom-bar: `© {jaar} Smart Accounting Platform — Alle rechten voorbehouden.`

### C. Nieuwe pagina's

| Route | Bestand | Beschrijving |
|-------|---------|-------------|
| `/disclaimer` | `src/pages/DisclaimerPage.tsx` | Disclaimer — geen fiscaal advies, aansprakelijkheidsbeperking, IP, toepasselijk recht |
| `/contact` | `src/pages/ContactPage.tsx` | Contactformulier (naam, e-mail, rol ZZP/Boekhouder, bericht) + success state |
| `/help` | `src/pages/HelpPage.tsx` | Gestructureerde startgids met 8 secties: Aan de slag, Facturen, Uitgaven, Uren, BTW, Exports, Abonnement & betaling, Problemen oplossen |
| `/faq` | Aliased naar `/help` via routing | Backward-compatible redirect |

### D. App routing (`src/App.tsx`)

- Imports toegevoegd voor `DisclaimerPage`, `ContactPage`, `HelpPage`.
- `Route` type uitgebreid met `disclaimer`, `contact`, `help`.
- `getRouteFromURL` bijgewerkt voor paden `/disclaimer`, `/contact`, `/help`, `/faq`.
- Rendering toegevoegd in `AppContent` voor de nieuwe routes.

---

## Design keuzes

- **Accentkleur groen** (`oklch(0.72 0.18 150)`) voor ZZP feature-iconen — subtiel, past in het bestaande dark theme.
- **`--accent2`** (amber/goud, `oklch(0.78 0.16 70)`) gebruikt voor sterrenwaardering en highlights — al aanwezig in de CSS.
- Dark theme en typografie ongewijzigd gelaten.
- Geen competitor-merknamen toegevoegd.
- Alle UI-teksten in het Nederlands.

---

## Build & Lint

Run na wijzigingen:
```bash
npm run lint
npm run build
```
