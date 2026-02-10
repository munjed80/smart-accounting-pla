"""
Payment System Models

Implements a proper payment tracking system separate from invoices.
Supports partial payments, payment reconciliation, and payment history.

This improves accuracy over simple invoice status flags by:
1. Tracking multiple payments per invoice (partial payments)
2. Recording payment method, date, and reference
3. Maintaining an audit trail of all payment activities
4. Allowing payment allocation across multiple invoices
5. Supporting payment reversals and corrections
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from enum import Enum

from sqlalchemy import String, DateTime, Integer, Boolean, Text, func, ForeignKey, Enum as SQLEnum, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PaymentStatus(str, Enum):
    """Payment status values."""
    PENDING = "pending"        # Payment initiated but not confirmed
    COMPLETED = "completed"    # Payment confirmed and allocated
    FAILED = "failed"          # Payment failed (e.g., bounced)
    REVERSED = "reversed"      # Payment reversed (e.g., refund)
    CANCELLED = "cancelled"    # Payment cancelled before completion


class PaymentMethod(str, Enum):
    """Payment method types."""
    BANK_TRANSFER = "bank_transfer"
    CASH = "cash"
    CARD = "card"
    IDEAL = "ideal"
    OTHER = "other"


class ZZPPayment(Base):
    """
    Payment record for ZZP invoices.
    
    Tracks all payments made by customers, supporting:
    - Multiple payments per invoice (partial payments)
    - Payment from bank reconciliation
    - Manual payment registration
    - Payment allocation to multiple invoices
    
    Fields:
    - administration_id: Links to business administration
    - customer_id: Who made the payment
    - amount_cents: Total payment amount
    - payment_date: When payment was received
    - payment_method: How payment was made
    - reference: Payment reference (e.g., bank transaction ID)
    - status: Current payment status
    - notes: Additional information
    """
    __tablename__ = "zzp_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("administrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    customer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zzp_customers.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    
    # Payment details
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    payment_method: Mapped[str] = mapped_column(
        String(50), nullable=False, default=PaymentMethod.BANK_TRANSFER.value
    )
    
    # Reference and tracking
    reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    bank_transaction_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bank_transactions.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    
    # Status
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=PaymentStatus.COMPLETED.value, index=True
    )
    
    # Notes
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    
    # Relationships
    administration = relationship("Administration")
    customer = relationship("ZZPCustomer")
    allocations: Mapped[List["ZZPPaymentAllocation"]] = relationship(
        "ZZPPaymentAllocation",
        back_populates="payment",
        cascade="all, delete-orphan"
    )


class ZZPPaymentAllocation(Base):
    """
    Payment allocation to invoices.
    
    Links payments to specific invoices, supporting:
    - Partial invoice payments (one payment to multiple invoices)
    - Multiple payments to one invoice (pay in installments)
    - Payment allocation history
    
    Fields:
    - payment_id: Which payment
    - invoice_id: Which invoice
    - allocated_amount_cents: How much of the payment goes to this invoice
    - allocation_date: When allocation was made
    """
    __tablename__ = "zzp_payment_allocations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zzp_payments.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zzp_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Allocation details
    allocated_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    allocation_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Notes
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Relationships
    payment: Mapped["ZZPPayment"] = relationship("ZZPPayment", back_populates="allocations")
    invoice = relationship("ZZPInvoice")
