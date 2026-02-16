"""add accounting status fields to commitments

Revision ID: 034_commitment_accounting_status_fields
Revises: 033_commitment_ux_fields
Create Date: 2026-02-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '034_commitment_accounting_status_fields'
down_revision: Union[str, None] = '033_commitment_ux_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('financial_commitments', sa.Column('vat_rate', sa.Numeric(5, 2), nullable=True))
    op.add_column('financial_commitments', sa.Column('last_booked_date', sa.Date(), nullable=True))
    op.add_column('financial_commitments', sa.Column('auto_create_expense', sa.Boolean(), nullable=False, server_default=sa.text('false')))

    op.execute('UPDATE financial_commitments SET vat_rate = btw_rate WHERE vat_rate IS NULL AND btw_rate IS NOT NULL')


def downgrade() -> None:
    op.drop_column('financial_commitments', 'auto_create_expense')
    op.drop_column('financial_commitments', 'last_booked_date')
    op.drop_column('financial_commitments', 'vat_rate')
