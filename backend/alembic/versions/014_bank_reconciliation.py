"""Bank Import and Reconciliation

Adds tables for bank statement import and transaction reconciliation:
- bank_accounts: Bank account details per administration
- bank_transactions: Imported bank transactions with matching status
- reconciliation_actions: Audit trail for reconciliation decisions

Revision ID: 014_bank_reconciliation
Revises: 013_client_consent_workflow
Create Date: 2024-01-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '014_bank_reconciliation'
down_revision: Union[str, None] = '013_client_consent_workflow'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create bank_transaction_status enum
    op.execute("""
        CREATE TYPE banktransactionstatus AS ENUM (
            'NEW',
            'MATCHED',
            'IGNORED',
            'NEEDS_REVIEW'
        )
    """)
    
    # Create matched_type enum
    op.execute("""
        CREATE TYPE matchedtype AS ENUM (
            'INVOICE',
            'EXPENSE',
            'TRANSFER',
            'MANUAL'
        )
    """)
    
    # Create reconciliation_action_type enum
    op.execute("""
        CREATE TYPE reconciliationactiontype AS ENUM (
            'ACCEPT_MATCH',
            'IGNORE',
            'CREATE_EXPENSE',
            'LINK_INVOICE',
            'UNMATCH'
        )
    """)
    
    # Create bank_accounts table
    op.create_table(
        'bank_accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('iban', sa.String(34), nullable=False),
        sa.Column('bank_name', sa.String(255), nullable=True),
        sa.Column('currency', sa.String(3), nullable=False, server_default='EUR'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('administration_id', 'iban', name='uq_bank_account_admin_iban'),
    )
    
    op.create_index('ix_bank_accounts_administration', 'bank_accounts', ['administration_id'])
    op.create_index('ix_bank_accounts_iban', 'bank_accounts', ['iban'])
    
    # Create bank_transactions table
    op.create_table(
        'bank_transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('bank_account_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('booking_date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('counterparty_name', sa.String(255), nullable=True),
        sa.Column('counterparty_iban', sa.String(34), nullable=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('reference', sa.String(255), nullable=True),
        sa.Column('raw_hash', sa.String(64), nullable=False),  # SHA256 hash
        sa.Column(
            'status',
            postgresql.ENUM('NEW', 'MATCHED', 'IGNORED', 'NEEDS_REVIEW', name='banktransactionstatus', create_type=False),
            nullable=False,
            server_default='NEW'
        ),
        sa.Column(
            'matched_type',
            postgresql.ENUM('INVOICE', 'EXPENSE', 'TRANSFER', 'MANUAL', name='matchedtype', create_type=False),
            nullable=True
        ),
        sa.Column('matched_entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['bank_account_id'], ['bank_accounts.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('administration_id', 'raw_hash', name='uq_bank_transaction_admin_hash'),
    )
    
    op.create_index('ix_bank_transactions_administration', 'bank_transactions', ['administration_id'])
    op.create_index('ix_bank_transactions_bank_account', 'bank_transactions', ['bank_account_id'])
    op.create_index('ix_bank_transactions_booking_date', 'bank_transactions', ['booking_date'])
    op.create_index('ix_bank_transactions_status', 'bank_transactions', ['status'])
    op.create_index('ix_bank_transactions_raw_hash', 'bank_transactions', ['raw_hash'])
    
    # Create reconciliation_actions table
    op.create_table(
        'reconciliation_actions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('bank_transaction_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            'action',
            postgresql.ENUM('ACCEPT_MATCH', 'IGNORE', 'CREATE_EXPENSE', 'LINK_INVOICE', 'UNMATCH', name='reconciliationactiontype', create_type=False),
            nullable=False
        ),
        sa.Column('payload', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['bank_transaction_id'], ['bank_transactions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    
    op.create_index('ix_reconciliation_actions_bank_transaction', 'reconciliation_actions', ['bank_transaction_id'])
    op.create_index('ix_reconciliation_actions_user', 'reconciliation_actions', ['user_id'])
    op.create_index('ix_reconciliation_actions_created_at', 'reconciliation_actions', ['created_at'])


def downgrade() -> None:
    # Drop reconciliation_actions table
    op.drop_index('ix_reconciliation_actions_created_at', 'reconciliation_actions')
    op.drop_index('ix_reconciliation_actions_user', 'reconciliation_actions')
    op.drop_index('ix_reconciliation_actions_bank_transaction', 'reconciliation_actions')
    op.drop_table('reconciliation_actions')
    
    # Drop bank_transactions table
    op.drop_index('ix_bank_transactions_raw_hash', 'bank_transactions')
    op.drop_index('ix_bank_transactions_status', 'bank_transactions')
    op.drop_index('ix_bank_transactions_booking_date', 'bank_transactions')
    op.drop_index('ix_bank_transactions_bank_account', 'bank_transactions')
    op.drop_index('ix_bank_transactions_administration', 'bank_transactions')
    op.drop_table('bank_transactions')
    
    # Drop bank_accounts table
    op.drop_index('ix_bank_accounts_iban', 'bank_accounts')
    op.drop_index('ix_bank_accounts_administration', 'bank_accounts')
    op.drop_table('bank_accounts')
    
    # Drop enums
    op.execute('DROP TYPE reconciliationactiontype')
    op.execute('DROP TYPE matchedtype')
    op.execute('DROP TYPE banktransactionstatus')
