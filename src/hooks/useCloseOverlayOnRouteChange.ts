/**
 * useCloseOverlayOnRouteChange - Protection hook to close overlays on navigation
 * 
 * This hook listens for route changes (via popstate and custom navigation events)
 * and calls a cleanup function to close any open overlays/sheets/dialogs.
 * 
 * This prevents stuck overlays when navigating between pages.
 */

import { useEffect } from 'react'

export function useCloseOverlayOnRouteChange(onClose: () => void) {
  useEffect(() => {
    // Handle browser back/forward navigation
    const handlePopState = () => {
      onClose()
    }

    // Handle programmatic navigation (pushState)
    const handleNavigation = () => {
      onClose()
    }

    window.addEventListener('popstate', handlePopState)
    
    // Also listen for custom navigation events if your app uses them
    window.addEventListener('navigate', handleNavigation)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('navigate', handleNavigation)
    }
  }, [onClose])
}
