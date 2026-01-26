"""Dutch VAT/BTW Filing Engine

Revision ID: 006_dutch_vat_btw_engine
Revises: 005_period_control_finalization
Create Date: 2024-01-26 14:00:00.000000

This migration adds:
- Enhanced vat_codes table with Dutch BTW scheme fields
- VAT fields on journal_lines for compliance
- Support for reverse charge and ICP reporting
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '006_dutch_vat_btw_engine'
down_revision: Union[str, None] = '005_period_control_finalization'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create VAT category enum
    op.execute("""
        CREATE TYPE vatcategory AS ENUM (
            'SALES', 'PURCHASES', 'REVERSE_CHARGE', 'INTRA_EU', 'EXEMPT', 'ZERO_RATE'
        )
    """)
    
    # Add new columns to vat_codes table
    op.add_column('vat_codes',
        sa.Column('description', sa.Text(), nullable=True)
    )
    op.add_column('vat_codes',
        sa.Column('category', postgresql.ENUM('SALES', 'PURCHASES', 'REVERSE_CHARGE', 
                  'INTRA_EU', 'EXEMPT', 'ZERO_RATE', name='vatcategory', create_type=False),
                  nullable=False, server_default='SALES')
    )
    op.add_column('vat_codes',
        sa.Column('box_mapping', postgresql.JSONB, nullable=True)
    )
    op.add_column('vat_codes',
        sa.Column('eu_only', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column('vat_codes',
        sa.Column('requires_vat_number', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column('vat_codes',
        sa.Column('is_reverse_charge', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column('vat_codes',
        sa.Column('is_icp', sa.Boolean(), nullable=False, server_default='false')
    )
    
    # Modify vat_codes.code column to allow longer codes
    op.alter_column('vat_codes', 'code',
        existing_type=sa.String(20),
        type_=sa.String(30),
        nullable=False
    )
    
    # Add new columns to journal_lines table
    op.add_column('journal_lines',
        sa.Column('vat_base_amount', sa.Numeric(15, 2), nullable=True)
    )
    op.add_column('journal_lines',
        sa.Column('vat_country', sa.String(2), nullable=True)
    )
    op.add_column('journal_lines',
        sa.Column('vat_is_reverse_charge', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column('journal_lines',
        sa.Column('party_vat_number', sa.String(30), nullable=True)
    )
    
    # Create indexes for VAT reporting queries
    op.create_index('ix_journal_lines_vat_code', 'journal_lines', ['vat_code_id'])
    op.create_index('ix_journal_lines_vat_country', 'journal_lines', ['vat_country'])
    op.create_index('ix_journal_lines_vat_reverse_charge', 'journal_lines', ['vat_is_reverse_charge'])
    op.create_index('ix_vat_codes_category', 'vat_codes', ['category'])
    op.create_index('ix_vat_codes_is_icp', 'vat_codes', ['is_icp'])
    
    # Insert default Dutch VAT codes
    op.execute("""
        INSERT INTO vat_codes (id, code, name, description, rate, category, box_mapping, eu_only, requires_vat_number, is_reverse_charge, is_icp, is_active)
        VALUES
        -- Standard Dutch VAT rates
        (gen_random_uuid(), 'NL_21', 'BTW 21%', 'Standaard BTW tarief 21%', 21.00, 'SALES', 
         '{"turnover_box": "1a", "vat_box": "1a"}', false, false, false, false, true),
        (gen_random_uuid(), 'NL_9', 'BTW 9%', 'Verlaagd BTW tarief 9%', 9.00, 'SALES', 
         '{"turnover_box": "1b", "vat_box": "1b"}', false, false, false, false, true),
        (gen_random_uuid(), 'NL_0', 'BTW 0%', 'Nultarief', 0.00, 'ZERO_RATE', 
         '{"turnover_box": "1e"}', false, false, false, false, true),
        
        -- Purchase VAT (input tax)
        (gen_random_uuid(), 'NL_21_INPUT', 'Voorbelasting 21%', 'Aftrekbare BTW 21%', 21.00, 'PURCHASES', 
         '{"vat_box": "5b"}', false, false, false, false, true),
        (gen_random_uuid(), 'NL_9_INPUT', 'Voorbelasting 9%', 'Aftrekbare BTW 9%', 9.00, 'PURCHASES', 
         '{"vat_box": "5b"}', false, false, false, false, true),
        
        -- Intra-EU transactions
        (gen_random_uuid(), 'INTRA_EU_GOODS', 'ICV - Intracommunautaire verwerving', 'Goederen uit EU-landen', 21.00, 'INTRA_EU', 
         '{"turnover_box": "2a", "vat_box": "2a", "deductible_box": "5b"}', true, true, false, false, true),
        (gen_random_uuid(), 'ICP_SUPPLIES', 'ICL - Intracommunautaire levering', 'Leveringen aan EU-landen', 0.00, 'INTRA_EU', 
         '{"turnover_box": "3b"}', true, true, false, true, true),
        
        -- Reverse charge
        (gen_random_uuid(), 'RC_EU_SERVICES', 'Verlegging BTW diensten EU', 'Diensten uit EU-landen (art. 12)', 21.00, 'REVERSE_CHARGE', 
         '{"turnover_box": "4a", "vat_box": "4a", "deductible_box": "5b"}', true, true, true, false, true),
        (gen_random_uuid(), 'RC_IMPORT', 'Verlegging invoer', 'Invoer met verlegging', 21.00, 'REVERSE_CHARGE', 
         '{"turnover_box": "4b", "vat_box": "4b", "deductible_box": "5b"}', false, false, true, false, true),
        (gen_random_uuid(), 'RC_NL', 'Verlegging BTW NL', 'Binnenlandse verlegging (art. 24ba)', 21.00, 'REVERSE_CHARGE', 
         '{"turnover_box": "2a", "vat_box": "2a", "deductible_box": "5b"}', false, false, true, false, true),
        
        -- Exempt
        (gen_random_uuid(), 'KOR_EXEMPT', 'KOR Vrijstelling', 'Kleineondernemersregeling vrijstelling', 0.00, 'EXEMPT', 
         '{}', false, false, false, false, true),
        (gen_random_uuid(), 'EXEMPT', 'BTW Vrijgesteld', 'Vrijgestelde prestaties (art. 11)', 0.00, 'EXEMPT', 
         '{"turnover_box": "1e"}', false, false, false, false, true)
        ON CONFLICT (code) DO NOTHING
    """)


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_vat_codes_is_icp', table_name='vat_codes')
    op.drop_index('ix_vat_codes_category', table_name='vat_codes')
    op.drop_index('ix_journal_lines_vat_reverse_charge', table_name='journal_lines')
    op.drop_index('ix_journal_lines_vat_country', table_name='journal_lines')
    op.drop_index('ix_journal_lines_vat_code', table_name='journal_lines')
    
    # Remove columns from journal_lines
    op.drop_column('journal_lines', 'party_vat_number')
    op.drop_column('journal_lines', 'vat_is_reverse_charge')
    op.drop_column('journal_lines', 'vat_country')
    op.drop_column('journal_lines', 'vat_base_amount')
    
    # Remove columns from vat_codes
    op.drop_column('vat_codes', 'is_icp')
    op.drop_column('vat_codes', 'is_reverse_charge')
    op.drop_column('vat_codes', 'requires_vat_number')
    op.drop_column('vat_codes', 'eu_only')
    op.drop_column('vat_codes', 'box_mapping')
    op.drop_column('vat_codes', 'category')
    op.drop_column('vat_codes', 'description')
    
    # Revert vat_codes.code column length
    op.alter_column('vat_codes', 'code',
        existing_type=sa.String(30),
        type_=sa.String(20),
        nullable=False
    )
    
    # Drop enum
    op.execute("DROP TYPE vatcategory")
