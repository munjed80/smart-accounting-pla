"""Exercise revision 060 against real PostgreSQL enum/catalog semantics.

CI supplies an expendable PostgreSQL service. Each case uses its own schema.
"""
import importlib.util
import os
from pathlib import Path
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = os.getenv('ZZP_MIGRATION_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason='Requires disposable PostgreSQL migration database')


@pytest.mark.asyncio
@pytest.mark.parametrize('uppercase', [False, True])
async def test_commitment_upgrade_preserves_rows_and_normalizes_enum_labels(uppercase):
    engine = create_async_engine(DATABASE_URL)
    schema = f'zzp_migration_{uuid4().hex}'
    path = Path(__file__).parents[1] / 'alembic/versions/060_zzp_commitment_integrity.py'
    spec = importlib.util.spec_from_file_location('zzp_migration_060', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    async with engine.connect() as conn:
        try:
            await conn.execute(sa.text(f'CREATE SCHEMA {schema}'))
            await conn.execute(sa.text(f'SET search_path TO {schema}'))
            for enum, values in [('commitmenttype', ['lease', 'loan', 'subscription']),
                                 ('recurringfrequency', ['monthly', 'yearly']),
                                 ('commitmentstatus', ['active', 'paused', 'ended'])]:
                labels = ','.join(f"'{label.upper() if uppercase else label}'" for label in values)
                await conn.execute(sa.text(f'CREATE TYPE {enum} AS ENUM ({labels})'))
            await conn.execute(sa.text('''CREATE TABLE financial_commitments (
                id UUID PRIMARY KEY, administration_id UUID NOT NULL,
                type commitmenttype NOT NULL, recurring_frequency recurringfrequency,
                status commitmentstatus NOT NULL, amount_cents INTEGER NOT NULL
            )'''))
            admin_id, row_id = uuid4(), uuid4()
            await conn.execute(sa.text('''INSERT INTO financial_commitments
                (id, administration_id, type, recurring_frequency, status, amount_cents)
                VALUES (:id, :admin, :type, :frequency, :status, 12345)'''), {
                'id': row_id, 'admin': admin_id,
                'type': 'SUBSCRIPTION' if uppercase else 'subscription',
                'frequency': 'MONTHLY' if uppercase else 'monthly',
                'status': 'ACTIVE' if uppercase else 'active',
            })
            await conn.commit()

            def upgrade(sync_conn):
                context = MigrationContext.configure(sync_conn)
                with Operations.context(context), context.begin_transaction():
                    migration.upgrade()
            await conn.run_sync(upgrade)
            row = (await conn.execute(sa.text('SELECT * FROM financial_commitments'))).mappings().one()
            assert row['id'] == row_id and row['amount_cents'] == 12345
            assert (row['type'], row['recurring_frequency'], row['status']) == ('subscription', 'monthly', 'active')
            assert row['notes'] is None and row['legacy_source_key'] is None
            await conn.execute(sa.text("UPDATE financial_commitments SET recurring_frequency='quarterly', legacy_source_key='recurring:original'"))
            with pytest.raises(sa.exc.IntegrityError):
                async with conn.begin_nested():
                    await conn.execute(sa.text('''INSERT INTO financial_commitments
                        (id, administration_id, type, recurring_frequency, status, amount_cents, legacy_source_key)
                        VALUES (:id, :admin, 'subscription', 'quarterly', 'active', 12345, 'recurring:original')'''), {'id': uuid4(), 'admin': admin_id})
            await conn.commit()
        finally:
            await conn.rollback()
            await conn.execute(sa.text('SET search_path TO public'))
            await conn.execute(sa.text(f'DROP SCHEMA IF EXISTS {schema} CASCADE'))
            await conn.commit()
    await engine.dispose()
