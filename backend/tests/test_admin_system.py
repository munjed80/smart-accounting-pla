from datetime import date, datetime, timedelta, timezone

import pytest

from app.models.subscription import Plan, Subscription, SubscriptionStatus
from app.models.zzp import ZZPInvoice


@pytest.mark.asyncio
async def test_admin_overview_forbidden_for_non_super_admin(async_client, auth_headers):
    response = await async_client.get('/api/v1/admin/overview', headers=auth_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_overview_happy_path(async_client, db_session, super_admin_headers, test_administration, test_customer):
    plan = Plan(code='basic', name='BASIC', price_monthly=19, trial_days=30, max_invoices=100, max_storage_mb=500, max_users=2)
    db_session.add(plan)
    await db_session.flush()

    subscription = Subscription(
        administration_id=test_administration.id,
        plan_id=plan.id,
        plan_code='basic',
        status=SubscriptionStatus.ACTIVE,
        starts_at=datetime.now(timezone.utc),
    )
    db_session.add(subscription)

    invoice = ZZPInvoice(
        administration_id=test_administration.id,
        customer_id=test_customer.id,
        invoice_number='INV-ADMIN-001',
        status='draft',
        issue_date=date.today(),
        seller_company_name='Admin Test BV',
        customer_name='Customer',
        subtotal_cents=1000,
        vat_total_cents=210,
        total_cents=1210,
    )
    db_session.add(invoice)
    await db_session.commit()

    response = await async_client.get('/api/v1/admin/overview', headers=super_admin_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload['users_count'] >= 1
    assert payload['administrations_count'] >= 1
    assert payload['active_subscriptions_count'] >= 1
    assert payload['mrr_estimate'] >= 19
    assert payload['invoices_last_30_days'] >= 1


@pytest.mark.asyncio
async def test_admin_users_list_super_admin_access(async_client, super_admin_headers):
    response = await async_client.get('/api/v1/admin/users', headers=super_admin_headers)
    assert response.status_code == 200
    payload = response.json()
    assert 'users' in payload


@pytest.mark.asyncio
async def test_admin_users_list_forbidden_for_non_super_admin(async_client, auth_headers):
    response = await async_client.get('/api/v1/admin/users', headers=auth_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Subscription detail endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_subscription_detail_returns_trial_info(
    async_client, db_session, super_admin_headers, test_administration, clean_subscriptions
):
    plan = Plan(code='free_detail', name='Free Detail', price_monthly=0, trial_days=30, max_invoices=100, max_storage_mb=500, max_users=1)
    db_session.add(plan)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=test_administration.id,
        plan_id=plan.id,
        plan_code='free_detail',
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=15),
        starts_at=now,
    )
    db_session.add(sub)
    await db_session.commit()

    response = await async_client.get(
        f'/api/v1/admin/administrations/{test_administration.id}/subscription-detail',
        headers=super_admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'TRIALING'
    assert data['can_extend_trial'] is True
    assert data['is_paid'] is False
    assert data['days_remaining'] is not None
    assert data['days_remaining'] >= 14


@pytest.mark.asyncio
async def test_subscription_detail_forbidden_for_non_super_admin(async_client, auth_headers, test_administration):
    response = await async_client.get(
        f'/api/v1/admin/administrations/{test_administration.id}/subscription-detail',
        headers=auth_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Extend trial endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_extend_trial_adds_days(
    async_client, db_session, super_admin_headers, test_administration, clean_subscriptions
):
    plan = Plan(code='free_ext', name='Free Ext', price_monthly=0, trial_days=30, max_invoices=100, max_storage_mb=500, max_users=1)
    db_session.add(plan)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=test_administration.id,
        plan_id=plan.id,
        plan_code='free_ext',
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=5),
        starts_at=now,
    )
    db_session.add(sub)
    await db_session.commit()

    response = await async_client.post(
        f'/api/v1/admin/administrations/{test_administration.id}/extend-trial',
        json={'extend_days': 14, 'reason': 'Customer needs more time to evaluate'},
        headers=super_admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data['new_status'] == 'TRIALING'
    assert data['new_trial_end'] is not None


@pytest.mark.asyncio
async def test_extend_trial_revives_expired(
    async_client, db_session, super_admin_headers, test_administration, clean_subscriptions
):
    plan = Plan(code='free_exp', name='Free Exp', price_monthly=0, trial_days=30, max_invoices=100, max_storage_mb=500, max_users=1)
    db_session.add(plan)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=test_administration.id,
        plan_id=plan.id,
        plan_code='free_exp',
        status=SubscriptionStatus.EXPIRED,
        trial_start_at=now - timedelta(days=40),
        trial_end_at=now - timedelta(days=10),
        starts_at=now - timedelta(days=40),
    )
    db_session.add(sub)
    await db_session.commit()

    response = await async_client.post(
        f'/api/v1/admin/administrations/{test_administration.id}/extend-trial',
        json={'extend_days': 30, 'reason': 'Second chance for onboarding'},
        headers=super_admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data['new_status'] == 'TRIALING'


@pytest.mark.asyncio
async def test_extend_trial_blocked_for_active_subscription(
    async_client, db_session, super_admin_headers, test_administration, clean_subscriptions
):
    plan = Plan(code='paid_block', name='Paid Block', price_monthly=5, trial_days=30, max_invoices=100, max_storage_mb=500, max_users=1)
    db_session.add(plan)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=test_administration.id,
        plan_id=plan.id,
        plan_code='paid_block',
        status=SubscriptionStatus.ACTIVE,
        trial_start_at=now - timedelta(days=30),
        trial_end_at=now - timedelta(days=1),
        starts_at=now - timedelta(days=30),
        current_period_start=now - timedelta(days=5),
        current_period_end=now + timedelta(days=25),
    )
    db_session.add(sub)
    await db_session.commit()

    response = await async_client.post(
        f'/api/v1/admin/administrations/{test_administration.id}/extend-trial',
        json={'extend_days': 14, 'reason': 'Should be blocked'},
        headers=super_admin_headers,
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_extend_trial_forbidden_for_non_super_admin(async_client, auth_headers, test_administration):
    response = await async_client.post(
        f'/api/v1/admin/administrations/{test_administration.id}/extend-trial',
        json={'extend_days': 14, 'reason': 'Not allowed'},
        headers=auth_headers,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_extend_trial_requires_reason(
    async_client, db_session, super_admin_headers, test_administration, clean_subscriptions
):
    plan = Plan(code='free_reason', name='Free Reason', price_monthly=0, trial_days=30, max_invoices=100, max_storage_mb=500, max_users=1)
    db_session.add(plan)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    sub = Subscription(
        administration_id=test_administration.id,
        plan_id=plan.id,
        plan_code='free_reason',
        status=SubscriptionStatus.TRIALING,
        trial_start_at=now,
        trial_end_at=now + timedelta(days=5),
        starts_at=now,
    )
    db_session.add(sub)
    await db_session.commit()

    response = await async_client.post(
        f'/api/v1/admin/administrations/{test_administration.id}/extend-trial',
        json={'extend_days': 14},
        headers=super_admin_headers,
    )
    assert response.status_code == 422
