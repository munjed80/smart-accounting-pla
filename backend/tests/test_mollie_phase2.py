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


# Test fixture for webhook secret
TEST_WEBHOOK_SECRET = "test_webhook_secret_12345"


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
         patch("app.integrations.mollie.client.MollieClient.create_subscription") as mock_create_subscription, \
         patch("app.services.mollie_subscription_service.settings.MOLLIE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET):
        
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
    with patch("app.api.v1.webhooks.settings.MOLLIE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET):
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
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment, \
         patch("app.api.v1.webhooks.settings.MOLLIE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET):
        mock_get_payment.return_value = mock_payment
        
        # Call webhook with valid secret
        response = await async_client.post(
            f"/api/v1/webhooks/mollie?id=tr_test123&secret={TEST_WEBHOOK_SECRET}",
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
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment, \
         patch("app.api.v1.webhooks.settings.MOLLIE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET):
        mock_get_payment.return_value = mock_payment
        
        # Call webhook
        secret = TEST_WEBHOOK_SECRET
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
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment, \
         patch("app.api.v1.webhooks.settings.MOLLIE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET):
        mock_get_payment.return_value = mock_payment
        
        # Call webhook
        secret = TEST_WEBHOOK_SECRET
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
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment, \
         patch("app.api.v1.webhooks.settings.MOLLIE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET):
        mock_get_payment.return_value = mock_payment
        
        # Call webhook
        secret = TEST_WEBHOOK_SECRET
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
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment, \
         patch("app.api.v1.webhooks.settings.MOLLIE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET):
        mock_get_payment.return_value = mock_payment
        
        # Call webhook
        secret = TEST_WEBHOOK_SECRET
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
    
    with patch("app.integrations.mollie.client.MollieClient.get_subscription") as mock_get_subscription, \
         patch("app.api.v1.webhooks.settings.MOLLIE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET):
        mock_get_subscription.return_value = mock_subscription
        
        # Call webhook
        secret = TEST_WEBHOOK_SECRET
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
    
    with patch("app.integrations.mollie.client.MollieClient.get_subscription") as mock_get_subscription, \
         patch("app.api.v1.webhooks.settings.MOLLIE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET):
        mock_get_subscription.return_value = mock_subscription
        
        # Call webhook
        secret = TEST_WEBHOOK_SECRET
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
    
    with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment, \
         patch("app.api.v1.webhooks.settings.MOLLIE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET):
        mock_get_payment.return_value = mock_payment
        
        secret = TEST_WEBHOOK_SECRET
        
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


@pytest.mark.asyncio
async def test_cancel_subscription_idempotency(
    async_client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that cancel endpoint is idempotent"""
    # Create a subscription with Mollie IDs
    from sqlalchemy import select
    from app.models.subscription import Subscription
    
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code="zzp_basic",
        status=SubscriptionStatus.ACTIVE,
        provider="mollie",
        provider_customer_id="cst_test123",
        provider_subscription_id="sub_test123",
        starts_at=datetime.now(timezone.utc),
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie cancel response
    mock_canceled_sub = {
        "id": "sub_test123",
        "status": "canceled",
        "canceledAt": "2024-03-15T10:00:00Z",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.cancel_subscription") as mock_cancel:
        mock_cancel.return_value = mock_canceled_sub
        
        # First cancel call
        response1 = await async_client.post(
            "/api/v1/me/subscription/cancel",
            headers=auth_headers,
        )
        assert response1.status_code == 200
        data1 = response1.json()
        assert data1["subscription"]["cancel_at_period_end"] == True
        assert "message_nl" in data1
        
        # Verify Mollie API was called
        assert mock_cancel.call_count == 1
        
        # Second cancel call (idempotent)
        response2 = await async_client.post(
            "/api/v1/me/subscription/cancel",
            headers=auth_headers,
        )
        assert response2.status_code == 200
        data2 = response2.json()
        assert data2["subscription"]["cancel_at_period_end"] == True
        
        # Mollie API should not be called again
        assert mock_cancel.call_count == 1


@pytest.mark.asyncio
async def test_reactivate_subscription_idempotency(
    async_client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that reactivate endpoint is idempotent for active subscriptions"""
    # Create an active subscription
    from sqlalchemy import select
    from app.models.subscription import Subscription
    
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code="zzp_basic",
        status=SubscriptionStatus.ACTIVE,
        provider="mollie",
        provider_customer_id="cst_test123",
        provider_subscription_id="sub_test123",
        starts_at=datetime.now(timezone.utc),
        cancel_at_period_end=False,
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Call reactivate on already active subscription
    response = await async_client.post(
        "/api/v1/me/subscription/reactivate",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["subscription"]["status"] == "ACTIVE"
    assert "al actief" in data["message_nl"].lower()


@pytest.mark.asyncio
async def test_reactivate_canceled_subscription_creates_new(
    async_client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test that reactivate creates new subscription for canceled status"""
    # Create a canceled subscription
    from sqlalchemy import select
    from app.models.subscription import Subscription
    
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code="zzp_basic",
        status=SubscriptionStatus.CANCELED,
        provider="mollie",
        provider_customer_id="cst_test123",
        provider_subscription_id="sub_old123",
        starts_at=datetime.now(timezone.utc) - timedelta(days=60),
        trial_start_at=datetime.now(timezone.utc) - timedelta(days=60),
        trial_end_at=datetime.now(timezone.utc) - timedelta(days=30),
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie responses
    mock_new_subscription = {
        "id": "sub_new123",
        "status": "active",
        "amount": {"value": "6.95", "currency": "EUR"},
        "interval": "1 month",
    }
    
    with patch("app.integrations.mollie.client.MollieClient.create_subscription") as mock_create:
        mock_create.return_value = mock_new_subscription
        
        # Reactivate
        response = await async_client.post(
            "/api/v1/me/subscription/reactivate",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["subscription"]["provider_subscription_id"] == "sub_new123"
        assert "heractiveerd" in data["message_nl"].lower()
        
        # Verify new subscription was created
        assert mock_create.call_count == 1


@pytest.mark.asyncio
async def test_webhook_payment_paid_from_past_due(
    async_client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test webhook activates subscription when payment is paid after PAST_DUE"""
    from sqlalchemy import select
    from app.models.subscription import Subscription
    
    # Create subscription in PAST_DUE state
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code="zzp_basic",
        status=SubscriptionStatus.PAST_DUE,
        provider="mollie",
        provider_customer_id="cst_test123",
        provider_subscription_id="sub_test123",
        starts_at=datetime.now(timezone.utc) - timedelta(days=30),
        trial_start_at=datetime.now(timezone.utc) - timedelta(days=60),
        trial_end_at=datetime.now(timezone.utc) - timedelta(days=30),
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie payment response (paid)
    mock_payment = {
        "id": "tr_recovery123",
        "status": "paid",
        "subscriptionId": "sub_test123",
    }
    
    # Set webhook secret in settings
    original_secret = getattr(settings, 'MOLLIE_WEBHOOK_SECRET', None)
    settings.MOLLIE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
    
    try:
        with patch("app.integrations.mollie.client.MollieClient.get_payment") as mock_get_payment:
            mock_get_payment.return_value = mock_payment
            
            # Send webhook
            response = await async_client.post(
                f"/api/v1/webhooks/mollie?id=tr_recovery123&secret={TEST_WEBHOOK_SECRET}",
            )
            assert response.status_code == 200
            
            # Verify subscription is now ACTIVE
            result = await db_session.execute(
                select(Subscription).where(
                    Subscription.administration_id == test_administration.id
                )
            )
            updated_sub = result.scalar_one()
            assert updated_sub.status == SubscriptionStatus.ACTIVE
    finally:
        # Restore original secret
        settings.MOLLIE_WEBHOOK_SECRET = original_secret


@pytest.mark.asyncio
async def test_webhook_subscription_canceled_records_period_end(
    async_client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    test_administration: Administration,
    test_zzp_plan: Plan,
    db_session,
):
    """Test webhook records current_period_end when subscription is canceled"""
    from sqlalchemy import select
    from app.models.subscription import Subscription
    
    # Create active subscription
    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=test_zzp_plan.id,
        plan_code="zzp_basic",
        status=SubscriptionStatus.ACTIVE,
        provider="mollie",
        provider_customer_id="cst_test123",
        provider_subscription_id="sub_test123",
        starts_at=datetime.now(timezone.utc),
        cancel_at_period_end=True,
    )
    db_session.add(subscription)
    await db_session.commit()
    
    # Mock Mollie subscription response (canceled with timestamp)
    canceled_at = "2024-03-31T23:59:59Z"
    mock_subscription = {
        "id": "sub_test123",
        "status": "canceled",
        "canceledAt": canceled_at,
    }
    
    # Set webhook secret in settings
    original_secret = getattr(settings, 'MOLLIE_WEBHOOK_SECRET', None)
    settings.MOLLIE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
    
    try:
        with patch("app.integrations.mollie.client.MollieClient.get_subscription") as mock_get_sub:
            mock_get_sub.return_value = mock_subscription
            
            # Send webhook
            response = await async_client.post(
                f"/api/v1/webhooks/mollie?id=sub_test123&secret={TEST_WEBHOOK_SECRET}",
            )
            assert response.status_code == 200
            
            # Verify subscription is CANCELED with period end recorded
            result = await db_session.execute(
                select(Subscription).where(
                    Subscription.administration_id == test_administration.id
                )
            )
            updated_sub = result.scalar_one()
            assert updated_sub.status == SubscriptionStatus.CANCELED
            assert updated_sub.current_period_end is not None
    finally:
        # Restore original secret
        settings.MOLLIE_WEBHOOK_SECRET = original_secret
