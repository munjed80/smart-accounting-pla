"""Period Control & Finalization Engine

Revision ID: 005_period_control_finalization
Revises: 004_accountant_decision_engine
Create Date: 2024-01-26 12:00:00.000000

This migration adds:
- Period status (OPEN, REVIEW, FINALIZED, LOCKED)
- Finalization tracking (finalized_at, finalized_by, locked_at, locked_by)
- Period snapshots for audit trail
- Period audit logs for legal safety
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '005_period_control_finalization'
down_revision: Union[str, None] = '004_accountant_decision_engine'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create period_status enum
    op.execute("CREATE TYPE periodstatus AS ENUM ('OPEN', 'REVIEW', 'FINALIZED', 'LOCKED')")
    
    # Add new columns to accounting_periods
    op.add_column('accounting_periods',
        sa.Column('status', postgresql.ENUM('OPEN', 'REVIEW', 'FINALIZED', 'LOCKED', 
                  name='periodstatus', create_type=False), 
                  nullable=False, server_default='OPEN')
    )
    op.add_column('accounting_periods',
        sa.Column('finalized_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column('accounting_periods',
        sa.Column('finalized_by_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.add_column('accounting_periods',
        sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column('accounting_periods',
        sa.Column('locked_by_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.add_column('accounting_periods',
        sa.Column('review_started_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column('accounting_periods',
        sa.Column('review_started_by_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    
    # Add foreign keys
    op.create_foreign_key(
        'fk_accounting_periods_finalized_by',
        'accounting_periods', 'users',
        ['finalized_by_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_accounting_periods_locked_by',
        'accounting_periods', 'users',
        ['locked_by_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_accounting_periods_review_started_by',
        'accounting_periods', 'users',
        ['review_started_by_id'], ['id'],
        ondelete='SET NULL'
    )
    
    # Create period_snapshots table
    op.create_table(
        'period_snapshots',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('period_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('snapshot_type', sa.String(20), nullable=False),  # FINALIZATION
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        # Financial data snapshots (stored as JSONB for immutability)
        sa.Column('balance_sheet', postgresql.JSONB, nullable=True),
        sa.Column('profit_and_loss', postgresql.JSONB, nullable=True),
        sa.Column('vat_summary', postgresql.JSONB, nullable=True),
        sa.Column('open_ar_balances', postgresql.JSONB, nullable=True),
        sa.Column('open_ap_balances', postgresql.JSONB, nullable=True),
        sa.Column('trial_balance', postgresql.JSONB, nullable=True),
        # Summary metrics
        sa.Column('total_assets', sa.Numeric(15, 2), nullable=True),
        sa.Column('total_liabilities', sa.Numeric(15, 2), nullable=True),
        sa.Column('total_equity', sa.Numeric(15, 2), nullable=True),
        sa.Column('net_income', sa.Numeric(15, 2), nullable=True),
        sa.Column('total_ar', sa.Numeric(15, 2), nullable=True),
        sa.Column('total_ap', sa.Numeric(15, 2), nullable=True),
        sa.Column('vat_payable', sa.Numeric(15, 2), nullable=True),
        sa.Column('vat_receivable', sa.Numeric(15, 2), nullable=True),
        # Issue acknowledgments
        sa.Column('acknowledged_yellow_issues', postgresql.JSONB, nullable=True),
        sa.Column('issue_summary', postgresql.JSONB, nullable=True),
        sa.ForeignKeyConstraint(['period_id'], ['accounting_periods.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_period_snapshots_period', 'period_snapshots', ['period_id'])
    op.create_index('ix_period_snapshots_admin', 'period_snapshots', ['administration_id'])
    
    # Create period_audit_logs table for full audit trail
    op.create_table(
        'period_audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('period_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),  # REVIEW_START, FINALIZE, LOCK, etc.
        sa.Column('from_status', sa.String(20), nullable=True),
        sa.Column('to_status', sa.String(20), nullable=False),
        sa.Column('performed_by_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('performed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('snapshot_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['period_id'], ['accounting_periods.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['performed_by_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['snapshot_id'], ['period_snapshots.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_period_audit_logs_period', 'period_audit_logs', ['period_id'])
    op.create_index('ix_period_audit_logs_admin', 'period_audit_logs', ['administration_id'])
    op.create_index('ix_period_audit_logs_performed_at', 'period_audit_logs', ['performed_at'])


def downgrade() -> None:
    op.drop_index('ix_period_audit_logs_performed_at', table_name='period_audit_logs')
    op.drop_index('ix_period_audit_logs_admin', table_name='period_audit_logs')
    op.drop_index('ix_period_audit_logs_period', table_name='period_audit_logs')
    op.drop_table('period_audit_logs')
    
    op.drop_index('ix_period_snapshots_admin', table_name='period_snapshots')
    op.drop_index('ix_period_snapshots_period', table_name='period_snapshots')
    op.drop_table('period_snapshots')
    
    op.drop_constraint('fk_accounting_periods_review_started_by', 'accounting_periods', type_='foreignkey')
    op.drop_constraint('fk_accounting_periods_locked_by', 'accounting_periods', type_='foreignkey')
    op.drop_constraint('fk_accounting_periods_finalized_by', 'accounting_periods', type_='foreignkey')
    
    op.drop_column('accounting_periods', 'review_started_by_id')
    op.drop_column('accounting_periods', 'review_started_at')
    op.drop_column('accounting_periods', 'locked_by_id')
    op.drop_column('accounting_periods', 'locked_at')
    op.drop_column('accounting_periods', 'finalized_by_id')
    op.drop_column('accounting_periods', 'finalized_at')
    op.drop_column('accounting_periods', 'status')
    
    op.execute("DROP TYPE periodstatus")
