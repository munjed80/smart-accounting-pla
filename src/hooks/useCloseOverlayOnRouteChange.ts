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

// Small delay to allow forced close animation to start before removing elements
const FORCE_CLOSE_ANIMATION_DELAY_MS = 50

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
  
  let strategy1RemovedCount = 0
  let strategy2RemovedCount = 0
  let pendingRemovals = 0
  
  // Strategy 1: Remove Radix portal containers that contain OPEN overlays
  // DO NOT remove closed overlays as Radix needs them for proper state management
  const radixPortals = document.querySelectorAll('[data-radix-portal]')
  radixPortals.forEach(portal => {
    // Check if this portal contains an overlay (has overlay-like attributes or role)
    const hasDialogOverlay = portal.querySelector('[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay]')
    const hasDialog = portal.querySelector('[role="dialog"]')
    
    if (hasDialogOverlay || hasDialog) {
      // Check if overlay is actually OPEN (don't remove properly closed ones)
      const overlayElements = portal.querySelectorAll('[data-state]')
      let hasOpenOverlay = false
      
      overlayElements.forEach(el => {
        const state = el.getAttribute('data-state')
        if (state === 'open') {
          hasOpenOverlay = true
          // Force close state to trigger cleanup animations
          el.setAttribute('data-state', 'closed')
        }
      })
      
      // Only remove portal if it had open overlays
      if (hasOpenOverlay) {
        // Small delay to allow forced animation to start, then remove
        pendingRemovals++
        setTimeout(() => {
          if (portal.parentNode) {
            portal.remove()
            strategy1RemovedCount++
            
            // Log after all pending removals complete
            if (--pendingRemovals === 0 && import.meta.env.DEV) {
              if (strategy1RemovedCount > 0 || strategy2RemovedCount > 0) {
                console.log(`[Cleanup] Removed ${strategy1RemovedCount} stuck portal(s) and ${strategy2RemovedCount} stuck overlay(s)`)
              }
            }
          }
        }, FORCE_CLOSE_ANIMATION_DELAY_MS)
      }
    }
  })
  
  // Strategy 2: Remove fixed position overlay elements that are STUCK OPEN
  // This catches overlays that might not be in portals (edge case)
  // Only target actual overlay elements (not dialog content), and only if open
  const overlaySelectors = [
    '[data-radix-dialog-overlay][data-state="open"]',
    '[data-radix-alert-dialog-overlay][data-state="open"]',
    '[data-radix-drawer-overlay][data-state="open"]',
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
      // Force close state (safe check before setting attribute)
      if (htmlEl.hasAttribute('data-state')) {
        htmlEl.setAttribute('data-state', 'closed')
      }
      
      // Remove immediately for stuck overlays
      htmlEl.remove()
      strategy2RemovedCount++
      
      if (import.meta.env.DEV) {
        console.log(`[Cleanup] Removed stuck overlay element:`, htmlEl.getAttribute('data-slot') || htmlEl.className)
      }
    }
  })
  
  // Log immediate removals from Strategy 2 if no pending removals from Strategy 1
  if (pendingRemovals === 0 && import.meta.env.DEV) {
    if (strategy1RemovedCount > 0 || strategy2RemovedCount > 0) {
      console.log(`[Cleanup] Removed ${strategy1RemovedCount} stuck portal(s) and ${strategy2RemovedCount} stuck overlay(s)`)
    }
  }
}
