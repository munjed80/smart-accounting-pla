"""add categorization_rules table for per-user learning

Revision ID: 052_categorization_rules
Revises: 051_renew_free_trials
Create Date: 2026-04-11 21:30:00.000000

New table: categorization_rules
Stores learned categorization patterns based on user reconciliation decisions.
Used to auto-suggest ledger accounts for future bank transactions from the
same counterparty (by name, IBAN, or description keyword).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = '052_categorization_rules'
down_revision = '051_renew_free_trials'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'categorization_rules',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('match_type', sa.Enum('counterparty_name', 'counterparty_iban', 'description_keyword', name='categorizationrulematchtype'), nullable=False),
        sa.Column('match_value', sa.String(300), nullable=False),
        sa.Column('ledger_account_id', UUID(as_uuid=True), sa.ForeignKey('chart_of_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('category_nl', sa.String(255), nullable=False),
        sa.Column('confidence', sa.Integer, nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Index for fast rule lookups by administration + match_type + match_value
    op.create_index(
        'ix_categorization_rules_admin_match',
        'categorization_rules',
        ['administration_id', 'match_type', 'match_value'],
    )


def downgrade() -> None:
    op.drop_index('ix_categorization_rules_admin_match', table_name='categorization_rules')
    op.drop_table('categorization_rules')
    op.execute("DROP TYPE IF EXISTS categorizationrulematchtype")
