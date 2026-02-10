/**
 * usePreventBodyScrollLock - Protection hook to prevent body scroll lock from getting stuck
 * 
 * Radix UI components (Dialog, Sheet, AlertDialog) automatically set body { overflow: hidden }
 * when opened. Sometimes this can get stuck if a component unmounts while the dialog is open.
 * 
 * This hook ensures body scroll lock is released on route changes.
 */

import { useEffect } from 'react'

export function usePreventBodyScrollLock() {
  useEffect(() => {
    // Function to check and release body scroll lock
    const releaseScrollLock = () => {
      if (!document.body) return

      const bodyOverflow = window.getComputedStyle(document.body).overflow
      
      // Check if there are any open Radix UI overlays
      // Radix UI uses data-radix-* attributes and role="dialog"
      const openOverlays = document.querySelectorAll([
        '[data-radix-dialog-overlay][data-state="open"]',
        '[data-radix-alert-dialog-overlay][data-state="open"]',
        '[data-radix-drawer-overlay][data-state="open"]',
        '[data-state="open"][role="dialog"]',
        '[data-slot*="overlay"][data-state="open"]', // Fallback for shadcn/ui components
      ].join(', '))
      
      // If body is locked but no overlays are open, release it
      if (bodyOverflow === 'hidden' && openOverlays.length === 0) {
        console.warn('[usePreventBodyScrollLock] Releasing stuck body scroll lock')
        document.body.style.overflow = ''
        document.body.style.paddingRight = ''
      }
    }

    // Release on mount and route changes
    const handleRouteChange = () => {
      // Small delay to let Radix UI cleanup first
      setTimeout(releaseScrollLock, 100)
    }

    // Check on mount
    releaseScrollLock()

    // Listen for route changes
    window.addEventListener('popstate', handleRouteChange)
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange)
    }
  }, [])
}
