"""
Tests for billing maintenance (force-paywall test mode).

Covers:
- enforce_trial_override() shortens existing TRIALING subscriptions
- enforce_trial_override() expires subscriptions when override_days=0
- enforce_trial_override() is a no-op when BILLING_TRIAL_OVERRIDE_DAYS is not set
- ensure_trial_started() respects BILLING_TRIAL_OVERRIDE_DAYS for new subscriptions
- require_force_paywall dependency blocks ZZP users without ACTIVE subscription
- require_force_paywall dependency does NOT block accountants
"""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock

from sqlalchemy import select

from app.models.subscription import Plan, Subscription, SubscriptionStatus
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.user import User
from app.services.billing_maintenance import enforce_trial_override
from app.services.subscription_service import subscription_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _make_plan(db_session) -> Plan:
    """Return existing free plan or create one."""
    result = await db_session.execute(select(Plan).where(Plan.code == "free"))
    existing = result.scalar_one_or_none()
    if existing:
        return existing
    plan = Plan(
        code="free",
        name="Free",
        price_monthly=0.00,
        trial_days=30,
        max_invoices=999999,
        max_storage_mb=5120,
        max_users=1,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


async def _make_trialing_subscription(db_session, admin_id, plan, days_remaining: int) -> Subscription:
    """Create a TRIALING subscription with trial ending in `days_remaining` days."""
    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=admin_id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now - timedelta(days=30 - days_remaining),
        trial_end_at=now + timedelta(days=days_remaining),
        starts_at=now - timedelta(days=30 - days_remaining),
        cancel_at_period_end=False,
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)
    return sub


# ---------------------------------------------------------------------------
# enforce_trial_override tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enforce_trial_override_noop_when_not_set(db_session):
    """When BILLING_TRIAL_OVERRIDE_DAYS is not set, nothing changes."""
    plan = await _make_plan(db_session)
    admin = Administration(name="Test Admin", description="")
    db_session.add(admin)
    await db_session.commit()

    sub = await _make_trialing_subscription(db_session, admin.id, plan, days_remaining=20)
    original_end = sub.trial_end_at

    # Patch settings to have no override
    with patch("app.services.billing_maintenance.settings") as mock_settings:
        mock_settings.billing_trial_override_days = None
        await enforce_trial_override(db_session)

    await db_session.refresh(sub)
    assert sub.trial_end_at == original_end
    assert sub.status == SubscriptionStatus.TRIALING


@pytest.mark.asyncio
async def test_enforce_trial_override_shortens_long_trial(db_session):
    """Subscriptions with trial longer than override_days get shortened."""
    plan = await _make_plan(db_session)
    admin = Administration(name="Test Admin 2", description="")
    db_session.add(admin)
    await db_session.commit()

    # Trial ending in 20 days → should be shortened to 1 day
    sub = await _make_trialing_subscription(db_session, admin.id, plan, days_remaining=20)

    with patch("app.services.billing_maintenance.settings") as mock_settings:
        mock_settings.billing_trial_override_days = 1
        await enforce_trial_override(db_session)

    await db_session.refresh(sub)
    now = datetime.now(timezone.utc)
    # trial_end_at should be ~now + 1 day (within a small window)
    assert sub.status == SubscriptionStatus.TRIALING
    assert sub.trial_end_at is not None
    # Normalise to UTC for comparison (SQLite returns naive datetimes)
    trial_end_utc = sub.trial_end_at if sub.trial_end_at.tzinfo else sub.trial_end_at.replace(tzinfo=timezone.utc)
    delta = trial_end_utc - now
    assert 0 <= delta.total_seconds() <= 86400 + 60  # <= 1 day + 60s tolerance


@pytest.mark.asyncio
async def test_enforce_trial_override_does_not_extend_short_trial(db_session):
    """Subscriptions shorter than override_days are NOT extended."""
    plan = await _make_plan(db_session)
    admin = Administration(name="Test Admin 3", description="")
    db_session.add(admin)
    await db_session.commit()

    # Trial ending in 1 hour → override is 2 days, should NOT be extended
    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now - timedelta(days=28),
        trial_end_at=now + timedelta(hours=1),
        starts_at=now - timedelta(days=28),
        cancel_at_period_end=False,
    )
    db_session.add(sub)
    await db_session.commit()

    original_end = sub.trial_end_at

    with patch("app.services.billing_maintenance.settings") as mock_settings:
        mock_settings.billing_trial_override_days = 2
        await enforce_trial_override(db_session)

    await db_session.refresh(sub)
    # Should still be ~now + 1 hour (not extended to 2 days)
    # Normalise timezone for comparison (SQLite may return naive datetimes)
    retrieved_end = sub.trial_end_at if sub.trial_end_at.tzinfo else sub.trial_end_at.replace(tzinfo=timezone.utc)
    original_end_utc = original_end if original_end.tzinfo else original_end.replace(tzinfo=timezone.utc)
    assert abs((retrieved_end - original_end_utc).total_seconds()) < 5  # within 5s


