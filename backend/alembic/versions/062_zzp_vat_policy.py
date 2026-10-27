"""Record explicit ZZP VAT basis confirmations without changing historical data."""

from alembic import op
import sqlalchemy as sa

revision = "062_zzp_vat_policy"
down_revision = "061_invoice_editor_integrity"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "zzp_vat_policies",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "administration_id",
            sa.Uuid(),
            sa.ForeignKey("administrations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("basis", sa.String(20), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("confirmed_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "confirmed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "basis IN ('factuurstelsel', 'kasstelsel')", name="ck_zzp_vat_policy_basis"
        ),
    )


def downgrade():
    op.drop_table("zzp_vat_policies")
