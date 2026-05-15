/**
 * Single source of truth for which client-side paths are PUBLIC
 * (no authentication required).
 *
 * Used by:
 *  - The axios 401 interceptor (src/lib/api.ts) to avoid hard-redirecting
 *    visitors on the landing page / marketing pages to /login when a stale
 *    access_token in localStorage triggers a 401 from /auth/me.
 *  - The App-level routing guard (src/App.tsx) to decide whether an
 *    unauthenticated visitor should be sent to /login.
 *
 * Keep this list in sync with the routes parsed in `getRouteFromURL` in
 * `src/App.tsx` that are intentionally usable without a session.
 */

// Exact public paths.
const PUBLIC_EXACT_PATHS = new Set<string>([
  '/',
  '/login',
  '/auth',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/privacy',
  '/cookies',
  '/terms',
  '/disclaimer',
  '/contact',
  '/faq',
  '/help',
  '/prijzen',
  '/bedankt',
])

/**
 * Returns true when the given pathname is a public, unauthenticated route.
 *
 * `pathname` should be the value of `window.location.pathname` (no query,
 * no hash). Trailing slashes are normalized so that `/login/` matches
 * `/login`. An empty/missing pathname is treated as non-public so that a
 * defensive caller does not accidentally open up a protected area.
 *
 * Note: token-bearing public routes such as `/verify-email?token=…` and
 * `/reset-password?token=…` carry the token in the query string, not in
 * the path, so exact matching on the pathname is sufficient.
 */
export const isPublicRoutePath = (pathname: string): boolean => {
  if (!pathname) return false
  // Normalize: lower-case + strip trailing slash (but keep the single "/" root).
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/'
  return PUBLIC_EXACT_PATHS.has(normalized)
}
