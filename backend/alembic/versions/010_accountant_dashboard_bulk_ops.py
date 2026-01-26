"""Accountant Master Dashboard and Bulk Operations

Revision ID: 010_accountant_dashboard_bulk_ops
Revises: 009_alerts_table
Create Date: 2024-01-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '010_accountant_dashboard_bulk_ops'
down_revision: Union[str, None] = '009_alerts_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create accountant_client_assignments table
    # This table tracks which accountants are assigned to which clients
    op.create_table(
        'accountant_client_assignments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('accountant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('assigned_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['accountant_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['assigned_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('accountant_id', 'administration_id', name='uq_accountant_client_assignment'),
    )
    
    # Create indexes for efficient querying
    op.create_index('ix_accountant_client_assignments_accountant', 'accountant_client_assignments', ['accountant_id'])
    op.create_index('ix_accountant_client_assignments_administration', 'accountant_client_assignments', ['administration_id'])
    
    # Create bulk_operation_type enum
    op.execute("""
        CREATE TYPE bulkoperationtype AS ENUM (
            'BULK_RECALCULATE',
            'BULK_ACK_YELLOW', 
            'BULK_GENERATE_VAT_DRAFT',
            'BULK_SEND_CLIENT_REMINDERS',
            'BULK_LOCK_PERIOD'
        )
    """)
    
    # Create bulk_operation_status enum
    op.execute("""
        CREATE TYPE bulkoperationstatus AS ENUM (
            'PENDING',
            'IN_PROGRESS',
            'COMPLETED',
            'COMPLETED_WITH_ERRORS',
            'FAILED',
            'CANCELLED'
        )
    """)
    
    # Create bulk_operations table for tracking bulk actions
    op.create_table(
        'bulk_operations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('operation_type', postgresql.ENUM('BULK_RECALCULATE', 'BULK_ACK_YELLOW', 'BULK_GENERATE_VAT_DRAFT', 'BULK_SEND_CLIENT_REMINDERS', 'BULK_LOCK_PERIOD', name='bulkoperationtype', create_type=False), nullable=False),
        sa.Column('status', postgresql.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED', name='bulkoperationstatus', create_type=False), nullable=False, server_default='PENDING'),
        sa.Column('initiated_by_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('parameters', postgresql.JSON(), nullable=True),  # Filter criteria, options
        sa.Column('target_client_ids', postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        sa.Column('total_clients', sa.Integer(), nullable=True),
        sa.Column('processed_clients', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('successful_clients', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('failed_clients', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('idempotency_key', sa.String(255), nullable=True),  # For idempotent operations
        sa.ForeignKeyConstraint(['initiated_by_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    
    # Create index for idempotency key
    op.create_index('ix_bulk_operations_idempotency_key', 'bulk_operations', ['idempotency_key'], unique=True, postgresql_where=sa.text('idempotency_key IS NOT NULL'))
    op.create_index('ix_bulk_operations_initiated_by', 'bulk_operations', ['initiated_by_id'])
    op.create_index('ix_bulk_operations_status', 'bulk_operations', ['status'])
    op.create_index('ix_bulk_operations_created_at', 'bulk_operations', ['created_at'])
    
    # Create bulk_operation_results table for per-client results
    op.create_table(
        'bulk_operation_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('bulk_operation_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),  # SUCCESS, FAILED, SKIPPED
        sa.Column('processed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('result_data', postgresql.JSON(), nullable=True),  # Operation-specific results
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['bulk_operation_id'], ['bulk_operations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    
    op.create_index('ix_bulk_operation_results_operation', 'bulk_operation_results', ['bulk_operation_id'])
    op.create_index('ix_bulk_operation_results_administration', 'bulk_operation_results', ['administration_id'])
    
    # Create client_reminders table for the BULK_SEND_CLIENT_REMINDERS action
    op.create_table(
        'client_reminders',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('reminder_type', sa.String(50), nullable=False),  # DOCUMENT_MISSING, VAT_DEADLINE, REVIEW_PENDING
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_dismissed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('dismissed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('bulk_operation_id', postgresql.UUID(as_uuid=True), nullable=True),  # Link to originating bulk op
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['bulk_operation_id'], ['bulk_operations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    
    op.create_index('ix_client_reminders_administration', 'client_reminders', ['administration_id'])
    op.create_index('ix_client_reminders_created_by', 'client_reminders', ['created_by_id'])
    op.create_index('ix_client_reminders_is_read', 'client_reminders', ['is_read'])


def downgrade() -> None:
    op.drop_index('ix_client_reminders_is_read', 'client_reminders')
    op.drop_index('ix_client_reminders_created_by', 'client_reminders')
    op.drop_index('ix_client_reminders_administration', 'client_reminders')
    op.drop_table('client_reminders')
    
    op.drop_index('ix_bulk_operation_results_administration', 'bulk_operation_results')
    op.drop_index('ix_bulk_operation_results_operation', 'bulk_operation_results')
    op.drop_table('bulk_operation_results')
    
    op.drop_index('ix_bulk_operations_created_at', 'bulk_operations')
    op.drop_index('ix_bulk_operations_status', 'bulk_operations')
    op.drop_index('ix_bulk_operations_initiated_by', 'bulk_operations')
    op.drop_index('ix_bulk_operations_idempotency_key', 'bulk_operations')
    op.drop_table('bulk_operations')
    
    op.execute("DROP TYPE bulkoperationstatus")
    op.execute("DROP TYPE bulkoperationtype")
    
    op.drop_index('ix_accountant_client_assignments_administration', 'accountant_client_assignments')
    op.drop_index('ix_accountant_client_assignments_accountant', 'accountant_client_assignments')
    op.drop_table('accountant_client_assignments')
