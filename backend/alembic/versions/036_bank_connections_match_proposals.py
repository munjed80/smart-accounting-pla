"""036 - Add bank connections and match proposals

Revision ID: 036_bank_connections_match_proposals
Revises: 035_commitment_status_and_period_key
Create Date: 2026-02-16

This migration adds:
1. bank_connections table for PSD2/AIS provider connections
2. bank_match_proposals table for persistent matching rules
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = '036_bank_connections_match_proposals'
down_revision = '035_commitment_status_and_period_key'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add bank_connections and bank_match_proposals tables."""
    
    # Create bank_connections table
    op.create_table(
        'bank_connections',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('administration_id', UUID(as_uuid=True), nullable=False),
        sa.Column('bank_account_id', UUID(as_uuid=True), nullable=True),
        
        # Provider information
        sa.Column('provider_name', sa.String(50), nullable=False),
        sa.Column('provider_connection_id', sa.String(200), nullable=False),
        sa.Column('institution_id', sa.String(100), nullable=False),
        sa.Column('institution_name', sa.String(200), nullable=False),
        
        # Connection status
        sa.Column('status', sa.String(20), nullable=False, server_default='PENDING'),
        sa.Column('consent_expires_at', sa.DateTime(timezone=True), nullable=True),
        
        # Credentials (should be encrypted in production)
        sa.Column('access_token', sa.Text, nullable=True),
        sa.Column('refresh_token', sa.Text, nullable=True),
        
        # Metadata
        sa.Column('metadata', JSONB, nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
        
        # Foreign keys
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['bank_account_id'], ['bank_accounts.id'], ondelete='CASCADE'),
        
        # Indexes
        sa.Index('ix_bank_connections_administration_id', 'administration_id'),
        sa.Index('ix_bank_connections_status', 'status'),
        sa.Index('ix_bank_connections_provider_connection_id', 'provider_connection_id'),
    )
    
    # Create bank_match_proposals table
    op.create_table(
        'bank_match_proposals',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('administration_id', UUID(as_uuid=True), nullable=False),
        sa.Column('bank_transaction_id', UUID(as_uuid=True), nullable=False),
        
        # Match target
        sa.Column('entity_type', sa.String(30), nullable=False),  # INVOICE, EXPENSE, TRANSFER, MANUAL
        sa.Column('entity_id', UUID(as_uuid=True), nullable=False),
        
        # Confidence and reasoning
        sa.Column('confidence_score', sa.Integer, nullable=False),  # 0-100
        sa.Column('reason', sa.String(255), nullable=False),
        
        # Match details
        sa.Column('matched_amount', sa.Numeric(14, 2), nullable=True),
        sa.Column('matched_date', sa.Date, nullable=True),
        sa.Column('matched_reference', sa.String(200), nullable=True),
        
        # Matching rule that generated this proposal
        sa.Column('rule_type', sa.String(50), nullable=True),  # e.g., 'INVOICE_NUMBER', 'AMOUNT_EXACT', 'IBAN_RECURRING'
        sa.Column('rule_config', JSONB, nullable=True),  # Rule-specific configuration
        
        # Status
        sa.Column('is_applied', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('is_dismissed', sa.Boolean, nullable=False, server_default='false'),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        
        # Foreign keys
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['bank_transaction_id'], ['bank_transactions.id'], ondelete='CASCADE'),
        
        # Indexes
        sa.Index('ix_bank_match_proposals_transaction_id', 'bank_transaction_id'),
        sa.Index('ix_bank_match_proposals_entity', 'entity_type', 'entity_id'),
        sa.Index('ix_bank_match_proposals_confidence', 'confidence_score'),
        sa.Index('ix_bank_match_proposals_status', 'is_applied', 'is_dismissed'),
        
        # Constraints
        sa.CheckConstraint('confidence_score >= 0 AND confidence_score <= 100', name='check_confidence_score_range'),
    )


def downgrade() -> None:
    """Remove bank_connections and bank_match_proposals tables."""
    op.drop_table('bank_match_proposals')
    op.drop_table('bank_connections')
