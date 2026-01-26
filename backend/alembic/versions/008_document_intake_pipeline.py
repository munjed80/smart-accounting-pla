"""Document Intake Pipeline Enhancement

Revision ID: 008_document_intake_pipeline
Revises: 007_fix_dutch_vat_box_mapping
Create Date: 2024-01-26 00:00:00.000000

This migration adds:
- New document states (EXTRACTED, NEEDS_REVIEW, POSTED, REJECTED)
- Document metadata fields for extracted invoice data
- Matching and duplicate detection fields
- Document suggested actions table
- Document audit log table
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '008_document_intake_pipeline'
down_revision: Union[str, None] = '007_fix_dutch_vat_box_mapping'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns to documents table
    op.add_column('documents', sa.Column('supplier_name', sa.String(255), nullable=True))
    op.add_column('documents', sa.Column('invoice_number', sa.String(100), nullable=True))
    op.add_column('documents', sa.Column('invoice_date', sa.DateTime(timezone=True), nullable=True))
    op.add_column('documents', sa.Column('due_date', sa.DateTime(timezone=True), nullable=True))
    op.add_column('documents', sa.Column('total_amount', sa.Numeric(15, 2), nullable=True))
    op.add_column('documents', sa.Column('vat_amount', sa.Numeric(15, 2), nullable=True))
    op.add_column('documents', sa.Column('net_amount', sa.Numeric(15, 2), nullable=True))
    op.add_column('documents', sa.Column('currency', sa.String(3), nullable=True, server_default='EUR'))
    op.add_column('documents', sa.Column('extraction_confidence', sa.Numeric(5, 4), nullable=True))
    
    # Matching fields
    op.add_column('documents', sa.Column('matched_party_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('documents', sa.Column('matched_open_item_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('documents', sa.Column('match_confidence', sa.Numeric(5, 4), nullable=True))
    op.add_column('documents', sa.Column('is_duplicate', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('documents', sa.Column('duplicate_of_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Posting tracking
    op.add_column('documents', sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('documents', sa.Column('posted_by_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('documents', sa.Column('posted_journal_entry_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Rejection tracking
    op.add_column('documents', sa.Column('rejected_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('documents', sa.Column('rejected_by_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('documents', sa.Column('rejection_reason', sa.Text(), nullable=True))
    
    # Reprocessing tracking
    op.add_column('documents', sa.Column('process_count', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('documents', sa.Column('last_processed_at', sa.DateTime(timezone=True), nullable=True))
    
    # Add foreign keys
    op.create_foreign_key(
        'fk_documents_matched_party',
        'documents', 'parties',
        ['matched_party_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_documents_matched_open_item',
        'documents', 'open_items',
        ['matched_open_item_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_documents_duplicate_of',
        'documents', 'documents',
        ['duplicate_of_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_documents_posted_by',
        'documents', 'users',
        ['posted_by_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_documents_posted_journal',
        'documents', 'journal_entries',
        ['posted_journal_entry_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_documents_rejected_by',
        'documents', 'users',
        ['rejected_by_id'], ['id'],
        ondelete='SET NULL'
    )
    
    # Create indexes for common queries
    op.create_index('ix_documents_status', 'documents', ['status'])
    op.create_index('ix_documents_invoice_number', 'documents', ['invoice_number'])
    op.create_index('ix_documents_supplier_name', 'documents', ['supplier_name'])
    
    # Create document_suggested_actions table
    op.create_table(
        'document_suggested_actions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=False),
        sa.Column('confidence_score', sa.Numeric(5, 4), nullable=True, server_default='0.5000'),
        sa.Column('parameters', postgresql.JSONB(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_doc_suggested_actions_document', 'document_suggested_actions', ['document_id'])
    
    # Create document_audit_logs table
    op.create_table(
        'document_audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('from_status', sa.String(20), nullable=True),
        sa.Column('to_status', sa.String(20), nullable=False),
        sa.Column('performed_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('performed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('result_journal_entry_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['performed_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['result_journal_entry_id'], ['journal_entries.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_doc_audit_logs_document', 'document_audit_logs', ['document_id'])
    op.create_index('ix_doc_audit_logs_administration', 'document_audit_logs', ['administration_id'])


def downgrade() -> None:
    # Drop tables
    op.drop_table('document_audit_logs')
    op.drop_table('document_suggested_actions')
    
    # Drop indexes
    op.drop_index('ix_documents_supplier_name')
    op.drop_index('ix_documents_invoice_number')
    op.drop_index('ix_documents_status')
    
    # Drop foreign keys
    op.drop_constraint('fk_documents_rejected_by', 'documents', type_='foreignkey')
    op.drop_constraint('fk_documents_posted_journal', 'documents', type_='foreignkey')
    op.drop_constraint('fk_documents_posted_by', 'documents', type_='foreignkey')
    op.drop_constraint('fk_documents_duplicate_of', 'documents', type_='foreignkey')
    op.drop_constraint('fk_documents_matched_open_item', 'documents', type_='foreignkey')
    op.drop_constraint('fk_documents_matched_party', 'documents', type_='foreignkey')
    
    # Drop columns
    op.drop_column('documents', 'last_processed_at')
    op.drop_column('documents', 'process_count')
    op.drop_column('documents', 'rejection_reason')
    op.drop_column('documents', 'rejected_by_id')
    op.drop_column('documents', 'rejected_at')
    op.drop_column('documents', 'posted_journal_entry_id')
    op.drop_column('documents', 'posted_by_id')
    op.drop_column('documents', 'posted_at')
    op.drop_column('documents', 'duplicate_of_id')
    op.drop_column('documents', 'is_duplicate')
    op.drop_column('documents', 'match_confidence')
    op.drop_column('documents', 'matched_open_item_id')
    op.drop_column('documents', 'matched_party_id')
    op.drop_column('documents', 'extraction_confidence')
    op.drop_column('documents', 'currency')
    op.drop_column('documents', 'net_amount')
    op.drop_column('documents', 'vat_amount')
    op.drop_column('documents', 'total_amount')
    op.drop_column('documents', 'due_date')
    op.drop_column('documents', 'invoice_date')
    op.drop_column('documents', 'invoice_number')
    op.drop_column('documents', 'supplier_name')
