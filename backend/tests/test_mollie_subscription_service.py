"""
Tests for Mollie subscription service.

Tests subscription activation, customer management, and webhook processing
with mocked Mollie client.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.services.mollie_subscription_service import mollie_subscription_service
from app.models.subscription import Plan, Subscription, SubscriptionStatus
from app.models.administration import Administration
from app.models.user import User


@pytest.mark.asyncio
async def test_ensure_mollie_customer_creates_new_customer(db_session):
    """Test that ensure_mollie_customer creates a new Mollie customer"""
    # Create test data
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
    
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=datetime.now(timezone.utc),
        trial_end_at=datetime.now(timezone.utc) + timedelta(days=30),
        starts_at=datetime.now(timezone.utc),
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie client
    mock_customer_data = {
        "id": "cst_test123",
        "name": "Test User",
        "email": "test@example.com",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.create_customer", 
               return_value=mock_customer_data):
        customer_id = await mollie_subscription_service.ensure_mollie_customer(
            db=db_session,
            user=user,
            administration=admin,
            subscription=subscription,
        )
        
        assert customer_id == "cst_test123"
        assert subscription.provider == "mollie"
        assert subscription.provider_customer_id == "cst_test123"


@pytest.mark.asyncio
async def test_ensure_mollie_customer_is_idempotent(db_session):
    """Test that ensure_mollie_customer is idempotent"""
    # Create test data
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
    
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=datetime.now(timezone.utc),
        trial_end_at=datetime.now(timezone.utc) + timedelta(days=30),
        starts_at=datetime.now(timezone.utc),
        provider="mollie",
        provider_customer_id="cst_existing123",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Should not call Mollie API
    customer_id = await mollie_subscription_service.ensure_mollie_customer(
        db=db_session,
        user=user,
        administration=admin,
        subscription=subscription,
    )
    
    # Should return existing customer ID
    assert customer_id == "cst_existing123"


@pytest.mark.asyncio
async def test_activate_subscription_creates_scheduled_subscription(db_session):
    """Test that activate_subscription creates a scheduled Mollie subscription"""
    # Create test data
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
    
    # Create subscription with trial ending in future
    trial_end = datetime.now(timezone.utc) + timedelta(days=15)
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=datetime.now(timezone.utc),
        trial_end_at=trial_end,
        starts_at=datetime.now(timezone.utc),
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie client
    mock_customer_data = {"id": "cst_test123"}
    mock_subscription_data = {
        "id": "sub_test123",
        "status": "active",
        "startDate": trial_end.date().isoformat(),
    }
    
    with patch("app.integrations.mollie.client.MollieClient.create_customer",
               return_value=mock_customer_data), \
         patch("app.integrations.mollie.client.MollieClient.create_subscription",
               return_value=mock_subscription_data):
        
        result = await mollie_subscription_service.activate_subscription(
            db=db_session,
            user=user,
            administration_id=admin.id,
        )
        
        assert result["status"] == "TRIALING"
        assert result["scheduled"] is True
        assert result["in_trial"] is True
        assert result["provider_subscription_id"] == "sub_test123"


@pytest.mark.asyncio
async def test_activate_subscription_is_idempotent(db_session):
    """Test that activate_subscription is idempotent"""
    # Create test data
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
    
    # Create subscription already activated
    trial_end = datetime.now(timezone.utc) + timedelta(days=15)
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=datetime.now(timezone.utc),
        trial_end_at=trial_end,
        starts_at=datetime.now(timezone.utc),
        provider="mollie",
        provider_customer_id="cst_existing123",
        provider_subscription_id="sub_existing123",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Should not call Mollie API
    result = await mollie_subscription_service.activate_subscription(
        db=db_session,
        user=user,
        administration_id=admin.id,
    )
    
    # Should return existing subscription
    assert result["provider_subscription_id"] == "sub_existing123"
    assert result["scheduled"] is True
