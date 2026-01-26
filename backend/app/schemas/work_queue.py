"""
Work Queue, Reminders, and Evidence Pack Schemas

Schemas for:
- Work queue items and responses
- SLA summary
- Reminder requests and responses
- Evidence pack requests and responses
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field


# ============ Work Queue Schemas ============

class WorkQueueItem(BaseModel):
    """Single work item in the queue."""
    client_id: UUID
    client_name: str
    period_id: Optional[UUID] = None
    period_status: Optional[str] = None
    work_item_type: str = Field(..., description="Type: ISSUE, VAT, BACKLOG, ALERT, PERIOD_REVIEW, STALE")
    severity: Optional[str] = Field(None, description="Severity: CRITICAL, RED, WARNING, YELLOW, INFO")
    title: str
    description: str
    suggested_next_action: str
    due_date: Optional[date] = None
    age_days: Optional[int] = None
    counts: Dict[str, int] = Field(default_factory=dict, description="Counts: red, yellow, backlog, alerts")
    readiness_score: int = Field(..., ge=0, le=100, description="Client readiness score 0-100")
    readiness_breakdown: Optional[Dict[str, Any]] = None


class WorkQueueCounts(BaseModel):
    """Summary counts for work queue."""
    red_issues: int = 0
    needs_review: int = 0
    vat_due: int = 0
    stale: int = 0


class WorkQueueResponse(BaseModel):
    """Response for GET /api/v1/accountant/work-queue."""
    items: List[WorkQueueItem]
    total_count: int
    returned_count: int
    queue_type: str
    counts: Dict[str, int]
    sort_by: str
    sort_order: str
    generated_at: datetime


# ============ SLA Summary Schemas ============

class SLAViolationByType(BaseModel):
    """Violation counts by type."""
    critical: int = 0
    warning: int = 0


class SLASummaryResponse(BaseModel):
    """Response for GET /api/v1/accountant/dashboard/sla-summary."""
    total_violations: int
    critical_count: int
    warning_count: int
    by_type: Dict[str, Dict[str, int]]
    escalation_events_today: int
    policy: Dict[str, int] = Field(..., description="Current SLA policy thresholds")
    generated_at: datetime


# ============ Reminder Schemas ============

class ReminderSendRequest(BaseModel):
    """Request for POST /api/v1/accountant/reminders/send."""
    client_ids: List[str] = Field(..., description="List of client IDs to send reminders to")
    reminder_type: str = Field(..., description="Type: DOCUMENT_MISSING, VAT_DEADLINE, REVIEW_PENDING, ACTION_REQUIRED")
    title: str = Field(..., max_length=255, description="Reminder title")
    message: str = Field(..., description="Reminder message")
    channel: str = Field("IN_APP", description="Channel: IN_APP or EMAIL")
    due_date: Optional[date] = Field(None, description="Optional due date")
    template_id: Optional[str] = Field(None, max_length=100, description="Optional email template ID")
    variables: Optional[Dict[str, Any]] = Field(None, description="Optional template variables")


class ReminderScheduleRequest(ReminderSendRequest):
    """Request for POST /api/v1/accountant/reminders/schedule."""
    scheduled_at: datetime = Field(..., description="When to send the reminders")


class ReminderResponse(BaseModel):
    """Response for a single reminder."""
    id: UUID
    administration_id: UUID
    reminder_type: str
    title: str
    message: str
    channel: str
    status: str = Field(..., description="Status: PENDING, SCHEDULED, SENT, FAILED")
    due_date: Optional[date] = None
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    send_error: Optional[str] = None

    class Config:
        from_attributes = True


class ReminderHistoryResponse(BaseModel):
    """Response for GET /api/v1/accountant/reminders/history."""
    reminders: List[ReminderResponse]
    total_count: int
    limit: int
    offset: int


# ============ Evidence Pack Schemas ============

class EvidencePackCreateRequest(BaseModel):
    """Request for POST /api/v1/accountant/clients/{client_id}/periods/{period_id}/evidence-pack."""
    pack_type: str = Field("VAT_EVIDENCE", description="Pack type: VAT_EVIDENCE or AUDIT_TRAIL")


class EvidencePackResponse(BaseModel):
    """Response for a single evidence pack."""
    id: UUID
    administration_id: UUID
    period_id: UUID
    pack_type: str
    created_at: Optional[datetime] = None
    file_size_bytes: Optional[int] = None
    checksum: str
    download_count: int = 0
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class EvidencePackListResponse(BaseModel):
    """Response for GET /api/v1/accountant/evidence-packs."""
    packs: List[EvidencePackResponse]
    total_count: int
    limit: int
    offset: int
