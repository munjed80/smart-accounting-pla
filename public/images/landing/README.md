# Landing page imagery — asset brief

> **Current state (as of 2026-04):** The three `<LandingHumanImage>` slots now
> use **real ZZPers Hub product screenshots** instead of human portraits.
> The three active files are:
>
> | File | Slot | Description |
> | --- | --- | --- |
> | `zzpershub-mobile-dashboard.webp` | Hero (decorative) | Mobile "Start gratis met ZZPersHub" — portrait phone with Overzicht KPI cards |
> | `zzpershub-mobile-agenda.webp` | "Voor accountants" section | Mobile "Jouw agenda, altijd op orde" — two stacked phones with Agenda view |
> | `zzpershub-hero-product.webp` | "Waarom ZZPers Hub?" anchor visual | Wide "Alles voor de moderne zzp'er" — laptop + phone hero, landscape ~16:10 |
>
> The legacy human-portrait filenames (`hero-zzper-portrait.webp`,
> `accountant-at-desk.webp`, `freelancer-at-work.webp`) are no longer referenced
> in the codebase and do not need to be added.

This directory holds the photographic/product screenshot assets used by the
marketing landing page (`src/pages/LandingPage.tsx`).

The page references each file via `<LandingHumanImage>`
(`src/components/landing/LandingHumanImage.tsx`). The component is robust to
missing assets:

- **Decorative slots** (e.g. the hero portrait behind the product mockup) pass
  `decorative` and silently render nothing if the asset is missing — they exist
  only to add subtle depth to a real product visual.
- **Content slots** (sections that anchor on the image) instead render an
  on-brand placeholder card (dark gradient + accent radial glow + dotted
  texture + icon + label) so the section never reads as empty or broken before
  the final asset ships.

So it is **safe to ship the layout slots before the assets land**, and equally
safe to drop the assets in later — no further code changes are required.

---

## Global rules (apply to every image)

Per the project's image guidelines, every final image must be:

- **Natural, realistic, high-quality, and clearly relevant to the product.**
- Premium **dark style** — calm, low-key, slightly cinematic lighting that
  blends with the page's dark theme.
