"""Core Ledger Engine - Journal entries, subledgers, fixed assets, and issues

Revision ID: 003_core_ledger_engine
Revises: 002_add_idempotency_constraints
Create Date: 2024-01-26 00:00:00.000000

This migration adds the core accounting backbone:
- Journal entries with double-entry enforcement
- Subledgers for AR (receivables) and AP (payables)
- Fixed assets with depreciation schedules
- Client issues for consistency tracking
- Period boundaries for reporting
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '003_core_ledger_engine'
down_revision: Union[str, None] = '002_add_idempotency_constraints'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add control account flags and subtype to chart_of_accounts
    op.add_column('chart_of_accounts', 
        sa.Column('is_control_account', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column('chart_of_accounts',
        sa.Column('control_type', sa.String(20), nullable=True)  # AR, AP, BANK, VAT
    )
    
    # Create accounting_periods table
    op.create_table(
        'accounting_periods',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),  # e.g., "2024-Q1", "2024"
        sa.Column('period_type', sa.String(20), nullable=False),  # MONTH, QUARTER, YEAR
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_closed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_accounting_periods_admin_dates', 'accounting_periods', 
                    ['administration_id', 'start_date', 'end_date'])
    
    # Create journal_entry_status enum
    op.execute("CREATE TYPE journalentrystatus AS ENUM ('DRAFT', 'POSTED', 'REVERSED')")
    
    # Create journal_entries table (header)
    op.create_table(
        'journal_entries',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('period_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('entry_number', sa.String(50), nullable=False),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('reference', sa.String(100), nullable=True),  # External reference
        sa.Column('status', postgresql.ENUM('DRAFT', 'POSTED', 'REVERSED', name='journalentrystatus', create_type=False), 
                  nullable=False, server_default='DRAFT'),
        sa.Column('total_debit', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('total_credit', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('is_balanced', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('source_type', sa.String(50), nullable=True),  # MANUAL, INVOICE, ASSET_DEPRECIATION, etc.
        sa.Column('source_id', postgresql.UUID(as_uuid=True), nullable=True),  # ID of source entity
        sa.Column('reversed_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('reverses_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('posted_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['period_id'], ['accounting_periods.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['posted_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reversed_by_id'], ['journal_entries.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reverses_id'], ['journal_entries.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_journal_entries_admin_date', 'journal_entries', 
                    ['administration_id', 'entry_date'])
    op.create_index('ix_journal_entries_entry_number', 'journal_entries', 
                    ['administration_id', 'entry_number'], unique=True)
    
    # Create journal_lines table
    op.create_table(
        'journal_lines',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('journal_entry_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('line_number', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('debit_amount', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('credit_amount', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('vat_code_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('vat_amount', sa.Numeric(15, 2), nullable=True),
        sa.Column('taxable_amount', sa.Numeric(15, 2), nullable=True),
        # Subledger references
        sa.Column('party_type', sa.String(20), nullable=True),  # CUSTOMER, SUPPLIER
        sa.Column('party_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['account_id'], ['chart_of_accounts.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['vat_code_id'], ['vat_codes.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_journal_lines_entry', 'journal_lines', ['journal_entry_id'])
    op.create_index('ix_journal_lines_account', 'journal_lines', ['account_id'])
    
    # Create parties table (customers/suppliers for subledger)
    op.create_table(
        'parties',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('party_type', sa.String(20), nullable=False),  # CUSTOMER, SUPPLIER
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('code', sa.String(50), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('tax_number', sa.String(50), nullable=True),  # BTW number
        sa.Column('kvk_number', sa.String(50), nullable=True),
        sa.Column('payment_terms_days', sa.Integer(), nullable=True, server_default='30'),
        sa.Column('default_account_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['default_account_id'], ['chart_of_accounts.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_parties_admin_type', 'parties', ['administration_id', 'party_type'])
    
    # Create open_items table (for AR/AP tracking)
    op.execute("CREATE TYPE openitemstatus AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'WRITTEN_OFF')")
    
    op.create_table(
        'open_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('party_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('journal_entry_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('journal_line_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('item_type', sa.String(20), nullable=False),  # RECEIVABLE, PAYABLE
        sa.Column('document_number', sa.String(100), nullable=True),
        sa.Column('document_date', sa.Date(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('original_amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('paid_amount', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('open_amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, server_default='EUR'),
        sa.Column('status', postgresql.ENUM('OPEN', 'PARTIAL', 'PAID', 'WRITTEN_OFF', name='openitemstatus', create_type=False),
                  nullable=False, server_default='OPEN'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['party_id'], ['parties.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['journal_line_id'], ['journal_lines.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_open_items_admin_type_status', 'open_items', 
                    ['administration_id', 'item_type', 'status'])
    op.create_index('ix_open_items_party', 'open_items', ['party_id'])
    
    # Create open_item_allocations table (for payment matching)
    op.create_table(
        'open_item_allocations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('open_item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('payment_journal_entry_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('allocated_amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('allocation_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['open_item_id'], ['open_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['payment_journal_entry_id'], ['journal_entries.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create fixed_assets table
    op.execute("CREATE TYPE assetstatus AS ENUM ('ACTIVE', 'DISPOSED', 'FULLY_DEPRECIATED')")
    
    op.create_table(
        'fixed_assets',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('asset_code', sa.String(50), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(100), nullable=True),  # Equipment, Vehicle, etc.
        sa.Column('acquisition_date', sa.Date(), nullable=False),
        sa.Column('acquisition_cost', sa.Numeric(15, 2), nullable=False),
        sa.Column('residual_value', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('useful_life_months', sa.Integer(), nullable=False),
        sa.Column('depreciation_method', sa.String(50), nullable=False, server_default='STRAIGHT_LINE'),
        sa.Column('asset_account_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('depreciation_account_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('expense_account_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('accumulated_depreciation', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('book_value', sa.Numeric(15, 2), nullable=False),
        sa.Column('status', postgresql.ENUM('ACTIVE', 'DISPOSED', 'FULLY_DEPRECIATED', name='assetstatus', create_type=False),
                  nullable=False, server_default='ACTIVE'),
        sa.Column('disposal_date', sa.Date(), nullable=True),
        sa.Column('disposal_amount', sa.Numeric(15, 2), nullable=True),
        sa.Column('purchase_journal_entry_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['asset_account_id'], ['chart_of_accounts.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['depreciation_account_id'], ['chart_of_accounts.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['expense_account_id'], ['chart_of_accounts.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['purchase_journal_entry_id'], ['journal_entries.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_fixed_assets_admin', 'fixed_assets', ['administration_id'])
    op.create_index('ix_fixed_assets_code', 'fixed_assets', 
                    ['administration_id', 'asset_code'], unique=True)
    
    # Create depreciation_schedules table
    op.create_table(
        'depreciation_schedules',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('fixed_asset_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('period_date', sa.Date(), nullable=False),  # First day of period
        sa.Column('depreciation_amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('accumulated_depreciation', sa.Numeric(15, 2), nullable=False),
        sa.Column('book_value_end', sa.Numeric(15, 2), nullable=False),
        sa.Column('journal_entry_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('is_posted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['fixed_asset_id'], ['fixed_assets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_depreciation_schedules_asset_date', 'depreciation_schedules', 
                    ['fixed_asset_id', 'period_date'])
    
    # Create issue_severity and issue_category enums
    op.execute("CREATE TYPE issueseverity AS ENUM ('RED', 'YELLOW')")
    
    # Create client_issues table for consistency tracking
    op.create_table(
        'client_issues',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('issue_code', sa.String(50), nullable=False),
        sa.Column('severity', postgresql.ENUM('RED', 'YELLOW', name='issueseverity', create_type=False), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('why', sa.Text(), nullable=True),
        sa.Column('suggested_action', sa.Text(), nullable=True),
        # References
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('journal_entry_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('fixed_asset_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('party_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('open_item_id', postgresql.UUID(as_uuid=True), nullable=True),
        # Metadata
        sa.Column('amount_discrepancy', sa.Numeric(15, 2), nullable=True),
        sa.Column('is_resolved', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['account_id'], ['chart_of_accounts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['fixed_asset_id'], ['fixed_assets.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['party_id'], ['parties.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['open_item_id'], ['open_items.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['resolved_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_client_issues_admin_resolved', 'client_issues', 
                    ['administration_id', 'is_resolved'])
    op.create_index('ix_client_issues_code', 'client_issues', 
                    ['administration_id', 'issue_code'])
    
    # Create validation_runs table for tracking recalculations
    op.create_table(
        'validation_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('triggered_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('issues_found', sa.Integer(), nullable=True),
        sa.Column('issues_resolved', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='RUNNING'),  # RUNNING, COMPLETED, FAILED
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['triggered_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('validation_runs')
    op.drop_index('ix_client_issues_code', table_name='client_issues')
    op.drop_index('ix_client_issues_admin_resolved', table_name='client_issues')
    op.drop_table('client_issues')
    op.execute("DROP TYPE issueseverity")
    op.drop_index('ix_depreciation_schedules_asset_date', table_name='depreciation_schedules')
    op.drop_table('depreciation_schedules')
    op.drop_index('ix_fixed_assets_code', table_name='fixed_assets')
    op.drop_index('ix_fixed_assets_admin', table_name='fixed_assets')
    op.drop_table('fixed_assets')
    op.execute("DROP TYPE assetstatus")
    op.drop_table('open_item_allocations')
    op.drop_index('ix_open_items_party', table_name='open_items')
    op.drop_index('ix_open_items_admin_type_status', table_name='open_items')
    op.drop_table('open_items')
    op.execute("DROP TYPE openitemstatus")
    op.drop_index('ix_parties_admin_type', table_name='parties')
    op.drop_table('parties')
    op.drop_index('ix_journal_lines_account', table_name='journal_lines')
    op.drop_index('ix_journal_lines_entry', table_name='journal_lines')
    op.drop_table('journal_lines')
    op.drop_index('ix_journal_entries_entry_number', table_name='journal_entries')
    op.drop_index('ix_journal_entries_admin_date', table_name='journal_entries')
    op.drop_table('journal_entries')
    op.execute("DROP TYPE journalentrystatus")
    op.drop_index('ix_accounting_periods_admin_dates', table_name='accounting_periods')
    op.drop_table('accounting_periods')
    op.drop_column('chart_of_accounts', 'control_type')
    op.drop_column('chart_of_accounts', 'is_control_account')
