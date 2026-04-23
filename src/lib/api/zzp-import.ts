// ============================================================================
// ZZP CSV Import API
// ============================================================================
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

export interface ImportRowError {
  row: number
  field: string
  message: string
}

export interface ImportPreviewRow {
  row_number: number
  data: Record<string, unknown>
  errors: ImportRowError[]
  valid: boolean
}

export interface CustomerImportPreviewResponse {
  preview_rows: ImportPreviewRow[]
  total_rows: number
  valid_rows: number
  error_rows: number
  errors: ImportRowError[]
  all_rows: Record<string, unknown>[]
}

export interface CustomerImportConfirmResponse {
  imported_count: number
  skipped_count: number
  total_count: number
  errors: ImportRowError[]
  message: string
}

export interface InvoiceImportPreviewResponse {
  preview_rows: ImportPreviewRow[]
  total_rows: number
  valid_rows: number
  error_rows: number
  errors: ImportRowError[]
  all_rows: Record<string, unknown>[]
}

export interface InvoiceImportConfirmResponse {
  imported_count: number
  skipped_count: number
  total_count: number
  errors: ImportRowError[]
  message: string
}

export interface ExpenseImportPreviewResponse {
  preview_rows: ImportPreviewRow[]
  total_rows: number
  valid_rows: number
  error_rows: number
  errors: ImportRowError[]
  all_rows: Record<string, unknown>[]
}

export interface ExpenseImportConfirmResponse {
  imported_count: number
  skipped_count: number
  total_count: number
  errors: ImportRowError[]
  message: string
}

export const zzpImportApi = {
  customers: {
    preview: async (file: File): Promise<CustomerImportPreviewResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post<CustomerImportPreviewResponse>('/zzp/import/customers', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    },
    confirm: async (file: File): Promise<CustomerImportConfirmResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post<CustomerImportConfirmResponse>('/zzp/import/customers/confirm', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    },
  },
  invoices: {
    preview: async (file: File): Promise<InvoiceImportPreviewResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post<InvoiceImportPreviewResponse>('/zzp/import/invoices', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    },
    confirm: async (file: File): Promise<InvoiceImportConfirmResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post<InvoiceImportConfirmResponse>('/zzp/import/invoices/confirm', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    },
  },
  expenses: {
    preview: async (file: File): Promise<ExpenseImportPreviewResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post<ExpenseImportPreviewResponse>('/zzp/import/expenses', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    },
    confirm: async (file: File): Promise<ExpenseImportConfirmResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post<ExpenseImportConfirmResponse>('/zzp/import/expenses/confirm', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    },
  },
}
