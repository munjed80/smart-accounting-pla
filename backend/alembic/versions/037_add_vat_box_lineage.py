"""add vat box lineage

Revision ID: 037_add_vat_box_lineage
Revises: 036_bank_connections_match_proposals
Create Date: 2026-02-16 23:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '037_add_vat_box_lineage'
down_revision = '036_bank_connections_match_proposals'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create vat_box_lineage table
    op.create_table(
        'vat_box_lineage',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('period_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('vat_box_code', sa.String(length=10), nullable=False),
        sa.Column('net_amount', sa.Numeric(precision=15, scale=2), nullable=False, server_default='0.00'),
        sa.Column('vat_amount', sa.Numeric(precision=15, scale=2), nullable=False, server_default='0.00'),
        sa.Column('source_type', sa.String(length=50), nullable=False),
        sa.Column('source_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('journal_entry_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('journal_line_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('vat_code_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('transaction_date', sa.Date(), nullable=False),
        sa.Column('reference', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('party_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('party_name', sa.String(length=255), nullable=True),
        sa.Column('party_vat_number', sa.String(length=30), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['period_id'], ['accounting_periods.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['journal_line_id'], ['journal_lines.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vat_code_id'], ['vat_codes.id'], ondelete='SET NULL'),
    )
    
    # Create indexes for efficient querying
    op.create_index('ix_vat_lineage_period_box', 'vat_box_lineage', ['period_id', 'vat_box_code'])
    op.create_index('ix_vat_lineage_admin_period', 'vat_box_lineage', ['administration_id', 'period_id'])
    op.create_index('ix_vat_lineage_source', 'vat_box_lineage', ['source_type', 'source_id'])
    op.create_index('ix_vat_lineage_document', 'vat_box_lineage', ['document_id'])
    op.create_index('ix_vat_lineage_journal_entry', 'vat_box_lineage', ['journal_entry_id'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_vat_lineage_journal_entry', table_name='vat_box_lineage')
    op.drop_index('ix_vat_lineage_document', table_name='vat_box_lineage')
    op.drop_index('ix_vat_lineage_source', table_name='vat_box_lineage')
    op.drop_index('ix_vat_lineage_admin_period', table_name='vat_box_lineage')
    op.drop_index('ix_vat_lineage_period_box', table_name='vat_box_lineage')
    
    # Drop table
    op.drop_table('vat_box_lineage')
