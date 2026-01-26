"""
Accountant Decision Engine Models

Models for the decision engine that allows accountants to:
- View suggested actions for detected issues
- Approve, reject, or override suggestions
- Track decision history and learn from patterns
"""
import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    String, DateTime, func, ForeignKey, Boolean, Numeric, 
    Text, Integer, Enum as SQLEnum, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class ActionType(str, enum.Enum):
    """Types of actions that can be suggested for issues."""
    RECLASSIFY_TO_ASSET = "RECLASSIFY_TO_ASSET"
    CREATE_DEPRECIATION = "CREATE_DEPRECIATION"
    CORRECT_VAT_RATE = "CORRECT_VAT_RATE"
    ALLOCATE_OPEN_ITEM = "ALLOCATE_OPEN_ITEM"
    FLAG_DOCUMENT_INVALID = "FLAG_DOCUMENT_INVALID"
    LOCK_PERIOD = "LOCK_PERIOD"
    REVERSE_JOURNAL_ENTRY = "REVERSE_JOURNAL_ENTRY"
    CREATE_ADJUSTMENT_ENTRY = "CREATE_ADJUSTMENT_ENTRY"


class DecisionType(str, enum.Enum):
    """Types of decisions an accountant can make."""
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    OVERRIDDEN = "OVERRIDDEN"


class ExecutionStatus(str, enum.Enum):
    """Status of action execution."""
    PENDING = "PENDING"
    EXECUTED = "EXECUTED"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"


class SuggestedAction(Base):
    """
    Suggested actions for detected issues.
    
    Each issue can have multiple suggested actions with confidence scores.
    Higher confidence scores indicate better suggestions based on historical patterns.
    """
    __tablename__ = "suggested_actions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_issues.id", ondelete="CASCADE"), nullable=False
    )
    action_type: Mapped[ActionType] = mapped_column(
        SQLEnum(ActionType), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    parameters: Mapped[dict] = mapped_column(JSONB, nullable=True)
    confidence_score: Mapped[Decimal] = mapped_column(
        Numeric(5, 4), default=Decimal("0.5000"), nullable=False
    )
    is_auto_suggested: Mapped[bool] = mapped_column(Boolean, default=False)
    priority: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    issue = relationship("ClientIssue", back_populates="suggested_actions")
    decisions = relationship("AccountantDecision", back_populates="suggested_action")


class AccountantDecision(Base):
    """
    Records of accountant decisions on issues.
    
    Tracks what decision was made (approve/reject/override),
    execution status, and provides full audit trail.
    """
    __tablename__ = "accountant_decisions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_issues.id", ondelete="CASCADE"), nullable=False
    )
    suggested_action_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suggested_actions.id", ondelete="SET NULL"), nullable=True
    )
    action_type: Mapped[ActionType] = mapped_column(
        SQLEnum(ActionType), nullable=False
    )
    decision: Mapped[DecisionType] = mapped_column(
        SQLEnum(DecisionType), nullable=False
    )
    override_parameters: Mapped[dict] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    decided_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    execution_status: Mapped[ExecutionStatus] = mapped_column(
        SQLEnum(ExecutionStatus), default=ExecutionStatus.PENDING, nullable=False
    )
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    execution_error: Mapped[str] = mapped_column(Text, nullable=True)
    result_journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True
    )
    is_reversible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reversed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    reversed_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    issue = relationship("ClientIssue", back_populates="decisions")
    suggested_action = relationship("SuggestedAction", back_populates="decisions")
    decided_by = relationship("User", foreign_keys=[decided_by_id])
    reversed_by = relationship("User", foreign_keys=[reversed_by_id])
    result_journal_entry = relationship("JournalEntry")


class DecisionPattern(Base):
    """
    Tracks patterns of decisions for learning loop.
    
    When the same issue + action is approved multiple times for the same client,
    the confidence score is boosted for future suggestions.
    """
    __tablename__ = "decision_patterns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    issue_code: Mapped[str] = mapped_column(String(50), nullable=False)
    action_type: Mapped[ActionType] = mapped_column(
        SQLEnum(ActionType), nullable=False
    )
    approval_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rejection_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    confidence_boost: Mapped[Decimal] = mapped_column(
        Numeric(5, 4), default=Decimal("0.0000"), nullable=False
    )
    last_approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    last_rejected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    administration = relationship("Administration", back_populates="decision_patterns")

    __table_args__ = (
        UniqueConstraint('administration_id', 'issue_code', 'action_type', name='uq_decision_pattern'),
    )
