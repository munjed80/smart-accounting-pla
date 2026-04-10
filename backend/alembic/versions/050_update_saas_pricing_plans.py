"""update SaaS pricing plans to Free / Starter / Pro

Revision ID: 050_update_saas_pricing_plans
Revises: 049_update_zzp_basic_price
Create Date: 2026-04-09 20:00:00.000000

Updates the plans table to reflect the new pricing structure:
  - Free: €0.00/month, 30-day trial (updated limits from old free plan)
  - Starter: €4.95/month (replaces zzp_basic)
  - Pro (zzp_pro): €6.95/month (new plan)
  - Removes obsolete 'trial' plan
"""
from alembic import op
import sqlalchemy as sa
import uuid

# revision identifiers, used by Alembic.
revision: str = '050_update_saas_pricing_plans'
down_revision = '049_update_zzp_basic_price'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add starter and zzp_pro plans; update free plan limits; remove trial plan."""
    # 1. Update existing 'free' plan to match ZZP trial limits
    op.execute(
        """
        UPDATE plans
        SET name = 'Free',
            price_monthly = 0.00,
            trial_days = 30,
            max_invoices = 999999,
            max_storage_mb = 5120,
            max_users = 1
        WHERE code = 'free'
        """
    )

    # 2. Rename zzp_basic → starter and update price
    op.execute(
        """
        UPDATE plans
        SET code = 'starter',
            name = 'Starter',
            price_monthly = 4.95,
            trial_days = 0
        WHERE code = 'zzp_basic'
        """
    )

    # 3. Update any subscriptions referencing old plan code
    op.execute(
        """
        UPDATE subscriptions
        SET plan_code = 'starter'
        WHERE plan_code = 'zzp_basic'
        """
    )

    # 4. Insert zzp_pro plan (idempotent: skip if already exists)
    op.execute(
        f"""
        INSERT INTO plans (id, code, name, price_monthly, trial_days, max_invoices, max_storage_mb, max_users)
        VALUES ('{uuid.uuid4()}', 'zzp_pro', 'Pro', 6.95, 0, 999999, 10240, 3)
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            price_monthly = EXCLUDED.price_monthly,
            trial_days = EXCLUDED.trial_days,
            max_invoices = EXCLUDED.max_invoices,
            max_storage_mb = EXCLUDED.max_storage_mb,
            max_users = EXCLUDED.max_users
        """
    )

    # 5. Remove obsolete 'trial' plan (if exists)
    op.execute("DELETE FROM plans WHERE code = 'trial'")


def downgrade() -> None:
    """Revert to old plan structure."""
    # Restore zzp_basic from starter
    op.execute(
        """
        UPDATE plans
        SET code = 'zzp_basic',
            name = 'ZZP Basic',
            price_monthly = 4.99,
            trial_days = 30
        WHERE code = 'starter'
        """
    )

    # Update subscriptions back
    op.execute(
        """
        UPDATE subscriptions
        SET plan_code = 'zzp_basic'
        WHERE plan_code = 'starter'
        """
    )

    # Restore original free plan limits
    op.execute(
        """
        UPDATE plans
        SET name = 'FREE',
            trial_days = 0,
            max_invoices = 25,
            max_storage_mb = 256,
            max_users = 1
        WHERE code = 'free'
        """
    )

    # Remove zzp_pro plan
    op.execute("DELETE FROM plans WHERE code = 'zzp_pro'")

    # Re-insert trial plan
    op.execute(
        f"""
        INSERT INTO plans (id, code, name, price_monthly, trial_days, max_invoices, max_storage_mb, max_users)
        VALUES ('{uuid.uuid4()}', 'trial', 'TRIAL', 0.00, 30, 200, 1024, 2)
        ON CONFLICT (code) DO NOTHING
        """
    )
