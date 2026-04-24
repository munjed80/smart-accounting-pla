# Landing page human imagery

This directory holds the human/photographic assets used by `src/pages/LandingPage.tsx`.

The landing page references each file via `<LandingHumanImage>` (see
`src/components/landing/LandingHumanImage.tsx`). If a file is missing, the
component hides itself gracefully — the page never shows a broken-image icon —
so it is safe to ship the layout slots before the assets land.

## Required files

| File                                    | Used in                      | Recommended size        | Aspect | Subject                                                                                  |
| --------------------------------------- | ---------------------------- | ----------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `hero-zzper-portrait.webp`              | Hero (behind product mockup) | 520 × 650 (≤ 200 KB)    | 4 / 5  | Single zzp'er at a laptop, calm and focused, dark/moody lighting, neutral expression.    |
| `accountant-at-desk.webp`               | "Voor accountants" section   | 720 × 900 (≤ 350 KB)    | 4 / 5  | Realistic accountant/professional reviewing a dossier on screen, side or 3/4 framing.    |
| `freelancer-at-work.webp`               | "Waarom ZZPers Hub" anchor   | 720 × 900 (≤ 350 KB)    | 4 / 5  | Freelancer/craftsperson in a believable work context (designer, electrician, consultant). |

All images should be exported as **WebP** (quality ≈ 78–82) to keep the page fast.

## Content rules (must follow)

Per the project's image guidelines, every image must be:

- Natural, realistic, high-quality, and clearly relevant to the product.
- Premium dark style — calm, low-key lighting that blends with the dark theme.
- A believable Dutch zzp/MKB context (home office, small studio, workshop,
  kitchen-table bookkeeping, accountant's desk).
- A small number of strong visuals — never decorative filler.

Avoid:

- Overly artificial AI faces (perfectly symmetrical, plastic skin, melted hands).
- Generic corporate stock-photo energy (suit-and-tie boardroom, group meetings,
  exaggerated thumbs-up, hands-on-keyboard with floating UI icons).
- Irrelevant lifestyle imagery (coffee shops, beaches, abstract office hallways).
- Front-facing "stock smile" shots — prefer 3/4 or candid framing.

## Visual treatment (handled by the component)

`LandingHumanImage` already applies:

- `rounded-2xl` card with `border border-white/10` + inner ring (matches the
  rest of the landing page card language).
- Dark gradient overlay (`from-background/80 via-background/20`) so portraits
  blend into the dark theme.
- Slight desaturation (`saturate-[0.85]`) + accent rim light along the top edge
  to harmonize with the brand palette.
- `loading="lazy"` + `decoding="async"` + intrinsic width/height attrs to avoid
  layout shift.

So source images should be **shot/generated naturally** — do not pre-bake heavy
filters, vignettes, or overlays into the file itself.
