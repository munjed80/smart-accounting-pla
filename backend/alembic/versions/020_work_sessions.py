"""Add work_sessions table for clock-in/out functionality

Revision ID: 020_work_sessions
Revises: 019_extend_zzp_customers
Create Date: 2026-02-07

This migration creates the work_sessions table for daily clock-in functionality.
Work sessions track start/end times and can auto-generate time entries when stopped.

Key features:
- Unique partial index ensures only ONE active session per user per administration
- ended_at nullable (null = session is active)
- On stop: creates/updates ZZPTimeEntry with calculated duration
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '020_work_sessions'
down_revision: Union[str, None] = '019_extend_zzp_customers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ==========================================================================
    # Work Sessions Table
    # ==========================================================================
    op.create_table(
        'work_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        
        # Session timestamps
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        
        # Break and notes
        sa.Column('break_minutes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('note', sa.Text(), nullable=True),
        
        # Reference to created time entry (set when session is stopped)
        sa.Column('time_entry_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('zzp_time_entries.id', ondelete='SET NULL'), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    
    # Standard indexes
    op.create_index('ix_work_sessions_user_id', 'work_sessions', ['user_id'])
    op.create_index('ix_work_sessions_administration_id', 'work_sessions', ['administration_id'])
    op.create_index('ix_work_sessions_started_at', 'work_sessions', ['started_at'])
    
    # CRITICAL: Unique partial index - only ONE active session per user per administration
    # A session is "active" when ended_at IS NULL
    op.execute("""
        CREATE UNIQUE INDEX ix_work_sessions_active_unique 
        ON work_sessions (user_id, administration_id) 
        WHERE ended_at IS NULL
    """)


def downgrade() -> None:
    # Drop the partial index first
    op.execute("DROP INDEX IF EXISTS ix_work_sessions_active_unique")
    
    # Drop standard indexes
    op.drop_index('ix_work_sessions_started_at', table_name='work_sessions')
    op.drop_index('ix_work_sessions_administration_id', table_name='work_sessions')
    op.drop_index('ix_work_sessions_user_id', table_name='work_sessions')
    
    # Drop table
    op.drop_table('work_sessions')
