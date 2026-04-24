# Landing page imagery

This directory holds the visual assets used by the marketing landing page
(`src/pages/LandingPage.tsx`).

Each section of the landing page is wired to a single image file whose name
matches the section it belongs to. Slots are rendered through
`<LandingHumanImage>` (`src/components/landing/LandingHumanImage.tsx`), which
applies the dark gradient blend, accent rim and on-brand placeholder used
across the page.

## Active assets

| File | Slot on the landing page | Notes |
| --- | --- | --- |
| `hero-section.png` | Hero — decorative accent behind the product mockup (hidden below the `lg` breakpoint). | `decorative` slot, renders nothing if missing. |
| `nodig-je-boekhouder-uit.png` | "Nodig je boekhouder uit" — accountant collaboration section. | Anchors the *Samenwerken met boekhouder* message. |
| `e-commerce.png` | "Koppel je webshop, alles boekt zichzelf" — webshop / e-commerce section. | Anchors the Shopify + WooCommerce sync story. |
| `belasting-hulp.png` | "Belasting begrijpen, niet vrezen" — Belastinghulp section. | Anchors the BTW + inkomstenbelasting voorbereiding story. |
| `klantenbeheer.png` | "Al je klanten op één plek" — klantenbeheer section. | Anchors the customer-management value prop. |
| `product-in-de-praktijk.png` | "Zo ziet jouw werkdag eruit" — product-in-practice section. | Closes the value-section sequence. |
| `waarom-zzpers-hub.png` | "Waarom ZZPers Hub?" — tall anchor visual next to the 6 USP cards. | Overlay caption ("Voor zzp'ers / Gebouwd voor hoe jij werkt.") rendered on top. |

## Naming rule

Each section image file is named after the section it belongs to. When adding
or replacing imagery, keep the **section ↔ filename** mapping intact so the
landing page stays self-documenting.

## Visual treatment

`<LandingHumanImage>` already applies:

- a dark gradient overlay (`from-background/...`) that blends the asset into
  the page's dark theme,
- micro contrast (`contrast(1.02)`) and brightness (`brightness(0.92)`) to
  match the surrounding palette,
- a subtle desaturation (`saturate-[0.85]`) and a thin accent rim along the
  top edge.

So images **must not be pre-baked** with vignettes, heavy filters, fake bokeh
overlays or burnt-in text — the component will do the blending.

## Image guidelines

- Premium **dark style** — calm, low-key, slightly cinematic lighting.
- Believable Dutch zzp / MKB context.
- WebP or PNG, sRGB, 8-bit. Optimise for the smallest reasonable file size
  while staying visually crisp at the rendered dimensions.
- No logos, no recognisable third-party UI, no text baked into the image.
- Background should be **dark and softly out of focus** so the dark overlay
  reads cleanly.

## Robustness

`<LandingHumanImage>` is forgiving:

- **Decorative slots** (`decorative` prop) silently render nothing if the
  asset is missing — they exist only to add subtle depth.
- **Content slots** fall back to an on-brand placeholder card (dark gradient
  + accent radial glow + dotted texture + icon + label) so a section never
  reads as empty or broken before a final asset ships.
