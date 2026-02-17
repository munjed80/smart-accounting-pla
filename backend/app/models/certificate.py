"""
Certificate Models

Stores metadata for PKI certificates used for signing VAT submissions.
Private keys and certificate files are NEVER stored in the database.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, func, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional

from app.core.database import Base


class Certificate(Base):
    """
    Certificate metadata for PKIoverheid signing.
    
    Stores only metadata about certificates - never the actual certificate
    or private key data. Actual certificates and keys are stored securely
    on the filesystem and referenced via storage_ref.
    
    Security principles:
    - Private keys NEVER stored in database
    - Certificate files stored as environment variables or Coolify secrets
    - Only metadata (fingerprint, subject, issuer, validity) stored in DB
    - storage_ref points to secure filesystem location
    """
    __tablename__ = "certificates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    
    # Multi-tenant isolation
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    
    # Certificate type (e.g., PKI_OVERHEID)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # Storage reference - path or key to locate certificate file
    # Examples:
    # - Environment variable name: "$PKI_CERT_PATH"
    # - Filesystem path: "/secrets/pki-cert.pfx"
    # - Coolify secret reference: "coolify://pki-cert"
    storage_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    
    # Passphrase reference (for encrypted certificates)
    # Should reference environment variable or secret, not store actual passphrase
    # Examples: "$PKI_CERT_PASSPHRASE", "coolify://pki-passphrase"
    passphrase_ref: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Certificate metadata (extracted from certificate file)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)  # SHA256
    subject: Mapped[str] = mapped_column(String(500), nullable=False)  # Subject Distinguished Name
    issuer: Mapped[str] = mapped_column(String(500), nullable=False)  # Issuer Distinguished Name
    serial_number: Mapped[str] = mapped_column(String(100), nullable=False)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    
    # Optional metadata
    friendly_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    purpose: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # e.g., "BTW_SUBMISSION"
    
    # Audit trail
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Soft delete support
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Relationships
    administration = relationship("Administration")
    created_by_user = relationship("User")
    vat_submissions = relationship("VatSubmission", back_populates="certificate")
    
    # Indexes for efficient querying
    __table_args__ = (
        Index('ix_certificates_admin', 'administration_id'),
        Index('ix_certificates_fingerprint', 'fingerprint'),
        Index('ix_certificates_valid_to', 'valid_to'),
        Index('ix_certificates_is_active', 'is_active'),
    )
    
    def is_valid(self) -> bool:
        """Check if certificate is currently valid."""
        from datetime import timezone as tz
        now = datetime.now(tz.utc)
        return self.valid_from <= now <= self.valid_to and self.is_active
    
    def days_until_expiry(self) -> int:
        """Calculate days until certificate expires."""
        from datetime import timezone as tz
        now = datetime.now(tz.utc)
        delta = self.valid_to - now
        return delta.days
