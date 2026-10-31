"""Provider contract, network isolation and real ledger regression checks."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
import httpx
import pytest
from sqlalchemy import select, func
from fastapi import HTTPException
from app.models.ecommerce import EcommerceConnection, EcommerceOrder, EcommerceRefund, EcommerceMapping, EcommerceProvider, ConnectionStatus, MappingReviewStatus, EcommerceOrderStatus
from app.models.accounting import ChartOfAccount
from app.models.ledger import JournalEntry, JournalLine
from app.services.ecommerce_http import normalize_store_url, cents, store_get
from app.services.ecommerce_posting import post_mapping
from app.services.shopify_service import shopify_service
from app.services.woocommerce_service import woocommerce_service

@pytest.mark.parametrize('url', ['http://example.com','https://user:secret@example.com','https://127.0.0.1','https://example.com:8000','https://example.com?token=secret'])
def test_unsafe_store_urls_rejected(url):
    with pytest.raises(ValueError): normalize_store_url(url)

@pytest.mark.parametrize('value,expected', [('1.005',101),('19.99',1999),('0.29',29),('-1.005',-101)])
def test_decimal_money(value,expected):
    assert cents(value) == expected

@pytest.mark.asyncio
async def test_network_pins_public_dns_and_preserves_tls_host(monkeypatch):
    import asyncio
    loop=asyncio.get_running_loop()
    monkeypatch.setattr(loop,'getaddrinfo',AsyncMock(return_value=[(2,1,6,'',('93.184.216.34',443))]))
    client=SimpleNamespace(get=AsyncMock(return_value=httpx.Response(200)))
    await store_get(client,'https://store.example/orders',headers={'X-Token':'secret'})
    args=client.get.call_args
    assert args.args[0].host == '93.184.216.34'
    assert args.kwargs['headers']['Host'] == 'store.example'
    assert args.kwargs['extensions']['sni_hostname'] == 'store.example'
    assert args.kwargs['follow_redirects'] is False
    monkeypatch.setattr(loop,'getaddrinfo',AsyncMock(return_value=[(2,1,6,'',('127.0.0.1',443))]))
    with pytest.raises(ValueError): await store_get(client,'https://store.example/orders')
    with pytest.raises(ValueError): await store_get(client,'https://evil.example/orders',origin='https://store.example')
    assert client.get.call_count == 1

@pytest.mark.asyncio
async def test_woocommerce_refunds_fetch_all_pages_keep_currency_and_deduplicate(db_session,test_administration,monkeypatch):
    conn=EcommerceConnection(administration_id=test_administration.id,provider=EcommerceProvider.WOOCOMMERCE,status=ConnectionStatus.CONNECTED,shop_url='https://store.example')
    db_session.add(conn); await db_session.flush()
    calls=[]
    async def get(client,url,**kwargs):
        calls.append(url)
        data=[{'id':7,'amount':'1.005'}] if httpx.URL(url).params.get('page') == '1' else []
        return httpx.Response(200,json=data,request=httpx.Request('GET',url))
    monkeypatch.setattr('app.services.woocommerce_service.store_get',get)
    assert await woocommerce_service._sync_refunds(db_session,conn,conn.shop_url,('key','secret'),[('123','USD')]) == 1
    assert await woocommerce_service._sync_refunds(db_session,conn,conn.shop_url,('key','secret'),[('123','USD')]) == 0
    refund=(await db_session.execute(select(EcommerceRefund))).scalar_one()
    assert refund.currency == 'USD' and refund.amount_cents == 101
    assert any('page=2' in url for url in calls)

@pytest.mark.asyncio
async def test_failed_sync_rolls_back_all_imports(db_session,test_administration,monkeypatch):
    conn=EcommerceConnection(administration_id=test_administration.id,provider=EcommerceProvider.SHOPIFY,status=ConnectionStatus.CONNECTED,shop_url='https://test.myshopify.com')
    db_session.add(conn); await db_session.commit()
    async def orders(db,conn,*args):
        db.add(EcommerceOrder(connection_id=conn.id,administration_id=conn.administration_id,external_order_id='1'))
        await db.flush()
        return 1,0,[]
    monkeypatch.setattr(shopify_service,'_sync_orders',orders)
    monkeypatch.setattr(shopify_service,'_sync_customers',AsyncMock(side_effect=ValueError('provider failed')))
    log=await shopify_service.sync_all(db_session,conn,'not-a-real-token')
    assert log.status.value == 'failed' and log.orders_imported == 0
    assert await db_session.scalar(select(func.count()).select_from(EcommerceOrder)) == 0

@pytest.mark.asyncio
async def test_post_creates_balanced_idempotent_ledger_and_rejects_foreign_currency(db_session,test_administration):
    conn=EcommerceConnection(administration_id=test_administration.id,provider=EcommerceProvider.SHOPIFY,status=ConnectionStatus.CONNECTED)
    db_session.add(conn); await db_session.flush()
    order=EcommerceOrder(connection_id=conn.id,administration_id=conn.administration_id,external_order_id='1',total_amount_cents=12100,tax_cents=2100,subtotal_cents=10000,currency='EUR',status=EcommerceOrderStatus.PAID)
    db_session.add(order); await db_session.flush()
    for code,kind in [('1300','ASSET'),('8000','REVENUE'),('1700','LIABILITY')]:
        db_session.add(ChartOfAccount(administration_id=conn.administration_id,account_code=code,account_name=code,account_type=kind))
    mapping=EcommerceMapping(administration_id=conn.administration_id,connection_id=conn.id,order_id=order.id,provider='shopify',record_type='order',review_status=MappingReviewStatus.APPROVED,net_amount_cents=12100,tax_cents=2100,vat_amount_cents=2100,vat_status='auto',vat_rate=Decimal('21'),accounting_date=date(2026,10,31),currency='EUR')
    db_session.add(mapping); await db_session.flush()
    entry=await post_mapping(db_session,mapping)
    assert entry.total_debit == entry.total_credit == Decimal('121')
    assert (await post_mapping(db_session,mapping)).id == entry.id
    await db_session.flush()
    assert await db_session.scalar(select(func.count()).select_from(JournalLine)) == 3
    foreign=SimpleNamespace(id=__import__('uuid').uuid4(), administration_id=conn.administration_id, currency='USD')
    with pytest.raises(HTTPException): await post_mapping(db_session,foreign)

@pytest.mark.asyncio
async def test_changed_source_requires_reapproval_without_rewriting_posted_amounts(db_session,test_administration):
    from app.services.ecommerce_review_refresh import refresh_reviews
    conn=EcommerceConnection(administration_id=test_administration.id,provider=EcommerceProvider.SHOPIFY,status=ConnectionStatus.CONNECTED)
    db_session.add(conn); await db_session.flush()
    order=EcommerceOrder(connection_id=conn.id,administration_id=conn.administration_id,external_order_id='review',total_amount_cents=24200,subtotal_cents=20000,tax_cents=4200,currency='EUR')
    db_session.add(order); await db_session.flush()
    mapping=EcommerceMapping(administration_id=conn.administration_id,connection_id=conn.id,order_id=order.id,provider='shopify',record_type='order',review_status=MappingReviewStatus.APPROVED,net_amount_cents=12100,tax_cents=2100,vat_amount_cents=2100,vat_status='auto',vat_rate=21,currency='EUR')
    db_session.add(mapping); await db_session.flush()
    await refresh_reviews(db_session,conn)
    assert mapping.net_amount_cents == 24200
    assert mapping.review_status == MappingReviewStatus.NEEDS_REVIEW and mapping.vat_rate is None
    mapping.posted_entity_id=__import__('uuid').uuid4()
    order.total_amount_cents=36300
    await refresh_reviews(db_session,conn)
    assert mapping.net_amount_cents == 24200
    assert 'Bron gewijzigd' in mapping.notes
