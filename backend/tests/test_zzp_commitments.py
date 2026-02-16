import pytest
from datetime import date, timedelta

from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.bank import BankAccount, BankTransaction, BankTransactionStatus
from app.models.ledger import AccountingPeriod, PeriodStatus
from app.models.user import User
from app.core.roles import UserRole
from app.core.security import create_access_token, get_password_hash


@pytest.mark.asyncio
async def test_commitments_crud_and_next_due(async_client, auth_headers):
    payload = {
        "type": "loan",
        "name": "Zakelijke lening bus",
        "amount_cents": 45000,
        "monthly_payment_cents": 45000,
        "principal_amount_cents": 500000,
        "interest_rate": 5.2,
        "start_date": date.today().replace(day=1).isoformat(),
        "end_date": (date.today() + timedelta(days=365)).isoformat(),
        "payment_day": 10,
        "provider": "Rabobank",
        "contract_number": "LN-123",
    }

    create = await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json=payload)
    assert create.status_code == 201
    item = create.json()
    assert item['next_due_date'] is not None
    assert item['payment_day'] == 10
    assert item['provider'] == 'Rabobank'

    list_resp = await async_client.get('/api/v1/zzp/commitments', headers=auth_headers)
    assert list_resp.status_code == 200
    assert list_resp.json()['total'] >= 1

    detail = await async_client.get(f"/api/v1/zzp/commitments/{item['id']}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()['name'] == payload['name']

    patch = await async_client.patch(
        f"/api/v1/zzp/commitments/{item['id']}",
        headers=auth_headers,
        json={"name": "Bijgewerkte lening"},
    )
    assert patch.status_code == 200
    assert patch.json()['name'] == 'Bijgewerkte lening'

    amort = await async_client.get(f"/api/v1/zzp/commitments/{item['id']}/amortization", headers=auth_headers)
    assert amort.status_code == 200
    assert len(amort.json()) > 0

    delete = await async_client.delete(f"/api/v1/zzp/commitments/{item['id']}", headers=auth_headers)
    assert delete.status_code == 204


@pytest.mark.asyncio
async def test_commitment_overview_alerts_and_suggestions(async_client, auth_headers, db_session, test_administration):
    # near renewal alert
    subscription_payload = {
        "type": "subscription",
        "name": "Adobe",
        "amount_cents": 2600,
        "recurring_frequency": "yearly",
        "start_date": "2025-01-01",
        "renewal_date": (date.today() + timedelta(days=7)).isoformat(),
        "notice_period_days": 30,
        "auto_renew": True,
    }
    await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json=subscription_payload)

    # ending lease alert
    lease_payload = {
        "type": "lease",
        "name": "Lease auto",
        "amount_cents": 90000,
        "monthly_payment_cents": 90000,
        "principal_amount_cents": 1200000,
        "interest_rate": 4,
        "start_date": "2024-01-01",
        "end_date": (date.today() + timedelta(days=20)).isoformat(),
    }
    await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json=lease_payload)

    overview = await async_client.get('/api/v1/zzp/commitments/overview/summary?threshold_cents=1000', headers=auth_headers)
    assert overview.status_code == 200
    alerts = overview.json()['alerts']
    codes = {a['code'] for a in alerts}
    assert 'subscription_renewal' in codes
    assert 'lease_loan_ending' in codes
    assert 'monthly_threshold' in codes

    bank_account = BankAccount(
        administration_id=test_administration.id,
        iban='NL11TEST0123456789',
        bank_name='Test Bank',
        currency='EUR',
    )
    db_session.add(bank_account)
    await db_session.flush()

    for d in [date(2026, 1, 5), date(2026, 2, 5), date(2026, 3, 5)]:
        db_session.add(BankTransaction(
            administration_id=test_administration.id,
            bank_account_id=bank_account.id,
            booking_date=d,
            amount=-29.99,
            currency='EUR',
            counterparty_name='Spotify',
            description='Spotify Premium',
            reference='SUB',
            import_hash=f'{d.isoformat()}-spotify',
            status=BankTransactionStatus.NEW,
        ))
    await db_session.commit()

    suggestions = await async_client.get('/api/v1/zzp/commitments/subscriptions/suggestions', headers=auth_headers)
    assert suggestions.status_code == 200
    assert len(suggestions.json()['suggestions']) >= 1


@pytest.mark.asyncio
async def test_commitment_tenant_safety_and_expense_link(async_client, auth_headers, db_session, test_administration):
    create = await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json={
        "type": "loan",
        "name": "Tenant-lening",
        "amount_cents": 30000,
        "monthly_payment_cents": 30000,
        "principal_amount_cents": 300000,
        "interest_rate": 2.5,
        "start_date": "2026-01-01",
    })
    assert create.status_code == 201
    commitment_id = create.json()['id']

    # expense link should work for same tenant
    expense = await async_client.post('/api/v1/zzp/expenses', headers=auth_headers, json={
        "vendor": "Tenant-lening",
        "expense_date": date.today().isoformat(),
        "amount_cents": 30000,
        "vat_rate": 21,
        "category": "algemeen",
        "commitment_id": commitment_id,
    })
    assert expense.status_code == 201
    assert expense.json()['commitment_id'] == commitment_id

    # Create second tenant
    other_user = User(
        email='other-zzp@example.com',
        hashed_password=get_password_hash('TestPassword123'),
        full_name='Other ZZP',
        role=UserRole.ZZP.value,
        is_active=True,
    )
    db_session.add(other_user)
    await db_session.flush()

    other_admin = Administration(name='Other Admin', is_active=True)
    db_session.add(other_admin)
    await db_session.flush()

    db_session.add(AdministrationMember(user_id=other_user.id, administration_id=other_admin.id, role=MemberRole.OWNER))
    await db_session.commit()

    other_headers = {"Authorization": f"Bearer {create_access_token(data={'sub': str(other_user.id), 'email': other_user.email})}"}

    # other tenant cannot read commitment
    detail = await async_client.get(f'/api/v1/zzp/commitments/{commitment_id}', headers=other_headers)
    assert detail.status_code == 404

    # other tenant cannot link expense to foreign commitment
    bad_link = await async_client.post('/api/v1/zzp/expenses', headers=other_headers, json={
        "vendor": "hack",
        "expense_date": date.today().isoformat(),
        "amount_cents": 1000,
        "vat_rate": 21,
        "category": "algemeen",
        "commitment_id": commitment_id,
    })
    assert bad_link.status_code == 404


