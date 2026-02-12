"""Add journal posted flag and source reference index

Revision ID: 028_add_journal_posting_flags
Revises: 027_add_time_entry_invoice_link
Create Date: 2026-02-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '028_add_journal_posting_flags'
down_revision: Union[str, None] = '027_add_time_entry_invoice_link'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'journal_entries',
        sa.Column('posted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    op.create_index(
        'ix_journal_entries_source_reference',
        'journal_entries',
        ['administration_id', 'source_type', 'source_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_journal_entries_source_reference', table_name='journal_entries')
    op.drop_column('journal_entries', 'posted')
