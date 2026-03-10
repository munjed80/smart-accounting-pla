# Billing Force-Paywall Test Mode

> **TEMPORARY testing change** — designed to be reverted in minutes with two env-var changes.

## Purpose

Test Mollie payment flow immediately on staging/production without waiting for trials to expire naturally.  
Two env flags control the entire feature:

| Env var | Default | Effect |
|---|---|---|
| `BILLING_FORCE_PAYWALL` | `false` | Block all ZZP users without ACTIVE subscription |
| `BILLING_TRIAL_OVERRIDE_DAYS` | *(not set)* | Shorten all TRIALING subscriptions to N days from now |

---

## Enabling Force-Paywall Mode

Set the following in your environment (`.env`, Coolify secrets, etc.):

```env
BILLING_FORCE_PAYWALL=true
BILLING_TRIAL_OVERRIDE_DAYS=0
```

Then **redeploy the backend**. The startup job runs automatically within seconds.

### What happens

1. **Backend startup** (`enforce_trial_override()`):
   - All subscriptions in `TRIALING` status with `trial_end_at > now + 0 days` are updated to `trial_end_at = now`.
   - All TRIALING subscriptions with `trial_end_at ≤ now` are transitioned to `EXPIRED`.
   - The job also runs every **5 minutes** in the background (idempotent).

2. **New users** who register while the override is active:
   - `ensure_trial_started()` creates a trial with `trial_end_at = now + BILLING_TRIAL_OVERRIDE_DAYS`.
   - With `BILLING_TRIAL_OVERRIDE_DAYS=0` their trial is immediately expired on the next entitlements check.

3. **Backend API enforcement** (`require_force_paywall` dependency):
   - All `/api/v1/zzp/*` endpoints check subscription status.
   - ZZP users without `ACTIVE` subscription receive **HTTP 402 Payment Required**.
   - Response body: `{"code": "SUBSCRIPTION_REQUIRED", "force_paywall": true, "status": "EXPIRED"}`.
   - **Subscription endpoints are exempt** (`/api/v1/me/subscription*`, `/api/v1/subscription/me`, webhooks).
   - **Accountants and super_admin are never blocked.**

4. **Frontend guard** (`ForcedPaywallScreen` in `App.tsx`):
   - On login the app fetches `/api/v1/me/subscription`.
   - The response includes `force_paywall: true` (set by `BILLING_FORCE_PAYWALL`).
   - If `force_paywall=true` and `is_paid=false` (not ACTIVE), the full-screen paywall is shown.
   - Only two actions are available: **Activate subscription** (→ `/settings`) and **Logout**.
   - Navigating to `/settings` is allowed so the user can activate via Mollie.
   - Accountants and super_admin never see the paywall.

---

## Verification Steps

### Existing ZZP user in trial

1. Enable the flags and redeploy.
2. Log in as the ZZP user.
3. Observe: `trial_end_at` in the DB is now ≤ `now`, status is `EXPIRED`.
4. App shows the `ForcedPaywallScreen` immediately.
5. Click **Activate subscription** → redirected to `/settings`.
6. Click **Activate** on the settings page → Mollie checkout flow opens.
7. Complete payment in Mollie test environment.
8. Webhook fires → subscription transitions to `ACTIVE`.
9. On next page load / subscription refresh → paywall disappears, full app is accessible.

### Non-paying user remains blocked

- After activation, if webhook has not yet fired, the user stays blocked.
- Backend `/api/v1/zzp/*` returns HTTP 402 until subscription is `ACTIVE`.

### Accountant bypass

- Log in as an accountant or super_admin.
- Neither the frontend paywall nor the backend 402 applies.
- Full app access regardless of force-paywall setting.

---

## Revert Plan

To disable force-paywall mode completely:

1. Set `BILLING_FORCE_PAYWALL=false` (or remove it).
2. Remove or unset `BILLING_TRIAL_OVERRIDE_DAYS`.
3. Redeploy.

After revert:
- `enforce_trial_override()` is a no-op (flag not set → returns immediately).
- `require_force_paywall` dependency is a no-op (flag false → returns immediately).
- Frontend `forcePaywall` is `false` → paywall screen never shown.
- Subscriptions that were expired during the test remain expired; they will need to be manually reactivated or you can re-seed them.

---

## Architecture Details

### Backend files changed

| File | Change |
|---|---|
| `backend/app/core/config.py` | Added `BILLING_FORCE_PAYWALL` and `BILLING_TRIAL_OVERRIDE_DAYS` env vars + properties |
| `backend/app/services/billing_maintenance.py` | **New** — `enforce_trial_override()` function |
| `backend/app/services/subscription_service.py` | `ensure_trial_started()` respects `BILLING_TRIAL_OVERRIDE_DAYS` for new subscriptions |
| `backend/app/schemas/subscription.py` | Added `force_paywall: bool` to `SubscriptionResponse` and `EntitlementResponse` |
| `backend/app/api/v1/subscriptions.py` | Passes `force_paywall` from settings to both endpoints |
| `backend/app/api/v1/deps.py` | Added `require_force_paywall` async dependency |
| `backend/app/main.py` | Startup + periodic billing maintenance; `require_force_paywall` added to all ZZP routers |

### Frontend files changed

| File | Change |
|---|---|
| `src/lib/api.ts` | Added `force_paywall: boolean` to `SubscriptionResponse` and `EntitlementResponse` |
| `src/hooks/useEntitlements.ts` | Exposes `forcePaywall: boolean` from hook result |
| `src/App.tsx` | Imports `useEntitlements`; renders `ForcedPaywallScreen` when paywall is active |

### Periodic maintenance loop

The background task (`_billing_maintenance_loop`) runs in the same FastAPI process:
- First execution: **immediately** on startup (before first request).
- Subsequent: **every 5 minutes** via `asyncio.sleep`.
- Errors are caught and logged; they do not crash the server.
- The loop is started via `asyncio.create_task()` inside the lifespan context.
