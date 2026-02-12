"""Add invoice_id and is_invoiced to zzp_time_entries

Revision ID: 027_add_time_entry_invoice_link
Revises: 026_add_payment_system
Create Date: 2026-02-12

This migration adds fields to link time entries to invoices:
- invoice_id: Foreign key to zzp_invoices (nullable)
- is_invoiced: Boolean flag indicating if entry is invoiced (default false)
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
    # Add invoice_id foreign key column
    op.add_column(
        'zzp_time_entries',
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_zzp_time_entries_invoice_id',
        'zzp_time_entries',
        'zzp_invoices',
        ['invoice_id'],
        ['id'],
        ondelete='SET NULL'
    )
    
    # Add is_invoiced boolean column
    op.add_column(
        'zzp_time_entries',
        sa.Column('is_invoiced', sa.Boolean(), nullable=False, server_default='false')
    )
    
    # Add index for invoice_id for better query performance
    op.create_index('ix_zzp_time_entries_invoice_id', 'zzp_time_entries', ['invoice_id'])
    
    # Add index for is_invoiced for filtering
    op.create_index('ix_zzp_time_entries_is_invoiced', 'zzp_time_entries', ['is_invoiced'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_zzp_time_entries_is_invoiced', 'zzp_time_entries')
    op.drop_index('ix_zzp_time_entries_invoice_id', 'zzp_time_entries')
    
    # Drop columns
    op.drop_column('zzp_time_entries', 'is_invoiced')
    
    # Drop foreign key constraint before dropping column
    op.drop_constraint('fk_zzp_time_entries_invoice_id', 'zzp_time_entries', type_='foreignkey')
    op.drop_column('zzp_time_entries', 'invoice_id')
