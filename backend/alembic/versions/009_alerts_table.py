"""Alerts table for observability

Revision ID: 009_alerts_table
Revises: 008_document_intake_pipeline
Create Date: 2024-01-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '009_alerts_table'
down_revision: Union[str, None] = '008_document_intake_pipeline'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create alert_severity enum
    op.execute("CREATE TYPE alertseverity AS ENUM ('CRITICAL', 'WARNING', 'INFO')")
    
    # Create alerts table
    op.create_table(
        'alerts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('alert_code', sa.String(100), nullable=False),
        sa.Column('severity', postgresql.ENUM('CRITICAL', 'WARNING', 'INFO', name='alertseverity', create_type=False), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=True),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('context', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('acknowledged_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('auto_resolved', sa.Boolean(), nullable=True, server_default='false'),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['acknowledged_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['resolved_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for efficient querying
    op.create_index('ix_alerts_administration_id', 'alerts', ['administration_id'])
    op.create_index('ix_alerts_alert_code', 'alerts', ['alert_code'])
    op.create_index('ix_alerts_severity', 'alerts', ['severity'])
    op.create_index('ix_alerts_created_at', 'alerts', ['created_at'])
    op.create_index('ix_alerts_resolved_at', 'alerts', ['resolved_at'])
    # Composite index for active alerts query
    op.create_index('ix_alerts_active', 'alerts', ['administration_id', 'resolved_at'], postgresql_where=sa.text('resolved_at IS NULL'))


def downgrade() -> None:
    op.drop_index('ix_alerts_active', 'alerts')
    op.drop_index('ix_alerts_resolved_at', 'alerts')
    op.drop_index('ix_alerts_created_at', 'alerts')
    op.drop_index('ix_alerts_severity', 'alerts')
    op.drop_index('ix_alerts_alert_code', 'alerts')
    op.drop_index('ix_alerts_administration_id', 'alerts')
    op.drop_table('alerts')
    op.execute("DROP TYPE alertseverity")
