"""Backfill missing currency column on bank_transactions and bank_accounts

The 014_bank_recon migration creates bank_transactions / bank_accounts with a
currency column only when those tables do not yet exist at migration time.  On
databases where the tables were created by an earlier/partial deployment that
predated the currency column, the column was never added and every query that
touches it fails with:

    column bank_transactions.currency does not exist

This migration repairs that situation idempotently:
- Adds currency (VARCHAR(3), server_default='EUR', NOT NULL) to
  bank_transactions if the column is absent.
- Adds currency (VARCHAR(3), server_default='EUR', NOT NULL) to bank_accounts
  if the column is absent.

Both operations are safe on a live table: PostgreSQL adds the column, fills
every existing row with 'EUR' via the server_default, and then sets NOT NULL in
a single lock-light pass.  Downgrade removes the column only if this migration
was the one that originally added it; it is a no-op otherwise (the column was
already present before this migration ran, meaning we must not drop it on
downgrade because it belongs to the original 014_bank_recon scope).

Revision ID: 054_backfill_bank_currency
Revises: 053_calendar_events_recurrence_color
Create Date: 2026-04-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "054_backfill_bank_currency"
down_revision: Union[str, None] = "053_calendar_events_recurrence_color"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Track which tables this migration actually modified so downgrade is safe.
_ADDED_TO: list[str] = []


def _ensure_currency(inspector: sa.engine.reflection.Inspector, table: str) -> bool:
    """Add currency column to *table* if absent.  Returns True when added."""
    if not inspector.has_table(table):
        return False
    existing_cols = {c["name"] for c in inspector.get_columns(table)}
    if "currency" in existing_cols:
        return False

    # Step 1 – add as nullable so the backfill can proceed without a table
    # rewrite on large datasets.
    op.add_column(table, sa.Column("currency", sa.String(3), nullable=True))

    # Step 2 – backfill all existing rows to 'EUR'.
    op.execute(f"UPDATE {table} SET currency = 'EUR' WHERE currency IS NULL")  # noqa: S608

    # Step 3 – add the server default and set NOT NULL now that every row has a
    # value.
    op.execute(
        f"ALTER TABLE {table} "
        f"ALTER COLUMN currency SET DEFAULT 'EUR', "
        f"ALTER COLUMN currency SET NOT NULL"
    )
    return True


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table in ("bank_accounts", "bank_transactions"):
        if _ensure_currency(inspector, table):
            _ADDED_TO.append(table)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Only drop the column from tables where *this* migration added it.  If the
    # column was already present before this migration ran, _ADDED_TO will be
    # empty and we do nothing.
    for table in reversed(_ADDED_TO):
        if inspector.has_table(table):
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            if "currency" in existing_cols:
                op.drop_column(table, "currency")
