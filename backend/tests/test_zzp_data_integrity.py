"""Integration regressions for ZZP mutation, posting, isolation, and pagination."""
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from uuid import UUID

import pytest
import pytest_asyncio
from sqlalchemy import select, func

from app.models.accounting import ChartOfAccount
from app.models.ledger import JournalEntry, JournalLine, AccountingPeriod, PeriodStatus
from app.models.zzp import ZZPExpense, ZZPDocument, ZZPDocType, ZZPDocStatus
from app.models.financial_commitment import FinancialCommitment
from app.models.payment import ZZPPaymentAllocation


@pytest_asyncio.fixture
async def expense_chart(db_session, test_administration):
    for code, kind in [('1100','ASSET'), ('1800','ASSET'), ('4500','EXPENSE'), ('1300','ASSET'), ('1700','LIABILITY'), ('8000','REVENUE')]:
        db_session.add(ChartOfAccount(administration_id=test_administration.id, account_code=code, account_name=code, account_type=kind, is_active=True))
    await db_session.commit()


def expense_payload(day='2026-10-01', cents=12100):
    return dict(vendor='Audit Vendor', expense_date=day, amount_cents=cents, vat_rate=21, category='algemeen')


async def expense_balance(client, headers, **params):
    result = await client.get('/api/v1/zzp/ledger', headers=headers, params=params)
    assert result.status_code == 200, result.text
    balances = result.json()['account_balances']
    return Decimal(next((b['balance'] for b in balances if b['account_code']=='4500'), '0'))


@pytest.mark.asyncio
async def test_expense_edit_delete_preserve_audit_and_correct_balances(async_client, db_session, auth_headers, expense_chart):
    created = await async_client.post('/api/v1/zzp/expenses', headers=auth_headers, json=expense_payload())
    assert created.status_code == 201, created.text
    id = created.json()['id']
    assert await expense_balance(async_client, auth_headers) == 100
    edited = await async_client.put(f'/api/v1/zzp/expenses/{id}', headers=auth_headers, json={'amount_cents':24200})
    assert edited.status_code == 200, edited.text
    assert await expense_balance(async_client, auth_headers) == 200
    assert await db_session.scalar(select(func.count(JournalEntry.id))) == 3  # original + reversal + replacement
    deleted = await async_client.delete(f'/api/v1/zzp/expenses/{id}', headers=auth_headers)
    assert deleted.status_code == 204
    assert await expense_balance(async_client, auth_headers) == 0
    assert await db_session.scalar(select(func.count(JournalEntry.id))) == 4
    assert await db_session.scalar(select(func.count(ZZPExpense.id))) == 0


@pytest.mark.asyncio
async def test_document_conversion_is_idempotent_and_preserves_evidence(async_client, db_session, auth_headers, test_administration, expense_chart):
    doc=ZZPDocument(administration_id=test_administration.id, filename='audit.pdf', mime_type='application/pdf', storage_ref='audit', doc_type=ZZPDocType.BON, status=ZZPDocStatus.NEW)
    db_session.add(doc); await db_session.commit()
    path=f'/api/v1/zzp/documents/{doc.id}'
    first=await async_client.post(path+'/create-expense',headers=auth_headers,json=expense_payload())
    second=await async_client.post(path+'/create-expense',headers=auth_headers,json=expense_payload())
    assert first.status_code==second.status_code==201
    assert first.json()['expense_id']==second.json()['expense_id']
    assert await db_session.scalar(select(func.count(ZZPExpense.id)))==1
    assert await expense_balance(async_client,auth_headers)==100
    assert (await async_client.delete(path,headers=auth_headers)).status_code==409


