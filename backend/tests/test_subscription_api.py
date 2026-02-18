"""
Tests for subscription API endpoints.

Tests the subscription endpoints for getting subscription status and starting trials.
"""
import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient

from app.models.subscription import Plan, Subscription, SubscriptionStatus
from app.models.administration import Administration, AdministrationMember, MemberRole


@pytest.mark.asyncio
async def test_get_my_subscription_auto_starts_trial(async_client, test_user, db_session):
    """Test GET /api/v1/me/subscription auto-starts trial if no subscription exists"""
    # Create administration for user
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)
    await db_session.commit()
    
    # Link user to administration
    member = AdministrationMember(
        administration_id=admin.id,
        user_id=test_user.id,
        role=MemberRole.OWNER,
    )
    db_session.add(member)
    
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
    
    # Get subscription (should auto-start trial)
    response = await async_client.get(
        "/api/v1/me/subscription",
        headers={"Authorization": f"Bearer test_token_{test_user.id}"},
    )
    
    # Assertions
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "TRIALING"
    assert data["plan_code"] == "zzp_basic"
    assert data["in_trial"] is True
    assert data["can_use_pro_features"] is True
    assert data["is_paid"] is False
    assert data["days_left_trial"] == 30
    assert data["trial_start_at"] is not None
    assert data["trial_end_at"] is not None


@pytest.mark.asyncio
async def test_get_my_subscription_returns_existing(async_client, test_user, db_session):
    """Test GET /api/v1/me/subscription returns existing subscription"""
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
    
    # Link user to administration
    member = AdministrationMember(
        administration_id=admin.id,
        user_id=test_user.id,
        role=MemberRole.OWNER,
    )
    db_session.add(member)
    
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
    
    # Get subscription
    response = await async_client.get(
        "/api/v1/me/subscription",
        headers={"Authorization": f"Bearer test_token_{test_user.id}"},
    )
    
    # Assertions
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ACTIVE"
    assert data["plan_code"] == "zzp_basic"
    assert data["in_trial"] is False
    assert data["can_use_pro_features"] is True
    assert data["is_paid"] is True
    assert data["days_left_trial"] == 0


@pytest.mark.asyncio
async def test_get_my_subscription_no_administration(async_client, test_user, db_session):
    """Test GET /api/v1/me/subscription returns 404 if user has no administration"""
    # No administration for user
    response = await async_client.get(
        "/api/v1/me/subscription",
        headers={"Authorization": f"Bearer test_token_{test_user.id}"},
    )
    
    # Assertions
    assert response.status_code == 404
    data = response.json()
    assert data["detail"]["code"] == "NO_ADMINISTRATION"


@pytest.mark.asyncio
async def test_start_trial(async_client, test_user, db_session):
    """Test POST /api/v1/me/subscription/start-trial"""
    # Create administration for user
    admin = Administration(name="Test Admin", description="Test")
    db_session.add(admin)
    await db_session.commit()
    
    # Link user to administration
    member = AdministrationMember(
        administration_id=admin.id,
        user_id=test_user.id,
        role=MemberRole.OWNER,
    )
    db_session.add(member)
    
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
    
    # Start trial
    response = await async_client.post(
        "/api/v1/me/subscription/start-trial",
        headers={"Authorization": f"Bearer test_token_{test_user.id}"},
        json={},
    )
    
    # Assertions
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "TRIALING"
    assert data["subscription_id"] is not None
    assert data["trial_start_at"] is not None
    assert data["trial_end_at"] is not None
    assert "Proefperiode gestart" in data["message"]


@pytest.mark.asyncio
async def test_start_trial_idempotent(async_client, test_user, db_session):
    """Test POST /api/v1/me/subscription/start-trial is idempotent"""
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
    
    # Link user to administration
    member = AdministrationMember(
        administration_id=admin.id,
        user_id=test_user.id,
        role=MemberRole.OWNER,
    )
    db_session.add(member)
    await db_session.commit()
    
    # First call - creates subscription
    response1 = await async_client.post(
        "/api/v1/me/subscription/start-trial",
        headers={"Authorization": f"Bearer test_token_{test_user.id}"},
        json={},
    )
    assert response1.status_code == 200
    subscription_id_1 = response1.json()["subscription_id"]
    
    # Second call - should return same subscription
    response2 = await async_client.post(
        "/api/v1/me/subscription/start-trial",
        headers={"Authorization": f"Bearer test_token_{test_user.id}"},
        json={},
    )
    assert response2.status_code == 200
    subscription_id_2 = response2.json()["subscription_id"]
    
    # Same subscription ID
    assert subscription_id_1 == subscription_id_2


@pytest.mark.asyncio
async def test_get_entitlements(async_client, test_user, db_session):
    """Test GET /api/v1/me/subscription/entitlements"""
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
    
    # Link user to administration
    member = AdministrationMember(
        administration_id=admin.id,
        user_id=test_user.id,
        role=MemberRole.OWNER,
    )
    db_session.add(member)
    
    # Create trial subscription
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=20),
        starts_at=now,
        cancel_at_period_end=False,
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Get entitlements
    response = await async_client.get(
        "/api/v1/me/subscription/entitlements",
        headers={"Authorization": f"Bearer test_token_{test_user.id}"},
    )
    
    # Assertions
    assert response.status_code == 200
    data = response.json()
    assert data["in_trial"] is True
    assert data["can_use_pro_features"] is True
    assert data["is_paid"] is False
    assert data["days_left_trial"] == 20
    assert data["status"] == "TRIALING"
    assert data["plan_code"] == "zzp_basic"
