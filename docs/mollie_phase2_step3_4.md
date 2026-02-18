# Mollie Phase 2 (Step 3+4): Activate Endpoint + Webhook Sync - Verification Checklist

## Overview
This document verifies the implementation of Mollie subscription activation and webhook synchronization for production-grade payment processing.

## Implementation Summary

### ✅ Step 3: Activate Endpoint
**Endpoint**: `POST /api/v1/me/subscription/activate`

**Implementation Details**:
- **File**: `backend/app/api/v1/subscriptions.py` (lines 184-241)
- **Service**: `backend/app/services/mollie_subscription_service.py`
- **Response Schema**: `backend/app/schemas/subscription.py` (ActivateSubscriptionResponse)

**Behavior**:
1. ✅ Requires authenticated ZZP user
2. ✅ Calls `ensure_trial_started()` (idempotent)
3. ✅ Returns existing subscription if already active (idempotent)
4. ✅ Creates Mollie customer if `provider_customer_id` missing
5. ✅ Creates Mollie subscription if `provider_subscription_id` missing:
   - Amount: €6.95 EUR
   - Interval: "1 month"
   - Start Date: `trial_end_at` (date part, ISO yyyy-mm-dd)
   - Description: "ZZP Basic abonnement"
   - Webhook URL: `APP_PUBLIC_URL + "/api/v1/webhooks/mollie?secret=" + MOLLIE_WEBHOOK_SECRET`
6. ✅ Persists:
   - `provider="mollie"`
   - `provider_subscription_id`
   - Status stays TRIALING if now < trial_end_at
7. ✅ Creates AuditLog event: `SUBSCRIPTION_SCHEDULED`

**Response**:
```json
{
  "status": "TRIALING",
  "in_trial": true,
  "trial_end_at": "2024-03-15T00:00:00Z",
  "scheduled": true,
  "provider_subscription_id": "sub_xxxxx",
  "message_nl": "Abonnement gepland. Start na proefperiode."
}
```

### ✅ Step 4: Webhook Sync Endpoint
**Endpoint**: `POST /api/v1/webhooks/mollie?secret=...`

**Implementation Details**:
- **File**: `backend/app/api/v1/webhooks.py` (lines 57-129)
- **Service**: `backend/app/services/mollie_subscription_service.py` (process_webhook method)

**Security**:
- ✅ Verifies secret matches `MOLLIE_WEBHOOK_SECRET`
- ✅ Rejects with 401 if verification fails
- ✅ Supports query parameter: `?secret=<webhook_secret>`

**Webhook Processing**:
- ✅ Fetches payment/subscription details from Mollie API
- ✅ Determines associated subscription by `provider_subscription_id`
- ✅ Maps Mollie status to internal status (see mapping below)
- ✅ Updates subscription status in database
- ✅ Creates appropriate AuditLog events

**Status Mapping Rules**:

**Payment Webhooks** (resource ID starts with `tr_`):
- `paid` → Status: ACTIVE, AuditLog: SUBSCRIPTION_ACTIVATED
- `failed`, `expired`, `canceled` → Status: PAST_DUE, AuditLog: SUBSCRIPTION_PAYMENT_FAILED
- `pending`, `open`:
  - If now < trial_end_at → Keep TRIALING
  - Else → Status: PAST_DUE

**Subscription Webhooks** (resource ID starts with `sub_`):
- `active` → Status: ACTIVE, AuditLog: SUBSCRIPTION_ACTIVATED
- `canceled`, `suspended`, `completed` → Status: CANCELED, AuditLog: SUBSCRIPTION_CANCELED
- `pending` → Keep current status (likely TRIALING)

**Idempotency**:
- ✅ Uses `webhook_events` table to track processed events
- ✅ Stores unique event_id: `{event_type}_{resource_id}`
- ✅ Returns "already_processed" if event already handled
- ✅ Prevents double-processing of same webhook

**Logging**:
- ✅ Logs webhook processing without PII
- ✅ Stores safe payload in `webhook_events.payload` (truncated to 5000 chars)
- ✅ Does not log full payloads or sensitive data

## Environment Configuration

### Required Environment Variables
These must be set in production:

