# Fix Summary: Authentication in Subscription API Tests

## Problem
Tests in `backend/tests/test_subscription_api.py` were failing with **401 Unauthorized** errors.

The tests were using invalid authentication tokens:
```python
headers={"Authorization": f"Bearer test_token_{test_user.id}"}
```

## Root Cause
The application uses JWT tokens for authentication, validated by the `get_current_user` dependency which:
1. Extracts the token from the Authorization header
2. Decodes it using `decode_token()` from `app/core/security.py`
3. Validates the token signature with the SECRET_KEY
4. Looks up the user in the database

The test tokens like `"Bearer test_token_{test_user.id}"` were:
- Not valid JWT tokens
- Not signed with the SECRET_KEY
- Would fail JWT decoding, causing 401 errors

## Solution
Updated all 6 test functions to use the existing `auth_headers` fixture which:
- Creates proper JWT tokens using `create_access_token()`
- Signs them with the correct SECRET_KEY
- Includes valid user ID and email in the token payload

### Changes Made

**Before:**
```python
@pytest.mark.asyncio
async def test_get_my_subscription_auto_starts_trial(async_client, test_user, db_session):
    # ... test setup ...
    response = await async_client.get(
        "/api/v1/me/subscription",
        headers={"Authorization": f"Bearer test_token_{test_user.id}"},
    )
```

**After:**
```python
@pytest.mark.asyncio
async def test_get_my_subscription_auto_starts_trial(async_client, test_user, test_administration, auth_headers, db_session):
    # ... test setup ...
    response = await async_client.get(
        "/api/v1/me/subscription",
        headers=auth_headers,  # Uses proper JWT token
    )
```

### Additional Fixes
1. **Used `test_administration` fixture**: Prevented duplicate administration memberships by using the pre-created test administration instead of creating new ones in each test
2. **Fixed SQL query**: Used SQLAlchemy's `text()` wrapper for raw SQL in the "no administration" test

## Test Results

### ✅ Authentication Issue RESOLVED
- **Before**: 6/6 tests failed with 401 Unauthorized
- **After**: 3/6 tests pass, 3/6 tests fail with **non-authentication issues**

### Passing Tests
1. ✅ `test_get_my_subscription_returns_existing` - Gets existing subscription successfully
2. ✅ `test_start_trial` - Starts a trial subscription successfully
3. ✅ `test_start_trial_idempotent` - Verifies idempotency of trial start

### Failing Tests (Non-Auth Issues)
1. ❌ `test_get_my_subscription_auto_starts_trial` - **Timezone issue** (offset-naive vs offset-aware datetimes in SQLite)
2. ❌ `test_get_my_subscription_no_administration` - **Plan lookup issue** (zzp_basic plan not found when trying to auto-start trial)
3. ❌ `test_get_entitlements` - **Off-by-one calculation** (days_left_trial: expected 20, got 19)

These remaining failures are **unrelated to authentication** and are due to:
- SQLite returning timezone-naive datetimes vs PostgreSQL's timezone-aware datetimes
- Plan lookup/creation timing issues
- Date calculation edge cases

## Impact
✅ **Successfully fixed the authentication problem** - tests can now authenticate properly with the API
✅ **No regression** - existing tests remain unaffected
✅ **Half of subscription API tests now pass** - authentication no longer blocks test execution

## Files Changed
- `backend/tests/test_subscription_api.py` - Updated all 6 test functions to use proper authentication

## How Auth Works in Tests
1. `auth_headers` fixture creates a JWT token:
   ```python
   token = create_access_token(data={"sub": str(test_user.id), "email": test_user.email})
   return {"Authorization": f"Bearer {token}"}
   ```

2. FastAPI's `oauth2_scheme` extracts the token
3. `get_current_user` dependency validates and decodes it
4. User is looked up in the database
5. Request proceeds with authenticated user

## Next Steps (Optional)
The remaining test failures could be fixed by:
1. Ensuring datetime objects are timezone-aware in tests
2. Pre-seeding the zzp_basic plan in test fixtures
3. Adjusting date calculations to match expected behavior
