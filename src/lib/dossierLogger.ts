/**
 * Dossier Logger Utility
 * 
 * Dev-only console logging for dossier API calls.
 * Logs: [DOSSIER] administrationId, endpoint, status
 * 
 * Only outputs in development mode (import.meta.env.DEV).
 */

const isDev = import.meta.env.DEV

export type DossierLogStatus = 'REQUEST' | 'SUCCESS' | 'ERROR'

/**
 * Log a dossier API call in development mode.
 * 
 * @param administrationId - The client administration ID
 * @param endpoint - The API endpoint being called
 * @param status - The status of the call (REQUEST, SUCCESS, ERROR)
 * @param extra - Optional extra data to log
 */
export function logDossier(
  administrationId: string,
  endpoint: string,
  status: DossierLogStatus,
  extra?: Record<string, unknown>
): void {
  if (!isDev) return
  
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12)
  const color = status === 'SUCCESS' ? '\x1b[32m' : status === 'ERROR' ? '\x1b[31m' : '\x1b[36m'
  const reset = '\x1b[0m'
  
  const extraStr = extra ? ` ${JSON.stringify(extra)}` : ''
  
  // Use console styling for browsers
  if (typeof window !== 'undefined') {
    const style = status === 'SUCCESS' 
      ? 'color: green; font-weight: bold'
      : status === 'ERROR'
      ? 'color: red; font-weight: bold'
      : 'color: cyan; font-weight: bold'
    
    console.log(
      `%c[DOSSIER] %c${status} %c${endpoint}`,
      'color: #888',
      style,
      'color: inherit',
      { administrationId, ...extra }
    )
  } else {
    // Node.js style (for SSR or tests)
    console.log(
      `[DOSSIER] ${timestamp} ${color}${status}${reset} administrationId=${administrationId} endpoint=${endpoint}${extraStr}`
    )
  }
}

/**
 * Create a logger for a specific administration.
 * Returns functions for logging request, success, and error.
 */
export function createDossierLogger(administrationId: string) {
  return {
    request: (endpoint: string, extra?: Record<string, unknown>) => 
      logDossier(administrationId, endpoint, 'REQUEST', extra),
    success: (endpoint: string, extra?: Record<string, unknown>) => 
      logDossier(administrationId, endpoint, 'SUCCESS', extra),
    error: (endpoint: string, error: unknown, extra?: Record<string, unknown>) => 
      logDossier(administrationId, endpoint, 'ERROR', { 
        error: error instanceof Error ? error.message : String(error),
        ...extra 
      }),
  }
}
