"""add connector_response to vat_submissions

Revision ID: 041_add_connector_response
Revises: 040_bank_matching_engine
Create Date: 2026-02-17 15:57:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '041_add_connector_response'
down_revision = '040_bank_matching_engine'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add connector_response JSONB column to vat_submissions
    op.add_column(
        'vat_submissions',
        sa.Column('connector_response', postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )


def downgrade() -> None:
    # Remove connector_response column
    op.drop_column('vat_submissions', 'connector_response')
