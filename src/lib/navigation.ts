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
  
  // Dispatch custom event for overlay cleanup and other navigation handlers
  // Note: We don't dispatch a synthetic 'popstate' here because that's reserved
  // for actual browser navigation (back/forward). Components can listen to our
  // custom event for programmatic navigation.
  window.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT))
  
  // Also dispatch popstate for backwards compatibility with existing code
  window.dispatchEvent(new PopStateEvent('popstate'))
}
