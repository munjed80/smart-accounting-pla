"""Unify persisted commitments and preserve explicitly imported local records.

No legacy browser records or historical financial entries are modified automatically.
"""
from alembic import op
import sqlalchemy as sa

revision = '060_zzp_commitment_integrity'
down_revision = '059_free_trial_365_days'
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == 'postgresql':
        # Early schemas used lowercase enum labels; metadata-created databases
        # may contain uppercase labels. Normalize those in-place before adding a value.
        for enum, labels in [('commitmenttype', ['LEASE', 'LOAN', 'SUBSCRIPTION']),
                             ('recurringfrequency', ['MONTHLY', 'YEARLY']),
                             ('commitmentstatus', ['ACTIVE', 'PAUSED', 'ENDED'])]:
            for label in labels:
                op.execute(sa.text(f"""DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='{enum}' AND e.enumlabel='{label}')
                    AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='{enum}' AND e.enumlabel='{label.lower()}') THEN
                        ALTER TYPE {enum} RENAME VALUE '{label}' TO '{label.lower()}';
                    END IF; END $$;"""))
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE recurringfrequency ADD VALUE IF NOT EXISTS 'quarterly'")
    op.add_column('financial_commitments', sa.Column('notes', sa.Text(), nullable=True))
    op.add_column('financial_commitments', sa.Column('legacy_source_key', sa.String(150), nullable=True))
    op.add_column('financial_commitments', sa.Column('remaining_balance_override_cents', sa.Integer(), nullable=True))
    op.create_index('uq_commitment_legacy_source', 'financial_commitments', ['administration_id', 'legacy_source_key'], unique=True)


def downgrade():
    op.drop_index('uq_commitment_legacy_source', table_name='financial_commitments')
    op.drop_column('financial_commitments', 'remaining_balance_override_cents')
    op.drop_column('financial_commitments', 'legacy_source_key')
    op.drop_column('financial_commitments', 'notes')
    # PostgreSQL enum values are additive; quarterly is retained to avoid rewriting historical rows.
