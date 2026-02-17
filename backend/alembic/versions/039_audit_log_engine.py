"""audit log engine

Revision ID: 039_audit_log_engine
Revises: 038_add_vat_submissions
Create Date: 2026-02-17 08:15:00.000000

This migration creates a production-grade audit trail table for Smart Accounting.
The audit_log table tracks all changes to entities across the system with full
tenant isolation and comprehensive metadata.

Critical features:
- Full backward compatibility
- No modifications to existing tables or enums
- Safe for PostgreSQL with pgcrypto extension
- JSONB for flexible old/new value storage
- Optimized indexes for common query patterns
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision = '039_audit_log_engine'
down_revision = '038_add_vat_submissions'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create audit_log table with indexes."""
    
    # Ensure pgcrypto extension is available for gen_random_uuid()
    # Safe to run multiple times - will not error if already exists
    op.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto;')
    
    # Create audit_log table
    op.create_table(
        'audit_log',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        
        # Tenant isolation
        sa.Column('client_id', UUID(as_uuid=True), nullable=False),
        
        # Entity information
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', UUID(as_uuid=True), nullable=False),
        
        # Action tracking
        sa.Column('action', sa.String(20), nullable=False),
        
        # User information
        sa.Column('user_id', UUID(as_uuid=True), nullable=True),
        sa.Column('user_role', sa.String(20), nullable=False),
        
        # Value changes (JSONB for flexibility)
        sa.Column('old_value', JSONB, nullable=True),
        sa.Column('new_value', JSONB, nullable=True),
        
        # Additional metadata
        sa.Column('ip_address', sa.String(45), nullable=True),
        
        # Timestamp
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    
    # Create indexes for optimal query performance
    # 
    # Composite index for tenant-based time-series queries (most common pattern)
    # DESC ordering on created_at enables efficient "recent activity" queries
    # Note: Using sa.text() for DESC as SQLAlchemy doesn't support desc() in create_index
    op.create_index(
        'ix_audit_log_client_created',
        'audit_log',
        ['client_id', sa.text('created_at DESC')],
    )
    
    # Composite index for entity lookups (e.g., "show all changes to invoice X")
    op.create_index(
        'ix_audit_log_entity',
        'audit_log',
        ['entity_type', 'entity_id'],
    )
    
    # Index for user activity tracking (e.g., "what did user Y change?")
    op.create_index(
        'ix_audit_log_user',
        'audit_log',
        ['user_id'],
    )
    
    # Separate created_at index for admin/cross-tenant queries
    # While ix_audit_log_client_created covers tenant-scoped time queries,
    # this index supports efficient cross-tenant administrative queries
    # (e.g., system-wide activity monitoring, compliance reporting)
    op.create_index(
        'ix_audit_log_created_at',
        'audit_log',
        ['created_at'],
    )


def downgrade() -> None:
    """Clean removal of audit_log table."""
    # Drop indexes first (implicit when dropping table, but explicit for clarity)
    op.drop_index('ix_audit_log_created_at', table_name='audit_log')
    op.drop_index('ix_audit_log_user', table_name='audit_log')
    op.drop_index('ix_audit_log_entity', table_name='audit_log')
    op.drop_index('ix_audit_log_client_created', table_name='audit_log')
    
    # Drop the table
    op.drop_table('audit_log')
    
    # Note: We do NOT drop the pgcrypto extension as it may be used by other tables
    # and dropping it could break existing functionality
