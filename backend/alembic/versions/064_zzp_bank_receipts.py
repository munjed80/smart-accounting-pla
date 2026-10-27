"""Link bank matches to native receipts and retain unlink history."""

from alembic import op
import sqlalchemy as sa

revision = "064_zzp_bank_receipts"
down_revision = "063_zzp_credit_notes"
branch_labels = None
depends_on = None


def upgrade():
    table = "zzp_bank_transaction_matches"
    for column in [
        sa.Column("payment_id", sa.Uuid(), nullable=True),
        sa.Column("allocation_id", sa.Uuid(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reversed_by_id", sa.Uuid(), nullable=True),
        sa.Column("creation_key", sa.Uuid(), nullable=True),
        sa.Column("payload_hash", sa.String(64), nullable=True),
    ]:
        op.add_column(table, column)
    op.create_foreign_key(
        "fk_bank_match_payment",
        table,
        "zzp_payments",
        ["payment_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_bank_match_reversed_by", table, "users", ["reversed_by_id"], ["id"]
    )
    op.create_index("ix_zzp_bank_transaction_matches_payment_id", table, ["payment_id"])
    op.create_unique_constraint(
        "uq_zzp_bank_match_creation", table, ["administration_id", "creation_key"]
    )


def downgrade():
    table = "zzp_bank_transaction_matches"
    op.drop_constraint("uq_zzp_bank_match_creation", table, type_="unique")
    op.drop_index("ix_zzp_bank_transaction_matches_payment_id", table_name=table)
    op.drop_constraint("fk_bank_match_payment", table, type_="foreignkey")
    op.drop_constraint("fk_bank_match_reversed_by", table, type_="foreignkey")
    for name in [
        "payload_hash",
        "creation_key",
        "reversed_at",
        "reversed_by_id",
        "active",
        "allocation_id",
        "payment_id",
    ]:
        op.drop_column(table, name)
