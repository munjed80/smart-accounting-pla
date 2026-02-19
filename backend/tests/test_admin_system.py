from datetime import date, datetime, timezone

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
