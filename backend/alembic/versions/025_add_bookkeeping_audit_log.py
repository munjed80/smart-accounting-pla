"""Add bookkeeping audit log table

Revision ID: 025_add_bookkeeping_audit_log
Revises: 024_add_permission_scopes
Create Date: 2026-02-09

This migration adds an audit_log table to track all bookkeeping actions
for compliance and auditing purposes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = '025_add_bookkeeping_audit_log'
down_revision: Union[str, None] = '024_add_permission_scopes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create audit_log table for tracking all bookkeeping actions
    op.create_table(
        'bookkeeping_audit_log',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('actor_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('actor_name', sa.String(255), nullable=True),  # Denormalized for audit trail
        sa.Column('action', sa.String(50), nullable=False),  # CREATE, UPDATE, POST, DELETE, LOCK_PERIOD, UNLOCK_PERIOD
        sa.Column('entity_type', sa.String(50), nullable=False),  # journal_entry, period, etc.
        sa.Column('entity_id', UUID(as_uuid=True), nullable=True),
        sa.Column('entity_description', sa.String(255), nullable=True),  # Human-readable description
        sa.Column('payload', JSONB, nullable=True),  # JSON payload with details
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    
    # Index for fast queries by administration
    op.create_index(
        'ix_bookkeeping_audit_log_administration_id',
        'bookkeeping_audit_log',
        ['administration_id']
    )
    
    # Index for fast queries by entity
    op.create_index(
        'ix_bookkeeping_audit_log_entity',
        'bookkeeping_audit_log',
        ['entity_type', 'entity_id']
    )
    
    # Index for time-based queries
    op.create_index(
        'ix_bookkeeping_audit_log_created_at',
        'bookkeeping_audit_log',
        ['created_at']
    )
    
    # Add created_by_id to journal_entries if it doesn't exist
    # (For tracking who created the entry)
    op.add_column(
        'journal_entries',
        sa.Column('created_by_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    )


def downgrade() -> None:
    # Remove created_by_id from journal_entries
    op.drop_column('journal_entries', 'created_by_id')
    
    # Drop indexes
    op.drop_index('ix_bookkeeping_audit_log_created_at', table_name='bookkeeping_audit_log')
    op.drop_index('ix_bookkeeping_audit_log_entity', table_name='bookkeeping_audit_log')
    op.drop_index('ix_bookkeeping_audit_log_administration_id', table_name='bookkeeping_audit_log')
    
    # Drop the audit_log table
    op.drop_table('bookkeeping_audit_log')
