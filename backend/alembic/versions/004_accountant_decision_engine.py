"""Accountant Decision Engine - Suggested actions and decisions

Revision ID: 004_accountant_decision_engine
Revises: 003_core_ledger_engine
Create Date: 2024-01-26 12:00:00.000000

This migration adds the Accountant Decision Engine:
- Suggested actions for detected issues
- Accountant decisions (approve/reject/override)
- Decision patterns for learning loop
- Audit trail for executed actions
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '004_accountant_decision_engine'
down_revision: Union[str, None] = '003_core_ledger_engine'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create action_type enum
    op.execute("""
        CREATE TYPE actiontype AS ENUM (
            'RECLASSIFY_TO_ASSET',
            'CREATE_DEPRECIATION',
            'CORRECT_VAT_RATE',
            'ALLOCATE_OPEN_ITEM',
            'FLAG_DOCUMENT_INVALID',
            'LOCK_PERIOD',
            'REVERSE_JOURNAL_ENTRY',
            'CREATE_ADJUSTMENT_ENTRY'
        )
    """)
    
    # Create decision enum
    op.execute("""
        CREATE TYPE decisiontype AS ENUM (
            'APPROVED',
            'REJECTED',
            'OVERRIDDEN'
        )
    """)
    
    # Create execution_status enum
    op.execute("""
        CREATE TYPE executionstatus AS ENUM (
            'PENDING',
            'EXECUTED',
            'FAILED',
            'ROLLED_BACK'
        )
    """)
    
    # Create suggested_actions table
    op.create_table(
        'suggested_actions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('issue_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action_type', postgresql.ENUM(
            'RECLASSIFY_TO_ASSET', 'CREATE_DEPRECIATION', 'CORRECT_VAT_RATE',
            'ALLOCATE_OPEN_ITEM', 'FLAG_DOCUMENT_INVALID', 'LOCK_PERIOD',
            'REVERSE_JOURNAL_ENTRY', 'CREATE_ADJUSTMENT_ENTRY',
            name='actiontype', create_type=False
        ), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=False),  # Human-readable why
        sa.Column('parameters', postgresql.JSONB(), nullable=True),  # Action-specific params
        sa.Column('confidence_score', sa.Numeric(5, 4), nullable=False, server_default='0.5000'),
        sa.Column('is_auto_suggested', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['issue_id'], ['client_issues.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_suggested_actions_issue', 'suggested_actions', ['issue_id'])
    op.create_index('ix_suggested_actions_type', 'suggested_actions', ['action_type'])
    
    # Create accountant_decisions table
    op.create_table(
        'accountant_decisions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('issue_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('suggested_action_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action_type', postgresql.ENUM(
            'RECLASSIFY_TO_ASSET', 'CREATE_DEPRECIATION', 'CORRECT_VAT_RATE',
            'ALLOCATE_OPEN_ITEM', 'FLAG_DOCUMENT_INVALID', 'LOCK_PERIOD',
            'REVERSE_JOURNAL_ENTRY', 'CREATE_ADJUSTMENT_ENTRY',
            name='actiontype', create_type=False
        ), nullable=False),
        sa.Column('decision', postgresql.ENUM(
            'APPROVED', 'REJECTED', 'OVERRIDDEN',
            name='decisiontype', create_type=False
        ), nullable=False),
        sa.Column('override_parameters', postgresql.JSONB(), nullable=True),  # For OVERRIDDEN
        sa.Column('notes', sa.Text(), nullable=True),  # Accountant notes
        sa.Column('decided_by_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('decided_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('execution_status', postgresql.ENUM(
            'PENDING', 'EXECUTED', 'FAILED', 'ROLLED_BACK',
            name='executionstatus', create_type=False
        ), nullable=False, server_default='PENDING'),
        sa.Column('executed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('execution_error', sa.Text(), nullable=True),
        sa.Column('result_journal_entry_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('is_reversible', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('reversed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reversed_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['issue_id'], ['client_issues.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['suggested_action_id'], ['suggested_actions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['decided_by_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['reversed_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['result_journal_entry_id'], ['journal_entries.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_accountant_decisions_issue', 'accountant_decisions', ['issue_id'])
    op.create_index('ix_accountant_decisions_decided_by', 'accountant_decisions', ['decided_by_id'])
    op.create_index('ix_accountant_decisions_status', 'accountant_decisions', ['execution_status'])
    
    # Create decision_patterns table for learning loop
    op.create_table(
        'decision_patterns',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('issue_code', sa.String(50), nullable=False),  # e.g., DEPRECIATION_NOT_POSTED
        sa.Column('action_type', postgresql.ENUM(
            'RECLASSIFY_TO_ASSET', 'CREATE_DEPRECIATION', 'CORRECT_VAT_RATE',
            'ALLOCATE_OPEN_ITEM', 'FLAG_DOCUMENT_INVALID', 'LOCK_PERIOD',
            'REVERSE_JOURNAL_ENTRY', 'CREATE_ADJUSTMENT_ENTRY',
            name='actiontype', create_type=False
        ), nullable=False),
        sa.Column('approval_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rejection_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('confidence_boost', sa.Numeric(5, 4), nullable=False, server_default='0.0000'),
        sa.Column('last_approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_rejected_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('administration_id', 'issue_code', 'action_type', name='uq_decision_pattern')
    )
    op.create_index('ix_decision_patterns_admin', 'decision_patterns', ['administration_id'])
    op.create_index('ix_decision_patterns_issue_code', 'decision_patterns', ['issue_code', 'action_type'])


def downgrade() -> None:
    op.drop_index('ix_decision_patterns_issue_code', table_name='decision_patterns')
    op.drop_index('ix_decision_patterns_admin', table_name='decision_patterns')
    op.drop_table('decision_patterns')
    
    op.drop_index('ix_accountant_decisions_status', table_name='accountant_decisions')
    op.drop_index('ix_accountant_decisions_decided_by', table_name='accountant_decisions')
    op.drop_index('ix_accountant_decisions_issue', table_name='accountant_decisions')
    op.drop_table('accountant_decisions')
    
    op.drop_index('ix_suggested_actions_type', table_name='suggested_actions')
    op.drop_index('ix_suggested_actions_issue', table_name='suggested_actions')
    op.drop_table('suggested_actions')
    
    op.execute("DROP TYPE executionstatus")
    op.execute("DROP TYPE decisiontype")
    op.execute("DROP TYPE actiontype")
