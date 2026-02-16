import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, Enum as SQLEnum, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CommitmentType(str, enum.Enum):
    LEASE = "lease"
    LOAN = "loan"
    SUBSCRIPTION = "subscription"


class RecurringFrequency(str, enum.Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


class FinancialCommitment(Base):
    __tablename__ = "financial_commitments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[CommitmentType] = mapped_column(SQLEnum(CommitmentType), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    monthly_payment_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    principal_amount_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    renewal_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    contract_term_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    payment_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contract_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notice_period_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    auto_renew: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")

    interest_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 3), nullable=True)
    recurring_frequency: Mapped[Optional[RecurringFrequency]] = mapped_column(SQLEnum(RecurringFrequency), nullable=True)
    btw_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    administration = relationship("Administration")
