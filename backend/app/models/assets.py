"""
Fixed Assets Models

Models for fixed asset management (Activa):
- Fixed assets with acquisition and depreciation tracking
- Depreciation schedules for posting
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import (
    String, DateTime, Date, func, ForeignKey, Boolean, Numeric, 
    Text, Integer, Enum as SQLEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class AssetStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    DISPOSED = "DISPOSED"
    FULLY_DEPRECIATED = "FULLY_DEPRECIATED"


class DepreciationMethod(str, enum.Enum):
    STRAIGHT_LINE = "STRAIGHT_LINE"
    DECLINING_BALANCE = "DECLINING_BALANCE"


class FixedAsset(Base):
    """Fixed asset with depreciation tracking."""
    __tablename__ = "fixed_assets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    asset_code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=True)
    acquisition_date: Mapped[date] = mapped_column(Date, nullable=False)
    acquisition_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    residual_value: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    useful_life_months: Mapped[int] = mapped_column(Integer, nullable=False)
    depreciation_method: Mapped[str] = mapped_column(String(50), default="STRAIGHT_LINE", nullable=False)
    asset_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    depreciation_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    expense_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    accumulated_depreciation: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )
    book_value: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    status: Mapped[AssetStatus] = mapped_column(
        SQLEnum(AssetStatus), default=AssetStatus.ACTIVE, nullable=False
    )
    disposal_date: Mapped[date] = mapped_column(Date, nullable=True)
    disposal_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=True)
    purchase_journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    administration = relationship("Administration", back_populates="fixed_assets")
    asset_account = relationship("ChartOfAccount", foreign_keys=[asset_account_id])
    depreciation_account = relationship("ChartOfAccount", foreign_keys=[depreciation_account_id])
    expense_account = relationship("ChartOfAccount", foreign_keys=[expense_account_id])
    purchase_journal_entry = relationship("JournalEntry")
    depreciation_schedules = relationship("DepreciationSchedule", back_populates="fixed_asset", cascade="all, delete-orphan")
    issues = relationship("ClientIssue", back_populates="fixed_asset")

    def calculate_monthly_depreciation(self) -> Decimal:
        """Calculate monthly depreciation amount."""
        if self.depreciation_method == "STRAIGHT_LINE":
            depreciable_amount = self.acquisition_cost - self.residual_value
            return depreciable_amount / Decimal(self.useful_life_months)
        # Can add other methods later
        return Decimal("0.00")

    def update_book_value(self) -> None:
        """Update book value based on accumulated depreciation."""
        self.book_value = self.acquisition_cost - self.accumulated_depreciation
        if self.book_value <= self.residual_value:
            self.status = AssetStatus.FULLY_DEPRECIATED


class DepreciationSchedule(Base):
    """Depreciation schedule entry for a fixed asset."""
    __tablename__ = "depreciation_schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    fixed_asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fixed_assets.id", ondelete="CASCADE"), nullable=False
    )
    period_date: Mapped[date] = mapped_column(Date, nullable=False)  # First day of period
    depreciation_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    accumulated_depreciation: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    book_value_end: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True
    )
    is_posted: Mapped[bool] = mapped_column(Boolean, default=False)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    fixed_asset = relationship("FixedAsset", back_populates="depreciation_schedules")
    journal_entry = relationship("JournalEntry")
