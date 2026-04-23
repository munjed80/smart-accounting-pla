import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { ApiHttpError, NotFoundError, NetworkError, UnauthorizedError, ValidationError, ServerError, PaymentRequiredError } from './errors'

/**
 * ==== DATA MAP: Accountant Screens → Endpoints ====
 * 
 * 1. ACTIVA (Bank & Kas)
 *    - Screen: BankReconciliationPage
 *    - Endpoints:
 *      * GET  /accountant/clients/{clientId}/bank/transactions        → List bank transactions
 *      * POST /accountant/clients/{clientId}/bank/import              → Import bank CSV
 *      * POST /accountant/clients/{clientId}/bank/transactions/{id}/suggest → Get match suggestions
 *      * POST /accountant/clients/{clientId}/bank/transactions/{id}/apply   → Apply reconciliation action
 *      * GET  /accountant/clients/{clientId}/bank/kpi                 → KPI summary
 *    - API: bankReconciliationApi
 * 
 * 2. DEBITEUREN (Klanten/Customers)
 *    - Screen: AccountantClientsPage
 *    - Endpoints:
 *      * GET  /accountant/clients/links                               → List client links with consent status
 *      * POST /accountant/clients/invite                              → Invite client by email
 *      * GET  /accountant/clients/{client_id}/reports/ar              → Accounts receivable report
 *    - API: accountantApi, ledgerApi.getAccountsReceivable()
 * 
 * 3. CREDITEUREN (Leveranciers/Suppliers)
 *    - Screen: CrediteurenPage
 *    - Endpoints:
 *      * GET  /accountant/clients/{client_id}/reports/ap              → Accounts payable report (leveranciers)
 *    - API: ledgerApi.getAccountsPayable()
 *    - Note: Suppliers derived from AP open items grouped by party_name
 * 
 * 4. GROOTBOEK (General Ledger)
 *    - Screen: GrootboekPage (NEW)
 *    - Endpoints:
 *      * GET  /accountant/clients/{client_id}/reports/balance-sheet   → Balance sheet for account overview
 *      * GET  /accountant/clients/{client_id}/reports/pnl             → P&L for expense/revenue accounts
 *      * GET  /transactions?administration_id=X                       → Transaction list for line details
 *    - API: ledgerApi, transactionApi
 *    - Note: Category mapping done in frontend via account_type heuristics
 * 
 * 5. WINST- EN VERLIESREKENING (Profit & Loss)
 *    - Screen: ProfitLossPage
 *    - Endpoints:
 *      * GET  /accountant/clients/{client_id}/reports/pnl             → Full P&L report
 *    - API: ledgerApi.getProfitAndLoss()
 *    - Note: Shows revenue, COGS, gross profit, operating expenses, net income
 * 
 * ==== END DATA MAP ====
 */

// Determine API_BASE_URL based on environment
// In DEV mode: Allow fallback to localhost for development convenience
// In PROD mode: VITE_API_URL must be set and must NOT point to localhost
const isDev = import.meta.env.DEV
const OFFLINE_SIMULATION_QUERY = 'offline'
const envApiUrl = (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) as string | undefined

// Store raw API URL for diagnostics (before any normalization)
const rawViteApiUrl = import.meta.env.VITE_API_URL as string | undefined
const rawNextPublicApiUrl = import.meta.env.NEXT_PUBLIC_API_URL as string | undefined
const rawConfiguredApiUrl = envApiUrl ?? '(not set)'

/**
 * Normalize URL: trim whitespace, ensure scheme is present, and remove trailing slash.
 * In production, URLs without a scheme are prefixed with "https://".
 * In development, URLs without a scheme are prefixed with "http://".
 */
