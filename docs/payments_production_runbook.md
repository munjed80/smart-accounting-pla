# Payments Production Runbook

This guide covers production deployment, configuration, testing, and troubleshooting for Mollie subscription payments.

## Table of Contents
1. [Environment Variables](#environment-variables)
2. [Mollie Dashboard Configuration](#mollie-dashboard-configuration)
3. [Test Mode Testing](#test-mode-testing)
4. [E2E Test Scenarios](#e2e-test-scenarios)
5. [Troubleshooting](#troubleshooting)
6. [Timezone Handling](#timezone-handling)

---

## Environment Variables

### Required Variables for Production (Coolify)

Add these environment variables to your Coolify deployment:

```bash
# Environment Mode
ENV=production

# Mollie API Key (required)
# Get from: https://www.mollie.com/dashboard/settings/profiles
# Use live_xxx for production, test_xxx for testing
MOLLIE_API_KEY=live_xxxxxxxxxxxxxxxxxxxxxxxxx

# Mollie Webhook Secret (required)
# Generate with: openssl rand -hex 32
# This is used to verify webhook authenticity
MOLLIE_WEBHOOK_SECRET=your_secure_random_secret_32_chars_or_more

# Public URL (required)
# Must be accessible from the internet for Mollie webhooks
# Example: https://zzpershub.nl or https://yourdomain.com
APP_PUBLIC_URL=https://yourdomain.com

# Backend API URL (internal reference)
APP_URL=https://api.yourdomain.com

# Frontend URL (for email links)
FRONTEND_URL=https://yourdomain.com
```

### Optional Variables

```bash
# CORS Origins (must include your frontend domain)
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Database URLs
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
DATABASE_URL_SYNC=postgresql://user:pass@host:5432/db

# Secret key for JWT
SECRET_KEY=your_secret_key_from_openssl_rand_hex_32
```

### Configuration Validation

The application validates payment configuration at startup:

- **Development/Staging**: Warns if variables are missing, but allows startup
- **Production** (`ENV=production`): **Fails fast** if critical variables are missing

Check startup logs for configuration status:
```
INFO: Payment configuration verified: Mollie integration enabled
```

Or warnings if incomplete:
```
WARNING: MOLLIE_API_KEY not configured - Mollie integration disabled
WARNING: MOLLIE_WEBHOOK_SECRET not configured - webhook verification disabled
```

---

## Mollie Dashboard Configuration

### Step 1: Create/Select Profile

1. Go to [Mollie Dashboard](https://www.mollie.com/dashboard)
2. Navigate to **Settings** → **Website Profiles**
3. Select your profile or create a new one

### Step 2: Configure Webhook URL

1. In your profile settings, find **Webhook URL**
2. Set the webhook URL to:
   ```
   https://yourdomain.com/api/v1/webhooks/mollie?secret=YOUR_WEBHOOK_SECRET
   ```
   Replace:
   - `yourdomain.com` with your actual domain (value of `APP_PUBLIC_URL`)
   - `YOUR_WEBHOOK_SECRET` with the value of `MOLLIE_WEBHOOK_SECRET`

3. **Important**: Use the exact same secret as configured in your environment variables

### Step 3: Test Webhook Connection

Mollie provides a "Test webhook" button in the dashboard:
1. Click **Test webhook**
2. Check your application logs for:
   ```
   INFO: Mollie webhook processed: <resource_id>
   ```
3. If you see `INVALID_WEBHOOK` errors, verify your secret matches

### Step 4: Verify Payment Methods

Ensure the following payment methods are enabled for subscriptions:
- **iDEAL** (primary for Netherlands)
- **Credit Card** (Visa, Mastercard)
- **Direct Debit** (SEPA)

---

## Test Mode Testing

Mollie provides comprehensive test mode for safe testing without real transactions.

### Enable Test Mode

1. Use a **test API key** (starts with `test_`):
   ```bash
   MOLLIE_API_KEY=test_xxxxxxxxxxxxxxxxxxxxxxxxx
   ```

2. Set other required variables as usual

### Test Scenarios with Mollie Test Mode

#### Test Successful Payment

1. Create a subscription via the UI
2. Mollie will redirect to a payment page
3. In test mode, you'll see test payment methods
4. Complete the payment with **test credentials** (provided by Mollie)
5. Verify:
   - Webhook received: `POST /api/v1/webhooks/mollie`
   - Subscription status updated to `ACTIVE`
   - User gains access to paid features

#### Test Failed Payment

1. Create a subscription
2. On the Mollie payment page, choose "Fail this payment"
3. Verify:
   - Webhook received
   - Subscription status updated to `PAST_DUE`
   - User loses access to paid features
   - Paywall shows "payment failed" message

#### Test Subscription Cancellation

1. With an active subscription, navigate to Settings
2. Click "Cancel subscription"
3. Verify:
   - `cancel_at_period_end` is set to `true`
   - Subscription remains `ACTIVE` until period end
   - UI shows "Subscription will end on [date]"
   - After period end, status transitions to `CANCELED`

---

## E2E Test Scenarios

### Scenario A: Trial → Activate → Payment Success

**Goal**: Verify complete trial-to-paid flow

1. **Create user and start trial**
   - Register new ZZP user
   - Verify trial subscription auto-created
   - Verify status: `TRIALING`
   - Verify trial end date is 30 days from now

2. **Activate subscription during trial**
   - Click "Activate subscription" button
   - Verify Mollie customer created
   - Verify Mollie subscription created with `startDate` = trial_end_at
   - Verify subscription marked as `scheduled=true`
   - Verify status remains `TRIALING` (not yet charged)

3. **Simulate webhook: payment.paid**
   - Send webhook: `POST /webhooks/mollie?id=tr_xxxxx&secret=...`
   - Payload: `{ "status": "paid", "subscriptionId": "sub_xxxxx" }`
   - Verify status transitions to `ACTIVE`
   - Verify user immediately gains access to paid features

4. **Verify UI updates**
   - Settings page shows "Active subscription"
   - Next payment date displayed
   - Paywall no longer blocks features

### Scenario B: Payment Failed → PAST_DUE

**Goal**: Verify payment failure handling

1. **Setup**: Active subscription

2. **Simulate webhook: payment.failed**
   - Send webhook: `POST /webhooks/mollie?id=tr_xxxxx&secret=...`
   - Payload: `{ "status": "failed", "subscriptionId": "sub_xxxxx" }`
   - Verify status transitions to `PAST_DUE`

3. **Verify feature gating**
   - Attempt to use paid feature (e.g., VAT submission)
   - Verify paywall blocks with "Payment overdue" message
   - Verify no access to exports, bank reconciliation, etc.

4. **Verify UI warnings**
   - Settings page shows "Payment overdue" alert
   - Banner shows "Update payment details" button
   - All paid feature buttons show paywall

### Scenario C: Cancel at Period End

**Goal**: Verify cancellation preserves access until period end

1. **Setup**: Active subscription with `current_period_end` = 30 days from now

2. **Cancel subscription**
   - Navigate to Settings → Subscription
   - Click "Cancel subscription"
   - Confirm cancellation
   - Verify API call: `POST /me/subscription/cancel`

3. **Verify immediate state**
   - Status remains `ACTIVE`
   - `cancel_at_period_end` = `true`
   - User retains full access to features
   - UI shows "Subscription ends on [period_end]"

4. **Verify period end transition**
   - Wait until `current_period_end` date passes (or simulate by updating DB)
   - Trigger entitlements check (user action or API call)
   - Verify status transitions to `CANCELED`
   - Verify user loses access to paid features

5. **Verify reactivation**
   - Click "Reactivate subscription"
   - Verify new Mollie subscription created
   - Verify access restored

### Scenario D: Trial Expiration

**Goal**: Verify trial expiration and EXPIRED status

1. **Setup**: Trial subscription with `trial_end_at` = yesterday

2. **Trigger entitlements check**
   - User navigates to dashboard or attempts action
   - API calls `GET /me/subscription/entitlements`

3. **Verify automatic transition**
   - Status transitions from `TRIALING` to `EXPIRED`
   - User loses access to paid features
   - Paywall shows "Trial expired" message

4. **Verify activation prompt**
   - Banner shows "Trial expired, activate now"
   - Click "Activate" creates scheduled subscription

### Scenario E: Webhook Timeout and Retry

**Goal**: Verify webhook reliability with slow Mollie API

1. **Simulate slow Mollie API**
   - Use network throttling or mock slow response (>5s)
   - Send webhook: `POST /webhooks/mollie?id=tr_xxxxx&secret=...`

2. **Verify immediate 200 response**
   - Webhook endpoint returns `200 OK` within 5 seconds
   - Response body: `{ "status": "retry_queued", "resource_id": "tr_xxxxx" }`

3. **Verify retry record created**
   - Check `webhook_events` table for entry with `event_type` = "payment_retry"
   - Payload contains: `{ "status": "PENDING_WEBHOOK_RETRY", "resource_id": "tr_xxxxx" }`

4. **Trigger manual retry**
   - Call: `POST /api/v1/webhooks/mollie/retry`
   - Verify pending webhooks are reprocessed
   - Verify subscription status updated correctly
   - Verify retry record deleted after successful processing

---

## Troubleshooting

### Webhook Not Arriving

**Symptoms**: Subscription created in Mollie, but status not updating in app

**Checks**:
1. Verify `APP_PUBLIC_URL` is accessible from internet:
   ```bash
   curl -I https://yourdomain.com/health
   ```
2. Check Mollie dashboard → Developers → Webhook logs for delivery attempts
3. Check application logs for incoming webhook requests:
   ```bash
   grep "Mollie webhook" /var/log/app.log
   ```
4. Verify webhook URL format:
   - Must include `?secret=...` query parameter
   - Must match exactly between Mollie dashboard and `MOLLIE_WEBHOOK_SECRET`

**Solutions**:
- If behind firewall: Whitelist Mollie IPs
- If using ngrok/cloudflare tunnel: Update `APP_PUBLIC_URL` to tunnel URL
- If secret mismatch: Update either dashboard or env var to match

### Secret Mismatch (401 Unauthorized)

**Symptoms**: Webhook returns 401, logs show "Webhook verification failed"

**Root Cause**: `MOLLIE_WEBHOOK_SECRET` env var doesn't match secret in webhook URL

**Solution**:
1. Check current webhook URL in Mollie dashboard
2. Extract secret from URL query parameter
3. Update `MOLLIE_WEBHOOK_SECRET` to match:
   ```bash
   MOLLIE_WEBHOOK_SECRET=abc123xyz
   ```
4. **OR** update webhook URL in Mollie dashboard to use current secret
5. Restart application
6. Test webhook with "Test webhook" button in Mollie dashboard

### APP_PUBLIC_URL Wrong

**Symptoms**: Mollie can't deliver webhooks, or webhook URL is incorrect

**Diagnosis**:
1. Check startup logs:
   ```
   WARNING: APP_PUBLIC_URL not configured
   ```
2. Check generated webhook URL:
   ```bash
   # In Python shell or logs
   print(settings.APP_PUBLIC_URL)
   # Should output: https://yourdomain.com (not http://localhost)
   ```

**Solution**:
1. Set correct public URL:
   ```bash
   APP_PUBLIC_URL=https://yourdomain.com
   ```
2. Restart application
3. Re-activate subscriptions (webhook URL is set during activation)

### Timezone Issues for startDate/trial_end_at

**Symptoms**: Subscription starts on wrong date, or trial ends at unexpected time

**Root Cause**: Timezone mismatch between application and Mollie

**Mollie Expectations**:
- Accepts dates in **Europe/Amsterdam** timezone
- `startDate` must be in `YYYY-MM-DD` format (date only, no time)

**Application Behavior**:
1. All internal datetimes stored in **UTC**
2. When creating Mollie subscription, `trial_end_at` is converted to date:
   ```python
   start_date = subscription.trial_end_at.date()  # Converts datetime to date
   ```
3. Mollie interprets this date in **Europe/Amsterdam** timezone

**Example**:
- User trial ends: `2026-02-18 23:00:00 UTC`
- Converted to date: `2026-02-18`
- Mollie interprets: `2026-02-18 00:00:00 Europe/Amsterdam`
- Actual start: `2026-02-17 23:00:00 UTC` (1 hour earlier!)

**Solution** (if precise timing needed):
- Add 1 day buffer to trial_end_at before conversion
- Or adjust trial_end_at to account for timezone offset

**Verification**:
- Check Mollie subscription in dashboard for `startDate`
- Compare with `trial_end_at` in database (should match or be +1 day)

### Payment Stuck in PAST_DUE

**Symptoms**: Payment failed, but user wants to retry

**Checks**:
1. Verify payment method in Mollie dashboard
2. Check if subscription still exists in Mollie (not expired)
3. Verify `current_period_end` hasn't passed

**Solutions**:
- User must update payment method in Mollie portal
- Mollie will automatically retry charge
- Webhook will update status to `ACTIVE` upon successful payment

**Manual Recovery** (if needed):
1. Cancel old subscription
2. Create new subscription via "Reactivate" button
3. User completes new payment flow

### Subscription Status Not Updating

**Symptoms**: Webhook received, but subscription status unchanged

**Diagnosis**:
1. Check webhook event idempotency:
   ```sql
   SELECT * FROM webhook_events WHERE resource_id = 'tr_xxxxx';
   ```
   If exists, webhook was already processed
2. Check application logs for processing errors
3. Verify subscription exists:
   ```sql
   SELECT * FROM subscriptions WHERE provider_subscription_id = 'sub_xxxxx';
   ```

**Solutions**:
- If duplicate: Ignore (already processed)
- If error during processing: Check error logs, fix issue, trigger manual retry:
  ```bash
  curl -X POST https://yourdomain.com/api/v1/webhooks/mollie/retry
  ```
- If subscription not found: May be orphaned, contact support

---

## Timezone Handling

### Summary

- **Application**: All datetimes stored in **UTC** timezone
- **Mollie**: Interprets dates in **Europe/Amsterdam** timezone
- **Database**: PostgreSQL stores `TIMESTAMP WITH TIME ZONE` in UTC
- **API**: Returns ISO 8601 strings with timezone info

### Trial Start and End

When trial is created:
```python
now = datetime.now(timezone.utc)  # UTC: 2026-02-18 18:00:00+00:00
trial_end = now + timedelta(days=30)  # UTC: 2026-03-20 18:00:00+00:00
```

When activating subscription:
```python
start_date = subscription.trial_end_at.date()  # Date: 2026-03-20
# Mollie interprets as: 2026-03-20 00:00:00 Europe/Amsterdam
# Which is: 2026-03-19 23:00:00 UTC (CET in winter) or 2026-03-19 22:00:00 UTC (CEST in summer)
```

### Important Notes

1. **Date vs Datetime**: Mollie `startDate` is a **date** (YYYY-MM-DD), not datetime
2. **Timezone Offset**: Europe/Amsterdam is UTC+1 (winter) or UTC+2 (summer)
3. **DST Transitions**: Be aware of daylight saving time transitions (late March and late October)

### Recommendations

- **For trials**: Use full 30-day period, don't worry about exact hour
- **For billing**: Mollie handles timezone automatically, charges at midnight Amsterdam time
- **For display**: Always convert UTC to user's local timezone in frontend
- **For testing**: Use date-based assertions, not hour-level precision

### Example Code (Python)

```python
from datetime import datetime, timezone, timedelta
from dateutil import parser

# Create trial (UTC)
now = datetime.now(timezone.utc)
trial_end = now + timedelta(days=30)

# Convert to Mollie start date
start_date = trial_end.date()  # YYYY-MM-DD format

# Parse Mollie webhook date
mollie_next_payment = "2026-04-20"  # Date string from Mollie
next_payment_dt = parser.parse(mollie_next_payment)
# Result: 2026-04-20 00:00:00 (naive)
# Make timezone-aware (assume Europe/Amsterdam)
next_payment_dt = next_payment_dt.replace(tzinfo=timezone.utc)
# Store in database as UTC
```

---

## Summary

This runbook covers all critical aspects of production deployment and operations for Mollie subscription payments:

1. ✅ **Environment Variables**: Exact variable names and values for Coolify
2. ✅ **Mollie Dashboard**: Step-by-step webhook URL configuration
3. ✅ **Test Mode**: Using Mollie test API for safe testing
4. ✅ **E2E Scenarios**: 5 comprehensive test scenarios covering all states
5. ✅ **Troubleshooting**: Common issues and solutions
6. ✅ **Timezone Handling**: UTC ↔ Europe/Amsterdam conversion details

For additional support, consult:
- [Mollie API Documentation](https://docs.mollie.com/)
- [Mollie Subscriptions Guide](https://docs.mollie.com/payments/subscriptions)
- Application logs: `/var/log/app.log` or Coolify logs interface
