"""add digipoort fields to vat_submissions

Revision ID: 042_add_digipoort_fields
Revises: 041_add_connector_response
Create Date: 2026-02-17 19:13:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '042_add_digipoort_fields'
down_revision = '041_add_connector_response'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add Digipoort-specific fields to vat_submissions table
    op.add_column(
        'vat_submissions',
        sa.Column('payload_hash', sa.String(length=64), nullable=True)
    )
    op.add_column(
        'vat_submissions',
        sa.Column('payload_xml', sa.Text(), nullable=True)
    )
    op.add_column(
        'vat_submissions',
        sa.Column('signed_xml', sa.Text(), nullable=True)
    )
    op.add_column(
        'vat_submissions',
        sa.Column('digipoort_message_id', sa.String(length=255), nullable=True)
    )
    op.add_column(
        'vat_submissions',
        sa.Column('correlation_id', sa.String(length=255), nullable=True)
    )
    op.add_column(
        'vat_submissions',
        sa.Column('last_status_check_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        'vat_submissions',
        sa.Column('error_code', sa.String(length=50), nullable=True)
    )
    op.add_column(
        'vat_submissions',
        sa.Column('error_message', sa.Text(), nullable=True)
    )
    
    # Add index for digipoort_message_id for efficient lookups
    op.create_index(
        'ix_vat_submissions_digipoort_msg',
        'vat_submissions',
        ['digipoort_message_id']
    )


def downgrade() -> None:
    # Remove index
    op.drop_index('ix_vat_submissions_digipoort_msg', table_name='vat_submissions')
    
    # Remove columns
    op.drop_column('vat_submissions', 'error_message')
    op.drop_column('vat_submissions', 'error_code')
    op.drop_column('vat_submissions', 'last_status_check_at')
    op.drop_column('vat_submissions', 'correlation_id')
    op.drop_column('vat_submissions', 'digipoort_message_id')
    op.drop_column('vat_submissions', 'signed_xml')
    op.drop_column('vat_submissions', 'payload_xml')
    op.drop_column('vat_submissions', 'payload_hash')