const normalizeBaseUrl = (url: string | undefined): string => {
  if (!url) return ''
  
  const normalized = url.trim()
  
  // Return early if URL is empty after trimming
  if (!normalized) return ''
  
  // If URL has no scheme, add one (https in prod, http in dev for localhost convenience)
  let result = normalized
  if (!normalized.match(/^https?:\/\//i)) {
    result = isDev ? `http://${normalized}` : `https://${normalized}`
  }
  
  // Remove trailing slashes
  return result.replace(/\/+$/, '')
}

/**
 * Normalize API origin: extracts only the origin (scheme + host + port) from a URL,
 * stripping any trailing paths like /api/v1, /api/v2, /api, etc.
 * 
 * This makes the API URL resilient to misconfigured Coolify env vars where
 * someone accidentally includes the path suffix.
 * 
 * Examples:
 *   https://api.zzpershub.nl           -> https://api.zzpershub.nl
 *   https://api.zzpershub.nl/          -> https://api.zzpershub.nl
 *   https://api.zzpershub.nl/api/v1    -> https://api.zzpershub.nl
 *   https://api.zzpershub.nl/api/v1/   -> https://api.zzpershub.nl
 *   https://api.zzpershub.nl/api/v2    -> https://api.zzpershub.nl
 *   https://api.zzpershub.nl/api       -> https://api.zzpershub.nl
 *   https://api.zzpershub.nl/api/      -> https://api.zzpershub.nl
 * 
 * @returns Object with `origin` (cleaned URL) and `hadApiPath` (true if /api path was stripped)
 */
export const normalizeApiOrigin = (url: string | undefined): { origin: string; hadApiPath: boolean } => {
  if (!url) return { origin: '', hadApiPath: false }
  
  // First apply base normalization (trim, add scheme)
  const baseNormalized = normalizeBaseUrl(url)
  if (!baseNormalized) return { origin: '', hadApiPath: false }
  
  try {
    const parsed = new URL(baseNormalized)
    const origin = parsed.origin
    
    // Check if the URL had a path that we're stripping
    // Strip trailing slashes from pathname for comparison
    const pathname = parsed.pathname.replace(/\/+$/, '')
    
    // Specifically check for /api or /api/v{N} paths which are common mistakes
    const hadApiPath = /^\/api(\/v\d+)?$/.test(pathname)
    
    // If there was an API path, warn about it (production only)
    if (hadApiPath && !isDev) {
      console.warn(
        `[API Config] ⚠️ VITE_API_URL bevat een pad (${pathname}). ` +
        `Dit wordt automatisch verwijderd. Stel VITE_API_URL in als alleen het domein: ${origin}`
      )
    }
    
    return { origin, hadApiPath }
  } catch {
    // If URL parsing fails, fall back to regex-based stripping
    // Remove trailing /api/v{N}, /api/v{N}/, /api, /api/ and any trailing slashes
    const stripped = baseNormalized
      .replace(/\/api\/v\d+\/?$/, '')
      .replace(/\/api\/?$/, '')
      .replace(/\/+$/, '')
    
    const hadApiPath = stripped !== baseNormalized
    return { origin: stripped, hadApiPath }
  }
}

// Check if the URL points to localhost by parsing the hostname
const isLocalhostUrl = (url: string | undefined): boolean => {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('127.')
  } catch {
    // If URL parsing fails, fall back to string check
    return url.includes('localhost') || url.includes('127.0.0.1')
  }
}

// Normalize the env URL using the new origin-stripping function
// This handles cases where VITE_API_URL is set to https://api.zzpershub.nl/api/v1 (incorrect)
// and normalizes it to https://api.zzpershub.nl (correct origin only)
const normalizedEnvApiResult = envApiUrl ? normalizeApiOrigin(envApiUrl) : { origin: '', hadApiPath: false }
const normalizedEnvApiUrl = normalizedEnvApiResult.origin || undefined
const envApiUrlHadApiPath = normalizedEnvApiResult.hadApiPath

// Determine if API is misconfigured (production with localhost or missing URL)
// Uses normalized URL to ensure consistent validation
const checkMisconfiguration = (): { isMisconfigured: boolean; reason: string; warning?: string } => {
  // Check if env URL had an API path (like /api/v1) that we stripped - this is a warning, not an error
  const warning = envApiUrlHadApiPath && !isDev
    ? `VITE_API_URL bevat een pad dat automatisch is verwijderd. Stel VITE_API_URL in als alleen: ${normalizedEnvApiUrl} (zonder /api paden).`
    : undefined
  
  if (isDev) {
    // In DEV mode, anything goes (including localhost)
    return { isMisconfigured: false, reason: '', warning }
  }
  
  // In PROD mode, prefer explicit VITE_API_URL, but fallback to current origin to avoid mixed-content issues
  if (!normalizedEnvApiUrl || normalizedEnvApiUrl === '') {
    return { 
      isMisconfigured: false, 
      reason: '',
      warning: 'VITE_API_URL ontbreekt. Fallback naar window.location.origin wordt gebruikt.' 
    }
  }
  
  if (isLocalhostUrl(normalizedEnvApiUrl)) {
    return { 
      isMisconfigured: true, 
      reason: `VITE_API_URL is set to "${normalizedEnvApiUrl}" which points to localhost. In production, this must be the actual API URL (e.g., https://api.zzpershub.nl).`,
      warning 
    }
  }
  
  return { isMisconfigured: false, reason: '', warning }
}

// Compute API_BASE_URL with /api/v1 suffix
// In DEV: use env var or fallback to localhost:8000
// In PROD: use env var (misconfiguration check already validates this)
// If misconfigured in PROD, we still set the URL (possibly localhost) so the UI can display it,
// but the misconfiguration banner will warn users
// NOTE: All API routes are mounted under /api/v1, so we include it in the base URL
// We use normalizeApiOrigin() to strip any accidental /api/v1 or /api paths from VITE_API_URL
const devApiOrigin = normalizeApiOrigin(envApiUrl || 'http://localhost:8000').origin
const resolvedProdOrigin = normalizedEnvApiUrl || (typeof window !== 'undefined' ? window.location.origin : '')
const API_BASE_URL = isDev 
  ? `${devApiOrigin}/api/v1`
  : `${resolvedProdOrigin}/api/v1`

// Store misconfiguration result
const misconfigurationCheck = checkMisconfiguration()

