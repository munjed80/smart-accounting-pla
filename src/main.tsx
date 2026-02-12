import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import { reportRuntimeError } from './lib/runtimeDiagnostics.ts'

import './main.css'
import './styles/theme.css'
import './index.css'

window.addEventListener('error', (event) => {
  void reportRuntimeError({
    source: 'window.onerror',
    message: event.message || 'Unknown window error',
    stack: event.error?.stack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    extra: {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { message?: string; stack?: string } | string | undefined
  const message = typeof reason === 'string' ? reason : reason?.message || 'Unhandled promise rejection'

  void reportRuntimeError({
    source: 'window.unhandledrejection',
    message,
    stack: typeof reason === 'string' ? undefined : reason?.stack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  })
})

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <App />
  </ErrorBoundary>,
)
