"""PostgreSQL migration and first-use numbering concurrency coverage (CI service)."""
import asyncio
import importlib.util
import os
from pathlib import Path
from uuid import uuid4
import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from alembic.operations import Operations
from alembic.migration import MigrationContext
from app.api.v1._zzp_invoices_helpers import generate_invoice_number

DB = os.getenv('ZZP_MIGRATION_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not DB, reason='Requires disposable PostgreSQL service')

@pytest.mark.asyncio
@pytest.mark.parametrize('duplicates', [False, True])
async def test_invoice_migration_and_concurrent_first_counter(duplicates):
    schema = f'invoice_test_{uuid4().hex}'
    engine = create_async_engine(DB, connect_args={'server_settings': {'search_path':schema}})
    path = Path(__file__).parents[1]/'alembic/versions/061_invoice_editor_integrity.py'
    spec=importlib.util.spec_from_file_location('invoice_migration_061',path)
    migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
    async with engine.connect() as conn:
        try:
            await conn.execute(sa.text(f'CREATE SCHEMA {schema}'))
            await conn.execute(sa.text('CREATE TABLE administrations (id UUID PRIMARY KEY)'))
            await conn.execute(sa.text('CREATE TABLE zzp_invoices (id UUID PRIMARY KEY, administration_id UUID NOT NULL, invoice_number VARCHAR(50) NOT NULL)'))
            await conn.execute(sa.text('''CREATE TABLE zzp_invoice_counters (
                id UUID PRIMARY KEY, administration_id UUID NOT NULL UNIQUE, year INTEGER NOT NULL,
                counter INTEGER NOT NULL, created_at TIMESTAMP DEFAULT now())'''))
            admin_id=uuid4()
            await conn.execute(sa.text('INSERT INTO administrations VALUES (:id)'),{'id':admin_id})
            if duplicates:
                for _ in range(2):
                    await conn.execute(sa.text("INSERT INTO zzp_invoices VALUES (:id,:admin,'INV-duplicate')"),{'id':uuid4(),'admin':admin_id})
            await conn.commit()
            def upgrade(connection):
                context=MigrationContext.configure(connection)
                with Operations.context(context),context.begin_transaction():migration.upgrade()
            if duplicates:
                with pytest.raises(RuntimeError, match='Duplicate invoice numbers'):
                    await conn.run_sync(upgrade)
                await conn.rollback()
                assert await conn.scalar(sa.text('SELECT COUNT(*) FROM zzp_invoices'))==2
                return
            await conn.run_sync(upgrade)
            await conn.commit()
            async def reserve():
                async with async_sessionmaker(engine,expire_on_commit=False)() as session:
                    number=await generate_invoice_number(admin_id,session)
                    await session.execute(sa.text('INSERT INTO zzp_invoices (id,administration_id,invoice_number) VALUES (:id,:admin,:number)'),{'id':uuid4(),'admin':admin_id,'number':number})
                    await session.commit()
                    return number
            numbers=await asyncio.gather(reserve(),reserve())
            assert len(set(numbers))==2
            with pytest.raises(sa.exc.IntegrityError):
                async with conn.begin_nested():
                    await conn.execute(sa.text('INSERT INTO zzp_invoices (id,administration_id,invoice_number) VALUES (:id,:admin,:number)'),{'id':uuid4(),'admin':admin_id,'number':numbers[0]})
        finally:
            await conn.rollback()
            await conn.execute(sa.text(f'DROP SCHEMA IF EXISTS {schema} CASCADE'))
            await conn.commit()
    await engine.dispose()