// Log API configuration for debugging (both dev and prod for troubleshooting)
if (isDev) {
  console.log('[API Config] VITE_API_URL:', rawViteApiUrl ?? '(not set)')
  console.log('[API Config] NEXT_PUBLIC_API_URL:', rawNextPublicApiUrl ?? '(not set)')
  console.log('[API Config] Selected API URL:', rawConfiguredApiUrl)
  console.log('[API Config] Normalized Origin:', normalizedEnvApiUrl ?? '(not set)')
  console.log('[API Config] Had API Path Stripped:', envApiUrlHadApiPath)
  console.log('[API Config] Final Base URL:', API_BASE_URL)
  console.log('[API Config] Register endpoint:', `${API_BASE_URL}/auth/register`)
} else if (envApiUrlHadApiPath) {
  // In production, warn if we had to strip a path
  console.warn('[API Config] ⚠️ VITE_API_URL pad automatisch verwijderd. Configureer als:', normalizedEnvApiUrl)
}

// Export API base for display purposes
export const getApiBaseUrl = () => API_BASE_URL

// Export the raw VITE_API_URL value for diagnostics
export const getRawViteApiUrl = () => rawConfiguredApiUrl

// Export window.location.origin for diagnostics
export const getWindowOrigin = () => typeof window !== 'undefined' ? window.location.origin : '(SSR)'

// Export misconfiguration status for UI display
export const isApiMisconfigured = () => misconfigurationCheck.isMisconfigured

// Export the reason for misconfiguration
export const getApiMisconfigurationReason = () => misconfigurationCheck.reason

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
  withCredentials: true,
})



interface ApiErrorInfo {
  message: string
  statusCode?: number
  correlationId?: string
  errorCode?: string
}

const extractApiErrorInfo = (error: AxiosError): ApiErrorInfo => {
  const statusCode = error.response?.status
  const responseData = error.response?.data as any
  const correlationId =
    error.response?.headers?.['x-correlation-id'] ||
    error.response?.headers?.['x-request-id'] ||
    responseData?.correlation_id ||
    responseData?.request_id ||
    undefined

  const errorCode = responseData?.detail?.code || responseData?.code

  // Extract backend error message from various response formats:
  // 1. {detail: [{loc:[], msg:"..."}]} — FastAPI 422 validation error array
  // 2. {detail: {message: "..."}} — structured error with code+message
  // 3. {detail: "..."} — FastAPI string detail
  // 4. {message: "..."} — simple message format
  let backendMessage: string | null = null

  // Handle 422 field-level validation errors from FastAPI
  if (statusCode === 422 && Array.isArray(responseData?.detail)) {
    const fieldErrors = (responseData.detail as Array<{ loc?: string[]; msg?: string }>)
      .map((err) => {
        const field = err.loc?.[err.loc.length - 1] || 'veld'
        return `${field}: ${err.msg || 'ongeldig'}`
      })
    backendMessage = fieldErrors.length > 0 ? fieldErrors.join('; ') : null
  }

  if (!backendMessage) {
    const detailMessage = responseData?.detail?.message
    const stringDetail = typeof responseData?.detail === 'string' ? responseData.detail : null
    const topLevelMessage = responseData?.message
    backendMessage = detailMessage || stringDetail || topLevelMessage || null
  }

  // Prefer the backend message when available — it contains specific, actionable info.
  // Only fall back to generic Dutch messages when the backend didn't provide one.
  let message: string

  if (backendMessage) {
    message = backendMessage
  } else {
    switch (statusCode) {
      case 400:
      case 422:
        message = 'Ongeldige gegevens. Controleer je invoer.'
        break
      case 401:
        message = 'Sessie verlopen, log opnieuw in'
        break
      case 402:
        message = responseData?.message_nl || 'Abonnement vereist om deze functie te gebruiken'
        break
      case 403:
        message = 'Geen rechten voor deze actie'
        break
      case 404:
        message = 'Het gevraagde item is niet gevonden.'
        break
      case 409:
        message = 'Dit item bestaat al of conflicteert met bestaande gegevens.'
        break
      case 429:
        message = 'Te veel verzoeken. Wacht even en probeer het opnieuw.'
        break
      case 500:
      case 502:
        message = 'Serverfout, probeer later'
        break
      case 503:
        message = 'Service tijdelijk niet beschikbaar. Probeer het later opnieuw.'
        break
      case 504:
        message = 'Server reageert niet op tijd. Probeer het later opnieuw.'
        break
      default:
        message = error.message || 'Er is een onbekende fout opgetreden'
    }
  }

  return { message, statusCode, correlationId, errorCode }
}

export const formatApiErrorForDisplay = (error: unknown): { message: string; detail?: string } => {
  if (error instanceof ApiHttpError) {
    const detailParts = [
      error.statusCode ? `HTTP ${error.statusCode}` : null,
      error.errorCode ? `code: ${error.errorCode}` : null,
      error.correlationId ? `correlation: ${error.correlationId}` : null,
    ].filter(Boolean)

    return {
      message: error.message,
      detail: detailParts.length ? detailParts.join(' · ') : undefined,
    }
  }

  if (error instanceof Error) {
    return { message: error.message }
  }

  return { message: 'Er is een onbekende fout opgetreden' }
}
const API_OFFLINE_EVENT = 'smart-accounting:api-offline-status'

