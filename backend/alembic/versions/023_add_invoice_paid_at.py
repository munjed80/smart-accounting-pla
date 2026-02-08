"""Add paid_at timestamp to invoices

Revision ID: 023_add_invoice_paid_at
Revises: 022_zzp_quotes
Create Date: 2026-02-08

This migration adds a paid_at timestamp column to zzp_invoices to track
when an invoice was marked as paid. This is set automatically when the
status changes to 'paid' and cleared when the status changes away from 'paid'.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '023_add_invoice_paid_at'
down_revision: Union[str, None] = '022_zzp_quotes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add paid_at timestamp column to zzp_invoices table
    op.add_column(
        'zzp_invoices',
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    # Remove paid_at column
    op.drop_column('zzp_invoices', 'paid_at')
