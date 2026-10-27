"""PostgreSQL rollout preserves legacy links; concurrent requests share one receipt."""

import asyncio
import importlib.util
import os
from datetime import date
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
async def test_bank_link_migration_preserves_legacy_records():
    schema = "bank_link_migration_" + uuid4().hex
    engine = create_async_engine(
        DB, connect_args={"server_settings": {"search_path": schema}}
    )
    spec = importlib.util.spec_from_file_location(
        "bank_link_migration",
        Path(__file__).parents[1] / "alembic/versions/064_zzp_bank_receipts.py",
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    try:
        async with engine.connect() as conn:
            try:
                await conn.execute(sa.text(f"CREATE SCHEMA {schema}"))
                await conn.execute(sa.text("CREATE TABLE users(id UUID PRIMARY KEY)"))
                await conn.execute(
                    sa.text("CREATE TABLE zzp_payments(id UUID PRIMARY KEY)")
                )
                await conn.execute(
                    sa.text(
                        "CREATE TABLE zzp_bank_transaction_matches(id UUID PRIMARY KEY,administration_id UUID NOT NULL,amount_cents INTEGER NOT NULL)"
                    )
                )
                id, admin = uuid4(), uuid4()
                await conn.execute(
                    sa.text(
                        "INSERT INTO zzp_bank_transaction_matches VALUES(:id,:admin,12100)"
                    ),
                    {"id": id, "admin": admin},
                )

                def run(connection, action):
                    with Operations.context(MigrationContext.configure(connection)):
                        action()

                await conn.run_sync(lambda c: run(c, migration.upgrade))
                assert tuple(
                    (
                        await conn.execute(
                            sa.text(
                                "SELECT amount_cents,payment_id,allocation_id,active,reversed_at,reversed_by_id,creation_key FROM zzp_bank_transaction_matches"
                            )
                        )
                    ).one()
                ) == (12100, None, None, True, None, None, None)
                key = uuid4()
                await conn.execute(
                    sa.text(
                        "UPDATE zzp_bank_transaction_matches SET creation_key=:key WHERE id=:id"
                    ),
                    {"key": key, "id": id},
                )
                with pytest.raises(sa.exc.IntegrityError):
                    async with conn.begin_nested():
                        await conn.execute(
                            sa.text(
                                "INSERT INTO zzp_bank_transaction_matches(id,administration_id,amount_cents,creation_key) VALUES(:id,:admin,12100,:key)"
                            ),
                            {"id": uuid4(), "admin": admin, "key": key},
                        )
                await conn.run_sync(lambda c: run(c, migration.downgrade))
                assert (
                    await conn.scalar(
                        sa.text("SELECT amount_cents FROM zzp_bank_transaction_matches")
                    )
                    == 12100
                )
            finally:
                await conn.rollback()
                await conn.execute(sa.text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
                await conn.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_bank_matching_retries_and_competing_transactions_are_serialized():
    from fastapi import HTTPException
    from app.core.database import Base
    from app.models.user import User
    from app.models.administration import Administration
    from app.models.accounting import ChartOfAccount
    from app.models.bank import BankAccount, BankTransaction
    from app.models.zzp import (
        ZZPCustomer,
        ZZPInvoice,
        ZZPInvoiceLine,
        ZZPBankTransactionMatch,
    )
    from app.models.payment import ZZPPayment
    from app.models.ledger import JournalEntry
    from app.services.ledger_service import LedgerPostingService
    from app.repositories.ledger_repository import LedgerRepository
    from app.services.zzp_bank_receipts import BankReceiptService
    from app.schemas.zzp import ZZPMatchInvoiceRequest

    schema = "bank_link_race_" + uuid4().hex
    engine = create_async_engine(
        DB, connect_args={"server_settings": {"search_path": schema}}
    )
    try:
        async with engine.begin() as conn:
            await conn.execute(sa.text(f"CREATE SCHEMA {schema}"))
            await conn.run_sync(Base.metadata.create_all)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with sessions() as session:
            admin = Administration(name="Bank matching race", is_active=True)
            user = User(
                email="bank-race@example.com",
                hashed_password="test-only",
                full_name="Owner",
                role="zzp",
                is_active=True,
            )
            session.add_all([admin, user])
            await session.flush()
            customer = ZZPCustomer(
                administration_id=admin.id, name="Customer", status="active"
            )
            bank = BankAccount(
                administration_id=admin.id, iban="NL91ABNA0417164300", currency="EUR"
            )
            session.add_all([customer, bank])
            await session.flush()
            invoice = ZZPInvoice(
                administration_id=admin.id,
                customer_id=customer.id,
                invoice_number="INV-BANK-1",
                status="sent",
                issue_date=date.today(),
                seller_company_name="Seller",
                customer_name="Customer",
                subtotal_cents=10000,
                vat_total_cents=2100,
                total_cents=12100,
            )
            session.add(invoice)
            await session.flush()
            session.add(
                ZZPInvoiceLine(
                    invoice_id=invoice.id,
                    line_number=1,
                    description="Work",
                    quantity=1,
                    unit_price_cents=10000,
                    vat_rate=21,
                    line_total_cents=10000,
                    vat_amount_cents=2100,
                )
            )
            for code, kind in [
                ("1100", "ASSET"),
                ("1300", "ASSET"),
                ("1700", "LIABILITY"),
                ("8000", "REVENUE"),
                ("9999", "LIABILITY"),
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
            transactions = [
                BankTransaction(
                    administration_id=admin.id,
                    bank_account_id=bank.id,
                    booking_date=date.today(),
                    amount=121,
                    currency="EUR",
                    description="Receipt",
                    import_hash=uuid4().hex,
                )
                for _ in range(2)
            ]
            session.add_all(transactions)
            await session.flush()
            await LedgerPostingService(
                LedgerRepository(session, admin.id)
            ).post_invoice(invoice.id)
            await session.commit()
            admin_id, user_id, invoice_id = admin.id, user.id, invoice.id
            tx_ids = [t.id for t in transactions]
        request = ZZPMatchInvoiceRequest(invoice_id=invoice_id)

        async def match(tx, key):
            async with sessions() as session:
                try:
                    record, _ = await BankReceiptService(session, admin_id).match(
                        tx, request, key, user_id
                    )
                    await session.commit()
                    return 200, record.id
                except HTTPException as error:
                    await session.rollback()
                    return error.status_code, None

        key = uuid4()
        replies = await asyncio.wait_for(
            asyncio.gather(match(tx_ids[0], key), match(tx_ids[0], key)), 30
        )
        assert replies[0] == replies[1] and replies[0][0] == 200
        assert (await match(tx_ids[1], uuid4()))[0] == 409
        match_id = replies[0][1]

        async def unlink():
            async with sessions() as session:
                record, _ = await BankReceiptService(session, admin_id).unmatch(
                    tx_ids[0], match_id, user_id
                )
                await session.commit()
                return record.id

        assert (
            len(set(await asyncio.wait_for(asyncio.gather(unlink(), unlink()), 30)))
            == 1
        )
        async with sessions() as session:
            assert await session.scalar(sa.select(sa.func.count(ZZPPayment.id))) == 1
            assert (
                await session.scalar(
                    sa.select(sa.func.count(ZZPBankTransactionMatch.id))
                )
                == 1
            )
            assert (
                await session.scalar(
                    sa.select(sa.func.count(JournalEntry.id)).where(
                        JournalEntry.source_type == "REVERSAL"
                    )
                )
                == 1
            )
            record = await session.get(ZZPBankTransactionMatch, match_id)
            assert not record.active and record.reversed_by_id == user_id
            payment = await session.scalar(sa.select(ZZPPayment))
            assert payment.status == "completed" and payment.amount_cents == 12100
        outcomes = await asyncio.wait_for(
            asyncio.gather(match(tx_ids[0], uuid4()), match(tx_ids[1], uuid4())), 30
        )
        assert sorted(status for status, _ in outcomes) == [200, 409]
        async with sessions() as session:
            from app.models.payment import ZZPPaymentAllocation

            assert (
                await session.scalar(
                    sa.select(sa.func.sum(ZZPPaymentAllocation.allocated_amount_cents))
                )
                == 12100
            )
            assert (
                await session.scalar(
                    sa.select(sa.func.count(ZZPBankTransactionMatch.id)).where(
                        ZZPBankTransactionMatch.active.is_(True)
                    )
                )
                == 1
            )
    finally:
        async with engine.begin() as conn:
            await conn.execute(sa.text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
        await engine.dispose()
