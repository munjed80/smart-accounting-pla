import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, func, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class MemberRole(str, enum.Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    ACCOUNTANT = "ACCOUNTANT"
    MEMBER = "MEMBER"


class Administration(Base):
    __tablename__ = "administrations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=True)
    kvk_number: Mapped[str] = mapped_column(String(50), nullable=True)  # Dutch Chamber of Commerce
    btw_number: Mapped[str] = mapped_column(String(50), nullable=True)  # VAT number
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    members = relationship("AdministrationMember", back_populates="administration", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="administration", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="administration", cascade="all, delete-orphan")
    chart_of_accounts = relationship("ChartOfAccount", back_populates="administration", cascade="all, delete-orphan")
    # Core ledger relationships
    accounting_periods = relationship("AccountingPeriod", back_populates="administration", cascade="all, delete-orphan")
    journal_entries = relationship("JournalEntry", back_populates="administration", cascade="all, delete-orphan")
    parties = relationship("Party", back_populates="administration", cascade="all, delete-orphan")
    open_items = relationship("OpenItem", back_populates="administration", cascade="all, delete-orphan")
    fixed_assets = relationship("FixedAsset", back_populates="administration", cascade="all, delete-orphan")
    client_issues = relationship("ClientIssue", back_populates="administration", cascade="all, delete-orphan")
    validation_runs = relationship("ValidationRun", back_populates="administration", cascade="all, delete-orphan")


class AdministrationMember(Base):
    __tablename__ = "administration_members"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[MemberRole] = mapped_column(
        SQLEnum(MemberRole), default=MemberRole.MEMBER, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    administration = relationship("Administration", back_populates="members")
    user = relationship("User", back_populates="memberships")
