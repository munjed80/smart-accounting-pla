"""
SQLAlchemy Session Event Hooks for Audit Logging

This module provides session event hooks to automatically log changes to entities
when they are created, updated, or deleted.
"""
import logging
from typing import Dict, Type, Any, Optional
from uuid import UUID

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.audit.context import get_audit_context
from app.audit.audit_logger import log_audit_event
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


# Entity type mapping: Model class -> entity_type string
# This maps SQLAlchemy model classes to human-readable entity type strings
ENTITY_TYPE_MAP: Dict[str, str] = {
    # ZZP Invoice & Expense
    "ZZPInvoice": "invoice",
    "ZZPExpense": "expense",
    
    # Ledger
    "JournalEntry": "journal_entry",
    
    # Bank
    "BankTransaction": "bank_transaction",
    
    # Accounting Period (used for BTW/VAT periods)
    "AccountingPeriod": "btw_period",
    
    # Financial Commitments
    "FinancialCommitment": "commitment",
    
    # You can add more mappings as needed
    # "Document": "document",
    # "Transaction": "transaction",
}


def get_entity_type(model_class: Type) -> Optional[str]:
    """
    Get the entity type string for a model class.
    
    Args:
        model_class: The SQLAlchemy model class
        
    Returns:
        The entity type string if mapped, None otherwise
    """
    class_name = model_class.__name__
    return ENTITY_TYPE_MAP.get(class_name)


def get_client_id_from_instance(instance: Any) -> Optional[UUID]:
    """
    Extract client_id from a model instance.
    
    Most models have an 'administration_id' field which serves as the client_id.
    Some models may have a 'client_id' field directly.
    
    Args:
        instance: The model instance
        
    Returns:
        The client_id (administration_id) if found, None otherwise
    """
    # Try administration_id first (most common)
    if hasattr(instance, "administration_id"):
        return getattr(instance, "administration_id")
    
    # Try client_id directly
    if hasattr(instance, "client_id"):
        return getattr(instance, "client_id")
    
    return None


def get_changed_attributes(instance: Any) -> Dict[str, tuple]:
    """
    Get the changed attributes of a model instance.
    
    Uses SQLAlchemy's inspect() to get the attribute history.
    Returns a dictionary mapping attribute names to (old_value, new_value) tuples.
    
    Args:
        instance: The model instance
        
    Returns:
        Dict of {attribute_name: (old_value, new_value)}
    """
    insp = inspect(instance)
    changes = {}
    
    for attr in insp.mapper.column_attrs:
        attr_state = insp.attrs.get(attr.key)
        if attr_state and attr_state.history.has_changes():
            history = attr_state.history
            # Get old value (from history.deleted)
            old_value = history.deleted[0] if history.deleted else None
            # Get new value (from current attribute)
            new_value = getattr(instance, attr.key, None)
            
            # Convert UUID and datetime objects to strings for JSON serialization
            if old_value is not None:
                if isinstance(old_value, UUID):
                    old_value = str(old_value)
                elif hasattr(old_value, "isoformat"):
                    old_value = old_value.isoformat()
            
            if new_value is not None:
                if isinstance(new_value, UUID):
                    new_value = str(new_value)
                elif hasattr(new_value, "isoformat"):
                    new_value = new_value.isoformat()
            
            changes[attr.key] = (old_value, new_value)
    
    return changes


def get_current_attributes(instance: Any, exclude_large_fields: bool = True) -> Dict[str, Any]:
    """
    Get all current attributes of a model instance.
    
    Used for create and delete actions where we want to capture the full state.
    
    Args:
        instance: The model instance
        exclude_large_fields: If True, exclude relationship fields and large text fields
        
    Returns:
        Dict of {attribute_name: value}
    """
    insp = inspect(instance)
    attributes = {}
    
    for attr in insp.mapper.column_attrs:
        value = getattr(instance, attr.key, None)
        
        # Convert to JSON-serializable types
        if value is not None:
            if isinstance(value, UUID):
                value = str(value)
            elif hasattr(value, "isoformat"):
                value = value.isoformat()
            elif isinstance(value, bytes):
                # Don't include binary data
                value = f"<binary data {len(value)} bytes>"
        
        attributes[attr.key] = value
    
    return attributes


