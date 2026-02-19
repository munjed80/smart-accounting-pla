# Error Mapping and Offline Detection Guide

## Overview

This document describes how the Smart Accounting Platform handles different HTTP error codes and network errors, specifically how it determines when to show the "Offline" banner vs. other error states.

## Problem Statement

Previously, the app would incorrectly show the yellow "Offline of verbinding weggevallen" banner when backend returned 401/402/403/404 errors, even though the network connection was fine and the backend was reachable. This was confusing for users and masked the actual error conditions.

## Solution

The error handling has been updated to properly distinguish between:
1. True network/offline conditions
2. Authentication/authorization errors
3. Payment/subscription required errors
4. Resource not found errors
5. Server errors

## Offline Detection Logic

### What Qualifies as "Offline"

The offline banner (`OfflineBanner.tsx`) is shown ONLY when:

1. **Network errors (no response from server)**:
   - Connection refused
   - Timeout
   - CORS errors
   - DNS resolution failed
   - Network unreachable
   - Characterized by: `error.response` is `null` or `undefined`

2. **Service infrastructure issues**:
   - HTTP 503 (Service Unavailable)
   - HTTP 504 (Gateway Timeout)

### What is NOT Offline

The following HTTP status codes indicate problems OTHER than offline/network issues:

- **401 (Unauthorized)**: Session expired → Redirect to login
- **402 (Payment Required)**: Subscription required → Show PaywallModal
- **403 (Forbidden)**: Insufficient permissions → Show "Geen toegang" message
- **404 (Not Found)**: Resource doesn't exist → Show "Niet gevonden" or empty state
- **500, 502**: Server errors → Show retry error state (server is reachable, just has an error)

## Implementation Details

### Frontend: `src/lib/api.ts`

**`isOfflineError()` function** (lines 340-363):
```typescript
const isOfflineError = (error: AxiosError) => {
  // True offline conditions:
  // 1. No response at all (network failure, CORS, connection refused, timeout)
  // 2. Status 503 (Service Unavailable) or 504 (Gateway Timeout)
  
  if (!error.response) {
    // No response object means a true network error
    return true
  }
  
  // Service unavailable or gateway timeout = infrastructure offline
  const status = error.response.status
  return status === 503 || status === 504
}
```

**Error Type Mapping** (lines 484-519):
```typescript
switch (status) {
  case 400: → ValidationError
  case 401: → UnauthorizedError (redirect to login)
  case 402: → PaymentRequiredError (show paywall)
  case 403: → UnauthorizedError
  case 404: → NotFoundError
  case 500/502/503/504: → ServerError
  default: → ApiHttpError
}
```

### Error Classes: `src/lib/errors.ts`

New error class added for payment gating:

**PaymentRequiredError**:
- Extends `ApiHttpError`
- Contains subscription metadata: `feature`, `status`, `inTrial`, `daysLeftTrial`
- Triggered on HTTP 402
- Shows PaywallModal instead of offline banner

### Page-Level Error Handling

Example implementation in `ZZPSubscriptionsPage.tsx` and `ZZPLeaseLoansPage.tsx`:

```typescript
const load = async () => {
  setIsLoading(true)
  setLoadError(null)
  try {
    // API calls...
  } catch (error) {
    if (error instanceof PaymentRequiredError) {
      // Show paywall modal
      setPaywallOpen(true)
    } else {
      // Show error state with retry button
      setLoadError(errorMsg)
    }
  } finally {
    setIsLoading(false)
  }
}
```

**UI States**:
1. **Loading**: Spinner with "Laden..." message
2. **Error**: Alert with error message + "Opnieuw proberen" button
3. **Paywall**: PaywallModal with subscription activation CTA
4. **Success**: Normal content display

## Backend Endpoints

### ZZP Commitments Endpoints

Located in: `/backend/app/api/v1/zzp_commitments.py`

**Endpoints** (mounted at `/api/v1/zzp/commitments`):
- `GET /` - List commitments (filtered by type: lease/loan/subscription)
- `GET /{id}` - Get single commitment
- `POST /` - Create commitment
- `PATCH /{id}` - Update commitment
- `DELETE /{id}` - Delete commitment
- `GET /subscriptions/suggestions` - Get subscription suggestions
- `GET /overview/summary` - Get commitments overview
- `POST /{id}/create-expense` - Create expense from commitment
- `GET /{id}/amortization` - Get amortization schedule

**Entitlement Gating**:
- Uses `require_zzp()` - checks user role only
- Does NOT use `require_zzp_entitlement()` - no subscription gating
- **Result**: TRIALING users CAN access these endpoints

