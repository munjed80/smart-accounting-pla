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
every existing row with 'EUR' via UPDATE, and then sets NOT NULL once all rows
have a value.

Downgrade is intentionally a no-op.  Removing the currency column would be
destructive on a live database and there is no safe way to distinguish, in a
separate downgrade process, whether this migration or 014_bank_recon originally
created it.  If a full rollback is required, drop the column manually after
verifying it is safe to do so.

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

# Tables that should have a currency column per the SQLAlchemy models.
_TABLES = ("bank_accounts", "bank_transactions")


def _ensure_currency(inspector: sa.engine.reflection.Inspector, table: str) -> None:
    """Add currency column to *table* if absent."""
    if not inspector.has_table(table):
        return
    existing_cols = {c["name"] for c in inspector.get_columns(table)}
    if "currency" in existing_cols:
        return

    # Step 1 – add as nullable so the backfill UPDATE can run without locking
    # the whole table for the duration of the write.
    op.add_column(table, sa.Column("currency", sa.String(3), nullable=True))

    # Step 2 – backfill all existing rows to 'EUR' using SQLAlchemy core to
    # avoid raw SQL injection risks from the table name.
    tbl = sa.table(table, sa.column("currency", sa.String(3)))
    op.execute(tbl.update().values(currency="EUR").where(tbl.c.currency.is_(None)))

    # Step 3 – set the column default and NOT NULL constraint now that every
    # row has a value.
    op.alter_column(table, "currency", nullable=False, server_default="EUR")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table in _TABLES:
        _ensure_currency(inspector, table)


def downgrade() -> None:
    # Intentional no-op – see module docstring for rationale.
    pass
