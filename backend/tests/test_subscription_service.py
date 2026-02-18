"""
Tests for subscription service and entitlement logic.

Tests the subscription state machine, trial handling, and entitlement computation.
"""
import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select

from app.services.subscription_service import subscription_service, EntitlementResult
from app.models.subscription import Plan, Subscription, SubscriptionStatus
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.user import User


@pytest.mark.asyncio
async def test_ensure_trial_started_creates_new_subscription(db_session):
    """Test that ensure_trial_started creates a new trial subscription"""
    # Create test user and administration
    user = User(
        email="test@example.com",
        hashed_password="hashed",
        full_name="Test User",
        role="zzp",
        is_active=True,
    )
    db_session.add(user)
    
    admin = Administration(
        name="Test Admin",
        description="Test",
    )
    db_session.add(admin)
    await db_session.commit()
    
    # Create ZZP Basic plan
    plan = Plan(
        code="zzp_basic",
        name="ZZP Basic",
        price_monthly=6.95,
        trial_days=30,
        max_invoices=999999,
        max_storage_mb=5120,
        max_users=1,
    )
    db_session.add(plan)
    await db_session.commit()
    
    # Ensure trial started
    subscription = await subscription_service.ensure_trial_started(db_session, admin.id)
    
    # Assertions
    assert subscription is not None
    assert subscription.administration_id == admin.id
    assert subscription.plan_code == "zzp_basic"
    assert subscription.status == SubscriptionStatus.TRIALING
    assert subscription.trial_start_at is not None
    assert subscription.trial_end_at is not None
    assert subscription.cancel_at_period_end is False
    
    # Check trial duration
    trial_duration = subscription.trial_end_at - subscription.trial_start_at
    assert trial_duration.days == 30


@pytest.mark.asyncio
async def test_ensure_trial_started_is_idempotent(db_session):
    """Test that ensure_trial_started is idempotent and returns existing subscription"""
    # Create test administration and plan
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)
    
    plan = Plan(
        code="zzp_basic",
        name="ZZP Basic",
        price_monthly=6.95,
        trial_days=30,
        max_invoices=999999,
        max_storage_mb=5120,
        max_users=1,
    )
    db_session.add(plan)
    await db_session.commit()
    
    # First call - creates subscription
    subscription1 = await subscription_service.ensure_trial_started(db_session, admin.id)
    sub1_id = subscription1.id
    
    # Second call - should return same subscription
    subscription2 = await subscription_service.ensure_trial_started(db_session, admin.id)
    
    # Assertions
    assert subscription1.id == subscription2.id
    assert subscription2.id == sub1_id


@pytest.mark.asyncio
async def test_compute_entitlements_during_trial(db_session):
    """Test entitlements during active trial period"""
    # Create administration and plan
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)
    
    plan = Plan(
        code="zzp_basic",
        name="ZZP Basic",
        price_monthly=6.95,
        trial_days=30,
        max_invoices=999999,
        max_storage_mb=5120,
        max_users=1,
    )
    db_session.add(plan)
    await db_session.commit()
    
    # Create trial subscription
    now = datetime.now(timezone.utc)
    trial_end = now + timedelta(days=15)  # 15 days left in trial
    
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now - timedelta(days=15),
        trial_end_at=trial_end,
        starts_at=now - timedelta(days=15),
        cancel_at_period_end=False,
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Compute entitlements
    entitlements = await subscription_service.compute_entitlements(db_session, admin.id, now)
    
    # Assertions
    assert entitlements.in_trial is True
    assert entitlements.is_paid is False
    assert entitlements.can_use_pro_features is True
    assert entitlements.days_left_trial == 15
    assert entitlements.status == "TRIALING"


@pytest.mark.asyncio
async def test_compute_entitlements_trial_expired(db_session):
    """Test entitlements after trial has expired"""
    # Create administration and plan
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)
    
    plan = Plan(
        code="zzp_basic",
        name="ZZP Basic",
        price_monthly=6.95,
        trial_days=30,
        max_invoices=999999,
        max_storage_mb=5120,
        max_users=1,
    )
    db_session.add(plan)
    await db_session.commit()
    
    # Create expired trial subscription
    now = datetime.now(timezone.utc)
    trial_end = now - timedelta(days=5)  # Trial ended 5 days ago
    
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=trial_end - timedelta(days=30),
        trial_end_at=trial_end,
        starts_at=trial_end - timedelta(days=30),
        cancel_at_period_end=False,
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Compute entitlements
    entitlements = await subscription_service.compute_entitlements(db_session, admin.id, now)
    
    # Assertions
    assert entitlements.in_trial is False
    assert entitlements.is_paid is False
    assert entitlements.can_use_pro_features is False
    assert entitlements.days_left_trial == 0
    assert entitlements.status == "EXPIRED"
    
    # Verify subscription status was updated to EXPIRED
    result = await db_session.execute(
        select(Subscription).where(Subscription.id == subscription.id)
    )
    updated_subscription = result.scalar_one()
    assert updated_subscription.status == SubscriptionStatus.EXPIRED


