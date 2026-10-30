"""Prepaid checkout, calendar periods, expiry and webhook idempotency."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from dateutil.relativedelta import relativedelta
from sqlalchemy import select

from app.core.billing_catalog import PLAN_METADATA, PREPAID_PLAN_CODES
from app.models.administration import Administration
from app.models.subscription import Plan, Subscription, SubscriptionStatus, WebhookEvent
from app.models.user import User
from app.services.mollie_subscription_service import mollie_subscription_service as service
from app.services.subscription_service import subscription_service


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


@pytest_asyncio.fixture
async def prepaid_setup(db_session):
    user = User(email='prepaid@example.com', full_name='Prepaid Customer', role='zzp', hashed_password='hash', is_active=True)
    administration = Administration(name='Prepaid company')
    free = Plan(code='free', name='Free', price_monthly=0, trial_days=90)
    db_session.add_all([user, administration, free])
    for code in PREPAID_PLAN_CODES:
        meta = PLAN_METADATA[code]
        db_session.add(Plan(code=code, name=meta['description'], price_monthly=meta['price'] / meta['months'], trial_days=0))
    await db_session.commit()
    sub = await subscription_service.ensure_trial_started(db_session, administration.id)
    sub.provider_customer_id = 'cst_prepaid'
    await db_session.commit()
    return user, administration, sub


def payment(sub, code='zzp_1m', status='paid'):
    return {'id': 'tr_prepaid', 'status': status, 'sequenceType': 'oneoff', 'customerId': 'cst_prepaid',
            'amount': {'value': str(PLAN_METADATA[code]['price']), 'currency': 'EUR'},
            'metadata': {'payment_type': 'prepaid', 'subscription_id': str(sub.id),
                         'administration_id': str(sub.administration_id), 'plan_code': code}}


@pytest.mark.asyncio
async def test_new_trials_are_calendar_months_and_existing_trials_are_preserved(db_session, prepaid_setup):
    _, administration, sub = prepaid_setup
    assert aware(sub.trial_end_at) == aware(sub.trial_start_at) + relativedelta(months=3)
    previous = aware(sub.trial_start_at) + timedelta(days=365)
    sub.trial_end_at = previous
    await db_session.commit()
    again = await subscription_service.ensure_trial_started(db_session, administration.id)
    assert aware(again.trial_end_at) == previous


@pytest.mark.asyncio
@pytest.mark.parametrize('code,total', [('zzp_1m','6.00'),('zzp_3m','14.00'),('zzp_6m','25.00'),('zzp_12m','39.00')])
async def test_checkout_charges_exact_total_once_without_changing_access(db_session, prepaid_setup, code, total):
    user, administration, sub = prepaid_setup
    original_end = sub.trial_end_at
    client = AsyncMock()
    client.create_payment.return_value = {'id':'tr_prepaid', '_links':{'checkout':{'href':'https://checkout.example/test'}}}
    with patch('app.services.mollie_subscription_service.MollieClient') as factory:
        factory.return_value.__aenter__.return_value = client
        result = await service.activate_subscription(db_session, user, administration.id, code)
    request = client.create_payment.call_args.kwargs
    assert request['amount'] == Decimal(total)
    assert request['sequence_type'] == 'oneoff'
    assert request['metadata']['plan_code'] == code
    assert result['checkout_url'] == 'https://checkout.example/test'
    assert sub.plan_code == 'free'
    assert sub.trial_end_at == original_end
    client.create_subscription.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize('code,months', [('zzp_1m',1),('zzp_3m',3),('zzp_6m',6),('zzp_12m',12)])
async def test_paid_period_starts_after_trial_and_uses_calendar_months(db_session, prepaid_setup, code, months):
    _, _, sub = prepaid_setup
    base = datetime(datetime.now(timezone.utc).year + 1, 1, 31, tzinfo=timezone.utc)
    sub.trial_end_at = base
    await service._apply_prepaid_payment(db_session, sub, payment(sub, code))
    assert sub.status == SubscriptionStatus.ACTIVE
    assert sub.current_period_end == base + relativedelta(months=months)
    assert sub.provider_subscription_id is None
    assert sub.plan_code == code
    await db_session.commit()


@pytest.mark.asyncio
async def test_pending_then_paid_and_repeated_callbacks_grant_once(db_session, prepaid_setup):
    _, _, sub = prepaid_setup
    base = aware(sub.trial_end_at)
    client = AsyncMock()
    client.get_payment.side_effect = [payment(sub, status='open'), payment(sub)]
    with patch('app.services.mollie_subscription_service.MollieClient') as factory:
        factory.return_value.__aenter__.return_value = client
        assert (await service.process_webhook(db_session, payment_id='tr_prepaid'))['status'] == 'pending'
        assert (await service.process_webhook(db_session, payment_id='tr_prepaid'))['status'] == 'processed'
        end = aware(sub.current_period_end)
        assert (await service.process_webhook(db_session, payment_id='tr_prepaid'))['status'] == 'already_processed'
    assert aware(sub.current_period_end) == end == base + relativedelta(months=1)
    events = (await db_session.execute(select(WebhookEvent))).scalars().all()
    assert len(events) == 1
    client.create_subscription.assert_not_called()


@pytest.mark.asyncio
async def test_renewal_adds_time_and_failed_checkout_preserves_access(db_session, prepaid_setup):
    _, administration, sub = prepaid_setup
    await service._apply_prepaid_payment(db_session, sub, payment(sub))
    old_end = sub.current_period_end
    await service._apply_prepaid_payment(db_session, sub, payment(sub, status='failed'))
    assert sub.current_period_end == old_end
    assert sub.status == SubscriptionStatus.ACTIVE
    await service._apply_prepaid_payment(db_session, sub, payment(sub, 'zzp_3m'))
    assert sub.current_period_end == old_end + relativedelta(months=3)
    await db_session.commit()
    await service.cancel_subscription(db_session, prepaid_setup[0], administration.id)
    assert sub.status == SubscriptionStatus.ACTIVE  # No auto-renewal to cancel; retain paid access.


@pytest.mark.asyncio
@pytest.mark.parametrize('field,value', [('value','0.01'),('currency','USD')])
async def test_wrong_payment_amount_or_currency_never_grants_access(db_session, prepaid_setup, field, value):
    _, _, sub = prepaid_setup
    resource = payment(sub)
    resource['amount'][field] = value
    with pytest.raises(ValueError, match='mismatch'):
        await service._apply_prepaid_payment(db_session, sub, resource)
    assert sub.status == SubscriptionStatus.TRIALING


@pytest.mark.asyncio
async def test_prepaid_expiry_is_enforced_without_provider_callback(db_session, prepaid_setup):
    _, administration, sub = prepaid_setup
    await service._apply_prepaid_payment(db_session, sub, payment(sub))
    sub.current_period_end = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db_session.commit()
    result = await subscription_service.compute_entitlements(db_session, administration.id)
    assert not result.can_use_pro_features
    assert not result.is_paid
    assert result.status == 'EXPIRED'