```bash
# Mollie API key (test_xxx for testing, live_xxx for production)
MOLLIE_API_KEY=test_xxxxxxxxxxxxxxxxxxxxx

# Webhook secret for verification (generate with: openssl rand -hex 32)
MOLLIE_WEBHOOK_SECRET=your_secure_webhook_secret_here

# Public URL accessible from internet (for webhooks)
APP_PUBLIC_URL=https://yourdomain.com
```

**Documentation**: 
- ✅ All variables documented in `.env.example` (lines 210-229)
- ✅ Includes setup instructions and security notes

## Database Schema

### Existing Tables (Phase 1)
- ✅ `subscriptions` table with Phase 1 fields:
  - `provider` (string, nullable)
  - `provider_customer_id` (string, nullable)
  - `provider_subscription_id` (string, nullable)
  - `trial_end_at` (datetime, nullable)
  - `status` (enum: TRIALING, ACTIVE, PAST_DUE, CANCELED, EXPIRED)

- ✅ `webhook_events` table for idempotency:
  - `id` (UUID, primary key)
  - `provider` (string, "mollie")
  - `event_id` (string, unique index)
  - `event_type` (string)
  - `resource_id` (string, index)
  - `processed_at` (datetime)
  - `payload` (string, max 5000 chars)

**Migration**: 
- ✅ `044_add_subscription_phase1_fields.py` (already applied)
- ✅ Includes WebhookEvent model

## Tests

### Test Coverage
**File**: `backend/tests/test_mollie_phase2.py`

**Activate Endpoint Tests** (3 tests):
1. ✅ `test_activate_endpoint_creates_customer_and_subscription` - Creates customer once, subscription once
2. ✅ `test_activate_endpoint_is_idempotent` - Returns existing subscription without API calls
3. ✅ `test_activate_endpoint_returns_active_subscription` - Correct message for active status

**Webhook Endpoint Tests** (9 tests):
1. ✅ `test_webhook_endpoint_rejects_invalid_secret` - Returns 401 without secret
2. ✅ `test_webhook_endpoint_accepts_valid_secret` - Accepts with valid secret
3. ✅ `test_webhook_payment_paid_activates_subscription` - Paid → ACTIVE
4. ✅ `test_webhook_payment_failed_marks_past_due` - Failed → PAST_DUE
5. ✅ `test_webhook_payment_pending_keeps_trialing_during_trial` - Pending during trial → TRIALING
6. ✅ `test_webhook_payment_pending_marks_past_due_after_trial` - Pending after trial → PAST_DUE
7. ✅ `test_webhook_subscription_active` - Active subscription → ACTIVE
8. ✅ `test_webhook_subscription_canceled` - Canceled subscription → CANCELED
9. ✅ `test_webhook_is_idempotent` - Same event processed once

**Test Results**:
```
======================= 12 passed, 87 warnings in 5.88s ========================
```
All tests passing ✅

## Frontend Integration (Optional)

### Recommended Implementation
While not implemented in this phase, here's the recommended approach:

**Button Wiring**:
```typescript
// In subscription settings page
const handleActivate = async () => {
  try {
    const response = await api.post('/api/v1/me/subscription/activate');
    // Show success message with response.message_nl
    toast.success(response.data.message_nl);
    // Refetch subscription and entitlements
    await refetchSubscription();
  } catch (error) {
    toast.error('Activatie mislukt. Probeer het later opnieuw.');
  }
};
```

**State Display**:
```typescript
if (subscription.scheduled) {
  return <Badge>Gepland na proefperiode</Badge>;
} else if (subscription.status === 'ACTIVE') {
  return <Badge variant="success">Actief</Badge>;
}
```

## Audit Log Events

### New Event Types
All events stored in `audit_log` table with proper user tracking:

1. **SUBSCRIPTION_SCHEDULED**
   - When: Mollie subscription created
   - Triggered by: User (via activate endpoint)
   - Contains: mollie_subscription_id, start_date, amount, currency

2. **SUBSCRIPTION_ACTIVATED**
   - When: Payment paid or subscription becomes active
   - Triggered by: System (webhook)
   - Contains: mollie_payment_id or mollie_subscription_id, status

