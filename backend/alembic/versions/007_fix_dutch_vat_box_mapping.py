"""Fix Dutch VAT Box Mapping for Compliance

Revision ID: 007_fix_dutch_vat_box_mapping
Revises: 006_dutch_vat_btw_engine
Create Date: 2024-01-26 18:00:00.000000

This migration corrects the VAT box mappings to align with Dutch Belastingdienst rules:

CORRECTIONS MADE:
- INTRA_EU_GOODS: Changed from 2a to 4b (EU acquisitions of goods/services)
- RC_EU_SERVICES: Renamed to RC_NON_EU_SERVICES (non-EU services where VAT is shifted)
- RC_IMPORT: Changed from 4b to 4a (import-related VAT cases)
- Added EU_ACQUISITION_SERVICES: New code for EU service acquisitions -> 4b
- RC_NL: Changed from 2a to appropriate handling

Box Semantics (Belastingdienst compliant):
- 1a/1b: NL domestic supplies at 21%/9%
- 3b: ICP (Intra-Community supplies to other EU countries)
- 4a: Services from non-EU where VAT is shifted to NL buyer, import VAT
- 4b: Intra-EU acquisitions (goods/services purchased from other EU countries)
- 5b: Input VAT (voorbelasting) - deductible VAT

NOTE: 2a is for "Verwerving uit landen binnen de EU" which is the older interpretation.
The Belastingdienst now uses 4b for intra-EU acquisitions where buyer self-assesses VAT.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '007_fix_dutch_vat_box_mapping'
down_revision: Union[str, None] = '006_dutch_vat_btw_engine'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update INTRA_EU_GOODS: Should map to 4b (EU acquisitions), not 2a
    op.execute("""
        UPDATE vat_codes 
        SET box_mapping = '{"turnover_box": "4b", "vat_box": "4b", "deductible_box": "5b"}'::jsonb,
            description = 'ICV - Intracommunautaire verwerving van goederen uit EU-landen (rubriek 4b)'
        WHERE code = 'INTRA_EU_GOODS'
    """)
    
    # Rename RC_EU_SERVICES to RC_NON_EU_SERVICES and update mapping to 4a
    # This is for services from NON-EU countries where VAT is shifted to NL buyer
    op.execute("""
        UPDATE vat_codes 
        SET code = 'RC_NON_EU_SERVICES',
            name = 'Verlegging BTW diensten buiten EU',
            description = 'Diensten van buiten de EU waar BTW naar NL koper verlegde (rubriek 4a)',
            box_mapping = '{"turnover_box": "4a", "vat_box": "4a", "deductible_box": "5b"}'::jsonb,
            eu_only = false
        WHERE code = 'RC_EU_SERVICES'
    """)
    
    # Update RC_IMPORT: Should map to 4a (import VAT), not 4b
    op.execute("""
        UPDATE vat_codes 
        SET box_mapping = '{"turnover_box": "4a", "vat_box": "4a", "deductible_box": "5b"}'::jsonb,
            description = 'Invoer met verlegging naar binnenland (rubriek 4a)'
        WHERE code = 'RC_IMPORT'
    """)
    
    # Update RC_NL: Domestic reverse charge - maps to 2a per Belastingdienst rules
    # (This is for certain specific domestic transactions like construction services)
    op.execute("""
        UPDATE vat_codes 
        SET description = 'Binnenlandse verlegging (art. 24ba) - bepaalde bouwdiensten (rubriek 2a)'
        WHERE code = 'RC_NL'
    """)
    
    # Add new code: EU_ACQUISITION_SERVICES for services acquired from EU -> 4b
    # Note: gen_random_uuid() is PostgreSQL specific (requires pgcrypto extension)
    op.execute("""
        INSERT INTO vat_codes (id, code, name, description, rate, category, box_mapping, eu_only, requires_vat_number, is_reverse_charge, is_icp, is_active)
        VALUES (
            gen_random_uuid(), 
            'EU_ACQUISITION_SERVICES', 
            'ICV diensten EU', 
            'Verwerving van diensten uit EU-landen (rubriek 4b)',
            21.00, 
            'INTRA_EU',
            '{"turnover_box": "4b", "vat_box": "4b", "deductible_box": "5b"}', 
            true, 
            true, 
            false, 
            false, 
            true
        )
        ON CONFLICT (code) DO UPDATE SET
            box_mapping = '{"turnover_box": "4b", "vat_box": "4b", "deductible_box": "5b"}'::jsonb,
            description = 'Verwerving van diensten uit EU-landen (rubriek 4b)'
    """)


def downgrade() -> None:
    # Revert INTRA_EU_GOODS to original mapping
    op.execute("""
        UPDATE vat_codes 
        SET box_mapping = '{"turnover_box": "2a", "vat_box": "2a", "deductible_box": "5b"}'::jsonb,
            description = 'Goederen uit EU-landen'
        WHERE code = 'INTRA_EU_GOODS'
    """)
    
    # Revert RC_NON_EU_SERVICES back to RC_EU_SERVICES
    op.execute("""
        UPDATE vat_codes 
        SET code = 'RC_EU_SERVICES',
            name = 'Verlegging BTW diensten EU',
            description = 'Diensten uit EU-landen (art. 12)',
            box_mapping = '{"turnover_box": "4a", "vat_box": "4a", "deductible_box": "5b"}'::jsonb,
            eu_only = true
        WHERE code = 'RC_NON_EU_SERVICES'
    """)
    
    # Revert RC_IMPORT to original mapping
    op.execute("""
        UPDATE vat_codes 
        SET box_mapping = '{"turnover_box": "4b", "vat_box": "4b", "deductible_box": "5b"}'::jsonb,
            description = 'Invoer met verlegging'
        WHERE code = 'RC_IMPORT'
    """)
    
    # Revert RC_NL description
    op.execute("""
        UPDATE vat_codes 
        SET description = 'Binnenlandse verlegging (art. 24ba)'
        WHERE code = 'RC_NL'
    """)
    
    # Remove EU_ACQUISITION_SERVICES code
    op.execute("""
        DELETE FROM vat_codes WHERE code = 'EU_ACQUISITION_SERVICES'
    """)
