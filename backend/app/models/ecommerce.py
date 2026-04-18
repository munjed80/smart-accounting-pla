"""
E-commerce Integration Models

SQLAlchemy models for e-commerce integrations (Shopify, WooCommerce).
Phase 1: connection management, imported orders/customers/refunds, sync logs.
Phase 2: review-and-map workflow (EcommerceMapping).
"""
import uuid
import enum
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    String, DateTime, Date, Integer, Boolean, Text, Numeric,
    ForeignKey, Enum as SQLEnum, func, UniqueConstraint, Index,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class EcommerceProvider(str, enum.Enum):
    SHOPIFY = "shopify"
    WOOCOMMERCE = "woocommerce"


class ConnectionStatus(str, enum.Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"


class SyncStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


class EcommerceOrderStatus(str, enum.Enum):
    OPEN = "open"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"
    CANCELLED = "cancelled"
    CLOSED = "closed"


class MappingReviewStatus(str, enum.Enum):
    NEW = "new"
    NEEDS_REVIEW = "needs_review"
    MAPPED = "mapped"
    APPROVED = "approved"
    POSTED = "posted"
    SKIPPED = "skipped"
    DUPLICATE = "duplicate"
    ERROR = "error"


# ---------------------------------------------------------------------------
# EcommerceConnection – one per provider per administration
# ---------------------------------------------------------------------------

class EcommerceConnection(Base):
    """
    Stores the connection details for a single e-commerce provider.
    One connection per (administration, provider) pair.
    """
    __tablename__ = "ecommerce_connections"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("administrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[EcommerceProvider] = mapped_column(
        SQLEnum(EcommerceProvider), nullable=False,
    )
    status: Mapped[ConnectionStatus] = mapped_column(
        SQLEnum(ConnectionStatus), nullable=False, default=ConnectionStatus.DISCONNECTED,
    )

    # Display name the user gave (e.g. "Mijn Shopify winkel")
    shop_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    shop_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Encrypted / stored credentials  (phase 1: API keys, not full OAuth tokens)
    # For Shopify: access_token (from custom app or OAuth)
    # For WooCommerce: consumer_key + consumer_secret
    encrypted_credentials: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Sync metadata
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_sync_orders_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    # Relationships
    orders = relationship("EcommerceOrder", back_populates="connection", cascade="all, delete-orphan")
    customers = relationship("EcommerceCustomer", back_populates="connection", cascade="all, delete-orphan")
    refunds = relationship("EcommerceRefund", back_populates="connection", cascade="all, delete-orphan")
    sync_logs = relationship("EcommerceSyncLog", back_populates="connection", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("administration_id", "provider", name="uq_ecommerce_conn_admin_provider"),
    )


# ---------------------------------------------------------------------------
# EcommerceOrder – imported orders
# ---------------------------------------------------------------------------

class EcommerceOrder(Base):
    """Imported e-commerce order. One row per unique (connection, external_order_id)."""
    __tablename__ = "ecommerce_orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ecommerce_connections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("administrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Provider-side identifiers
    external_order_id: Mapped[str] = mapped_column(String(255), nullable=False)
    external_order_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Order data
    status: Mapped[EcommerceOrderStatus] = mapped_column(
        SQLEnum(EcommerceOrderStatus), nullable=False, default=EcommerceOrderStatus.OPEN,
    )
    customer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    customer_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    total_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    subtotal_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tax_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shipping_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Dates from e-commerce platform
    ordered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Raw data for future mapping
    raw_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    # Relationships
    connection = relationship("EcommerceConnection", back_populates="orders")

    __table_args__ = (
        UniqueConstraint("connection_id", "external_order_id", name="uq_ecommerce_order_conn_ext"),
        Index("ix_ecommerce_orders_admin_ordered", "administration_id", "ordered_at"),
    )


# ---------------------------------------------------------------------------
# EcommerceCustomer – imported customers
# ---------------------------------------------------------------------------

class EcommerceCustomer(Base):
    """Imported e-commerce customer. One row per unique (connection, external_customer_id)."""
    __tablename__ = "ecommerce_customers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ecommerce_connections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("administrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    external_customer_id: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    total_orders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_spent_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")

    raw_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    connection = relationship("EcommerceConnection", back_populates="customers")

    __table_args__ = (
        UniqueConstraint("connection_id", "external_customer_id", name="uq_ecommerce_cust_conn_ext"),
    )


# ---------------------------------------------------------------------------
# EcommerceRefund – imported refunds
# ---------------------------------------------------------------------------

class EcommerceRefund(Base):
    """Imported e-commerce refund. One row per unique (connection, external_refund_id)."""
    __tablename__ = "ecommerce_refunds"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ecommerce_connections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("administrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ecommerce_orders.id", ondelete="SET NULL"),
        nullable=True,
    )

    external_refund_id: Mapped[str] = mapped_column(String(255), nullable=False)
    external_order_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    refunded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    raw_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    connection = relationship("EcommerceConnection", back_populates="refunds")

    __table_args__ = (
        UniqueConstraint("connection_id", "external_refund_id", name="uq_ecommerce_refund_conn_ext"),
    )


