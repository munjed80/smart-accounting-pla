"""
VAT Box Lineage Models

Tracks the source of every amount in VAT boxes for complete audit trail.
Each line represents a single transaction line's contribution to a VAT box.
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import String, DateTime, Date, func, ForeignKey, Numeric, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VatBoxLineage(Base):
    """
    VAT box lineage for audit trail.
    
    Each record represents a single source line's contribution to a VAT box.
    This provides a complete audit trail from box totals down to individual
    invoice lines, expense lines, and journal entries.
    
    The lineage is populated during VAT report generation and provides
    the foundation for drilldown reporting and evidence pack generation.
    """
    __tablename__ = "vat_box_lineage"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    
    # Multi-tenant isolation
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    
    # Period and box identification
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_periods.id", ondelete="CASCADE"), nullable=False
    )
    vat_box_code: Mapped[str] = mapped_column(String(10), nullable=False)  # e.g., "1a", "3b", "5b"
    
    # Amounts
    net_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, default=Decimal("0.00"))
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, default=Decimal("0.00"))
    
    # Source tracking
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)  # INVOICE_LINE, EXPENSE_LINE, JOURNAL_LINE
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # ID of the source line
    
    # Related entities for easy navigation
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False
    )
    journal_line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_lines.id", ondelete="CASCADE"), nullable=False
    )
    
    # VAT code used (for reference)
    vat_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vat_codes.id", ondelete="SET NULL"), nullable=True
    )
    
    # Transaction date and reference
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[str] = mapped_column(String(255), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Party information for ICP and reverse charge tracking
    party_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    party_name: Mapped[str] = mapped_column(String(255), nullable=True)
    party_vat_number: Mapped[str] = mapped_column(String(30), nullable=True)
    
    # Immutable timestamp for audit trail
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Relationships
    administration = relationship("Administration")
    period = relationship("AccountingPeriod")
    document = relationship("Document")
    journal_entry = relationship("JournalEntry")
    journal_line = relationship("JournalLine")
    vat_code = relationship("VatCode")

    # Indexes for efficient querying
    __table_args__ = (
        Index('ix_vat_lineage_period_box', 'period_id', 'vat_box_code'),
        Index('ix_vat_lineage_admin_period', 'administration_id', 'period_id'),
        Index('ix_vat_lineage_source', 'source_type', 'source_id'),
        Index('ix_vat_lineage_document', 'document_id'),
        Index('ix_vat_lineage_journal_entry', 'journal_entry_id'),
    )
