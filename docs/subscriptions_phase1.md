# Subscription Foundation - Phase 1 Documentation

**Status**: Phase 1 Complete (Provider-Agnostic, Pre-Mollie Integration)  
**Date**: 2026-02-18  
**Version**: 1.0

## Overview

This document describes the subscription foundation for the ZZP accounting platform. Phase 1 implements the subscription state machine, entitlement logic, and payment gates **without** integrating with any payment provider (Mollie integration comes in Phase 2).

## Pricing Rules

### ZZP Basic Plan
- **Plan Code**: `zzp_basic`
- **Monthly Price**: €6.95
- **Trial Period**: 30 days free
- **Target Audience**: ZZP (freelancer) users only

### Accountant Access
- **No Subscription Required**: Accountants have unrestricted access to all features
- **Business Model**: Contact-based pricing (not self-serve)
- **Access Control**: Accountant features are NOT gated by subscription

## Subscription States

The subscription follows a state machine with the following states:

| State | Description | Pro Features | Payment Required |
|-------|-------------|--------------|------------------|
| `TRIALING` | Within 30-day free trial | ✅ Yes | ❌ No |
| `ACTIVE` | Paid subscription active | ✅ Yes | ✅ Yes |
| `PAST_DUE` | Payment failed, grace period | ❌ No | ✅ Yes |
| `CANCELED` | User canceled subscription | ❌ No | ❌ No |
| `EXPIRED` | Trial ended, no payment | ❌ No | ❌ No |

### State Transitions

```
[No Subscription] 
    ↓ (ensure_trial_started)
[TRIALING] ────────────────────────────────────────→ [EXPIRED]
    ↓                                (trial_end_at passed)
    ↓ (payment provider activates - Phase 2)
[ACTIVE] ──────→ [PAST_DUE] ──────→ [CANCELED]
    ↓         (payment failed)    (grace ended)
    ↓ (user cancels)
[CANCELED]
```

## Feature Gating Map

### Gated Features (Require Subscription After Trial)

These features are available during trial but require an active subscription once the trial expires:

1. **VAT Actions** (`vat_actions`)
   - Mark VAT return as ready
   - Queue VAT submission
   - Sign VAT return
   - Submit VAT return to Digipoort

2. **Bank Reconciliation Actions** (`bank_reconcile_actions`)
   - Accept match suggestions
   - Finalize reconciliations
   - Bulk reconciliation operations

3. **Exports** (`exports`)
   - CSV/PDF exports for invoices
   - CSV/PDF exports for expenses
   - CSV/PDF exports for time entries
   - CSV/PDF exports for VAT returns

### Free Features (Never Gated)

These features remain accessible even without an active subscription:

- User login and authentication
- User onboarding
- Creating invoices (draft state)
- Viewing dashboard (basic view)
- Adding customers
- Basic time entries (view and create)
- Account settings

### Accountant Features (Not Gated)

All accountant features are always accessible without subscription checks:
- Client assignment and consent management
- Document review queue
- Accountant dashboard
- Client data access
- Bookkeeping and ledger operations

## API Endpoints

### GET /api/v1/me/subscription

Returns the current user's subscription status and entitlements.

**Response Schema**:
```json
{
  "id": "uuid",
  "administration_id": "uuid",
  "plan_code": "zzp_basic",
  "status": "TRIALING",
  "trial_start_at": "2026-02-18T10:00:00Z",
  "trial_end_at": "2026-03-20T10:00:00Z",
  "current_period_start": null,
  "current_period_end": null,
  "cancel_at_period_end": false,
  "created_at": "2026-02-18T10:00:00Z",
  "updated_at": "2026-02-18T10:00:00Z",
  "is_paid": false,
  "in_trial": true,
  "can_use_pro_features": true,
  "days_left_trial": 30
}
```

### POST /api/v1/me/subscription/start-trial

Starts a trial subscription for the current user (idempotent).

**Request Body**: `{}`

**Response Schema**:
```json
{
  "subscription_id": "uuid",
  "status": "TRIALING",
  "trial_start_at": "2026-02-18T10:00:00Z",
  "trial_end_at": "2026-03-20T10:00:00Z",
  "message": "Proefperiode gestart! Je hebt 30 dagen gratis toegang."
}
```

### GET /api/v1/me/subscription/entitlements

Returns quick access flags for feature availability (useful for frontend caching).

**Response Schema**:
```json
{
  "is_paid": false,
  "in_trial": true,
  "can_use_pro_features": true,
  "days_left_trial": 30,
  "status": "TRIALING",
  "plan_code": "zzp_basic"
}
```

## Backend Implementation

### Database Schema

#### `plans` Table (Updated)
- `id` (UUID, PK)
- `code` (String, Unique, Indexed) - e.g., "zzp_basic"
- `name` (String, Unique, Indexed)
- `price_monthly` (Decimal)
- `trial_days` (Integer) - Default 30
- `max_invoices`, `max_storage_mb`, `max_users` (Integer)
- `created_at` (Timestamp)

#### `subscriptions` Table (Updated)
- `id` (UUID, PK)
- `administration_id` (UUID, FK → administrations, Indexed)
- `plan_id` (UUID, FK → plans)
- `plan_code` (String, Indexed) - Denormalized for quick checks
- `status` (Enum: TRIALING, ACTIVE, PAST_DUE, CANCELED, EXPIRED)
- `trial_start_at`, `trial_end_at` (Timestamp, Nullable)
- `current_period_start`, `current_period_end` (Timestamp, Nullable)
- `cancel_at_period_end` (Boolean)
- `provider`, `provider_customer_id`, `provider_subscription_id` (String, Nullable)
- `created_at`, `updated_at` (Timestamp)

### Subscription Service

