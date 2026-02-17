"""
Audit Log Model

This module defines the AuditLog model for tracking all changes to entities
across the system with full tenant isolation and comprehensive metadata.

The audit_log table was created by migration 039_audit_log_engine.
"""
from datetime import datetime
from uuid import UUID

from sqlalchemy import Column, String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditLog(Base):
    """
    Audit log model for tracking all entity changes.
    
    This model provides a comprehensive audit trail for all important operations
    in the system, including create, update, delete, validate, and finalize actions.
    
    Security features:
    - Tenant isolation via client_id (never null)
    - Sanitized payload (no secrets, no large blobs)
    - Immutable records (no updates/deletes allowed)
    - Best-effort logging (failures don't break business logic)
    """
    __tablename__ = "audit_log"
    
    # Primary key (auto-generated UUID)
    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
        nullable=False
    )
    
    # Tenant isolation - REQUIRED (never null for security)
    client_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        nullable=False,
        index=True,
        comment="Administration/client ID for tenant isolation"
    )
    
    # Entity information
    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Type of entity (e.g., 'invoice', 'expense', 'journal_entry')"
    )
    
    entity_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        nullable=False,
        comment="ID of the entity being tracked"
    )
    
    # Action tracking
    action: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Action performed (create, update, delete, validate, finalize)"
    )
    
    # User information (nullable for system jobs)
    user_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        nullable=True,
        comment="User who performed the action (null for system actions)"
    )
    
    user_role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Role of the user (zzp, accountant, system)"
    )
    
    # Value changes (JSONB for flexibility)
    # These are sanitized to remove secrets and large blobs
    old_value: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Previous values of changed fields (sanitized)"
    )
    
    new_value: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="New values of changed fields (sanitized)"
    )
    
    # Additional metadata
    ip_address: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
        comment="IP address of the request (IPv4 or IPv6)"
    )
    
    # Timestamp (immutable, set once)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="When the audit log entry was created"
    )
    
    def __repr__(self) -> str:
        return (
            f"<AuditLog(id={self.id}, "
            f"entity_type={self.entity_type}, "
            f"entity_id={self.entity_id}, "
            f"action={self.action}, "
            f"user_role={self.user_role})>"
        )
