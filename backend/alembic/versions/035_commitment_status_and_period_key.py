"""add commitment lifecycle status and commitment expense idempotency key

Revision ID: 035_commitment_status_and_period_key
Revises: 034_commitment_accounting_status_fields
Create Date: 2026-02-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '035_commitment_status_and_period_key'
down_revision: Union[str, None] = '034_commitment_accounting_status_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


commitment_status_enum = postgresql.ENUM('active', 'paused', 'ended', name='commitmentstatus')


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commitmentstatus') THEN
                CREATE TYPE commitmentstatus AS ENUM ('active', 'paused', 'ended');
            END IF;
        END
        $$;
        """
    )

    op.add_column(
        'financial_commitments',
        sa.Column('status', commitment_status_enum, nullable=False, server_default=sa.text("'active'")),
    )

    op.add_column('zzp_expenses', sa.Column('period_key', sa.String(length=16), nullable=True))

    op.execute(
        """
        UPDATE zzp_expenses
        SET period_key = CASE
            WHEN commitment_id IS NULL THEN NULL
            WHEN EXISTS (
                SELECT 1 FROM financial_commitments fc
                WHERE fc.id = zzp_expenses.commitment_id
                  AND LOWER(fc.recurring_frequency::text) = 'yearly'
            ) THEN CONCAT(EXTRACT(YEAR FROM expense_date)::int, '-Y')
            ELSE to_char(expense_date, 'YYYY-MM')
        END
        """
    )

    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY administration_id, commitment_id, period_key
                       ORDER BY created_at ASC, id ASC
                   ) AS row_num
            FROM zzp_expenses
            WHERE commitment_id IS NOT NULL AND period_key IS NOT NULL
        )
        UPDATE zzp_expenses e
        SET period_key = CONCAT(e.period_key, '-DUP-', substring(e.id::text, 1, 8))
        FROM ranked r
        WHERE e.id = r.id AND r.row_num > 1
        """
    )

    op.create_index('ix_zzp_expenses_period_key', 'zzp_expenses', ['period_key'])
    op.create_index(
        'uq_zzp_expenses_admin_commitment_period_key',
        'zzp_expenses',
        ['administration_id', 'commitment_id', 'period_key'],
        unique=True,
        postgresql_where=sa.text('commitment_id IS NOT NULL AND period_key IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_zzp_expenses_admin_commitment_period_key', table_name='zzp_expenses')
    op.drop_index('ix_zzp_expenses_period_key', table_name='zzp_expenses')
    op.drop_column('zzp_expenses', 'period_key')

    op.drop_column('financial_commitments', 'status')

    commitment_status_enum.drop(op.get_bind(), checkfirst=True)