@pytest.mark.asyncio
async def test_enforce_trial_override_zero_expires_all_trialing(db_session):
    """With override_days=0, all TRIALING subscriptions become EXPIRED."""
    plan = await _make_plan(db_session)
    admin = Administration(name="Test Admin 4", description="")
    db_session.add(admin)
    await db_session.commit()

    sub = await _make_trialing_subscription(db_session, admin.id, plan, days_remaining=15)

    with patch("app.services.billing_maintenance.settings") as mock_settings:
        mock_settings.billing_trial_override_days = 0
        await enforce_trial_override(db_session)

    await db_session.refresh(sub)
    assert sub.status == SubscriptionStatus.EXPIRED


@pytest.mark.asyncio
async def test_enforce_trial_override_idempotent(db_session):
    """Running enforce_trial_override twice produces the same result."""
    plan = await _make_plan(db_session)
    admin = Administration(name="Test Admin 5", description="")
    db_session.add(admin)
    await db_session.commit()

    sub = await _make_trialing_subscription(db_session, admin.id, plan, days_remaining=20)

    with patch("app.services.billing_maintenance.settings") as mock_settings:
        mock_settings.billing_trial_override_days = 0
        await enforce_trial_override(db_session)
        await enforce_trial_override(db_session)  # second run

    await db_session.refresh(sub)
    assert sub.status == SubscriptionStatus.EXPIRED  # still EXPIRED, not double-processed


@pytest.mark.asyncio
async def test_enforce_trial_override_leaves_active_subscriptions_untouched(db_session):
    """ACTIVE subscriptions are never touched by enforce_trial_override."""
    plan = await _make_plan(db_session)
    admin = Administration(name="Test Admin 6", description="")
    db_session.add(admin)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.ACTIVE,
        trial_start_at=now - timedelta(days=60),
        trial_end_at=now - timedelta(days=30),
        current_period_start=now - timedelta(days=15),
        current_period_end=now + timedelta(days=15),
        starts_at=now - timedelta(days=60),
        cancel_at_period_end=False,
    )
    db_session.add(sub)
    await db_session.commit()

    with patch("app.services.billing_maintenance.settings") as mock_settings:
        mock_settings.billing_trial_override_days = 0
        await enforce_trial_override(db_session)

    await db_session.refresh(sub)
    assert sub.status == SubscriptionStatus.ACTIVE


# ---------------------------------------------------------------------------
# ensure_trial_started respects BILLING_TRIAL_OVERRIDE_DAYS
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ensure_trial_started_uses_override_days(db_session):
    """When BILLING_TRIAL_OVERRIDE_DAYS=1, new trials are created with 1-day duration."""
    plan = await _make_plan(db_session)
    admin = Administration(name="Test Admin 7", description="")
    db_session.add(admin)
    await db_session.commit()

    with patch("app.services.subscription_service.settings") as mock_settings:
        mock_settings.billing_trial_override_days = 1
        sub = await subscription_service.ensure_trial_started(db_session, admin.id)

    now = datetime.now(timezone.utc)
    trial_end_utc = sub.trial_end_at if sub.trial_end_at.tzinfo else sub.trial_end_at.replace(tzinfo=timezone.utc)
    delta = trial_end_utc - now
    # Should be approximately 1 day (within a small tolerance)
    assert 0 <= delta.total_seconds() <= 86400 + 60


@pytest.mark.asyncio
async def test_ensure_trial_started_zero_override_creates_expired_trial(db_session):
    """When BILLING_TRIAL_OVERRIDE_DAYS=0, new trial has trial_end_at = now."""
    plan = await _make_plan(db_session)
    admin = Administration(name="Test Admin 8", description="")
    db_session.add(admin)
    await db_session.commit()

    with patch("app.services.subscription_service.settings") as mock_settings:
        mock_settings.billing_trial_override_days = 0
        sub = await subscription_service.ensure_trial_started(db_session, admin.id)

    now = datetime.now(timezone.utc)
    # trial_end_at should be <= now (or very close to now)
    trial_end_utc = sub.trial_end_at if sub.trial_end_at.tzinfo else sub.trial_end_at.replace(tzinfo=timezone.utc)
    assert trial_end_utc <= now + timedelta(seconds=5)

    # compute_entitlements should transition this to EXPIRED
    entitlements = await subscription_service.compute_entitlements(db_session, admin.id)
    assert entitlements.status == "EXPIRED"
    assert entitlements.can_use_pro_features is False


