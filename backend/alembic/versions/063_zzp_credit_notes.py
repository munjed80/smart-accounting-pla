"""Add immutable credit notes, refunds and additive invoice settlement caches."""

from alembic import op
import sqlalchemy as sa

revision = "063_zzp_credit_notes"
down_revision = "062_zzp_vat_policy"
branch_labels = None
depends_on = None


def upgrade():
    for name in ["credited_cents", "refunded_cents"]:
        op.add_column(
            "zzp_invoices",
            sa.Column(name, sa.Integer(), nullable=False, server_default="0"),
        )
    op.add_column(
        "zzp_invoices", sa.Column("credit_references", sa.Text(), nullable=True)
    )
    op.create_table(
        "zzp_credit_counters",
        sa.Column(
            "administration_id",
            sa.Uuid(),
            sa.ForeignKey("administrations.id"),
            primary_key=True,
        ),
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("next_number", sa.Integer(), nullable=False),
    )
    op.create_table(
        "zzp_credit_notes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "administration_id",
            sa.Uuid(),
            sa.ForeignKey("administrations.id"),
            nullable=False,
        ),
        sa.Column(
            "invoice_id", sa.Uuid(), sa.ForeignKey("zzp_invoices.id"), nullable=False
        ),
        sa.Column("number", sa.String(50), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("subtotal_cents", sa.Integer(), nullable=False),
        sa.Column("vat_cents", sa.Integer(), nullable=False),
        sa.Column("total_cents", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("creation_key", sa.Uuid(), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "administration_id", "number", name="uq_credit_note_number"
        ),
        sa.UniqueConstraint(
            "administration_id", "creation_key", name="uq_credit_note_creation"
        ),
        sa.CheckConstraint(
            "total_cents > 0 AND subtotal_cents >= 0 AND vat_cents >= 0 AND total_cents = subtotal_cents + vat_cents",
            name="ck_credit_note_amounts",
        ),
    )
    op.create_table(
        "zzp_credit_lines",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "credit_note_id",
            sa.Uuid(),
            sa.ForeignKey("zzp_credit_notes.id"),
            nullable=False,
        ),
        sa.Column(
            "invoice_line_id",
            sa.Uuid(),
            sa.ForeignKey("zzp_invoice_lines.id"),
            nullable=False,
        ),
        sa.Column("line_number", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("net_cents", sa.Integer(), nullable=False),
        sa.Column("vat_cents", sa.Integer(), nullable=False),
        sa.UniqueConstraint(
            "credit_note_id", "invoice_line_id", name="uq_credit_source_line"
        ),
        sa.CheckConstraint(
            "quantity > 0 AND net_cents >= 0 AND vat_cents >= 0",
            name="ck_credit_line_amounts",
        ),
    )
    op.create_table(
        "zzp_customer_refunds",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "administration_id",
            sa.Uuid(),
            sa.ForeignKey("administrations.id"),
            nullable=False,
        ),
        sa.Column(
            "invoice_id", sa.Uuid(), sa.ForeignKey("zzp_invoices.id"), nullable=False
        ),
        sa.Column(
            "credit_note_id",
            sa.Uuid(),
            sa.ForeignKey("zzp_credit_notes.id"),
            nullable=False,
        ),
        sa.Column("refund_date", sa.Date(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(255), nullable=False),
        sa.Column("creation_key", sa.Uuid(), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "administration_id", "creation_key", name="uq_customer_refund_creation"
        ),
        sa.CheckConstraint("amount_cents > 0", name="ck_customer_refund_positive"),
    )
    for table, columns in {
        "zzp_credit_notes": ["administration_id", "invoice_id", "issue_date"],
        "zzp_credit_lines": ["credit_note_id", "invoice_line_id"],
        "zzp_customer_refunds": [
            "administration_id",
            "invoice_id",
            "credit_note_id",
            "refund_date",
        ],
    }.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    for table in [
        "zzp_customer_refunds",
        "zzp_credit_lines",
        "zzp_credit_notes",
        "zzp_credit_counters",
    ]:
        op.drop_table(table)
    for column in ["credit_references", "refunded_cents", "credited_cents"]:
        op.drop_column("zzp_invoices", column)
