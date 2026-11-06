"""Store an optional validated company logo in the business profile."""

import sqlalchemy as sa
from alembic import op

revision = "067_company_logo"
down_revision = "066_ecommerce_posting"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("business_profiles", sa.Column("logo_data_url", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("business_profiles", "logo_data_url")
