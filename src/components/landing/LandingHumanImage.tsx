import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Dark gradient overlay strengths used to blend portraits into the dark theme. */
const OVERLAY_CLASSES = {
  soft: 'from-background/60 via-background/10 to-transparent',
  medium: 'from-background/80 via-background/20 to-transparent',
  strong: 'from-background/90 via-background/40 to-background/20',
} as const

/**
 * CSS filter applied to portraits so they harmonize with the brand palette:
 *  - contrast 1.02: gentle micro-contrast boost so faces don't look washed out
 *    after the dark overlay is applied
 *  - brightness 0.92: slight darken so bright stock-style highlights don't punch
 *    out of the dark theme
 */
const PORTRAIT_FILTER = 'contrast(1.02) brightness(0.92)'

interface LandingHumanImageProps {
  /** Path to the image file under /public, e.g. "/images/landing/hero-portrait.webp" */
  src: string
  /** Meaningful alt text in Dutch describing the person and context */
  alt: string
  /** Tailwind aspect-ratio class. Default 4/5 portrait. */
  aspect?: string
  /** Intrinsic width hint (CSS pixels) — used for the <img> width attr to avoid CLS. */
  width: number
  /** Intrinsic height hint (CSS pixels) — used for the <img> height attr to avoid CLS. */
  height: number
  /** Extra classes for the outer wrapper. */
  className?: string
  /** Strength of the dark gradient overlay used to blend into the dark theme. */
  overlay?: keyof typeof OVERLAY_CLASSES
  /**
   * `object-position` hint so the most important part of the portrait (typically
   * the subject's eye line / upper third) stays visible when the slot is cropped
   * to different aspect ratios across breakpoints.
   *
   * Defaults to `center 30%` which keeps a subject's face inside the frame for
   * 4/5 portraits.
   */
  objectPosition?: string
  /**
   * Decorative slots (e.g. the hero accent behind the product mockup) should
   * pass `decorative`. When the asset is missing the component will return
   * `null` instead of rendering a placeholder, so a purely-aesthetic slot
   * never adds visual weight on its own.
   *
   * For content slots (sections that anchor on the image), leave this off and
   * supply `placeholderIcon` + `placeholderLabel` so the slot still feels
   * intentional before the final asset ships.
   */
  decorative?: boolean
  /**
   * Optional icon shown inside the on-brand placeholder when the image asset
   * is missing. Use a Lucide icon component, e.g. `Briefcase`.
   */
  placeholderIcon?: React.ComponentType<{ className?: string }>
  /** Short Dutch label rendered under the placeholder icon. */
  placeholderLabel?: string
  /** Optional caption rendered as a smaller secondary line in the placeholder. */
  placeholderCaption?: string
  /** Render arbitrary content as the placeholder, overriding icon/label. */
  placeholderContent?: ReactNode
}

/**
 * Premium, dark-themed wrapper for human imagery on the marketing landing page.
 *
 * Visual treatment:
 *  - rounded-2xl card with the same border/backdrop language as HowItWorksSection
 *  - dark gradient overlay so portraits blend into the dark theme
 *  - subtle desaturation + accent rim light to harmonize with the brand palette
 *
 * Robustness:
 *  - if the image file is missing (404), the component hides itself gracefully
 *    so the layout never shows a broken-image icon. This lets us ship the slots
 *    before the actual .webp assets land in /public/images/landing/.
 */
export const LandingHumanImage = ({
  src,
  alt,
  aspect = 'aspect-[4/5]',
  width,
  height,
  className,
  overlay = 'medium',
  objectPosition = 'center 30%',
  decorative = false,
  placeholderIcon: PlaceholderIcon,
  placeholderLabel,
  placeholderCaption,
  placeholderContent,
}: LandingHumanImageProps) => {
  const [failed, setFailed] = useState(false)

  // Decorative slots stay invisible when the asset is missing — they exist only
  // to layer behind a real product visual and shouldn't add weight on their own.
  if (failed && decorative) {
    return null
  }

  const overlayClass = OVERLAY_CLASSES[overlay]

  const wrapperClasses = cn(
    'group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_10px_40px_-15px_oklch(0_0_0/0.6)] ring-1 ring-inset ring-white/5 backdrop-blur',
    aspect,
    className,
  )

  // On-brand placeholder for content slots: a calm, dark, premium card that
  // matches the site's visual language so the section never reads as "empty"
  // or "broken" before the final portrait ships.
  if (failed) {
    return (
      <div className={wrapperClasses} role="img" aria-label={alt}>
        {/* Layered dark gradient + radial accent glow so the slot reads as a
            deliberate brand surface, not a blank rectangle. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background/80 to-accent/15"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 25%, oklch(0.75 0.22 150 / 0.18), transparent 55%), radial-gradient(circle at 75% 80%, oklch(0.65 0.2 260 / 0.18), transparent 60%)',
          }}
        />
        {/* Subtle dotted texture so the surface has tactile depth at any size. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.18] mix-blend-overlay"
          style={{
            backgroundImage:
              'radial-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px)',
            backgroundSize: '14px 14px',
          }}
        />

        {/* Content: icon + label, centered, low-key */}
        <div className="absolute inset-0 flex items-center justify-center p-6">
          {placeholderContent ?? (
            <div className="flex flex-col items-center text-center">
              {PlaceholderIcon ? (
                <span
                  aria-hidden="true"
                  className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-accent shadow-[inset_0_1px_0_oklch(1_0_0/0.08)] ring-1 ring-inset ring-white/10 backdrop-blur"
                >
                  <PlaceholderIcon className="h-6 w-6" />
                </span>
              ) : null}
              {placeholderLabel ? (
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/80">
                  {placeholderLabel}
                </p>
              ) : null}
              {placeholderCaption ? (
                <p className="mt-1.5 max-w-[18ch] text-[11px] leading-relaxed text-muted-foreground/80">
                  {placeholderCaption}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* Top accent rim (matches the loaded-image treatment) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5"
        />
      </div>
    )
  }

  return (
    <div className={wrapperClasses}>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover saturate-[0.85] transition-transform duration-700 ease-out group-hover:scale-[1.02]"
        style={{ filter: PORTRAIT_FILTER, objectPosition }}
      />
      {/* Dark gradient blend so the portrait melts into the page's dark background */}
      <div
        aria-hidden="true"
        className={cn('pointer-events-none absolute inset-0 bg-gradient-to-t', overlayClass)}
      />
      {/* Subtle accent rim light along the top edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
      />
      {/* Subtle inner border for depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5"
      />
    </div>
  )
}
