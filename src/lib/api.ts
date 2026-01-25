import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      
      window.location.href = '/login'
      
      return Promise.reject(error)
    }

    return Promise.reject(error)
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
  role?: 'zzp' | 'accountant' | 'admin'
}

export interface User {
  id: string
  email: string
  full_name: string
  role: 'zzp' | 'accountant' | 'admin'
  is_active: boolean
}

export interface TokenResponse {
  access_token: string
  token_type: string
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
  status: 'draft' | 'posted' | 'reconciled' | 'void'
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
  status: 'draft' | 'posted' | 'reconciled' | 'void'
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
  status: 'draft' | 'posted' | 'reconciled' | 'void'
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

    const response = await api.post<TokenResponse>('/token', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    return response.data
  },

  register: async (data: RegisterRequest): Promise<User> => {
    const response = await api.post<User>('/api/v1/auth/register', data)
    return response.data
  },

  me: async (): Promise<User> => {
    const response = await api.get<User>('/api/v1/auth/me')
    return response.data
  },
}

export const transactionApi = {
  getStats: async (): Promise<TransactionStats> => {
    const response = await api.get<TransactionStats>('/api/v1/transactions/stats')
    return response.data
  },

  getAll: async (status?: 'draft' | 'posted' | 'reconciled' | 'void'): Promise<TransactionListItem[]> => {
    const params = status ? { status } : {}
    const response = await api.get<TransactionListItem[]>('/api/v1/transactions', { params })
    return response.data
  },

  getById: async (id: string): Promise<Transaction> => {
    const response = await api.get<Transaction>(`/api/v1/transactions/${id}`)
    return response.data
  },

  update: async (id: string, data: TransactionUpdateRequest): Promise<Transaction> => {
    const response = await api.put<Transaction>(`/api/v1/transactions/${id}`, data)
    return response.data
  },

  approve: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/api/v1/transactions/${id}/approve`)
    return response.data
  },

  reject: async (id: string): Promise<Transaction> => {
    const response = await api.post<Transaction>(`/api/v1/transactions/${id}/reject`)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/transactions/${id}`)
  },
}

export const documentApi = {
  upload: async (file: File, administrationId?: string): Promise<{ message: string; document_id: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    if (administrationId) {
      formData.append('administration_id', administrationId)
    }

    const response = await api.post<{ message: string; document_id: string }>(
      '/api/v1/documents/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return response.data
  },
}

export interface ApiError {
  message: string
  detail?: string
  status?: number
}

export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.detail) {
      return typeof error.response.data.detail === 'string' 
        ? error.response.data.detail 
        : JSON.stringify(error.response.data.detail)
    }
    if (error.message === 'Network Error') {
      return 'Cannot connect to server. Please ensure the backend is running at ' + API_BASE_URL
    }
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred'
}
