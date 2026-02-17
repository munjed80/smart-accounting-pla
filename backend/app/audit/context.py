"""
Request Context Module

This module provides a context variable to store request-scoped audit information
such as request_id, user_id, user_role, client_id, and ip_address.

Uses Python's contextvars to provide thread-safe, async-safe request context.
"""
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Optional
from uuid import UUID, uuid4


@dataclass
class AuditContext:
    """
    Request context for audit logging.
    
    This context is populated by middleware and used by the audit logging
    system to enrich audit log entries with request metadata.
    """
    request_id: UUID
    ip_address: Optional[str] = None
    user_id: Optional[UUID] = None
    user_role: str = "system"
    client_id: Optional[UUID] = None
    
    @classmethod
    def create_empty(cls) -> "AuditContext":
        """Create an empty audit context for system operations."""
        return cls(
            request_id=uuid4(),
            ip_address=None,
            user_id=None,
            user_role="system",
            client_id=None,
        )


# Context variable to store audit context per request
# This is thread-safe and async-safe
audit_context_var: ContextVar[Optional[AuditContext]] = ContextVar(
    "audit_context",
    default=None
)


def get_audit_context() -> Optional[AuditContext]:
    """
    Get the current audit context.
    
    Returns:
        The current AuditContext if set, None otherwise
    """
    return audit_context_var.get()


def set_audit_context(context: AuditContext) -> None:
    """
    Set the audit context for the current request.
    
    Args:
        context: The AuditContext to set
    """
    audit_context_var.set(context)


def clear_audit_context() -> None:
    """
    Clear the audit context.
    
    This is typically called at the end of request processing.
    """
    audit_context_var.set(None)
