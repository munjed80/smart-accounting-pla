# Mollie Payments Phase 2: Implementation Summary

## Overview

This document describes the implementation of Mollie subscription payments for the Smart Accounting Platform (ZZP Basic plan). Phase 2 adds Mollie integration on top of the provider-agnostic subscription model from Phase 1.

## Architecture

### Provider-Agnostic Design

The subscription model remains provider-agnostic, allowing future integration with other payment providers (Stripe, etc.):

- `provider`: Payment provider name (e.g., "mollie")
- `provider_customer_id`: Provider's customer ID
- `provider_subscription_id`: Provider's subscription ID

### Mollie Integration Components

1. **Mollie Client** (`backend/app/integrations/mollie/client.py`)
   - Wrapper around Mollie API
   - Handles customer creation, subscriptions, payments
   - Centralized error handling and logging (no PII)

2. **Mollie Subscription Service** (`backend/app/services/mollie_subscription_service.py`)
   - Business logic for Mollie subscriptions
   - Customer creation (idempotent)
   - Subscription activation (scheduled after trial)
   - Webhook processing (payment and subscription events)
   - Subscription cancellation

3. **API Endpoints**
   - `POST /api/v1/me/subscription/activate`: Activate Mollie subscription
   - `POST /api/v1/me/subscription/cancel`: Cancel subscription at period end
   - `POST /api/v1/webhooks/mollie`: Webhook endpoint for Mollie events

4. **Webhook Event Tracking** (`WebhookEvent` model)
   - Ensures idempotency (prevents double-processing)
   - Stores event metadata for debugging
   - Unique constraint on `event_id`

## User Flow

### 1. Trial Period (Phase 1)

User registers and automatically starts 30-day trial:
- Status: `TRIALING`
- `trial_start_at`: Current timestamp
- `trial_end_at`: 30 days from now
- Full access to pro features during trial

### 2. Subscription Activation (Phase 2)

User clicks "Abonnement activeren" button:

1. **Frontend**: Calls `POST /api/v1/me/subscription/activate`
2. **Backend**:
   - Ensures trial started (idempotent)
   - Creates Mollie customer if needed
   - Creates Mollie subscription with `startDate = trial_end_at.date()`
   - Stores `provider_subscription_id`
   - Returns `scheduled: true` (if still in trial)

3. **UI Update**:
   - Shows "Abonnement gepland" message
   - Banner displays: "Proefperiode actief — X dagen over (Abonnement gepland na proefperiode)"

### 3. Trial Ends

When trial period ends:

1. Mollie automatically charges first payment
2. Mollie sends webhook notification
3. **Backend webhook handler**:
   - Receives payment webhook: `POST /api/v1/webhooks/mollie?id=tr_xxxxx`
   - Fetches payment details from Mollie
   - Updates subscription status to `ACTIVE`
   - Creates audit log entry

4. **UI Update**:
   - Status changes from `TRIALING` to `ACTIVE`
   - Banner shows: "Abonnement actief — ZZP Basic (€6,95/maand)"

### 4. Subscription Renewal

Every month:

1. Mollie charges payment automatically
2. Mollie sends webhook notification
3. Backend processes webhook (idempotent)
4. Updates `current_period_start` and `current_period_end`

### 5. Payment Failure

If payment fails:

1. Mollie sends webhook with `status: "failed"`
2. Backend updates subscription status to `PAST_DUE`
3. User loses access to pro features
4. UI shows: "Betaling mislukt — werk je betaalgegevens bij"

## Configuration

### Environment Variables

Add to `.env` file:

```bash
# Mollie API key (test or live)
MOLLIE_API_KEY=test_xxxxxxxxxx

# Webhook secret for verification
MOLLIE_WEBHOOK_SECRET=your_secure_random_string

# Public URL for webhooks (must be accessible from internet)
APP_PUBLIC_URL=https://yourdomain.com
```

### Coolify Secrets

For production deployment:

