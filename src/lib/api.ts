import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { NotFoundError, NetworkError, UnauthorizedError, ValidationError, ServerError } from './errors'

/**
 * ==== DATA MAP: Accountant Screens → Endpoints ====
 * 
 * 1. ACTIVA (Bank & Kas)
 *    - Screen: BankReconciliationPage
 *    - Endpoints:
 *      * GET  /accountant/bank/transactions?administration_id=X       → List bank transactions
 *      * POST /accountant/bank/import                                 → Import bank CSV
 *      * POST /accountant/bank/transactions/{id}/suggest              → Get match suggestions
 *      * POST /accountant/bank/transactions/{id}/apply                → Apply reconciliation action
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

// Add request interceptor to fail fast if API is misconfigured
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
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
    // DEBUG: Log successful response (only in DEV mode to avoid exposing info in production)
    if (isDev) {
      console.log('[API Response]', response.status, response.config.url)
    }
    return response
  },
  async (error: AxiosError) => {
    // DEBUG: Log error response with details (only in DEV mode to avoid exposing info in production)
    if (isDev) {
      const url = error.config?.url || 'unknown'
      const status = error.response?.status || 'network error'
      const message = error.message || 'unknown error'
      console.error('[API Error]', status, url, message)
    }
    
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Convert axios errors to typed errors for better handling
    let typedError: Error = error

    if (!error.response) {
      // Network error (no response from server)
      typedError = new NetworkError(error.message || 'Network connection failed')
    } else {
      const status = error.response.status
      const errorMessage = (error.response.data as any)?.detail || error.message

      switch (status) {
        case 400:
          typedError = new ValidationError(errorMessage)
          break
        case 401:
          typedError = new UnauthorizedError(errorMessage)
          break
        case 403:
          typedError = new UnauthorizedError(errorMessage || 'Access forbidden')
          break
        case 404:
          typedError = new NotFoundError(errorMessage || 'Resource not found')
          break
        case 500:
        case 502:
        case 503:
        case 504:
          typedError = new ServerError(errorMessage || 'Server error')
          break
        default:
          // Keep as generic error for other status codes
          typedError = error
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

// Accountant Dashboard Types
export type ClientStatus = 'GREEN' | 'YELLOW' | 'RED'
export type BTWQuarterStatus = 'ON_TRACK' | 'PENDING_DOCS' | 'DEADLINE_APPROACHING' | 'OVERDUE' | 'NOT_APPLICABLE'
export type IssueSeverity = 'ERROR' | 'WARNING' | 'INFO'
export type IssueCategory = 'MISSING_DOCUMENT' | 'PROCESSING_ERROR' | 'VALIDATION_ERROR' | 'BTW_DEADLINE' | 'UNBALANCED_TRANSACTION' | 'DRAFT_PENDING' | 'LOW_CONFIDENCE'

export interface DashboardIssue {
  id: string
  category: IssueCategory
  severity: IssueSeverity
  title: string
  description: string
  suggested_action: string
  related_entity_id: string | null
  related_entity_type: string | null
  created_at: string
}

export interface ClientOverview {
  id: string
  name: string
  kvk_number: string | null
  btw_number: string | null
  status: ClientStatus
  last_document_upload: string | null
  btw_quarter_status: BTWQuarterStatus
  current_quarter: string
  error_count: number
  warning_count: number
  issues: DashboardIssue[]
  total_transactions: number
  draft_transactions: number
  failed_documents: number
}

export interface AccountantDashboardResponse {
  total_clients: number
  clients_needing_attention: number
  clients_with_errors: number
  clients: ClientOverview[]
  global_issues: DashboardIssue[]
  generated_at: string
}

export interface ClientIssuesResponse {
  client_id: string
  client_name: string
  total_issues: number
  issues: DashboardIssue[]
}

export const accountantDashboardApi = {
  getDashboard: async (): Promise<AccountantDashboardResponse> => {
    const response = await api.get<AccountantDashboardResponse>('/accountant/dashboard')
    return response.data
  },

  getClientIssues: async (clientId: string): Promise<ClientIssuesResponse> => {
    const response = await api.get<ClientIssuesResponse>(`/accountant/dashboard/client/${clientId}/issues`)
    return response.data
  },
}

// Core Ledger API Types
export type LedgerIssueSeverity = 'RED' | 'YELLOW'

export interface LedgerClientIssue {
  id: string
  issue_code: string
  severity: LedgerIssueSeverity
  title: string
  description: string
  why: string | null
  suggested_action: string | null
  document_id: string | null
  journal_entry_id: string | null
  account_id: string | null
  fixed_asset_id: string | null
  party_id: string | null
  open_item_id: string | null
  amount_discrepancy: number | null
  is_resolved: boolean
  resolved_at: string | null
  created_at: string
}

export interface LedgerClientIssuesResponse {
  client_id: string
  client_name: string
  total_issues: number
  red_count: number
  yellow_count: number
  issues: LedgerClientIssue[]
}

export interface LedgerClientOverview {
  client_id: string
  client_name: string
  missing_docs_count: number
  error_count: number
  warning_count: number
  upcoming_deadlines: unknown[]
  total_journal_entries: number
  draft_entries_count: number
  posted_entries_count: number
  total_open_receivables: number
  total_open_payables: number
}

export interface RecalculateResponse {
  success: boolean
  validation_run_id: string
  issues_found: number
  message: string
}

export interface AccountBalance {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  debit_total: number
  credit_total: number
  balance: number
}

export interface BalanceSheetSection {
  name: string
  accounts: AccountBalance[]
  total: number
}

export interface BalanceSheetResponse {
  as_of_date: string
  current_assets: BalanceSheetSection
  fixed_assets: BalanceSheetSection
  total_assets: number
  current_liabilities: BalanceSheetSection
  long_term_liabilities: BalanceSheetSection
  equity: BalanceSheetSection
  total_liabilities_equity: number
  is_balanced: boolean
}

export interface PnLSection {
  name: string
  accounts: AccountBalance[]
  total: number
}

export interface ProfitAndLossResponse {
  start_date: string
  end_date: string
  revenue: PnLSection
  cost_of_goods_sold: PnLSection
  gross_profit: number
  operating_expenses: PnLSection
  operating_income: number
  other_income: PnLSection
  other_expenses: PnLSection
  net_income: number
}

export interface OpenItemReport {
  party_id: string
  party_name: string
  party_code: string | null
  document_number: string | null
  document_date: string
  due_date: string
  original_amount: number
  paid_amount: number
  open_amount: number
  days_overdue: number
  status: string
}

export interface SubledgerReportResponse {
  report_type: string
  as_of_date: string
  items: OpenItemReport[]
  total_original: number
  total_paid: number
  total_open: number
  overdue_amount: number
}

// ============ Bookkeeping / Journal Entry Types ============

export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'REVERSED'

export interface JournalLineCreate {
  account_id: string
  description?: string
  debit_amount: number
  credit_amount: number
  vat_code_id?: string
  vat_amount?: number
  taxable_amount?: number
  party_type?: 'CUSTOMER' | 'SUPPLIER'
  party_id?: string
}

export interface JournalLineResponse {
  id: string
  line_number: number
  account_id: string
  account_code: string | null
  account_name: string | null
  description: string | null
  debit_amount: number
  credit_amount: number
  vat_code_id: string | null
  vat_code: string | null
  vat_amount: number | null
  taxable_amount: number | null
  party_type: string | null
  party_id: string | null
}

export interface JournalEntryCreate {
  entry_date: string
  description: string
  reference?: string
  document_id?: string
  source_type?: string
  source_id?: string
  lines: JournalLineCreate[]
  auto_post?: boolean
}

export interface JournalEntryUpdate {
  entry_date?: string
  description?: string
  reference?: string
  lines?: JournalLineCreate[]
}

export interface JournalEntryResponse {
  id: string
  administration_id: string
  entry_number: string
  entry_date: string
  description: string
  reference: string | null
  status: JournalEntryStatus
  total_debit: number
  total_credit: number
  is_balanced: boolean
  source_type: string | null
  document_id: string | null
  posted_at: string | null
  posted_by_name: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
  lines: JournalLineResponse[]
}

export interface JournalEntryListItem {
  id: string
  entry_number: string
  entry_date: string
  description: string
  status: JournalEntryStatus
  total_debit: number
  total_credit: number
  is_balanced: boolean
  source_type: string | null
  posted_at: string | null
  created_at: string
}

export interface JournalEntryListResponse {
  entries: JournalEntryListItem[]
  total_count: number
}

export interface JournalEntryPostResponse {
  id: string
  status: JournalEntryStatus
  entry_number: string
  posted_at: string
  message: string
}

export interface PeriodLockCheckResponse {
  is_locked: boolean
  period_id: string | null
  period_name: string | null
  locked_at: string | null
  locked_by_name: string | null
  message: string
}

// ============ Audit Log Types ============

export type AuditLogAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'POST' 
  | 'DELETE' 
  | 'REVERSE' 
  | 'LOCK_PERIOD' 
  | 'UNLOCK_PERIOD' 
  | 'START_REVIEW' 
  | 'FINALIZE_PERIOD'

export interface AuditLogEntry {
  id: string
  administration_id: string
  actor_id: string | null
  actor_name: string | null
  action: AuditLogAction | string
  entity_type: string
  entity_id: string | null
  entity_description: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

export interface AuditLogListResponse {
  entries: AuditLogEntry[]
  total_count: number
}

// Core Ledger API
export const ledgerApi = {
  getClientOverview: async (clientId: string): Promise<LedgerClientOverview> => {
    const response = await api.get<LedgerClientOverview>(`/accountant/clients/${clientId}/overview`)
    return response.data
  },

  getClientIssues: async (clientId: string, includeResolved = false): Promise<LedgerClientIssuesResponse> => {
    const response = await api.get<LedgerClientIssuesResponse>(
      `/accountant/clients/${clientId}/issues`,
      { params: { include_resolved: includeResolved } }
    )
    return response.data
  },

  recalculate: async (clientId: string, force = false): Promise<RecalculateResponse> => {
    const response = await api.post<RecalculateResponse>(
      `/accountant/clients/${clientId}/journal/recalculate`,
      { force }
    )
    return response.data
  },

  getBalanceSheet: async (clientId: string, asOfDate?: string): Promise<BalanceSheetResponse> => {
    const params = asOfDate ? { as_of_date: asOfDate } : {}
    const response = await api.get<BalanceSheetResponse>(
      `/accountant/clients/${clientId}/reports/balance-sheet`,
      { params }
    )
    return response.data
  },

  getProfitAndLoss: async (clientId: string, startDate?: string, endDate?: string): Promise<ProfitAndLossResponse> => {
    const params: Record<string, string> = {}
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate
    const response = await api.get<ProfitAndLossResponse>(
      `/accountant/clients/${clientId}/reports/pnl`,
      { params }
    )
    return response.data
  },

  getAccountsReceivable: async (clientId: string, asOfDate?: string): Promise<SubledgerReportResponse> => {
    const params = asOfDate ? { as_of_date: asOfDate } : {}
    const response = await api.get<SubledgerReportResponse>(
      `/accountant/clients/${clientId}/reports/ar`,
      { params }
    )
    return response.data
  },

  getAccountsPayable: async (clientId: string, asOfDate?: string): Promise<SubledgerReportResponse> => {
    const params = asOfDate ? { as_of_date: asOfDate } : {}
    const response = await api.get<SubledgerReportResponse>(
      `/accountant/clients/${clientId}/reports/ap`,
      { params }
    )
    return response.data
  },
}



export const accountantDossierApi = {
  getInvoices: async (clientId: string): Promise<ZZPInvoiceListResponse> => {
    const response = await api.get<ZZPInvoiceListResponse>(`/accountant/clients/${clientId}/invoices`)
    return response.data
  },

  getExpenses: async (clientId: string): Promise<ZZPExpenseListResponse> => {
    const response = await api.get<ZZPExpenseListResponse>(`/accountant/clients/${clientId}/expenses`)
    return response.data
  },

  getHours: async (clientId: string): Promise<ZZPTimeEntryListResponse> => {
    const response = await api.get<ZZPTimeEntryListResponse>(`/accountant/clients/${clientId}/hours`)
    return response.data
  },
}

// ============ Bookkeeping API ============

export const bookkeepingApi = {
  /**
   * List journal entries for a client
   */
  listJournalEntries: async (
    clientId: string, 
    options?: { status?: JournalEntryStatus; startDate?: string; endDate?: string; limit?: number; offset?: number }
  ): Promise<JournalEntryListResponse> => {
    const response = await api.get<JournalEntryListResponse>(
      `/accountant/clients/${clientId}/journal`,
      { params: options }
    )
    return response.data
  },

  /**
   * Create a new manual journal entry
   */
  createJournalEntry: async (clientId: string, entry: JournalEntryCreate): Promise<JournalEntryResponse> => {
    const response = await api.post<JournalEntryResponse>(
      `/accountant/clients/${clientId}/journal`,
      entry
    )
    return response.data
  },

  /**
   * Get a specific journal entry with all lines
   */
  getJournalEntry: async (clientId: string, entryId: string): Promise<JournalEntryResponse> => {
    const response = await api.get<JournalEntryResponse>(
      `/accountant/clients/${clientId}/journal/${entryId}`
    )
    return response.data
  },

  /**
   * Update a draft journal entry
   */
  updateJournalEntry: async (clientId: string, entryId: string, entry: JournalEntryUpdate): Promise<JournalEntryResponse> => {
    const response = await api.put<JournalEntryResponse>(
      `/accountant/clients/${clientId}/journal/${entryId}`,
      entry
    )
    return response.data
  },

  /**
   * Post a draft journal entry
   */
  postJournalEntry: async (clientId: string, entryId: string): Promise<JournalEntryPostResponse> => {
    const response = await api.post<JournalEntryPostResponse>(
      `/accountant/clients/${clientId}/journal/${entryId}/post`
    )
    return response.data
  },

  /**
   * Delete a draft journal entry
   */
  deleteJournalEntry: async (clientId: string, entryId: string): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(
      `/accountant/clients/${clientId}/journal/${entryId}`
    )
    return response.data
  },

  /**
   * Check if a date falls within a locked period
   */
  checkPeriodLock: async (clientId: string, entryDate: string): Promise<PeriodLockCheckResponse> => {
    const response = await api.get<PeriodLockCheckResponse>(
      `/accountant/clients/${clientId}/journal/check-period`,
      { params: { entry_date: entryDate } }
    )
    return response.data
  },

  /**
   * List audit log entries for a client
   */
  listAuditLog: async (
    clientId: string,
    options?: { entityType?: string; action?: string; limit?: number; offset?: number }
  ): Promise<AuditLogListResponse> => {
    const response = await api.get<AuditLogListResponse>(
      `/accountant/clients/${clientId}/audit`,
      { params: options }
    )
    return response.data
  },
}