async def handle_after_flush(session: Session, flush_context) -> None:
    """
    SQLAlchemy event handler for after_flush.
    
    This is called after changes are flushed to the database but before commit.
    We collect all new, dirty, and deleted instances and log them to audit_log.
    
    Args:
        session: The SQLAlchemy session
        flush_context: The flush context
    """
    # Get audit context (may be None if called outside request context)
    context = get_audit_context()
    
    # If no context, create a system context
    if context is None:
        from app.audit.context import AuditContext
        context = AuditContext.create_empty()
    
    # Track instances to audit
    instances_to_audit = []
    
    # Process new instances (CREATE)
    for instance in session.new:
        # Skip audit_log instances to prevent recursion
        if isinstance(instance, AuditLog):
            continue
        
        entity_type = get_entity_type(type(instance))
        if entity_type is None:
            # Not a tracked entity type
            continue
        
        client_id = get_client_id_from_instance(instance)
        # Use context client_id if instance doesn't have one
        if client_id is None:
            client_id = context.client_id
        
        # Skip if still no client_id (required for tenant isolation)
        if client_id is None:
            logger.debug(
                f"Skipping audit log for new {entity_type} - no client_id available"
            )
            continue
        
        entity_id = getattr(instance, "id", None)
        if entity_id is None:
            # No ID yet (shouldn't happen after flush, but guard anyway)
            continue
        
        # Get all current attributes as new_value
        new_value = get_current_attributes(instance)
        
        instances_to_audit.append({
            "client_id": client_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": "create",
            "user_id": context.user_id,
            "user_role": context.user_role,
            "old_value": None,
            "new_value": new_value,
            "ip_address": context.ip_address,
        })
    
    # Process dirty instances (UPDATE)
    for instance in session.dirty:
        # Skip audit_log instances
        if isinstance(instance, AuditLog):
            continue
        
        entity_type = get_entity_type(type(instance))
        if entity_type is None:
            continue
        
        # Check if there are actual changes
        changes = get_changed_attributes(instance)
        if not changes:
            # No actual changes to column attributes
            continue
        
        client_id = get_client_id_from_instance(instance)
        if client_id is None:
            client_id = context.client_id
        
        if client_id is None:
            logger.debug(
                f"Skipping audit log for updated {entity_type} - no client_id available"
            )
            continue
        
        entity_id = getattr(instance, "id", None)
        if entity_id is None:
            continue
        
        # Build old_value and new_value dicts from changes
        old_value = {key: old for key, (old, new) in changes.items()}
        new_value = {key: new for key, (old, new) in changes.items()}
        
        instances_to_audit.append({
            "client_id": client_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": "update",
            "user_id": context.user_id,
            "user_role": context.user_role,
            "old_value": old_value,
            "new_value": new_value,
            "ip_address": context.ip_address,
        })
    
    # Process deleted instances (DELETE)
    for instance in session.deleted:
        # Skip audit_log instances
        if isinstance(instance, AuditLog):
            continue
        
        entity_type = get_entity_type(type(instance))
        if entity_type is None:
            continue
        
        client_id = get_client_id_from_instance(instance)
        if client_id is None:
            client_id = context.client_id
        
        if client_id is None:
            logger.debug(
                f"Skipping audit log for deleted {entity_type} - no client_id available"
            )
            continue
        
        entity_id = getattr(instance, "id", None)
        if entity_id is None:
            continue
        
        # Get all current attributes as old_value (before deletion)
        old_value = get_current_attributes(instance)
        
        instances_to_audit.append({
            "client_id": client_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": "delete",
            "user_id": context.user_id,
            "user_role": context.user_role,
            "old_value": old_value,
            "new_value": None,
            "ip_address": context.ip_address,
        })
    
    # Create audit log entries
    # We use synchronous session methods here since after_flush is synchronous
    for audit_data in instances_to_audit:
        try:
            # Import here to avoid circular imports
            from app.audit.audit_logger import log_audit_event
            
            # Create a sync version of the audit log entry directly
            # since we can't await in synchronous event handler
            from app.audit.audit_logger import sanitize_payload
            
            audit_entry = AuditLog(
                client_id=audit_data["client_id"],
                entity_type=audit_data["entity_type"],
                entity_id=audit_data["entity_id"],
                action=audit_data["action"],
                user_id=audit_data["user_id"],
                user_role=audit_data["user_role"],
                old_value=sanitize_payload(audit_data["old_value"]) if audit_data["old_value"] else None,
                new_value=sanitize_payload(audit_data["new_value"]) if audit_data["new_value"] else None,
                ip_address=audit_data["ip_address"],
            )
            
            session.add(audit_entry)
            
            logger.debug(
                f"Created audit log entry: {audit_data['entity_type']}:"
                f"{audit_data['entity_id']} action={audit_data['action']}"
            )
            
        except Exception as e:
            # Best-effort logging: catch exceptions but don't fail the flush
            logger.error(
                f"Failed to create audit log entry: {e}",
                exc_info=True
            )


def register_audit_hooks(session_factory) -> None:
    """
    Register audit logging hooks on the session factory.
    
    This should be called once during application startup to set up
    the event listeners.
    
    Args:
        session_factory: The SQLAlchemy session factory (async_sessionmaker)
    """
    # Register after_flush event
    # Note: We use 'after_flush' instead of 'after_flush_postexec' because
    # we need to add audit log entries to the same session/transaction
    event.listen(session_factory.class_, "after_flush", handle_after_flush)
    
    logger.info("Audit logging session hooks registered")
