/**
 * Simple client-side navigation utility
 * 
 * Uses browser's history API for navigation without full page reloads.
 * Works with the URL-based routing pattern used in App.tsx.
 */

// Custom event for tracking programmatic navigation
const ROUTE_CHANGE_EVENT = 'app:route-change'

/**
 * Navigate to a new path using browser's history API
 * @param path - The path to navigate to (e.g., '/onboarding', '/login')
 */
export const navigateTo = (path: string) => {
  window.history.pushState({}, '', path)
  
  // Dispatch both popstate (for compatibility) and custom event (for overlay cleanup)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT))
}
