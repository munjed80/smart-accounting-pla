# Mollie Production Verification Checklist

Use this guide to verify the Mollie integration end-to-end on Coolify (production) using
Mollie **test mode**.

---

## Prerequisites

Confirm the following environment variables are set in Coolify before you start:

| Variable | Expected value | Notes |
|---|---|---|
| `MOLLIE_API_KEY` | `test_xxxxxxxxxxxx` | Must start with `test_` for test mode |
| `MOLLIE_WEBHOOK_SECRET` | any random secret string | Used to authenticate webhook calls |
| `APP_PUBLIC_URL` | `https://yourdomain.com` | Public-facing backend URL reachable by Mollie |

---

## Step 1 – Confirm startup logs

After redeploying the backend, check Coolify logs for:

```
Mollie integration: ENABLED | mode=TEST | webhook_secret_configured=True | public_url=https://yourdomain.com
```

**What to look for:**
- `mode=TEST` confirms test mode is active.
- `webhook_secret_configured=True` confirms the secret is loaded.
- `public_url` must match your real public URL (not `localhost`).

If you see `APP_PUBLIC_URL is not set`, set it in Coolify and redeploy.

---

## Step 2 – Confirm webhook URL via admin endpoint

Call the super-admin endpoint (requires super_admin JWT):

```
GET /api/v1/admin/mollie/webhook-config
Authorization: Bearer <super_admin_token>
```

Expected response (example):
```json
{
  "mollie_enabled": true,
  "mode": "TEST",
  "webhook_url_masked": "https://yourdomain.com/api/v1/webhooks/mollie?secret=***",
  "webhook_secret_configured": true,
  "app_public_url": "https://yourdomain.com",
  "route_path": "/api/v1/webhooks/mollie",
  "probe_instructions": "Send GET /api/v1/webhooks/mollie to verify the route is reachable. ..."
}
```

Copy the `webhook_url_masked` and replace `***` with your actual secret —
this is the URL you must register in the Mollie dashboard under
**Subscription → Edit → Webhook URL**.

---

## Step 3 – Verify webhook route is reachable

```
GET /api/v1/webhooks/mollie
```

Expected response:
```json
{"message": "Webhook endpoint ready; use POST"}
```

If this returns 404, the route is not mounted correctly.

---

## Step 4 – Activate a subscription (creates Mollie customer + subscription)

1. Log in as a ZZP user and call:

```
POST /api/v1/me/subscription/activate
Authorization: Bearer <zzp_user_token>
```

2. Check Coolify logs for:

```
Creating Mollie customer for email: xxx***
Created Mollie customer: cst_xxxxxxxx
Creating Mollie subscription for customer cst_xxxxxxxx: amount=6.95 EUR, interval=1 month
Created Mollie subscription: sub_xxxxxxxx for subscription <uuid>
```

3. Verify **expected DB fields** after activation:

| Field | Expected value |
|---|---|
| `provider` | `mollie` |
| `provider_customer_id` | `cst_xxxxxxxxxx` |
| `provider_subscription_id` | `sub_xxxxxxxxxx` |
| `status` | `TRIALING` |
| `trial_end_at` | ~30 days from now |
| `current_period_end` | `null` (set by first payment webhook) |

Check via admin endpoint:

```
GET /api/v1/admin/mollie/subscriptions/<administration_id>
Authorization: Bearer <super_admin_token>
```

4. Verify the same customer/subscription IDs appear in the Mollie test dashboard under
   **Customers** and **Subscriptions**.

---

## Step 5 – Idempotency check

Call `POST /api/v1/me/subscription/activate` a second time.  
Expected: same `provider_subscription_id` is returned – **no new customer or subscription is
created in Mollie**.

---

## Step 6 – Confirm webhook delivery

In the Mollie test dashboard, trigger a test payment for the subscription.

Check Coolify logs for:

```
Mollie webhook received: event_type=payment resource_id=tr_xxxxxxxxxx
Mollie webhook processing start: event_id=payment_tr_xxxxxxxxxx event_type=payment resource_id=tr_xxxxxxxxxx
Mollie webhook processing complete: event_id=payment_tr_xxxxxxxxxx event_type=payment subscription_id=sub_xxxxxxxxxx resulting_status=paid
```

**Expected DB fields after a successful payment:**

| Field | Expected value |
|---|---|
| `status` | `ACTIVE` |
| `current_period_start` | set to payment date |
| `current_period_end` | set to next billing date |

Verify via:
```
GET /api/v1/admin/mollie/subscriptions/<administration_id>
```

---

## Step 7 – Idempotent webhook replay

Re-send the same payment webhook (same `id`).  
Expected: log shows `already_processed`, DB unchanged.

---

## Troubleshooting

### Webhook returns 401

`MOLLIE_WEBHOOK_SECRET` doesn't match the `?secret=` in the URL registered with Mollie.
Re-check the masked URL from Step 2 and update the Mollie dashboard.

### Webhook `id` not found (400)

Mollie sends the payment `id` in the **form-encoded request body** (`id=tr_xxx`), not as
a query parameter.  The backend reads from the body first, then falls back to query params.
Confirm that no reverse-proxy strips or re-encodes the request body before it reaches the
backend.

### APP_PUBLIC_URL wrong

If `webhook_url_masked` shows `http://localhost:8000/…`, set `APP_PUBLIC_URL` to the real
public HTTPS URL in Coolify and redeploy.

### CORS blocks webhook

The Mollie webhook is a server-to-server call – CORS headers are not relevant.  The
`/webhooks/mollie` route accepts POST without CORS pre-flight issues.
