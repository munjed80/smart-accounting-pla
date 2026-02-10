import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Container component that provides smooth fade transitions between loading and content states.
 * Prevents abrupt DOM swaps and provides a professional loading experience.
 * 
 * @param isLoading - Whether to show loading state
 * @param loadingContent - Content to show while loading (usually <Skeleton />)
 * @param children - Actual content to show when loaded
 * @param className - Optional className for the container
 */
interface LoadingContainerProps {
  isLoading: boolean
  loadingContent: ReactNode
  children: ReactNode
  className?: string
}

export function LoadingContainer({
  isLoading,
  loadingContent,
  children,
  className,
}: LoadingContainerProps) {
  return (
    <div className={cn('relative', className)}>
      {isLoading && (
        <div
          className="animate-in fade-in-0 duration-200"
          style={{
            opacity: 1,
            transition: 'opacity 200ms ease-in-out',
          }}
        >
          {loadingContent}
        </div>
      )}
      {!isLoading && (
        <div
          className="animate-in fade-in-0 duration-200"
          style={{
            opacity: 1,
            transition: 'opacity 200ms ease-in-out',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
