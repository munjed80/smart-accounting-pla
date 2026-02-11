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
      }, 50)
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
  
  // Find and remove Radix portal overlays
  const radixPortals = document.querySelectorAll('[data-radix-portal]')
  radixPortals.forEach(portal => {
    // Check if this is an overlay (has overlay-like attributes or styles)
    const isOverlay = portal.querySelector('[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [role="dialog"]')
    const hasOverlayClass = portal.className && typeof portal.className === 'string' && portal.className.toLowerCase().includes('radix')
    
    if (isOverlay || hasOverlayClass) {
      portal.remove()
      removedCount++
    }
  })
  
  // Find and remove elements with overlay-like styles (fixed positioning with full coverage)
  const allElements = document.querySelectorAll('*')
  allElements.forEach(el => {
    const styles = window.getComputedStyle(el)
    const htmlEl = el as HTMLElement
    
    // Check for overlay characteristics:
    // - Fixed positioning
    // - Full coverage (inset-0 pattern)
    // - Dark background (bg-black/overlay pattern)
    const isFixed = styles.position === 'fixed'
    const isFullCoverage = 
      (styles.top === '0px' || styles.inset === '0px') &&
      (styles.left === '0px') &&
      (styles.right === '0px') &&
      (styles.bottom === '0px')
    const hasOverlayBackground = 
      styles.backgroundColor.includes('rgba') && 
      (styles.backgroundColor.includes('0, 0, 0') || styles.opacity !== '1')
    
    // Only remove if it looks like an overlay, not a layout container
    if (isFixed && isFullCoverage && hasOverlayBackground) {
      // Extra safety: don't remove if it has important content (many children)
      if (htmlEl.children.length <= 1) {
        htmlEl.remove()
        removedCount++
      }
    }
  })
  
  // Dev-only logging
  if (import.meta.env.DEV && removedCount > 0) {
    console.log(`Overlay cleanup removed: ${removedCount} element(s)`)
  }
}
