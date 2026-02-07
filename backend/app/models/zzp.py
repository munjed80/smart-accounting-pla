"""
ZZP Models

SQLAlchemy models for ZZP-specific entities like customers, invoices, etc.
These are used by ZZP users to manage their business data.
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from enum import Enum
from sqlalchemy import String, DateTime, Date, Numeric, Integer, Boolean, Text, func, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InvoiceStatus(str, Enum):
    """Invoice status values."""
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class ZZPCustomer(Base):
    """
    Customer entity for ZZP users.
    
    Stores customer/client information with optional business details
    for invoicing and contact management.
    
    Fields:
    - name (required): Customer or company name
    - email, phone (optional): Contact details
    - contact_person (optional): Name of contact person
    - address_* (optional): Full address breakdown
    - address_line2 (optional): Secondary address line (apt, suite, etc.)
    - kvk_number (optional): Dutch Chamber of Commerce number
    - btw_number (optional): Dutch VAT/BTW number
    - iban, bank_bic (optional): Bank account details
    - notes (optional): General notes
    - status: 'active' or 'inactive'
    """
    __tablename__ = "zzp_customers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    
    # Basic info
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    contact_person: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Address fields
    address_street: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    address_line2: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    address_postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Nederland")
    
    # Business identifiers
    kvk_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    btw_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    
    # Bank details
    iban: Mapped[Optional[str]] = mapped_column(String(34), nullable=True)
    bank_bic: Mapped[Optional[str]] = mapped_column(String(11), nullable=True)
    
    # Notes
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Status
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    
    # Relationships
    administration = relationship("Administration")


class BusinessProfile(Base):
    """
    Business profile for ZZP users (1:1 with administration).
    
    Stores company information used on invoices as seller details.
    This data is snapshotted to invoices at creation time to preserve
    historical accuracy.
    
    Fields:
    - company_name (required): Official company name
    - trading_name (optional): Handelsnaam if different
    - address_* (optional): Business address
    - kvk_number, btw_number (optional): Dutch business IDs
    - iban (optional): Bank account for payments
    - email, phone, website (optional): Contact details
    - logo_url (optional): Company logo URL
    """
    __tablename__ = "business_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=False,
        unique=True,
        index=True
    )
    
    # Company identity
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    trading_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Address fields
    address_street: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    address_postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Nederland")
    
    # Business identifiers
    kvk_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    btw_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    
    # Bank details
    iban: Mapped[Optional[str]] = mapped_column(String(34), nullable=True)
    
    # Contact details
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Logo
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    
    # Relationships
    administration = relationship("Administration")


class ZZPInvoice(Base):
    """
    Invoice entity for ZZP users.
    
    Stores invoice header information with seller snapshot from BusinessProfile
    at creation time. Invoice lines are stored separately.
    
    Fields:
    - invoice_number (required): Sequential invoice number per administration
    - customer_id (required): Reference to customer
    - status: draft/sent/paid/overdue/cancelled
    - issue_date, due_date: Invoice dates
    - Seller snapshot fields: Copied from BusinessProfile at creation
    - notes: Optional invoice notes
    """
    __tablename__ = "zzp_invoices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("zzp_customers.id", ondelete="RESTRICT"), 
        nullable=False,
        index=True
    )
    
    # Invoice number (unique per administration)
    invoice_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    
    # Status
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=InvoiceStatus.DRAFT.value, index=True
    )
    
    # Dates
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    
    # Seller snapshot (from BusinessProfile at creation time)
    seller_company_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    seller_trading_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    seller_address_street: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    seller_address_postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    seller_address_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    seller_address_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    seller_kvk_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    seller_btw_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    seller_iban: Mapped[Optional[str]] = mapped_column(String(34), nullable=True)
    seller_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    seller_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # Customer snapshot (from customer at creation time)
    customer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    customer_address_street: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    customer_address_postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    customer_address_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    customer_address_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    customer_kvk_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    customer_btw_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    
    # Totals (calculated from lines)
    subtotal_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vat_total_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Optional notes
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
    lines: Mapped[List["ZZPInvoiceLine"]] = relationship(
        "ZZPInvoiceLine", 
        back_populates="invoice", 
        cascade="all, delete-orphan",
        order_by="ZZPInvoiceLine.line_number"
    )


class ZZPInvoiceLine(Base):
    """
    Invoice line item for ZZP invoices.
    
    Fields:
    - description (required): Line item description
    - quantity, unit_price_cents: For calculating line total
    - vat_rate: VAT percentage (0, 9, or 21 in NL)
    - line_total_cents, vat_amount_cents: Calculated totals
    """
    __tablename__ = "zzp_invoice_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("zzp_invoices.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    
    # Line number for ordering
    line_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    
    # Line item details
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=1)
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # VAT rate as percentage (0, 9, 21)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=21)
    
    # Calculated totals
    line_total_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vat_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    
    # Relationships
    invoice: Mapped["ZZPInvoice"] = relationship("ZZPInvoice", back_populates="lines")


class ZZPInvoiceCounter(Base):
    """
    Invoice number counter per administration.
    
    Used to generate sequential invoice numbers in a race-safe manner.
    Uses SELECT FOR UPDATE to prevent duplicate numbers.
    """
    __tablename__ = "zzp_invoice_counters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=False,
        unique=True,
        index=True
    )
    
    # Year and counter
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    counter: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Timestamps
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ZZPExpense(Base):
    """
    Expense entity for ZZP users.
    
    Tracks business expenses with vendor, category, and VAT details.
    
    Fields:
    - vendor (required): Vendor/supplier name
    - date (required): Expense date
    - amount_cents (required): Total amount in cents
    - vat_rate: VAT percentage (0, 9, or 21)
    - category: Expense category for reporting
    - notes: Optional notes
    - attachment_url: Optional receipt/document URL
    """
    __tablename__ = "zzp_expenses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    
    # Expense details
    vendor: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    
    # Amount and VAT
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=21)
    vat_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Category
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="algemeen", index=True)
    
    # Optional fields
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attachment_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    
    # Relationships
    administration = relationship("Administration")


class ZZPTimeEntry(Base):
    """
    Time entry for ZZP users.
    
    Tracks billable and non-billable time for projects/clients.
    
    Fields:
    - entry_date (required): Date of the time entry
    - description (required): What was worked on
    - hours (required): Number of hours
    - project_name: Optional project/client name
    - hourly_rate_cents: Optional hourly rate for billing
    - billable: Whether this time is billable
    """
    __tablename__ = "zzp_time_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    
    # Time entry details
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    
    # Optional project/client reference
    project_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    customer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("zzp_customers.id", ondelete="SET NULL"), 
        nullable=True,
        index=True
    )
    
    # Billing
    hourly_rate_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    billable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    
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


class ZZPCalendarEvent(Base):
    """
    Calendar event for ZZP users.
    
    Simple event/appointment tracking.
    
    Fields:
    - title (required): Event title
    - start_datetime (required): Event start
    - end_datetime (required): Event end
    - location: Optional location
    - notes: Optional notes
    """
    __tablename__ = "zzp_calendar_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    
    # Event details
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    
    # Optional fields
    location: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
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
