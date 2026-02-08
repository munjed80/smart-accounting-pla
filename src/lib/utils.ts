import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { toast } from 'sonner'
import { AxiosError } from 'axios'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Configuration for toast messages
 */
export interface ToastConfig {
  loading?: string
  success?: string
  error?: string
}

/**
 * Wraps a promise with toast notifications for loading, success, and error states.
 * Shows loading toast while promise is pending, then success or error toast.
 * 
 * @param promise - The promise to wrap
 * @param config - Toast message configuration
 * @returns The resolved value of the promise
 * @throws The error if the promise rejects (after showing error toast)
 * 
 * @example
 * ```ts
 * const result = await withToast(
 *   api.customers.create(data),
 *   {
 *     loading: 'Klant aanmaken...',
 *     success: 'Klant succesvol aangemaakt',
 *     error: 'Fout bij aanmaken klant'
 *   }
 * )
 * ```
 */
export async function withToast<T>(
  promise: Promise<T>,
  config: ToastConfig
): Promise<T> {
  const toastId = config.loading ? toast.loading(config.loading) : undefined

  try {
    const result = await promise
    if (toastId) {
      toast.dismiss(toastId)
    }
    if (config.success) {
      toast.success(config.success)
    }
    return result
  } catch (error) {
    if (toastId) {
      toast.dismiss(toastId)
    }
    const errorMessage = config.error 
      ? `${config.error}: ${parseApiError(error)}`
      : parseApiError(error)
    toast.error(errorMessage)
    throw error
  }
}

/**
 * Parse API errors into user-friendly Dutch messages.
 * Handles Axios errors, standard errors, and unknown error types.
 * 
 * @param error - The error to parse
 * @returns A user-friendly error message in Dutch
 * 
 * @example
 * ```ts
 * try {
 *   await api.customers.delete(id)
 * } catch (error) {
 *   const message = parseApiError(error)
 *   toast.error(message)
 * }
 * ```
 */
export function parseApiError(error: unknown): string {
  // Handle Axios errors
  if (isAxiosError(error)) {
    const status = error.response?.status
    const detail = error.response?.data?.detail
    
    // Handle 422 validation errors with field-by-field messages
    if (status === 422 && Array.isArray(detail)) {
      const messages = detail.map((err: { loc: string[]; msg: string }) => {
        const field = err.loc?.[err.loc.length - 1] || 'veld'
        return `${field}: ${err.msg}`
      })
      return messages.join('; ')
    }
    
    // Handle string detail
    if (detail && typeof detail === 'string') {
      return detail
    }
    
    // Handle object detail with message property
    if (detail && typeof detail === 'object' && 'message' in detail) {
      return String(detail.message)
    }
    
    // Network error
    if (error.message === 'Network Error') {
      return 'Kan geen verbinding maken met de server. Controleer je internetverbinding.'
    }
    
    // Timeout
    if (error.code === 'ECONNABORTED') {
      return 'Het verzoek duurde te lang. Probeer het opnieuw.'
    }
    
    // HTTP status errors
    if (status) {
      switch (status) {
        case 400:
          return 'Ongeldige gegevens. Controleer je invoer.'
        case 401:
          return 'Je sessie is verlopen. Log opnieuw in.'
        case 403:
          return 'Je hebt geen toegang tot deze actie.'
        case 404:
          return 'Het gevraagde item is niet gevonden.'
        case 409:
          return 'Dit item bestaat al of conflicteert met bestaande gegevens.'
        case 422:
          return 'Ongeldige invoer. Controleer je gegevens.'
        case 429:
          return 'Te veel verzoeken. Wacht even en probeer het opnieuw.'
        case 500:
        case 502:
        case 503:
        case 504:
          return 'Er is een serverfout opgetreden. Probeer het later opnieuw.'
        default:
          return `Verzoek mislukt (status ${status})`
      }
    }
    
    return error.message || 'Er is een onverwachte fout opgetreden'
  }
  
  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return error
  }
  
  return 'Er is een onverwachte fout opgetreden'
}

/**
 * Type guard to check if an error is an AxiosError
 */
function isAxiosError(error: unknown): error is AxiosError<{ detail?: unknown }> {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  )
}
