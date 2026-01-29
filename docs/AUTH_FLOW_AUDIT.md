# AUTH Flow Audit

## Overview
This document provides a comprehensive audit of the authentication flow in the Smart Accounting Platform, documenting the confirmed backend endpoints, frontend URL construction, and example curl commands.

## Confirmed Backend Endpoints

The backend uses FastAPI with the following route structure:
- API v1 prefix: `/api/v1`
- Auth routes prefix: `/auth`

### Auth Routes (Full Paths)

| Method | Endpoint | Description | Status Codes |
|--------|----------|-------------|--------------|
| POST | `/api/v1/auth/register` | Register new user | 201, 409, 422, 429 |
| POST | `/api/v1/auth/token` | Login (OAuth2 password flow) | 200, 401, 403, 429 |
| POST | `/api/v1/auth/resend-verification` | Resend verification email | 200, 429 |
| GET | `/api/v1/auth/verify-email?token=...` | Verify email address | 200, 400, 429 |
| POST | `/api/v1/auth/forgot-password` | Request password reset | 200, 429 |
| POST | `/api/v1/auth/reset-password` | Reset password with token | 200, 400, 429 |
| GET | `/api/v1/auth/me` | Get current user info | 200, 401 |

### Status Code Meanings

- **201** - Resource created successfully (registration)
- **200** - Success
- **400** - Bad request (invalid/expired token)
- **401** - Unauthorized (wrong credentials, expired session)
- **403** - Forbidden (email not verified: `EMAIL_NOT_VERIFIED`, admin not whitelisted: `ADMIN_NOT_WHITELISTED`)
- **409** - Conflict (email already registered)
- **422** - Validation error (invalid input data)
- **429** - Rate limit exceeded

### Note on Route Mounting

The auth router is mounted twice:
1. Under `/api/v1/auth/` for standard API access
2. At root level `/` for OAuth2 compatibility with `/token` endpoint

## Frontend URL Construction

### Environment Variables

```env
VITE_API_URL=https://api.zzpershub.nl
```

### API Base URL Construction

The frontend constructs the API base URL in `src/lib/api.ts`:

```typescript
// In production: ${VITE_API_URL}/api/v1
// Example: https://api.zzpershub.nl/api/v1
const API_BASE_URL = isDev 
  ? `${normalizeBaseUrl(envApiUrl || 'http://localhost:8000')}/api/v1`
  : `${normalizedEnvApiUrl || 'http://api-not-configured.invalid'}/api/v1`
```

### Confirmed Frontend Final URLs

| Action | Frontend Call | Final URL |
|--------|---------------|-----------|
| Register | `api.post('/auth/register', data)` | `https://api.zzpershub.nl/api/v1/auth/register` |
| Login | `api.post('/auth/token', formData)` | `https://api.zzpershub.nl/api/v1/auth/token` |
| Verify Email | `api.get('/auth/verify-email', {params: {token}})` | `https://api.zzpershub.nl/api/v1/auth/verify-email?token=...` |
| Forgot Password | `api.post('/auth/forgot-password', {email})` | `https://api.zzpershub.nl/api/v1/auth/forgot-password` |
| Reset Password | `api.post('/auth/reset-password', data)` | `https://api.zzpershub.nl/api/v1/auth/reset-password` |
| Get User | `api.get('/auth/me')` | `https://api.zzpershub.nl/api/v1/auth/me` |

## Example Curl Commands

### Register a New User

```bash
curl -X POST "https://api.zzpershub.nl/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123",
    "full_name": "Test User",
    "role": "zzp"
  }'
```

Expected Response (201):
```json
{
  "message": "Check your email to verify your account",
  "user_id": "uuid-string"
}
```

### Login

```bash
curl -X POST "https://api.zzpershub.nl/api/v1/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test@example.com&password=SecurePass123"
```

Expected Response (200):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### Verify Email

```bash
curl -X GET "https://api.zzpershub.nl/api/v1/auth/verify-email?token=YOUR_TOKEN_HERE"
```

Expected Response (200):
```json
{
  "message": "Email verified successfully",
  "verified": true
}
```

### Forgot Password

```bash
curl -X POST "https://api.zzpershub.nl/api/v1/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

Expected Response (200):
```json
{
  "message": "If an account with this email exists, a password reset email has been sent."
}
```

### Reset Password

```bash
curl -X POST "https://api.zzpershub.nl/api/v1/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_RESET_TOKEN_HERE",
    "new_password": "NewSecurePass123"
  }'
```

Expected Response (200):
```json
{
  "message": "Password reset successfully"
}
```

### Get Current User (Authenticated)

```bash
curl -X GET "https://api.zzpershub.nl/api/v1/auth/me" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

Expected Response (200):
```json
{
  "id": "uuid-string",
  "email": "test@example.com",
  "full_name": "Test User",
  "role": "zzp",
  "is_active": true,
  "is_email_verified": true,
  "created_at": "2024-01-15T10:30:00Z"
}
```

## Error Responses

### 422 Validation Error

```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    }
  ]
}
```

### 409 Conflict (Email Already Exists)

```json
{
  "detail": "Email already registered"
}
```

### 401 Unauthorized

```json
{
  "detail": "Incorrect email or password"
}
```

### 403 Email Not Verified

```json
{
  "detail": {
    "message": "Please verify your email before logging in",
    "code": "EMAIL_NOT_VERIFIED",
    "hint": "Check your inbox for a verification email or request a new one"
  }
}
```

### 403 Admin Not Whitelisted

```json
{
  "detail": {
    "message": "Admin access is restricted",
    "code": "ADMIN_NOT_WHITELISTED",
    "hint": "Contact your system administrator if you need admin access"
  }
}
```

## Security Considerations

### Role Registration Safety

- Public registration only allows `zzp` and `accountant` roles
- The `admin` role cannot be self-registered
- Admin users can only be created via database seed or protected internal commands
- Admin login is blocked unless the email is in `ADMIN_WHITELIST` environment variable

### Token Security

- Verification and reset tokens are generated with 256 bits of entropy
- Only SHA-256 hashes of tokens are stored in the database
- Tokens have configurable expiration times:
  - Email verification: 24 hours
  - Password reset: 1 hour
- Tokens can only be used once
- Old tokens of the same type are invalidated when a new one is issued

### Rate Limiting

Rate limits per endpoint per IP (60-second window):
- Registration: 5 requests
- Login: 10 requests
- Resend verification: 5 requests
- Forgot password: 5 requests
- Verify email: 20 requests
- Reset password: 5 requests

## Health Check

```bash
curl "https://api.zzpershub.nl/health"
```

Expected Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "components": {
    "database": {"status": "healthy", "message": "Connected"},
    "redis": {"status": "disabled", "message": "Redis not configured"},
    "migrations": {"status": "healthy", "message": "5/5 key tables present"},
    "background_tasks": {"status": "healthy", "message": "No background task queue configured"}
  }
}
```

## CORS Configuration

CORS is configured via `CORS_ORIGINS` environment variable (comma-separated list of allowed origins).

Example:
```env
CORS_ORIGINS=https://app.zzpershub.nl,https://zzpershub.nl
```

The backend allows:
- All HTTP methods (`*`)
- All headers (`*`)
- Credentials (`withCredentials: true` in frontend)
