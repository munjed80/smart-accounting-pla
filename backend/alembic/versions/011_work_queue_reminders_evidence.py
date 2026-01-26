"""Work Queue, Enhanced Reminders, Evidence Packs, SLA Escalation

Revision ID: 011_work_queue_reminders_evidence
Revises: 010_accountant_dashboard_bulk_ops
Create Date: 2024-01-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '011_work_queue_reminders_evidence'
down_revision: Union[str, None] = '010_accountant_dashboard_bulk_ops'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ============================================
    # 1. Client Readiness Cache Table
    # ============================================
    # Materialized view alternative for efficient readiness score queries
    op.create_table(
        'client_readiness_cache',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('readiness_score', sa.Integer(), nullable=False),
        sa.Column('readiness_breakdown', postgresql.JSON(), nullable=True),
        sa.Column('red_issue_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('yellow_issue_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('document_backlog', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('vat_days_remaining', sa.Integer(), nullable=True),
        sa.Column('period_status', sa.String(50), nullable=True),
        sa.Column('has_critical_alerts', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('staleness_days', sa.Integer(), nullable=True),
        sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('administration_id', name='uq_client_readiness_cache_admin'),
    )
    op.create_index('ix_client_readiness_cache_score', 'client_readiness_cache', ['readiness_score'])
    op.create_index('ix_client_readiness_cache_computed_at', 'client_readiness_cache', ['computed_at'])

    # ============================================
    # 2. Escalation Events Table for SLA Auditability
    # ============================================
    op.create_table(
        'escalation_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('escalation_type', sa.String(50), nullable=False),  # RED_UNRESOLVED, VAT_DEADLINE, REVIEW_STALE, BACKLOG_HIGH
        sa.Column('severity', sa.String(20), nullable=False),  # WARNING, CRITICAL
        sa.Column('trigger_reason', sa.Text(), nullable=False),
        sa.Column('threshold_value', sa.Integer(), nullable=True),
        sa.Column('actual_value', sa.Integer(), nullable=True),
        sa.Column('entity_type', sa.String(50), nullable=True),  # issue, period, alert
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('acknowledged_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['acknowledged_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_escalation_events_administration', 'escalation_events', ['administration_id'])
    op.create_index('ix_escalation_events_type', 'escalation_events', ['escalation_type'])
    op.create_index('ix_escalation_events_created_at', 'escalation_events', ['created_at'])

    # ============================================
    # 3. Extend client_reminders Table
    # ============================================
    # Add new columns for enhanced reminder functionality
    op.add_column('client_reminders', sa.Column('channel', sa.String(20), nullable=False, server_default='IN_APP'))
    op.add_column('client_reminders', sa.Column('template_id', sa.String(100), nullable=True))
    op.add_column('client_reminders', sa.Column('variables', postgresql.JSON(), nullable=True))
    op.add_column('client_reminders', sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('client_reminders', sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('client_reminders', sa.Column('status', sa.String(20), nullable=False, server_default='PENDING'))  # PENDING, SCHEDULED, SENT, FAILED
    op.add_column('client_reminders', sa.Column('email_address', sa.String(255), nullable=True))
    op.add_column('client_reminders', sa.Column('send_error', sa.Text(), nullable=True))
    
    # Add indexes for new columns
    op.create_index('ix_client_reminders_scheduled_at', 'client_reminders', ['scheduled_at'])
    op.create_index('ix_client_reminders_status', 'client_reminders', ['status'])

    # ============================================
    # 4. Evidence Packs Table
    # ============================================
    op.create_table(
        'evidence_packs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('period_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('pack_type', sa.String(50), nullable=False),  # VAT_EVIDENCE, AUDIT_TRAIL
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('storage_path', sa.String(500), nullable=False),
        sa.Column('checksum', sa.String(64), nullable=False),  # SHA256
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('snapshot_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('metadata', postgresql.JSON(), nullable=True),
        sa.Column('download_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_downloaded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_downloaded_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['period_id'], ['accounting_periods.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['last_downloaded_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_evidence_packs_administration', 'evidence_packs', ['administration_id'])
    op.create_index('ix_evidence_packs_period', 'evidence_packs', ['period_id'])
    op.create_index('ix_evidence_packs_created_at', 'evidence_packs', ['created_at'])

    # ============================================
    # 5. Audit Log Table for New Operations
    # ============================================
    op.create_table(
        'dashboard_audit_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action_type', sa.String(50), nullable=False),  # REMINDER_SEND, REMINDER_SCHEDULE, EVIDENCE_PACK_GENERATE, EVIDENCE_PACK_DOWNLOAD
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('entity_type', sa.String(50), nullable=True),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('details', postgresql.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_dashboard_audit_log_user', 'dashboard_audit_log', ['user_id'])
    op.create_index('ix_dashboard_audit_log_action', 'dashboard_audit_log', ['action_type'])
    op.create_index('ix_dashboard_audit_log_created_at', 'dashboard_audit_log', ['created_at'])


def downgrade() -> None:
    # Drop audit log
    op.drop_index('ix_dashboard_audit_log_created_at', 'dashboard_audit_log')
    op.drop_index('ix_dashboard_audit_log_action', 'dashboard_audit_log')
    op.drop_index('ix_dashboard_audit_log_user', 'dashboard_audit_log')
    op.drop_table('dashboard_audit_log')
    
    # Drop evidence_packs
    op.drop_index('ix_evidence_packs_created_at', 'evidence_packs')
    op.drop_index('ix_evidence_packs_period', 'evidence_packs')
    op.drop_index('ix_evidence_packs_administration', 'evidence_packs')
    op.drop_table('evidence_packs')
    
    # Remove added columns from client_reminders
    op.drop_index('ix_client_reminders_status', 'client_reminders')
    op.drop_index('ix_client_reminders_scheduled_at', 'client_reminders')
    op.drop_column('client_reminders', 'send_error')
    op.drop_column('client_reminders', 'email_address')
    op.drop_column('client_reminders', 'status')
    op.drop_column('client_reminders', 'sent_at')
    op.drop_column('client_reminders', 'scheduled_at')
    op.drop_column('client_reminders', 'variables')
    op.drop_column('client_reminders', 'template_id')
    op.drop_column('client_reminders', 'channel')
    
    # Drop escalation_events
    op.drop_index('ix_escalation_events_created_at', 'escalation_events')
    op.drop_index('ix_escalation_events_type', 'escalation_events')
    op.drop_index('ix_escalation_events_administration', 'escalation_events')
    op.drop_table('escalation_events')
    
    # Drop client_readiness_cache
    op.drop_index('ix_client_readiness_cache_computed_at', 'client_readiness_cache')
    op.drop_index('ix_client_readiness_cache_score', 'client_readiness_cache')
    op.drop_table('client_readiness_cache')
