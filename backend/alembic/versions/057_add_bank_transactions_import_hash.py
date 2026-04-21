"""Ensure bank_transactions.import_hash column exists.

Some databases were created with an older version of the
``bank_transactions`` table that pre-dates the ``import_hash`` column.
Migration ``014_bank_recon`` only creates the table when it does not
already exist, so the column was never added to those installations,
which causes::

    sqlalchemy.exc.ProgrammingError: column bank_transactions.import_hash
    does not exist

when querying the table through the ORM.

This migration idempotently adds the column, backfills existing rows
with a deterministic per-row hash so the ``NOT NULL`` and unique
constraints can be applied, and (re)creates the supporting unique
constraint and index that the rest of the schema expects.

Revision ID: 057_add_bank_transactions_import_hash
Revises: 056_ecommerce_mappings
Create Date: 2026-04-21 23:20:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "057_add_bank_transactions_import_hash"
down_revision: Union[str, None] = "056_ecommerce_mappings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Nothing to do if the table itself does not exist (would be created
    # with import_hash by 014_bank_recon).
    if not inspector.has_table("bank_transactions"):
        return

    columns = {c["name"] for c in inspector.get_columns("bank_transactions")}

    # 1. Add the column as nullable so existing rows keep working.
    if "import_hash" not in columns:
        op.add_column(
            "bank_transactions",
            sa.Column("import_hash", sa.CHAR(64), nullable=True),
        )

        # 2. Backfill existing rows with a deterministic 64-char hex value
        #    derived from the row id. Using two md5() calls (each producing
        #    32 hex characters) yields a 64-char string that matches the
        #    column width and is unique per row, satisfying both NOT NULL
        #    and the unique constraint without requiring pgcrypto.
        op.execute(
            """
            UPDATE bank_transactions
            SET import_hash = md5(id::text) || md5(id::text || '|backfill')
            WHERE import_hash IS NULL
            """
        )

        # 3. Enforce NOT NULL now that all rows have a value.
        op.alter_column(
            "bank_transactions",
            "import_hash",
            existing_type=sa.CHAR(64),
            nullable=False,
        )

    # 4. Ensure the unique constraint exists.
    existing_constraints = {
        uc["name"] for uc in inspector.get_unique_constraints("bank_transactions")
    }
    if "uq_bank_transactions_admin_hash" not in existing_constraints:
        op.create_unique_constraint(
            "uq_bank_transactions_admin_hash",
            "bank_transactions",
            ["administration_id", "import_hash"],
        )

    # 5. Ensure the administration_id index exists (mirrors 014_bank_recon).
    if "administration_id" in columns:
        existing_indexes = {ix["name"] for ix in inspector.get_indexes("bank_transactions")}
        if "ix_bank_transactions_administration_id" not in existing_indexes:
            op.create_index(
                "ix_bank_transactions_administration_id",
                "bank_transactions",
                ["administration_id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("bank_transactions"):
        return

    existing_constraints = {
        uc["name"] for uc in inspector.get_unique_constraints("bank_transactions")
    }
    if "uq_bank_transactions_admin_hash" in existing_constraints:
        op.drop_constraint(
            "uq_bank_transactions_admin_hash",
            "bank_transactions",
            type_="unique",
        )

    columns = {c["name"] for c in inspector.get_columns("bank_transactions")}
    if "import_hash" in columns:
        op.drop_column("bank_transactions", "import_hash")
