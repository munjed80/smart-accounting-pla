# Payments Production Runbook (Mollie Subscriptions)

## 1) Required Environment Variables (Coolify)
Set these exact keys in Coolify for the backend service:

- `ENV=production`
- `MOLLIE_API_KEY` (use `live_...` in production, `test_...` in staging/test)
- `MOLLIE_WEBHOOK_SECRET` (long random secret)
- `APP_PUBLIC_URL` (public backend base URL, e.g. `https://api.yourdomain.tld`)

Recommended companion values:

- `APP_URL` (internal/backend URL fallback)
- `FRONTEND_URL` (frontend URL for links and CORS)

Startup behavior:

- In non-production (`ENV != production`): missing Mollie env vars are logged as warnings.
- In production (`ENV=production`): app fails fast on startup if critical vars above are missing.

## 2) Mollie Dashboard Webhook Setup
In Mollie Dashboard:

1. Open **Developers → Webhooks** (or API/webhook settings for your app profile).
2. Ensure subscription/payment webhooks point to:

   - `https://<APP_PUBLIC_URL>/api/v1/webhooks/mollie?secret=<MOLLIE_WEBHOOK_SECRET>`

3. Validate:
   - URL is publicly reachable (HTTPS, no localhost/private URL).
   - Secret query parameter exactly matches backend env.

## 3) Webhook Reliability Model
Webhook endpoint now:

- verifies secret
- processes with short timeout
- returns `200` even when Mollie fetch is slow/fails
- stores deferred items as `PENDING_WEBHOOK_RETRY` in `pending_webhook_retries`
- supports retry via periodic/manual call:
  - `POST /api/v1/webhooks/mollie/retry-pending`

Suggested scheduler: run retry endpoint every 1–5 minutes.

## 4) Mollie Test Mode Webhook Validation
Use Mollie test mode (`test_...` API key):

1. Create user and start trial (implicit on subscription fetch).
2. Activate subscription while in trial (scheduled start expected).
3. Trigger payment/subscription webhook in Mollie test dashboard.
4. Confirm backend status transitions in `/api/v1/me/subscription`.

## 5) E2E Verification Script

A. **Create user → start trial**
- Register/login as ZZP user.
- Open settings/subscription view.
- Confirm `status=TRIALING`, `trial_end_at` exists.

B. **Activate during trial (scheduled)**
- Click activate.
- Confirm `scheduled=true`, `provider_subscription_id` exists.
- Confirm `startDate` aligns with trial end date.

C. **Simulate webhook paid → ACTIVE**
- Send/trigger `payment.paid` webhook for subscription payment.
- Confirm `status=ACTIVE` and paid features unlock immediately.

D. **Simulate webhook failed → PAST_DUE + gating**
- Send/trigger failed payment webhook (`failed/expired/canceled`).
- Confirm `status=PAST_DUE`.
- Confirm gated actions are blocked immediately.

E. **Cancel → cancel_at_period_end behavior**
- Cancel active subscription.
- Confirm `cancel_at_period_end=true` and status remains `ACTIVE` until `current_period_end`.
- After period end passes, confirm state transitions to `CANCELED`.

## 6) Troubleshooting

### Webhook not arriving
- Check `APP_PUBLIC_URL` resolves publicly and has valid TLS cert.
- Verify reverse proxy routes `/api/v1/webhooks/mollie` to backend.
- Confirm Mollie is configured for the correct environment (test/live profile).

### Secret mismatch
- Confirm `?secret=` in webhook URL equals `MOLLIE_WEBHOOK_SECRET` exactly.
- Rotate and reapply both sides if uncertain.

### Wrong `APP_PUBLIC_URL`
- Symptoms: Mollie delivery failures, no incoming webhook logs.
- Fix URL to public backend domain (not frontend domain unless routed correctly).

### Timezone issues (`startDate`, `trial_end_at`)
- Canonical storage/processing is UTC.
- For business display and operational checks, validate as Europe/Amsterdam.
- Ensure conversions are deterministic around DST changes (especially midnight boundaries).
