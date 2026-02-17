"""040 - Bank Matching Engine

Revision ID: 040_bank_matching_engine
Revises: 039_audit_log_engine
Create Date: 2026-02-17

This migration upgrades bank reconciliation to production-grade:
1. Enhances bank_match_proposals with new status and fields
2. Adds bank_match_rules table for intelligent matching rules
3. Adds bank_transaction_splits table for split transaction support
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = '040_bank_matching_engine'
down_revision = '039_audit_log_engine'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add bank matching engine tables and enhance existing proposals table."""
    
    # Ensure pgcrypto extension is available for gen_random_uuid()
    op.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto;')
    
    # Enhance bank_match_proposals table with new fields
    # Note: This table was created in migration 036, we're adding new columns
    op.add_column(
        'bank_match_proposals',
        sa.Column('status', sa.String(20), nullable=False, server_default='suggested')
    )
    
    # Create index on status for efficient filtering
    op.create_index(
        'ix_bank_match_proposals_status_new',
        'bank_match_proposals',
        ['status']
    )
    
    # Add unique constraint to prevent duplicate proposals
    op.create_unique_constraint(
        'uq_bank_match_proposals_transaction_target',
        'bank_match_proposals',
        ['bank_transaction_id', 'entity_type', 'entity_id']
    )
    
    # Create bank_match_rules table
    op.create_table(
        'bank_match_rules',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('client_id', UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.Text, nullable=True),
        sa.Column('enabled', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('priority', sa.Integer, nullable=False, server_default='100'),
        
        # Conditions for matching (JSONB for flexibility)
        # Example: {"iban":"NL..","contains":"ADYEN","min_amount":10,"max_amount":500}
        sa.Column('conditions', JSONB, nullable=False),
        
        # Action to take when rule matches (JSONB for flexibility)
        # Example: {"auto_accept":true,"target_type":"expense","expense_category_id":"..."}
        sa.Column('action', JSONB, nullable=False),
        
        # Audit fields
        sa.Column('created_by_user_id', UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        
        # Foreign keys
        sa.ForeignKeyConstraint(['client_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
        
        # Indexes
        sa.Index('ix_bank_match_rules_client_id', 'client_id'),
        sa.Index('ix_bank_match_rules_enabled', 'enabled'),
        sa.Index('ix_bank_match_rules_priority', 'priority'),
    )
    
    # Create bank_transaction_splits table
    op.create_table(
        'bank_transaction_splits',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('client_id', UUID(as_uuid=True), nullable=False),
        sa.Column('transaction_id', UUID(as_uuid=True), nullable=False),
        sa.Column('split_index', sa.Integer, nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        
        # Foreign keys
        sa.ForeignKeyConstraint(['client_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['transaction_id'], ['bank_transactions.id'], ondelete='CASCADE'),
        
        # Indexes
        sa.Index('ix_bank_transaction_splits_client_id', 'client_id'),
        sa.Index('ix_bank_transaction_splits_transaction_id', 'transaction_id'),
        
        # Unique constraint to prevent duplicate split indexes
        sa.UniqueConstraint('transaction_id', 'split_index', name='uq_bank_transaction_splits_tx_index'),
    )


def downgrade() -> None:
    """Remove bank matching engine tables and enhancements."""
    # Drop tables in reverse order
    op.drop_table('bank_transaction_splits')
    op.drop_table('bank_match_rules')
    
    # Remove enhancements to bank_match_proposals
    op.drop_constraint('uq_bank_match_proposals_transaction_target', 'bank_match_proposals', type_='unique')
    op.drop_index('ix_bank_match_proposals_status_new', table_name='bank_match_proposals')
    op.drop_column('bank_match_proposals', 'status')
