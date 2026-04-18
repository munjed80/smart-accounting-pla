"""Add ecommerce_mappings table for Phase 2 review-and-map workflow

Revision ID: 056_ecommerce_mappings
Revises: 055_ecommerce_integrations
Create Date: 2026-04-18

Tables:
  - ecommerce_mappings: review/approval layer between imported orders and bookkeeping
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = "056_ecommerce_mappings"
down_revision: Union[str, None] = "055_ecommerce_integrations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ecommerce_mappings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "administration_id",
            UUID(as_uuid=True),
            sa.ForeignKey("administrations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "connection_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ecommerce_connections.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # Exactly one of order_id / refund_id is set
        sa.Column(
            "order_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ecommerce_orders.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "refund_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ecommerce_refunds.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        # Record type: "order" or "refund"
        sa.Column("record_type", sa.String(20), nullable=False, server_default="order"),
        # Review status workflow
        sa.Column(
            "review_status",
            sa.String(30),
            nullable=False,
            server_default="new",
            index=True,
        ),
        # Provider for quick filtering
        sa.Column("provider", sa.String(30), nullable=False),
        # External reference for display
        sa.Column("external_ref", sa.String(255), nullable=True),
        # --- Mapped accounting amounts (cents) ---
        sa.Column("revenue_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tax_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("shipping_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("discount_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("refund_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("net_amount_cents", sa.Integer, nullable=False, server_default="0"),
        # VAT handling
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("vat_amount_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("vat_status", sa.String(30), nullable=False, server_default="auto"),
        # Currency
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        # Accounting date for bookkeeping
        sa.Column("accounting_date", sa.Date, nullable=True),
        # User notes
        sa.Column("notes", sa.Text, nullable=True),
        # Duplicate-safety flag
        sa.Column("posted_entity_type", sa.String(50), nullable=True),
        sa.Column("posted_entity_id", UUID(as_uuid=True), nullable=True),
        # Audit fields
        sa.Column("reviewed_by", UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("posted_by", UUID(as_uuid=True), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # Each order/refund can only have one mapping row
        sa.UniqueConstraint("order_id", name="uq_ecommerce_mapping_order"),
        sa.UniqueConstraint("refund_id", name="uq_ecommerce_mapping_refund"),
    )
    op.create_index(
        "ix_ecommerce_mappings_admin_status",
        "ecommerce_mappings",
        ["administration_id", "review_status"],
    )


def downgrade() -> None:
    op.drop_table("ecommerce_mappings")
