"""update zzp_basic plan price from 6.95 to 4.99

Revision ID: 049_update_zzp_basic_price
Revises: 048_alter_audit_log_action_length
Create Date: 2026-03-13 23:45:00.000000

Root cause: The ZZP Basic plan price_monthly was seeded as 6.95 but the
product pricing has been updated to 4.99/month. This migration updates the
existing plan record in the database so that the checkout and subscription
flows use the correct amount.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '049_update_zzp_basic_price'
down_revision = '048_alter_audit_log_action_length'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Update zzp_basic plan price_monthly from 6.95 to 4.99."""
    op.execute(
        "UPDATE plans SET price_monthly = 4.99 WHERE code = 'zzp_basic' AND price_monthly = 6.95"
    )


def downgrade() -> None:
    """Revert zzp_basic plan price_monthly from 4.99 back to 6.95."""
    op.execute(
        "UPDATE plans SET price_monthly = 6.95 WHERE code = 'zzp_basic' AND price_monthly = 4.99"
    )
