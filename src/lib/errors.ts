/**
 * Custom Error Classes
 * 
 * Typed errors for better error handling and user experience.
 * Different error types can be handled differently in error boundaries.
 */

interface HttpErrorMetadata {
  statusCode?: number
  correlationId?: string
  errorCode?: string
}

export class ApiHttpError extends Error {
  statusCode?: number
  correlationId?: string
  errorCode?: string

  constructor(message: string, metadata: HttpErrorMetadata = {}) {
    super(message)
    this.name = 'ApiHttpError'
    this.statusCode = metadata.statusCode
    this.correlationId = metadata.correlationId
    this.errorCode = metadata.errorCode
  }
}

/**
 * NotFoundError - Resource not found (404)
 * Use for API 404 responses or missing data
 */
export class NotFoundError extends ApiHttpError {
  constructor(message: string = 'Resource not found', metadata: HttpErrorMetadata = {}) {
    super(message, metadata)
    this.name = 'NotFoundError'
  }
}

/**
 * NetworkError - Network/connection issues
 * Use for connection refused, timeouts, CORS errors
 */
export class NetworkError extends ApiHttpError {
  constructor(message: string = 'Network error occurred', metadata: HttpErrorMetadata = {}) {
    super(message, metadata)
    this.name = 'NetworkError'
  }
}

/**
 * UnauthorizedError - Authentication/authorization failures (401/403)
 * Use for missing tokens, expired sessions, insufficient permissions
 */
export class UnauthorizedError extends ApiHttpError {
  constructor(message: string = 'Unauthorized access', metadata: HttpErrorMetadata = {}) {
    super(message, metadata)
    this.name = 'UnauthorizedError'
  }
}

/**
 * ValidationError - Data validation failures (400)
 * Use for invalid input, schema validation errors
 */
export class ValidationError extends ApiHttpError {
  constructor(message: string = 'Validation failed', metadata: HttpErrorMetadata = {}) {
    super(message, metadata)
    this.name = 'ValidationError'
  }
}

/**
 * ServerError - Server-side errors (500+)
 * Use for internal server errors, database errors
 */
export class ServerError extends ApiHttpError {
  constructor(message: string = 'Server error occurred', metadata: HttpErrorMetadata = {}) {
    super(message, metadata)
    this.name = 'ServerError'
  }
}

/**
 * PaymentRequiredError - Subscription/payment required (402)
 * Use for feature gating, subscription expired, payment required
 */
export class PaymentRequiredError extends ApiHttpError {
  feature?: string
  status?: string
  inTrial?: boolean
  daysLeftTrial?: number

  constructor(
    message: string = 'Payment or subscription required',
    metadata: HttpErrorMetadata & {
      feature?: string
      status?: string
      inTrial?: boolean
      daysLeftTrial?: number
    } = {}
  ) {
    super(message, metadata)
    this.name = 'PaymentRequiredError'
    this.feature = metadata.feature
    this.status = metadata.status
    this.inTrial = metadata.inTrial
    this.daysLeftTrial = metadata.daysLeftTrial
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

/**
 * Helper to check if an error requires payment/subscription
 */
export function requiresPayment(error: Error): boolean {
  return error instanceof PaymentRequiredError
}
