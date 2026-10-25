"""Protect invoice numbering and creation retries; retain service dates.

Existing duplicates require review before this revision can proceed. Historical
invoice numbers and amounts are never rewritten automatically.
"""
from alembic import op
import sqlalchemy as sa

revision = '061_invoice_editor_integrity'
down_revision = '060_zzp_commitment_integrity'
branch_labels = None
depends_on = None


def upgrade():
    duplicate = op.get_bind().execute(sa.text('''SELECT administration_id, invoice_number
        FROM zzp_invoices GROUP BY administration_id, invoice_number
        HAVING COUNT(*) > 1 LIMIT 1''')).first()
    if duplicate:
        raise RuntimeError('Duplicate invoice numbers found. Review them with the accountant before applying revision 061; no historical numbers have been changed.')
    op.add_column('zzp_invoices', sa.Column('delivery_date', sa.Date(), nullable=True))
    op.add_column('zzp_invoices', sa.Column('creation_key', sa.Uuid(), nullable=True))
    op.add_column('zzp_invoices', sa.Column('creation_payload_hash', sa.String(64), nullable=True))
    op.create_index('uq_zzp_invoice_number', 'zzp_invoices', ['administration_id', 'invoice_number'], unique=True)
    op.create_index('uq_zzp_invoice_creation', 'zzp_invoices', ['administration_id', 'creation_key'], unique=True)


def downgrade():
    op.drop_index('uq_zzp_invoice_creation', table_name='zzp_invoices')
    op.drop_index('uq_zzp_invoice_number', table_name='zzp_invoices')
    for column in ('creation_payload_hash', 'creation_key', 'delivery_date'):
        op.drop_column('zzp_invoices', column)
