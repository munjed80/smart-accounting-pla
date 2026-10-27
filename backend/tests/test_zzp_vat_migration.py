"""Apply the VAT policy migration on PostgreSQL without rewriting existing data."""

import importlib.util
import os
from pathlib import Path
from uuid import uuid4
import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine
from alembic.operations import Operations
from alembic.migration import MigrationContext

DB = os.getenv("ZZP_MIGRATION_TEST_DATABASE_URL")


@pytest.mark.asyncio
@pytest.mark.skipif(not DB, reason="Requires disposable PostgreSQL service")
async def test_vat_policy_migration_constraints_and_roundtrip():
    schema = "vat_policy_" + uuid4().hex
    engine = create_async_engine(
        DB, connect_args={"server_settings": {"search_path": schema}}
    )
    path = Path(__file__).parents[1] / "alembic/versions/062_zzp_vat_policy.py"
    spec = importlib.util.spec_from_file_location("vat_policy_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    try:
        async with engine.connect() as connection:
            try:
                await connection.execute(sa.text(f"CREATE SCHEMA {schema}"))
                for table in ["administrations", "users"]:
                    await connection.execute(
                        sa.text(f"CREATE TABLE {table} (id UUID PRIMARY KEY)")
                    )
                admin, user = uuid4(), uuid4()
                await connection.execute(
                    sa.text("INSERT INTO administrations VALUES (:id)"), {"id": admin}
                )
                await connection.execute(
                    sa.text("INSERT INTO users VALUES (:id)"), {"id": user}
                )

                def migrate(conn, fn):
                    context = MigrationContext.configure(conn)
                    with Operations.context(context):
                        fn()

                await connection.run_sync(lambda conn: migrate(conn, migration.upgrade))
                await connection.execute(
                    sa.text(
                        "INSERT INTO zzp_vat_policies(id,administration_id,basis,effective_from,confirmed_by) VALUES (:id,:admin,'factuurstelsel','2026-01-01',:user)"
                    ),
                    {"id": uuid4(), "admin": admin, "user": user},
                )
                for basis in ["kasstelsel", "invalid"]:
                    with pytest.raises(sa.exc.IntegrityError):
                        async with connection.begin_nested():
                            rejected_admin = admin
                            if basis == "invalid":
                                rejected_admin = uuid4()
                                await connection.execute(
                                    sa.text("INSERT INTO administrations VALUES (:id)"),
                                    {"id": rejected_admin},
                                )
                            await connection.execute(
                                sa.text(
                                    "INSERT INTO zzp_vat_policies(id,administration_id,basis,effective_from,confirmed_by) VALUES (:id,:admin,:basis,'2026-01-01',:user)"
                                ),
                                {
                                    "id": uuid4(),
                                    "admin": rejected_admin,
                                    "user": user,
                                    "basis": basis,
                                },
                            )
                assert (
                    await connection.scalar(
                        sa.text("SELECT COUNT(*) FROM administrations")
                    )
                    == 1
                )
                assert (
                    await connection.scalar(
                        sa.text("SELECT COUNT(*) FROM zzp_vat_policies")
                    )
                    == 1
                )
                await connection.run_sync(
                    lambda conn: migrate(conn, migration.downgrade)
                )
                assert (
                    await connection.scalar(
                        sa.text("SELECT COUNT(*) FROM administrations")
                    )
                    == 1
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
@pytest.mark.skipif(not DB, reason="Requires disposable PostgreSQL service")
async def test_competing_confirmations_choose_exactly_one_basis():
    import asyncio
    from datetime import date
    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.core.database import Base
    from app.models.user import User
    from app.models.administration import (
        Administration,
        AdministrationMember,
        MemberRole,
    )
    from app.models.zzp_vat_policy import ZZPVatPolicy
    from app.api.v1.zzp_btw import confirm_vat_policy, VatPolicyConfirmation

    schema = "vat_policy_race_" + uuid4().hex
    engine = create_async_engine(
        DB, connect_args={"server_settings": {"search_path": schema}}
    )
    try:
        async with engine.begin() as connection:
            await connection.execute(sa.text(f"CREATE SCHEMA {schema}"))
            await connection.run_sync(Base.metadata.create_all)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with sessions() as session:
            user = User(
                email="policy-race@example.com",
                hashed_password="test-only",
                full_name="Owner",
                role="zzp",
                is_active=True,
            )
            administration = Administration(name="Policy race", is_active=True)
            session.add_all([user, administration])
            await session.flush()
            session.add(
                AdministrationMember(
                    user_id=user.id,
                    administration_id=administration.id,
                    role=MemberRole.OWNER,
                )
            )
            await session.commit()
            user_id, admin_id = user.id, administration.id

        async def choose(basis):
            async with sessions() as session:
                owner = await session.get(User, user_id)
                try:
                    await confirm_vat_policy(
                        VatPolicyConfirmation(
                            basis=basis,
                            effective_from=date(2026, 1, 1),
                            acknowledge=True,
                        ),
                        owner,
                        session,
                    )
                    return 200
                except HTTPException as error:
                    await session.rollback()
                    return error.status_code

        statuses = await asyncio.wait_for(
            asyncio.gather(choose("factuurstelsel"), choose("kasstelsel")), timeout=30
        )
        assert sorted(statuses) == [200, 409]
        async with sessions() as session:
            assert (
                await session.scalar(
                    sa.select(sa.func.count(ZZPVatPolicy.id)).where(
                        ZZPVatPolicy.administration_id == admin_id
                    )
                )
                == 1
            )
    finally:
        async with engine.begin() as connection:
            await connection.execute(sa.text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
        await engine.dispose()
