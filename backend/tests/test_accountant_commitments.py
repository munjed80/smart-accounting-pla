import pytest
from datetime import date, timedelta, datetime, timezone

from app.core.roles import UserRole
from app.core.security import create_access_token, get_password_hash
from app.models.financial_commitment import CommitmentType, FinancialCommitment, RecurringFrequency, CommitmentStatus
from app.models.user import User
from app.models.zzp import ZZPExpense
from sqlalchemy import text


@pytest.mark.asyncio
async def test_accountant_commitments_requires_approved_mandate(async_client, db_session, test_administration):
    accountant = User(
        email='no-mandate-accountant@example.com',
        hashed_password=get_password_hash('TestPassword123'),
        full_name='No Mandate Accountant',
        role=UserRole.ACCOUNTANT.value,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(accountant)
    await db_session.commit()

    headers = {'Authorization': f"Bearer {create_access_token(data={'sub': str(accountant.id), 'email': accountant.email})}"}
    response = await async_client.get(f'/api/v1/accountant/clients/{test_administration.id}/commitments', headers=headers)

    assert response.status_code == 403
    assert response.json()['detail']['code'] == 'MANDATE_NOT_APPROVED'


@pytest.mark.asyncio
async def test_accountant_commitments_requires_active_assignment(async_client, db_session, test_user, test_administration):
    accountant = User(
        email='pending-mandate-accountant@example.com',
        hashed_password=get_password_hash('TestPassword123'),
        full_name='Pending Mandate Accountant',
        role=UserRole.ACCOUNTANT.value,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(accountant)
    await db_session.flush()

    await db_session.execute(
        text(
            """
            INSERT INTO accountant_client_assignments
                (id, accountant_id, client_user_id, administration_id, status, invited_by, is_primary, scopes)
            VALUES
                (:id, :accountant_id, :client_user_id, :administration_id, 'PENDING', 'ACCOUNTANT', 1, :scopes)
            """
        ),
        {
            'id': __import__('uuid').uuid4().hex,
            'accountant_id': accountant.id.hex,
            'client_user_id': test_user.id.hex,
            'administration_id': test_administration.id.hex,
            'scopes': 'expenses',
        },
    )
    await db_session.commit()

    headers = {'Authorization': f"Bearer {create_access_token(data={'sub': str(accountant.id), 'email': accountant.email})}"}
    response = await async_client.get(f'/api/v1/accountant/clients/{test_administration.id}/commitments', headers=headers)

    assert response.status_code == 403
    assert response.json()['detail']['code'] == 'MANDATE_NOT_APPROVED'


@pytest.mark.asyncio
async def test_accountant_commitments_summary_and_list(async_client, db_session, test_user, test_administration):
    accountant = User(
        email='commitments-accountant@example.com',
        hashed_password=get_password_hash('TestPassword123'),
        full_name='Commitments Accountant',
        role=UserRole.ACCOUNTANT.value,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(accountant)
    await db_session.flush()

    await db_session.execute(
        text(
            """
            INSERT INTO accountant_client_assignments
                (id, accountant_id, client_user_id, administration_id, status, invited_by, is_primary, scopes)
            VALUES
                (:id, :accountant_id, :client_user_id, :administration_id, 'ACTIVE', 'ACCOUNTANT', 1, :scopes)
            """
        ),
        {
            'id': __import__('uuid').uuid4().hex,
            'accountant_id': accountant.id.hex,
            'client_user_id': test_user.id.hex,
            'administration_id': test_administration.id.hex,
            'scopes': 'invoices,expenses',
        },
    )


    yearly_subscription = FinancialCommitment(
        administration_id=test_administration.id,
        type=CommitmentType.SUBSCRIPTION,
        name='Yearly Tool',
        amount_cents=12000,
        recurring_frequency=RecurringFrequency.YEARLY,
        start_date=date.today().replace(day=1),
        renewal_date=date.today() + timedelta(days=7),
        status=CommitmentStatus.ACTIVE,
    )
    monthly_loan = FinancialCommitment(
        administration_id=test_administration.id,
        type=CommitmentType.LOAN,
        name='Equipment Loan',
        amount_cents=40000,
        monthly_payment_cents=40000,
        principal_amount_cents=500000,
        start_date=date.today().replace(day=1),
        payment_day=min(date.today().day + 1, 28),
        status=CommitmentStatus.ACTIVE,
    )
    paused_lease = FinancialCommitment(
        administration_id=test_administration.id,
        type=CommitmentType.LEASE,
        name='Paused Lease',
        amount_cents=20000,
        monthly_payment_cents=20000,
        principal_amount_cents=200000,
        start_date=date.today().replace(day=1),
        status=CommitmentStatus.PAUSED,
    )
    db_session.add_all([yearly_subscription, monthly_loan, paused_lease])
    await db_session.flush()

    db_session.add_all([
        ZZPExpense(
            administration_id=test_administration.id,
            vendor='Yearly Tool',
            description='Linked expense',
            expense_date=date.today(),
            amount_cents=1000,
            vat_rate=21,
            vat_amount_cents=174,
            category='algemeen',
            commitment_id=yearly_subscription.id,
            period_key=date.today().strftime('%Y-%m'),
        ),
        ZZPExpense(
            administration_id=test_administration.id,
            vendor='Loan payment old period',
            description='Linked older expense',
            expense_date=date.today() - timedelta(days=35),
            amount_cents=40000,
            vat_rate=21,
            vat_amount_cents=6942,
            category='algemeen',
            commitment_id=monthly_loan.id,
            period_key=(date.today().replace(day=1) - timedelta(days=1)).strftime('%Y-%m'),
        ),
    ])

    await db_session.commit()

    headers = {'Authorization': f"Bearer {create_access_token(data={'sub': str(accountant.id), 'email': accountant.email})}"}
    response = await async_client.get(f'/api/v1/accountant/clients/{test_administration.id}/commitments', headers=headers)

    assert response.status_code == 200
    data = response.json()

    # active monthly loan (40000) + yearly subscription normalized (12000/12 = 1000)
    assert data['monthly_total_cents'] == 41000
    assert data['upcoming_30_days_total_cents'] >= 41000
    assert data['cashflow_stress_label'] == 'Onvoldoende data'
    assert data['total'] == 3
    assert len(data['commitments']) == 3

    yearly = next(item for item in data['commitments'] if item['name'] == 'Yearly Tool')
    assert yearly['linked_expenses_count'] == 1
    assert yearly['has_expense_in_period'] is True

    loan = next(item for item in data['commitments'] if item['name'] == 'Equipment Loan')
    assert loan['linked_expenses_count'] == 1
    assert loan['has_expense_in_period'] is False

    assert data['missing_this_period_count'] == 1

    filtered = await async_client.get(
        f'/api/v1/accountant/clients/{test_administration.id}/commitments',
        headers=headers,
        params={'status': 'active', 'type': 'loan'},
    )
    assert filtered.status_code == 200
    filtered_data = filtered.json()
    assert filtered_data['total'] == 1
    assert filtered_data['commitments'][0]['name'] == 'Equipment Loan'