### Entitlement Logic

Located in: `/backend/app/services/subscription_service.py`

**Trial Access**:
```python
if subscription.status == SubscriptionStatus.TRIALING:
    if now <= subscription.trial_end_at:
        # Still in trial period
        return EntitlementResult(
            can_use_pro_features=True,  # ✅ Trial users get access
            in_trial=True
        )
```

**Features Currently Gated** (return 402 when not accessible):
- `vat_actions` - VAT submission actions
- `bank_reconcile_actions` - Bank reconciliation actions  
- `exports` - CSV/PDF exports

**Not Gated** (accessible during trial):
- ✅ Commitments (Leases/Loans/Subscriptions)
- ✅ Invoices
- ✅ Expenses
- ✅ Time tracking
- ✅ Dashboard/insights
- ✅ Bank transaction viewing

## Testing Scenarios

### 1. Fresh ZZP User in Trial
- **Expected**: Both "Abonnementen" and "Lease & Leningen" pages load successfully
- **No offline banner should appear**
- **Endpoints return 200 OK**

### 2. Simulated Offline (Network Disabled)
- **Expected**: Yellow offline banner appears
- **Message**: "Offline of verbinding weggevallen"
- **Retry button**: "Opnieuw proberen"

### 3. Expired Trial (Backend Returns 402)
- **Expected**: PaywallModal appears
- **Message**: "Abonnement vereist"
- **CTA**: "Abonnement activeren" button
- **NOT offline banner**

### 4. Unauthorized (Backend Returns 401)
- **Expected**: Redirect to `/login`
- **NOT offline banner**

### 5. Forbidden (Backend Returns 403)
- **Expected**: Error message "Geen rechten voor deze pagina"
- **NOT offline banner**

### 6. Not Found (Backend Returns 404)
- **Expected**: Error message "Endpoint ontbreekt (configuratie)"
- **Retry button available**
- **NOT offline banner**

### 7. Server Error (Backend Returns 500/502)
- **Expected**: Error message "Serverfout, probeer later"
- **Retry button available**
- **NOT offline banner**

## Dutch Error Messages

Standardized Dutch error messages used throughout the app:

| Code | Message |
|------|---------|
| 401  | "Sessie verlopen, log opnieuw in" |
| 402  | "Abonnement vereist om deze functie te gebruiken" |
| 403  | "Geen rechten voor deze pagina" |
| 404  | "Endpoint ontbreekt (configuratie)" |
| 500/502/503/504 | "Serverfout, probeer later" |
| Network Error | "Offline of verbinding weggevallen" |

## Files Changed

1. **`src/lib/errors.ts`**
   - Added `PaymentRequiredError` class
   - Added `requiresPayment()` helper function

2. **`src/lib/api.ts`**
   - Updated `isOfflineError()` function with clear logic
   - Added 402 handling in error mapping switch
   - Updated `extractApiErrorInfo()` to handle 402 messages

3. **`src/components/ZZPSubscriptionsPage.tsx`**
   - Added loading state
   - Added error state with retry button
   - Added PaywallModal integration
   - Added PaymentRequiredError handling

4. **`src/components/ZZPLeaseLoansPage.tsx`**
   - Added loading state
   - Added error state with retry button
   - Added PaywallModal integration
   - Added PaymentRequiredError handling

## Best Practices

### When Adding New Pages

1. **Always distinguish between error types**:
   ```typescript
   if (error instanceof PaymentRequiredError) {
     // Show paywall
   } else if (error instanceof NetworkError) {
     // Show offline state
   } else {
     // Show generic error with retry
   }
   ```

2. **Provide clear feedback**:
   - Loading state with spinner
   - Error state with message + retry button
   - Success state with data

3. **Use proper Dutch messages**:
   - Keep messages user-friendly
   - Avoid technical jargon
   - Provide actionable next steps

4. **Test all error scenarios**:
   - Network offline (disconnect internet)
   - Backend errors (401/402/403/404/5xx)
   - Subscription expired (402)
   - Normal operation

## Future Improvements

1. **Retry with exponential backoff**: For transient server errors (500/502)
2. **Offline queue**: Store failed requests and retry when back online
3. **Better error tracking**: Log errors to monitoring service
4. **Context-aware messages**: Customize error messages based on the action being performed
5. **Optimistic UI updates**: Update UI immediately, rollback on error

---

**Last Updated**: 2026-02-19  
**Related Issues**: Fix ZZP pages showing "Offline" for 401/402/403/404  
**Version**: 1.0
