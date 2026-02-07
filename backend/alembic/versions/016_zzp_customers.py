"""Add ZZP customers table with business/address/bank fields

Revision ID: 016_zzp_customers
Revises: 015_add_document_status_enum_values
Create Date: 2026-02-07

This migration creates the zzp_customers table for ZZP users to manage their
customer/client data with full business details.

Fields:
- name (required): Customer/company name
- email, phone (optional): Contact details
- address fields (optional): street, postal_code, city, country
- kvk_number, btw_number (optional): Dutch business identifiers
- iban (optional): Bank account for payments

All new columns are nullable to ensure backward compatibility and idempotent
execution (safe to re-run).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '016_zzp_customers'
down_revision: Union[str, None] = '015_add_document_status_enum_values'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create zzp_customers table
    op.create_table(
        'zzp_customers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        
        # Basic info (name required, others optional)
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        
        # Address fields (all optional)
        sa.Column('address_street', sa.String(500), nullable=True),
        sa.Column('address_postal_code', sa.String(20), nullable=True),
        sa.Column('address_city', sa.String(100), nullable=True),
        sa.Column('address_country', sa.String(100), nullable=True, server_default='Nederland'),
        
        # Business identifiers (all optional)
        sa.Column('kvk_number', sa.String(20), nullable=True),
        sa.Column('btw_number', sa.String(30), nullable=True),
        
        # Bank details (optional)
        sa.Column('iban', sa.String(34), nullable=True),
        
        # Status (active/inactive)
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    
    # Create indexes for common queries
    op.create_index('ix_zzp_customers_administration_id', 'zzp_customers', ['administration_id'])
    op.create_index('ix_zzp_customers_name', 'zzp_customers', ['name'])
    op.create_index('ix_zzp_customers_status', 'zzp_customers', ['status'])


def downgrade() -> None:
    # Drop indexes first
    op.drop_index('ix_zzp_customers_status', table_name='zzp_customers')
    op.drop_index('ix_zzp_customers_name', table_name='zzp_customers')
    op.drop_index('ix_zzp_customers_administration_id', table_name='zzp_customers')
    
    # Drop the table
    op.drop_table('zzp_customers')
