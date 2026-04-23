// ============================================================================
// Public Contact Form API
// ============================================================================
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

export const publicContactApi = {
  submit: async (payload: {
    name?: string
    email: string
    subject?: string
    message: string
    page_url?: string
  }): Promise<{ ok: boolean }> => {
    const response = await api.post('/public/contact', payload)
    return response.data
  },
}
