"""026_add_payment_system

Add payment system tables for proper payment tracking.

Revision ID: 026_add_payment_system
Revises: 025_add_bookkeeping_audit_log
Create Date: 2026-02-10 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '026_add_payment_system'
down_revision = '025_add_bookkeeping_audit_log'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create payment_status enum
    payment_status_enum = postgresql.ENUM(
        'pending', 'completed', 'failed', 'reversed', 'cancelled',
        name='paymentstatus',
        create_type=True
    )
    payment_status_enum.create(op.get_bind(), checkfirst=True)
    
    # Create payment_method enum
    payment_method_enum = postgresql.ENUM(
        'bank_transfer', 'cash', 'card', 'ideal', 'other',
        name='paymentmethod',
        create_type=True
    )
    payment_method_enum.create(op.get_bind(), checkfirst=True)
    
    # Create zzp_payments table
    op.create_table(
        'zzp_payments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('customer_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('payment_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('payment_method', sa.String(length=50), nullable=False, server_default='bank_transfer'),
        sa.Column('reference', sa.String(length=255), nullable=True),
        sa.Column('bank_transaction_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='completed'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['customer_id'], ['zzp_customers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['bank_transaction_id'], ['bank_transactions.id'], ondelete='SET NULL'),
    )
    
    # Create indexes for zzp_payments
    op.create_index('ix_zzp_payments_administration_id', 'zzp_payments', ['administration_id'])
    op.create_index('ix_zzp_payments_customer_id', 'zzp_payments', ['customer_id'])
    op.create_index('ix_zzp_payments_payment_date', 'zzp_payments', ['payment_date'])
    op.create_index('ix_zzp_payments_reference', 'zzp_payments', ['reference'])
    op.create_index('ix_zzp_payments_bank_transaction_id', 'zzp_payments', ['bank_transaction_id'])
    op.create_index('ix_zzp_payments_status', 'zzp_payments', ['status'])
    
    # Create zzp_payment_allocations table
    op.create_table(
        'zzp_payment_allocations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('payment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('allocated_amount_cents', sa.Integer(), nullable=False),
        sa.Column('allocation_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['payment_id'], ['zzp_payments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['invoice_id'], ['zzp_invoices.id'], ondelete='CASCADE'),
    )
    
    # Create indexes for zzp_payment_allocations
    op.create_index('ix_zzp_payment_allocations_payment_id', 'zzp_payment_allocations', ['payment_id'])
    op.create_index('ix_zzp_payment_allocations_invoice_id', 'zzp_payment_allocations', ['invoice_id'])
    
    # Add trigger to update updated_at column for zzp_payments
    op.execute("""
        CREATE TRIGGER update_zzp_payments_updated_at
        BEFORE UPDATE ON zzp_payments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    """)


def downgrade() -> None:
    # Drop trigger
    op.execute("DROP TRIGGER IF EXISTS update_zzp_payments_updated_at ON zzp_payments")
    
    # Drop tables
    op.drop_index('ix_zzp_payment_allocations_invoice_id', table_name='zzp_payment_allocations')
    op.drop_index('ix_zzp_payment_allocations_payment_id', table_name='zzp_payment_allocations')
    op.drop_table('zzp_payment_allocations')
    
    op.drop_index('ix_zzp_payments_status', table_name='zzp_payments')
    op.drop_index('ix_zzp_payments_bank_transaction_id', table_name='zzp_payments')
    op.drop_index('ix_zzp_payments_reference', table_name='zzp_payments')
    op.drop_index('ix_zzp_payments_payment_date', table_name='zzp_payments')
    op.drop_index('ix_zzp_payments_customer_id', table_name='zzp_payments')
    op.drop_index('ix_zzp_payments_administration_id', table_name='zzp_payments')
    op.drop_table('zzp_payments')
    
    # Drop enums
    op.execute("DROP TYPE IF EXISTS paymentmethod")
    op.execute("DROP TYPE IF EXISTS paymentstatus")
