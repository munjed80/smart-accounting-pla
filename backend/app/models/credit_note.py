"""Immutable sales credits and registered customer refunds, separate from receipts."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import (
    String,
    Integer,
    Numeric,
    Date,
    DateTime,
    Text,
    JSON,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class ZZPCreditNote(Base):
    __tablename__ = "zzp_credit_notes"
    __table_args__ = (
        UniqueConstraint("administration_id", "number", name="uq_credit_note_number"),
        UniqueConstraint(
            "administration_id", "creation_key", name="uq_credit_note_creation"
        ),
        CheckConstraint(
            "total_cents > 0 AND subtotal_cents >= 0 AND vat_cents >= 0 AND total_cents = subtotal_cents + vat_cents",
            name="ck_credit_note_amounts",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id"), nullable=False, index=True
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zzp_invoices.id"), nullable=False, index=True
    )
    number: Mapped[str] = mapped_column(String(50), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    subtotal_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    creation_key: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    lines: Mapped[list["ZZPCreditLine"]] = relationship(
        lazy="selectin", order_by="ZZPCreditLine.line_number"
    )


class ZZPCreditLine(Base):
    __tablename__ = "zzp_credit_lines"
    __table_args__ = (
        UniqueConstraint(
            "credit_note_id", "invoice_line_id", name="uq_credit_source_line"
        ),
        CheckConstraint(
            "quantity > 0 AND net_cents >= 0 AND vat_cents >= 0",
            name="ck_credit_line_amounts",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    credit_note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zzp_credit_notes.id"),
        nullable=False,
        index=True,
    )
    invoice_line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zzp_invoice_lines.id"),
        nullable=False,
        index=True,
    )
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    net_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_cents: Mapped[int] = mapped_column(Integer, nullable=False)


class ZZPCustomerRefund(Base):
    __tablename__ = "zzp_customer_refunds"
    __table_args__ = (
        UniqueConstraint(
            "administration_id", "creation_key", name="uq_customer_refund_creation"
        ),
        CheckConstraint("amount_cents > 0", name="ck_customer_refund_positive"),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id"), nullable=False, index=True
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zzp_invoices.id"), nullable=False, index=True
    )
    credit_note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zzp_credit_notes.id"),
        nullable=False,
        index=True,
    )
    refund_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    reference: Mapped[str] = mapped_column(String(255), nullable=False)
    creation_key: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ZZPCreditCounter(Base):
    __tablename__ = "zzp_credit_counters"
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id"), primary_key=True
    )
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