@pytest.mark.asyncio
async def test_compute_entitlements_active_subscription(db_session):
    """Test entitlements for active paid subscription"""
    # Create administration and plan
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)
    
    plan = Plan(
        code="zzp_basic",
        name="ZZP Basic",
        price_monthly=6.95,
        trial_days=30,
        max_invoices=999999,
        max_storage_mb=5120,
        max_users=1,
    )
    db_session.add(plan)
    await db_session.commit()
    
    # Create active subscription
    now = datetime.now(timezone.utc)
    
    subscription = Subscription(
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
    db_session.add(subscription)
    await db_session.commit()
    
    # Compute entitlements
    entitlements = await subscription_service.compute_entitlements(db_session, admin.id, now)
    
    # Assertions
    assert entitlements.in_trial is False
    assert entitlements.is_paid is True
    assert entitlements.can_use_pro_features is True
    assert entitlements.days_left_trial == 0
    assert entitlements.status == "ACTIVE"


@pytest.mark.asyncio
async def test_compute_entitlements_canceled_subscription(db_session):
    """Test entitlements for canceled subscription"""
    # Create administration and plan
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)
    
    plan = Plan(
        code="zzp_basic",
        name="ZZP Basic",
        price_monthly=6.95,
        trial_days=30,
        max_invoices=999999,
        max_storage_mb=5120,
        max_users=1,
    )
    db_session.add(plan)
    await db_session.commit()
    
    # Create canceled subscription
    now = datetime.now(timezone.utc)
    
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.CANCELED,
        trial_start_at=now - timedelta(days=60),
        trial_end_at=now - timedelta(days=30),
        starts_at=now - timedelta(days=60),
        cancel_at_period_end=True,
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Compute entitlements
    entitlements = await subscription_service.compute_entitlements(db_session, admin.id, now)
    
    # Assertions
    assert entitlements.in_trial is False
    assert entitlements.is_paid is False
    assert entitlements.can_use_pro_features is False
    assert entitlements.days_left_trial == 0
    assert entitlements.status == "CANCELED"


@pytest.mark.asyncio
async def test_compute_entitlements_no_subscription(db_session):
    """Test entitlements when no subscription exists"""
    # Create administration without subscription
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)
    await db_session.commit()
    
    # Compute entitlements
    now = datetime.now(timezone.utc)
    entitlements = await subscription_service.compute_entitlements(db_session, admin.id, now)
    
    # Assertions
    assert entitlements.in_trial is False
    assert entitlements.is_paid is False
    assert entitlements.can_use_pro_features is False
    assert entitlements.days_left_trial == 0
    assert entitlements.status == "NONE"
    assert entitlements.plan_code is None


@pytest.mark.asyncio
async def test_get_subscription(db_session):
    """Test getting subscription by administration ID"""
    # Create administration and plan
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)
    
    plan = Plan(
        code="zzp_basic",
        name="ZZP Basic",
        price_monthly=6.95,
        trial_days=30,
        max_invoices=999999,
        max_storage_mb=5120,
        max_users=1,
    )
    db_session.add(plan)
    await db_session.commit()
    
    # Create subscription
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=30),
        starts_at=now,
        cancel_at_period_end=False,
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Get subscription
    retrieved_subscription = await subscription_service.get_subscription(db_session, admin.id)
    
    # Assertions
    assert retrieved_subscription is not None
    assert retrieved_subscription.id == subscription.id
    assert retrieved_subscription.administration_id == admin.id


@pytest.mark.asyncio
async def test_get_subscription_returns_none_if_not_exists(db_session):
    """Test get_subscription returns None if no subscription exists"""
    # Create administration without subscription
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)
    await db_session.commit()
    
    # Get subscription
    retrieved_subscription = await subscription_service.get_subscription(db_session, admin.id)
    
    # Assertions
    assert retrieved_subscription is None


@pytest.mark.asyncio
async def test_compute_entitlements_active_with_cancel_at_period_end_before_period_end(db_session):
    """ACTIVE + cancel_at_period_end stays ACTIVE until period_end."""
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)

    plan = Plan(
        code="zzp_basic",
        name="ZZP Basic",
        price_monthly=6.95,
        trial_days=30,
        max_invoices=999999,
        max_storage_mb=5120,
        max_users=1,
    )
    db_session.add(plan)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.ACTIVE,
        trial_start_at=now - timedelta(days=60),
        trial_end_at=now - timedelta(days=30),
        current_period_start=now - timedelta(days=2),
        current_period_end=now + timedelta(days=2),
        starts_at=now - timedelta(days=60),
        cancel_at_period_end=True,
    )
    db_session.add(subscription)
    await db_session.commit()

    entitlements = await subscription_service.compute_entitlements(db_session, admin.id, now)

    assert entitlements.status == "ACTIVE"
    assert entitlements.can_use_pro_features is True
    assert entitlements.is_paid is True


@pytest.mark.asyncio
async def test_compute_entitlements_active_cancel_at_period_end_after_period_end(db_session):
    """ACTIVE + cancel_at_period_end flips to CANCELED after period_end."""
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)

    plan = Plan(
        code="zzp_basic",
        name="ZZP Basic",
        price_monthly=6.95,
        trial_days=30,
        max_invoices=999999,
        max_storage_mb=5120,
        max_users=1,
    )
    db_session.add(plan)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.ACTIVE,
        trial_start_at=now - timedelta(days=60),
        trial_end_at=now - timedelta(days=30),
        current_period_start=now - timedelta(days=35),
        current_period_end=now - timedelta(minutes=5),
        starts_at=now - timedelta(days=60),
        cancel_at_period_end=True,
    )
    db_session.add(subscription)
    await db_session.commit()

    entitlements = await subscription_service.compute_entitlements(db_session, admin.id, now)

    assert entitlements.status == "CANCELED"
    assert entitlements.can_use_pro_features is False
    assert entitlements.is_paid is False
