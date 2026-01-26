"""
Client Issues Models

Model for tracking consistency issues found by the validation engine.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    String, DateTime, func, ForeignKey, Boolean, Numeric, 
    Text, Enum as SQLEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class IssueSeverity(str, enum.Enum):
    RED = "RED"      # Immediate action required
    YELLOW = "YELLOW"  # Attention soon


class ValidationRunStatus(str, enum.Enum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


# Issue codes for the consistency engine
class IssueCode:
    # Ledger integrity
    JOURNAL_UNBALANCED = "JOURNAL_UNBALANCED"
    ORPHAN_LINE = "ORPHAN_LINE"
    MISSING_ACCOUNT = "MISSING_ACCOUNT"
    
    # AR/AP reconciliation
    AR_RECON_MISMATCH = "AR_RECON_MISMATCH"
    AP_RECON_MISMATCH = "AP_RECON_MISMATCH"
    OPEN_ITEM_NEGATIVE = "OPEN_ITEM_NEGATIVE"
    OVERDUE_RECEIVABLE = "OVERDUE_RECEIVABLE"
    OVERDUE_PAYABLE = "OVERDUE_PAYABLE"
    
    # Asset issues
    ASSET_EXPENSE_OVERRIDE = "ASSET_EXPENSE_OVERRIDE"
    DEPRECIATION_MISMATCH = "DEPRECIATION_MISMATCH"
    DEPRECIATION_NOT_POSTED = "DEPRECIATION_NOT_POSTED"
    
    # P&L issues
    PNL_MISMATCH = "PNL_MISMATCH"
    
    # VAT issues
    VAT_RATE_MISMATCH = "VAT_RATE_MISMATCH"
    VAT_NEGATIVE = "VAT_NEGATIVE"
    VAT_MISSING = "VAT_MISSING"


class ClientIssue(Base):
    """
    Consistency issues found by the validation engine.
    
    Each issue includes:
    - What is wrong (title)
    - Why it happened (why)
    - Suggested action
    - References to related entities
    """
    __tablename__ = "client_issues"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    issue_code: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[IssueSeverity] = mapped_column(
        SQLEnum(IssueSeverity), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    why: Mapped[str] = mapped_column(Text, nullable=True)
    suggested_action: Mapped[str] = mapped_column(Text, nullable=True)
    
    # References
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    fixed_asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fixed_assets.id", ondelete="SET NULL"), nullable=True
    )
    party_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("parties.id", ondelete="SET NULL"), nullable=True
    )
    open_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("open_items.id", ondelete="SET NULL"), nullable=True
    )
    
    # Metadata
    amount_discrepancy: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    administration = relationship("Administration", back_populates="client_issues")
    document = relationship("Document", back_populates="issues")
    journal_entry = relationship("JournalEntry", back_populates="issues")
    account = relationship("ChartOfAccount", back_populates="issues")
    fixed_asset = relationship("FixedAsset", back_populates="issues")
    party = relationship("Party", back_populates="issues")
    open_item = relationship("OpenItem", back_populates="issues")
    resolved_by = relationship("User")
    # Decision engine relationships
    suggested_actions = relationship("SuggestedAction", back_populates="issue", cascade="all, delete-orphan")
    decisions = relationship("AccountantDecision", back_populates="issue", cascade="all, delete-orphan")


class ValidationRun(Base):
    """Tracks validation/recalculation runs for audit trail."""
    __tablename__ = "validation_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    triggered_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    issues_found: Mapped[int] = mapped_column(nullable=True)
    issues_resolved: Mapped[int] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="RUNNING", nullable=False)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)

    # Relationships
    administration = relationship("Administration", back_populates="validation_runs")
    triggered_by = relationship("User")
