"""Add missing document status enum values

Revision ID: 015_add_document_status_enum_values
Revises: 014_bank_recon
Create Date: 2024-02-01 00:00:00.000000

This migration adds the missing document status enum values that were
omitted from the original migration 008_document_intake_pipeline.

The original enum in 001_initial.py only created:
  ('UPLOADED', 'PROCESSING', 'DRAFT_READY', 'FAILED')

But migration 008 introduced new document workflow states without
expanding the enum. This caused production errors:
  invalid input value for enum documentstatus: "NEEDS_REVIEW"

This migration adds:
  - EXTRACTED: Fields extracted, ready for matching
  - NEEDS_REVIEW: Needs accountant review
  - POSTED: Successfully posted to journal
  - REJECTED: Rejected by accountant

The migration is idempotent - it checks pg_enum before adding values.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '015_add_document_status_enum_values'
down_revision: Union[str, None] = '014_bank_recon'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add missing enum values idempotently using DO block
    # This checks pg_enum before attempting to add each value
    op.execute("""
        DO $$
        BEGIN
            -- Add EXTRACTED if not exists
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum 
                WHERE enumlabel = 'EXTRACTED' 
                AND enumtypid = 'documentstatus'::regtype
            ) THEN
                ALTER TYPE documentstatus ADD VALUE 'EXTRACTED';
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            -- Add NEEDS_REVIEW if not exists
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum 
                WHERE enumlabel = 'NEEDS_REVIEW' 
                AND enumtypid = 'documentstatus'::regtype
            ) THEN
                ALTER TYPE documentstatus ADD VALUE 'NEEDS_REVIEW';
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            -- Add POSTED if not exists
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum 
                WHERE enumlabel = 'POSTED' 
                AND enumtypid = 'documentstatus'::regtype
            ) THEN
                ALTER TYPE documentstatus ADD VALUE 'POSTED';
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            -- Add REJECTED if not exists
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum 
                WHERE enumlabel = 'REJECTED' 
                AND enumtypid = 'documentstatus'::regtype
            ) THEN
                ALTER TYPE documentstatus ADD VALUE 'REJECTED';
            END IF;
        END $$;
    """)


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
