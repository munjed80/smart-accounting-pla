/**
 * useCloseOverlayOnRouteChange - Protection hook to close overlays on navigation
 * 
 * This hook listens for route changes (via popstate events AND custom navigation events)
 * and calls a cleanup function to close any open overlays/sheets/dialogs.
 * 
 * This prevents stuck overlays when navigating between pages.
 * 
 * Improvements:
 * - Listens for both browser navigation (popstate) and programmatic navigation
 * - Adds delayed cleanup to catch lingering portals
 * - Removes only overlay-related DOM nodes safely
 */

import { useEffect, useRef } from 'react'

// Custom event for programmatic navigation
export const ROUTE_CHANGE_EVENT = 'app:route-change'

// Delay to allow Radix UI portals to complete their cleanup cycle before DOM inspection
// Increased to 150ms to handle slower devices and ensure animations complete
const OVERLAY_CLEANUP_DELAY_MS = 150

export function useCloseOverlayOnRouteChange(onClose: () => void) {
  // Use ref to avoid recreating effect when onClose changes
  const onCloseRef = useRef(onClose)
  
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  
  useEffect(() => {
    // Handle browser back/forward navigation and programmatic navigation
    const handleRouteChange = () => {
      // Close the controlled overlay state
      onCloseRef.current()
      
      // Add delayed cleanup to remove any lingering portal overlays
      setTimeout(() => {
        cleanupOverlayPortals()
      }, OVERLAY_CLEANUP_DELAY_MS)
    }

    window.addEventListener('popstate', handleRouteChange)
    window.addEventListener(ROUTE_CHANGE_EVENT, handleRouteChange)

    return () => {
      window.removeEventListener('popstate', handleRouteChange)
      window.removeEventListener(ROUTE_CHANGE_EVENT, handleRouteChange)
    }
  }, []) // No dependencies - effect setup only once
}

/**
 * Clean up lingering overlay portal nodes
 * Removes only overlay-related elements, not layout containers
 */
export function cleanupOverlayPortals() {
  if (typeof document === 'undefined') return
  
  let removedCount = 0
  
  // Strategy 1: Remove Radix portal containers that contain overlays
  const radixPortals = document.querySelectorAll('[data-radix-portal]')
  radixPortals.forEach(portal => {
    // Check if this portal contains an overlay (has overlay-like attributes or role)
    const hasDialogOverlay = portal.querySelector('[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay]')
    const hasDialog = portal.querySelector('[role="dialog"]')
    
    if (hasDialogOverlay || hasDialog) {
      // Force close state before removing to trigger any cleanup animations
      const overlayElements = portal.querySelectorAll('[data-state]')
      overlayElements.forEach(el => {
        el.setAttribute('data-state', 'closed')
      })
      
      // Small delay to allow forced animation to start, then remove
      setTimeout(() => {
        if (portal.parentNode) {
          portal.remove()
          removedCount++
        }
      }, 50)
    }
  })
  
  // Strategy 2: Remove fixed position overlay elements (more targeted than all elements)
  // Target typical overlay selectors used by Radix/shadcn
  const overlaySelectors = [
    '[data-radix-dialog-overlay]',
    '[data-radix-alert-dialog-overlay]',
    '[data-radix-drawer-overlay]', // Added drawer support
    '[data-state="open"][role="dialog"]',
    '.fixed.inset-0', // Common Tailwind overlay pattern
    '[data-slot="overlay"]', // Some UI libraries use this
  ].join(', ')
  
  const possibleOverlays = document.querySelectorAll(overlaySelectors)
  possibleOverlays.forEach(el => {
    const htmlEl = el as HTMLElement
    const styles = window.getComputedStyle(htmlEl)
    
    // Double-check it's actually an overlay (fixed positioning with full coverage)
    const isFixed = styles.position === 'fixed'
    
    // Check for full coverage - either via inset or individual properties
    const hasInsetZero = styles.inset === '0px'
    const hasAllSidesZero = 
      styles.top === '0px' &&
      styles.left === '0px' &&
      styles.right === '0px' &&
      styles.bottom === '0px'
    const isFullCoverage = hasInsetZero || hasAllSidesZero
    
    if (isFixed && isFullCoverage) {
      // Force close state
      if (htmlEl.hasAttribute('data-state')) {
        htmlEl.setAttribute('data-state', 'closed')
      }
      
      // Remove immediately for stuck overlays
      htmlEl.remove()
      removedCount++
    }
  })
  
  // Dev-only logging
  if (import.meta.env.DEV && removedCount > 0) {
    console.log(`Overlay cleanup removed: ${removedCount} element(s)`)
  }
}
