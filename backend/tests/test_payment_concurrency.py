"""Payment locks must serialize real PostgreSQL transactions, not SQLite mocks."""

import asyncio
import os
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import text, select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.database import Base
from app.models.administration import Administration
from app.models.zzp import ZZPCustomer, ZZPInvoice
from app.models.payment import ZZPPaymentAllocation
from app.services.payment_service import PaymentService

DATABASE_URL = os.getenv("ZZP_MIGRATION_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="Requires disposable PostgreSQL service"
)


@pytest.mark.asyncio
@pytest.mark.parametrize("partial", [False, True])
async def test_competing_receipts_cannot_overpay_or_duplicate(partial):
    schema = "payment_race_" + uuid4().hex
    bootstrap = create_async_engine(DATABASE_URL)
    engine = None
    try:
        async with bootstrap.begin() as connection:
            await connection.execute(text(f"CREATE SCHEMA {schema}"))
        engine = create_async_engine(
            DATABASE_URL, connect_args={"server_settings": {"search_path": schema}}
        )
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with sessions() as db:
            administration = Administration(name="Concurrency fixture", is_active=True)
            db.add(administration)
            await db.flush()
            customer = ZZPCustomer(
                administration_id=administration.id,
                name="Fixture customer",
                status="active",
            )
            db.add(customer)
            await db.flush()
            invoice = ZZPInvoice(
                administration_id=administration.id,
                customer_id=customer.id,
                invoice_number="CONCURRENT",
                status="sent",
                issue_date=date.today(),
                seller_company_name="Fixture",
                customer_name="Fixture",
                subtotal_cents=10000,
                vat_total_cents=2100,
                total_cents=12100,
                amount_paid_cents=0,
            )
            db.add(invoice)
            await db.commit()
            administration_id, invoice_id = administration.id, invoice.id

        async def receive():
            async with sessions() as db:
                try:
                    service = PaymentService(db, administration_id)
                    if partial:
                        await service.record_partial_payment(invoice_id, 8000)
                    else:
                        await service.mark_invoice_paid(invoice_id)
                    await db.commit()
                    return "accepted"
                except ValueError:
                    await db.rollback()
                    return "rejected"

        outcomes = await asyncio.wait_for(
            asyncio.gather(receive(), receive()), timeout=30
        )
        assert sorted(outcomes) == ["accepted", "rejected"]
        async with sessions() as db:
            count, paid = (
                await db.execute(
                    select(
                        func.count(ZZPPaymentAllocation.id),
                        func.sum(ZZPPaymentAllocation.allocated_amount_cents),
                    )
                )
            ).one()
            assert count == 1
            assert paid == (8000 if partial else 12100)
            current = await db.get(ZZPInvoice, invoice_id)
            assert current.amount_paid_cents == paid
    finally:
        if engine:
            await engine.dispose()
        async with bootstrap.begin() as connection:
            await connection.execute(text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
        await bootstrap.dispose()
