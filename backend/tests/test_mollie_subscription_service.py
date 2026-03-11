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
async def test_activate_subscription_creates_immediate_checkout_during_trial(db_session):
    """Test that activate_subscription always creates an immediate checkout, even during trial"""
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
    
    # Create subscription with trial ending in future (still in trial)
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
    
    # Mock Mollie client – now expects create_payment (not create_subscription)
    mock_customer_data = {"id": "cst_test123"}
    mock_payment_data = {
        "id": "tr_test123",
        "status": "open",
        "_links": {
            "checkout": {"href": "https://www.mollie.com/checkout/test123"}
        },
    }

    with patch("app.integrations.mollie.client.MollieClient.create_customer",
               return_value=mock_customer_data), \
         patch("app.integrations.mollie.client.MollieClient.create_payment",
               return_value=mock_payment_data) as mock_create_payment:

        result = await mollie_subscription_service.activate_subscription(
            db=db_session,
            user=user,
            administration_id=admin.id,
        )

        # Should always return an immediate checkout URL
        assert result["checkout_url"] == "https://www.mollie.com/checkout/test123"
        assert result["scheduled"] is False
        assert result["status"] == "TRIALING"
        assert result["in_trial"] is True
        assert result["provider_subscription_id"] is None

        # iDEAL fix: locale=nl_NL must be sent so Mollie shows iDEAL in the checkout
        _, kwargs = mock_create_payment.call_args
        assert kwargs.get("locale") == "nl_NL", (
            "locale='nl_NL' must be passed to create_payment so iDEAL appears "
            "in the Mollie checkout for Dutch ZZP subscribers"
        )
        assert kwargs.get("sequence_type") == "first"


@pytest.mark.asyncio
async def test_activate_subscription_is_idempotent_for_active(db_session):
    """Test that activate_subscription is idempotent for already-ACTIVE subscriptions"""
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
    
    # Create subscription that is already ACTIVE (fully paid)
    subscription = Subscription(
        administration_id=admin.id,
        plan_id=plan.id,
        plan_code=plan.code,
        status=SubscriptionStatus.ACTIVE,
        trial_start_at=datetime.now(timezone.utc) - timedelta(days=30),
        trial_end_at=datetime.now(timezone.utc) - timedelta(days=1),
        starts_at=datetime.now(timezone.utc) - timedelta(days=1),
        provider="mollie",
        provider_customer_id="cst_existing123",
        provider_subscription_id="sub_existing123",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Should not call Mollie API – returns active status immediately
    result = await mollie_subscription_service.activate_subscription(
        db=db_session,
        user=user,
        administration_id=admin.id,
    )
    
    # Should return existing active subscription without checkout_url
    assert result["status"] == "ACTIVE"
    assert result["checkout_url"] is None
    assert result["scheduled"] is False
    assert result["in_trial"] is False
