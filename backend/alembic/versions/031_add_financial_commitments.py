"""add financial commitments table for zzp obligations

Revision ID: 031_add_financial_commitments
Revises: 030_super_admin_subscriptions
Create Date: 2026-02-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '031_add_financial_commitments'
down_revision: Union[str, None] = '6681ce17afc5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    recurring_frequency = sa.Enum('monthly', 'yearly', name='recurringfrequency')

    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commitmenttype') THEN
            CREATE TYPE commitmenttype AS ENUM ('lease', 'loan', 'subscription');
        END IF;
    END$$;
    """)

    recurring_frequency.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'financial_commitments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.Enum('lease', 'loan', 'subscription', name='commitmenttype', create_type=False), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('monthly_payment_cents', sa.Integer(), nullable=True),
        sa.Column('principal_amount_cents', sa.Integer(), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('renewal_date', sa.Date(), nullable=True),
        sa.Column('contract_term_months', sa.Integer(), nullable=True),
        sa.Column('interest_rate', sa.Numeric(6, 3), nullable=True),
        sa.Column('recurring_frequency', recurring_frequency, nullable=True),
        sa.Column('btw_rate', sa.Numeric(5, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_financial_commitments_administration_id', 'financial_commitments', ['administration_id'])
    op.create_index('ix_financial_commitments_type', 'financial_commitments', ['type'])


def downgrade() -> None:
    op.drop_index('ix_financial_commitments_type', table_name='financial_commitments')
    op.drop_index('ix_financial_commitments_administration_id', table_name='financial_commitments')
    op.drop_table('financial_commitments')

    # Keep enum types in place to avoid breaking dependencies from other migrations/tables.