export interface ApiOfflineStatus {
  isOffline: boolean
  message: string
}

type ApiOfflineListener = (status: ApiOfflineStatus) => void

let offlineStatus: ApiOfflineStatus = {
  isOffline: false,
  message: '',
}

let lastFailedRequest: InternalAxiosRequestConfig | null = null

const emitOfflineStatus = (status: ApiOfflineStatus) => {
  offlineStatus = status
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ApiOfflineStatus>(API_OFFLINE_EVENT, { detail: status }))
  }
}

const isOfflineSimulationEnabled = () => {
  if (!isDev || typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get(OFFLINE_SIMULATION_QUERY) === '1'
}

export const subscribeApiOfflineStatus = (listener: ApiOfflineListener) => {
  listener(offlineStatus)

  if (typeof window === 'undefined') {
    return () => undefined
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ApiOfflineStatus>
    listener(customEvent.detail)
  }

  window.addEventListener(API_OFFLINE_EVENT, handler as EventListener)

  return () => {
    window.removeEventListener(API_OFFLINE_EVENT, handler as EventListener)
  }
}

export const clearApiOfflineStatus = () => {
  emitOfflineStatus({ isOffline: false, message: '' })
}

export const retryLastFailedApiRequest = async () => {
  if (!lastFailedRequest) {
    return false
  }

  await api.request(lastFailedRequest)
  clearApiOfflineStatus()
  return true
}

// Add request interceptor to fail fast if API is misconfigured
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (isOfflineSimulationEnabled()) {
      return Promise.reject(new AxiosError('Simulated offline mode (?offline=1)', 'ERR_NETWORK', config))
    }

    const token = localStorage.getItem('access_token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    // Add selected client context header for accountant-mode API calls
    // This allows the backend to know which client's data to retrieve
    const selectedClientId = localStorage.getItem('selectedClientId')
    if (selectedClientId && config.headers) {
      config.headers['X-Selected-Client-Id'] = selectedClientId
    }
    
    // DEBUG: Log outgoing request URL (only in DEV mode to avoid exposing info in production)
    if (isDev) {
      const fullUrl = `${config.baseURL || ''}${config.url || ''}`
      console.log('[API Request]', {
        method: config.method?.toUpperCase(),
        url: fullUrl,
        payload: config.data,
      })
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    if (offlineStatus.isOffline) {
      clearApiOfflineStatus()
    }

    // DEBUG: Log successful response (only in DEV mode to avoid exposing info in production)
    if (isDev) {
      console.log('[API Response]', response.status, response.config.url)
    }
    return response
  },
  async (error: AxiosError) => {
    // Always log structured error details for developer diagnostics.
    // Includes method, full URL, HTTP status, response body snippet (≤500 chars), and request-id.
    // Production logs omit the body snippet to avoid leaking sensitive data.
    {
      const method = (error.config?.method ?? 'unknown').toUpperCase()
      const fullUrl = `${error.config?.baseURL ?? ''}${error.config?.url ?? ''}`
      const status = error.response?.status ?? 'no-response'
      const requestId =
        error.response?.headers?.['x-request-id'] ??
        error.response?.headers?.['x-correlation-id'] ??
        (error.response?.data as Record<string, unknown> | undefined)?.request_id ??
        null
      if (isDev) {
        const rawBody = error.response?.data
        const bodySnippet =
          rawBody !== undefined
            ? JSON.stringify(rawBody).slice(0, 500)
            : '(no body)'
        console.error('[API Error]', {
          method,
          url: fullUrl,
          status,
          body: bodySnippet,
          requestId,
          message: error.message,
        })
      } else {
        console.error(`[API Error] ${method} ${fullUrl} → HTTP ${status}${requestId ? ` (id: ${requestId})` : ''}`)
      }
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Only show the offline banner for TRUE network errors (no response at all).
    // Server-side errors (500, 503, 504) DO have a response with an error message —
    // the catch handler should show that message, not a misleading "offline" banner.
    const isTrueNetworkError = !error.response && error.message !== 'canceled'
    if (isTrueNetworkError) {
      lastFailedRequest = originalRequest
      emitOfflineStatus({
        isOffline: true,
        message: 'Offline of verbinding weggevallen',
      })
    }

    // Convert axios errors to typed errors for better handling
    let typedError: Error = error

    if (!error.response) {
      // True network error: connection refused, DNS failure, CORS preflight rejected, etc.
      // Avoid surfacing the raw axios "Network Error" string which gives no actionable detail.
      const networkMsg = error.message === 'Network Error'
        ? 'Geen verbinding met de server. Controleer je internetverbinding.'
        : (error.message || 'Geen verbinding met de server. Controleer je internetverbinding.')
      typedError = new NetworkError(networkMsg)
    } else {
      const status = error.response.status
      const parsedError = extractApiErrorInfo(error)
      const metadata = {
        statusCode: parsedError.statusCode,
        correlationId: parsedError.correlationId,
        errorCode: parsedError.errorCode,
      }

      switch (status) {
        case 400:
          typedError = new ValidationError(parsedError.message, metadata)
          break
        case 401:
          typedError = new UnauthorizedError(parsedError.message, metadata)
          break
        case 402: {
          // Payment Required - extract additional metadata from response
          const responseData = error.response.data as any
          typedError = new PaymentRequiredError(
            parsedError.message || responseData?.message_nl || 'Abonnement vereist',
            {
              ...metadata,
              feature: responseData?.feature,
              status: responseData?.status,
              inTrial: responseData?.in_trial,
              daysLeftTrial: responseData?.days_left_trial,
            }
          )
          break
        }
        case 403:
          typedError = new UnauthorizedError(parsedError.message, metadata)
          break
        case 404:
          typedError = new NotFoundError(parsedError.message, metadata)
          break
        case 409:
          typedError = new ApiHttpError(parsedError.message, metadata)
          break
        case 422:
          typedError = new ValidationError(parsedError.message, metadata)
          break
        case 429:
          typedError = new ApiHttpError(parsedError.message, metadata)
          break
        case 500:
        case 502:
        case 503:
        case 504:
          typedError = new ServerError(parsedError.message, metadata)
          break
        default:
          typedError = new ApiHttpError(parsedError.message, metadata)
      }
    }

    // Handle 401 - redirect to login
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      
      window.location.href = '/login'
      
      return Promise.reject(typedError)
    }

    return Promise.reject(typedError)
  }
)

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  full_name: string
  // Admin role is NOT allowed via public registration for security
  // Admin users can only be created via database seed
  role?: 'zzp' | 'accountant'
}

