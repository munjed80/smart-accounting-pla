"""Extend ZZP customers with additional optional fields

Revision ID: 019_extend_zzp_customers
Revises: 018_zzp_invoices_expenses_time_calendar
Create Date: 2026-02-07

This migration adds additional optional fields to zzp_customers:
- bank_bic: BIC/SWIFT code for bank
- address_line2: Secondary address line
- contact_person: Name of contact person
- notes: General notes about the customer

All columns are nullable to ensure backward compatibility.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '019_extend_zzp_customers'
down_revision: Union[str, None] = '018_zzp_invoices_expenses_time_calendar'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new optional columns to zzp_customers table
    
    # Bank BIC/SWIFT code
    op.add_column('zzp_customers', sa.Column('bank_bic', sa.String(11), nullable=True))
    
    # Secondary address line (e.g., apartment, suite, building)
    op.add_column('zzp_customers', sa.Column('address_line2', sa.String(500), nullable=True))
    
    # Contact person name
    op.add_column('zzp_customers', sa.Column('contact_person', sa.String(255), nullable=True))
    
    # General notes
    op.add_column('zzp_customers', sa.Column('notes', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove added columns
    op.drop_column('zzp_customers', 'notes')
    op.drop_column('zzp_customers', 'contact_person')
    op.drop_column('zzp_customers', 'address_line2')
    op.drop_column('zzp_customers', 'bank_bic')
