import pytest
from datetime import date

from app.models.bank import BankAccount, BankTransaction, BankTransactionStatus


@pytest.mark.asyncio
async def test_commitments_crud(async_client, auth_headers):
    payload = {
        "type": "loan",
        "name": "Zakelijke lening bus",
        "amount_cents": 45000,
        "monthly_payment_cents": 45000,
        "principal_amount_cents": 500000,
        "interest_rate": 5.2,
        "start_date": "2026-01-01",
        "end_date": "2028-12-31",
    }

    create = await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json=payload)
    assert create.status_code == 201
    item = create.json()

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
async def test_commitment_overview_and_suggestions(async_client, auth_headers, db_session, test_administration):
    overview = await async_client.get('/api/v1/zzp/commitments/overview/summary', headers=auth_headers)
    assert overview.status_code == 200

    bank_account = BankAccount(
        administration_id=test_administration.id,
        iban='NL11TEST0123456789',
        bank_name='Test Bank',
        currency='EUR',
    )
    db_session.add(bank_account)
    await db_session.flush()

    for d in [date(2026,1,5), date(2026,2,5), date(2026,3,5)]:
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
