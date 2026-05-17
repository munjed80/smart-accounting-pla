"""set free plan trial duration to 365 days

Revision ID: 059_free_trial_365_days
Revises: 058_backfill_bank_transactions_matched_entity
Create Date: 2026-05-17 13:20:00.000000

Only updates default plan configuration for future free accounts. Existing
subscription trial_end_at values are intentionally left unchanged.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "059_free_trial_365_days"
down_revision = "058_backfill_bank_transactions_matched_entity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Future free-plan subscriptions should receive a 365-day trial."""
    op.execute(
        """
        UPDATE plans
        SET trial_days = 365
        WHERE code = 'free'
        """
    )


def downgrade() -> None:
    """Restore the previous free-plan default duration."""
    op.execute(
        """
        UPDATE plans
        SET trial_days = 90
        WHERE code = 'free'
        """
    )
