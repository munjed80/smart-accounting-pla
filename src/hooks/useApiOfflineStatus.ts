import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
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

      if (nextStatus.isOffline && !wasOffline.current) {
        toast.error(nextStatus.message || 'Offline of verbinding weggevallen', {
          action: {
            label: 'Opnieuw proberen',
            onClick: () => {
              void retryLastFailedApiRequest()
            },
          },
        })
      }

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
