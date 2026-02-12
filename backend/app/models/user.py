import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="zzp")  # zzp, accountant, admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    memberships = relationship("AdministrationMember", back_populates="user", cascade="all, delete-orphan")
    reconciliation_actions = relationship("ReconciliationAction", back_populates="accountant", cascade="all, delete-orphan")
    
    def __init__(
        self,
        *,
        email: Optional[str] = None,
        hashed_password: Optional[str] = None,
        full_name: Optional[str] = None,
        role: str = "zzp",
        is_active: bool = True,
        email_verified_at: Optional[datetime] = None,
        last_login_at: Optional[datetime] = None,
        **kw
    ):
        """
        Initialize a User instance.
        
        Args:
            email: User's email address
            hashed_password: Hashed password
            full_name: User's full name
            role: User role (default: "zzp")
            is_active: Whether the user is active (default: True)
            email_verified_at: Timestamp when email was verified (optional)
            last_login_at: Timestamp of last login (optional)
            **kw: Additional arguments passed by SQLAlchemy during ORM operations
        """
        # Set attributes
        if email is not None:
            self.email = email
        if hashed_password is not None:
            self.hashed_password = hashed_password
        if full_name is not None:
            self.full_name = full_name
        self.role = role
        self.is_active = is_active
        self.email_verified_at = email_verified_at
        self.last_login_at = last_login_at
    
    @property
    def is_email_verified(self) -> bool:
        """Check if user's email is verified."""
        return self.email_verified_at is not None