export interface User {
  id: string
  email: string
  full_name: string
  role: 'zzp' | 'accountant' | 'admin' | 'super_admin'
  is_active: boolean
  is_email_verified?: boolean
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

// New auth response interfaces
export interface RegisterResponse {
  message: string
  user_id: string
}

export interface GenericMessageResponse {
  message: string
}

export interface VerifyEmailResponse {
  message: string
  verified: boolean
}

export interface ResetPasswordRequest {
  token: string
  new_password: string
}

export interface ResetPasswordResponse {
  message: string
}

export interface EmailNotVerifiedError {
  message: string
  code: 'EMAIL_NOT_VERIFIED'
  hint: string
}

export interface TransactionStats {
  total_transactions: number
  draft_count: number
  posted_count: number
  total_debit: number
  total_credit: number
  recent_transactions: RecentTransaction[]
}

export interface RecentTransaction {
  id: string
  booking_number: string
  transaction_date: string
  description: string
  status: 'DRAFT' | 'POSTED'
  total_amount: number
}

export interface TransactionLine {
  id: string
  ledger_account_code: string
  ledger_account_name: string
  debit_amount: number
  credit_amount: number
  vat_code: string | null
  description: string
}

export interface Transaction {
  id: string
  booking_number: string
  transaction_date: string
  description: string
  status: 'DRAFT' | 'POSTED'
  total_amount: number
  document_id: string | null
  created_at: string
  updated_at: string | null
  created_by_name: string | null
  updated_by_name: string | null
  ai_confidence_score: number | null
  lines: TransactionLine[]
}

export interface TransactionListItem {
  id: string
  booking_number: string
  transaction_date: string
  description: string
  status: 'DRAFT' | 'POSTED'
  total_amount: number
  created_by_name: string | null
  ai_confidence_score: number | null
}

export interface TransactionUpdateRequest {
  transaction_date?: string
  description?: string
  lines?: Omit<TransactionLine, 'id'>[]
}

export const authApi = {
  login: async (credentials: LoginRequest): Promise<TokenResponse> => {
    const formData = new URLSearchParams()
    formData.append('username', credentials.username)
    formData.append('password', credentials.password)

    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] POST /auth/token ->', `${API_BASE_URL}/auth/token`)
    }

    const response = await api.post<TokenResponse>('/auth/token', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    return response.data
  },

  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] POST /auth/register ->', `${API_BASE_URL}/auth/register`)
    }

    const response = await api.post<RegisterResponse>('/auth/register', data)
    return response.data
  },

  me: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me')
    return response.data
  },

  verifyEmail: async (token: string): Promise<VerifyEmailResponse> => {
    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] GET /auth/verify-email ->', `${API_BASE_URL}/auth/verify-email`)
    }

    const response = await api.get<VerifyEmailResponse>('/auth/verify-email', {
      params: { token }
    })
    return response.data
  },

  resendVerification: async (email: string): Promise<GenericMessageResponse> => {
    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] POST /auth/resend-verification ->', `${API_BASE_URL}/auth/resend-verification`)
    }

    const response = await api.post<GenericMessageResponse>('/auth/resend-verification', { email })
    return response.data
  },

  forgotPassword: async (email: string): Promise<GenericMessageResponse> => {
    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] POST /auth/forgot-password ->', `${API_BASE_URL}/auth/forgot-password`)
    }

    const response = await api.post<GenericMessageResponse>('/auth/forgot-password', { email })
    return response.data
  },

  resetPassword: async (data: ResetPasswordRequest): Promise<ResetPasswordResponse> => {
    // Dev-only logging: log the final request URL
    if (isDev) {
      console.log('[Auth] POST /auth/reset-password ->', `${API_BASE_URL}/auth/reset-password`)
    }

    const response = await api.post<ResetPasswordResponse>('/auth/reset-password', data)
    return response.data
  },

  changePassword: async (data: { current_password: string; new_password: string }): Promise<GenericMessageResponse> => {
    const response = await api.post<GenericMessageResponse>('/auth/change-password', data)
    return response.data
  },
}

