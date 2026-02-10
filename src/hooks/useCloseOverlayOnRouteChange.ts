/**
 * useCloseOverlayOnRouteChange - Protection hook to close overlays on navigation
 * 
 * This hook listens for route changes (via popstate events) and calls a cleanup 
 * function to close any open overlays/sheets/dialogs.
 * 
 * This prevents stuck overlays when navigating between pages.
 * 
 * Note: Only listens for browser navigation (back/forward). If using a custom
 * navigation system, you may need to add additional event listeners.
 */

import { useEffect, useRef } from 'react'

export function useCloseOverlayOnRouteChange(onClose: () => void) {
  // Use ref to avoid recreating effect when onClose changes
  const onCloseRef = useRef(onClose)
  
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  
  useEffect(() => {
    // Handle browser back/forward navigation
    const handlePopState = () => {
      onCloseRef.current()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, []) // No dependencies - effect setup only once
}
