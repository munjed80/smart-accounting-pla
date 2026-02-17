"""
Audit Log Schemas

Pydantic schemas for comprehensive audit trail functionality.
Uses the audit_log table with old_value/new_value tracking.
"""
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class ComprehensiveAuditLogEntry(BaseModel):
    """Schema for a comprehensive audit log entry with value diffs."""
    id: UUID
    client_id: UUID
    entity_type: str
    entity_id: UUID
    action: str
    user_id: Optional[UUID] = None
    user_role: str
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    ip_address: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class ComprehensiveAuditLogListResponse(BaseModel):
    """Schema for comprehensive audit log list response."""
    entries: List[ComprehensiveAuditLogEntry]
    total_count: int
    page: int
    page_size: int
