import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Numeric, Integer, Boolean, func, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SubscriptionStatus(str, enum.Enum):
    """Subscription status enum matching payment gateway states"""
    TRIALING = "TRIALING"
    ACTIVE = "ACTIVE"
    PAST_DUE = "PAST_DUE"
    CANCELED = "CANCELED"
    EXPIRED = "EXPIRED"


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)  # e.g., "zzp_basic"
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    price_monthly: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    trial_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    max_invoices: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_storage_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_users: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    subscriptions = relationship("Subscription", back_populates="plan")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    plan_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # Denormalized for quick checks
    status: Mapped[SubscriptionStatus] = mapped_column(
        SQLEnum(SubscriptionStatus), nullable=False, default=SubscriptionStatus.TRIALING, index=True
    )
    
    # Trial period tracking
    trial_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Current billing period (for active subscriptions)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Cancellation tracking
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # Payment provider fields (provider-agnostic design)
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)  # e.g., "mollie", "stripe"
    provider_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Legacy fields (kept for backward compatibility)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    administration = relationship("Administration", back_populates="subscriptions")
    plan = relationship("Plan", back_populates="subscriptions")


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    target_type: Mapped[str] = mapped_column(String(40), nullable=False)
    target_id: Mapped[str] = mapped_column(String(120), nullable=False)
    details: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    actor = relationship("User", back_populates="admin_audit_entries")
