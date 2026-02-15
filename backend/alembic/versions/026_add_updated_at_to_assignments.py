"""add updated_at to accountant assignments

Revision ID: 026_add_updated_at_to_assignments
Revises: 025_add_rejected_assignment_status
Create Date: 2026-02-15
"""
from alembic import op
import sqlalchemy as sa


revision = '026_add_updated_at_to_assignments'
down_revision = '025_add_rejected_assignment_status'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'accountant_client_assignments',
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.execute("UPDATE accountant_client_assignments SET updated_at = assigned_at WHERE updated_at IS NULL")


def downgrade() -> None:
    op.drop_column('accountant_client_assignments', 'updated_at')
