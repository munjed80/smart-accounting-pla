"""add ux-focused fields to financial commitments

Revision ID: 033_commitment_ux_fields
Revises: 032_link_expenses_to_commitments
Create Date: 2026-02-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '033_commitment_ux_fields'
down_revision: Union[str, None] = '032_link_expenses_to_commitments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('financial_commitments', sa.Column('payment_day', sa.Integer(), nullable=True))
    op.add_column('financial_commitments', sa.Column('provider', sa.String(length=255), nullable=True))
    op.add_column('financial_commitments', sa.Column('contract_number', sa.String(length=255), nullable=True))
    op.add_column('financial_commitments', sa.Column('notice_period_days', sa.Integer(), nullable=True))
    op.add_column('financial_commitments', sa.Column('auto_renew', sa.Boolean(), nullable=False, server_default=sa.text('true')))


def downgrade() -> None:
    op.drop_column('financial_commitments', 'auto_renew')
    op.drop_column('financial_commitments', 'notice_period_days')
    op.drop_column('financial_commitments', 'contract_number')
    op.drop_column('financial_commitments', 'provider')
    op.drop_column('financial_commitments', 'payment_day')