3. **SUBSCRIPTION_PAYMENT_FAILED**
   - When: Payment fails, expires, or is canceled
   - Triggered by: System (webhook)
   - Contains: mollie_payment_id, status

4. **SUBSCRIPTION_CANCELED**
   - When: Subscription canceled, suspended, or completed
   - Triggered by: System (webhook) or User (cancel endpoint)
   - Contains: mollie_subscription_id, status

## Security Considerations

### Implemented Protections
- ✅ Webhook secret verification prevents unauthorized webhook calls
- ✅ 401 Unauthorized response for invalid webhooks (not 403)
- ✅ No sensitive data in logs (payment details, API keys)
- ✅ Idempotency prevents duplicate processing
- ✅ Safe payload storage (truncated, no PII)

### Production Recommendations
1. **Always set MOLLIE_WEBHOOK_SECRET** - Generate with `openssl rand -hex 32`
2. **Use HTTPS for APP_PUBLIC_URL** - Mollie requires HTTPS for webhooks
3. **Use live API key in production** - Test keys start with `test_`, live keys with `live_`
4. **Monitor webhook failures** - Check logs for rejected webhooks
5. **Validate Mollie signature** (future enhancement) - Mollie provides signature verification

## Verification Checklist

### Functionality
- [x] Activate endpoint creates Mollie customer once
- [x] Activate endpoint creates Mollie subscription once
- [x] Activate endpoint is idempotent
- [x] Webhook verifies secret
- [x] Webhook rejects invalid secret with 401
- [x] Webhook handles payment paid → ACTIVE
- [x] Webhook handles payment failed → PAST_DUE
- [x] Webhook handles payment pending (trial logic)
- [x] Webhook handles subscription active → ACTIVE
- [x] Webhook handles subscription canceled → CANCELED
- [x] Webhook processing is idempotent
- [x] Audit logs created for all events
- [x] Response includes message_nl field

### Configuration
- [x] MOLLIE_API_KEY documented
- [x] MOLLIE_WEBHOOK_SECRET documented
- [x] APP_PUBLIC_URL documented
- [x] Webhook URL includes secret parameter
- [x] Environment variables in .env.example

### Testing
- [x] All activate endpoint tests passing
- [x] All webhook endpoint tests passing
- [x] Mock Mollie client for tests
- [x] Test idempotency protection
- [x] Test secret verification

### Documentation
- [x] Implementation verified
- [x] API endpoints documented
- [x] Status mapping documented
- [x] Environment variables documented
- [x] Test coverage documented

## Deployment Notes

### Pre-Deployment Checklist
1. Set MOLLIE_API_KEY (test key for staging, live key for production)
2. Set MOLLIE_WEBHOOK_SECRET (generate secure random string)
3. Set APP_PUBLIC_URL (must be publicly accessible via HTTPS)
4. Verify webhook endpoint is accessible: `https://yourdomain.com/api/v1/webhooks/mollie`
5. Test webhook with Mollie dashboard (send test webhook)

### Post-Deployment Verification
1. Check Mollie dashboard for webhook configuration
2. Monitor logs for webhook processing
3. Test activate endpoint with real user
4. Verify subscription created in Mollie dashboard
5. Test webhook by manually triggering payment in Mollie

## Known Limitations

### Current Implementation
- Webhook URL includes secret in query parameter (acceptable for production)
- No signature verification (Mollie doesn't provide signature for webhooks)
- Limited retry logic for failed Mollie API calls (httpx default behavior)

### Future Enhancements
1. Add webhook retry queue for failed processing
2. Add admin dashboard for monitoring subscriptions
3. Add subscription period tracking from Mollie API
4. Add payment history tracking
5. Add subscription cancellation flow in UI

## Conclusion

✅ **All requirements from the problem statement have been met:**
- Activate endpoint implemented and tested
- Webhook endpoint implemented and tested
- Idempotency protection in place
- Audit logs created for all events
- Trial logic preserved (charge starts after trial_end_at)
- Environment variables documented
- Comprehensive test coverage (12/12 tests passing)

**Status**: Ready for production deployment after environment configuration.