# ---------------------------------------------------------------------------
# force_paywall field in subscription response
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_my_subscription_includes_force_paywall_flag(
    async_client,
    test_administration,
    test_zzp_plan,
    auth_headers,
    db_session,
):
    """GET /me/subscription response includes force_paywall field."""
    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=14),
        starts_at=now,
        cancel_at_period_end=False,
    )
    db_session.add(sub)
    await db_session.commit()

    with patch("app.api.v1.subscriptions.settings") as mock_settings:
        mock_settings.billing_force_paywall = False
        response = await async_client.get("/api/v1/me/subscription", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert "force_paywall" in data
    assert data["force_paywall"] is False


@pytest.mark.asyncio
async def test_get_my_subscription_force_paywall_true(
    async_client,
    test_administration,
    test_zzp_plan,
    auth_headers,
    db_session,
):
    """When BILLING_FORCE_PAYWALL=true, GET /me/subscription returns force_paywall=true."""
    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.EXPIRED,
        trial_start_at=now - timedelta(days=31),
        trial_end_at=now - timedelta(days=1),
        starts_at=now - timedelta(days=31),
        cancel_at_period_end=False,
    )
    db_session.add(sub)
    await db_session.commit()

    with patch("app.api.v1.subscriptions.settings") as mock_settings:
        mock_settings.billing_force_paywall = True
        response = await async_client.get("/api/v1/me/subscription", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["force_paywall"] is True
    assert data["is_paid"] is False


# ---------------------------------------------------------------------------
# require_force_paywall dependency
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_force_paywall_blocks_zzp_with_expired_subscription(
    async_client,
    test_administration,
    test_zzp_plan,
    auth_headers,
    db_session,
):
    """ZZP user with EXPIRED subscription gets 402 when force paywall is enabled."""
    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.EXPIRED,
        trial_start_at=now - timedelta(days=31),
        trial_end_at=now - timedelta(days=1),
        starts_at=now - timedelta(days=31),
        cancel_at_period_end=False,
    )
    db_session.add(sub)
    await db_session.commit()

    with patch("app.api.v1.deps.settings") as mock_settings:
        mock_settings.billing_force_paywall = True
        response = await async_client.get("/api/v1/zzp/dashboard", headers=auth_headers)

    assert response.status_code == 402
    detail = response.json()["detail"]
    assert detail["code"] == "SUBSCRIPTION_REQUIRED"
    assert detail["force_paywall"] is True


@pytest.mark.asyncio
async def test_force_paywall_allows_zzp_with_active_subscription(
    async_client,
    test_administration,
    test_zzp_plan,
    auth_headers,
    db_session,
):
    """ZZP user with ACTIVE subscription is NOT blocked by force paywall."""
    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.ACTIVE,
        trial_start_at=now - timedelta(days=30),
        trial_end_at=now - timedelta(days=1),
        current_period_start=now - timedelta(days=1),
        current_period_end=now + timedelta(days=29),
        starts_at=now - timedelta(days=30),
        cancel_at_period_end=False,
    )
    db_session.add(sub)
    await db_session.commit()

    with patch("app.api.v1.deps.settings") as mock_settings:
        mock_settings.billing_force_paywall = True
        response = await async_client.get("/api/v1/zzp/dashboard", headers=auth_headers)

    # Should NOT return 402 (actual dashboard response may be 200 or other non-402)
    assert response.status_code != 402


@pytest.mark.asyncio
async def test_force_paywall_does_not_block_when_disabled(
    async_client,
    test_administration,
    test_zzp_plan,
    auth_headers,
    db_session,
):
    """When BILLING_FORCE_PAYWALL=false, expired ZZP user is NOT blocked at API level."""
    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.EXPIRED,
        trial_start_at=now - timedelta(days=31),
        trial_end_at=now - timedelta(days=1),
        starts_at=now - timedelta(days=31),
        cancel_at_period_end=False,
    )
    db_session.add(sub)
    await db_session.commit()

    with patch("app.api.v1.deps.settings") as mock_settings:
        mock_settings.billing_force_paywall = False
        response = await async_client.get("/api/v1/zzp/dashboard", headers=auth_headers)

    # Should NOT return 402
    assert response.status_code != 402


@pytest.mark.asyncio
async def test_force_paywall_does_not_block_accountant(
    async_client,
    db_session,
):
    """Accountant users are never blocked by force paywall regardless of their subscription."""
    from app.core.security import create_access_token

    accountant = User(
        email="accountant-test@example.com",
        hashed_password="hashed",
        full_name="Test Accountant",
        role="accountant",
        is_active=True,
    )
    db_session.add(accountant)
    await db_session.commit()

    token = create_access_token(data={"sub": str(accountant.id), "email": accountant.email})
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.api.v1.deps.settings") as mock_settings:
        mock_settings.billing_force_paywall = True
        # Accountants typically hit /accountant/* routes; just verify no 402 on a ZZP route
        # (accountant has no ZZP administration so route may 404 for business reasons, but NOT 402)
        response = await async_client.get("/api/v1/zzp/dashboard", headers=headers)

    assert response.status_code != 402
