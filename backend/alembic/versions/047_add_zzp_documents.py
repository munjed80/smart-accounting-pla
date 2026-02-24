"""add zzp_documents table and document_id to zzp_expenses

Revision ID: 047_add_zzp_documents
Revises: 046_merge_heads_044_045, 6681ce17afc5
Create Date: 2026-02-24 22:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '047_add_zzp_documents'
down_revision: Union[str, Sequence[str], None] = ('046_merge_heads_044_045', '6681ce17afc5')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # Create zzpdoctype enum only if it does not already exist
    if not bind.execute(text("SELECT 1 FROM pg_type WHERE typname='zzpdoctype'")).scalar():
        op.execute("CREATE TYPE zzpdoctype AS ENUM ('BON','FACTUUR','OVERIG')")

    # Create zzpdocstatus enum only if it does not already exist
    if not bind.execute(text("SELECT 1 FROM pg_type WHERE typname='zzpdocstatus'")).scalar():
        op.execute("CREATE TYPE zzpdocstatus AS ENUM ('NEW','REVIEW','PROCESSED','FAILED')")

    doc_type_enum = postgresql.ENUM('BON', 'FACTUUR', 'OVERIG', name='zzpdoctype', create_type=False)
    doc_status_enum = postgresql.ENUM('NEW', 'REVIEW', 'PROCESSED', 'FAILED', name='zzpdocstatus', create_type=False)

    # Create zzp_documents table
    op.create_table(
        'zzp_documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('administrations.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'),
                  nullable=True, index=True),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=False),
        sa.Column('storage_ref', sa.String(1000), nullable=False),
        sa.Column('doc_type', doc_type_enum, nullable=False, server_default='OVERIG'),
        sa.Column('status', doc_status_enum, nullable=False, server_default='NEW', index=True),
        sa.Column('supplier', sa.String(255), nullable=True),
        sa.Column('amount_cents', sa.Integer, nullable=True),
        sa.Column('vat_rate', sa.Numeric(5, 2), nullable=True),
        sa.Column('doc_date', sa.Date, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # Add document_id column to zzp_expenses
    op.add_column(
        'zzp_expenses',
        sa.Column('document_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('zzp_documents.id', ondelete='SET NULL'),
                  nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_column('zzp_expenses', 'document_id')
    op.drop_table('zzp_documents')
