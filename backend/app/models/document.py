import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, DateTime, func, ForeignKey, Enum as SQLEnum, Text, JSON, Boolean, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class DocumentStatus(str, enum.Enum):
    """Document workflow states for the intake pipeline."""
    UPLOADED = "UPLOADED"           # Just uploaded, waiting for processing
    PROCESSING = "PROCESSING"       # Being processed/extracted
    EXTRACTED = "EXTRACTED"         # Fields extracted, ready for matching
    NEEDS_REVIEW = "NEEDS_REVIEW"   # Needs accountant review
    POSTED = "POSTED"               # Successfully posted to journal
    REJECTED = "REJECTED"           # Rejected by accountant
    DRAFT_READY = "DRAFT_READY"     # Legacy: Draft transaction created
    FAILED = "FAILED"               # Processing failed


class Document(Base):
    """
    Document model for the intake pipeline.
    
    Workflow: UPLOADED -> PROCESSING -> EXTRACTED -> NEEDS_REVIEW -> POSTED/REJECTED
    """
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(
        SQLEnum(DocumentStatus), default=DocumentStatus.UPLOADED, nullable=False
    )
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    
    # === NEW: Document intake pipeline fields ===
    
    # Extracted invoice metadata (from OCR/parsing)
    supplier_name: Mapped[str] = mapped_column(String(255), nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=True)
    invoice_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="EUR", nullable=True)
    
    # Extraction confidence (0.0 - 1.0)
    extraction_confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=True)
    
    # Matching results
    matched_party_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("parties.id", ondelete="SET NULL"), nullable=True
    )
    matched_open_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("open_items.id", ondelete="SET NULL"), nullable=True
    )
    match_confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=True)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    duplicate_of_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    
    # Posting tracking
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    posted_journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True
    )
    
    # Rejection tracking
    rejected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rejection_reason: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Reprocessing tracking for idempotency
    process_count: Mapped[int] = mapped_column(default=0)
    last_processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    administration = relationship("Administration", back_populates="documents")
    extracted_fields = relationship("ExtractedField", back_populates="document", cascade="all, delete-orphan")
    transaction = relationship("Transaction", back_populates="document", uselist=False)
    journal_entry = relationship("JournalEntry", back_populates="document", uselist=False, foreign_keys="JournalEntry.document_id")
    issues = relationship("ClientIssue", back_populates="document")
    matched_party = relationship("Party", foreign_keys=[matched_party_id])
    matched_open_item = relationship("OpenItem", foreign_keys=[matched_open_item_id])
    posted_by = relationship("User", foreign_keys=[posted_by_id])
    rejected_by = relationship("User", foreign_keys=[rejected_by_id])
    posted_journal = relationship("JournalEntry", foreign_keys=[posted_journal_entry_id], uselist=False, post_update=True)
    duplicate_of = relationship("Document", foreign_keys=[duplicate_of_id], remote_side=[id])
    suggested_actions = relationship("DocumentSuggestedAction", back_populates="document", cascade="all, delete-orphan")


class ExtractedField(Base):
    __tablename__ = "extracted_fields"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    field_value: Mapped[str] = mapped_column(Text, nullable=True)
    confidence: Mapped[float] = mapped_column(nullable=True)
    raw_json: Mapped[dict] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    document = relationship("Document", back_populates="extracted_fields")


class DocumentSuggestedActionType(str, enum.Enum):
    """Types of suggested actions for documents."""
    ALLOCATE_OPEN_ITEM = "ALLOCATE_OPEN_ITEM"
    RECLASSIFY_TO_ASSET = "RECLASSIFY_TO_ASSET"
    CREATE_DEPRECIATION = "CREATE_DEPRECIATION"
    MARK_DUPLICATE = "MARK_DUPLICATE"
    POST_AS_EXPENSE = "POST_AS_EXPENSE"
    POST_AS_REVENUE = "POST_AS_REVENUE"
    NEEDS_MANUAL_REVIEW = "NEEDS_MANUAL_REVIEW"


class DocumentSuggestedAction(Base):
    """
    Suggested actions for documents during the review workflow.
    
    These are generated by the matching engine based on:
    - Duplicate detection
    - Open item matching
    - Asset purchase detection
    """
    __tablename__ = "document_suggested_actions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    action_type: Mapped[DocumentSuggestedActionType] = mapped_column(
        SQLEnum(DocumentSuggestedActionType), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    confidence_score: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.5000"))
    parameters: Mapped[dict] = mapped_column(JSON, nullable=True)
    priority: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    document = relationship("Document", back_populates="suggested_actions")


class DocumentAuditAction(str, enum.Enum):
    """Types of audit actions for documents."""
    UPLOADED = "UPLOADED"
    EXTRACTED = "EXTRACTED"
    MATCHED = "MATCHED"
    POSTED = "POSTED"
    REJECTED = "REJECTED"
    REPROCESSED = "REPROCESSED"


class DocumentAuditLog(Base):
    """
    Audit log for document workflow actions.
    
    Tracks all actions taken on documents for legal compliance.
    """
    __tablename__ = "document_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[DocumentAuditAction] = mapped_column(
        SQLEnum(DocumentAuditAction), nullable=False
    )
    from_status: Mapped[str] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    performed_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    result_journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    document = relationship("Document")
    administration = relationship("Administration")
    performed_by = relationship("User")
    result_journal_entry = relationship("JournalEntry")
