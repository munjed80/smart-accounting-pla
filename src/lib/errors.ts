/**
 * Custom Error Classes
 * 
 * Typed errors for better error handling and user experience.
 * Different error types can be handled differently in error boundaries.
 */

/**
 * NotFoundError - Resource not found (404)
 * Use for API 404 responses or missing data
 */
export class NotFoundError extends Error {
  constructor(message: string = 'Resource not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

/**
 * NetworkError - Network/connection issues
 * Use for connection refused, timeouts, CORS errors
 */
export class NetworkError extends Error {
  constructor(message: string = 'Network error occurred') {
    super(message)
    this.name = 'NetworkError'
  }
}

/**
 * UnauthorizedError - Authentication/authorization failures (401/403)
 * Use for missing tokens, expired sessions, insufficient permissions
 */
export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized access') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * ValidationError - Data validation failures (400)
 * Use for invalid input, schema validation errors
 */
export class ValidationError extends Error {
  constructor(message: string = 'Validation failed') {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * ServerError - Server-side errors (500+)
 * Use for internal server errors, database errors
 */
export class ServerError extends Error {
  constructor(message: string = 'Server error occurred') {
    super(message)
    this.name = 'ServerError'
  }
}

/**
 * Helper to check if an error is recoverable (non-fatal)
 * Recoverable errors should show inline error states, not full-screen overlays
 */
export function isRecoverableError(error: Error): boolean {
  return (
    error instanceof NotFoundError ||
    error instanceof NetworkError ||
    error instanceof ValidationError
  )
}

/**
 * Helper to check if an error requires re-authentication
 */
export function requiresReauth(error: Error): boolean {
  return error instanceof UnauthorizedError
}
