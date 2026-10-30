import { BRAND_NAME } from '@/lib/brand'

interface BrandLockupProps {
  size?: 'md' | 'lg'
  className?: string
}

/** The same accessible wordmark on the homepage, authentication and workspace. */
export const BrandLockup = ({ size = 'lg', className = '' }: BrandLockupProps) => (
  <span className={`brand-lockup brand-lockup--${size} ${className}`} aria-label={BRAND_NAME}>
    <span className="brand-mark" aria-hidden="true">z<span>.</span></span>
    <span className="brand-wordmark">ZZPers<span> Hub</span></span>
  </span>
)

export default BrandLockup
