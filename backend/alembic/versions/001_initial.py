"""Initial migration

Revision ID: 001_initial
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Expand alembic_version.version_num to VARCHAR(128) if it exists.
    # This is needed because our revision IDs are human-readable and longer than the
    # default VARCHAR(32), e.g., "010_accountant_dashboard_bulk_ops".
    # Safe to run on fresh databases where alembic_version doesn't exist yet.
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'alembic_version' AND column_name = 'version_num'
            ) THEN
                ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128);
            END IF;
        END $$;
    """)

    # Create users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), nullable=True, server_default='zzp'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # Create administrations table
    op.create_table(
        'administrations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.String(1000), nullable=True),
        sa.Column('kvk_number', sa.String(50), nullable=True),
        sa.Column('btw_number', sa.String(50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create member_role enum
    op.execute("CREATE TYPE memberrole AS ENUM ('OWNER', 'ADMIN', 'ACCOUNTANT', 'MEMBER')")

    # Create administration_members table
    op.create_table(
        'administration_members',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role', postgresql.ENUM('OWNER', 'ADMIN', 'ACCOUNTANT', 'MEMBER', name='memberrole', create_type=False), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create vat_codes table
    op.create_table(
        'vat_codes',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('code', sa.String(20), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('rate', sa.Numeric(5, 2), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )

    # Create chart_of_accounts table
    op.create_table(
        'chart_of_accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('account_code', sa.String(20), nullable=False),
        sa.Column('account_name', sa.String(255), nullable=False),
        sa.Column('account_type', sa.String(50), nullable=False),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['chart_of_accounts.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create document_status enum
    op.execute("CREATE TYPE documentstatus AS ENUM ('UPLOADED', 'PROCESSING', 'DRAFT_READY', 'FAILED')")

    # Create documents table
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('original_filename', sa.String(500), nullable=False),
        sa.Column('storage_path', sa.String(1000), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('status', postgresql.ENUM('UPLOADED', 'PROCESSING', 'DRAFT_READY', 'FAILED', name='documentstatus', create_type=False), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create extracted_fields table
    op.create_table(
        'extracted_fields',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('field_name', sa.String(100), nullable=False),
        sa.Column('field_value', sa.Text(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('raw_json', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create transaction_status enum
    op.execute("CREATE TYPE transactionstatus AS ENUM ('DRAFT', 'POSTED')")

    # Create transactions table
    op.create_table(
        'transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('booking_number', sa.String(50), nullable=False),
        sa.Column('transaction_date', sa.Date(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('status', postgresql.ENUM('DRAFT', 'POSTED', name='transactionstatus', create_type=False), nullable=False),
        sa.Column('ai_confidence_score', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['administration_id'], ['administrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create transaction_lines table
    op.create_table(
        'transaction_lines',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('transaction_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('vat_code_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('debit_amount', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('credit_amount', sa.Numeric(15, 2), nullable=False, server_default='0.00'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['chart_of_accounts.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vat_code_id'], ['vat_codes.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('transaction_lines')
    op.drop_table('transactions')
    op.execute("DROP TYPE transactionstatus")
    op.drop_table('extracted_fields')
    op.drop_table('documents')
    op.execute("DROP TYPE documentstatus")
    op.drop_table('chart_of_accounts')
    op.drop_table('vat_codes')
    op.drop_table('administration_members')
    op.execute("DROP TYPE memberrole")
    op.drop_table('administrations')
    op.drop_index('ix_users_email', 'users')
    op.drop_table('users')
