"""
Tests for Mollie Phase 2: Activate Endpoint and Webhook Sync.

Tests comprehensive subscription activation and webhook processing scenarios
including idempotency, customer creation, status transitions, and error handling.
"""
import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from httpx import AsyncClient

from app.models.subscription import Plan, Subscription, SubscriptionStatus, WebhookEvent
from app.models.administration import Administration
from app.models.user import User
from app.core.config import settings


@pytest.mark.asyncio
async def test_activate_endpoint_creates_customer_and_subscription(
    async_client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that activate endpoint creates Mollie customer and subscription"""
    # Mock Mollie client responses
    mock_customer = {
        "id": "cst_test123",
        "name": test_user.full_name,
        "email": test_user.email,
    }
    
    mock_subscription = {
        "id": "sub_test123",
        "status": "active",
        "amount": {"value": "6.95", "currency": "EUR"},
        "interval": "1 month",
        "description": "ZZP Basic abonnement",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.create_customer") as mock_create_customer, \
         patch("app.integrations.mollie.client.MollieClient.create_subscription") as mock_create_subscription:
        
        # Configure mocks
        mock_create_customer.return_value = mock_customer
        mock_create_subscription.return_value = mock_subscription
        
        # Call activate endpoint
        response = await async_client.post(
            "/api/v1/me/subscription/activate",
            headers=auth_headers,
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "TRIALING"
        assert data["in_trial"] is True
        assert data["scheduled"] is True
        assert data["provider_subscription_id"] == "sub_test123"
        assert data["message_nl"] == "Abonnement gepland. Start na proefperiode."
        
        # Verify customer was created
        mock_create_customer.assert_called_once()
        
        # Verify subscription was created with correct parameters
        mock_create_subscription.assert_called_once()
        call_kwargs = mock_create_subscription.call_args.kwargs
        assert call_kwargs["customer_id"] == "cst_test123"
        assert call_kwargs["amount"] == Decimal("6.95")
        assert call_kwargs["currency"] == "EUR"
        assert call_kwargs["interval"] == "1 month"
        assert call_kwargs["description"] == "ZZP Basic abonnement"
        # Webhook URL should include secret
        assert "?secret=" in call_kwargs["webhook_url"]


@pytest.mark.asyncio
async def test_activate_endpoint_is_idempotent(
    async_client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that activate endpoint is idempotent - returns existing subscription"""
    # Create existing subscription with Mollie IDs
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=30),
        starts_at=now,
        provider="mollie",
        provider_customer_id="cst_existing",
        provider_subscription_id="sub_existing",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock should NOT be called
    with patch("app.integrations.mollie.client.MollieClient.create_customer") as mock_create_customer, \
         patch("app.integrations.mollie.client.MollieClient.create_subscription") as mock_create_subscription:
        
        # Call activate endpoint
        response = await async_client.post(
            "/api/v1/me/subscription/activate",
            headers=auth_headers,
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "TRIALING"
        assert data["provider_subscription_id"] == "sub_existing"
        assert data["scheduled"] is True
        
        # Verify no new customer/subscription created
        mock_create_customer.assert_not_called()
        mock_create_subscription.assert_not_called()


@pytest.mark.asyncio
async def test_activate_endpoint_returns_active_subscription(
    async_client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that activate endpoint returns correct message for active subscription"""
    # Create active subscription
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.ACTIVE,
        trial_start_at=now - timedelta(days=60),
        trial_end_at=now - timedelta(days=30),
        current_period_start=now - timedelta(days=15),
        current_period_end=now + timedelta(days=15),
        starts_at=now - timedelta(days=60),
        provider="mollie",
        provider_customer_id="cst_active",
        provider_subscription_id="sub_active",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Call activate endpoint
    response = await async_client.post(
        "/api/v1/me/subscription/activate",
        headers=auth_headers,
    )
    
    # Assertions
    assert response.status_code == 200
    data = response.json()
    
    assert data["status"] == "ACTIVE"
    assert data["in_trial"] is False
    assert data["scheduled"] is False
    assert data["message_nl"] == "Abonnement is actief."


@pytest.mark.asyncio
async def test_webhook_endpoint_rejects_invalid_secret(
    async_client: AsyncClient,
    db_session,
):
    """Test that webhook endpoint rejects requests with invalid secret"""
    # Call webhook without secret
    response = await async_client.post(
        "/api/v1/webhooks/mollie?id=tr_test123",
    )
    
    # Should return 401 Unauthorized
    assert response.status_code == 401
    data = response.json()
    assert data["detail"]["code"] == "INVALID_WEBHOOK"


@pytest.mark.asyncio
async def test_webhook_endpoint_accepts_valid_secret(
    async_client: AsyncClient,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that webhook endpoint accepts requests with valid secret"""
    # Create subscription
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=30),
        starts_at=now,
        provider="mollie",
        provider_customer_id="cst_webhook",
        provider_subscription_id="sub_webhook",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie payment response
    mock_payment = {
        "id": "tr_test123",
        "status": "paid",
        "subscriptionId": "sub_webhook",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment:
        mock_get_payment.return_value = mock_payment
        
        # Call webhook with valid secret
        secret = settings.MOLLIE_WEBHOOK_SECRET or "test_secret"
        response = await async_client.post(
            f"/api/v1/webhooks/mollie?id=tr_test123&secret={secret}",
        )
        
        # Should succeed
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_webhook_payment_paid_activates_subscription(
    async_client: AsyncClient,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that webhook with paid payment activates subscription"""
    # Create subscription
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=30),
        starts_at=now,
        provider="mollie",
        provider_customer_id="cst_paid",
        provider_subscription_id="sub_paid",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie payment response
    mock_payment = {
        "id": "tr_paid123",
        "status": "paid",
        "subscriptionId": "sub_paid",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment:
        mock_get_payment.return_value = mock_payment
        
        # Call webhook
        secret = settings.MOLLIE_WEBHOOK_SECRET or "test_secret"
        response = await async_client.post(
            f"/api/v1/webhooks/mollie?id=tr_paid123&secret={secret}",
        )
        
        assert response.status_code == 200
        
        # Verify subscription was activated
        await db_session.refresh(subscription)
        assert subscription.status == SubscriptionStatus.ACTIVE


@pytest.mark.asyncio
async def test_webhook_payment_failed_marks_past_due(
    async_client: AsyncClient,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that webhook with failed payment marks subscription as PAST_DUE"""
    # Create subscription
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=30),
        starts_at=now,
        provider="mollie",
        provider_customer_id="cst_failed",
        provider_subscription_id="sub_failed",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie payment response
    mock_payment = {
        "id": "tr_failed123",
        "status": "failed",
        "subscriptionId": "sub_failed",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment:
        mock_get_payment.return_value = mock_payment
        
        # Call webhook
        secret = settings.MOLLIE_WEBHOOK_SECRET or "test_secret"
        response = await async_client.post(
            f"/api/v1/webhooks/mollie?id=tr_failed123&secret={secret}",
        )
        
        assert response.status_code == 200
        
        # Verify subscription marked as PAST_DUE
        await db_session.refresh(subscription)
        assert subscription.status == SubscriptionStatus.PAST_DUE


@pytest.mark.asyncio
async def test_webhook_payment_pending_keeps_trialing_during_trial(
    async_client: AsyncClient,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that pending payment keeps TRIALING status during trial"""
    # Create subscription in trial
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=30),
        starts_at=now,
        provider="mollie",
        provider_customer_id="cst_pending",
        provider_subscription_id="sub_pending",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie payment response
    mock_payment = {
        "id": "tr_pending123",
        "status": "pending",
        "subscriptionId": "sub_pending",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment:
        mock_get_payment.return_value = mock_payment
        
        # Call webhook
        secret = settings.MOLLIE_WEBHOOK_SECRET or "test_secret"
        response = await async_client.post(
            f"/api/v1/webhooks/mollie?id=tr_pending123&secret={secret}",
        )
        
        assert response.status_code == 200
        
        # Verify subscription still TRIALING
        await db_session.refresh(subscription)
        assert subscription.status == SubscriptionStatus.TRIALING


@pytest.mark.asyncio
async def test_webhook_payment_pending_marks_past_due_after_trial(
    async_client: AsyncClient,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that pending payment marks PAST_DUE after trial expires"""
    # Create subscription with expired trial
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now - timedelta(days=60),
        trial_end_at=now - timedelta(days=1),  # Trial expired
        starts_at=now - timedelta(days=60),
        provider="mollie",
        provider_customer_id="cst_expired",
        provider_subscription_id="sub_expired",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie payment response
    mock_payment = {
        "id": "tr_pending_expired",
        "status": "pending",
        "subscriptionId": "sub_expired",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment:
        mock_get_payment.return_value = mock_payment
        
        # Call webhook
        secret = settings.MOLLIE_WEBHOOK_SECRET or "test_secret"
        response = await async_client.post(
            f"/api/v1/webhooks/mollie?id=tr_pending_expired&secret={secret}",
        )
        
        assert response.status_code == 200
        
        # Verify subscription marked as PAST_DUE
        await db_session.refresh(subscription)
        assert subscription.status == SubscriptionStatus.PAST_DUE


@pytest.mark.asyncio
async def test_webhook_subscription_active(
    async_client: AsyncClient,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that webhook with active subscription updates status"""
    # Create subscription
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=30),
        starts_at=now,
        provider="mollie",
        provider_customer_id="cst_sub_active",
        provider_subscription_id="sub_active123",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie subscription response
    mock_subscription = {
        "id": "sub_active123",
        "status": "active",
        "customerId": "cst_sub_active",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.get_subscription") as mock_get_subscription:
        mock_get_subscription.return_value = mock_subscription
        
        # Call webhook
        secret = settings.MOLLIE_WEBHOOK_SECRET or "test_secret"
        response = await async_client.post(
            f"/api/v1/webhooks/mollie?id=sub_active123&secret={secret}",
        )
        
        assert response.status_code == 200
        
        # Verify subscription activated
        await db_session.refresh(subscription)
        assert subscription.status == SubscriptionStatus.ACTIVE


@pytest.mark.asyncio
async def test_webhook_subscription_canceled(
    async_client: AsyncClient,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that webhook with canceled subscription updates status"""
    # Create subscription
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.ACTIVE,
        trial_start_at=now - timedelta(days=60),
        trial_end_at=now - timedelta(days=30),
        starts_at=now - timedelta(days=60),
        provider="mollie",
        provider_customer_id="cst_sub_cancel",
        provider_subscription_id="sub_cancel123",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie subscription response
    mock_subscription = {
        "id": "sub_cancel123",
        "status": "canceled",
        "customerId": "cst_sub_cancel",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.get_subscription") as mock_get_subscription:
        mock_get_subscription.return_value = mock_subscription
        
        # Call webhook
        secret = settings.MOLLIE_WEBHOOK_SECRET or "test_secret"
        response = await async_client.post(
            f"/api/v1/webhooks/mollie?id=sub_cancel123&secret={secret}",
        )
        
        assert response.status_code == 200
        
        # Verify subscription canceled
        await db_session.refresh(subscription)
        assert subscription.status == SubscriptionStatus.CANCELED


@pytest.mark.asyncio
async def test_webhook_is_idempotent(
    async_client: AsyncClient,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that webhook processing is idempotent - same event processed once"""
    # Create subscription
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code=test_zzp_plan.code,
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=30),
        starts_at=now,
        provider="mollie",
        provider_customer_id="cst_idempotent",
        provider_subscription_id="sub_idempotent",
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie payment response
    mock_payment = {
        "id": "tr_idempotent",
        "status": "paid",
        "subscriptionId": "sub_idempotent",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment:
        mock_get_payment.return_value = mock_payment
        
        secret = settings.MOLLIE_WEBHOOK_SECRET or "test_secret"
        
        # First webhook call
        response1 = await async_client.post(
            f"/api/v1/webhooks/mollie?id=tr_idempotent&secret={secret}",
        )
        assert response1.status_code == 200
        
        # Second webhook call with same ID
        response2 = await async_client.post(
            f"/api/v1/webhooks/mollie?id=tr_idempotent&secret={secret}",
        )
        assert response2.status_code == 200
        
        # Verify Mollie API was only called once (second call detected as duplicate)
        assert mock_get_payment.call_count == 1
