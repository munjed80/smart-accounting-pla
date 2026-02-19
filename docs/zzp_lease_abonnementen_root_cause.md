# ZZP Lease & Leningen / Abonnementen – Root-Cause Analysis

## Failing Requests

| Page | Endpoint | Expected status |
|------|----------|-----------------|
| Lease & Leningen | `GET /api/v1/zzp/commitments?type=lease` | 200 |
| Lease & Leningen | `GET /api/v1/zzp/commitments?type=loan` | 200 |
| Lease & Leningen | `GET /api/v1/zzp/expenses` | 200 |
| Abonnementen & Recurring Kosten | `GET /api/v1/zzp/commitments?type=subscription` | 200 |
| Abonnementen & Recurring Kosten | `GET /api/v1/zzp/commitments/subscriptions/suggestions` | 200 |
| Abonnementen & Recurring Kosten | `GET /api/v1/zzp/expenses` | 200 |

## Root Cause

The `api.ts` axios response interceptor converts every `AxiosError` into a
typed error class (`NotFoundError`, `UnauthorizedError`, `NetworkError`,
`PaymentRequiredError`, `ServerError`) **before** the error reaches the
component's `catch` block.

Both `ZZPLeaseLoansPage.tsx` and `ZZPSubscriptionsPage.tsx` contained the
following anti-pattern in their `catch` handler:

```typescript
if (axios.isAxiosError(error)) {   // ← always FALSE after interceptor
  if (error.response?.status === 404) { setIsBetaMode(true) }
  ...
} else {
  setLoadError(parseApiError(error))   // all HTTP errors land here
}
```

Because `axios.isAxiosError(error)` returns `false` for typed errors, every
HTTP error (404, 401, 403, 402, 500) fell into the `else` branch and called
`parseApiError(error)`.  For a `NetworkError` whose `.message` was the raw
axios default string `"Network Error"`, this string was displayed directly to
the user — giving the misleading "Network Error" label even for plain 404 or
403 responses.

Additionally, the `NetworkError` class was constructed with the raw axios
message:

```typescript
typedError = new NetworkError(error.message || 'Network connection failed')
```

When `error.message` was the axios default `"Network Error"`, the typed error
inherited that unhelpful string.

## Fix

### 1. `src/lib/api.ts` – interceptor improvements

* **Always** log the full structured error (method, full URL, HTTP status,
  response-body snippet ≤ 500 chars, request-id) via `console.error`.
  Previously, logging only ran in `DEV` mode and omitted the body and
  request-id.
* Replaced the raw-message passthrough for `NetworkError`:
  ```typescript
  const networkMsg = error.message === 'Network Error'
    ? 'Geen verbinding met de server. Controleer je internetverbinding.'
    : (error.message || 'Geen verbinding met de server. ...')
  typedError = new NetworkError(networkMsg)
  ```

### 2. `src/components/ZZPLeaseLoansPage.tsx` & `ZZPSubscriptionsPage.tsx`

Replaced `axios.isAxiosError(error)` checks with typed-error `instanceof`
guards that match what the interceptor actually throws:

```typescript
if (error instanceof PaymentRequiredError) { /* paywall */ }
else if (error instanceof NotFoundError)   { setIsBetaMode(true) }
else if (error instanceof UnauthorizedError) {
  setLoadError(error.statusCode === 401
    ? ErrorMessages.SESSION_EXPIRED
    : ErrorMessages.NO_ACCESS)
}
else if (error instanceof NetworkError)    { setLoadError(ErrorMessages.NO_CONNECTION) }
else if (error instanceof Error)           { setLoadError(error.message) }
else                                       { setLoadError(parseApiError(error)) }
```

## Status Code → Behaviour Matrix

| HTTP status | Typed error | Page behaviour |
|-------------|-------------|----------------|
| 200 | – | Normal content rendered |
| 402 | `PaymentRequiredError` | `PaywallModal` shown, page hidden |
| 404 | `NotFoundError` | Beta/coming-soon card |
| 401 | `UnauthorizedError` (statusCode=401) | "Sessie verlopen" error alert |
| 403 | `UnauthorizedError` (statusCode=403) | "Geen toegang" error alert |
| 500/502/503/504 | `ServerError` | Generic server error message |
| no response | `NetworkError` | "Geen verbinding met de server" |

## Manual Test Steps

1. Log in as a ZZP user (role = `zzp`) in staging/production.
2. Navigate to **Lease & Leningen** (`/zzp/lease-loans`):
   - **Expected (TRIALING)**: Page loads with empty state and "Nieuwe
     lease/lening" button.
   - **Expected (no subscription, expired trial)**: PaywallModal is shown.
3. Navigate to **Abonnementen & Recurring Kosten** (`/zzp/subscriptions`):
   - **Expected (TRIALING)**: Page loads with the subscription form and empty
     list.
   - **Expected (no subscription, expired trial)**: PaywallModal is shown.
4. Open browser DevTools → Network tab.  Filter by `/zzp/commitments`.  
   Confirm all requests return HTTP 200 for a TRIALING user.
5. Simulate a 404 (e.g., temporarily rename the endpoint):  
   The Beta card should appear; the destructive "Fout bij laden" alert must
   **not** appear.
6. Simulate offline (disconnect network):  
   The error alert should say "Geen verbinding met de server …" and **not**
   "Network Error".
