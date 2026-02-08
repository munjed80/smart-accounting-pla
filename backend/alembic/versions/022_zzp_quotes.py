"""Add ZZP quotes (offertes) tables

Revision ID: 022_zzp_quotes
Revises: 021_zzp_bank_payments
Create Date: 2026-02-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '022_zzp_quotes'
down_revision = '021_zzp_bank_payments'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create quote counter table
    op.create_table(
        'zzp_quote_counters',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('administrations.id', ondelete='CASCADE'),
                  nullable=False, unique=True, index=True),
        sa.Column('current_year', sa.Integer(), nullable=False),
        sa.Column('current_sequence', sa.Integer(), nullable=False, default=0),
    )
    
    # Create quotes table
    op.create_table(
        'zzp_quotes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('administrations.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('customer_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('zzp_customers.id', ondelete='RESTRICT'),
                  nullable=False, index=True),
        sa.Column('quote_number', sa.String(50), nullable=False, index=True),
        sa.Column('status', sa.String(20), nullable=False, default='draft', index=True),
        sa.Column('issue_date', sa.Date(), nullable=False),
        sa.Column('valid_until', sa.Date(), nullable=True),
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('zzp_invoices.id', ondelete='SET NULL'),
                  nullable=True, index=True),
        
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
        sa.Column('subtotal_cents', sa.Integer(), nullable=False, default=0),
        sa.Column('vat_total_cents', sa.Integer(), nullable=False, default=0),
        sa.Column('total_cents', sa.Integer(), nullable=False, default=0),
        
        # Content
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('terms', sa.Text(), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    
    # Create quote lines table
    op.create_table(
        'zzp_quote_lines',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('quote_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('zzp_quotes.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('line_number', sa.Integer(), nullable=False, default=1),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('quantity', sa.Numeric(10, 2), nullable=False, default=1.00),
        sa.Column('unit_price_cents', sa.Integer(), nullable=False),
        sa.Column('vat_rate', sa.Numeric(5, 2), nullable=False, default=21.00),
        sa.Column('vat_amount_cents', sa.Integer(), nullable=False, default=0),
        sa.Column('line_total_cents', sa.Integer(), nullable=False, default=0),
    )


def downgrade() -> None:
    op.drop_table('zzp_quote_lines')
    op.drop_table('zzp_quotes')
    op.drop_table('zzp_quote_counters')
