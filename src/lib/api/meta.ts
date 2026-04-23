// ============ Metadata API ============
// Extracted from src/lib/api.ts as part of the api.ts decomposition.
// Behavior, endpoints, and response shapes are unchanged.

import { api } from '../api'

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
