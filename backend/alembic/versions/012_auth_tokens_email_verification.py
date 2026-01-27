"""Add auth tokens and email verification

Revision ID: 012_auth_tokens_email_verification
Revises: 011_work_queue_reminders_evidence
Create Date: 2024-01-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '012_auth_tokens_email_verification'
down_revision: Union[str, None] = '011_work_queue_reminders_evidence'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add email_verified_at to users table
    op.add_column(
        'users',
        sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True)
    )
    
    # Add last_login_at to users table (optional but useful for audit)
    op.add_column(
        'users',
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True)
    )
    
    # Create token_type enum
    op.execute("CREATE TYPE authtoken_type AS ENUM ('email_verify', 'password_reset')")
    
    # Create auth_tokens table
    op.create_table(
        'auth_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('token_hash', sa.String(128), nullable=False),  # SHA-256 hex = 64 chars, extra space for safety
        sa.Column('token_type', postgresql.ENUM('email_verify', 'password_reset', name='authtoken_type', create_type=False), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('ip_address', sa.String(45), nullable=True),  # IPv6 max length
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create index on token_hash for fast lookups
    op.create_index('ix_auth_tokens_token_hash', 'auth_tokens', ['token_hash'], unique=False)
    
    # Create index on user_id and token_type for finding active tokens
    op.create_index('ix_auth_tokens_user_type', 'auth_tokens', ['user_id', 'token_type'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_auth_tokens_user_type', table_name='auth_tokens')
    op.drop_index('ix_auth_tokens_token_hash', table_name='auth_tokens')
    op.drop_table('auth_tokens')
    op.execute("DROP TYPE authtoken_type")
    op.drop_column('users', 'last_login_at')
    op.drop_column('users', 'email_verified_at')
