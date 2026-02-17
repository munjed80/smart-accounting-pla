"""add vat submissions tracking

Revision ID: 038_add_vat_submissions
Revises: 037_add_vat_box_lineage
Create Date: 2026-02-17 00:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '038_add_vat_submissions'
down_revision = '037_add_vat_box_lineage'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create vat_submissions table
    op.create_table(
        'vat_submissions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('period_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('submission_type', sa.String(length=20), nullable=False, server_default='BTW'),  # BTW or ICP
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('method', sa.String(length=20), nullable=False, server_default='PACKAGE'),  # PACKAGE, DIGIPOORT (future)
        sa.Column('status', sa.String(length=20), nullable=False, server_default='DRAFT'),  # DRAFT, SUBMITTED, CONFIRMED, REJECTED
        sa.Column('reference_text', sa.Text(), nullable=True),
        sa.Column('attachment_url', sa.String(length=500), nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['period_id'], ['accounting_periods.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
    )
    
    # Create indexes for efficient querying
    op.create_index('ix_vat_submissions_admin', 'vat_submissions', ['administration_id'])
    op.create_index('ix_vat_submissions_period', 'vat_submissions', ['period_id'])
    op.create_index('ix_vat_submissions_status', 'vat_submissions', ['status'])
    op.create_index('ix_vat_submissions_admin_period', 'vat_submissions', ['administration_id', 'period_id'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_vat_submissions_admin_period', table_name='vat_submissions')
    op.drop_index('ix_vat_submissions_status', table_name='vat_submissions')
    op.drop_index('ix_vat_submissions_period', table_name='vat_submissions')
    op.drop_index('ix_vat_submissions_admin', table_name='vat_submissions')
    
    # Drop table
    op.drop_table('vat_submissions')
