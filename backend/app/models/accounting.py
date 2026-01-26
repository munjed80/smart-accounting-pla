import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, DateTime, func, ForeignKey, Boolean, Numeric, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class ChartOfAccount(Base):
    __tablename__ = "chart_of_accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    account_code: Mapped[str] = mapped_column(String(20), nullable=False)
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[str] = mapped_column(String(50), nullable=False)  # ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    parent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Control account flags for AR/AP reconciliation
    is_control_account: Mapped[bool] = mapped_column(Boolean, default=False)
    control_type: Mapped[str] = mapped_column(String(20), nullable=True)  # AR, AP, BANK, VAT
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    administration = relationship("Administration", back_populates="chart_of_accounts")
    transaction_lines = relationship("TransactionLine", back_populates="account")
    journal_lines = relationship("JournalLine", back_populates="account")
    children = relationship("ChartOfAccount", back_populates="parent")
    parent = relationship("ChartOfAccount", back_populates="children", remote_side=[id])
    issues = relationship("ClientIssue", back_populates="account")


class VatCategory(str, enum.Enum):
    """VAT category for classification of VAT codes."""
    SALES = "SALES"                     # Standard sales VAT
    PURCHASES = "PURCHASES"             # Standard purchase VAT (input tax)
    REVERSE_CHARGE = "REVERSE_CHARGE"   # Reverse charge mechanism
    INTRA_EU = "INTRA_EU"               # Intra-EU transactions
    EXEMPT = "EXEMPT"                   # VAT exempt transactions
    ZERO_RATE = "ZERO_RATE"             # Zero-rate taxable supplies


class VatCode(Base):
    """
    VAT codes for Dutch BTW compliance.
    
    Supports NL VAT scheme codes:
    - NL_21: Standard 21% rate
    - NL_9: Reduced 9% rate
    - NL_0: Zero-rate
    - RC_EU_SERVICES: Reverse charge EU services
    - RC_IMPORT: Reverse charge imports
    - INTRA_EU_GOODS: Intra-EU goods acquisition
    - ICP_SUPPLIES: Intra-Community supplies (ICP)
    - KOR_EXEMPT: KOR (Kleine Ondernemersregeling) exempt
    """
    __tablename__ = "vat_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)  # e.g., 21.00 for 21%
    # VAT category for classification
    category: Mapped[VatCategory] = mapped_column(
        SQLEnum(VatCategory), default=VatCategory.SALES, nullable=False
    )
    # Dutch VAT return box mapping (stored as JSONB for flexibility)
    # Example: {"turnover_box": "1a", "vat_box": "1a"}
    box_mapping: Mapped[dict] = mapped_column(JSONB, nullable=True)
    # Whether this code applies to EU countries only
    eu_only: Mapped[bool] = mapped_column(Boolean, default=False)
    # Whether this code requires customer VAT number
    requires_vat_number: Mapped[bool] = mapped_column(Boolean, default=False)
    # Whether this triggers reverse charge mechanism
    is_reverse_charge: Mapped[bool] = mapped_column(Boolean, default=False)
    # Whether this is for ICP reporting
    is_icp: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    transaction_lines = relationship("TransactionLine", back_populates="vat_code")
    journal_lines = relationship("JournalLine", back_populates="vat_code")
