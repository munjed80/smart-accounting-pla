"""
Core Ledger Models

These models support the core accounting backbone:
- Journal entries with double-entry enforcement
- Journal lines for debit/credit postings
- Accounting periods for reporting boundaries
- Period control and finalization
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import (
    String, DateTime, Date, func, ForeignKey, Boolean, Numeric, 
    Text, Integer, Enum as SQLEnum
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class JournalEntryStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    POSTED = "POSTED"
    REVERSED = "REVERSED"


class PeriodStatus(str, enum.Enum):
    """Status of an accounting period."""
    OPEN = "OPEN"           # Accepts new postings
    REVIEW = "REVIEW"       # Under review, accepts new postings
    FINALIZED = "FINALIZED" # No changes, only reversals into next OPEN period
    LOCKED = "LOCKED"       # Immutable, hard lock


class AccountingPeriod(Base):
    """Accounting period for reporting boundaries (month/quarter/year)."""
    __tablename__ = "accounting_periods"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    period_type: Mapped[str] = mapped_column(String(20), nullable=False)  # MONTH, QUARTER, YEAR
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    
    # Period Control Fields
    status: Mapped[PeriodStatus] = mapped_column(
        SQLEnum(PeriodStatus), default=PeriodStatus.OPEN, nullable=False
    )
    # Review tracking
    review_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    review_started_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Finalization tracking
    finalized_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    finalized_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Lock tracking
    locked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    administration = relationship("Administration", back_populates="accounting_periods")
    journal_entries = relationship("JournalEntry", back_populates="period")
    snapshots = relationship("PeriodSnapshot", back_populates="period")
    audit_logs = relationship("PeriodAuditLog", back_populates="period")
    review_started_by = relationship("User", foreign_keys=[review_started_by_id])
    finalized_by = relationship("User", foreign_keys=[finalized_by_id])
    locked_by = relationship("User", foreign_keys=[locked_by_id])
    
    def can_accept_postings(self) -> bool:
        """Check if this period can accept new journal entries."""
        return self.status in (PeriodStatus.OPEN, PeriodStatus.REVIEW)
    
    def can_be_modified(self) -> bool:
        """Check if this period's entries can be modified."""
        return self.status in (PeriodStatus.OPEN, PeriodStatus.REVIEW)
    
    def is_immutable(self) -> bool:
        """Check if this period is completely immutable."""
        return self.status == PeriodStatus.LOCKED


class PeriodSnapshot(Base):
    """
    Immutable snapshot of period financials at finalization time.
    
    This record cannot be modified after creation and serves as a
    legal audit trail of the period's state at finalization.
    """
    __tablename__ = "period_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_periods.id", ondelete="CASCADE"), nullable=False
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_type: Mapped[str] = mapped_column(String(20), nullable=False)  # FINALIZATION
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    
    # Financial data snapshots (stored as JSONB for immutability)
    balance_sheet: Mapped[dict] = mapped_column(JSONB, nullable=True)
    profit_and_loss: Mapped[dict] = mapped_column(JSONB, nullable=True)
    vat_summary: Mapped[dict] = mapped_column(JSONB, nullable=True)
    open_ar_balances: Mapped[dict] = mapped_column(JSONB, nullable=True)
    open_ap_balances: Mapped[dict] = mapped_column(JSONB, nullable=True)
    trial_balance: Mapped[dict] = mapped_column(JSONB, nullable=True)
    
    # Summary metrics
    total_assets: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    total_liabilities: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    total_equity: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    net_income: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    total_ar: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    total_ap: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    vat_payable: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    vat_receivable: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    
    # Issue acknowledgments
    acknowledged_yellow_issues: Mapped[dict] = mapped_column(JSONB, nullable=True)
    issue_summary: Mapped[dict] = mapped_column(JSONB, nullable=True)

    # Relationships
    period = relationship("AccountingPeriod", back_populates="snapshots")
    administration = relationship("Administration")
    created_by = relationship("User")
    audit_logs = relationship("PeriodAuditLog", back_populates="snapshot")


class PeriodAuditLog(Base):
    """
    Audit log for all period control actions.
    
    Tracks who did what, when, and why for legal compliance.
    """
    __tablename__ = "period_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_periods.id", ondelete="CASCADE"), nullable=False
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # REVIEW_START, FINALIZE, LOCK
    from_status: Mapped[str] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    performed_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str] = mapped_column(Text, nullable=True)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("period_snapshots.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    period = relationship("AccountingPeriod", back_populates="audit_logs")
    administration = relationship("Administration")
    performed_by = relationship("User")
    snapshot = relationship("PeriodSnapshot", back_populates="audit_logs")


class JournalEntry(Base):
    """Journal entry header - enforces double-entry accounting."""
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_periods.id", ondelete="SET NULL"), nullable=True
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    entry_number: Mapped[str] = mapped_column(String(50), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    reference: Mapped[str] = mapped_column(String(100), nullable=True)
    status: Mapped[JournalEntryStatus] = mapped_column(
        SQLEnum(JournalEntryStatus), default=JournalEntryStatus.DRAFT, nullable=False
    )
    total_debit: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    total_credit: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    is_balanced: Mapped[bool] = mapped_column(Boolean, default=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=True)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    reversed_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True
    )
    reverses_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True
    )
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    administration = relationship("Administration", back_populates="journal_entries")
    period = relationship("AccountingPeriod", back_populates="journal_entries")
    document = relationship("Document", back_populates="journal_entry", foreign_keys=[document_id])
    lines = relationship("JournalLine", back_populates="journal_entry", cascade="all, delete-orphan")
    posted_by = relationship("User", foreign_keys=[posted_by_id])
    reversed_by = relationship("JournalEntry", foreign_keys=[reversed_by_id], remote_side=[id])
    reverses = relationship("JournalEntry", foreign_keys=[reverses_id], remote_side=[id])
    open_items = relationship("OpenItem", back_populates="journal_entry")
    issues = relationship("ClientIssue", back_populates="journal_entry")

    def calculate_totals(self) -> None:
        """Calculate totals from lines and check balance."""
        self.total_debit = sum(line.debit_amount or Decimal("0.00") for line in self.lines)
        self.total_credit = sum(line.credit_amount or Decimal("0.00") for line in self.lines)
        self.is_balanced = self.total_debit == self.total_credit


class JournalLine(Base):
    """Individual debit/credit line in a journal entry."""
    __tablename__ = "journal_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    debit_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    credit_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    vat_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vat_codes.id", ondelete="SET NULL"), nullable=True
    )
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    taxable_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    # Extended VAT fields for Dutch BTW compliance
    vat_base_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)  # Base amount for VAT calculation
    vat_country: Mapped[str] = mapped_column(String(2), nullable=True)  # ISO country code (e.g., NL, DE, BE)
    vat_is_reverse_charge: Mapped[bool] = mapped_column(Boolean, default=False)  # Reverse charge indicator
    party_type: Mapped[str] = mapped_column(String(20), nullable=True)  # CUSTOMER, SUPPLIER
    party_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Party VAT number for ICP reporting
    party_vat_number: Mapped[str] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    journal_entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("ChartOfAccount", back_populates="journal_lines")
    vat_code = relationship("VatCode", back_populates="journal_lines")
    open_items = relationship("OpenItem", back_populates="journal_line")
