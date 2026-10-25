"""Regressions for invoice numbering, edits, previews, snapshots and PDFs."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID, uuid4
import pytest
from sqlalchemy import select, func
from app.models.zzp import ZZPInvoice, ZZPInvoiceCounter, BusinessProfile
from app.models.ledger import JournalEntry
from app.services.invoice_pdf import generate_invoice_html
from app.services.invoice_rendering import render_invoice_pdf
from app.api.v1._zzp_invoices_helpers import calculate_line_totals


def payload(customer, **changes):
    return {'customer_id':str(customer.id),'issue_date':date.today().isoformat(),'lines':[{'description':'Work <b>unfinished & documented','quantity':1,'unit_price_cents':1999,'vat_rate':21}],**changes}

async def create(client,headers,customer,**changes):
    r=await client.post('/api/v1/zzp/invoices',headers=headers,json=payload(customer,**changes))
    assert r.status_code==201,r.text
    return r.json()

@pytest.mark.parametrize('qty,price,rate,net,vat',[('1',1999,21,1999,420),('1.5',101,21,152,32),('1.23',101,9,124,11)])
def test_half_up_per_line(qty,price,rate,net,vat):
    assert calculate_line_totals(Decimal(qty),price,rate)==(net,vat)

@pytest.mark.asyncio
async def test_numbers_skip_manual_assignments(async_client,auth_headers,test_customer):
    first=await create(async_client,auth_headers,test_customer)
    number=f'INV-{date.today().year}-0002'
    r=await async_client.put('/api/v1/zzp/invoices/'+first['id'],headers=auth_headers,json={'invoice_number':number})
    assert r.status_code==200,r.text
    second=await create(async_client,auth_headers,test_customer)
    assert second['invoice_number']==f'INV-{date.today().year}-0003'
    r=await async_client.put('/api/v1/zzp/invoices/'+second['id'],headers=auth_headers,json={'invoice_number':number})
    assert r.status_code==409

@pytest.mark.asyncio
async def test_creation_retry_is_idempotent(async_client,auth_headers,test_customer,db_session):
    headers={**auth_headers,'Idempotency-Key':str(uuid4())}
    first=await create(async_client,headers,test_customer)
    second=await create(async_client,headers,test_customer)
    assert first['id']==second['id']
    r=await async_client.post('/api/v1/zzp/invoices',headers=headers,json=payload(test_customer,notes='Changed'))
    assert r.status_code==409
    assert await db_session.scalar(select(func.count(ZZPInvoice.id)))==1

@pytest.mark.asyncio
async def test_edit_clears_fields_and_returns_current_lines(async_client,auth_headers,test_customer):
    inv=await create(async_client,auth_headers,test_customer,notes='Old',due_date=date.today().isoformat(),delivery_date=date.today().isoformat())
    r=await async_client.put('/api/v1/zzp/invoices/'+inv['id'],headers=auth_headers,json={'notes':None,'due_date':None,'delivery_date':None,'lines':[{'description':'New work','quantity':2,'unit_price_cents':10000,'vat_rate':21}]})
    assert r.status_code==200,r.text
    data=r.json()
    assert data['notes'] is data['due_date'] is data['delivery_date'] is None
    assert len(data['lines'])==1 and data['lines'][0]['description']=='New work'
    assert data['total_cents']==24200

@pytest.mark.asyncio
async def test_invalid_updates_and_precision_rejected(async_client,auth_headers,test_customer):
    inv=await create(async_client,auth_headers,test_customer)
    for changes in ({'lines':[]},{'lines':None},{'issue_date':None},{'due_date':'2000-01-01'}):
        r=await async_client.put('/api/v1/zzp/invoices/'+inv['id'],headers=auth_headers,json=changes)
        assert r.status_code==422,r.text
    r=await async_client.post('/api/v1/zzp/invoices',headers=auth_headers,json=payload(test_customer,lines=[{'description':'Work','quantity':1.2345,'unit_price_cents':100,'vat_rate':21}]))
    assert r.status_code==422

@pytest.mark.asyncio
async def test_preview_writes_nothing(async_client,auth_headers,test_customer,db_session):
    with patch('app.api.v1.zzp_invoices.render_invoice_pdf',return_value=b'%PDF-1.7 mock') as render:
        r=await async_client.post('/api/v1/zzp/invoices/preview',headers=auth_headers,json=payload(test_customer))
    assert r.status_code==200,r.text
    assert r.content.startswith(b'%PDF-') and 'inline' in r.headers['content-disposition']
    assert render.call_args.args[0].status=='draft' and render.call_args.args[0].total_cents==2419
    for model in (ZZPInvoice,ZZPInvoiceCounter,JournalEntry):
        assert await db_session.scalar(select(func.count()).select_from(model))==0

@pytest.mark.asyncio
async def test_draft_snapshot_refresh_and_issued_snapshot_freeze(async_client,auth_headers,test_customer,db_session,test_administration):
    inv=await create(async_client,auth_headers,test_customer)
    profile=BusinessProfile(administration_id=test_administration.id,company_name='Company A')
    db_session.add(profile);await db_session.commit()
    r=await async_client.put('/api/v1/zzp/invoices/'+inv['id'],headers=auth_headers,json={'notes':'Refreshed'})
    assert r.json()['seller_company_name']=='Company A'
    r=await async_client.patch('/api/v1/zzp/invoices/'+inv['id']+'/status',headers=auth_headers,json={'status':'sent'})
    assert r.status_code==200,r.text
    profile.company_name='Company B';await db_session.commit()
    with patch('app.api.v1.zzp_invoices.render_invoice_pdf',return_value=b'%PDF-1.7 mock') as render:
        r=await async_client.get('/api/v1/zzp/invoices/'+inv['id']+'/pdf',headers=auth_headers)
    assert r.status_code==200 and render.call_args.args[0].seller_company_name=='Company A'

@pytest.mark.asyncio
async def test_unicode_filename(async_client,auth_headers,test_customer):
    inv=await create(async_client,auth_headers,test_customer,notes='First\nSecond')
    path='/api/v1/zzp/invoices/'+inv['id']
    r=await async_client.put(path,headers=auth_headers,json={'invoice_number':'INV-€-001'})
    assert r.status_code==200
    r=await async_client.get(path+'/pdf',headers=auth_headers)
    assert r.status_code==200,r.text
    assert "filename*=UTF-8''INV-%E2%82%AC-001.pdf" in r.headers['content-disposition']
    assert 'no-store' in r.headers['cache-control']

@pytest.mark.asyncio
async def test_public_uses_same_renderer(async_client,auth_headers,test_customer):
    inv=await create(async_client,auth_headers,test_customer)
    shared=await async_client.post('/api/v1/zzp/invoices/'+inv['id']+'/share-link',headers=auth_headers)
    url=shared.json()['url'];path=url[url.index('/api/v1/'):]
    with patch('app.api.v1.invoice_sharing.render_invoice_pdf',return_value=b'%PDF-1.7 same') as render:
        r=await async_client.get(path)
    assert r.status_code==200,r.text
    assert render.call_args.args[0].id==UUID(inv['id'])

def sample_invoice(**changes):
    return SimpleNamespace(status='draft',invoice_number='INV-001',issue_date=date.today(),due_date=None,notes=changes.pop('notes','First\n<script>bad</script>'),customer_name=changes.pop('customer_name','<img src="file:///etc/passwd">'),seller_company_name='A&B',lines=[],subtotal_cents=0,vat_total_cents=0,total_cents=0,**changes)

def test_plain_text_is_escaped_and_concept_visible():
    html=generate_invoice_html(sample_invoice())
    assert 'CONCEPT' in html and 'A&amp;B' in html
    assert '&lt;script&gt;' in html and '<script>' not in html
    assert '<img src=' not in html and 'First<br/>' in html

def test_unicode_long_notes_and_safe_failure():
    invoice=sample_invoice(notes='Detailed notes '*1200,customer_name='شركة الاختبار')
    assert render_invoice_pdf(invoice).startswith(b'%PDF-')
    with patch('app.services.invoice_rendering.generate_invoice_pdf',side_effect=RuntimeError('unavailable')):
        with pytest.raises(RuntimeError):render_invoice_pdf(invoice)


@pytest.mark.asyncio
async def test_quote_conversion_and_manual_creation_share_numbering(async_client,auth_headers,test_customer):
    first=await create(async_client,auth_headers,test_customer)
    occupied=f'INV-{date.today().year}-0002'
    await async_client.put('/api/v1/zzp/invoices/'+first['id'],headers=auth_headers,json={'invoice_number':occupied})
    response=await async_client.post('/api/v1/zzp/quotes',headers=auth_headers,json=payload(test_customer))
    assert response.status_code==201,response.text
    converted=await async_client.post('/api/v1/zzp/quotes/'+response.json()['id']+'/convert',headers=auth_headers)
    assert converted.status_code==200,converted.text
    assert converted.json()['invoice_number']==f'INV-{date.today().year}-0003'