// ============ Decision Engine Types ============

export type ActionType = 
  | 'RECLASSIFY_TO_ASSET'
  | 'CREATE_DEPRECIATION'
  | 'CORRECT_VAT_RATE'
  | 'ALLOCATE_OPEN_ITEM'
  | 'FLAG_DOCUMENT_INVALID'
  | 'LOCK_PERIOD'
  | 'REVERSE_JOURNAL_ENTRY'
  | 'CREATE_ADJUSTMENT_ENTRY'

export type DecisionType = 'APPROVED' | 'REJECTED' | 'OVERRIDDEN'
export type ExecutionStatus = 'PENDING' | 'EXECUTED' | 'FAILED' | 'ROLLED_BACK'

export interface SuggestedAction {
  id: string
  issue_id: string
  action_type: ActionType
  title: string
  explanation: string
  parameters: Record<string, unknown> | null
  confidence_score: number
  is_auto_suggested: boolean
  priority: number
  created_at: string
}

export interface IssueSuggestionsResponse {
  issue_id: string
  issue_title: string
  issue_code: string
  suggestions: SuggestedAction[]
  total_suggestions: number
}

export interface DecisionRequest {
  suggested_action_id?: string
  action_type: ActionType
  decision: DecisionType
  override_parameters?: Record<string, unknown>
  notes?: string
}

export interface DecisionResponse {
  id: string
  issue_id: string
  suggested_action_id: string | null
  action_type: ActionType
  decision: DecisionType
  override_parameters: Record<string, unknown> | null
  notes: string | null
  decided_by_id: string
  decided_at: string
  execution_status: ExecutionStatus
  executed_at: string | null
  execution_error: string | null
  result_journal_entry_id: string | null
  is_reversible: boolean
}

export interface DecisionHistoryItem {
  id: string
  issue_id: string
  issue_title: string
  issue_code: string
  action_type: ActionType
  decision: DecisionType
  decided_by_name: string
  decided_at: string
  execution_status: ExecutionStatus
  is_reversible: boolean
}

export interface DecisionHistoryResponse {
  client_id: string
  client_name: string
  total_decisions: number
  decisions: DecisionHistoryItem[]
}

export interface ExecutionResultResponse {
  decision_id: string
  execution_status: ExecutionStatus
  executed_at: string | null
  result_journal_entry_id: string | null
  error_message: string | null
  message: string
}

export interface DecisionPattern {
  id: string
  issue_code: string
  action_type: ActionType
  approval_count: number
  rejection_count: number
  confidence_boost: number
  last_approved_at: string | null
  last_rejected_at: string | null
}

export interface ClientPatternsResponse {
  client_id: string
  client_name: string
  patterns: DecisionPattern[]
}

// Decision Engine API
export const decisionApi = {
  getIssueSuggestions: async (issueId: string): Promise<IssueSuggestionsResponse> => {
    const response = await api.get<IssueSuggestionsResponse>(
      `/accountant/issues/${issueId}/suggestions`
    )
    return response.data
  },

  makeDecision: async (
    issueId: string, 
    request: DecisionRequest, 
    autoExecute = true
  ): Promise<DecisionResponse> => {
    const response = await api.post<DecisionResponse>(
      `/accountant/issues/${issueId}/decide`,
      request,
      { params: { auto_execute: autoExecute } }
    )
    return response.data
  },

  executeDecision: async (decisionId: string): Promise<ExecutionResultResponse> => {
    const response = await api.post<ExecutionResultResponse>(
      `/accountant/decisions/${decisionId}/execute`
    )
    return response.data
  },

  reverseDecision: async (decisionId: string, reason?: string): Promise<{ decision_id: string; reversed_at: string; message: string }> => {
    const response = await api.post<{ decision_id: string; reversed_at: string; message: string }>(
      `/accountant/decisions/${decisionId}/reverse`,
      { reason }
    )
    return response.data
  },

  getDecisionHistory: async (
    clientId: string, 
    limit = 50, 
    offset = 0
  ): Promise<DecisionHistoryResponse> => {
    const response = await api.get<DecisionHistoryResponse>(
      `/accountant/clients/${clientId}/decision-history`,
      { params: { limit, offset } }
    )
    return response.data
  },

  getDecisionPatterns: async (clientId: string): Promise<ClientPatternsResponse> => {
    const response = await api.get<ClientPatternsResponse>(
      `/accountant/clients/${clientId}/decision-patterns`
    )
    return response.data
  },
}

// ============ Period Control Types ============

export type PeriodStatus = 'OPEN' | 'REVIEW' | 'FINALIZED' | 'LOCKED' | 'READY_FOR_FILING'

export interface Period {
  id: string
  administration_id: string
  name: string
  period_type: string
  start_date: string
  end_date: string
  status: PeriodStatus
  is_closed: boolean
  created_at: string
  closed_at: string | null
  review_started_at: string | null
  finalized_at: string | null
  locked_at: string | null
  review_started_by_id: string | null
  finalized_by_id: string | null
  locked_by_id: string | null
}

export interface ValidationIssue {
  id: string
  code: string
  title: string
  severity: 'RED' | 'YELLOW'
}

export interface ValidationStatus {
  red_issues: ValidationIssue[]
  yellow_issues: ValidationIssue[]
  can_finalize: boolean
  validation_summary: string
}

export interface PeriodWithValidation {
  period: Period
  validation: ValidationStatus
}

export interface PeriodsListResponse {
  administration_id: string
  periods: Period[]
  total_count: number
}

export interface ReviewPeriodRequest {
  notes?: string
}

export interface ReviewPeriodResponse {
  period: Period
  validation_run_id: string
  issues_found: number
  message: string
}

export interface FinalizePeriodRequest {
  acknowledged_yellow_issues?: string[]
  notes?: string
}

export interface FinalizePeriodResponse {
  period: Period
  snapshot_id: string
  message: string
}

export interface LockPeriodRequest {
  confirm_irreversible: boolean
  notes?: string
}

export interface LockPeriodResponse {
  period: Period
  message: string
}

export interface UpdatePeriodStatusRequest {
  status: 'READY_FOR_FILING' | 'FINALIZED'
}

export interface UpdatePeriodStatusResponse {
  period: Period
  message: string
}

export interface SnapshotSummary {
  total_assets: number
  total_liabilities: number
  total_equity: number
  net_income: number
  total_ar: number
  total_ap: number
  vat_payable: number
  vat_receivable: number
}

export interface PeriodSnapshot {
  id: string
  period_id: string
  administration_id: string
  snapshot_type: string
  created_at: string
  created_by_id: string
  summary: SnapshotSummary
  balance_sheet: Record<string, unknown> | null
  profit_and_loss: Record<string, unknown> | null
  vat_summary: Record<string, unknown> | null
  open_ar_balances: Record<string, unknown> | null
  open_ap_balances: Record<string, unknown> | null
  trial_balance: Record<string, unknown> | null
  acknowledged_yellow_issues: string[] | null
  issue_summary: Record<string, unknown> | null
}

export interface AuditLogEntry {
  id: string
  period_id: string
  administration_id: string
  action: string
  from_status: string | null
  to_status: string | null
  performed_by_id: string
  performed_at: string
  notes: string | null
  snapshot_id: string | null
}

export interface PeriodAuditLogsResponse {
  period_id: string
  logs: AuditLogEntry[]
  total_count: number
}

