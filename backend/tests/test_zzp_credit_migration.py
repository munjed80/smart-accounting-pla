"""Frozen migration and competing financial writes on real PostgreSQL in CI."""

import asyncio
import importlib.util
import os
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4
import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from alembic.operations import Operations
from alembic.migration import MigrationContext

DB = os.getenv("ZZP_MIGRATION_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DB, reason="Requires disposable PostgreSQL service")


@pytest.mark.asyncio
async def test_credit_migration_preserves_original_and_enforces_constraints():
    schema = "credit_migration_" + uuid4().hex
    engine = create_async_engine(
        DB, connect_args={"server_settings": {"search_path": schema}}
    )
    spec = importlib.util.spec_from_file_location(
        "credit_migration",
        Path(__file__).parents[1] / "alembic/versions/063_zzp_credit_notes.py",
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    try:
        async with engine.connect() as connection:
            try:
                await connection.execute(sa.text(f"CREATE SCHEMA {schema}"))
                for table in ["administrations", "users", "zzp_invoice_lines"]:
                    await connection.execute(
                        sa.text(f"CREATE TABLE {table} (id UUID PRIMARY KEY)")
                    )
                await connection.execute(
                    sa.text(
                        "CREATE TABLE zzp_invoices(id UUID PRIMARY KEY, total_cents INTEGER NOT NULL)"
                    )
                )
                admin, user, invoice = uuid4(), uuid4(), uuid4()
                for table, id in [("administrations", admin), ("users", user)]:
                    await connection.execute(
                        sa.text(f"INSERT INTO {table} VALUES (:id)"), {"id": id}
                    )
                await connection.execute(
                    sa.text("INSERT INTO zzp_invoices VALUES (:id,12100)"),
                    {"id": invoice},
                )

                def run(conn, action):
                    with Operations.context(MigrationContext.configure(conn)):
                        action()

                await connection.run_sync(lambda conn: run(conn, migration.upgrade))
                row = (
                    await connection.execute(
                        sa.text(
                            "SELECT total_cents,credited_cents,refunded_cents,credit_references FROM zzp_invoices"
                        )
                    )
                ).one()
                assert tuple(row) == (12100, 0, 0, None)
                insert = sa.text(
                    "INSERT INTO zzp_credit_notes(id,administration_id,invoice_id,number,issue_date,reason,subtotal_cents,vat_cents,total_cents,snapshot,creation_key,payload_hash,created_by) VALUES (:id,:admin,:invoice,'CN-2026-0001','2026-10-01','Retour',10000,2100,:total,'{}',:key,:hash,:user)"
                )
                params = dict(
                    id=uuid4(),
                    admin=admin,
                    invoice=invoice,
                    total=12100,
                    key=uuid4(),
                    hash="a" * 64,
                    user=user,
                )
                await connection.execute(insert, params)
                for change in [
                    dict(id=uuid4(), key=uuid4()),
                    dict(id=uuid4(), total=-12100),
                ]:
                    with pytest.raises(sa.exc.IntegrityError):
                        async with connection.begin_nested():
                            await connection.execute(insert, {**params, **change})
                await connection.run_sync(lambda conn: run(conn, migration.downgrade))
                assert (
                    await connection.scalar(
                        sa.text("SELECT total_cents FROM zzp_invoices")
                    )
                    == 12100
                )
            finally:
                await connection.rollback()
                await connection.execute(
                    sa.text(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
                )
                await connection.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_competing_credits_and_refunds_cannot_exceed_original_or_repeat_key():
    from fastapi import HTTPException
    from app.core.database import Base
    from app.models.user import User
    from app.models.administration import Administration
    from app.models.accounting import ChartOfAccount
    from app.models.zzp import ZZPCustomer, ZZPInvoice, ZZPInvoiceLine
    from app.models.credit_note import ZZPCreditNote, ZZPCustomerRefund
    from app.services.ledger_service import LedgerPostingService
    from app.repositories.ledger_repository import LedgerRepository
    from app.services.credit_notes import CreditNoteService
    from app.schemas.credit_note import CreditNoteRequest, RefundRequest

    schema = "credit_race_" + uuid4().hex
    engine = create_async_engine(
        DB, connect_args={"server_settings": {"search_path": schema}}
    )
    try:
        async with engine.begin() as connection:
            await connection.execute(sa.text(f"CREATE SCHEMA {schema}"))
            await connection.run_sync(Base.metadata.create_all)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with sessions() as session:
            admin = Administration(name="Race", is_active=True)
            user = User(
                email="credit-race@example.com",
                hashed_password="test",
                full_name="Owner",
                role="zzp",
                is_active=True,
            )
            session.add_all([admin, user])
            await session.flush()
            customer = ZZPCustomer(
                administration_id=admin.id, name="Customer", status="active"
            )
            session.add(customer)
            await session.flush()
            invoice = ZZPInvoice(
                administration_id=admin.id,
                customer_id=customer.id,
                invoice_number="INV-1",
                status="paid",
                issue_date=date.today(),
                seller_company_name="Company",
                customer_name="Customer",
                subtotal_cents=10000,
                vat_total_cents=2100,
                total_cents=12100,
                amount_paid_cents=12100,
                paid_at=datetime.now(timezone.utc),
            )
            session.add(invoice)
            await session.flush()
            line = ZZPInvoiceLine(
                invoice_id=invoice.id,
                line_number=1,
                description="Work",
                quantity=1,
                unit_price_cents=10000,
                vat_rate=21,
                line_total_cents=10000,
                vat_amount_cents=2100,
            )
            session.add(line)
            for code, kind in [
                ("1100", "ASSET"),
                ("1300", "ASSET"),
                ("1700", "LIABILITY"),
                ("8000", "REVENUE"),
            ]:
                session.add(
                    ChartOfAccount(
                        administration_id=admin.id,
                        account_code=code,
                        account_name=code,
                        account_type=kind,
                        is_active=True,
                    )
                )
            await session.flush()
            await LedgerPostingService(
                LedgerRepository(session, admin.id)
            ).post_invoice(invoice.id)
            await session.commit()
            admin_id, user_id, invoice_id, line_id = (
                admin.id,
                user.id,
                invoice.id,
                line.id,
            )
        payload = CreditNoteRequest(
            issue_date=date.today(),
            reason="Full return",
            lines=[{"invoice_line_id": line_id, "quantity": 1}],
        )

        async def issue(key):
            async with sessions() as session:
                try:
                    note = await CreditNoteService(session, admin_id).issue(
                        invoice_id, payload, key, user_id
                    )
                    await session.commit()
                    return 201, note.id
                except HTTPException as error:
                    await session.rollback()
                    return error.status_code, None

        # Separate keys compete for the same remaining quantity.
        outcomes = await asyncio.wait_for(
            asyncio.gather(issue(uuid4()), issue(uuid4())), 30
        )
        assert sorted(status for status, _ in outcomes) == [201, 409]
        note_id = next(id for status, id in outcomes if status == 201)
        refund_payload = RefundRequest(
            refund_date=date.today(), amount_cents=12100, reference="Bank returned"
        )

        async def refund(key):
            async with sessions() as session:
                try:
                    record = await CreditNoteService(session, admin_id).refund(
                        note_id, refund_payload, key, user_id
                    )
                    await session.commit()
                    return 201, record.id
                except HTTPException as error:
                    await session.rollback()
                    return error.status_code, None

        key = uuid4()
        results = await asyncio.wait_for(asyncio.gather(refund(key), refund(key)), 30)
        assert results[0] == results[1] and results[0][0] == 201
        assert (await refund(uuid4()))[0] == 409
        async with sessions() as session:
            assert await session.scalar(sa.select(sa.func.count(ZZPCreditNote.id))) == 1
            assert (
                await session.scalar(sa.select(sa.func.count(ZZPCustomerRefund.id)))
                == 1
            )
            invoice = await session.get(ZZPInvoice, invoice_id)
            assert invoice.credited_cents == invoice.refunded_cents == 12100
            assert invoice.total_cents == invoice.amount_paid_cents == 12100
    finally:
        async with engine.begin() as connection:
            await connection.execute(sa.text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
        await engine.dispose()
