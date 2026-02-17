import { WifiSlash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useApiOfflineStatus } from '@/hooks/useApiOfflineStatus'

export const OfflineBanner = () => {
  const { isOffline, message, retry, isRetrying } = useApiOfflineStatus()

  if (!isOffline) {
    return null
  }

  return (
    <div className="border-b border-amber-300/40 bg-amber-500/15">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3 px-4 py-2 text-sm text-amber-900 dark:text-amber-100 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <WifiSlash size={18} weight="duotone" />
          <span>{message}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void retry()}
          disabled={isRetrying}
          className="border-amber-600/40 bg-transparent text-amber-900 hover:bg-amber-500/20 dark:text-amber-100"
        >
          {isRetrying ? 'Bezig…' : 'Opnieuw proberen'}
        </Button>
      </div>
    </div>
  )
}
