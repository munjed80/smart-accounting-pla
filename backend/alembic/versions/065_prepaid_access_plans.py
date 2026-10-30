"""Add prepaid access periods and three-month trials for new accounts only."""
from alembic import op
import sqlalchemy as sa
import uuid
from decimal import Decimal

revision = '065_prepaid_access_plans'
down_revision = '064_zzp_bank_receipts'
branch_labels = None
depends_on = None


def upgrade():
    # Existing trial_end_at values and recurring subscriptions are deliberately preserved.
    op.execute("UPDATE plans SET trial_days = 90 WHERE code = 'free'")
    for months, monthly in [(1, '6.00'), (3, '4.67'), (6, '4.17'), (12, '3.25')]:
        op.get_bind().execute(sa.text("""
            INSERT INTO plans (id, code, name, price_monthly, trial_days, max_invoices, max_storage_mb, max_users)
            VALUES (:id, :code, :name, :price, 0, 999999, 10240, 3)
            ON CONFLICT (code) DO NOTHING
        """), {'id': uuid.uuid4(), 'code': f'zzp_{months}m', 'name': f'ZZPers Hub {months}m', 'price': Decimal(monthly)})


def downgrade():
    op.execute("UPDATE plans SET trial_days = 365 WHERE code = 'free'")
    op.execute("""DELETE FROM plans WHERE code IN ('zzp_1m','zzp_3m','zzp_6m','zzp_12m')
        AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE subscriptions.plan_id = plans.id)""")
