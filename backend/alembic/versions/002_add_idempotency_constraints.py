"""Add idempotency unique constraints

Revision ID: 002_add_idempotency_constraints
Revises: 001_initial
Create Date: 2024-01-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '002_add_idempotency_constraints'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add unique constraint on transactions.document_id (nullable allowed, unique when not null)
    # This ensures only one transaction per document for idempotency
    op.create_index(
        'ix_transactions_document_id_unique',
        'transactions',
        ['document_id'],
        unique=True,
        postgresql_where=sa.text('document_id IS NOT NULL')
    )
    
    # Add unique constraint on extracted_fields (document_id + field_name)
    # This ensures one extracted field row per document per field name
    op.create_index(
        'ix_extracted_fields_document_field_unique',
        'extracted_fields',
        ['document_id', 'field_name'],
        unique=True
    )


def downgrade() -> None:
    op.drop_index('ix_extracted_fields_document_field_unique', table_name='extracted_fields')
    op.drop_index('ix_transactions_document_id_unique', table_name='transactions')
