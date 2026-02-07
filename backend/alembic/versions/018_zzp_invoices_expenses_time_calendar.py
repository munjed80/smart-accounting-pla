"""Add ZZP invoices, expenses, time entries, and calendar events tables

Revision ID: 018_zzp_invoices_expenses_time_calendar
Revises: 017_business_profiles
Create Date: 2026-02-07

This migration creates tables for the full ZZP portal:
- zzp_invoices: Invoice headers with seller/customer snapshots
- zzp_invoice_lines: Invoice line items
- zzp_invoice_counters: Race-safe invoice number generation
- zzp_expenses: Expense tracking
- zzp_time_entries: Time tracking
- zzp_calendar_events: Calendar/agenda events

All tables are scoped to administration_id for multi-tenant isolation.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '018_zzp_invoices_expenses_time_calendar'
down_revision: Union[str, None] = '017_business_profiles'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ==========================================================================
    # ZZP Invoices Table
    # ==========================================================================
    op.create_table(
        'zzp_invoices',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('customer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('zzp_customers.id', ondelete='RESTRICT'), nullable=False),
        
        # Invoice number
        sa.Column('invoice_number', sa.String(50), nullable=False),
        
        # Status
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        
        # Dates
        sa.Column('issue_date', sa.Date(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=True),
        
        # Seller snapshot
        sa.Column('seller_company_name', sa.String(255), nullable=True),
        sa.Column('seller_trading_name', sa.String(255), nullable=True),
        sa.Column('seller_address_street', sa.String(500), nullable=True),
        sa.Column('seller_address_postal_code', sa.String(20), nullable=True),
        sa.Column('seller_address_city', sa.String(100), nullable=True),
        sa.Column('seller_address_country', sa.String(100), nullable=True),
        sa.Column('seller_kvk_number', sa.String(20), nullable=True),
        sa.Column('seller_btw_number', sa.String(30), nullable=True),
        sa.Column('seller_iban', sa.String(34), nullable=True),
        sa.Column('seller_email', sa.String(255), nullable=True),
        sa.Column('seller_phone', sa.String(50), nullable=True),
        
        # Customer snapshot
        sa.Column('customer_name', sa.String(255), nullable=True),
        sa.Column('customer_address_street', sa.String(500), nullable=True),
        sa.Column('customer_address_postal_code', sa.String(20), nullable=True),
        sa.Column('customer_address_city', sa.String(100), nullable=True),
        sa.Column('customer_address_country', sa.String(100), nullable=True),
        sa.Column('customer_kvk_number', sa.String(20), nullable=True),
        sa.Column('customer_btw_number', sa.String(30), nullable=True),
        
        # Totals
        sa.Column('subtotal_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('vat_total_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_cents', sa.Integer(), nullable=False, server_default='0'),
        
        # Notes
        sa.Column('notes', sa.Text(), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    
    # Indexes for invoices
    op.create_index('ix_zzp_invoices_administration_id', 'zzp_invoices', ['administration_id'])
    op.create_index('ix_zzp_invoices_customer_id', 'zzp_invoices', ['customer_id'])
    op.create_index('ix_zzp_invoices_invoice_number', 'zzp_invoices', ['invoice_number'])
    op.create_index('ix_zzp_invoices_status', 'zzp_invoices', ['status'])
    
    # Unique constraint: invoice_number unique per administration
    op.create_index('ix_zzp_invoices_admin_number_unique', 'zzp_invoices', ['administration_id', 'invoice_number'], unique=True)
    
    # ==========================================================================
    # ZZP Invoice Lines Table
    # ==========================================================================
    op.create_table(
        'zzp_invoice_lines',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('zzp_invoices.id', ondelete='CASCADE'), nullable=False),
        
        # Line details
        sa.Column('line_number', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('description', sa.String(500), nullable=False),
        sa.Column('quantity', sa.Numeric(10, 2), nullable=False, server_default='1'),
        sa.Column('unit_price_cents', sa.Integer(), nullable=False),
        sa.Column('vat_rate', sa.Numeric(5, 2), nullable=False, server_default='21'),
        
        # Calculated totals
        sa.Column('line_total_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('vat_amount_cents', sa.Integer(), nullable=False, server_default='0'),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    
    # Indexes for invoice lines
    op.create_index('ix_zzp_invoice_lines_invoice_id', 'zzp_invoice_lines', ['invoice_id'])
    
    # ==========================================================================
    # ZZP Invoice Counters Table (for race-safe invoice number generation)
    # ==========================================================================
    op.create_table(
        'zzp_invoice_counters',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False, unique=True),
        
        # Counter
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('counter', sa.Integer(), nullable=False, server_default='0'),
        
        # Timestamps
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    
    # Index for counter
    op.create_index('ix_zzp_invoice_counters_administration_id', 'zzp_invoice_counters', ['administration_id'], unique=True)
    
    # ==========================================================================
    # ZZP Expenses Table
    # ==========================================================================
    op.create_table(
        'zzp_expenses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        
        # Expense details
        sa.Column('vendor', sa.String(255), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('expense_date', sa.Date(), nullable=False),
        
        # Amount and VAT
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('vat_rate', sa.Numeric(5, 2), nullable=False, server_default='21'),
        sa.Column('vat_amount_cents', sa.Integer(), nullable=False, server_default='0'),
        
        # Category
        sa.Column('category', sa.String(100), nullable=False, server_default='algemeen'),
        
        # Optional
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('attachment_url', sa.String(500), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    
    # Indexes for expenses
    op.create_index('ix_zzp_expenses_administration_id', 'zzp_expenses', ['administration_id'])
    op.create_index('ix_zzp_expenses_expense_date', 'zzp_expenses', ['expense_date'])
    op.create_index('ix_zzp_expenses_category', 'zzp_expenses', ['category'])
    op.create_index('ix_zzp_expenses_vendor', 'zzp_expenses', ['vendor'])
    
    # ==========================================================================
    # ZZP Time Entries Table
    # ==========================================================================
    op.create_table(
        'zzp_time_entries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        
        # Time entry details
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('description', sa.String(500), nullable=False),
        sa.Column('hours', sa.Numeric(5, 2), nullable=False),
        
        # Project/client reference
        sa.Column('project_name', sa.String(255), nullable=True),
        sa.Column('customer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('zzp_customers.id', ondelete='SET NULL'), nullable=True),
        
        # Billing
        sa.Column('hourly_rate_cents', sa.Integer(), nullable=True),
        sa.Column('billable', sa.Boolean(), nullable=False, server_default='true'),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    
    # Indexes for time entries
    op.create_index('ix_zzp_time_entries_administration_id', 'zzp_time_entries', ['administration_id'])
    op.create_index('ix_zzp_time_entries_entry_date', 'zzp_time_entries', ['entry_date'])
    op.create_index('ix_zzp_time_entries_project_name', 'zzp_time_entries', ['project_name'])
    op.create_index('ix_zzp_time_entries_customer_id', 'zzp_time_entries', ['customer_id'])
    op.create_index('ix_zzp_time_entries_billable', 'zzp_time_entries', ['billable'])
    
    # ==========================================================================
    # ZZP Calendar Events Table
    # ==========================================================================
    op.create_table(
        'zzp_calendar_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        
        # Event details
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('start_datetime', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_datetime', sa.DateTime(timezone=True), nullable=False),
        
        # Optional
        sa.Column('location', sa.String(500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    
    # Indexes for calendar events
    op.create_index('ix_zzp_calendar_events_administration_id', 'zzp_calendar_events', ['administration_id'])
    op.create_index('ix_zzp_calendar_events_start_datetime', 'zzp_calendar_events', ['start_datetime'])


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign key dependencies)
    
    # Calendar events
    op.drop_index('ix_zzp_calendar_events_start_datetime', table_name='zzp_calendar_events')
    op.drop_index('ix_zzp_calendar_events_administration_id', table_name='zzp_calendar_events')
    op.drop_table('zzp_calendar_events')
    
    # Time entries
    op.drop_index('ix_zzp_time_entries_billable', table_name='zzp_time_entries')
    op.drop_index('ix_zzp_time_entries_customer_id', table_name='zzp_time_entries')
    op.drop_index('ix_zzp_time_entries_project_name', table_name='zzp_time_entries')
    op.drop_index('ix_zzp_time_entries_entry_date', table_name='zzp_time_entries')
    op.drop_index('ix_zzp_time_entries_administration_id', table_name='zzp_time_entries')
    op.drop_table('zzp_time_entries')
    
    # Expenses
    op.drop_index('ix_zzp_expenses_vendor', table_name='zzp_expenses')
    op.drop_index('ix_zzp_expenses_category', table_name='zzp_expenses')
    op.drop_index('ix_zzp_expenses_expense_date', table_name='zzp_expenses')
    op.drop_index('ix_zzp_expenses_administration_id', table_name='zzp_expenses')
    op.drop_table('zzp_expenses')
    
    # Invoice counters
    op.drop_index('ix_zzp_invoice_counters_administration_id', table_name='zzp_invoice_counters')
    op.drop_table('zzp_invoice_counters')
    
    # Invoice lines
    op.drop_index('ix_zzp_invoice_lines_invoice_id', table_name='zzp_invoice_lines')
    op.drop_table('zzp_invoice_lines')
    
    # Invoices
    op.drop_index('ix_zzp_invoices_admin_number_unique', table_name='zzp_invoices')
    op.drop_index('ix_zzp_invoices_status', table_name='zzp_invoices')
    op.drop_index('ix_zzp_invoices_invoice_number', table_name='zzp_invoices')
    op.drop_index('ix_zzp_invoices_customer_id', table_name='zzp_invoices')
    op.drop_index('ix_zzp_invoices_administration_id', table_name='zzp_invoices')
    op.drop_table('zzp_invoices')
