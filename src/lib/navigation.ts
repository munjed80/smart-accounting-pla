/**
 * Simple client-side navigation utility
 * 
 * Uses browser's history API for navigation without full page reloads.
 * Works with the URL-based routing pattern used in App.tsx.
 */

/**
 * Navigate to a new path using browser's history API
 * @param path - The path to navigate to (e.g., '/onboarding', '/login')
 */
export const navigateTo = (path: string) => {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
