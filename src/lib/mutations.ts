/**
 * Mutation Helper
 * 
 * Standardized pattern for handling API mutations with proper feedback.
 * Provides consistent loading states, success/error toasts, and error handling.
 */

import { toast } from 'sonner'
import { t } from '@/i18n'

/**
 * Options for running a mutation
 */
export interface MutationOptions<T> {
  /**
   * The async function that performs the mutation (API call)
   */
  fn: () => Promise<T>
  
  /**
   * Success message to display (default: "Opgeslagen")
   */
  successMsg?: string
  
  /**
   * Error message to display (default: "Opslaan mislukt")
   */
  errorMsg?: string
  
  /**
   * Callback on success - called with the result
   */
  onSuccess?: (result: T) => void | Promise<void>
  
  /**
   * Callback on error - called with the error
   */
  onError?: (error: Error) => void
  
  /**
   * If true, re-throws the error after handling it
   * Useful when the caller needs to know about failures
   */
  rethrow?: boolean
}

/**
 * Result of running a mutation
 */
export interface MutationResult<T> {
  success: boolean
  data?: T
  error?: Error
}

/**
 * Run a mutation with standardized error handling and user feedback.
 * 
 * Example usage:
 * ```ts
 * const result = await runMutation({
 *   fn: () => zzpApi.customers.create(data),
 *   successMsg: t('zzpCustomers.customerSaved'),
 *   errorMsg: t('zzpCustomers.errorSavingCustomer'),
 *   onSuccess: () => loadCustomers(),
 * })
 * ```
 * 
 * @param options - Configuration for the mutation
 * @returns Object with success status and data/error
 */
export async function runMutation<T>(options: MutationOptions<T>): Promise<MutationResult<T>> {
  const {
    fn,
    successMsg = t('common.saved'), // "Opgeslagen"
    errorMsg = t('common.saveFailed'), // "Opslaan mislukt"
    onSuccess,
    onError,
    rethrow = false,
  } = options

  try {
    const result = await fn()
    
    // Show success toast
    toast.success(successMsg)
    
    // Call success callback
    if (onSuccess) {
      await onSuccess(result)
    }
    
    return { success: true, data: result }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    
    // Extract error message from API response if available
    let apiErrorMessage: string | undefined
    const apiError = error as { response?: { data?: { detail?: string | { message?: string } } } }
    if (apiError?.response?.data?.detail) {
      const detail = apiError.response.data.detail
      apiErrorMessage = typeof detail === 'string' ? detail : detail?.message
    }
    
    // Show error toast with API message if available
    const displayMessage = apiErrorMessage ? `${errorMsg}: ${apiErrorMessage}` : errorMsg
    toast.error(displayMessage)
    
    // Log for debugging
    console.error('[Mutation Error]', err.message, error)
    
    // Call error callback
    if (onError) {
      onError(err)
    }
    
    // Re-throw if requested
    if (rethrow) {
      throw error
    }
    
    return { success: false, error: err }
  }
}

/**
 * Hook-style mutation runner for use in components.
 * Returns a function that can be called to execute the mutation.
 * 
 * @param options - Default options for the mutation
 * @returns Function to execute the mutation
 */
export function createMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
  defaultOptions?: Omit<MutationOptions<TOutput>, 'fn'>
) {
  return async (input: TInput, overrideOptions?: Partial<Omit<MutationOptions<TOutput>, 'fn'>>) => {
    return runMutation({
      fn: () => mutationFn(input),
      ...defaultOptions,
      ...overrideOptions,
    })
  }
}
