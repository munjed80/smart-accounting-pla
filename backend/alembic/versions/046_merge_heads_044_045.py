"""merge heads 044 and 045

Revision ID: 046_merge_heads_044_045
Revises: 044_add_subscription_phase1_fields, 045_add_contact_messages
Create Date: 2026-02-24 01:07:12.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '046_merge_heads_044_045'
down_revision: Union[str, None] = ('044_add_subscription_phase1_fields', '045_add_contact_messages')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
