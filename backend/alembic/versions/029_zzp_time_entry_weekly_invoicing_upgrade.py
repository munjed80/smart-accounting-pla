"""Add weekly invoicing fields and indexes for zzp time entries

Revision ID: 029_zzp_time_entry_weekly_invoicing_upgrade
Revises: 028_add_journal_posting_flags
Create Date: 2026-02-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '029_zzp_time_entry_weekly_invoicing_upgrade'
down_revision: Union[str, None] = '028_add_journal_posting_flags'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'zzp_projects',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('administration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('administrations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_zzp_projects_administration_id', 'zzp_projects', ['administration_id'])

    op.add_column('business_profiles', sa.Column('default_hourly_rate', sa.Numeric(10, 2), nullable=True))

    op.add_column('zzp_time_entries', sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('zzp_time_entries', sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('zzp_time_entries', sa.Column('hourly_rate', sa.Numeric(10, 2), nullable=True))

    op.create_foreign_key('fk_zzp_time_entries_user_id', 'zzp_time_entries', 'users', ['user_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_zzp_time_entries_project_id', 'zzp_time_entries', 'zzp_projects', ['project_id'], ['id'], ondelete='SET NULL')

    op.create_index('ix_zzp_time_entries_user_id', 'zzp_time_entries', ['user_id'])
    op.create_index('ix_zzp_time_entries_project_id', 'zzp_time_entries', ['project_id'])

    op.create_index(
        'ix_zzp_time_entries_user_customer_date',
        'zzp_time_entries',
        ['user_id', 'customer_id', 'entry_date'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_zzp_time_entries_user_customer_date', table_name='zzp_time_entries')
    op.drop_index('ix_zzp_time_entries_project_id', table_name='zzp_time_entries')
    op.drop_index('ix_zzp_time_entries_user_id', table_name='zzp_time_entries')
    op.drop_constraint('fk_zzp_time_entries_project_id', 'zzp_time_entries', type_='foreignkey')
    op.drop_constraint('fk_zzp_time_entries_user_id', 'zzp_time_entries', type_='foreignkey')

    op.drop_column('zzp_time_entries', 'hourly_rate')
    op.drop_column('zzp_time_entries', 'project_id')
    op.drop_column('zzp_time_entries', 'user_id')

    op.drop_column('business_profiles', 'default_hourly_rate')

    op.drop_index('ix_zzp_projects_administration_id', table_name='zzp_projects')
    op.drop_table('zzp_projects')