@pytest.mark.asyncio
async def test_commitment_validation_rules(async_client, auth_headers):
    invalid_amount = await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json={
        "type": "loan",
        "name": "Invalid",
        "amount_cents": 0,
        "monthly_payment_cents": 1000,
        "principal_amount_cents": 10000,
        "interest_rate": 10,
        "start_date": "2026-01-01",
    })
    assert invalid_amount.status_code == 422

    invalid_interest = await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json={
        "type": "loan",
        "name": "Invalid",
        "amount_cents": 1000,
        "monthly_payment_cents": 1000,
        "principal_amount_cents": 10000,
        "interest_rate": 120,
        "start_date": "2026-01-01",
    })
    assert invalid_interest.status_code == 422

    invalid_date = await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json={
        "type": "subscription",
        "name": "Invalid",
        "amount_cents": 1000,
        "recurring_frequency": "monthly",
        "start_date": "2026-02-01",
        "end_date": "2026-01-01",
    })
    assert invalid_date.status_code == 422


@pytest.mark.asyncio
async def test_create_expense_from_commitment_updates_status_and_prevents_duplicate(async_client, auth_headers):
    create = await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json={
        "type": "subscription",
        "name": "Canva",
        "amount_cents": 1500,
        "recurring_frequency": "monthly",
        "start_date": "2026-01-01",
        "vat_rate": 21,
    })
    assert create.status_code == 201
    commitment_id = create.json()['id']

    first = await async_client.post(f'/api/v1/zzp/commitments/{commitment_id}/create-expense', headers=auth_headers, json={
        "expense_date": "2026-02-10",
        "amount_cents": 1500,
        "vat_rate": 21,
        "description": "Canva februari",
    })
    assert first.status_code == 201
    payload = first.json()
    assert payload['linked_expenses_count'] == 1
    assert payload['last_booked_date'] == '2026-02-10'

    detail = await async_client.get(f'/api/v1/zzp/commitments/{commitment_id}', headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()['last_booked_date'] == '2026-02-10'

    duplicate = await async_client.post(f'/api/v1/zzp/commitments/{commitment_id}/create-expense', headers=auth_headers, json={
        "expense_date": "2026-02-20",
        "amount_cents": 1500,
        "vat_rate": 21,
        "description": "Canva februari opnieuw",
    })
    assert duplicate.status_code == 409

    paused_update = await async_client.patch(
        f'/api/v1/zzp/commitments/{commitment_id}',
        headers=auth_headers,
        json={"status": "paused"},
    )
    assert paused_update.status_code == 200

    paused_create = await async_client.post(f'/api/v1/zzp/commitments/{commitment_id}/create-expense', headers=auth_headers, json={
        "expense_date": "2026-03-01",
        "amount_cents": 1500,
        "vat_rate": 21,
        "description": "Canva maart",
    })
    assert paused_create.status_code == 409

    ended_update = await async_client.patch(
        f'/api/v1/zzp/commitments/{commitment_id}',
        headers=auth_headers,
        json={"status": "ended"},
    )
    assert ended_update.status_code == 200

    ended_create = await async_client.post(f'/api/v1/zzp/commitments/{commitment_id}/create-expense', headers=auth_headers, json={
        "expense_date": "2026-04-01",
        "amount_cents": 1500,
        "vat_rate": 21,
        "description": "Canva april",
    })
    assert ended_create.status_code == 409

    invalid_vat = await async_client.post(f'/api/v1/zzp/commitments/{commitment_id}/create-expense', headers=auth_headers, json={
        "expense_date": "2026-03-20",
        "amount_cents": 1500,
        "vat_rate": 6,
        "description": "Invalid",
    })
    assert invalid_vat.status_code == 422


@pytest.mark.asyncio
async def test_create_expense_from_commitment_blocks_locked_period(async_client, auth_headers, db_session, test_administration):
    create = await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json={
        "type": "subscription",
        "name": "Locked test",
        "amount_cents": 1500,
        "recurring_frequency": "monthly",
        "start_date": "2026-01-01",
    })
    assert create.status_code == 201
    commitment_id = create.json()['id']

    period = AccountingPeriod(
        administration_id=test_administration.id,
        name='2026-03',
        period_type='MONTH',
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 31),
        status=PeriodStatus.FINALIZED,
        is_closed=True,
    )
    db_session.add(period)
    await db_session.commit()

    response = await async_client.post(f'/api/v1/zzp/commitments/{commitment_id}/create-expense', headers=auth_headers, json={
        "expense_date": "2026-03-10",
        "amount_cents": 1500,
        "vat_rate": 21,
        "description": "Locked month",
    })
    assert response.status_code == 409
    assert response.json()['detail']['code'] == 'PERIOD_LOCKED'