1. Add secrets in Coolify dashboard:
   - `MOLLIE_API_KEY`: Live API key from Mollie dashboard
   - `MOLLIE_WEBHOOK_SECRET`: Generate with `openssl rand -hex 32`
   - `APP_PUBLIC_URL`: Production URL (e.g., `https://zzpershub.nl`)

2. Secrets are injected as environment variables
3. Never stored in database or logs

## Webhook Security

### Verification

The webhook endpoint verifies authenticity using a shared secret:

```python
# Query parameter verification
secret_param = request.query_params.get("secret")
if secret_param == settings.MOLLIE_WEBHOOK_SECRET:
    # Webhook is authentic
```

### Webhook URL Format

```
{APP_PUBLIC_URL}/api/v1/webhooks/mollie?id={resource_id}
```

Where:
- `resource_id`: Mollie payment ID (tr_xxxxx) or subscription ID (sub_xxxxx)

### Idempotency

Webhooks are idempotent using `WebhookEvent` table:

```python
# Check if already processed
existing_event = await db.get(WebhookEvent, event_id)
if existing_event:
    return {"status": "already_processed"}

# Process webhook
# ...

# Record event
webhook_event = WebhookEvent(
    provider="mollie",
    event_id=f"{event_type}_{resource_id}_{timestamp}",
    event_type=event_type,
    resource_id=resource_id,
)
db.add(webhook_event)
```

## State Machine

### Subscription States

```
TRIALING → ACTIVE → CANCELED
    ↓          ↓
EXPIRED    PAST_DUE
```

### State Transitions

| Current State | Event | Next State | Trigger |
|--------------|-------|------------|---------|
| TRIALING | Trial expires | EXPIRED | Time-based check |
| TRIALING | Payment paid | ACTIVE | Webhook: payment.paid |
| ACTIVE | Payment failed | PAST_DUE | Webhook: payment.failed |
| ACTIVE | Subscription canceled | CANCELED | API: cancel_subscription |
| PAST_DUE | Payment paid | ACTIVE | Webhook: payment.paid |
| * | Any state | TRIALING | Reset (admin only) |

## Audit Logging

All subscription events are logged:

```python
audit = AuditLog(
    actor_user_id=user.id,  # or None for system actions
    action="SUBSCRIPTION_ACTIVATED",
    resource_type="subscription",
    resource_id=str(subscription.id),
    details=json.dumps({
        "mollie_subscription_id": "sub_xxxxx",
        "amount": "6.95",
        "currency": "EUR",
    })
)
```

### Audit Events

- `MOLLIE_CUSTOMER_CREATED`: Mollie customer created
- `SUBSCRIPTION_SCHEDULED`: Subscription scheduled after trial
- `SUBSCRIPTION_ACTIVATED`: Subscription activated (first payment)
- `SUBSCRIPTION_PAYMENT_FAILED`: Payment failed
- `SUBSCRIPTION_CANCELED`: Subscription canceled

## API Reference

### POST /api/v1/me/subscription/activate

Activate Mollie subscription for current user.

**Request**: No body required

**Response**:
```json
{
  "status": "TRIALING",
  "in_trial": true,
  "trial_end_at": "2026-03-20T12:00:00Z",
  "scheduled": true,
  "provider_subscription_id": "sub_xxxxx"
}
```

**Idempotent**: Returns existing subscription if already activated.

### POST /api/v1/me/subscription/cancel

Cancel subscription at period end.

**Request**: No body required

**Response**:
```json
{
  "status": "ACTIVE",
  "cancel_at_period_end": true
}
```

### POST /api/v1/webhooks/mollie

Process Mollie webhook event.

**Query Parameters**:
- `id`: Mollie resource ID (payment or subscription)
- `secret`: Webhook verification secret (optional)

**Response**:
```json
{
  "status": "ok",
  "result": {
    "status": "processed"
  }
}
```

**Security**: Verifies webhook secret before processing.

## Frontend Integration

### Subscription API

```typescript
import { subscriptionApi } from '@/lib/api'

// Activate subscription
const result = await subscriptionApi.activateSubscription()

// Cancel subscription
const result = await subscriptionApi.cancelSubscription()
```

### UI Components

