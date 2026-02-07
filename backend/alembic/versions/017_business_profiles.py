"""Add business profiles table for ZZP users

Revision ID: 017_business_profiles
Revises: 016_zzp_customers
Create Date: 2026-02-07

This migration creates the business_profiles table to store company profile
information for ZZP users. This data is used on invoices as seller details.

Design decision: Separate table (1:1 with administration) rather than adding
columns to administrations table because:
1. Clear separation of concerns - profile data vs core administration data
2. Allows for profile versioning/snapshots in the future
3. Easier to add logo storage and additional fields later
4. More consistent with invoice snapshot requirements

Fields:
- company_name (required): Official company name
- trading_name (optional): "Handelsnaam" if different from company name
- Address fields (optional): For invoice display
- kvk_number, btw_number (optional): Dutch business identifiers
- iban (optional): Bank account for payment instructions
- email, phone, website (optional): Contact details
- logo_url (optional): URL to company logo (future use)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '017_business_profiles'
down_revision: Union[str, None] = '016_zzp_customers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create business_profiles table
    op.create_table(
        'business_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False, unique=True),
        
        # Company identity
        sa.Column('company_name', sa.String(255), nullable=False),
        sa.Column('trading_name', sa.String(255), nullable=True),  # "Handelsnaam"
        
        # Address fields
        sa.Column('address_street', sa.String(500), nullable=True),
        sa.Column('address_postal_code', sa.String(20), nullable=True),
        sa.Column('address_city', sa.String(100), nullable=True),
        sa.Column('address_country', sa.String(100), nullable=True, server_default='Nederland'),
        
        # Business identifiers
        sa.Column('kvk_number', sa.String(20), nullable=True),
        sa.Column('btw_number', sa.String(30), nullable=True),
        
        # Bank details
        sa.Column('iban', sa.String(34), nullable=True),
        
        # Contact details
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('website', sa.String(255), nullable=True),
        
        # Logo (URL only for now)
        sa.Column('logo_url', sa.String(500), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    
    # Create unique index on administration_id (enforces 1:1 relationship)
    op.create_index('ix_business_profiles_administration_id', 'business_profiles', ['administration_id'], unique=True)


def downgrade() -> None:
    # Drop index first
    op.drop_index('ix_business_profiles_administration_id', table_name='business_profiles')
    
    # Drop the table
    op.drop_table('business_profiles')
