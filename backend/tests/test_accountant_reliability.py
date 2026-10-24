"""Regression tests against real routes/services for accountant audit findings."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from sqlalchemy import text, event, select

from app.core.security import create_access_token
from app.models.administration import Administration
from app.models.user import User
from app.models.zzp import ZZPExpense, ZZPInvoice, ZZPTimeEntry, ZZPCustomer
from app.services.accountant_dashboard import AccountantDashboardService


@pytest_asyncio.fixture
async def accountant_access(db_session, test_user, test_administration):
    accountant = User(email='audit-accountant@example.com', full_name='Audit Accountant',
                      hashed_password='unused', role='accountant', is_active=True,
                      email_verified_at=datetime.now(timezone.utc))
    db_session.add(accountant)
    await db_session.flush()
    await db_session.execute(text('''
        INSERT INTO accountant_client_assignments
        (id, accountant_id, client_user_id, administration_id, status, invited_by, is_primary, scopes)
        VALUES (:id, :accountant, :client, :admin, 'ACTIVE', 'ACCOUNTANT', 1, :scopes)
    '''), dict(id=uuid4().hex, accountant=accountant.id.hex, client=test_user.id.hex,
              admin=test_administration.id.hex, scopes=''))
    await db_session.commit()
    return {'Authorization': f"Bearer {create_access_token(data={'sub': str(accountant.id)})}"}


@pytest.mark.asyncio
async def test_invoice_export_reaches_csv_route_and_keeps_tenant_isolation(
    async_client, db_session, accountant_access, test_administration, test_invoice_sent,
):
    other = Administration(name='Other tenant')
    db_session.add(other)
    await db_session.flush()
    customer = ZZPCustomer(administration_id=other.id, name='Other customer', status='active')
    db_session.add(customer)
    await db_session.flush()
    db_session.add(ZZPInvoice(administration_id=other.id, customer_id=customer.id, invoice_number='OTHER-SECRET',
                             status='sent', issue_date=date.today(), seller_company_name='Other',
                             customer_name='Private', subtotal_cents=100, vat_total_cents=21, total_cents=121))
    await db_session.commit()
    result = await async_client.get(f'/api/v1/accountant/clients/{test_administration.id}/invoices/export', headers=accountant_access)
    assert result.status_code == 200, result.text
    assert 'text/csv' in result.headers['content-type']
    assert test_invoice_sent.invoice_number in result.text
    assert 'OTHER-SECRET' not in result.text
    forbidden = await async_client.get(f'/api/v1/accountant/clients/{other.id}/invoices/export', headers=accountant_access)
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_dossier_pagination_totals_cover_all_rows(async_client, db_session, accountant_access, test_administration, test_customer):
    for i in range(3):
        db_session.add(ZZPExpense(administration_id=test_administration.id, vendor=f'Vendor {i}',
                                  expense_date=date(2026, 1, i + 1), amount_cents=1000, vat_rate=21,
                                  vat_amount_cents=174, category='algemeen'))
        db_session.add(ZZPTimeEntry(administration_id=test_administration.id, description=f'Work {i}',
                                    entry_date=date(2026, 1, i + 1), hours=Decimal('2.00'), billable=i != 0))
        db_session.add(ZZPInvoice(administration_id=test_administration.id, customer_id=test_customer.id, invoice_number=f'AUDIT-{i}',
                                  status='sent', issue_date=date(2026, 1, i + 1), seller_company_name='Audit',
                                  customer_name='Customer', subtotal_cents=100, vat_total_cents=21, total_cents=121))
    await db_session.commit()
    base = f'/api/v1/accountant/clients/{test_administration.id}'
    for resource, field in [('expenses', 'expenses'), ('hours', 'entries'), ('invoices', 'invoices')]:
        first = await async_client.get(f'{base}/{resource}?limit=2&offset=0', headers=accountant_access)
        second = await async_client.get(f'{base}/{resource}?limit=2&offset=2', headers=accountant_access)
        assert first.status_code == second.status_code == 200, first.text
        a, b = first.json(), second.json()
        assert a['total'] == b['total'] == 3
        assert len(a[field]) == 2 and len(b[field]) == 1
        assert not ({row['id'] for row in a[field]} & {row['id'] for row in b[field]})
        if resource == 'expenses':
            assert a['total_amount_cents'] == b['total_amount_cents'] == 3000
        if resource == 'hours':
            assert Decimal(str(a['total_hours'])) == Decimal(str(b['total_hours'])) == 6
            assert Decimal(str(a['total_billable_hours'])) == 4
    invalid = await async_client.get(f'{base}/invoices?from_date=not-a-date', headers=accountant_access)
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_dashboard_cards_filter_before_pagination_and_keep_portfolio_counts():
    old = (datetime.now(timezone.utc) - timedelta(days=40)).isoformat()
    def card(name, score, activity=old):
        return dict(id=name, name=name, readiness_score=score, last_activity_at=activity,
                    red_issue_count=0, yellow_issue_count=0, documents_needing_review_count=2,
                    days_to_vat_deadline=None, backlog_age_max_days=3)
    service = AccountantDashboardService(AsyncMock(), uuid4())
    service.get_assigned_client_ids = AsyncMock(return_value=[uuid4()])
    service._build_client_status_cards = AsyncMock(return_value=[card('Zeta', 80), card('Alpha', 30), card('Beta', 60)])
    result = await service.get_clients_list(filters=['stale_30d'], search='a', sort_by='name', limit=1, offset=1)
    assert [c['name'] for c in result['clients']] == ['Beta']
    assert result['total_count'] == result['filtered_count'] == 3
    assert result['portfolio_counts']['documents'] == 6
    assert result['portfolio_counts']['inactive'] == 3


@pytest.mark.asyncio
async def test_client_links_issue_query_count_does_not_grow_with_clients(
    async_client, db_session, accountant_access, test_user, test_administration,
):
    accountant = (await db_session.execute(select(User).where(User.email == 'audit-accountant@example.com'))).scalar_one()
    for i in range(3):
        admin = Administration(name=f'Additional client {i}')
        db_session.add(admin)
        await db_session.flush()
        await db_session.execute(text("""
            INSERT INTO accountant_client_assignments
            (id, accountant_id, client_user_id, administration_id, status, invited_by, is_primary, scopes)
            VALUES (:id, :accountant, :client, :admin, 'ACTIVE', 'ACCOUNTANT', 1, '')
        """), dict(id=uuid4().hex, accountant=accountant.id.hex, client=test_user.id.hex, admin=admin.id.hex))
    await db_session.commit()
    statements = []
    engine = db_session.bind.sync_engine
    def capture(conn, cursor, statement, parameters, context, executemany):
        if 'client_issues' in statement.lower() and statement.lstrip().upper().startswith('SELECT'):
            statements.append(statement)
    event.listen(engine, 'before_cursor_execute', capture)
    try:
        response = await async_client.get('/api/v1/accountant/clients/links', headers=accountant_access)
        assert response.status_code == 200
        assert response.json()['active_count'] == 4
        assert len(statements) == 1
    finally:
        event.remove(engine, 'before_cursor_execute', capture)


@pytest.mark.asyncio
@pytest.mark.parametrize('role', ['admin', 'super_admin'])
async def test_staff_roles_need_the_same_approved_mandate(async_client, db_session, accountant_access, test_administration, role):
    accountant = (await db_session.execute(select(User).where(User.email == 'audit-accountant@example.com'))).scalar_one()
    accountant.role = role
    await db_session.commit()
    base = '/api/v1/accountant/clients'
    approved = await async_client.get(f'{base}/{test_administration.id}/invoices', headers=accountant_access)
    assert approved.status_code == 200
    unassigned = await async_client.get(f'{base}/{uuid4()}/invoices', headers=accountant_access)
    assert unassigned.status_code == 403


@pytest.mark.asyncio
async def test_dashboard_api_returns_a_page_with_portfolio_metadata(async_client, accountant_access):
    response = await async_client.get('/api/v1/accountant/dashboard/clients?limit=1&offset=0', headers=accountant_access)
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data['clients']) == data['total_count'] == 1
    assert len(data['priority_clients']) == 1
    assert data['portfolio_counts']['documents'] == 0
