"""add recurrence and color columns to zzp_calendar_events

Revision ID: 053_calendar_events_recurrence_color
Revises: 052_categorization_rules
Create Date: 2026-04-11 23:51:12.000000

Changes:
- Add `recurrence` column (String, nullable) to zzp_calendar_events
  Possible values: null/none, daily, weekly, monthly
- Add `recurrence_end_date` column (Date, nullable) to zzp_calendar_events
- Add `color` column (String, nullable) to zzp_calendar_events
  Possible values: blue, green, red, orange, purple, pink, or null (primary)
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '053_calendar_events_recurrence_color'
down_revision = '052_categorization_rules'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'zzp_calendar_events',
        sa.Column('recurrence', sa.String(20), nullable=True, server_default=None),
    )
    op.add_column(
        'zzp_calendar_events',
        sa.Column('recurrence_end_date', sa.Date, nullable=True),
    )
    op.add_column(
        'zzp_calendar_events',
        sa.Column('color', sa.String(20), nullable=True, server_default=None),
    )


def downgrade() -> None:
    op.drop_column('zzp_calendar_events', 'color')
    op.drop_column('zzp_calendar_events', 'recurrence_end_date')
    op.drop_column('zzp_calendar_events', 'recurrence')