@pytest.mark.asyncio
async def test_locked_period_blocks_all_expense_mutation_paths(async_client, db_session, auth_headers, test_administration):
    created=await async_client.post('/api/v1/zzp/expenses',headers=auth_headers,json=expense_payload())
    id=created.json()['id']
    doc=ZZPDocument(administration_id=test_administration.id,filename='audit.pdf',mime_type='application/pdf',storage_ref='audit',doc_type=ZZPDocType.BON,status=ZZPDocStatus.NEW)
    db_session.add_all([doc,AccountingPeriod(administration_id=test_administration.id,name='Locked October',period_type='MONTH',start_date=date(2026,10,1),end_date=date(2026,10,31),status=PeriodStatus.LOCKED)])
    await db_session.commit()
    responses=[await async_client.post('/api/v1/zzp/expenses',headers=auth_headers,json=expense_payload()),
               await async_client.post(f'/api/v1/zzp/documents/{doc.id}/create-expense',headers=auth_headers,json=expense_payload()),
               await async_client.put(f'/api/v1/zzp/expenses/{id}',headers=auth_headers,json={'amount_cents':24200}),
               await async_client.put(f'/api/v1/zzp/expenses/{id}',headers=auth_headers,json={'expense_date':'2026-11-01'}),
               await async_client.delete(f'/api/v1/zzp/expenses/{id}',headers=auth_headers)]
    assert [r.status_code for r in responses]==[409]*5
    for response in responses: assert response.json()['detail']['code']=='PERIOD_LOCKED'


@pytest.mark.asyncio
async def test_destination_period_lock_blocks_moving_an_open_expense(async_client, db_session, auth_headers, test_administration):
    result=await async_client.post('/api/v1/zzp/expenses',headers=auth_headers,json=expense_payload('2026-09-01'))
    db_session.add(AccountingPeriod(administration_id=test_administration.id,name='Locked October',period_type='MONTH',start_date=date(2026,10,1),end_date=date(2026,10,31),status=PeriodStatus.LOCKED))
    await db_session.commit()
    moved=await async_client.put('/api/v1/zzp/expenses/'+result.json()['id'],headers=auth_headers,json={'expense_date':'2026-10-01'})
    assert moved.status_code==409


@pytest.mark.asyncio
async def test_invoice_posting_follows_lifecycle_and_repayment(async_client, db_session, auth_headers, test_customer, expense_chart):
    result=await async_client.post('/api/v1/zzp/invoices',headers=auth_headers,json={'customer_id':str(test_customer.id),'issue_date':date.today().isoformat(),'lines':[{'description':'Work','quantity':1,'unit_price_cents':10000,'vat_rate':21}]})
    assert result.status_code==201
    id=result.json()['id']
    assert await db_session.scalar(select(func.count(JournalEntry.id)))==0
    async def status(value):
        response=await async_client.patch(f'/api/v1/zzp/invoices/{id}/status',headers=auth_headers,json={'status':value})
        assert response.status_code==200, response.text
        return response.json()
    await status('cancelled')
    await status('draft')
    await status('sent')
    paid=await status('paid')
    assert paid['amount_paid_cents']==paid['total_cents']==12100
    await status('sent')
    await status('paid')
    active=(await db_session.execute(select(JournalEntry).where(JournalEntry.source_id==UUID(id),JournalEntry.reversed_by_id.is_(None)))).scalars().all()
    assert len([e for e in active if e.source_type=='INVOICE'])==1
    receipts = (await db_session.execute(select(JournalEntry).join(ZZPPaymentAllocation,
        JournalEntry.source_id == ZZPPaymentAllocation.id).where(
            ZZPPaymentAllocation.invoice_id == UUID(id), JournalEntry.source_type == 'PAYMENT_ALLOCATION',
            JournalEntry.reversed_by_id.is_(None)))).scalars().all()
    assert len(receipts) == 1
    assert receipts[0].total_debit == Decimal('121.00')
    # All entries, including reversals, remain balanced.
    assert all(e.total_debit==e.total_credit for e in (await db_session.execute(select(JournalEntry))).scalars())


@pytest.mark.asyncio
async def test_ledger_date_filters_apply_to_balances(async_client, auth_headers, expense_chart):
    for day in ['2026-01-01','2026-10-01']:
        assert (await async_client.post('/api/v1/zzp/expenses',headers=auth_headers,json=expense_payload(day))).status_code==201
    assert await expense_balance(async_client,auth_headers,from_date='2026-10-01',to_date='2026-10-31')==100
    assert await expense_balance(async_client,auth_headers)==200


@pytest.mark.asyncio
async def test_imported_commitment_is_idempotent_and_quarterly(async_client, db_session, auth_headers):
    data={'legacy_source_key':'recurring:old-123','type':'subscription','name':'Legacy quarterly','amount_cents':30000,'recurring_frequency':'quarterly','start_date':date.today().replace(day=1).isoformat(),'vat_rate':21,'notes':'Original notes'}
    a=await async_client.post('/api/v1/zzp/commitments',headers=auth_headers,json=data)
    b=await async_client.post('/api/v1/zzp/commitments',headers=auth_headers,json=data)
    assert a.status_code==b.status_code==201, a.text
    assert a.json()['id']==b.json()['id']
    assert await db_session.scalar(select(func.count(FinancialCommitment.id)))==1
    overview=await async_client.get('/api/v1/zzp/commitments/overview/summary',headers=auth_headers)
    assert overview.json()['monthly_total_cents']==10000
    assert a.json()['notes']=='Original notes'


