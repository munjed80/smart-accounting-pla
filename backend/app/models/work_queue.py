"""
Work Queue and Enhanced Dashboard Models

Models for:
- Client readiness score caching
- Escalation events for SLA tracking
- Evidence packs for compliance export
- Dashboard audit logging
"""
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, DateTime, func, ForeignKey, Boolean, Integer, BigInteger,
    Text, Enum as SQLEnum
)
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class ClientReadinessCache(Base):
    """
    Cached readiness scores for efficient querying.
    
    Updated by scheduled job or on-demand when data changes.
    Allows for efficient sorting and filtering without N+1 queries.
    """
    __tablename__ = "client_readiness_cache"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=False, unique=True
    )
    readiness_score: Mapped[int] = mapped_column(Integer, nullable=False)
    readiness_breakdown: Mapped[dict] = mapped_column(JSON, nullable=True)
    red_issue_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    yellow_issue_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    document_backlog: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vat_days_remaining: Mapped[int] = mapped_column(Integer, nullable=True)
    period_status: Mapped[str] = mapped_column(String(50), nullable=True)
    has_critical_alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    staleness_days: Mapped[int] = mapped_column(Integer, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    administration = relationship("Administration")


class EscalationType(str, enum.Enum):
    """Types of escalation events."""
    RED_UNRESOLVED = "RED_UNRESOLVED"  # RED issues unresolved > threshold
    VAT_DEADLINE = "VAT_DEADLINE"       # VAT due within threshold
    REVIEW_STALE = "REVIEW_STALE"       # REVIEW state > threshold
    BACKLOG_HIGH = "BACKLOG_HIGH"       # Document backlog > threshold


class EscalationSeverity(str, enum.Enum):
    """Severity levels for escalations."""
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class EscalationEvent(Base):
    """
    Tracks SLA violations and escalation events.
    
    Ensures auditability of when SLA thresholds were breached
    and who acknowledged them.
    """
    __tablename__ = "escalation_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=True
    )
    escalation_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    trigger_reason: Mapped[str] = mapped_column(Text, nullable=False)
    threshold_value: Mapped[int] = mapped_column(Integer, nullable=True)
    actual_value: Mapped[int] = mapped_column(Integer, nullable=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolution_notes: Mapped[str] = mapped_column(Text, nullable=True)

    # Relationships
    administration = relationship("Administration")
    acknowledged_by = relationship("User", foreign_keys=[acknowledged_by_id])


class ReminderChannel(str, enum.Enum):
    """Channels for sending reminders."""
    IN_APP = "IN_APP"
    EMAIL = "EMAIL"


class ReminderStatus(str, enum.Enum):
    """Status of a reminder."""
    PENDING = "PENDING"
    SCHEDULED = "SCHEDULED"
    SENT = "SENT"
    FAILED = "FAILED"


class EvidencePackType(str, enum.Enum):
    """Types of evidence packs."""
    VAT_EVIDENCE = "VAT_EVIDENCE"
    AUDIT_TRAIL = "AUDIT_TRAIL"


class EvidencePack(Base):
    """
    VAT Evidence Pack for compliance export.
    
    Contains:
    - Summary of VAT boxes
    - List of relevant journal entries
    - List of invoices/documents used in VAT calculation
    - Validation status + acknowledged issues
    - Period snapshot hash/id
    """
    __tablename__ = "evidence_packs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=False
    )
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_periods.id", ondelete="CASCADE"), 
        nullable=False
    )
    pack_type: Mapped[str] = mapped_column(String(50), nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), 
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA256
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=True)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, nullable=True)
    download_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_downloaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    last_downloaded_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    administration = relationship("Administration")
    period = relationship("AccountingPeriod")
    created_by = relationship("User", foreign_keys=[created_by_id])
    last_downloaded_by = relationship("User", foreign_keys=[last_downloaded_by_id])


class DashboardAuditActionType(str, enum.Enum):
    """Types of audit actions."""
    REMINDER_SEND = "REMINDER_SEND"
    REMINDER_SCHEDULE = "REMINDER_SCHEDULE"
    EVIDENCE_PACK_GENERATE = "EVIDENCE_PACK_GENERATE"
    EVIDENCE_PACK_DOWNLOAD = "EVIDENCE_PACK_DOWNLOAD"


class DashboardAuditLog(Base):
    """
    Audit log for dashboard operations.
    
    Tracks:
    - Reminder send/schedule
    - Evidence pack generation/download
    """
    __tablename__ = "dashboard_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), 
        nullable=False
    )
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="SET NULL"), 
        nullable=True
    )
    entity_type: Mapped[str] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    user = relationship("User")
    administration = relationship("Administration")
