"""Add ZZP bank payment tracking

Revision ID: 021_zzp_bank_payments
Revises: 020_work_sessions
Create Date: 2026-02-08

This migration adds:
1. amount_paid_cents column to zzp_invoices for partial payment tracking
2. zzp_bank_transaction_matches table for audit trail of invoice-transaction matches

Key features:
- Supports partial payments (track amount_paid_cents vs total_cents)
- Supports overpayment scenarios (amount_paid can exceed total)
- Full audit trail with user_id, timestamps, and match_type
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '021_zzp_bank_payments'
down_revision: Union[str, None] = '020_work_sessions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ==========================================================================
    # Add amount_paid_cents to zzp_invoices
    # ==========================================================================
    op.add_column(
        'zzp_invoices',
        sa.Column('amount_paid_cents', sa.Integer(), nullable=False, server_default='0')
    )
    
    # ==========================================================================
    # ZZP Bank Transaction Matches Table
    # ==========================================================================
    op.create_table(
        'zzp_bank_transaction_matches',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bank_transaction_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bank_transactions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('zzp_invoices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        
        # Amount allocated
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        
        # Match metadata
        sa.Column('match_type', sa.String(20), nullable=False, server_default='manual'),
        sa.Column('confidence_score', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    
    # Create indexes for efficient querying
    op.create_index('ix_zzp_bank_transaction_matches_administration_id', 'zzp_bank_transaction_matches', ['administration_id'])
    op.create_index('ix_zzp_bank_transaction_matches_bank_transaction_id', 'zzp_bank_transaction_matches', ['bank_transaction_id'])
    op.create_index('ix_zzp_bank_transaction_matches_invoice_id', 'zzp_bank_transaction_matches', ['invoice_id'])
    op.create_index('ix_zzp_bank_transaction_matches_user_id', 'zzp_bank_transaction_matches', ['user_id'])


def downgrade() -> None:
    # Drop the matches table
    op.drop_index('ix_zzp_bank_transaction_matches_user_id')
    op.drop_index('ix_zzp_bank_transaction_matches_invoice_id')
    op.drop_index('ix_zzp_bank_transaction_matches_bank_transaction_id')
    op.drop_index('ix_zzp_bank_transaction_matches_administration_id')
    op.drop_table('zzp_bank_transaction_matches')
    
    # Remove column from zzp_invoices
    op.drop_column('zzp_invoices', 'amount_paid_cents')