@pytest.mark.asyncio
async def test_paid_at_drives_dashboard_not_updated_at(async_client, db_session, auth_headers, test_invoice_sent):
    test_invoice_sent.status='paid'; test_invoice_sent.paid_at=datetime(2025,1,1,tzinfo=timezone.utc)
    test_invoice_sent.issue_date=date(2025,1,1); test_invoice_sent.updated_at=datetime.now(timezone.utc)
    await db_session.commit()
    result=await async_client.get('/api/v1/zzp/dashboard',headers=auth_headers)
    assert result.status_code==200
    assert result.json()['invoices']['paid_this_month_cents']==0
    assert result.json()['btw']['vat_collected_cents']==0


@pytest.mark.asyncio
async def test_paginated_invoices_keep_stats_and_search_all_rows(async_client, auth_headers, test_customer):
    for i in range(3):
        response=await async_client.post('/api/v1/zzp/invoices',headers=auth_headers,json={'customer_id':str(test_customer.id),'issue_date':f'2026-10-0{i+1}','lines':[{'description':f'Work {i}','quantity':1,'unit_price_cents':10000,'vat_rate':21}]})
        assert response.status_code==201
    a=await async_client.get('/api/v1/zzp/invoices?limit=1&offset=0',headers=auth_headers)
    b=await async_client.get('/api/v1/zzp/invoices?limit=1&offset=1',headers=auth_headers)
    assert a.status_code==b.status_code==200
    assert a.json()['total']==b.json()['total']==3
    assert a.json()['stats']['totalAmount']==36300
    assert a.json()['invoices'][0]['id']!=b.json()['invoices'][0]['id']
    search=await async_client.get('/api/v1/zzp/invoices?limit=1&q=Work%200',headers=auth_headers)
    assert search.json()['total']==1


@pytest.mark.asyncio
async def test_commitment_expense_date_edits_recompute_duplicate_key_and_booking_date(async_client, db_session, auth_headers, expense_chart):
    created = await async_client.post('/api/v1/zzp/commitments', headers=auth_headers, json={
        'type': 'subscription', 'name': 'Monthly', 'amount_cents': 12100,
        'recurring_frequency': 'monthly', 'start_date': '2026-01-01',
    })
    assert created.status_code == 201, created.text
    commitment_id = created.json()['id']
    async def book(day):
        result = await async_client.post(f'/api/v1/zzp/commitments/{commitment_id}/create-expense', headers=auth_headers, json={
            'expense_date': day, 'amount_cents': 12100, 'vat_rate': 21, 'description': 'Monthly',
        })
        assert result.status_code == 201, result.text
        return result.json()['expense_id']
    first = await book('2026-09-01')
    await book('2026-10-01')
    duplicate = await async_client.put(f'/api/v1/zzp/expenses/{first}', headers=auth_headers, json={'expense_date': '2026-10-05'})
    assert duplicate.status_code == 409, duplicate.text
    moved = await async_client.put(f'/api/v1/zzp/expenses/{first}', headers=auth_headers, json={'expense_date': '2026-11-01'})
    assert moved.status_code == 200, moved.text
    assert (await db_session.get(ZZPExpense, UUID(first))).period_key == '2026-11'
    await async_client.delete(f'/api/v1/zzp/expenses/{first}', headers=auth_headers)
    await db_session.refresh(await db_session.get(FinancialCommitment, UUID(commitment_id)))
    assert (await db_session.get(FinancialCommitment, UUID(commitment_id))).last_booked_date == date(2026,10,1)


