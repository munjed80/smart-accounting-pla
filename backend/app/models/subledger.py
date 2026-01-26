"""
Subledger Models

Models for accounts receivable (Debiteuren) and accounts payable (Crediteuren):
- Parties (customers/suppliers)
- Open items for tracking outstanding invoices
- Allocations for payment matching
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import (
    String, DateTime, Date, func, ForeignKey, Boolean, Numeric, 
    Text, Integer, Enum as SQLEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class PartyType(str, enum.Enum):
    CUSTOMER = "CUSTOMER"
    SUPPLIER = "SUPPLIER"


class OpenItemStatus(str, enum.Enum):
    OPEN = "OPEN"
    PARTIAL = "PARTIAL"
    PAID = "PAID"
    WRITTEN_OFF = "WRITTEN_OFF"


class Party(Base):
    """Customer or supplier for subledger tracking."""
    __tablename__ = "parties"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    party_type: Mapped[str] = mapped_column(String(20), nullable=False)  # CUSTOMER, SUPPLIER
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    tax_number: Mapped[str] = mapped_column(String(50), nullable=True)
    kvk_number: Mapped[str] = mapped_column(String(50), nullable=True)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30, nullable=True)
    default_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    administration = relationship("Administration", back_populates="parties")
    default_account = relationship("ChartOfAccount")
    open_items = relationship("OpenItem", back_populates="party")
    issues = relationship("ClientIssue", back_populates="party")


class OpenItem(Base):
    """
    Open items for AR (Debiteuren) and AP (Crediteuren) tracking.
    
    These derive from journal entries posted to control accounts
    and track outstanding amounts until fully paid/allocated.
    """
    __tablename__ = "open_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    party_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("parties.id", ondelete="CASCADE"), nullable=False
    )
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False
    )
    journal_line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_lines.id", ondelete="CASCADE"), nullable=False
    )
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)  # RECEIVABLE, PAYABLE
    document_number: Mapped[str] = mapped_column(String(100), nullable=True)
    document_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    original_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    open_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="EUR", nullable=False)
    status: Mapped[OpenItemStatus] = mapped_column(
        SQLEnum(OpenItemStatus), default=OpenItemStatus.OPEN, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    administration = relationship("Administration", back_populates="open_items")
    party = relationship("Party", back_populates="open_items")
    journal_entry = relationship("JournalEntry", back_populates="open_items")
    journal_line = relationship("JournalLine", back_populates="open_items")
    allocations = relationship("OpenItemAllocation", back_populates="open_item")
    issues = relationship("ClientIssue", back_populates="open_item")

    def update_status(self) -> None:
        """Update status based on paid vs original amount."""
        if self.paid_amount >= self.original_amount:
            self.status = OpenItemStatus.PAID
            self.open_amount = Decimal("0.00")
        elif self.paid_amount > Decimal("0.00"):
            self.status = OpenItemStatus.PARTIAL
            self.open_amount = self.original_amount - self.paid_amount
        else:
            self.status = OpenItemStatus.OPEN
            self.open_amount = self.original_amount


class OpenItemAllocation(Base):
    """Allocation of payments to open items."""
    __tablename__ = "open_item_allocations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    open_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("open_items.id", ondelete="CASCADE"), nullable=False
    )
    payment_journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False
    )
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    allocation_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    open_item = relationship("OpenItem", back_populates="allocations")
    payment_journal_entry = relationship("JournalEntry")
