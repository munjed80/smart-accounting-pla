"""Temporary audit probes: assertions capture current defects, not desired behavior."""
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4
import pytest
from sqlalchemy import select, func
from app.models.administration import Administration
from app.models.zzp import ZZPInvoice, ZZPCustomer
from app.models.payment import ZZPPayment, ZZPPaymentAllocation
from app.models.ledger import AccountingPeriod, PeriodStatus, JournalEntry
from app.models.accounting import ChartOfAccount
from app.services.zzp_integrity import sync_invoice
from app.api.v1.zzp_expenses import calculate_vat_amount

async def seed_payment(db, invoice):
    payment = ZZPPayment(administration_id=invoice.administration_id, amount_cents=invoice.total_cents,
        payment_date=datetime.now(timezone.utc),status='completed',payment_method='bank_transfer')
    db.add(payment)
    await db.flush()
    db.add(ZZPPaymentAllocation(payment_id=payment.id,invoice_id=invoice.id,allocated_amount_cents=invoice.total_cents))
    invoice.status='paid'
    invoice.amount_paid_cents=invoice.total_cents
    await db.commit()

async def test_ui_payment_paths_are_unregistered(async_client,auth_headers,test_invoice_sent):
    for action in ['mark-paid','mark-unpaid']:
        r=await async_client.post(f'/api/v1/zzp/payments/invoices/{test_invoice_sent.id}/{action}',headers=auth_headers,json={})
        assert r.status_code==404,r.text
    print('CONFIRMED: both frontend payment action paths return HTTP 404')

async def test_foreign_invoice_can_be_unpaid(async_client,auth_headers,db_session,test_invoice_sent):
    victim_admin=Administration(name='Victim audit fixture',is_active=True)
    db_session.add(victim_admin)
    await db_session.flush()
    victim_customer=ZZPCustomer(administration_id=victim_admin.id,name='Victim customer',status='active')
    db_session.add(victim_customer)
    await db_session.flush()
    victim=ZZPInvoice(administration_id=victim_admin.id,customer_id=victim_customer.id,invoice_number='AUDIT-VICTIM',status='paid',
        issue_date=date.today(),seller_company_name='Victim fixture',customer_name='Fixture customer',
        subtotal_cents=10000,vat_total_cents=2100,total_cents=12100,amount_paid_cents=12100)
    db_session.add(victim)
    await db_session.flush()
    await seed_payment(db_session,victim)
    r=await async_client.post(f'/api/v1/zzp/invoices/{victim.id}/mark-unpaid',headers=auth_headers)
    assert r.status_code==204,r.text
    await db_session.refresh(victim)
    assert victim.status=='sent' and victim.amount_paid_cents==0
    assert await db_session.scalar(select(func.count()).select_from(ZZPPaymentAllocation).where(ZZPPaymentAllocation.invoice_id==victim.id))==0
    print('CONFIRMED: authenticated account A resets paid invoice belonging to unrelated administration B')

async def test_locked_period_accepts_payment(async_client,auth_headers,db_session,test_invoice_sent,test_administration):
    day=date.today()
    db_session.add(AccountingPeriod(administration_id=test_administration.id,name='Locked audit period',period_type='MONTH',start_date=day,end_date=day,status=PeriodStatus.LOCKED,is_closed=True))
    await db_session.commit()
    r=await async_client.post(f'/api/v1/zzp/invoices/{test_invoice_sent.id}/mark-paid',headers=auth_headers,json={})
    assert r.status_code==200,r.text
    await db_session.refresh(test_invoice_sent)
    assert test_invoice_sent.status=='paid'
    print('CONFIRMED: payment mutation accepted inside LOCKED accounting period')

async def test_payment_does_not_post_ledger(async_client,auth_headers,db_session,test_invoice_sent,test_administration):
    for code,kind in [('1100','ASSET'),('1300','ASSET'),('1700','LIABILITY'),('8000','REVENUE')]:
        db_session.add(ChartOfAccount(administration_id=test_administration.id,account_code=code,account_name=code,account_type=kind,is_active=True))
    await db_session.flush()
    await sync_invoice(db_session,test_administration.id,test_invoice_sent)
    await db_session.commit()
    assert await db_session.scalar(select(func.count()).select_from(JournalEntry).where(JournalEntry.source_type=='INVOICE'))==1
    r=await async_client.post(f'/api/v1/zzp/invoices/{test_invoice_sent.id}/mark-paid',headers=auth_headers,json={})
    assert r.status_code==200,r.text
    assert await db_session.scalar(select(func.count()).select_from(JournalEntry).where(JournalEntry.source_type=='INVOICE_PAYMENT'))==0
    print('CONFIRMED: invoice marked paid with configured chart, but no payment journal entry')

async def test_receipt_bytes_discarded(async_client,auth_headers):
    r=await async_client.post('/api/v1/zzp/expenses/scan',headers=auth_headers,files={'file':('receipt.png',b'not actually an image','image/png')})
    assert r.status_code==200,r.text
    body=r.json()
    assert body['status']=='manual_entry'
    assert 'attachment_url' not in body and 'attachment_url' not in body['extracted_data']
    print('CONFIRMED: receipt scan accepts non-image bytes, says photo added, returns no attachment reference')

def test_expense_vat_truncates_cents():
    actual=calculate_vat_amount(1000,21)
    rounded=int((Decimal(1000)*21/121).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    assert (actual,rounded)==(173,174)
    print('CONFIRMED: 10 EUR inclusive expense has stored VAT 173 cents; half-up result 174 cents')

async def test_quote_invoice_rounding_disagrees(async_client,auth_headers,test_customer):
    item={'description':'Audit fractional work','quantity':1.5,'unit_price_cents':101,'vat_rate':21}
    payload={'customer_id':str(test_customer.id),'issue_date':date.today().isoformat(),'lines':[item]}
    q=await async_client.post('/api/v1/zzp/quotes',headers=auth_headers,json=payload)
    i=await async_client.post('/api/v1/zzp/invoices',headers=auth_headers,json=payload)
    assert q.status_code==i.status_code==201,(q.text,i.text)
    quote,invoice=q.json(),i.json()
    assert (quote['subtotal_cents'],quote['vat_total_cents'],quote['total_cents'])==(151,31,182)
    assert (invoice['subtotal_cents'],invoice['vat_total_cents'],invoice['total_cents'])==(152,32,184)
    print('CONFIRMED: identical 1.5 x 101-cent line yields quote 182 cents vs invoice 184 cents')

def test_duplicate_vat_route_shadows_pagination_and_guard():
    from app.main import app
    path='/api/v1/accountant/clients/{client_id}/vat/submissions'
    matches=[r for r in app.routes if r.path==path and 'GET' in getattr(r,'methods',[])]
    assert len(matches)==2
    first={field.name for field in matches[0].dependant.query_params}
    documented={field['name'] for field in app.openapi()['paths'][path]['get']['parameters'] if field['in']=='query'}
    assert 'page_size' not in first and 'page_size' in documented
    print('CONFIRMED: duplicate VAT route; runtime handler lacks documented pagination and required reports scope')