@pytest.mark.asyncio
async def test_cashflow_uses_payment_date_and_includes_zero_receipt_months(async_client, db_session, auth_headers, test_invoice_sent):
    today = date.today()
    end = today.replace(day=1)
    test_invoice_sent.status = 'paid'
    test_invoice_sent.issue_date = date(today.year - 1,1,1)
    test_invoice_sent.paid_at = datetime.combine(end - timedelta(days=3), datetime.min.time(), timezone.utc)
    test_invoice_sent.total_cents = 90000
    await db_session.commit()
    result = await async_client.get('/api/v1/zzp/commitments/overview/summary', headers=auth_headers)
    assert result.status_code == 200, result.text
    assert result.json()['average_monthly_receipts_cents'] == 30000
    assert result.json()['cashflow_to'] == (end - timedelta(days=1)).isoformat()


@pytest.mark.asyncio
async def test_document_pages_filter_before_pagination_and_keep_global_counts(async_client, db_session, auth_headers, test_administration):
    for name, status in [('first.pdf',ZZPDocStatus.NEW),('second.pdf',ZZPDocStatus.NEW),('processed.pdf',ZZPDocStatus.PROCESSED)]:
        db_session.add(ZZPDocument(administration_id=test_administration.id, filename=name, mime_type='application/pdf', storage_ref=name, doc_type=ZZPDocType.BON, status=status))
    await db_session.commit()
    result = await async_client.get('/api/v1/zzp/documents/page', headers=auth_headers, params={'limit':1})
    assert result.status_code == 200, result.text
    assert len(result.json()['documents']) == 1
    assert result.json()['total'] == 2
    assert result.json()['counts']['PROCESSED'] == 1
    processed = await async_client.get('/api/v1/zzp/documents/page', headers=auth_headers, params={'group':'processed','q':'processed'})
    assert processed.json()['total'] == 1
    assert processed.json()['documents'][0]['filename'] == 'processed.pdf'


@pytest.mark.asyncio
async def test_email_resend_preserves_paid_state_and_unconfigured_service_does_not_send(async_client, db_session, auth_headers, test_invoice_sent, expense_chart):
    from unittest.mock import patch, MagicMock
    test_invoice_draft = test_invoice_sent
    test_invoice_draft.status = 'draft'
    await db_session.commit()
    path = f'/api/v1/zzp/invoices/{test_invoice_draft.id}/send'
    with patch('app.api.v1.zzp_invoices.email_service') as email:
        email.client = None
        result = await async_client.post(path, headers=auth_headers)
    assert result.status_code == 503, result.text
    await db_session.refresh(test_invoice_draft)
    assert test_invoice_draft.status == 'draft'
    test_invoice_draft.status = 'paid'
    test_invoice_draft.paid_at = datetime.now(timezone.utc)
    test_invoice_draft.amount_paid_cents = test_invoice_draft.total_cents
    await db_session.commit()
    with patch('app.api.v1.zzp_invoices.email_service') as email, patch('app.services.invoice_rendering.generate_invoice_pdf_reportlab', return_value=b'pdf'):
        email.client = MagicMock()
        email.client.Emails.send.return_value = {'id':'mock-message'}
        result = await async_client.post(path, headers=auth_headers)
    assert result.status_code == 200, result.text
    assert result.json()['status'] == 'paid'
    assert result.json()['paid_at']


@pytest.mark.asyncio
async def test_invoiced_time_is_paged_and_invoice_numbers_are_batched(async_client, db_session, auth_headers, test_administration, test_invoice_sent):
    from app.models.zzp import ZZPTimeEntry
    from uuid import uuid4
    for index in range(3):
        db_session.add(ZZPTimeEntry(administration_id=test_administration.id, entry_date=date(2026,10,index+1), hours=Decimal('1.00'), description=f'Work {index}', invoice_id=test_invoice_sent.id, is_invoiced=True))
    await db_session.commit()
    path = '/api/v1/zzp/time-entries/invoiced'
    first = await async_client.get(path, headers=auth_headers, params={'limit':1})
    second = await async_client.get(path, headers=auth_headers, params={'limit':1,'offset':1})
    assert first.status_code == second.status_code == 200
    assert len(first.json()) == len(second.json()) == 1
    assert first.json()[0]['id'] != second.json()[0]['id']
    assert first.json()[0]['entry_date'] > second.json()[0]['entry_date']
    unknown = uuid4()
    labels = await async_client.get('/api/v1/zzp/invoice-numbers', headers=auth_headers, params=[('ids', str(test_invoice_sent.id)),('ids', str(unknown))])
    assert labels.status_code == 200, labels.text
    assert labels.json()['numbers'] == {str(test_invoice_sent.id): test_invoice_sent.invoice_number}
