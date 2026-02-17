"""
VAT Submission Models

Tracks VAT/BTW submission history and status.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, func, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VatSubmission(Base):
    """
    VAT submission tracking.
    
    Tracks submission history, status, and references for BTW and ICP submissions.
    Supports both manual package submissions (Phase A) and future automated
    submissions via Digipoort (Phase B).
    
    Status Flow:
    - DRAFT: Package generated, not yet submitted
    - SUBMITTED: Manually marked as submitted to tax authority
    - CONFIRMED: Confirmed/accepted by tax authority (future: automated via Digipoort)
    - REJECTED: Rejected by tax authority (future: automated via Digipoort)
    """
    __tablename__ = "vat_submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    
    # Multi-tenant isolation
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    
    # Period reference
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_periods.id", ondelete="CASCADE"), nullable=False
    )
    
    # Submission type (BTW or ICP)
    submission_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="BTW"
    )  # BTW or ICP
    
    # Audit trail
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    
    # Submission method
    method: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PACKAGE"
    )  # PACKAGE (manual), DIGIPOORT (future automated)
    
    # Submission status
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="DRAFT"
    )  # DRAFT, SUBMITTED, CONFIRMED, REJECTED
    
    # Reference and evidence
    reference_text: Mapped[str] = mapped_column(Text, nullable=True)  # e.g., "Submitted via portal on DATE"
    attachment_url: Mapped[str] = mapped_column(String(500), nullable=True)  # optional proof upload
    
    # Submission timestamp
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Last update timestamp
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Relationships
    administration = relationship("Administration")
    period = relationship("AccountingPeriod")
    created_by_user = relationship("User")

    # Indexes for efficient querying
    __table_args__ = (
        Index('ix_vat_submissions_admin', 'administration_id'),
        Index('ix_vat_submissions_period', 'period_id'),
        Index('ix_vat_submissions_status', 'status'),
        Index('ix_vat_submissions_admin_period', 'administration_id', 'period_id'),
    )
