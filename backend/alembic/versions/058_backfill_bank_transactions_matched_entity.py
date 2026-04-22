"""Ensure bank_transactions has all columns required by the current model.

Production databases that were created with an older version of the
``bank_transactions`` table never received the columns added in subsequent
revisions of the model.  ``014_bank_recon`` only creates the table when it
does not already exist, so the additive ``ALTER TABLE`` statements were
silently skipped on installations where the table predated those changes.

Two earlier corrective migrations addressed parts of the gap::

    054_backfill_bank_currency           -> bank_transactions.currency
    057_add_bank_transactions_import_hash -> bank_transactions.import_hash

The same root cause is now manifesting for the matching-related columns::

    sqlalchemy.exc.ProgrammingError: column bank_transactions.matched_entity_type
    does not exist

This migration is the production-safe corrective step that brings any older
``bank_transactions`` table fully in line with the current SQLAlchemy model
(see ``app/models/bank.py``).  It is fully idempotent and only touches
columns that are actually missing, so it is safe to run on databases that
are already up-to-date.

What it does, per column:

* ``matched_entity_type`` – nullable VARCHAR(30); added as nullable, no
  backfill required because the model permits NULL.
* ``matched_entity_id``   – nullable UUID; same treatment.
* ``status``              – NOT NULL enum (``banktransactionstatus``) with
  default ``'NEW'``.  Added as nullable, backfilled to ``'NEW'``, then set
  NOT NULL with a server default.  The enum type is already created by
  earlier migrations; we reference it without recreating it.
* ``counterparty_name`` / ``counterparty_iban`` / ``reference`` – nullable
  text columns; added as nullable when missing.
* ``currency`` / ``import_hash`` – defensively re-checked using the same
  approach as 054/057 so that environments which somehow skipped those
  migrations are still healed.

Revision ID: 058_backfill_bank_transactions_matched_entity
Revises: 057_add_bank_transactions_import_hash
Create Date: 2026-04-22 23:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "058_backfill_bank_transactions_matched_entity"
down_revision: Union[str, None] = "057_add_bank_transactions_import_hash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "bank_transactions"


def _existing_columns(inspector: sa.engine.reflection.Inspector) -> set[str]:
    return {c["name"] for c in inspector.get_columns(TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Nothing to repair if the table itself does not exist – 014_bank_recon
    # will have created it with the full, current schema.
    if not inspector.has_table(TABLE):
        return

    columns = _existing_columns(inspector)

    # ---- matched_entity_type / matched_entity_id (the reported failure) ----
    # Both are nullable in the model, so simple ADD COLUMN is sufficient and
    # safe on a live table.
    if "matched_entity_type" not in columns:
        op.add_column(
            TABLE,
            sa.Column("matched_entity_type", sa.String(30), nullable=True),
        )

    if "matched_entity_id" not in columns:
        op.add_column(
            TABLE,
            sa.Column(
                "matched_entity_id",
                postgresql.UUID(as_uuid=True),
                nullable=True,
            ),
        )

    # ---- Other nullable text columns from the model ----
    for col_name, col_type in (
        ("counterparty_name", sa.String(200)),
        ("counterparty_iban", sa.String(34)),
        ("reference", sa.String(120)),
    ):
        if col_name not in columns:
            op.add_column(TABLE, sa.Column(col_name, col_type, nullable=True))

    # ---- status (NOT NULL enum with default 'NEW') ----
    # The enum type ``banktransactionstatus`` is created by earlier
    # migrations.  We reference it with ``create_type=False`` so we do not
    # try to (re)create it here.
    if "status" not in columns:
        status_enum = postgresql.ENUM(
            "NEW",
            "MATCHED",
            "IGNORED",
            "NEEDS_REVIEW",
            name="banktransactionstatus",
            create_type=False,
        )

        # Step 1 – add as nullable so the backfill UPDATE can run without
        # rewriting the table under an exclusive lock.
        op.add_column(
            TABLE,
            sa.Column("status", status_enum, nullable=True),
        )

        # Step 2 – backfill any existing rows to 'NEW'.  Previously matched
        # rows cannot be reliably reconstructed here, so 'NEW' is the safe
        # default that keeps them visible in the reconciliation queue.
        op.execute(
            sa.text(
                "UPDATE bank_transactions "
                "SET status = 'NEW'::banktransactionstatus "
                "WHERE status IS NULL"
            )
        )

        # Step 3 – enforce NOT NULL and the server default that the model
        # expects.
        op.alter_column(
            TABLE,
            "status",
            existing_type=status_enum,
            nullable=False,
            server_default="NEW",
        )

    # ---- Defensive re-check of currency (covered by 054) ----
    if "currency" not in columns:
        op.add_column(TABLE, sa.Column("currency", sa.String(3), nullable=True))
        op.execute(
            sa.text(
                "UPDATE bank_transactions SET currency = 'EUR' "
                "WHERE currency IS NULL"
            )
        )
        op.alter_column(
            TABLE,
            "currency",
            existing_type=sa.String(3),
            nullable=False,
            server_default="EUR",
        )

    # ---- Defensive re-check of import_hash (covered by 057) ----
    if "import_hash" not in columns:
        op.add_column(
            TABLE,
            sa.Column("import_hash", sa.CHAR(64), nullable=True),
        )
        # Deterministic 64-char hex backfill (two md5 calls = 64 hex chars),
        # unique per row so the unique constraint can hold.
        op.execute(
            sa.text(
                "UPDATE bank_transactions "
                "SET import_hash = md5(id::text) || md5(id::text || '|backfill') "
                "WHERE import_hash IS NULL"
            )
        )
        op.alter_column(
            TABLE,
            "import_hash",
            existing_type=sa.CHAR(64),
            nullable=False,
        )

    # Re-check the unique constraint independently of whether we just added
    # ``import_hash``: a previously-interrupted run of 057 could have left the
    # column in place without the constraint.  Re-inspect after any column
    # changes above so the check sees the current state.
    inspector = sa.inspect(bind)
    if "import_hash" in {c["name"] for c in inspector.get_columns(TABLE)}:
        existing_constraints = {
            uc["name"]
            for uc in inspector.get_unique_constraints(TABLE)
        }
        if "uq_bank_transactions_admin_hash" not in existing_constraints:
            op.create_unique_constraint(
                "uq_bank_transactions_admin_hash",
                TABLE,
                ["administration_id", "import_hash"],
            )


def downgrade() -> None:
    # Intentional no-op: dropping these columns on a live database would be
    # destructive (matched_entity_* and status carry real reconciliation
    # state once the application starts writing to them).  If a rollback is
    # truly required, drop the columns manually after verifying it is safe.
    pass
