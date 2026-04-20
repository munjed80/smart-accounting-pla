import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiOfflineStatus, retryLastFailedApiRequest, subscribeApiOfflineStatus } from '@/lib/api'

const INITIAL_STATUS: ApiOfflineStatus = {
  isOffline: false,
  message: '',
}

export const useApiOfflineStatus = () => {
  const [status, setStatus] = useState<ApiOfflineStatus>(INITIAL_STATUS)
  const [isRetrying, setIsRetrying] = useState(false)
  const wasOffline = useRef(false)

  useEffect(() => {
    const unsubscribe = subscribeApiOfflineStatus((nextStatus) => {
      setStatus(nextStatus)

      // NOTE: We intentionally do NOT fire a toast here.
      // The OfflineBanner component (rendered in AppShell) already provides
      // a persistent, visible indicator with a "Retry" button.
      // Showing a toast as well would cause duplicate messaging for every
      // network failure, confusing users.

      wasOffline.current = nextStatus.isOffline
    })

    return unsubscribe
  }, [])

  const retry = useCallback(async () => {
    setIsRetrying(true)
    try {
      const retried = await retryLastFailedApiRequest()
      if (!retried && typeof window !== 'undefined') {
        window.location.reload()
      }
    } finally {
      setIsRetrying(false)
    }
  }, [])

  return {
    isOffline: status.isOffline,
    message: status.message || 'Offline of verbinding weggevallen',
    isRetrying,
    retry,
  }
}
