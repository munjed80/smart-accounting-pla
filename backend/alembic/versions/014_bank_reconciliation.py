"""Placeholder migration to restore revision chain continuity.

Revision ID: 014_bank_reconciliation
Revises: 013_client_consent_workflow
Create Date: 2024-01-22 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "014_bank_reconciliation"
down_revision: Union[str, None] = "013_client_consent_workflow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No-op placeholder to align with databases stamped to this revision.
    # The real schema changes live in 014_bank_recon.
    op.execute("SELECT 1")


def downgrade() -> None:
    # No schema objects created here, so nothing to drop.
    pass