/**
 * Health check result interface for the API connectivity test.
 */
export interface HealthCheckResult {
  success: boolean
  status: 'healthy' | 'unhealthy' | 'unreachable' | 'error'
  message: string
  details?: string
  responseTime?: number
}

/**
 * Test API connectivity by calling the /ops/health endpoint.
 * Returns detailed information about the connection status and any failures.
 */
export const checkApiHealth = async (): Promise<HealthCheckResult> => {
  const startTime = Date.now()
  
  try {
    const response = await api.get('/ops/health', { timeout: 10000 })
    const responseTime = Date.now() - startTime
    
    const healthData = response.data
    const isHealthy = healthData?.status === 'healthy'
    
    return {
      success: isHealthy,
      status: isHealthy ? 'healthy' : 'unhealthy',
      message: isHealthy 
        ? `API is gezond (${responseTime}ms)` 
        : `API meldt ongezonde status: ${healthData?.status || 'onbekend'}`,
      details: healthData?.components 
        ? `Componenten: ${Object.entries(healthData.components)
            .map(([k, v]) => `${k}: ${(v as { status: string })?.status || 'onbekend'}`)
            .join(', ')}`
        : undefined,
      responseTime,
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    
    if (axios.isAxiosError(error)) {
      // Log detailed error for debugging
      logApiError(error, 'Health Check')
      
      // Network error - could be CORS, TLS, DNS, or connectivity (Dutch)
      if (error.message === 'Network Error') {
        return {
          success: false,
          status: 'unreachable',
          message: 'Kan API-server niet bereiken',
          details: `Kan geen verbinding maken met ${API_BASE_URL}. Mogelijke oorzaken: CORS, TLS-certificaat, DNS, of server offline.`,
          responseTime,
        }
      }
      
      // Timeout (Dutch)
      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          status: 'unreachable',
          message: 'API-verzoek verlopen',
          details: `Verzoek naar ${API_BASE_URL}/health is verlopen na ${responseTime}ms. De server is mogelijk overbelast of reageert niet.`,
          responseTime,
        }
      }
      
      // Server responded with an error status (Dutch)
      if (error.response) {
        return {
          success: false,
          status: 'error',
          message: `API fout: HTTP ${error.response.status}`,
          details: error.response.data?.message || error.response.statusText || 'Onbekende fout',
          responseTime,
        }
      }
    }
    
    // Generic error (Dutch)
    return {
      success: false,
      status: 'error',
      message: 'Gezondheidscontrole mislukt',
      details: error instanceof Error ? error.message : 'Onbekende fout opgetreden',
      responseTime,
    }
  }
}

export const transactionApi = {
  getStats: async (): Promise<TransactionStats> => {
    const response = await api.get<TransactionStats>('/transactions/stats')
    return response.data
  },

  getAll: async (status?: 'DRAFT' | 'POSTED'): Promise<TransactionListItem[]> => {
    const params = status ? { status } : {}
    const response = await api.get<TransactionListItem[]>('/transactions', { params })
    return response.data
  },

  getById: async (id: string): Promise<Transaction> => {
    const response = await api.get<Transaction>(`/transactions/${id}`)
    return response.data
  },

  update: async (id: string, data: TransactionUpdateRequest): Promise<Transaction> => {
    const response = await api.put<Transaction>(`/transactions/${id}`, data)
    return response.data
  },

  approve: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/transactions/${id}/approve`)
    return response.data
  },

  reject: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/transactions/${id}/reject`)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/transactions/${id}`)
  },

  post: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/transactions/${id}/post`)
    return response.data
  },
}


export interface ZZPLedgerLine {
  id: string
  account_id: string
  account_code: string | null
  account_name: string | null
  debit: string
  credit: string
}

export interface ZZPLedgerEntry {
  id: string
  date: string
  description: string
  reference: string | null
  posted: boolean
  lines: ZZPLedgerLine[]
}

export interface ZZPAccountBalance {
  account_id: string
  account_code: string
  account_name: string
  total_debit: string
  total_credit: string
  balance: string
}

export interface ZZPLedgerAccountOption {
  id: string
  code: string
  name: string
}

