"""link zzp_expenses to financial_commitments

Revision ID: 032_link_expenses_to_commitments
Revises: 031_add_financial_commitments
Create Date: 2026-02-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '032_link_expenses_to_commitments'
down_revision: Union[str, None] = '031_add_financial_commitments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'zzp_expenses',
        sa.Column('commitment_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('ix_zzp_expenses_commitment_id', 'zzp_expenses', ['commitment_id'])
    op.create_foreign_key(
        'fk_zzp_expenses_commitment_id',
        'zzp_expenses',
        'financial_commitments',
        ['commitment_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_zzp_expenses_commitment_id', 'zzp_expenses', type_='foreignkey')
    op.drop_index('ix_zzp_expenses_commitment_id', table_name='zzp_expenses')
    op.drop_column('zzp_expenses', 'commitment_id')
