/**
 * BrandLockup
 *
 * Shared ZZPers Hub brand lockup (icon + wordmark) for unauthenticated /
 * pre-app surfaces such as the login, register, password reset and
 * onboarding pages.
 *
 * The icon and wordmark mirror the lockup used in the public landing
 * navigation (see `src/pages/LandingPage.tsx`) so the brand presentation
 * stays consistent across every entry point of the product.
 */

interface BrandLockupProps {
  /** Visual size of the lockup. `md` is used in tight headers, `lg` for hero-style auth headers. */
  size?: 'md' | 'lg'
  /** Optional className applied to the outer container. */
  className?: string
}

export const BrandLockup = ({ size = 'lg', className = '' }: BrandLockupProps) => {
  const isLarge = size === 'lg'
  const iconBox = isLarge ? 'h-11 w-11 sm:h-12 sm:w-12' : 'h-9 w-9'
  const iconSvg = isLarge ? 26 : 22
  const wordmark = isLarge
    ? 'text-[1.6rem] sm:text-[1.75rem] leading-none'
    : 'text-xl leading-none'

  return (
    <span
      className={`inline-flex items-center justify-center gap-2.5 select-none ${className}`}
      aria-label="ZZPers Hub"
    >
      <span
        className={`logo-icon-container relative flex ${iconBox} shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 ring-1 ring-primary/30`}
      >
        <svg
          width={iconSvg}
          height={iconSvg}
          viewBox="0 0 22 22"
          fill="none"
          aria-hidden="true"
          className="text-primary"
        >
          <rect x="3" y="1" width="13" height="17" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M6 6h7M6 10h7M6 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="17" cy="16" r="4" fill="var(--accent)" />
          <text
            x="17"
            y="19.5"
            textAnchor="middle"
            fontSize="5.5"
            fontWeight="700"
            fill="white"
            fontFamily="system-ui"
          >
            €
          </text>
        </svg>
      </span>
      <span className={`brand-shimmer font-bold tracking-tight ${wordmark}`}>ZZPers Hub</span>
    </span>
  )
}

export default BrandLockup
