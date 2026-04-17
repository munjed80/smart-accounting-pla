"""Add e-commerce integration tables

Revision ID: 055_ecommerce_integrations
Revises: 054_backfill_bank_currency
Create Date: 2026-04-17

Tables:
  - ecommerce_connections
  - ecommerce_orders
  - ecommerce_customers
  - ecommerce_refunds
  - ecommerce_sync_logs
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = "055_ecommerce_integrations"
down_revision: Union[str, None] = "054_backfill_bank_currency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- ecommerce_connections ---
    op.create_table(
        "ecommerce_connections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("administration_id", UUID(as_uuid=True), sa.ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("provider", sa.Enum("shopify", "woocommerce", name="ecommerceprovider", create_type=True), nullable=False),
        sa.Column("status", sa.Enum("connected", "disconnected", "error", name="connectionstatus", create_type=True), nullable=False, server_default="disconnected"),
        sa.Column("shop_name", sa.String(255), nullable=True),
        sa.Column("shop_url", sa.String(500), nullable=True),
        sa.Column("encrypted_credentials", sa.Text, nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_error", sa.Text, nullable=True),
        sa.Column("last_sync_orders_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("administration_id", "provider", name="uq_ecommerce_conn_admin_provider"),
    )

    # --- ecommerce_orders ---
    op.create_table(
        "ecommerce_orders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("connection_id", UUID(as_uuid=True), sa.ForeignKey("ecommerce_connections.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("administration_id", UUID(as_uuid=True), sa.ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("external_order_id", sa.String(255), nullable=False),
        sa.Column("external_order_number", sa.String(100), nullable=True),
        sa.Column("status", sa.Enum("open", "paid", "partially_paid", "refunded", "partially_refunded", "cancelled", "closed", name="ecommerceorderstatus", create_type=True), nullable=False, server_default="open"),
        sa.Column("customer_name", sa.String(255), nullable=True),
        sa.Column("customer_email", sa.String(255), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        sa.Column("total_amount_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("subtotal_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tax_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("shipping_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("discount_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("ordered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_data", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("connection_id", "external_order_id", name="uq_ecommerce_order_conn_ext"),
    )
    op.create_index("ix_ecommerce_orders_admin_ordered", "ecommerce_orders", ["administration_id", "ordered_at"])

    # --- ecommerce_customers ---
    op.create_table(
        "ecommerce_customers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("connection_id", UUID(as_uuid=True), sa.ForeignKey("ecommerce_connections.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("administration_id", UUID(as_uuid=True), sa.ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("external_customer_id", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("first_name", sa.String(255), nullable=True),
        sa.Column("last_name", sa.String(255), nullable=True),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("total_orders", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_spent_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        sa.Column("raw_data", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("connection_id", "external_customer_id", name="uq_ecommerce_cust_conn_ext"),
    )

    # --- ecommerce_refunds ---
    op.create_table(
        "ecommerce_refunds",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("connection_id", UUID(as_uuid=True), sa.ForeignKey("ecommerce_connections.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("administration_id", UUID(as_uuid=True), sa.ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("order_id", UUID(as_uuid=True), sa.ForeignKey("ecommerce_orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("external_refund_id", sa.String(255), nullable=False),
        sa.Column("external_order_id", sa.String(255), nullable=True),
        sa.Column("amount_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_data", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("connection_id", "external_refund_id", name="uq_ecommerce_refund_conn_ext"),
    )

    # --- ecommerce_sync_logs ---
    op.create_table(
        "ecommerce_sync_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("connection_id", UUID(as_uuid=True), sa.ForeignKey("ecommerce_connections.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("administration_id", UUID(as_uuid=True), sa.ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.Enum("pending", "running", "success", "partial", "failed", name="syncstatus", create_type=True), nullable=False, server_default="pending"),
        sa.Column("trigger", sa.String(50), nullable=False, server_default="manual"),
        sa.Column("orders_imported", sa.Integer, nullable=False, server_default="0"),
        sa.Column("orders_updated", sa.Integer, nullable=False, server_default="0"),
        sa.Column("customers_imported", sa.Integer, nullable=False, server_default="0"),
        sa.Column("refunds_imported", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ecommerce_sync_logs_conn_started", "ecommerce_sync_logs", ["connection_id", "started_at"])


def downgrade() -> None:
    op.drop_table("ecommerce_sync_logs")
    op.drop_table("ecommerce_refunds")
    op.drop_table("ecommerce_customers")
    op.drop_table("ecommerce_orders")
    op.drop_table("ecommerce_connections")

    # Drop enums
    op.execute("DROP TYPE IF EXISTS syncstatus")
    op.execute("DROP TYPE IF EXISTS ecommerceorderstatus")
    op.execute("DROP TYPE IF EXISTS connectionstatus")
    op.execute("DROP TYPE IF EXISTS ecommerceprovider")
