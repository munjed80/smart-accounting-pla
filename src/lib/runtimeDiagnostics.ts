export interface RuntimeErrorPayload {
  source: 'window.onerror' | 'window.unhandledrejection' | 'error-boundary'
  message: string
  stack?: string
  url: string
  userAgent: string
  timestamp: string
  extra?: Record<string, unknown>
}

const RUNTIME_ERROR_ENDPOINT = import.meta.env.VITE_RUNTIME_ERROR_ENDPOINT as string | undefined

export const reportRuntimeError = async (payload: RuntimeErrorPayload): Promise<void> => {
  console.error('[RuntimeDiagnostics]', payload)

  if (!RUNTIME_ERROR_ENDPOINT) {
    return
  }

  try {
    await fetch(RUNTIME_ERROR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch (reportError) {
    console.error('[RuntimeDiagnostics] Failed to send error payload', reportError)
  }
}
