import uuid
from datetime import datetime
from typing import Optional
from enum import Enum
from sqlalchemy import String, DateTime, ForeignKey, func, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TokenType(str, Enum):
    """Token type enum matching database enum."""
    EMAIL_VERIFY = "email_verify"
    PASSWORD_RESET = "password_reset"


class AuthToken(Base):
    """
    Model for authentication tokens (email verification, password reset).
    
    Security notes:
    - Only the SHA-256 hash of the token is stored, never the raw token
    - Tokens have expiration times
    - Tokens are marked as used after consumption to prevent reuse
    - IP and user agent stored for audit purposes
    """
    __tablename__ = "auth_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    token_type: Mapped[TokenType] = mapped_column(
        SQLEnum(TokenType, name='authtoken_type', create_type=False),
        nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Relationships
    user = relationship("User", backref="auth_tokens")
    
    @property
    def is_expired(self) -> bool:
        """Check if token has expired."""
        return datetime.now(self.expires_at.tzinfo) > self.expires_at
    
    @property
    def is_used(self) -> bool:
        """Check if token has been used."""
        return self.used_at is not None
    
    @property
    def is_valid(self) -> bool:
        """Check if token is valid (not expired and not used)."""
        return not self.is_expired and not self.is_used
