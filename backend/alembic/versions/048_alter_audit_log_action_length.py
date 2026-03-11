"""alter audit_log.action column length from 20 to 100

Revision ID: 048_alter_audit_log_action_length
Revises: 047_add_zzp_documents
Create Date: 2026-03-11 20:00:00.000000

Root cause: audit_log.action was VARCHAR(20), which is too short for action
strings like "SUBSCRIPTION_CHECKOUT_CREATED" (29 chars), causing DB commit
failures in the subscription activate flow.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '048_alter_audit_log_action_length'
down_revision = '047_add_zzp_documents'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Increase audit_log.action column length from VARCHAR(20) to VARCHAR(100)."""
    op.alter_column(
        'audit_log',
        'action',
        existing_type=sa.String(20),
        type_=sa.String(100),
        existing_nullable=False,
        nullable=False,
    )


def downgrade() -> None:
    """Revert audit_log.action column length back to VARCHAR(20).

    WARNING: This downgrade will fail if any existing rows contain action
    values longer than 20 characters (e.g. 'SUBSCRIPTION_CHECKOUT_CREATED').
    Truncate or remove such rows before running this downgrade.
    """
    op.alter_column(
        'audit_log',
        'action',
        existing_type=sa.String(100),
        type_=sa.String(20),
        existing_nullable=False,
        nullable=False,
    )
