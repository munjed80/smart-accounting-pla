"""
Audit Logger Service

This module provides the core audit logging functionality with sanitization
and safe error handling to ensure audit logging failures don't break business logic.
"""
import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


# Sensitive keys that should be redacted from audit logs
SENSITIVE_KEYS = {
    # Authentication & Authorization
    "password",
    "hashed_password",
    "token",
    "authorization",
    "refresh_token",
    "access_token",
    "secret",
    "api_key",
    "private_key",
    "client_secret",
    # Document content (large blobs)
    "document_content",
    "pdf_bytes",
    "ocr_text",
    "raw_text",
    "file_content",
    "file_data",
    "binary_data",
    # Bank details (if marked sensitive)
    "iban_full",
}

# Keys that should be masked instead of removed
MASK_KEYS = {
    "iban",
}


def sanitize_value(value: any) -> any:
    """
    Sanitize a single value (recursive for nested structures).
    
    Args:
        value: The value to sanitize
        
    Returns:
        The sanitized value
    """
    if isinstance(value, dict):
        return sanitize_payload(value)
    elif isinstance(value, list):
        return [sanitize_value(item) for item in value]
    elif isinstance(value, str) and len(value) > 1000:
        # Truncate very long strings (likely document content)
        return f"{value[:100]}... [TRUNCATED {len(value)} chars]"
    else:
        return value


def sanitize_payload(payload: dict) -> dict:
    """
    Sanitize a payload dictionary by removing/masking sensitive fields.
    
    This function:
    - Removes keys like password, token, secret, etc.
    - Masks IBAN values (shows only first 2 chars and last 4 chars)
    - Truncates large text fields
    - Works recursively for nested dictionaries
    
    Args:
        payload: The payload dictionary to sanitize
        
    Returns:
        A sanitized copy of the payload
    """
    if not isinstance(payload, dict):
        return payload
    
    sanitized = {}
    
    for key, value in payload.items():
        key_lower = key.lower()
        
        # Remove sensitive keys entirely
        if key_lower in SENSITIVE_KEYS:
            sanitized[key] = "**REDACTED**"
            continue
        
        # Mask IBAN values
        if key_lower in MASK_KEYS:
            if isinstance(value, str) and len(value) > 6:
                # Mask middle of IBAN: NL12****3456
                sanitized[key] = f"{value[:4]}**MASKED**{value[-4:]}"
            else:
                sanitized[key] = "**MASKED**"
            continue
        
        # Recursively sanitize nested values
        sanitized[key] = sanitize_value(value)
    
    return sanitized


async def log_audit_event(
    db: AsyncSession,
    *,
    client_id: UUID,
    entity_type: str,
    entity_id: UUID,
    action: str,
    user_id: Optional[UUID],
    user_role: str,
    old_value: Optional[dict],
    new_value: Optional[dict],
    ip_address: Optional[str] = None,
) -> None:
    """
    Log an audit event to the audit_log table.
    
    This function is designed to be safe and best-effort:
    - Guards against logging audit_log operations (prevents recursion)
    - Sanitizes old_value and new_value payloads
    - Catches and logs exceptions without propagating them
    - Validates that client_id is not None (required for tenant isolation)
    
    Args:
        db: Database session
        client_id: Administration/client ID (REQUIRED, never None)
        entity_type: Type of entity (e.g., 'invoice', 'expense')
        entity_id: ID of the entity
        action: Action performed (create, update, delete, validate, finalize)
        user_id: User who performed the action (None for system actions)
        user_role: Role of the user (zzp, accountant, system)
        old_value: Previous values of changed fields (will be sanitized)
        new_value: New values of changed fields (will be sanitized)
        ip_address: IP address of the request (optional)
    
    Returns:
        None (best-effort logging, exceptions are caught)
    """
    try:
        # Guard: Never log audit_log operations (prevents recursion)
        if entity_type == "audit_log":
            return
        
        # Guard: client_id is required for tenant isolation
        if client_id is None:
            logger.warning(
                f"Skipping audit log for {entity_type}:{entity_id} - "
                f"client_id is None (tenant isolation required)"
            )
            return
        
        # Sanitize payloads
        sanitized_old = sanitize_payload(old_value) if old_value else None
        sanitized_new = sanitize_payload(new_value) if new_value else None
        
        # Create audit log entry
        audit_entry = AuditLog(
            client_id=client_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            user_id=user_id,
            user_role=user_role,
            old_value=sanitized_old,
            new_value=sanitized_new,
            ip_address=ip_address,
        )
        
        db.add(audit_entry)
        # Note: We don't commit here - the caller will commit
        # This allows audit logging to participate in the same transaction
        
        logger.debug(
            f"Audit log entry created: {entity_type}:{entity_id} "
            f"action={action} user={user_id} role={user_role}"
        )
        
    except Exception as e:
        # Best-effort logging: catch all exceptions and log them
        # Never let audit logging failures break business logic
        logger.error(
            f"Failed to create audit log entry for {entity_type}:{entity_id} "
            f"action={action}: {e}",
            exc_info=True
        )
