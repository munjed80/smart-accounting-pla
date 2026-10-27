"""Explicit, immutable VAT basis confirmation for a ZZP administration."""

import uuid
from datetime import date, datetime
from sqlalchemy import Date, DateTime, ForeignKey, String, CheckConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ZZPVatPolicy(Base):
    __tablename__ = "zzp_vat_policies"
    __table_args__ = (
        CheckConstraint(
            "basis IN ('factuurstelsel', 'kasstelsel')", name="ck_zzp_vat_policy_basis"
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("administrations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    basis: Mapped[str] = mapped_column(String(20), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    confirmed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    confirmed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
