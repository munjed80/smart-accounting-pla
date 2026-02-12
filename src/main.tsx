import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

// Global error handlers to catch unhandled errors and promise rejections
// These log errors without crashing the app
window.addEventListener('error', (event) => {
  console.error('[Global Error Handler]', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack,
  })
  // Prevent default behavior (console error) for cleaner logging
  // But don't prevent error boundaries from catching it
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', {
    reason: event.reason,
    promise: event.promise,
    stack: event.reason?.stack,
  })
  // Log but don't prevent propagation - let error boundaries handle it
})

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <App />
   </ErrorBoundary>
)
