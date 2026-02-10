import { useState, useEffect } from 'react'

/**
 * Hook to delay showing loading UI by a specified time.
 * This prevents flashing skeleton/loading states for fast API responses.
 * 
 * @param isLoading - The actual loading state from your data fetch
 * @param delay - Delay in milliseconds before showing loading UI (default: 300ms)
 * @param hasData - Whether cached data exists (if true, never show loading UI)
 * @returns boolean - Whether to show loading UI
 * 
 * @example
 * const [isLoading, setIsLoading] = useState(false)
 * const [data, setData] = useState(null)
 * const showLoading = useDelayedLoading(isLoading, 300, !!data)
 * 
 * return showLoading ? <Skeleton /> : <Content data={data} />
 */
export function useDelayedLoading(
  isLoading: boolean,
  delay: number = 300,
  hasData: boolean = false
): boolean {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    // If we have cached data, never show loading UI
    if (hasData) {
      setShowLoading(false)
      return
    }

    // If not loading, immediately hide loading UI
    if (!isLoading) {
      setShowLoading(false)
      return
    }

    // Set a timer to show loading UI after delay
    const timer = setTimeout(() => {
      if (isLoading) {
        setShowLoading(true)
      }
    }, delay)

    // Cleanup: clear timer if loading state changes
    return () => clearTimeout(timer)
  }, [isLoading, delay, hasData])

  return showLoading
}
