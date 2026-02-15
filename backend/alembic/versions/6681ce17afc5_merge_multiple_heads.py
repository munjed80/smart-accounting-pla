"""merge multiple heads

Revision ID: 6681ce17afc5
Revises: 026_add_updated_at_to_assignments, 030_super_admin_subscriptions
Create Date: 2026-02-15 20:59:00.957314

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6681ce17afc5'
down_revision: Union[str, None] = ('026_add_updated_at_to_assignments', '030_super_admin_subscriptions')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
