import { useState } from 'react'
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
}: LandingHumanImageProps) => {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return null
  }

  const overlayClass = OVERLAY_CLASSES[overlay]

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_10px_40px_-15px_oklch(0_0_0/0.6)] ring-1 ring-inset ring-white/5 backdrop-blur',
        aspect,
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover saturate-[0.85] transition-transform duration-700 ease-out group-hover:scale-[1.02]"
        style={{ filter: PORTRAIT_FILTER }}
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
