"""Add missing document status enum values

Revision ID: 015_add_document_status_enum_values
Revises: 014_bank_recon
Create Date: 2024-02-01 00:00:00.000000

This migration adds the missing document status enum values that were
omitted from the original migration 008_document_intake_pipeline.

ROOT CAUSE OF THE ENUM MISMATCH:
The original enum in 001_initial.py only created:
  ('UPLOADED', 'PROCESSING', 'DRAFT_READY', 'FAILED')

But migration 008_document_intake_pipeline introduced new document workflow
states (EXTRACTED, NEEDS_REVIEW, POSTED, REJECTED) in the Python code without
also expanding the PostgreSQL enum type. This caused production errors:
  invalid input value for enum documentstatus: "NEEDS_REVIEW"

This migration adds the missing values using 'ADD VALUE IF NOT EXISTS' syntax
(PostgreSQL 9.3+) which is idempotent and safe to re-run.

IMPORTANT: This migration uses autocommit mode because ALTER TYPE ... ADD VALUE
cannot be executed inside a transaction block in PostgreSQL.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '015_add_document_status_enum_values'
down_revision: Union[str, None] = '014_bank_reconciliation'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IMPORTANT: ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    # We use the IF NOT EXISTS clause (PostgreSQL 9.3+) for idempotency.
    # 
    # We commit any existing transaction first and then execute the ALTER TYPE
    # statements. The commit is wrapped in try/except in case there's no active
    # transaction (some database configurations start without one).
    
    # Get the current connection
    connection = op.get_bind()
    
    # Commit any existing transaction to allow ALTER TYPE ADD VALUE
    # This is safe even if no transaction is active (wrapped in try/except)
    try:
        connection.execute(text("COMMIT"))
    except Exception:
        # No active transaction to commit, which is fine
        pass
    
    # Add EXTRACTED - Fields extracted, ready for matching
    # Using IF NOT EXISTS for idempotency (safe to re-run)
    connection.execute(
        text("ALTER TYPE documentstatus ADD VALUE IF NOT EXISTS 'EXTRACTED'")
    )
    
    # Add NEEDS_REVIEW - Document needs accountant review before posting
    # This is the critical status that caused the production error
    connection.execute(
        text("ALTER TYPE documentstatus ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW'")
    )
    
    # Add POSTED - Successfully posted to journal
    connection.execute(
        text("ALTER TYPE documentstatus ADD VALUE IF NOT EXISTS 'POSTED'")
    )
    
    # Add REJECTED - Rejected by accountant
    connection.execute(
        text("ALTER TYPE documentstatus ADD VALUE IF NOT EXISTS 'REJECTED'")
    )


def downgrade() -> None:
    # PostgreSQL does not support removing enum values directly
    # To downgrade, you would need to:
    # 1. Create a new enum type without the values
    # 2. Migrate all data
    # 3. Drop the old enum and rename the new one
    # 
    # This is intentionally not implemented as removing these values
    # would break the application. If needed, this should be done
    # manually with proper data migration planning.
    pass
