"""
Accountant Dashboard Models

Models for accountant-client assignments and bulk operations tracking.
"""
import uuid
from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import (
    String, DateTime, func, ForeignKey, Boolean, Integer,
    Text, Enum as SQLEnum, Date
)
from sqlalchemy.dialects.postgresql import UUID, JSON, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class AssignmentStatus(str, enum.Enum):
    """Status of an accountant-client assignment."""
    PENDING = "PENDING"  # Invited but not yet approved by client
    ACTIVE = "ACTIVE"    # Approved and active
    REVOKED = "REVOKED"  # Revoked by client or accountant


class InvitedBy(str, enum.Enum):
    """Who initiated the assignment."""
    ACCOUNTANT = "ACCOUNTANT"  # Self-serve invitation by accountant
    ADMIN = "ADMIN"            # Admin-created assignment


class AccountantClientAssignment(Base):
    """
    Tracks which accountants are assigned to which clients with consent workflow.
    
    Consent Workflow:
    1. Accountant invites ZZP client by email -> status=PENDING
    2. ZZP client approves -> status=ACTIVE
    3. Either party can revoke -> status=REVOKED
    
    Key Identifiers (to avoid confusion):
    - accountant_id: UUID of the accountant User (role=accountant)
    - client_user_id: UUID of the ZZP User (role=zzp) who owns the administration
    - administration_id: UUID of the Administration (business entity) being managed
    
    Access Control:
    - Only ACTIVE assignments grant accountant access to client data
    - Used in require_assigned_client() guard for authorization
    """
    __tablename__ = "accountant_client_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    accountant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    client_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[AssignmentStatus] = mapped_column(
        SQLEnum(AssignmentStatus), default=AssignmentStatus.ACTIVE, nullable=False
    )
    invited_by: Mapped[InvitedBy] = mapped_column(
        SQLEnum(InvitedBy), default=InvitedBy.ADMIN, nullable=False
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    assigned_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    # Relationships
    accountant = relationship("User", foreign_keys=[accountant_id])
    client_user = relationship("User", foreign_keys=[client_user_id])
    administration = relationship("Administration")
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])


class BulkOperationType(str, enum.Enum):
    """Types of bulk operations supported."""
    BULK_RECALCULATE = "BULK_RECALCULATE"
    BULK_ACK_YELLOW = "BULK_ACK_YELLOW"
    BULK_GENERATE_VAT_DRAFT = "BULK_GENERATE_VAT_DRAFT"
    BULK_SEND_CLIENT_REMINDERS = "BULK_SEND_CLIENT_REMINDERS"
    BULK_LOCK_PERIOD = "BULK_LOCK_PERIOD"


class BulkOperationStatus(str, enum.Enum):
    """Status of a bulk operation."""
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    COMPLETED_WITH_ERRORS = "COMPLETED_WITH_ERRORS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class BulkOperation(Base):
    """
    Tracks bulk operations across multiple clients.
    
    Key features:
    - Idempotent: duplicate operations are detected via idempotency_key
    - Auditable: full tracking of who initiated, when, and results
    - Rate-limited: can check for recent similar operations
    """
    __tablename__ = "bulk_operations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    operation_type: Mapped[BulkOperationType] = mapped_column(
        SQLEnum(BulkOperationType), nullable=False
    )
    status: Mapped[BulkOperationStatus] = mapped_column(
        SQLEnum(BulkOperationStatus), default=BulkOperationStatus.PENDING, nullable=False
    )
    initiated_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    parameters: Mapped[dict] = mapped_column(JSON, nullable=True)
    target_client_ids: Mapped[List[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=True)
    total_clients: Mapped[int] = mapped_column(Integer, nullable=True)
    processed_clients: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    successful_clients: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    failed_clients: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=True, unique=True)

    # Relationships
    initiated_by = relationship("User")
    results = relationship("BulkOperationResult", back_populates="bulk_operation", cascade="all, delete-orphan")


class BulkOperationResult(Base):
    """
    Per-client results for a bulk operation.
    """
    __tablename__ = "bulk_operation_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bulk_operation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bulk_operations.id", ondelete="CASCADE"), nullable=False
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # SUCCESS, FAILED, SKIPPED
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    result_data: Mapped[dict] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)

    # Relationships
    bulk_operation = relationship("BulkOperation", back_populates="results")
    administration = relationship("Administration")


class ReminderType(str, enum.Enum):
    """Types of client reminders."""
    DOCUMENT_MISSING = "DOCUMENT_MISSING"
    VAT_DEADLINE = "VAT_DEADLINE"
    REVIEW_PENDING = "REVIEW_PENDING"
    ACTION_REQUIRED = "ACTION_REQUIRED"


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


class ClientReminder(Base):
    """
    Reminders/tasks for clients created by accountants.
    
    Supports multiple channels:
    - IN_APP: Notification visible in the client's dashboard
    - EMAIL: Email sent via Resend (optional, requires RESEND_API_KEY)
    """
    __tablename__ = "client_reminders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    reminder_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dismissed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    bulk_operation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bulk_operations.id", ondelete="SET NULL"), nullable=True
    )
    
    # Enhanced fields for multi-channel reminders
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="IN_APP")
    template_id: Mapped[str] = mapped_column(String(100), nullable=True)
    variables: Mapped[dict] = mapped_column(JSON, nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    email_address: Mapped[str] = mapped_column(String(255), nullable=True)
    send_error: Mapped[str] = mapped_column(Text, nullable=True)

    # Relationships
    administration = relationship("Administration")
    created_by = relationship("User")
    bulk_operation = relationship("BulkOperation")