**Location**: `backend/app/services/subscription_service.py`

**Key Functions**:

1. `ensure_trial_started(db, administration_id)` → Subscription
   - Idempotent: Creates trial if none exists, returns existing otherwise
   - Auto-creates TRIALING subscription with 30-day trial period

2. `get_subscription(db, administration_id)` → Subscription | None
   - Fetches current subscription for administration

3. `compute_entitlements(db, administration_id, now=None)` → EntitlementResult
   - Computes entitlement flags based on subscription state
   - Auto-transitions TRIALING → EXPIRED if trial_end_at passed
   - Returns: `is_paid`, `in_trial`, `can_use_pro_features`, `days_left_trial`, `status`

### Entitlement Guard (Dependency)

**Location**: `backend/app/api/v1/deps.py`

**Function**: `require_zzp_entitlement(feature, current_user, db, administration_id=None)`

**Usage**:
```python
from app.api.v1.deps import require_feature

@router.post("/vat/submit")
async def submit_vat(
    _: None = Depends(require_feature("vat_actions")),
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Implementation
```

**Behavior**:
- Accountants and admins bypass all subscription checks
- ZZP users are checked for entitlements
- Returns HTTP 402 if subscription required but not active/trial
- Error response includes `code`, `feature`, `message_nl`, `status`, `days_left_trial`

## Error Contract

When a user is blocked by an entitlement check, the API returns:

**HTTP 402 Payment Required**
```json
{
  "detail": {
    "code": "SUBSCRIPTION_REQUIRED",
    "feature": "vat_actions",
    "message_nl": "Abonnement vereist om deze actie te gebruiken.",
    "status": "EXPIRED",
    "in_trial": false,
    "days_left_trial": 0
  }
}
```

## Test Scenarios

### Test Scenario 1: New ZZP User - Auto Trial Start
1. User registers and logs in
2. User navigates to dashboard
3. Frontend calls `/api/v1/me/subscription`
4. Backend auto-creates TRIALING subscription
5. User sees banner: "Proefperiode actief — 30 dagen over"
6. User can access all pro features

### Test Scenario 2: Trial Active - Feature Access
1. User has TRIALING subscription with 15 days left
2. User attempts VAT submission
3. Frontend checks entitlements: `can_use_pro_features = true`
4. Action is allowed
5. Banner shows: "Proefperiode actief — 15 dagen over"

### Test Scenario 3: Trial Expired - Feature Blocked
1. User's trial ended 5 days ago
2. Backend auto-transitions TRIALING → EXPIRED on next entitlement check
3. User attempts bank reconciliation action
4. Backend returns HTTP 402 with `SUBSCRIPTION_REQUIRED`
5. Frontend shows paywall modal: "Proefperiode afgelopen — activeer abonnement"
6. Action is blocked

### Test Scenario 4: Active Subscription - Full Access
1. User has ACTIVE paid subscription
2. User can access all pro features without restrictions
3. No trial banner shown (or shows "Abonnement actief")

### Test Scenario 5: Accountant Bypass
1. User with role=ACCOUNTANT
2. No subscription checks are performed
3. Full access to all features regardless of client subscriptions

## Frontend Integration (Next Steps)

### Required Components
1. **SubscriptionBanner** - Shows trial status at top of dashboard
2. **PaywallModal** - Blocks gated actions when subscription required
3. **useEntitlements** hook - Fetches and caches entitlement state

### Example Banner Messages
- Trial Active: "Proefperiode actief — 15 dagen over"
- Trial Expired: "Proefperiode afgelopen — activeer abonnement voor €6,95/maand"
- Active: "Abonnement actief"
- Canceled: "Abonnement geannuleerd — verlengd niet automatisch"

## Phase 2: Mollie Integration (Future)

Phase 2 will add:
- Mollie checkout flow
- Webhook handling for subscription events
- Automatic status updates (TRIALING → ACTIVE on first payment)
- Payment failure handling (ACTIVE → PAST_DUE)
- Subscription cancellation flow

The provider-agnostic design ensures Phase 1 code requires minimal changes for Phase 2.

## Migration Notes

**Migration File**: `044_add_subscription_phase1_fields.py`

**Actions**:
1. Adds `code`, `trial_days` to `plans` table
2. Adds new fields to `subscriptions` table
3. Creates `subscriptionstatus` enum type
4. Migrates existing status strings to enum values
5. Backfills `plan_code` from plan relationship

**Rollback**: Full downgrade support included in migration

## Security Considerations

- Subscription status is computed server-side (cannot be manipulated by client)
- Entitlement checks are enforced at API level (not just UI)
- Accountant bypass logic is role-based and verified via JWT token
- No payment provider credentials in Phase 1 (stateless)

## Monitoring Recommendations

Track these metrics:
- Trial start rate (% of new users who trigger trial)
- Trial expiration rate (% of trials that expire without converting)
- Feature gate hits (how often users hit 402 errors)
- Trial days left distribution (when do users typically convert?)

## Support & Troubleshooting

### Common Issues

**Issue**: User sees "No administration" error  
**Cause**: User not linked to an administration  
**Fix**: Ensure AdministrationMember record exists for user

**Issue**: Trial not starting automatically  
**Cause**: Missing ZZP Basic plan in database  
**Fix**: Run `python seed.py` to seed default plans

**Issue**: Accountant users seeing subscription prompts  
**Cause**: Frontend not checking user role  
**Fix**: Ensure frontend checks `user.role === 'accountant'` before showing banners

## Changelog

### Version 1.0 (2026-02-18)
- Initial implementation of subscription foundation
- Database migration for Phase 1 fields
- Subscription service with state machine
- Entitlement guard for feature gating
- API endpoints for subscription management
- Backend tests for service and API
- Documentation created