1. **PaywallModal**: Shows when user tries to use gated feature
   - "Abonnement activeren" button calls `activateSubscription()`
   - Shows success message with scheduled date

2. **SubscriptionBanner**: Shows at top of dashboard
   - During trial: Shows days remaining + activate button
   - After activation: Shows "Abonnement gepland na proefperiode"
   - Active: Shows "Abonnement actief"
   - Expired: Shows "Proefperiode afgelopen" + activate button

### State Management

```typescript
const { entitlements, subscription, refetch } = useEntitlements()

// Check if scheduled
const isScheduled = subscription?.scheduled || false

// Refetch after activation
await subscriptionApi.activateSubscription()
await refetch()
```

## Testing

### Manual Testing Steps

1. **Start Trial**
   - Register new user
   - Verify trial starts automatically
   - Check banner shows days remaining

2. **Activate Subscription (During Trial)**
   - Click "Abonnement activeren"
   - Verify scheduled message
   - Check Mollie dashboard for subscription
   - Verify `startDate` is set to trial end date

3. **Trial Expires**
   - Wait for trial to expire OR use Mollie test mode
   - Verify Mollie sends payment webhook
   - Check subscription status changes to ACTIVE
   - Verify banner shows "Abonnement actief"

4. **Simulate Payment Failure**
   - Use Mollie test mode to simulate failed payment
   - Verify webhook updates status to PAST_DUE
   - Check user loses access to gated features
   - Verify banner shows error message

5. **Cancel Subscription**
   - Click cancel button (if implemented)
   - Verify subscription marked as `cancel_at_period_end: true`
   - Check subscription remains active until period end

### Unit Tests

See test files:
- `backend/tests/test_mollie_client.py` (mocked Mollie API)
- `backend/tests/test_mollie_subscription_service.py`
- `backend/tests/test_webhook_handlers.py`

## Database Migration

Run migration to create `webhook_events` table:

```bash
# Generate migration
alembic revision --autogenerate -m "Add webhook_events table for Mollie integration"

# Apply migration
alembic upgrade head
```

## Security Considerations

### 1. API Key Protection

- Never log API keys
- Store in environment variables only
- Use Coolify secrets in production
- Rotate keys periodically

### 2. Webhook Verification

- Always verify webhook secret
- Use HTTPS for webhook URL
- Log failed verification attempts
- Consider IP whitelist for Mollie servers

### 3. PII Protection

- Don't log customer email in plain text
- Mask email: `email[:3]***`
- Don't store payment details in database
- Use Mollie's secure vault for card data

### 4. Idempotency

- Use `WebhookEvent` table to prevent double-processing
- Handle race conditions with database constraints
- Return 200 OK even for duplicate webhooks

## Troubleshooting

### Webhook Not Received

1. Check `APP_PUBLIC_URL` is correct and accessible
2. Verify webhook URL in Mollie dashboard
3. Check webhook secret matches
4. Look for firewall blocking Mollie IPs

### Payment Failed

1. Check Mollie dashboard for error details
2. Verify card is valid and has funds
3. Check 3D Secure requirements
4. Review webhook logs

### Subscription Not Activating

1. Check Mollie API key is valid
2. Verify customer was created successfully
3. Check `startDate` is in future (for trial)
4. Review server logs for errors

## Future Enhancements

1. **Email Notifications**
   - Send confirmation when subscription activated
   - Notify before trial expires
   - Alert on payment failures

2. **Admin Dashboard**
   - View all subscriptions
   - Manually activate/cancel subscriptions
   - View webhook history

3. **Retry Logic**
   - Automatic retry for failed webhooks
   - Exponential backoff
   - Dead letter queue

4. **Analytics**
   - Track conversion rates
   - Monitor churn
   - Analyze payment failures

## References

- [Mollie API Documentation](https://docs.mollie.com/reference/v2/subscriptions-api/create-subscription)
- [Mollie Webhooks Guide](https://docs.mollie.com/overview/webhooks)
- [Subscription Phase 1 Summary](./SUBSCRIPTION_PHASE1_SUMMARY.md)
