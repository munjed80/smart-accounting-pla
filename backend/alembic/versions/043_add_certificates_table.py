"""add certificates table for PKI certificate metadata

Revision ID: 043_add_certificates_table
Revises: 042_add_digipoort_fields
Create Date: 2026-02-17 19:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '043_add_certificates_table'
down_revision = '042_add_digipoort_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create certificates table for storing certificate metadata
    # Note: Private keys and certificate files are NEVER stored in the database
    # They are stored securely on the filesystem with references via storage_ref
    op.create_table(
        'certificates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),  # e.g., PKI_OVERHEID
        sa.Column('storage_ref', sa.String(length=500), nullable=False),  # Path or reference to certificate file
        sa.Column('passphrase_ref', sa.String(length=500), nullable=True),  # Reference to passphrase (env var name, secret key)
        
        # Certificate metadata (extracted from the certificate)
        sa.Column('fingerprint', sa.String(length=64), nullable=False, unique=True),  # SHA256 fingerprint
        sa.Column('subject', sa.String(length=500), nullable=False),  # Certificate subject DN
        sa.Column('issuer', sa.String(length=500), nullable=False),  # Certificate issuer DN
        sa.Column('serial_number', sa.String(length=100), nullable=False),  # Certificate serial number
        sa.Column('valid_from', sa.DateTime(timezone=True), nullable=False),  # Validity start date
        sa.Column('valid_to', sa.DateTime(timezone=True), nullable=False),  # Validity end date
        
        # Optional metadata
        sa.Column('friendly_name', sa.String(length=200), nullable=True),  # User-friendly name
        sa.Column('purpose', sa.String(length=100), nullable=True),  # e.g., "BTW_SUBMISSION", "ICP_SUBMISSION"
        
        # Audit fields
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),  # Soft delete support
    )
    
    # Create indexes for efficient queries
    op.create_index('ix_certificates_admin', 'certificates', ['administration_id'])
    op.create_index('ix_certificates_fingerprint', 'certificates', ['fingerprint'])
    op.create_index('ix_certificates_valid_to', 'certificates', ['valid_to'])
    op.create_index('ix_certificates_is_active', 'certificates', ['is_active'])
    
    # Add certificate reference to vat_submissions
    op.add_column(
        'vat_submissions',
        sa.Column('certificate_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('certificates.id', ondelete='SET NULL'), nullable=True)
    )
    op.create_index('ix_vat_submissions_certificate', 'vat_submissions', ['certificate_id'])


def downgrade() -> None:
    # Remove certificate reference from vat_submissions
    op.drop_index('ix_vat_submissions_certificate', table_name='vat_submissions')
    op.drop_column('vat_submissions', 'certificate_id')
    
    # Drop indexes
    op.drop_index('ix_certificates_is_active', table_name='certificates')
    op.drop_index('ix_certificates_valid_to', table_name='certificates')
    op.drop_index('ix_certificates_fingerprint', table_name='certificates')
    op.drop_index('ix_certificates_admin', table_name='certificates')
    
    # Drop table
    op.drop_table('certificates')