export interface ZZPLedgerResponse {
  entries: ZZPLedgerEntry[]
  account_balances: ZZPAccountBalance[]
  accounts: ZZPLedgerAccountOption[]
}

export const zzpLedgerApi = {
  getEntries: async (params?: { from_date?: string; to_date?: string; account_id?: string }): Promise<ZZPLedgerResponse> => {
    const response = await api.get<ZZPLedgerResponse>('/zzp/ledger', { params })
    return response.data
  },
}
export interface Administration {
  id: string
  name: string
  description: string | null
  kvk_number: string | null
  btw_number: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AdministrationCreateRequest {
  name: string
  description?: string
  kvk_number?: string
  btw_number?: string
}

export const administrationApi = {
  create: async (data: AdministrationCreateRequest): Promise<Administration> => {
    const response = await api.post<Administration>('/administrations', data)
    return response.data
  },

  list: async (): Promise<Administration[]> => {
    const response = await api.get<Administration[]>('/administrations')
    return response.data
  },

  get: async (id: string): Promise<Administration> => {
    const response = await api.get<Administration>(`/administrations/${id}`)
    return response.data
  },
}

export interface DocumentResponse {
  id: string
  administration_id: string
  original_filename: string
  mime_type: string
  file_size: number
  status: 'UPLOADED' | 'PROCESSING' | 'DRAFT_READY' | 'FAILED'
  error_message: string | null
  created_at: string
  updated_at: string
  transaction_id: string | null
}

export const documentApi = {
  upload: async (file: File, administrationId?: string): Promise<{ message: string; document_id: string }> => {
    console.log('📤 documentApi.upload called')
    console.log('   File:', file.name, `(${(file.size / 1024).toFixed(2)} KB)`)
    console.log('   Administration ID:', administrationId || '(auto-select)')
    
    const formData = new FormData()
    formData.append('file', file)
    if (administrationId) {
      formData.append('administration_id', administrationId)
    }

    console.log('   FormData created, making POST request to /documents/upload')
    console.log('   Headers will include: Authorization: Bearer [token]')
    console.log('   Content-Type: multipart/form-data (set by axios)')
    
    const response = await api.post<{ message: string; document_id: string }>(
      '/documents/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    
    console.log('✅ documentApi.upload response:', response.data)
    return response.data
  },

  list: async (administrationId?: string): Promise<DocumentResponse[]> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<DocumentResponse[]>('/documents', { params })
    return response.data
  },

  get: async (id: string): Promise<DocumentResponse> => {
    const response = await api.get<DocumentResponse>(`/documents/${id}`)
    return response.data
  },

  reprocess: async (id: string): Promise<DocumentResponse> => {
    const response = await api.post<DocumentResponse>(`/documents/${id}/reprocess`)
    return response.data
  },
}






export interface ApiError {
  message: string
  detail?: string
  status?: number
}

/**
 * Log API error details.
 * In development: logs full axios error details (status, response body) to console.
 * In production: logs minimal info to avoid exposing sensitive data.
 */
export const logApiError = (error: unknown, context?: string): void => {
  const prefix = context ? `[${context}]` : '[API Error]'
  
  if (axios.isAxiosError(error)) {
    if (isDev) {
      // Development: log detailed error information
      console.error(`${prefix} Axios error details:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method,
        message: error.message,
        code: error.code,
      })
    } else {
      // Production: log minimal info
      console.error(`${prefix} API request failed:`, error.response?.status || error.code || 'Unknown')
    }
  } else if (error instanceof Error) {
    if (isDev) {
      console.error(`${prefix} Error:`, error.message, error.stack)
    } else {
      console.error(`${prefix} Error:`, error.message)
    }
  } else {
    console.error(`${prefix} Unknown error type`)
  }
}

/**
 * Get a detailed error message suitable for display.
 * Includes information about network, CORS, TLS, and HTTP status errors.
 * Handles 422 validation errors with field-by-field messages.
 */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    // Log the error with appropriate detail level
    logApiError(error)
    
    const status = error.response?.status
    const detail = error.response?.data?.detail
    
    // Handle 422 validation errors with field-by-field messages
    if (status === 422 && Array.isArray(detail)) {
      // FastAPI validation errors come as array of {loc, msg, type}
      const messages = detail.map((err: { loc: string[]; msg: string }) => {
        const field = err.loc?.[err.loc.length - 1] || 'field'
        return `${field}: ${err.msg}`
      })
      return messages.join('; ')
    }
    
    // Check for server response with error detail
    if (detail) {
      if (typeof detail === 'string') {
        return detail
      }
      // Handle object detail (e.g., {message: "...", code: "..."})
      if (typeof detail === 'object' && detail.message) {
        return detail.message
      }
      return JSON.stringify(detail)
    }
    
    // Network error - could be CORS, TLS, or connectivity issue
    // Only show generic "Network Error" if actually offline
    // Dutch message with helpful troubleshooting hint
    if (error.message === 'Network Error') {
      // Check if user is actually offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return 'Geen internetverbinding. Controleer je netwerkverbinding.'
      }
      
      // User is online but getting network error - more specific issue
      const baseHint = normalizedEnvApiUrl 
        ? `VITE_API_URL moet alleen ${normalizedEnvApiUrl} zijn (zonder /api paden).`
        : 'VITE_API_URL moet alleen het domein bevatten (zonder /api paden).'
      return `Kan geen verbinding maken met de server op ${API_BASE_URL}. ` +
        `Mogelijke oorzaken: CORS-fout, ongeldig TLS-certificaat, of server niet bereikbaar. ` +
        `Controleer Coolify build env: ${baseHint}`
    }
    
    // Timeout - Dutch message
    if (error.code === 'ECONNABORTED') {
      return `Verzoek naar ${API_BASE_URL} is verlopen. De server reageert mogelijk traag of is niet bereikbaar.`
    }
    
    // HTTP status errors with better messages (Dutch)
    if (status) {
      if (status === 401) {
        return 'Authenticatie mislukt. Je inloggegevens zijn onjuist of je sessie is verlopen.'
      }
      if (status === 403) {
        return 'Geen toegang. Je hebt geen rechten voor deze actie.'
      }
      if (status === 404) {
        return 'De gevraagde gegevens zijn niet gevonden op de server.'
      }
      if (status === 409) {
        return 'Dit item bestaat al of conflicteert met bestaande gegevens.'
      }
      if (status === 422) {
        return 'Ongeldige invoer. Controleer je gegevens.'
      }
      if (status >= 500) {
        return `Serverfout (${status}). Probeer het later opnieuw of neem contact op met support.`
      }
      return `Verzoek mislukt met status ${status}: ${error.response?.statusText || error.message}`
    }
    
    return error.message
  }
  
  if (error instanceof Error) {
    logApiError(error)
    return error.message
  }
  
  return 'Er is een onverwachte fout opgetreden'
}

/**
 * Extract validation errors from a 422 response as a map of field names to error messages.
 * Useful for displaying inline validation errors on forms.
 */
export const getValidationErrors = (error: unknown): Record<string, string> => {
  if (axios.isAxiosError(error) && error.response?.status === 422) {
    const detail = error.response?.data?.detail
    if (Array.isArray(detail)) {
      const errors: Record<string, string> = {}
      for (const err of detail as Array<{ loc: string[]; msg: string }>) {
        const field = err.loc?.[err.loc.length - 1] || 'general'
        errors[field] = err.msg
      }
      return errors
    }
  }
  return {}
}

/**
 * Check if an error is a permission-related 403 error.
 * Returns the error code if it's a recognized permission error, null otherwise.
 */
export const getPermissionErrorCode = (error: unknown): string | null => {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) {
    return null
  }
  const detail = error.response?.data?.detail
  if (typeof detail === 'object' && detail?.code) {
    const code = detail.code
    // List of recognized permission error codes
    if (['NOT_ASSIGNED', 'PENDING_APPROVAL', 'ACCESS_REVOKED', 'SCOPE_MISSING', 'FORBIDDEN_ROLE'].includes(code)) {
      return code
    }
  }
  return null
}

/**
 * Check if an error is specifically a SCOPE_MISSING error.
 * Returns the scope details if true, null otherwise.
 */
export const isScopeMissingError = (error: unknown): ScopeMissingError | null => {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) {
    return null
  }
  const detail = error.response?.data?.detail
  if (typeof detail === 'object' && detail?.code === 'SCOPE_MISSING') {
    return {
      code: 'SCOPE_MISSING',
      message: detail.message || 'Permission scope missing',
      required_scope: detail.required_scope || 'unknown',
      granted_scopes: detail.granted_scopes || []
    }
  }
  return null
}

/**
 * Check if an error is a NOT_ASSIGNED error (403).
 * Returns true if the user is not assigned to the requested client.
 */
export const isNotAssignedError = (error: unknown): boolean => {
  return getPermissionErrorCode(error) === 'NOT_ASSIGNED'
}






// ============ Metadata API ============
// Moved to ./api/meta.ts (re-exported at the bottom of this file).

// ============ ZZP API (types + functions) ============
// Moved to ./api/zzp.ts (re-exported at the bottom of this file).

// ============================================================================
// Re-exports of decomposed API modules
// ----------------------------------------------------------------------------
// The following domain API namespaces and their associated types/interfaces
// were moved into per-domain files under ./api/* to keep this file maintainable.
// All names continue to be importable from '@/lib/api' for backward compatibility
// (no behavior, endpoint, or response shape changes).
// ============================================================================

export * from './api/meta'
export * from './api/zzp'
export * from './api/admin'
export * from './api/subscription'
export * from './api/integrations'
export * from './api/sales-review'
export * from './api/zzp-btw'
export * from './api/zzp-income-tax'
export * from './api/public-contact'
export * from './api/zzp-import'
export * from './api/work-queue'
export * from './api/bank-reconciliation'
export * from './api/certificate'
export * from './api/ledger'
export * from './api/decision'
export * from './api/period'
export * from './api/vat'
export * from './api/document-review'
export * from './api/observability'
export * from './api/accountant'
