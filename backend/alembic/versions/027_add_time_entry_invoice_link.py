"""Add invoice_id and is_invoiced to time entries

Revision ID: 027_add_time_entry_invoice_link
Revises: 026_add_payment_system
Create Date: 2026-02-12

This migration adds invoice tracking to time entries:
- invoice_id: Links time entry to an invoice
- is_invoiced: Boolean flag for quick filtering
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '027_add_time_entry_invoice_link'
down_revision: Union[str, None] = '026_add_payment_system'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add invoice_id column (nullable foreign key to zzp_invoices)
    op.add_column(
        'zzp_time_entries',
        sa.Column(
            'invoice_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('zzp_invoices.id', ondelete='SET NULL'),
            nullable=True
        )
    )
    
    # Add is_invoiced column (boolean default false)
    op.add_column(
        'zzp_time_entries',
        sa.Column('is_invoiced', sa.Boolean(), nullable=False, server_default='false')
    )
    
    # Add indexes for filtering
    op.create_index('ix_zzp_time_entries_invoice_id', 'zzp_time_entries', ['invoice_id'])
    op.create_index('ix_zzp_time_entries_is_invoiced', 'zzp_time_entries', ['is_invoiced'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_zzp_time_entries_is_invoiced', table_name='zzp_time_entries')
    op.drop_index('ix_zzp_time_entries_invoice_id', table_name='zzp_time_entries')
    
    # Drop columns
    op.drop_column('zzp_time_entries', 'is_invoiced')
    op.drop_column('zzp_time_entries', 'invoice_id')