# ---------------------------------------------------------------------------
# EcommerceSyncLog – audit log per sync operation
# ---------------------------------------------------------------------------

class EcommerceSyncLog(Base):
    """Log entry for each sync operation (manual or webhook-triggered)."""
    __tablename__ = "ecommerce_sync_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ecommerce_connections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("administrations.id", ondelete="CASCADE"),
        nullable=False,
    )

    status: Mapped[SyncStatus] = mapped_column(
        SQLEnum(SyncStatus), nullable=False, default=SyncStatus.PENDING,
    )
    trigger: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")  # manual | webhook | scheduled
    orders_imported: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    orders_updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    customers_imported: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    refunds_imported: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    connection = relationship("EcommerceConnection", back_populates="sync_logs")

    __table_args__ = (
        Index("ix_ecommerce_sync_logs_conn_started", "connection_id", "started_at"),
    )


# ---------------------------------------------------------------------------
# EcommerceMapping – Phase 2 review-and-map intermediate layer
# ---------------------------------------------------------------------------

class EcommerceMapping(Base):
    """
    Phase 2 review-and-map layer.

    Each row maps one imported order or refund into accounting-ready data.
    The user reviews, approves, and posts records through this table.

    Duplicate safety: unique constraints on order_id and refund_id prevent
    creating multiple mappings for the same source record.
    """
    __tablename__ = "ecommerce_mappings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("administrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ecommerce_connections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Source record – exactly one of these is set
    order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ecommerce_orders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    refund_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ecommerce_refunds.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    record_type: Mapped[str] = mapped_column(String(20), nullable=False, default="order")

    # Review workflow status
    review_status: Mapped[MappingReviewStatus] = mapped_column(
        SQLEnum(MappingReviewStatus, values_callable=lambda e: [x.value for x in e]),
        nullable=False,
        default=MappingReviewStatus.NEW,
        index=True,
    )

    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    external_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Mapped accounting amounts (all in cents)
    revenue_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tax_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shipping_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    refund_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    net_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # VAT handling
    vat_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    vat_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # auto = derived from source, manual = user-overridden, unknown = insufficient data
    vat_status: Mapped[str] = mapped_column(String(30), nullable=False, default="auto")

    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    accounting_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Duplicate-safe posting reference: what was created in accounting
    posted_entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    posted_entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Audit trail
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    # Relationships
    connection = relationship("EcommerceConnection")
    order = relationship("EcommerceOrder")
    refund = relationship("EcommerceRefund")

    __table_args__ = (
        UniqueConstraint("order_id", name="uq_ecommerce_mapping_order"),
        UniqueConstraint("refund_id", name="uq_ecommerce_mapping_refund"),
        Index("ix_ecommerce_mappings_admin_status", "administration_id", "review_status"),
    )
