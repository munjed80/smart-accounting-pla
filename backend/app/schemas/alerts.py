"""
Alert Schemas

Pydantic schemas for the alerting system.
"""
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field
from enum import Enum


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"


class AlertResponse(BaseModel):
    """Single alert response."""
    id: UUID
    alert_code: str
    severity: AlertSeverity
    title: str
    message: str
    entity_type: Optional[str] = None
    entity_id: Optional[UUID] = None
    administration_id: Optional[UUID] = None
    context: Optional[str] = None
    created_at: datetime
    acknowledged_at: Optional[datetime] = None
    acknowledged_by_id: Optional[UUID] = None
    resolved_at: Optional[datetime] = None
    resolved_by_id: Optional[UUID] = None
    resolution_notes: Optional[str] = None
    auto_resolved: bool = False
    
    @property
    def is_active(self) -> bool:
        return self.resolved_at is None
    
    @property
    def is_acknowledged(self) -> bool:
        return self.acknowledged_at is not None
    
    class Config:
        from_attributes = True


class AlertListResponse(BaseModel):
    """List of alerts."""
    alerts: List[AlertResponse]
    total_count: int
    active_count: int
    acknowledged_count: int
    critical_count: int
    warning_count: int
    info_count: int


class AlertCountsResponse(BaseModel):
    """Alert counts by severity."""
    critical: int
    warning: int
    info: int
    total: int


class AcknowledgeAlertRequest(BaseModel):
    """Request to acknowledge an alert."""
    pass  # No body needed, user ID comes from auth


class ResolveAlertRequest(BaseModel):
    """Request to resolve an alert."""
    notes: Optional[str] = Field(None, max_length=1000, description="Resolution notes")


class AlertGroupedResponse(BaseModel):
    """Alerts grouped by severity."""
    critical: List[AlertResponse]
    warning: List[AlertResponse]
    info: List[AlertResponse]
    counts: AlertCountsResponse
