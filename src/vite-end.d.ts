/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_ENABLE_PWA?: string
  readonly VITE_BUILD_TIMESTAMP?: string
  readonly VITE_GIT_COMMIT?: string
  readonly VITE_PWA_BG_SYNC?: string
  readonly VITE_PWA_PUSH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const GITHUB_RUNTIME_PERMANENT_NAME: string
declare const BASE_KV_SERVICE_URL: string