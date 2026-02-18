"""add pending webhook retries table

Revision ID: 045_add_pending_webhook_retries
Revises: 044_add_subscription_phase1_fields
Create Date: 2026-02-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '045_add_pending_webhook_retries'
down_revision: Union[str, None] = '044_add_subscription_phase1_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pending_webhook_retries',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('resource_id', sa.String(length=255), nullable=False),
        sa.Column('resource_type', sa.String(length=50), nullable=False),
        sa.Column('reason', sa.String(length=500), nullable=True),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('next_retry_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_error', sa.String(length=2000), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('resource_id'),
    )
    op.create_index('ix_pending_webhook_retries_provider', 'pending_webhook_retries', ['provider'])
    op.create_index('ix_pending_webhook_retries_resource_id', 'pending_webhook_retries', ['resource_id'])


def downgrade() -> None:
    op.drop_index('ix_pending_webhook_retries_resource_id', table_name='pending_webhook_retries')
    op.drop_index('ix_pending_webhook_retries_provider', table_name='pending_webhook_retries')
    op.drop_table('pending_webhook_retries')