// Period Control API
export const periodApi = {
  listPeriods: async (
    clientId: string, 
    status?: PeriodStatus[]
  ): Promise<PeriodsListResponse> => {
    const params: Record<string, unknown> = {}
    if (status && status.length > 0) {
      params.status = status
    }
    const response = await api.get<PeriodsListResponse>(
      `/accountant/clients/${clientId}/periods`,
      { params }
    )
    return response.data
  },

  getPeriod: async (clientId: string, periodId: string): Promise<PeriodWithValidation> => {
    const response = await api.get<PeriodWithValidation>(
      `/accountant/clients/${clientId}/periods/${periodId}`
    )
    return response.data
  },

  startReview: async (
    clientId: string, 
    periodId: string, 
    request: ReviewPeriodRequest = {}
  ): Promise<ReviewPeriodResponse> => {
    const response = await api.post<ReviewPeriodResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/review`,
      request
    )
    return response.data
  },

  finalizePeriod: async (
    clientId: string, 
    periodId: string, 
    request: FinalizePeriodRequest = {}
  ): Promise<FinalizePeriodResponse> => {
    const response = await api.post<FinalizePeriodResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/finalize`,
      request
    )
    return response.data
  },

  lockPeriod: async (
    clientId: string, 
    periodId: string, 
    request: LockPeriodRequest
  ): Promise<LockPeriodResponse> => {
    const response = await api.post<LockPeriodResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/lock`,
      request
    )
    return response.data
  },

  updateStatus: async (
    clientId: string,
    periodId: string,
    request: UpdatePeriodStatusRequest
  ): Promise<UpdatePeriodStatusResponse> => {
    const response = await api.patch<UpdatePeriodStatusResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}`,
      request
    )
    return response.data
  },

  getSnapshot: async (clientId: string, periodId: string): Promise<PeriodSnapshot> => {
    const response = await api.get<PeriodSnapshot>(
      `/accountant/clients/${clientId}/periods/${periodId}/snapshot`
    )
    return response.data
  },

  getAuditLogs: async (
    clientId: string, 
    periodId: string, 
    limit = 50
  ): Promise<PeriodAuditLogsResponse> => {
    const response = await api.get<PeriodAuditLogsResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/audit-logs`,
      { params: { limit } }
    )
    return response.data
  },
}


export interface VATBox {
  box_code: string
  box_name: string
  turnover_amount: string
  vat_amount: string
  transaction_count: number
}

export interface VATAnomaly {
  id: string
  code: string
  severity: 'RED' | 'YELLOW'
  title: string
  description: string
  suggested_fix?: string
  amount_discrepancy?: string
}

export interface ICPEntry {
  customer_vat_number: string
  country_code: string
  customer_name?: string | null
  customer_id?: string | null
  taxable_base: string
  transaction_count: number
}

export interface VATReportResponse {
  period_id: string
  period_name: string
  start_date: string
  end_date: string
  generated_at: string
  boxes: Record<string, VATBox>
  total_turnover: string
  total_vat_payable: string
  total_vat_receivable: string
  net_vat: string
  anomalies: VATAnomaly[]
  has_red_anomalies: boolean
  has_yellow_anomalies: boolean
  icp_entries: ICPEntry[]
  total_icp_supplies: string
}

export interface ICPReportResponse {
  period_id: string
  period_name: string
  entries: ICPEntry[]
  total_supplies: string
  total_customers: number
}

export interface VATValidationResponse {
  period_id: string
  period_name: string
  anomalies: VATAnomaly[]
  total_anomalies: number
  red_count: number
  yellow_count: number
  is_valid: boolean
  message: string
}

export const vatApi = {
  getReport: async (clientId: string, periodId: string): Promise<VATReportResponse> => {
    const response = await api.get<VATReportResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/reports/vat`,
      { params: { allow_draft: true } }
    )
    return response.data
  },

  getICPReport: async (clientId: string, periodId: string): Promise<ICPReportResponse> => {
    const response = await api.get<ICPReportResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/reports/vat/icp`
    )
    return response.data
  },

  validate: async (clientId: string, periodId: string): Promise<VATValidationResponse> => {
    const response = await api.post<VATValidationResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/vat/validate`
    )
    return response.data
  },

  downloadPdf: async (clientId: string, periodId: string): Promise<Blob> => {
    const response = await api.get(
      `/accountant/clients/${clientId}/periods/${periodId}/reports/vat.pdf`,
      { responseType: 'blob' }
    )
    return response.data as Blob
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
    // Dutch message with helpful troubleshooting hint
    if (error.message === 'Network Error') {
      const baseHint = normalizedEnvApiUrl 
        ? `VITE_API_URL moet alleen ${normalizedEnvApiUrl} zijn (zonder /api paden).`
        : 'VITE_API_URL moet alleen het domein bevatten (zonder /api paden).'
      return `Kan geen verbinding maken met de server op ${API_BASE_URL}. ` +
        `Mogelijke oorzaken: netwerkproblemen, CORS-fout, of ongeldig TLS-certificaat. ` +
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

// ============ Document Review Queue Types ============

export type DocumentReviewStatus = 'UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'NEEDS_REVIEW' | 'POSTED' | 'REJECTED' | 'DRAFT_READY' | 'FAILED'

export type DocumentSuggestedActionType = 
  | 'ALLOCATE_OPEN_ITEM'
  | 'RECLASSIFY_TO_ASSET'
  | 'CREATE_DEPRECIATION'
  | 'MARK_DUPLICATE'
  | 'POST_AS_EXPENSE'
  | 'POST_AS_REVENUE'
  | 'NEEDS_MANUAL_REVIEW'

export interface DocumentSuggestedAction {
  id: string
  action_type: DocumentSuggestedActionType
  title: string
  explanation: string
  confidence_score: number
  parameters: Record<string, unknown> | null
  priority: number
  created_at: string
}

export interface DocumentReviewItem {
  id: string
  administration_id: string
  original_filename: string
  mime_type: string
  file_size: number
  status: DocumentReviewStatus
  error_message: string | null
  created_at: string
  updated_at: string
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: number | null
  vat_amount: number | null
  net_amount: number | null
  currency: string | null
  extraction_confidence: number | null
  matched_party_id: string | null
  matched_party_name: string | null
  matched_open_item_id: string | null
  match_confidence: number | null
  is_duplicate: boolean
  duplicate_of_id: string | null
  suggested_actions: DocumentSuggestedAction[]
  extracted_fields: Record<string, unknown>
}

export interface DocumentReviewListResponse {
  client_id: string
  client_name: string
  total_documents: number
  documents: DocumentReviewItem[]
}

export interface DocumentPostRequest {
  description?: string
  entry_date?: string
  account_id?: string
  vat_code_id?: string
  allocate_to_open_item_id?: string
  notes?: string
}

export interface DocumentPostResponse {
  document_id: string
  status: DocumentReviewStatus
  journal_entry_id: string
  message: string
  posted_at: string
  posted_by_name: string | null
}

export interface DocumentRejectRequest {
  reason: string
  notes?: string
}

export interface DocumentRejectResponse {
  document_id: string
  status: DocumentReviewStatus
  rejection_reason: string
  rejected_at: string
  rejected_by_name: string | null
  message: string
}

export interface DocumentReprocessResponse {
  document_id: string
  status: DocumentReviewStatus
  process_count: number
  message: string
}

// Closing Checklist Types
export interface ClosingChecklistItem {
  name: string
  description: string
  status: 'PASSED' | 'FAILED' | 'WARNING' | 'PENDING'
  details: string | null
  value: string | null
  required: boolean
}

export interface ClosingChecklistResponse {
  client_id: string
  client_name: string
  period_id: string
  period_name: string
  period_status: string
  can_finalize: boolean
  blocking_items: number
  warning_items: number
  items: ClosingChecklistItem[]
  documents_posted_percent: number
  documents_pending_review: number
  red_issues_count: number
  yellow_issues_count: number
  unacknowledged_yellow_count: number
  vat_report_ready: boolean
  ar_reconciled: boolean
  ap_reconciled: boolean
  assets_consistent: boolean
}

// Document Review Queue API
export const documentReviewApi = {
  listDocuments: async (
    clientId: string, 
    status?: DocumentReviewStatus
  ): Promise<DocumentReviewListResponse> => {
    const params = status ? { status } : {}
    const response = await api.get<DocumentReviewListResponse>(
      `/accountant/clients/${clientId}/documents`,
      { params }
    )
    return response.data
  },

  getDocument: async (clientId: string, documentId: string): Promise<DocumentReviewItem> => {
    const response = await api.get<DocumentReviewItem>(
      `/accountant/clients/${clientId}/documents/${documentId}`
    )
    return response.data
  },

  postDocument: async (
    clientId: string, 
    documentId: string, 
    request: DocumentPostRequest = {}
  ): Promise<DocumentPostResponse> => {
    const response = await api.post<DocumentPostResponse>(
      `/accountant/clients/${clientId}/documents/${documentId}/post`,
      request
    )
    return response.data
  },

  rejectDocument: async (
    clientId: string, 
    documentId: string, 
    request: DocumentRejectRequest
  ): Promise<DocumentRejectResponse> => {
    const response = await api.post<DocumentRejectResponse>(
      `/accountant/clients/${clientId}/documents/${documentId}/reject`,
      request
    )
    return response.data
  },

  reprocessDocument: async (
    clientId: string, 
    documentId: string
  ): Promise<DocumentReprocessResponse> => {
    const response = await api.post<DocumentReprocessResponse>(
      `/accountant/clients/${clientId}/documents/${documentId}/reprocess`
    )
    return response.data
  },

  runMatching: async (clientId: string, documentId: string): Promise<{
    document_id: string
    status: string
    is_duplicate: boolean
    match_confidence: string | null
    matched_party_id: string | null
    matched_open_item_id: string | null
    message: string
  }> => {
    const response = await api.post(
      `/accountant/clients/${clientId}/documents/${documentId}/match`
    )
    return response.data
  },

  getClosingChecklist: async (clientId: string, periodId: string): Promise<ClosingChecklistResponse> => {
    const response = await api.get<ClosingChecklistResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/closing-checklist`
    )
    return response.data
  },
}

// ============ Observability Types ============

export type AlertSeverity_Ops = 'CRITICAL' | 'WARNING' | 'INFO'

export interface Alert {
  id: string
  alert_code: string
  severity: AlertSeverity_Ops
  title: string
  message: string
  entity_type: string | null
  entity_id: string | null
  administration_id: string | null
  context: string | null
  created_at: string
  acknowledged_at: string | null
  acknowledged_by_id: string | null
  resolved_at: string | null
  resolved_by_id: string | null
  resolution_notes: string | null
  auto_resolved: boolean
}

export interface AlertListResponse {
  alerts: Alert[]
  total_count: number
  active_count: number
  acknowledged_count: number
  critical_count: number
  warning_count: number
  info_count: number
}

export interface AlertCountsResponse {
  critical: number
  warning: number
  info: number
  total: number
}

export interface AlertGroupedResponse {
  critical: Alert[]
  warning: Alert[]
  info: Alert[]
  counts: AlertCountsResponse
}

export interface HealthComponent {
  status: 'healthy' | 'unhealthy' | 'warning' | 'unknown'
  message: string | null
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  components: {
    database: HealthComponent
    redis: HealthComponent
    migrations: HealthComponent
    background_tasks: HealthComponent
  }
}

export interface MetricsSummary {
  documents_processed_today: number
  issues_created_today: number
  red_issues_active: number
  decisions_approved_today: number
  decisions_rejected_today: number
  postings_created_today: number
  failed_operations_count: number
  active_critical_alerts: number
}

export interface MetricsResponse {
  timestamp: string
  scope: 'client' | 'global'
  administration_id: string | null
  documents: {
    documents_processed_today: number
    documents_uploaded_today: number
    documents_failed_today: number
    documents_by_status: Record<string, number>
    documents_pending_review: number
    documents_in_processing: number
  }
  issues: {
    issues_created_today: { red: number; yellow: number; total: number }
    active_issues: { red: number; yellow: number; total: number }
    issues_resolved_today: number
  }
  decisions: {
    decisions_today: { approved: number; rejected: number; overridden: number; total: number }
    execution_today: { executed: number; failed: number; pending: number }
  }
  postings: {
    postings_created_today: number
    draft_entries: number
    entries_by_status: Record<string, number>
  }
  alerts: {
    active_alerts: { critical: number; warning: number; info: number; total: number }
    alerts_created_today: number
    alerts_resolved_today: number
  }
  summary: MetricsSummary
}

// Observability API
export const observabilityApi = {
  getHealth: async (): Promise<HealthResponse> => {
    const response = await api.get<HealthResponse>('/health')
    return response.data
  },

  getMetrics: async (administrationId?: string): Promise<MetricsResponse> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<MetricsResponse>('/ops/metrics', { params })
    return response.data
  },

  listAlerts: async (
    administrationId?: string,
    severity?: AlertSeverity_Ops,
    includeResolved = false,
    limit = 100
  ): Promise<AlertListResponse> => {
    const params: Record<string, unknown> = { include_resolved: includeResolved, limit }
    if (administrationId) params.administration_id = administrationId
    if (severity) params.severity = severity
    const response = await api.get<AlertListResponse>('/ops/alerts', { params })
    return response.data
  },

  getAlertsGrouped: async (administrationId?: string): Promise<AlertGroupedResponse> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<AlertGroupedResponse>('/ops/alerts/grouped', { params })
    return response.data
  },

  getAlertCounts: async (administrationId?: string): Promise<AlertCountsResponse> => {
    const params = administrationId ? { administration_id: administrationId } : {}
    const response = await api.get<AlertCountsResponse>('/ops/alerts/counts', { params })
    return response.data
  },

  getAlert: async (alertId: string): Promise<Alert> => {
    const response = await api.get<Alert>(`/ops/alerts/${alertId}`)
    return response.data
  },

  acknowledgeAlert: async (alertId: string): Promise<Alert> => {
    const response = await api.post<Alert>(`/ops/alerts/${alertId}/acknowledge`)
    return response.data
  },

  resolveAlert: async (alertId: string, notes?: string): Promise<Alert> => {
    const response = await api.post<Alert>(`/ops/alerts/${alertId}/resolve`, { notes })
    return response.data
  },

  runAlertChecks: async (administrationId: string): Promise<AlertListResponse> => {
    const response = await api.post<AlertListResponse>(`/ops/alerts/check/${administrationId}`)
    return response.data
  },
}

// ============ Accountant Master Dashboard Types ============

export interface VATDeadlineInfo {
  client_id: string
  client_name: string
  period_name: string
  deadline_date: string
  days_remaining: number
  status: string
}

export interface AlertSeverityCounts {
  critical: number
  warning: number
  info: number
}

export interface DashboardSummary {
  total_clients: number
  clients_with_red_issues: number
  clients_in_review: number
  upcoming_vat_deadlines_7d: number
  upcoming_vat_deadlines_14d: number
  upcoming_vat_deadlines_30d: number
  document_backlog_total: number
  alerts_by_severity: AlertSeverityCounts
  vat_deadlines: VATDeadlineInfo[]
  generated_at: string
}

export interface ClientStatusCard {
  id: string
  name: string
  kvk_number: string | null
  btw_number: string | null
  last_activity_at: string | null
  open_period_status: string | null
  open_period_name: string | null
  red_issue_count: number
  yellow_issue_count: number
  documents_needing_review_count: number
  backlog_age_max_days: number | null
  vat_anomaly_count: number
  next_vat_deadline: string | null
  days_to_vat_deadline: number | null
  readiness_score: number
  has_critical_alerts: boolean
  needs_immediate_attention: boolean
}

export interface ClientsListResponse {
  clients: ClientStatusCard[]
  total_count: number
  filtered_count: number
  sort_by: string
  sort_order: string
  filters_applied: string[]
  generated_at: string
}

export interface BulkOperationResultItem {
  client_id: string
  client_name: string
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  result_data: Record<string, unknown> | null
  error_message: string | null
  processed_at: string
}

export interface BulkOperationResponse {
  id: string
  operation_type: string
  status: string
  initiated_by_id: string
  initiated_by_name: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  total_clients: number
  processed_clients: number
  successful_clients: number
  failed_clients: number
  error_message: string | null
  results: BulkOperationResultItem[]
  message: string
}

export interface BulkRecalculateRequest {
  client_ids?: string[]
  filters?: Record<string, unknown>
  force?: boolean
  stale_only?: boolean
  idempotency_key?: string
}

export interface BulkAckYellowRequest {
  client_ids?: string[]
  filters?: Record<string, unknown>
  issue_codes?: string[]
  notes?: string
  idempotency_key?: string
}

export interface BulkGenerateVatDraftRequest {
  client_ids?: string[]
  filters?: Record<string, unknown>
  period_year: number
  period_quarter: number
  idempotency_key?: string
}

export interface BulkSendRemindersRequest {
  client_ids?: string[]
  filters?: Record<string, unknown>
  reminder_type: string
  title: string
  message: string
  due_date?: string
  idempotency_key?: string
}

export interface BulkLockPeriodRequest {
  client_ids?: string[]
  filters?: Record<string, unknown>
  period_year: number
  period_quarter: number
  confirm_irreversible: boolean
  idempotency_key?: string
}

// ============ Accountant Bulk API Endpoints ============
// Single source of truth for all bulk endpoint paths
export const ACCOUNTANT_BULK_ENDPOINTS = {
  recalculate: '/accountant/bulk/recalculate',
  ackYellow: '/accountant/bulk/ack-yellow',
  generateVatDraft: '/accountant/bulk/generate-vat-draft',
  sendReminders: '/accountant/bulk/send-reminders',
  lockPeriod: '/accountant/bulk/lock-period',
  operations: '/accountant/bulk/operations',
  operationById: (id: string) => `/accountant/bulk/operations/${id}`,
} as const

// Accountant Master Dashboard API
export const accountantMasterDashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    const response = await api.get<DashboardSummary>('/accountant/dashboard/summary')
    return response.data
  },

  getClients: async (
    sort?: string,
    order?: string,
    filters?: string[]
  ): Promise<ClientsListResponse> => {
    const params: Record<string, unknown> = {}
    if (sort) params.sort = sort
    if (order) params.order = order
    if (filters && filters.length > 0) params.filter = filters
    const response = await api.get<ClientsListResponse>('/accountant/dashboard/clients', { params })
    return response.data
  },

  bulkRecalculate: async (request: BulkRecalculateRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.recalculate, request)
    return response.data
  },

  bulkAckYellow: async (request: BulkAckYellowRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.ackYellow, request)
    return response.data
  },

  bulkGenerateVatDraft: async (request: BulkGenerateVatDraftRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.generateVatDraft, request)
    return response.data
  },

  bulkSendReminders: async (request: BulkSendRemindersRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.sendReminders, request)
    return response.data
  },

  bulkLockPeriod: async (request: BulkLockPeriodRequest): Promise<BulkOperationResponse> => {
    const response = await api.post<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.lockPeriod, request)
    return response.data
  },

  getBulkOperation: async (operationId: string): Promise<BulkOperationResponse> => {
    const response = await api.get<BulkOperationResponse>(ACCOUNTANT_BULK_ENDPOINTS.operationById(operationId))
    return response.data
  },

  listBulkOperations: async (limit?: number, operationType?: string): Promise<{ operations: BulkOperationResponse[], total_count: number }> => {
    const params: Record<string, unknown> = {}
    if (limit) params.limit = limit
    if (operationType) params.operation_type = operationType
    const response = await api.get<{ operations: BulkOperationResponse[], total_count: number }>(ACCOUNTANT_BULK_ENDPOINTS.operations, { params })
    return response.data
  },
}

// ============ Client Assignment Types ============

export interface AccountantClientListItem {
  id: string
  email: string
  name: string
  status: string
  last_activity: string | null
  open_red_count: number
  open_yellow_count: number
  administration_id: string | null
  administration_name: string | null
}

export interface AccountantClientListResponse {
  clients: AccountantClientListItem[]
  total_count: number
}

export interface AccountantAssignmentByEmailRequest {
  client_email: string
}

export interface AccountantAssignmentResponse {
  id: string
  accountant_id: string
  accountant_name: string
  administration_id: string
  administration_name: string
  is_primary: boolean
  assigned_at: string
  assigned_by_name: string | null
  notes: string | null
}

export interface AccountantAssignmentsListResponse {
  assignments: AccountantAssignmentResponse[]
  total_count: number
}

// ============ Client Consent Workflow Types ============

export interface InviteClientRequest {
  email: string
}

export interface InviteClientResponse {
  assignment_id: string
  status: string  // PENDING or ACTIVE
  client_name: string
  client_email: string
  message: string
}

export interface ClientLink {
  assignment_id: string
  client_user_id: string
  client_email: string
  client_name: string
  administration_id: string
  administration_name: string
  status: 'PENDING' | 'ACTIVE' | 'REVOKED'
  invited_by: 'ACCOUNTANT' | 'ADMIN'
  assigned_at: string
  approved_at: string | null
  revoked_at: string | null
  open_red_count: number
  open_yellow_count: number
}

export interface ClientLinksResponse {
  links: ClientLink[]
  pending_count: number
  active_count: number
  total_count: number
}



export interface MandateItem {
  id: string
  accountant_user_id: string
  client_user_id: string
  client_company_id: string
  client_company_name: string
  accountant_name?: string | null
  accountant_email?: string | null
  status: 'pending' | 'approved' | 'rejected' | 'revoked'
  created_at: string
  updated_at: string
}

export interface MandateListResponse {
  mandates: MandateItem[]
  total_count: number
}

export interface MandateActionResponse {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'revoked'
  message: string
}

// ============ Permission Scopes Types ============

export type PermissionScope = 
  | 'invoices'
  | 'customers'
  | 'expenses'
  | 'hours'
  | 'documents'
  | 'bookkeeping'
  | 'settings'
  | 'vat'
  | 'reports'

export const ALL_SCOPES: PermissionScope[] = [
  'invoices',
  'customers',
  'expenses',
  'hours',
  'documents',
  'bookkeeping',
  'settings',
  'vat',
  'reports'
]

export interface ClientScopesResponse {
  client_id: string
  client_name: string
  scopes: PermissionScope[]
  available_scopes: PermissionScope[]
}

export interface UpdateScopesRequest {
  scopes: PermissionScope[]
}

export interface UpdateScopesResponse {
  client_id: string
  scopes: PermissionScope[]
  message: string
}

export interface ScopesSummary {
  total_scopes: number
  granted_scopes: PermissionScope[]
  missing_scopes: PermissionScope[]
}

export interface ClientLinkWithScopes extends ClientLink {
  scopes: PermissionScope[]
  scopes_summary: ScopesSummary | null
}

export interface ClientLinksWithScopesResponse {
  links: ClientLinkWithScopes[]
  pending_count: number
  active_count: number
  total_count: number
}

export interface ScopeMissingError {
  code: 'SCOPE_MISSING'
  message: string
  required_scope: string
  granted_scopes: string[]
}

export interface PendingLinkRequest {
  assignment_id: string
  accountant_id: string
  accountant_email: string
  accountant_name: string
  administration_id: string
  administration_name: string
  invited_at: string
}

export interface ZZPLinksResponse {
  pending_requests: PendingLinkRequest[]
  total_count: number
}

export interface ApproveLinkResponse {
  assignment_id: string
  status: string  // ACTIVE
  approved_at: string
  message: string
}

export interface RejectLinkResponse {
  assignment_id: string
  status: string  // REVOKED
  revoked_at: string
  message: string
}

export interface ActiveAccountantLink {
  assignment_id: string
  accountant_id: string
  accountant_email: string
  accountant_name: string
  administration_id: string
  administration_name: string
  approved_at: string | null
}

export interface ZZPActiveLinksResponse {
  active_links: ActiveAccountantLink[]
  total_count: number
}

// Accountant Client Assignment API with Consent
export const accountantApi = {
  /**
   * Invite a ZZP client by email (self-serve, creates PENDING assignment)
   */
  inviteClient: async (request: InviteClientRequest): Promise<InviteClientResponse> => {
    const response = await api.post<InviteClientResponse>('/accountant/clients/invite', request)
    return response.data
  },

  /**
   * Get list of client links with consent status (PENDING + ACTIVE)
   */
  getClientLinks: async (): Promise<ClientLinksResponse> => {
    const response = await api.get<ClientLinksResponse>('/accountant/clients/links')
    return response.data
  },

  /**
   * Get list of client links with scopes summary
   */
  getClientLinksWithScopes: async (): Promise<ClientLinksWithScopesResponse> => {
    const response = await api.get<ClientLinksWithScopesResponse>('/accountant/clients/links/scopes')
    return response.data
  },

  /**
   * Get permission scopes for a specific client
   */
  getClientScopes: async (clientId: string): Promise<ClientScopesResponse> => {
    const response = await api.get<ClientScopesResponse>(`/accountant/clients/${clientId}/scopes`)
    return response.data
  },

  /**
   * Update permission scopes for a specific client (admin only)
   */
  updateClientScopes: async (clientId: string, request: UpdateScopesRequest): Promise<UpdateScopesResponse> => {
    const response = await api.put<UpdateScopesResponse>(`/accountant/clients/${clientId}/scopes`, request)
    return response.data
  },

  createMandateByEmail: async (email: string): Promise<MandateActionResponse> => {
    const response = await api.post<MandateActionResponse>('/accountant/mandates/by-email', { email })
    return response.data
  },

  getMandates: async (): Promise<MandateListResponse> => {
    const response = await api.get<MandateListResponse>('/accountant/mandates')
    return response.data
  },

  revokeMandate: async (mandateId: string): Promise<MandateActionResponse> => {
    const response = await api.delete<MandateActionResponse>(`/accountant/mandates/${mandateId}`)
    return response.data
  },
}

// ZZP Client Consent API
const zzpConsentApi = {
  /**
   * Get list of pending accountant link requests for ZZP client
   */
  getPendingLinks: async (): Promise<ZZPLinksResponse> => {
    const response = await api.get<ZZPLinksResponse>('/zzp/links')
    return response.data
  },

  /**
   * Get list of active accountant links for ZZP client
   */
  getActiveLinks: async (): Promise<ZZPActiveLinksResponse> => {
    const response = await api.get<ZZPActiveLinksResponse>('/zzp/links/active')
    return response.data
  },

  /**
   * Approve an accountant link request
   */
  approveLink: async (assignmentId: string): Promise<ApproveLinkResponse> => {
    const response = await api.post<ApproveLinkResponse>(`/zzp/links/${assignmentId}/approve`)
    return response.data
  },

  /**
   * Reject an accountant link request
   */
  rejectLink: async (assignmentId: string): Promise<RejectLinkResponse> => {
    const response = await api.post<RejectLinkResponse>(`/zzp/links/${assignmentId}/reject`)
    return response.data
  },

  /**
   * Revoke an active accountant link (withdraw previously granted access)
   */
  revokeLink: async (assignmentId: string): Promise<RejectLinkResponse> => {
    const response = await api.post<RejectLinkResponse>(`/zzp/links/${assignmentId}/revoke`)
    return response.data
  },

  getMandates: async (): Promise<MandateListResponse> => {
    const response = await api.get<MandateListResponse>('/zzp/mandates/incoming')
    return response.data
  },

  approveMandate: async (mandateId: string): Promise<MandateActionResponse> => {
    const response = await api.post<MandateActionResponse>(`/zzp/mandates/${mandateId}/accept`)
    return response.data
  },

  rejectMandate: async (mandateId: string): Promise<MandateActionResponse> => {
    const response = await api.post<MandateActionResponse>(`/zzp/mandates/${mandateId}/reject`)
    return response.data
  },
}

// Accountant Client Assignment API (legacy endpoints)
export const accountantClientApi = {
  /**
   * Get list of clients assigned to the current accountant
   */
  listClients: async (): Promise<AccountantClientListResponse> => {
    const response = await api.get<AccountantClientListResponse>('/accountant/clients')
    return response.data
  },
  
  /**
   * Get list of assignments for the current accountant
   */
  listAssignments: async (): Promise<AccountantAssignmentsListResponse> => {
    const response = await api.get<AccountantAssignmentsListResponse>('/accountant/assignments')
    return response.data
  },

  /**
   * Assign a client by their email address
   */
  assignByEmail: async (request: AccountantAssignmentByEmailRequest): Promise<AccountantAssignmentResponse> => {
    const response = await api.post<AccountantAssignmentResponse>('/accountant/assignments/by-email', request)
    return response.data
  },

  /**
   * Remove an assignment
   */
  removeAssignment: async (assignmentId: string): Promise<void> => {
    await api.delete(`/accountant/assignments/${assignmentId}`)
  },
}

// ============ Work Queue Types ============

export interface WorkQueueCounts {
  red_issues: number
  needs_review: number
  vat_due: number
  stale: number
}

export interface ReadinessBreakdown {
  base_score: number
  deductions: Array<{
    reason: string
    count?: number
    penalty: number
    days_remaining?: number
    days_inactive?: number
  }>
  final_score: number
}

export interface WorkQueueItem {
  client_id: string
  client_name: string
  period_id: string | null
  period_status: string | null
  work_item_type: 'ISSUE' | 'VAT' | 'BACKLOG' | 'ALERT' | 'PERIOD_REVIEW' | 'STALE'
  severity: 'CRITICAL' | 'RED' | 'WARNING' | 'YELLOW' | 'INFO' | null
  title: string
  description: string
  suggested_next_action: string
  due_date: string | null
  age_days: number | null
  counts: {
    red: number
    yellow: number
    backlog: number
  }
  readiness_score: number
  readiness_breakdown: ReadinessBreakdown | null
  staleness_days?: number
}

export interface WorkQueueResponse {
  items: WorkQueueItem[]
  total_count: number
  returned_count: number
  queue_type: string
  counts: WorkQueueCounts
  sort_by: string
  sort_order: string
  generated_at: string
}

export interface SLASummaryResponse {
  total_violations: number
  critical_count: number
  warning_count: number
  by_type: Record<string, { critical: number; warning: number }>
  escalation_events_today: number
  policy: Record<string, number>
  generated_at: string
}

// ============ Reminder Types ============

export interface ReminderResponse {
  id: string
  administration_id: string
  reminder_type: string
  title: string
  message: string
  channel: 'IN_APP' | 'EMAIL'
  status: 'PENDING' | 'SCHEDULED' | 'SENT' | 'FAILED'
  due_date: string | null
  scheduled_at: string | null
  sent_at: string | null
  created_at: string | null
  send_error: string | null
}

export interface ReminderSendRequest {
  client_ids: string[]
  reminder_type: string
  title: string
  message: string
  channel?: 'IN_APP' | 'EMAIL'
  due_date?: string
  template_id?: string
  variables?: Record<string, unknown>
}

export interface ReminderScheduleRequest extends ReminderSendRequest {
  scheduled_at: string
}

export interface ReminderHistoryResponse {
  reminders: ReminderResponse[]
  total_count: number
  limit: number
  offset: number
}

// ============ Evidence Pack Types ============

export interface EvidencePackResponse {
  id: string
  administration_id: string
  period_id: string
  pack_type: 'VAT_EVIDENCE' | 'AUDIT_TRAIL'
  created_at: string | null
  file_size_bytes: number | null
  checksum: string
  download_count: number
  metadata: {
    administration_name?: string
    kvk_number?: string
    btw_number?: string
    period_name?: string
    period_status?: string
    generated_at?: string
  } | null
}

export interface EvidencePackListResponse {
  packs: EvidencePackResponse[]
  total_count: number
  limit: number
  offset: number
}

// ============ Work Queue API ============

export const workQueueApi = {
  getWorkQueue: async (
    queue?: 'red' | 'review' | 'vat_due' | 'stale' | 'all',
    limit?: number,
    sort?: string,
    order?: 'asc' | 'desc'
  ): Promise<WorkQueueResponse> => {
    const params: Record<string, unknown> = {}
    if (queue) params.queue = queue
    if (limit) params.limit = limit
    if (sort) params.sort = sort
    if (order) params.order = order
    const response = await api.get<WorkQueueResponse>('/accountant/work-queue', { params })
    return response.data
  },

  getSLASummary: async (): Promise<SLASummaryResponse> => {
    const response = await api.get<SLASummaryResponse>('/accountant/dashboard/sla-summary')
    return response.data
  },
}

// ============ Reminder API ============

export const reminderApi = {
  send: async (request: ReminderSendRequest): Promise<ReminderResponse[]> => {
    const response = await api.post<ReminderResponse[]>('/accountant/reminders/send', request)
    return response.data
  },

  schedule: async (request: ReminderScheduleRequest): Promise<ReminderResponse[]> => {
    const response = await api.post<ReminderResponse[]>('/accountant/reminders/schedule', request)
    return response.data
  },

  getHistory: async (clientId?: string, limit?: number, offset?: number): Promise<ReminderHistoryResponse> => {
    const params: Record<string, unknown> = {}
    if (clientId) params.client_id = clientId
    if (limit) params.limit = limit
    if (offset) params.offset = offset
    const response = await api.get<ReminderHistoryResponse>('/accountant/reminders/history', { params })
    return response.data
  },
}

// ============ Evidence Pack API ============

export const evidencePackApi = {
  generate: async (
    clientId: string,
    periodId: string,
    packType?: 'VAT_EVIDENCE' | 'AUDIT_TRAIL'
  ): Promise<EvidencePackResponse> => {
    const params: Record<string, unknown> = {}
    if (packType) params.pack_type = packType
    const response = await api.post<EvidencePackResponse>(
      `/accountant/clients/${clientId}/periods/${periodId}/evidence-pack`,
      {},
      { params }
    )
    return response.data
  },

  download: async (packId: string): Promise<Blob> => {
    const response = await api.get(`/accountant/evidence-packs/${packId}/download`, {
      responseType: 'blob'
    })
    return response.data
  },

  list: async (
    clientId?: string,
    periodId?: string,
    limit?: number,
    offset?: number
  ): Promise<EvidencePackListResponse> => {
    const params: Record<string, unknown> = {}
    if (clientId) params.client_id = clientId
    if (periodId) params.period_id = periodId
    if (limit) params.limit = limit
    if (offset) params.offset = offset
    const response = await api.get<EvidencePackListResponse>('/accountant/evidence-packs', { params })
    return response.data
  },
}

// ============ Bank Reconciliation Types ============

export type BankTransactionStatus = 'NEW' | 'MATCHED' | 'IGNORED' | 'NEEDS_REVIEW'
export type MatchedType = 'INVOICE' | 'EXPENSE' | 'TRANSFER' | 'MANUAL'
export type ReconciliationAction = 'APPLY_MATCH' | 'IGNORE' | 'CREATE_EXPENSE' | 'UNMATCH'

export interface ColumnMapping {
  date_column?: string
  amount_column?: string
  description_column?: string
  name_column?: string
  iban_column?: string
  reference_column?: string
}

export interface BankImportRequest {
  administration_id: string
  file: File
  bank_account_iban?: string
  bank_name?: string
}

export interface BankImportResponse {
  imported_count: number
  skipped_duplicates_count: number
  total_in_file: number
  errors: string[]
  message: string
  bank_account_id: string | null
}

export interface BankTransaction {
  id: string
  administration_id: string
  bank_account_id: string
  booking_date: string
  amount: string | number
  currency: string
  counterparty_name: string | null
  counterparty_iban: string | null
  description: string
  reference: string | null
  status: BankTransactionStatus
  matched_entity_type: string | null
  matched_entity_id: string | null
  created_at: string
}

export interface BankTransactionListResponse {
  transactions: BankTransaction[]
  total_count: number
  page: number
  page_size: number
}

export interface MatchSuggestion {
  entity_type: MatchedType
  entity_id: string
  entity_reference: string
  confidence_score: number
  amount: string | number
  date: string
  explanation: string
  proposed_action: ReconciliationAction
}

export interface SuggestMatchResponse {
  transaction_id: string
  suggestions: MatchSuggestion[]
  message: string
}

export interface ApplyActionRequest {
  action_type: ReconciliationAction
  match_entity_type?: MatchedType
  match_entity_id?: string
  expense_category?: string
  vat_rate?: number
  notes?: string
}

export interface ApplyActionResponse {
  transaction: BankTransaction
  action_applied: ReconciliationAction
  journal_entry_id: string | null
  message: string
}

export interface ReconciliationActionRecord {
  id: string
  administration_id: string
  accountant_user_id: string
  bank_transaction_id: string
  action_type: ReconciliationAction
  payload: Record<string, unknown> | null
  created_at: string
}

export interface ReconciliationActionsListResponse {
  actions: ReconciliationActionRecord[]
  total_count: number
}

// ============ Bank Reconciliation API ============

export const bankReconciliationApi = {
  importFile: async (request: BankImportRequest): Promise<BankImportResponse> => {
    const formData = new FormData()
    formData.append('file', request.file)
    if (request.bank_account_iban) {
      formData.append('bank_account_iban', request.bank_account_iban)
    }
    if (request.bank_name) {
      formData.append('bank_name', request.bank_name)
    }
    const response = await api.post<BankImportResponse>('/accountant/bank/import', formData, {
      params: { administration_id: request.administration_id },
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  listTransactions: async (
    administrationId: string,
    options?: {
      status?: BankTransactionStatus
      q?: string
      dateFrom?: string
      dateTo?: string
      minAmount?: number
      maxAmount?: number
      page?: number
      pageSize?: number
    }
  ): Promise<BankTransactionListResponse> => {
    const params: Record<string, unknown> = { administration_id: administrationId }
    if (options?.status) params.status = options.status
    if (options?.q) params.q = options.q
    if (options?.dateFrom) params.date_from = options.dateFrom
    if (options?.dateTo) params.date_to = options.dateTo
    if (options?.minAmount !== undefined) params.min_amount = options.minAmount
    if (options?.maxAmount !== undefined) params.max_amount = options.maxAmount
    if (options?.page) params.page = options.page
    if (options?.pageSize) params.page_size = options.pageSize
    const response = await api.get<BankTransactionListResponse>('/accountant/bank/transactions', { params })
    return response.data
  },

  suggestMatches: async (transactionId: string, administrationId: string): Promise<SuggestMatchResponse> => {
    const response = await api.post<SuggestMatchResponse>(
      `/accountant/bank/transactions/${transactionId}/suggest`,
      null,
      { params: { administration_id: administrationId } }
    )
    return response.data
  },

  applyAction: async (
    transactionId: string,
    administrationId: string,
    request: ApplyActionRequest
  ): Promise<ApplyActionResponse> => {
    const response = await api.post<ApplyActionResponse>(
      `/accountant/bank/transactions/${transactionId}/apply`,
      request,
      { params: { administration_id: administrationId } }
    )
    return response.data
  },

  listActions: async (
    administrationId: string,
    options?: { page?: number; pageSize?: number }
  ): Promise<ReconciliationActionsListResponse> => {
    const params: Record<string, unknown> = { administration_id: administrationId }
    if (options?.page) params.page = options.page
    if (options?.pageSize) params.page_size = options.pageSize
    const response = await api.get<ReconciliationActionsListResponse>('/accountant/bank/actions', { params })
    return response.data
  },
}

// ============ Metadata API ============

export interface VersionInfo {
  git_sha: string
  build_time: string
  env_name: string
}

export const metaApi = {
  /**
   * Get backend version information.
   * This endpoint is unauthenticated and can be used to verify deployment.
   */
  getVersion: async (): Promise<VersionInfo> => {
    const response = await api.get<VersionInfo>('/meta/version')
    return response.data
  },
}

// ============ ZZP API Types ============

// Customer Types (matching backend schemas)
export interface ZZPCustomer {
  id: string
  administration_id: string
  name: string
  email?: string
  phone?: string
  contact_person?: string
  address_street?: string
  address_line2?: string
  address_postal_code?: string
  address_city?: string
  address_country?: string
  kvk_number?: string
  btw_number?: string
  iban?: string
  bank_bic?: string
  notes?: string
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface ZZPCustomerCreate {
  name: string
  email?: string
  phone?: string
  contact_person?: string
  address_street?: string
  address_line2?: string
  address_postal_code?: string
  address_city?: string
  address_country?: string
  kvk_number?: string
  btw_number?: string
  iban?: string
  bank_bic?: string
  notes?: string
  status?: 'active' | 'inactive'
}

export interface ZZPCustomerUpdate extends Partial<ZZPCustomerCreate> {}

export interface ZZPCustomerListResponse {
  customers: ZZPCustomer[]
  total: number
}

// Business Profile Types
export interface ZZPBusinessProfile {
  id: string
  administration_id: string
  company_name: string
  default_hourly_rate?: string
  trading_name?: string
  address_street?: string
  address_postal_code?: string
  address_city?: string
  address_country?: string
  kvk_number?: string
  btw_number?: string
  iban?: string
  email?: string
  phone?: string
  website?: string
  logo_url?: string
  created_at: string
  updated_at: string
}

export interface ZZPBusinessProfileCreate {
  company_name: string
  trading_name?: string
  address_street?: string
  address_postal_code?: string
  address_city?: string
  address_country?: string
  kvk_number?: string
  btw_number?: string
  iban?: string
  email?: string
  phone?: string
  website?: string
  logo_url?: string
}

// Invoice Types
export interface ZZPInvoiceLine {
  id: string
  invoice_id: string
  line_number: number
  description: string
  quantity: number
  unit_price_cents: number
  vat_rate: number
  line_total_cents: number
  vat_amount_cents: number
  created_at: string
  updated_at: string
}

export interface ZZPInvoiceLineCreate {
  description: string
  quantity: number
  unit_price_cents: number
  vat_rate: number
}

export interface ZZPInvoice {
  id: string
  administration_id: string
  customer_id: string
  invoice_number: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  issue_date: string
  due_date?: string
  // Seller snapshot
  seller_company_name?: string
  seller_trading_name?: string
  seller_address_street?: string
  seller_address_postal_code?: string
  seller_address_city?: string
  seller_address_country?: string
  seller_kvk_number?: string
  seller_btw_number?: string
  seller_iban?: string
  seller_email?: string
  seller_phone?: string
  // Customer snapshot
  customer_name?: string
  customer_address_street?: string
  customer_address_postal_code?: string
  customer_address_city?: string
  customer_address_country?: string
  customer_kvk_number?: string
  customer_btw_number?: string
  // Totals
  subtotal_cents: number
  vat_total_cents: number
  total_cents: number
  amount_paid_cents: number
  // Payment timestamp
  paid_at?: string
  notes?: string
  lines: ZZPInvoiceLine[]
  created_at: string
  updated_at: string
}

export interface ZZPInvoiceCreate {
  customer_id: string
  issue_date: string
  due_date?: string
  notes?: string
  lines: ZZPInvoiceLineCreate[]
}

export interface ZZPInvoiceUpdate {
  customer_id?: string
  issue_date?: string
  due_date?: string
  notes?: string
  lines?: ZZPInvoiceLineCreate[]
}

export interface ZZPInvoiceListResponse {
  invoices: ZZPInvoice[]
  total: number
}

// Bank Account & Transaction Types
export interface ZZPBankAccount {
  id: string
  administration_id: string
  iban: string
  bank_name?: string
  currency: string
  created_at: string
}

export interface ZZPBankAccountListResponse {
  accounts: ZZPBankAccount[]
  total: number
}

export interface ZZPBankTransaction {
  id: string
  administration_id: string
  bank_account_id: string
  booking_date: string
  amount_cents: number
  currency: string
  counterparty_name?: string
  counterparty_iban?: string
  description: string
  reference?: string
  status: 'NEW' | 'MATCHED' | 'IGNORED' | 'NEEDS_REVIEW'
  matched_invoice_id?: string
  matched_invoice_number?: string
  created_at: string
}

export interface ZZPBankTransactionListResponse {
  transactions: ZZPBankTransaction[]
  total: number
  page: number
  page_size: number
}

export interface ZZPBankImportResponse {
  imported_count: number
  skipped_duplicates_count: number
  total_in_file: number
  errors: string[]
  message: string
  bank_account_id?: string
}

export interface ZZPInvoiceMatchSuggestion {
  invoice_id: string
  invoice_number: string
  customer_name?: string
  invoice_total_cents: number
  invoice_open_cents: number
  invoice_date: string
  confidence_score: number
  match_reason: string
}

export interface ZZPMatchSuggestionsResponse {
  transaction_id: string
  suggestions: ZZPInvoiceMatchSuggestion[]
  message: string
}

export interface ZZPMatchInvoiceRequest {
  invoice_id: string
  amount_cents?: number
  notes?: string
}

export interface ZZPMatchInvoiceResponse {
  transaction_id: string
  invoice_id: string
  invoice_number: string
  amount_matched_cents: number
  invoice_new_status: string
  invoice_amount_paid_cents: number
  invoice_total_cents: number
  message: string
}

export interface ZZPUnmatchResponse {
  transaction_id: string
  invoice_id: string
  invoice_number: string
  amount_unmatched_cents: number
  invoice_new_status: string
  invoice_amount_paid_cents: number
  message: string
}

export interface ZZPBankTransactionMatch {
  id: string
  bank_transaction_id: string
  invoice_id: string
  invoice_number: string
  amount_cents: number
  match_type: string
  confidence_score?: number
  notes?: string
  created_at: string
  user_id?: string
}

export interface ZZPBankTransactionMatchListResponse {
  matches: ZZPBankTransactionMatch[]
  total: number
}

// AI Insights Types
export type InsightType = 
  | 'invoice_overdue'
  | 'invoice_followup'
  | 'unbilled_hours'
  | 'btw_deadline'
  | 'missing_profile'
  | 'no_recent_activity'

export type InsightSeverity = 'action_needed' | 'suggestion' | 'info'

export interface InsightAction {
  type: string
  label: string
  route?: string
  params?: Record<string, string>
}

export interface ZZPInsight {
  id: string
  type: InsightType
  severity: InsightSeverity
  title: string
  description: string
  reason: string
  action?: InsightAction
  related_id?: string
  related_type?: string
  amount_cents?: number
  created_at: string
  dismissible: boolean
}

export interface ZZPInsightsResponse {
  insights: ZZPInsight[]
  total_action_needed: number
  total_suggestions: number
  generated_at: string
  ai_model_version: string
}

// ZZP Dashboard Types
export interface ZZPDashboardActionItem {
  id: string
  type: string  // 'draft_invoice', 'overdue_invoice', 'missing_profile', 'incomplete_profile', 'btw_deadline'
  title: string
  description: string
  severity: 'error' | 'warning' | 'info'
  route?: string
  related_id?: string
}

export interface ZZPDashboardInvoiceStats {
  open_count: number
  open_total_cents: number
  draft_count: number
  overdue_count: number
  overdue_total_cents: number
  paid_this_month_count: number
  paid_this_month_cents: number
}

export interface ZZPDashboardExpenseStats {
  this_month_count: number
  this_month_total_cents: number
  this_month_vat_cents: number
}

export interface ZZPDashboardTimeStats {
  this_week_hours: number
  this_week_billable_hours: number
  this_week_value_cents: number
}

export interface ZZPDashboardBTWStats {
  quarter: string
  quarter_start: string
  quarter_end: string
  deadline: string
  days_until_deadline: number
  vat_collected_cents: number
  vat_deductible_cents: number
  vat_payable_cents: number
}

export interface ZZPDashboardResponse {
  invoices: ZZPDashboardInvoiceStats
  expenses: ZZPDashboardExpenseStats
  time: ZZPDashboardTimeStats
  btw: ZZPDashboardBTWStats
  actions: ZZPDashboardActionItem[]
  profile_complete: boolean
  generated_at: string
  notes: Record<string, string>
}

// Quote (Offerte) Types
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'

export interface ZZPQuoteLine {
  id: string
  quote_id: string
  line_number: number
  description: string
  quantity: number
  unit_price_cents: number
  vat_rate: number
  vat_amount_cents: number
  line_total_cents: number
}

export interface ZZPQuoteLineCreate {
  description: string
  quantity: number
  unit_price_cents: number
  vat_rate: number
}

export interface ZZPQuote {
  id: string
  administration_id: string
  customer_id: string
  quote_number: string
  status: QuoteStatus
  issue_date: string
  valid_until?: string
  invoice_id?: string
  
  // Seller snapshot
  seller_company_name?: string
  seller_trading_name?: string
  seller_address_street?: string
  seller_address_postal_code?: string
  seller_address_city?: string
  seller_address_country?: string
  seller_kvk_number?: string
  seller_btw_number?: string
  seller_iban?: string
  seller_email?: string
  seller_phone?: string
  
  // Customer snapshot
  customer_name?: string
  customer_address_street?: string
  customer_address_postal_code?: string
  customer_address_city?: string
  customer_address_country?: string
  customer_kvk_number?: string
  customer_btw_number?: string
  
  // Totals
  subtotal_cents: number
  vat_total_cents: number
  total_cents: number
  
  // Content
  title?: string
  notes?: string
  terms?: string
  
  // Timestamps
  created_at: string
  updated_at: string
  
  // Lines
  lines: ZZPQuoteLine[]
}

export interface ZZPQuoteCreate {
  customer_id: string
  issue_date: string
  valid_until?: string
  title?: string
  notes?: string
  terms?: string
  lines: ZZPQuoteLineCreate[]
}

export interface ZZPQuoteUpdate {
  customer_id?: string
  issue_date?: string
  valid_until?: string
  title?: string
  notes?: string
  terms?: string
  lines?: ZZPQuoteLineCreate[]
}

export interface ZZPQuoteListResponse {
  quotes: ZZPQuote[]
  total: number
  total_amount_cents: number
  stats?: {
    draft: number
    sent: number
    accepted: number
    rejected: number
    expired: number
    converted: number
  }
}

export interface ZZPQuoteConvertResponse {
  quote: ZZPQuote
  invoice_id: string
  invoice_number: string
}

// Expense Types
export interface ZZPExpense {
  id: string
  administration_id: string
  vendor: string
  description?: string
  expense_date: string
  amount_cents: number
  vat_rate: number
  vat_amount_cents: number
  category: string
  notes?: string
  attachment_url?: string
  created_at: string
  updated_at: string
}

export interface ZZPExpenseCreate {
  vendor: string
  description?: string
  expense_date: string
  amount_cents: number
  vat_rate: number
  category: string
  notes?: string
  attachment_url?: string
}

export interface ZZPExpenseUpdate extends Partial<ZZPExpenseCreate> {}

export interface ZZPExpenseListResponse {
  expenses: ZZPExpense[]
  total: number
  total_amount_cents: number
  total_vat_cents: number
}

// Time Entry Types
export interface ZZPTimeEntry {
  id: string
  administration_id: string
  user_id?: string
  entry_date: string
  description: string
  hours: number | string
  project_name?: string
  customer_id?: string
  project_id?: string
  hourly_rate?: number | string
  hourly_rate_cents?: number
  billable: boolean
  invoice_id?: string
  is_invoiced: boolean
  created_at: string
  updated_at: string
}

export interface ZZPTimeEntryCreate {
  entry_date: string
  description: string
  hours: number | string
  project_name?: string
  customer_id?: string
  project_id?: string
  hourly_rate?: number | string
  billable: boolean
}

export interface ZZPTimeEntryUpdate extends Partial<ZZPTimeEntryCreate> {}

export interface ZZPTimeEntryMutationResponse {
  entry: ZZPTimeEntry | null
  status: number
}

export interface ZZPTimeEntryListResponse {
  entries: ZZPTimeEntry[]
  total: number
  total_hours: number
  total_billable_hours: number
}

export interface ZZPWeeklyTimeSummary {
  week_start: string
  week_end: string
  total_hours: number
  billable_hours: number
  entries_by_day: Record<string, number>
}

export interface ZZPTimeEntryInvoiceCreate {
  customer_id: string
  period_start: string
  period_end: string
  hourly_rate?: number | string
}

export interface ZZPWeeklyInvoiceCreateResponse {
  invoice_id: string
  invoice_number: string
  total_hours: number | string
  rate: number | string
  total_amount: number | string
}

// Calendar Event Types
export interface ZZPCalendarEvent {
  id: string
  administration_id: string
  title: string
  start_datetime: string
  end_datetime: string
  location?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface ZZPCalendarEventCreate {
  title: string
  start_datetime: string
  end_datetime: string
  location?: string
  notes?: string
}

export interface ZZPCalendarEventUpdate extends Partial<ZZPCalendarEventCreate> {}

export interface ZZPCalendarEventListResponse {
  events: ZZPCalendarEvent[]
  total: number
}

// Work Session Types (Clock-in/out)
export interface WorkSession {
  id: string
  user_id: string
  administration_id: string
  started_at: string
  ended_at?: string | null
  break_minutes: number
  note?: string | null
  time_entry_id?: string | null
  created_at: string
  updated_at: string
  duration_seconds?: number | null
}

export interface WorkSessionStart {
  note?: string
}

export interface WorkSessionStop {
  break_minutes?: number
  note?: string
}

export interface WorkSessionStopResponse {
  session: WorkSession
  time_entry: ZZPTimeEntry
  hours_added: number
  message: string
}

// ============ ZZP API Functions ============

export const zzpApi = {
  // ------------ Customers ------------
  customers: {
    list: async (options?: { status?: string; search?: string }): Promise<ZZPCustomerListResponse> => {
      const params: Record<string, string> = {}
      if (options?.status) params.status = options.status
      if (options?.search) params.search = options.search
      const response = await api.get<ZZPCustomerListResponse>('/zzp/customers', { params })
      return response.data
    },

    get: async (customerId: string): Promise<ZZPCustomer> => {
      const response = await api.get<ZZPCustomer>(`/zzp/customers/${customerId}`)
      return response.data
    },

    create: async (data: ZZPCustomerCreate): Promise<ZZPCustomer> => {
      const response = await api.post<ZZPCustomer>('/zzp/customers', data)
      return response.data
    },

    update: async (customerId: string, data: ZZPCustomerUpdate): Promise<ZZPCustomer> => {
      const response = await api.put<ZZPCustomer>(`/zzp/customers/${customerId}`, data)
      return response.data
    },

    delete: async (customerId: string): Promise<void> => {
      await api.delete(`/zzp/customers/${customerId}`)
    },
  },

  // ------------ Business Profile ------------
  profile: {
    get: async (): Promise<ZZPBusinessProfile> => {
      const response = await api.get<ZZPBusinessProfile>('/zzp/profile')
      return response.data
    },

    upsert: async (data: ZZPBusinessProfileCreate): Promise<ZZPBusinessProfile> => {
      const response = await api.put<ZZPBusinessProfile>('/zzp/profile', data)
      return response.data
    },

    update: async (data: Partial<ZZPBusinessProfileCreate>): Promise<ZZPBusinessProfile> => {
      const response = await api.patch<ZZPBusinessProfile>('/zzp/profile', data)
      return response.data
    },
  },

  // ------------ Invoices ------------
  invoices: {
    list: async (options?: {
      status?: string
      customer_id?: string
      from_date?: string
      to_date?: string
    }): Promise<ZZPInvoiceListResponse> => {
      const params: Record<string, string> = {}
      if (options?.status) params.status = options.status
      if (options?.customer_id) params.customer_id = options.customer_id
      if (options?.from_date) params.from_date = options.from_date
      if (options?.to_date) params.to_date = options.to_date
      const response = await api.get<ZZPInvoiceListResponse>('/zzp/invoices', { params })
      return response.data
    },

    get: async (invoiceId: string): Promise<ZZPInvoice> => {
      const response = await api.get<ZZPInvoice>(`/zzp/invoices/${invoiceId}`)
      return response.data
    },

    create: async (data: ZZPInvoiceCreate): Promise<ZZPInvoice> => {
      const response = await api.post<ZZPInvoice>('/zzp/invoices', data)
      return response.data
    },

    update: async (invoiceId: string, data: ZZPInvoiceUpdate): Promise<ZZPInvoice> => {
      const response = await api.put<ZZPInvoice>(`/zzp/invoices/${invoiceId}`, data)
      return response.data
    },

    updateStatus: async (invoiceId: string, status: 'sent' | 'paid' | 'cancelled'): Promise<ZZPInvoice> => {
      const response = await api.patch<ZZPInvoice>(`/zzp/invoices/${invoiceId}/status`, { status })
      return response.data
    },

    delete: async (invoiceId: string): Promise<void> => {
      await api.delete(`/zzp/invoices/${invoiceId}`)
    },

    /**
     * Download invoice as PDF.
     * Returns a Blob that can be used for download or preview.
     */
    downloadPdf: async (invoiceId: string): Promise<Blob> => {
      const response = await api.get(`/zzp/invoices/${invoiceId}/pdf`, {
        responseType: 'blob',
      })
      return response.data as Blob
    },

    /**
     * Get the invoice PDF URL for direct download.
     * This returns a URL that can be used in an anchor tag or window.open.
     */
    getPdfUrl: (invoiceId: string): string => {
      return `${api.defaults.baseURL}/zzp/invoices/${invoiceId}/pdf`
    },
    
    /**
     * Mark an invoice as paid by creating a payment record.
     */
    markPaid: async (
      invoiceId: string, 
      data?: { 
        payment_date?: string
        payment_method?: string
        reference?: string
        notes?: string 
      }
    ): Promise<void> => {
      await api.post(`/zzp/payments/invoices/${invoiceId}/mark-paid`, data || {})
    },
    
    /**
     * Mark an invoice as unpaid by removing payment allocations.
     */
    markUnpaid: async (invoiceId: string): Promise<void> => {
      await api.post(`/zzp/payments/invoices/${invoiceId}/mark-unpaid`)
    },
    
    /**
     * Send invoice via email to the customer.
     * Generates PDF and emails it to the customer's email address.
     * Updates invoice status to 'sent'.
     */
    sendEmail: async (invoiceId: string): Promise<ZZPInvoice> => {
      const response = await api.post<ZZPInvoice>(`/zzp/invoices/${invoiceId}/send`)
      return response.data
    },
  },

  // ------------ Expenses ------------
  expenses: {
    list: async (options?: {
      category?: string
      year?: number
      month?: number
      from_date?: string
      to_date?: string
    }): Promise<ZZPExpenseListResponse> => {
      const params: Record<string, string | number> = {}
      if (options?.category) params.category = options.category
      if (options?.year) params.year = options.year
      if (options?.month) params.month = options.month
      if (options?.from_date) params.from_date = options.from_date
      if (options?.to_date) params.to_date = options.to_date
      const response = await api.get<ZZPExpenseListResponse>('/zzp/expenses', { params })
      return response.data
    },

    get: async (expenseId: string): Promise<ZZPExpense> => {
      const response = await api.get<ZZPExpense>(`/zzp/expenses/${expenseId}`)
      return response.data
    },

    create: async (data: ZZPExpenseCreate): Promise<ZZPExpense> => {
      const response = await api.post<ZZPExpense>('/zzp/expenses', data)
      return response.data
    },

    update: async (expenseId: string, data: ZZPExpenseUpdate): Promise<ZZPExpense> => {
      const response = await api.put<ZZPExpense>(`/zzp/expenses/${expenseId}`, data)
      return response.data
    },

    delete: async (expenseId: string): Promise<void> => {
      await api.delete(`/zzp/expenses/${expenseId}`)
    },

    getCategories: async (): Promise<{ categories: string[] }> => {
      const response = await api.get<{ categories: string[] }>('/zzp/expenses/categories/list')
      return response.data
    },
    
    /**
     * Scan a receipt and extract expense data.
     * Returns extracted data that can be used to prefill the expense form.
     */
    scanReceipt: async (file: File): Promise<{
      extracted_data: ZZPExpenseCreate
      confidence: number
      status: string
      message: string
    }> => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/zzp/expenses/scan', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    },
  },

  // ------------ Time Entries ------------
  timeEntries: {
    list: async (options?: {
      customer_id?: string
      period_start?: string
      period_end?: string
    }): Promise<ZZPTimeEntryListResponse> => {
      const params: Record<string, string> = {}
      if (options?.customer_id) params.customer_id = options.customer_id
      if (options?.period_start) params.period_start = options.period_start
      if (options?.period_end) params.period_end = options.period_end
      const response = await api.get<ZZPTimeEntryListResponse>('/zzp/time-entries', { params })
      return response.data
    },

    listOpen: async (options?: {
      customer_id?: string
      period_start?: string
      period_end?: string
    }): Promise<ZZPTimeEntry[]> => {
      const params: Record<string, string> = {}
      if (options?.customer_id) params.customer_id = options.customer_id
      if (options?.period_start) params.period_start = options.period_start
      if (options?.period_end) params.period_end = options.period_end
      const response = await api.get<ZZPTimeEntry[]>('/zzp/time-entries/open', { params })
      return response.data
    },

    listInvoiced: async (options?: {
      customer_id?: string
      period_start?: string
      period_end?: string
    }): Promise<ZZPTimeEntry[]> => {
      const params: Record<string, string> = {}
      if (options?.customer_id) params.customer_id = options.customer_id
      if (options?.period_start) params.period_start = options.period_start
      if (options?.period_end) params.period_end = options.period_end
      const response = await api.get<ZZPTimeEntry[]>('/zzp/time-entries/invoiced', { params })
      return response.data
    },

    create: async (data: ZZPTimeEntryCreate): Promise<ZZPTimeEntry> => {
      const response = await api.post<ZZPTimeEntry>('/zzp/time-entries', data)
      return response.data
    },

    update: async (entryId: string, data: ZZPTimeEntryUpdate): Promise<ZZPTimeEntryMutationResponse> => {
      const response = await api.patch<ZZPTimeEntry>(`/zzp/time-entries/${entryId}`, data)
      return {
        entry: response.data ?? null,
        status: response.status,
      }
    },

    delete: async (entryId: string): Promise<void> => {
      await api.delete(`/zzp/time-entries/${entryId}`)
    },

    invoiceWeek: async (data: ZZPTimeEntryInvoiceCreate): Promise<ZZPWeeklyInvoiceCreateResponse> => {
      const response = await api.post<ZZPWeeklyInvoiceCreateResponse>('/zzp/time-entries/invoice-week', data)
      return response.data
    },

    generateInvoice: async (data: ZZPTimeEntryInvoiceCreate): Promise<ZZPWeeklyInvoiceCreateResponse> => {
      const response = await api.post<ZZPWeeklyInvoiceCreateResponse>('/zzp/time-entries/invoice-week', data)
      return response.data
    },
  },

  // ------------ Work Sessions (Clock-in/out) ------------
  workSessions: {
    /**
     * Get the currently active work session.
     * Returns null if no active session exists.
     */
    getActive: async (): Promise<WorkSession | null> => {
      const response = await api.get<WorkSession | null>('/zzp/work-sessions/active')
      return response.data
    },

    /**
     * Start a new work session (clock-in).
     * Only one active session per user is allowed.
     */
    start: async (data?: WorkSessionStart): Promise<WorkSession> => {
      const response = await api.post<WorkSession>('/zzp/work-sessions/start', data || {})
      return response.data
    },

    /**
     * Stop the active work session (clock-out).
     * Creates a time entry with the calculated duration.
     */
    stop: async (data?: WorkSessionStop): Promise<WorkSessionStopResponse> => {
      const response = await api.post<WorkSessionStopResponse>('/zzp/work-sessions/stop', data || {})
      return response.data
    },
  },

  // ------------ Calendar Events ------------
  calendarEvents: {
    list: async (options?: {
      year?: number
      month?: number
      from_date?: string
      to_date?: string
    }): Promise<ZZPCalendarEventListResponse> => {
      const params: Record<string, string | number> = {}
      if (options?.year) params.year = options.year
      if (options?.month) params.month = options.month
      if (options?.from_date) params.from_date = options.from_date
      if (options?.to_date) params.to_date = options.to_date
      const response = await api.get<ZZPCalendarEventListResponse>('/zzp/calendar-events', { params })
      return response.data
    },

    get: async (eventId: string): Promise<ZZPCalendarEvent> => {
      const response = await api.get<ZZPCalendarEvent>(`/zzp/calendar-events/${eventId}`)
      return response.data
    },

    create: async (data: ZZPCalendarEventCreate): Promise<ZZPCalendarEvent> => {
      const response = await api.post<ZZPCalendarEvent>('/zzp/calendar-events', data)
      return response.data
    },

    update: async (eventId: string, data: ZZPCalendarEventUpdate): Promise<ZZPCalendarEvent> => {
      const response = await api.put<ZZPCalendarEvent>(`/zzp/calendar-events/${eventId}`, data)
      return response.data
    },

    delete: async (eventId: string): Promise<void> => {
      await api.delete(`/zzp/calendar-events/${eventId}`)
    },
  },

  // ------------ Bank & Payments ------------
  bank: {
    /** List all bank accounts */
    listAccounts: async (): Promise<ZZPBankAccountListResponse> => {
      const response = await api.get<ZZPBankAccountListResponse>('/zzp/bank/accounts')
      return response.data
    },

    /** Import bank transactions from CSV */
    importTransactions: async (
      file: File,
      bankAccountIban?: string,
      bankName?: string
    ): Promise<ZZPBankImportResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      if (bankAccountIban) formData.append('bank_account_iban', bankAccountIban)
      if (bankName) formData.append('bank_name', bankName)
      
      const response = await api.post<ZZPBankImportResponse>('/zzp/bank/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    },

    /** List bank transactions with filters */
    listTransactions: async (options?: {
      status?: 'NEW' | 'MATCHED' | 'IGNORED' | 'NEEDS_REVIEW'
      bank_account_id?: string
      date_from?: string
      date_to?: string
      q?: string
      page?: number
      page_size?: number
    }): Promise<ZZPBankTransactionListResponse> => {
      const params: Record<string, string | number> = {}
      if (options?.status) params.status = options.status
      if (options?.bank_account_id) params.bank_account_id = options.bank_account_id
      if (options?.date_from) params.date_from = options.date_from
      if (options?.date_to) params.date_to = options.date_to
      if (options?.q) params.q = options.q
      if (options?.page) params.page = options.page
      if (options?.page_size) params.page_size = options.page_size
      
      const response = await api.get<ZZPBankTransactionListResponse>('/zzp/bank/transactions', { params })
      return response.data
    },

    /** Get match suggestions for a transaction */
    getSuggestions: async (transactionId: string): Promise<ZZPMatchSuggestionsResponse> => {
      const response = await api.get<ZZPMatchSuggestionsResponse>(
        `/zzp/bank/transactions/${transactionId}/suggestions`
      )
      return response.data
    },

    /** Match a transaction to an invoice */
    matchToInvoice: async (
      transactionId: string,
      data: ZZPMatchInvoiceRequest
    ): Promise<ZZPMatchInvoiceResponse> => {
      const response = await api.post<ZZPMatchInvoiceResponse>(
        `/zzp/bank/transactions/${transactionId}/match`,
        data
      )
      return response.data
    },

    /** Unmatch a transaction from its invoice */
    unmatch: async (transactionId: string): Promise<ZZPUnmatchResponse> => {
      const response = await api.post<ZZPUnmatchResponse>(
        `/zzp/bank/transactions/${transactionId}/unmatch`
      )
      return response.data
    },

    /** List all matches (audit trail) */
    listMatches: async (invoiceId?: string): Promise<ZZPBankTransactionMatchListResponse> => {
      const params: Record<string, string> = {}
      if (invoiceId) params.invoice_id = invoiceId
      
      const response = await api.get<ZZPBankTransactionMatchListResponse>('/zzp/bank/matches', { params })
      return response.data
    },
  },

  // ------------ AI Insights ------------
  insights: {
    /**
     * Get AI-generated insights for the ZZP user.
     * 
     * Returns actionable insights like:
     * - Overdue invoices needing follow-up
     * - Unbilled hours that could be invoiced
     * - BTW deadline reminders
     * - Missing profile data
     * 
     * All insights include an explanation of WHY they were generated.
     */
    get: async (): Promise<ZZPInsightsResponse> => {
      const response = await api.get<ZZPInsightsResponse>('/zzp/insights')
      return response.data
    },
  },

  // ------------ Dashboard (Overzicht) ------------
  dashboard: {
    /**
     * Get aggregated dashboard metrics for the ZZP user.
     * 
     * Returns:
     * - Open invoices (sent/overdue) total + count
     * - Paid invoices this month
     * - Expenses this month
     * - Hours this week (total and billable)
     * - BTW estimate for current quarter
     * - Actions requiring attention
     */
    get: async (): Promise<ZZPDashboardResponse> => {
      const response = await api.get<ZZPDashboardResponse>('/zzp/dashboard')
      return response.data
    },
  },

  // ------------ Quotes (Offertes) ------------
  quotes: {
    /** List all quotes */
    list: async (options?: {
      status?: QuoteStatus
      customer_id?: string
      from_date?: string
      to_date?: string
    }): Promise<ZZPQuoteListResponse> => {
      const params: Record<string, string> = {}
      if (options?.status) params.status = options.status
      if (options?.customer_id) params.customer_id = options.customer_id
      if (options?.from_date) params.from_date = options.from_date
      if (options?.to_date) params.to_date = options.to_date
      const response = await api.get<ZZPQuoteListResponse>('/zzp/quotes', { params })
      return response.data
    },

    /** Get a specific quote */
    get: async (quoteId: string): Promise<ZZPQuote> => {
      const response = await api.get<ZZPQuote>(`/zzp/quotes/${quoteId}`)
      return response.data
    },

    /** Create a new quote */
    create: async (data: ZZPQuoteCreate): Promise<ZZPQuote> => {
      const response = await api.post<ZZPQuote>('/zzp/quotes', data)
      return response.data
    },

    /** Update a quote */
    update: async (quoteId: string, data: ZZPQuoteUpdate): Promise<ZZPQuote> => {
      const response = await api.put<ZZPQuote>(`/zzp/quotes/${quoteId}`, data)
      return response.data
    },

    /** Update quote status */
    updateStatus: async (quoteId: string, status: QuoteStatus): Promise<ZZPQuote> => {
      const response = await api.patch<ZZPQuote>(`/zzp/quotes/${quoteId}/status`, { status })
      return response.data
    },

    /** Convert quote to invoice */
    convertToInvoice: async (quoteId: string): Promise<ZZPQuoteConvertResponse> => {
      const response = await api.post<ZZPQuoteConvertResponse>(`/zzp/quotes/${quoteId}/convert`)
      return response.data
    },

    /** Delete a quote (draft only) */
    delete: async (quoteId: string): Promise<void> => {
      await api.delete(`/zzp/quotes/${quoteId}`)
    },
  },

  // ------------ Links / Consent (from zzpConsentApi) ------------
  ...zzpConsentApi,
}


export interface AdminOverview {
  users_count: number
  administrations_count: number
  active_subscriptions_count: number
  mrr_estimate: number
  invoices_last_30_days: number
}

export interface AdminCompanyRow {
  id: string
  name: string
  owner_email: string | null
  plan: string | null
  subscription_status: 'trial' | 'active' | 'past_due' | 'canceled' | null
  created_at: string
  last_activity: string | null
}

export interface AdminUserRow {
  id: string
  email: string
  full_name: string
  role: 'zzp' | 'accountant' | 'admin' | 'super_admin'
  is_active: boolean
  last_login_at: string | null
  administration_membership_count: number
}

export const adminApi = {
  getOverview: async (): Promise<AdminOverview> => {
    const response = await api.get('/admin/overview')
    return response.data
  },
  getAdministrations: async (params?: { query?: string; status?: string; plan?: string }): Promise<{ administrations: AdminCompanyRow[]; total: number }> => {
    const response = await api.get('/admin/administrations', { params })
    return response.data
  },
  getUsers: async (params?: { query?: string; role?: string }): Promise<{ users: AdminUserRow[]; total: number }> => {
    const response = await api.get('/admin/users', { params })
    return response.data
  },
  updateUserStatus: async (userId: string, is_active: boolean): Promise<{ message: string }> => {
    const response = await api.patch(`/admin/users/${userId}/status`, { is_active })
    return response.data
  },
  updateAdministrationSubscription: async (administrationId: string, payload: { plan_id?: string; status?: string; starts_at?: string; ends_at?: string | null }): Promise<{ message: string }> => {
    const response = await api.patch(`/admin/administrations/${administrationId}/subscription`, payload)
    return response.data
  },
  impersonate: async (userId: string): Promise<{ access_token: string; token_type: string; impersonated_user_id: string }> => {
    const response = await api.post(`/admin/impersonate/${userId}`)
    return response.data
  },
}
