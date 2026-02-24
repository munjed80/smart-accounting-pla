"""add contact_messages table

Revision ID: 045_add_contact_messages
Revises: 6681ce17afc5
Create Date: 2026-02-24 00:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '045_add_contact_messages'
down_revision = '6681ce17afc5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum type only if it doesn't already exist
    bind = op.get_bind()
    enum_exists = bind.execute(
        text("SELECT 1 FROM pg_type WHERE typname = 'contactmessagestatus'")
    ).scalar() is not None

    if not enum_exists:
        op.execute("CREATE TYPE contactmessagestatus AS ENUM ('NEW', 'READ', 'RESOLVED')")

    op.create_table(
        'contact_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('NEW', 'READ', 'RESOLVED', name='contactmessagestatus', create_type=False),
            nullable=False,
            server_default='NEW',
        ),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('subject', sa.String(length=500), nullable=True),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('page_url', sa.String(length=2000), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('ip_hash', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('internal_note', sa.Text(), nullable=True),
    )

    op.create_index('ix_contact_messages_email', 'contact_messages', ['email'])
    op.create_index('ix_contact_messages_status', 'contact_messages', ['status'])
    op.create_index('ix_contact_messages_created_at', 'contact_messages', ['created_at'])
    op.create_index('ix_contact_messages_ip_hash', 'contact_messages', ['ip_hash'])


def downgrade() -> None:
    op.drop_index('ix_contact_messages_ip_hash', table_name='contact_messages')
    op.drop_index('ix_contact_messages_created_at', table_name='contact_messages')
    op.drop_index('ix_contact_messages_status', table_name='contact_messages')
    op.drop_index('ix_contact_messages_email', table_name='contact_messages')
    op.drop_table('contact_messages')
