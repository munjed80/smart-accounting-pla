"""add subscription phase 1 fields for ZZP subscription management

Revision ID: 044_add_subscription_phase1_fields
Revises: 043_add_certificates_table
Create Date: 2026-02-18 13:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '044_add_subscription_phase1_fields'
down_revision = '043_add_certificates_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new fields to plans table
    op.add_column('plans', sa.Column('code', sa.String(length=64), nullable=True))
    op.add_column('plans', sa.Column('trial_days', sa.Integer(), nullable=False, server_default='30'))
    
    # Create unique index on code
    op.create_index('ix_plans_code', 'plans', ['code'], unique=True)
    
    # Backfill code from name for existing plans (make lowercase, replace spaces with underscores)
    op.execute("UPDATE plans SET code = LOWER(REPLACE(name, ' ', '_')) WHERE code IS NULL")
    
    # Make code NOT NULL after backfill
    op.alter_column('plans', 'code', nullable=False)
    
    # Add new fields to subscriptions table
    op.add_column('subscriptions', sa.Column('plan_code', sa.String(length=64), nullable=True))
    op.add_column('subscriptions', sa.Column('trial_start_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('subscriptions', sa.Column('trial_end_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('subscriptions', sa.Column('current_period_start', sa.DateTime(timezone=True), nullable=True))
    op.add_column('subscriptions', sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True))
    op.add_column('subscriptions', sa.Column('cancel_at_period_end', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('subscriptions', sa.Column('provider', sa.String(length=50), nullable=True))
    op.add_column('subscriptions', sa.Column('provider_customer_id', sa.String(length=255), nullable=True))
    op.add_column('subscriptions', sa.Column('provider_subscription_id', sa.String(length=255), nullable=True))
    
    # Create index on plan_code
    op.create_index('ix_subscriptions_plan_code', 'subscriptions', ['plan_code'])
    
    # Backfill plan_code from plan relationship for existing subscriptions
    op.execute("""
        UPDATE subscriptions s
        SET plan_code = p.code
        FROM plans p
        WHERE s.plan_id = p.id AND s.plan_code IS NULL
    """)
    
    # Make plan_code NOT NULL after backfill
    op.alter_column('subscriptions', 'plan_code', nullable=False)
    
    # Create subscription status enum type
    # First, rename the old status column temporarily
    op.alter_column('subscriptions', 'status', new_column_name='status_old')
    
    # Create the new enum type
    subscription_status_enum = postgresql.ENUM(
        'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED',
        name='subscriptionstatus',
        create_type=True
    )
    subscription_status_enum.create(op.get_bind(), checkfirst=True)
    
    # Add new status column with enum type
    op.add_column('subscriptions', sa.Column(
        'status',
        postgresql.ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', name='subscriptionstatus'),
        nullable=True
    ))
    
    # Migrate old status values to new enum values
    # Mapping: trial -> TRIALING, active -> ACTIVE, cancelled/canceled -> CANCELED, expired -> EXPIRED
    op.execute("""
        UPDATE subscriptions
        SET status = CASE
            WHEN status_old = 'trial' THEN 'TRIALING'::subscriptionstatus
            WHEN status_old = 'active' THEN 'ACTIVE'::subscriptionstatus
            WHEN status_old IN ('cancelled', 'canceled') THEN 'CANCELED'::subscriptionstatus
            WHEN status_old = 'expired' THEN 'EXPIRED'::subscriptionstatus
            WHEN status_old = 'past_due' THEN 'PAST_DUE'::subscriptionstatus
            ELSE 'TRIALING'::subscriptionstatus
        END
    """)
    
    # Make new status NOT NULL after migration
    op.alter_column('subscriptions', 'status', nullable=False)
    
    # Drop old status column
    op.drop_column('subscriptions', 'status_old')
    
    # Recreate the status index
    op.create_index('ix_subscriptions_status', 'subscriptions', ['status'])


def downgrade() -> None:
    # Drop new indexes
    op.drop_index('ix_subscriptions_status', table_name='subscriptions')
    op.drop_index('ix_subscriptions_plan_code', table_name='subscriptions')
    op.drop_index('ix_plans_code', table_name='plans')
    
    # Revert status column to string
    op.alter_column('subscriptions', 'status', new_column_name='status_enum')
    op.add_column('subscriptions', sa.Column('status', sa.String(length=20), nullable=True))
    
    # Migrate enum values back to strings
    op.execute("""
        UPDATE subscriptions
        SET status = CASE
            WHEN status_enum::text = 'TRIALING' THEN 'trial'
            WHEN status_enum::text = 'ACTIVE' THEN 'active'
            WHEN status_enum::text = 'CANCELED' THEN 'canceled'
            WHEN status_enum::text = 'EXPIRED' THEN 'expired'
            WHEN status_enum::text = 'PAST_DUE' THEN 'past_due'
            ELSE 'trial'
        END
    """)
    
    op.alter_column('subscriptions', 'status', nullable=False)
    op.drop_column('subscriptions', 'status_enum')
    
    # Drop enum type
    op.execute('DROP TYPE subscriptionstatus')
    
    # Recreate status index
    op.create_index('ix_subscriptions_status', 'subscriptions', ['status'])
    
    # Drop new columns from subscriptions
    op.drop_column('subscriptions', 'provider_subscription_id')
    op.drop_column('subscriptions', 'provider_customer_id')
    op.drop_column('subscriptions', 'provider')
    op.drop_column('subscriptions', 'cancel_at_period_end')
    op.drop_column('subscriptions', 'current_period_end')
    op.drop_column('subscriptions', 'current_period_start')
    op.drop_column('subscriptions', 'trial_end_at')
    op.drop_column('subscriptions', 'trial_start_at')
    op.drop_column('subscriptions', 'plan_code')
    
    # Drop new columns from plans
    op.drop_column('plans', 'trial_days')
    op.drop_column('plans', 'code')