- Believable Dutch **zzp / MKB context** (home office, small studio, workshop,
  kitchen-table bookkeeping, accountant's desk).
- A **small number of strong visuals** — never decorative filler.
- **Produced** as **WebP**, quality 78–82, sRGB, 8-bit.
- Files **must not be pre-baked** with vignettes, heavy filters, fake bokeh
  overlays or text — the component already applies a dark overlay,
  desaturation (`saturate-[0.85]`), micro-contrast (`contrast(1.02)`) and
  brightness (`brightness(0.92)`).

Avoid:

- Overly artificial AI faces (perfectly symmetrical, plastic skin, melted
  hands, extra fingers, broken glasses geometry, weird ear/jewelry shapes).
- Generic corporate stock-photo energy (suit-and-tie boardroom, group meetings,
  exaggerated thumbs-up, hands-on-keyboard with floating UI icons).
- Irrelevant lifestyle imagery (coffee shops, beaches, abstract office
  hallways, pure flat-lay desk shots without a person).
- Front-facing "stock smile" shots — prefer **3/4 or candid** framing,
  half-profile, eyes on screen or on paperwork rather than the lens.
- Logos, real product UIs from competitors, or recognisable brand marks.

Visual matching to the site:

- Brand palette is dark with green/teal accents (`--accent`) and a deeper
  blue/violet primary (`--primary`). Existing photos should have **cool
  shadows** and a **single warm key light** so the colour temperature mixes
  cleanly with the brand glow.
- Subjects should look like **real Dutch zzp'ers / MKB professionals**, ages
  ~28–55, casual to smart-casual. No suits and ties.
- Backgrounds should be **dark, slightly out of focus, low-contrast** so the
  card overlay can blend smoothly without forming hard banding.

---

### (Legacy) `hero-zzper-portrait.webp`

| Field | Spec |
| --- | --- |
| **Used in** | Hero section — sits **behind** the product mockup on `lg:` and up. Hidden on mobile. Decorative — absent if missing. |
| **Visual purpose** | Add a quiet, human "presence" behind the product UI so the hero feels less like a pure screenshot, without ever competing with the product. |
| **Composition** | Single subject, off-centre to the **right** of the frame so their face sits roughly under the top-left corner of the product mockup that overlays it. Lots of negative space on the left for the dark gradient to fade into. |
| **Subject** | One Dutch zzp'er, ~28–45, smart-casual (knit, denim shirt, plain T-shirt). No tie, no suit. Working at a laptop, looking at the screen — not at the camera. |
| **Framing** | Tight 3/4 portrait, head + shoulders + a hint of laptop or notebook. No full body. Eye line on the upper third. |
| **Mood** | Calm, focused, "in flow". Slight half-smile at most. No exaggerated expressions. |
| **Background** | Dark home office or small studio: muted shelf, soft window light off-frame, blurred plants or a frame on the wall. Background must be **darker than the subject** so the dark overlay reads cleanly. |
| **Lighting** | Single soft key light from one side (rim/edge light), cool ambient fill. No flat ring-light look. Skin should be slightly desaturated, not orange. |
| **Ideal dimensions** | **1040 × 1300** (2× the rendered 520 × 650), 4 : 5 portrait. ≤ 200 KB after WebP encoding. |
| **Safe crop area** | Subject's face + eyes must sit inside the **central 60 % vertical band**, biased to the **upper third**. The component crops with `object-position: center 30%` by default. |
| **How it should match the site** | Cool shadows + warm key, dark walls, subtle teal/green tone in the rim light if possible. Must read as a "presence" through `mix-blend-luminosity` and 70 % opacity, so colour saturation is unimportant — **silhouette and lighting direction matter most**. |

---

### (Legacy) `accountant-at-desk.webp`

| Field | Spec |
| --- | --- |
| **Used in** | "Voor accountants" section, left column. Anchors the message *"Nodig je boekhouder uit"*. |
| **Visual purpose** | Make the accountant collaboration story feel real and human — a believable Dutch boekhouder reviewing a client dossier, not a stock CEO at a glass table. |
| **Composition** | Subject at desk, slight 3/4 angle to the camera. Laptop or paperwork in foreground (out of focus). Subject takes ~50 % of frame width, biased to the **right** so the dark overlay on the left can hold the section's text margin. |
| **Subject** | Realistic Dutch accountant / boekhouder, ~35–55, smart-casual (blazer over T-shirt, neat shirt, simple knit). Glasses are a plus — they read as "professional + analytical". Reading glasses on, looking at the screen or at a paper. **No suit and tie.** |
| **Framing** | Medium shot — head, shoulders, hands optionally visible on keyboard or holding a printed report. Avoid full top-down "reviewing documents" cliché. |
| **Mood** | Calm, attentive, trustworthy. Slight thoughtful expression. Not smiling at the camera. |
| **Background** | Quiet small-office or home-office setting: bookshelf with binders or a calm plant, soft warm task lamp, blurred monitor glow. Must be **dark and softly out of focus**. |
| **Lighting** | Cool ambient + warm screen glow on the face. The screen should *not* show any recognisable UI (blur it or angle it away). |
| **Ideal dimensions** | **1440 × 1800** (2× the rendered 720 × 900), 4 : 5 portrait. ≤ 350 KB after WebP encoding. |
| **Safe crop area** | The slot is rendered at `aspect-[4/5]` on mobile, `sm:aspect-[5/4]` on tablet, and `lg:aspect-[4/5]` again on desktop. Keep the subject's **face, hands, and screen edge inside the central 70 % horizontal band and the upper 70 % vertical band**, so the tablet 5 : 4 crop never cuts the face. |
| **How it should match the site** | Same cool-dark / warm-key palette as the hero portrait. Background tones should sit close to `oklch(~0.18 0.02 260)` so the section's `bg-muted/40` doesn't form a visible seam at the image edge. |

---

### (Legacy) `freelancer-at-work.webp`

| Field | Spec |
| --- | --- |
| **Used in** | "Waarom ZZPers Hub?" section, used as a tall **anchor visual** (`lg:row-span-2`) next to the 6 USP cards. An overlay caption ("Voor zzp'ers / Gebouwd voor hoe jij werkt.") sits at the bottom inside the card. |
| **Visual purpose** | Put a face on the USPs — show *who* the product is for. Should feel like a real Dutch freelancer at work, not a generic creative person. |
| **Composition** | Subject takes the **upper two-thirds** of the frame; the **bottom third** must be visually quieter (darker / less detail) because the page renders an absolutely-positioned caption over that region. |
| **Subject** | One zzp'er from a believable trade or service: e.g. graphic designer, photographer, web developer, kapper/stylist, electrician (small van + tablet), webshop owner packing an order, consultant with a notebook. Pick **one** — variety across versions is fine, but each shot is one person, one trade. |
| **Framing** | 3/4 medium shot. Subject working with a tool of their trade — laptop, tablet, sketchbook, fabric, tools — **never** posing or facing the camera. Hands ideally visible and doing something. |
| **Mood** | Focused, in their element, quietly confident. No exaggerated smiles, no hero poses. |
| **Background** | Their actual workspace: small studio, workshop, home office, kitchen table with paperwork, etc. **Dark and softly blurred.** Avoid sterile co-working spaces. |
| **Lighting** | Same cool-dark + single warm key light treatment. A small visible practical light source in the background (lamp, monitor glow, window) adds depth. |
| **Ideal dimensions** | **1440 × 1800** (2× the rendered 720 × 900), 4 : 5 portrait. ≤ 350 KB after WebP encoding. |
| **Safe crop area** | The slot is `aspect-[4/5]` on mobile and `aspect-auto` (height-driven) on `lg:`, so it can stretch taller than 4 : 5. Keep the subject's face inside the **central horizontal band** and within the **top 55 %** vertically. The bottom 25 % of the frame must be a calm, low-contrast region (desk surface, blurred background) so the white overlay caption stays readable. |
| **How it should match the site** | Same palette + lighting language as the other two photos so all three read as a single set. A subtle teal/green tint in the highlights ties to the brand `--accent`. |

---

## Quick checklist before committing a final image

- [ ] WebP, quality 78–82, sRGB, ≤ size budget above.
- [ ] Filename matches exactly (lowercase, hyphenated).
- [ ] Subject's face / focal point sits inside the safe crop area.
- [ ] No baked-in vignettes, text, watermarks or logos.
- [ ] No recognisable third-party UI on screens.
- [ ] No model-release-sensitive faces (use generated or properly licensed
      photography only).
- [ ] Background is dark and softly out of focus.
- [ ] Visually consistent with the other images in the set.

---

## Current product screenshots (active files)

### `zzpershub-mobile-dashboard.webp`

| Field | Spec |
| --- | --- |
| **Used in** | Hero section — sits **behind** the product mockup on `lg:` and up. Hidden on mobile. Decorative — absent if missing. |
| **Visual purpose** | Add a quiet product "presence" behind the hero mockup so it reinforces ZZPers Hub branding. |
| **Content** | Portrait phone render showing the `Overzicht` dashboard with KPI cards (Openstaande facturen, Te laat, Deze maand omzet, Uitgaven, Te betalen btw, Geregistreerde uren) and "Recente facturen" list. Feature bullets around the phone. |
| **Aspect** | ≈ 4 : 5 portrait |
| **Rendered size** | 520 × 650 px (decorative slot, 38 % of hero column width) |
| **Overlay** | `strong` — heavily blended with `mix-blend-luminosity` and 70 % opacity |

### `zzpershub-mobile-agenda.webp`

| Field | Spec |
| --- | --- |
| **Used in** | "Samenwerken met boekhouder" section, left column. Anchors the message *"Nodig je boekhouder uit"*. |
| **Visual purpose** | Show the product's scheduling/agenda capability as a visually clear real-product screenshot. |
| **Content** | Two stacked portrait phones: `Agenda` calendar view (April 2026) and "Afspraken in April" appointment cards. Feature bullets: Overzichtelijk, Snel plannen, Nooit meer vergeten, Altijd gesynchroniseerd. |
| **Aspect** | ≈ 4 : 5 portrait (5 : 4 on tablet) |
| **Rendered size** | 720 × 900 px |
| **Overlay** | `medium` |

### `zzpershub-hero-product.webp`

| Field | Spec |
| --- | --- |
| **Used in** | "Waarom ZZPers Hub?" section, tall anchor visual (`lg:row-span-2`) next to 6 USP cards. Overlay caption ("Voor zzp'ers / Gebouwd voor hoe jij werkt.") at the bottom. |
| **Visual purpose** | Show the full product platform — desktop + mobile — as a wide marketing hero shot. |
| **Content** | Laptop showing `ZZPers Hub` Overzicht dashboard (KPI cards, Omzet overzicht chart, Recente facturen, Agenda, Taken) with a phone showing `Open uren` and time entries. Feature row at bottom: Facturatie, Urenregistratie, Klantenbeheer, Inzicht & groei. |
| **Aspect** | ≈ 16 : 10 landscape (`aspect-[16/10] lg:aspect-auto`) |
| **Rendered size** | 1200 × 750 px |
| **Overlay** | `medium`, `objectPosition: center center` |

---

## Legacy asset briefs (for historical context)

The sections below document the original **human portrait** brief that was
written before the product screenshots shipped. These filenames are **no longer
referenced** in the codebase, but the visual guidelines remain useful context
for future photography if the product screenshots are ever replaced.

### (Legacy) `hero-zzper-portrait.webp`
