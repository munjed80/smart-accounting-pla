from datetime import date
from uuid import UUID
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.accounting import ChartOfAccount
from app.models.ledger import JournalEntry, JournalLine


@pytest.mark.asyncio
async def test_invoice_creation_posts_balanced_journal_entry(async_client, db_session, auth_headers, test_administration, test_customer):
    accounts = [
        ChartOfAccount(administration_id=test_administration.id, account_code='1100', account_name='Bank', account_type='ASSET', is_active=True),
        ChartOfAccount(administration_id=test_administration.id, account_code='1300', account_name='Debiteuren', account_type='ASSET', is_active=True),
        ChartOfAccount(administration_id=test_administration.id, account_code='1700', account_name='Te betalen BTW', account_type='LIABILITY', is_active=True),
        ChartOfAccount(administration_id=test_administration.id, account_code='8000', account_name='Omzet verkopen', account_type='REVENUE', is_active=True),
    ]
    db_session.add_all(accounts)
    await db_session.commit()

    response = await async_client.post(
        '/api/v1/zzp/invoices',
        headers=auth_headers,
        json={
            'customer_id': str(test_customer.id),
            'issue_date': date.today().isoformat(),
            'due_date': date.today().isoformat(),
            'notes': 'test',
            'lines': [
                {
                    'description': 'Development',
                    'quantity': 1,
                    'unit_price_cents': 100000,
                    'vat_rate': 21,
                }
            ],
        },
    )

    assert response.status_code == 201
    invoice_id = response.json()['id']

    entry_result = await db_session.execute(
        select(JournalEntry)
        .where(JournalEntry.source_type == 'INVOICE')
        .where(JournalEntry.source_id == UUID(invoice_id))
    )
    entry = entry_result.scalar_one_or_none()
    assert entry is not None
    assert entry.posted is True

    lines_result = await db_session.execute(
        select(JournalLine).where(JournalLine.journal_entry_id == entry.id)
    )
    lines = lines_result.scalars().all()

    total_debit = sum((line.debit_amount for line in lines), Decimal('0.00'))
    total_credit = sum((line.credit_amount for line in lines), Decimal('0.00'))

    assert total_debit == total_credit

    account_codes = {line.account_id for line in lines}
    seeded_ids = {acc.id for acc in accounts if acc.account_code in {'1300', '8000', '1700'}}
    assert seeded_ids.issubset(account_codes)
