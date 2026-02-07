"""
ZZP Models

SQLAlchemy models for ZZP-specific entities like customers, invoices, etc.
These are used by ZZP users to manage their business data.
"""
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ZZPCustomer(Base):
    """
    Customer entity for ZZP users.
    
    Stores customer/client information with optional business details
    for invoicing and contact management.
    
    Fields:
    - name (required): Customer or company name
    - email, phone (optional): Contact details  
    - address_* (optional): Full address breakdown
    - kvk_number (optional): Dutch Chamber of Commerce number
    - btw_number (optional): Dutch VAT/BTW number
    - iban (optional): Bank account number
    - status: 'active' or 'inactive'
    """
    __tablename__ = "zzp_customers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("administrations.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    
    # Basic info
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # Address fields
    address_street: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    address_postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Nederland")
    
    # Business identifiers
    kvk_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    btw_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    
    # Bank details
    iban: Mapped[Optional[str]] = mapped_column(String(34), nullable=True)
    
    # Status
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    
    # Relationships
    administration = relationship("Administration")
