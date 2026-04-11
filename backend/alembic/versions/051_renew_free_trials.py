"""renew free trial for all existing free-plan users

Revision ID: 051_renew_free_trials
Revises: 050_update_saas_pricing_plans
Create Date: 2026-04-11 10:00:00.000000

One-time data migration: resets the trial window for every subscription on
the 'free' plan that is currently TRIALING or EXPIRED.  This gives all
registered users a fresh 30-day trial starting from the moment this
migration runs.

Subscriptions with status ACTIVE, CANCELED, or PAST_DUE are intentionally
left untouched so paid / billing-managed subscriptions are never affected.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '051_renew_free_trials'
down_revision = '050_update_saas_pricing_plans'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Reset trial_start_at / trial_end_at and status for free-plan trials."""
    op.execute(
        """
        UPDATE subscriptions
        SET status        = 'TRIALING',
            trial_start_at = NOW(),
            trial_end_at   = NOW() + INTERVAL '30 days',
            updated_at     = NOW()
        WHERE plan_code = 'free'
          AND status IN ('TRIALING', 'EXPIRED')
        """
    )


def downgrade() -> None:
    """
    Downgrade is a no-op: we cannot reliably restore the original
    trial_start_at / trial_end_at timestamps because they were
    overwritten in place.  A rollback of the application code is
    sufficient – the next compute_entitlements() call will re-expire
    any trial whose trial_end_at has passed.
    """
    pass
