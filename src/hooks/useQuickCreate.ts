import { useEffect, useRef } from 'react'

/** Consume a dashboard action once, even when filters normalize the URL during loading. */
export function useQuickCreate(
  action: string,
  onOpen: () => void,
  ready = true,
) {
  const ownedPath = useRef(window.location.pathname)
  const pending = useRef(
    new URL(window.location.href).searchParams.get('action') === action,
  )
  useEffect(() => {
    const consume = () => {
      const url = new URL(window.location.href)
      if (url.pathname !== ownedPath.current) return
      if (url.searchParams.get('action') === action) pending.current = true
      if (!ready || !pending.current) return
      pending.current = false
      url.searchParams.delete('action')
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      )
      onOpen()
    }
    consume()
    window.addEventListener('popstate', consume)
    window.addEventListener('app:route-change', consume)
    return () => {
      window.removeEventListener('popstate', consume)
      window.removeEventListener('app:route-change', consume)
    }
  }, [action, onOpen, ready])
}
