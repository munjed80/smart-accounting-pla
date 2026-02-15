"""add rejected status to accountant assignment enum

Revision ID: 025_add_rejected_assignment_status
Revises: 024_add_permission_scopes
Create Date: 2026-02-15
"""
from alembic import op


revision = '025_add_rejected_assignment_status'
down_revision = '024_add_permission_scopes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE assignmentstatus ADD VALUE IF NOT EXISTS 'REJECTED'")


def downgrade() -> None:
    # PostgreSQL enum value removal is non-trivial and unsafe in-place.
    pass
