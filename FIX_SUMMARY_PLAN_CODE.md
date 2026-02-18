# Fix Summary: NOT NULL Constraint Violations for Plan Code Fields

## Problem
The database schema requires the `plans.code` and `subscriptions.plan_code` fields to be NOT NULL, but code was creating Plan and Subscription objects without providing values for these fields, causing:

```
sqlite3.IntegrityError: NOT NULL constraint failed: plans.code
sqlite3.IntegrityError: NOT NULL constraint failed: subscriptions.plan_code
```

## Root Cause
Multiple locations were creating Plan and Subscription objects without the required `code` and `plan_code` fields:

1. **backend/tests/test_admin_system.py** (Line 17)
   - Creating Plan without `code` field
   - Creating Subscription without `plan_code` field

2. **backend/app/api/v1/admin.py** (Line 363)
   - Creating Subscription without `plan_code` field in admin API endpoint

## Solution Applied

### 1. Fixed Test File (test_admin_system.py)
**Before:**
```python
plan = Plan(name='BASIC', price_monthly=19, max_invoices=100, max_storage_mb=500, max_users=2)
subscription = Subscription(
    administration_id=test_administration.id,
    plan_id=plan.id,
    status='active',
    starts_at=datetime.now(timezone.utc),
)
```

**After:**
```python
plan = Plan(code='basic', name='BASIC', price_monthly=19, trial_days=30, max_invoices=100, max_storage_mb=500, max_users=2)
subscription = Subscription(
    administration_id=test_administration.id,
    plan_id=plan.id,
    plan_code='basic',
    status='active',
    starts_at=datetime.now(timezone.utc),
)
```

### 2. Fixed Admin API (admin.py)
Added logic to fetch the Plan and extract its `code` before creating or updating Subscription:

**Before:**
```python
subscription = Subscription(
    administration_id=admin_id,
    plan_id=payload.plan_id,
    status=payload.status or "trial",
    starts_at=payload.starts_at or datetime.now(timezone.utc),
    ends_at=payload.ends_at,
)
```

**After:**
```python
# Fetch the plan to get the plan_code
plan = (await db.execute(select(Plan).where(Plan.id == payload.plan_id))).scalar_one_or_none()
if not plan:
    raise HTTPException(status_code=400, detail="Plan not found")

subscription = Subscription(
    administration_id=admin_id,
    plan_id=payload.plan_id,
    plan_code=plan.code,
    status=payload.status or "trial",
    starts_at=payload.starts_at or datetime.now(timezone.utc),
    ends_at=payload.ends_at,
)
```

## Test Results

✅ **All relevant tests pass:**
- `test_admin_system.py::test_admin_overview_happy_path` - PASSED
- `test_admin_system.py::test_admin_overview_forbidden_for_non_super_admin` - PASSED
- `test_subscription_service.py` - All 9 tests PASSED

## Files Changed
1. `backend/tests/test_admin_system.py` - Fixed Plan and Subscription creation in test
2. `backend/app/api/v1/admin.py` - Added Plan fetching logic for creating/updating Subscriptions

## Impact
- ✅ Fixes the NOT NULL constraint violations
- ✅ No breaking changes to existing functionality
- ✅ Maintains data consistency between plan_id and plan_code
- ✅ Adds validation to ensure Plan exists before creating Subscription
