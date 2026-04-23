// ============ Certificate Management API ============
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

export interface CertificateResponse {
  id: string
  administration_id: string
  type: string
  storage_ref: string
  has_passphrase: boolean
  fingerprint: string
  subject: string
  issuer: string
  serial_number: string
  valid_from: string
  valid_to: string
  friendly_name: string | null
  purpose: string | null
  created_at: string
  created_by: string
  updated_at: string
  is_active: boolean
  is_valid: boolean
  days_until_expiry: number
}

export interface CertificateListResponse {
  certificates: CertificateResponse[]
  total: number
}

export interface CertificateRegisterRequest {
  type: string
  storage_ref: string
  passphrase_ref?: string
  friendly_name?: string
  purpose?: string
}

export interface CertificateRegisterResponse {
  certificate: CertificateResponse
  message: string
}

export interface CertificateDeleteResponse {
  message: string
}

export const certificateApi = {
  list: async (
    clientId: string,
    includeExpired?: boolean
  ): Promise<CertificateListResponse> => {
    const params: Record<string, unknown> = {}
    if (includeExpired) params.include_expired = includeExpired
    const response = await api.get<CertificateListResponse>(
      `/accountant/clients/${clientId}/certificates`,
      { params }
    )
    return response.data
  },

  get: async (clientId: string, certificateId: string): Promise<CertificateResponse> => {
    const response = await api.get<CertificateResponse>(
      `/accountant/clients/${clientId}/certificates/${certificateId}`
    )
    return response.data
  },

  register: async (
    clientId: string,
    request: CertificateRegisterRequest
  ): Promise<CertificateRegisterResponse> => {
    const response = await api.post<CertificateRegisterResponse>(
      `/accountant/clients/${clientId}/certificates/register`,
      request
    )
    return response.data
  },

  delete: async (clientId: string, certificateId: string): Promise<CertificateDeleteResponse> => {
    const response = await api.delete<CertificateDeleteResponse>(
      `/accountant/clients/${clientId}/certificates/${certificateId}`
    )
    return response.data
  },
}
