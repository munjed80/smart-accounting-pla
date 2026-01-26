"""
Issue Schemas

Pydantic schemas for client issues from the consistency engine.
"""
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


class IssueSeverity(str, Enum):
    RED = "RED"
    YELLOW = "YELLOW"


class ClientIssueResponse(BaseModel):
    """Single issue from the consistency engine."""
    id: UUID
    issue_code: str
    severity: IssueSeverity
    title: str
    description: str
    why: Optional[str] = None
    suggested_action: Optional[str] = None
    # References
    document_id: Optional[UUID] = None
    journal_entry_id: Optional[UUID] = None
    account_id: Optional[UUID] = None
    fixed_asset_id: Optional[UUID] = None
    party_id: Optional[UUID] = None
    open_item_id: Optional[UUID] = None
    # Metadata
    amount_discrepancy: Optional[Decimal] = None
    is_resolved: bool
    resolved_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class ClientIssuesListResponse(BaseModel):
    """List of issues for a client."""
    client_id: UUID
    client_name: str
    total_issues: int
    red_count: int
    yellow_count: int
    issues: List[ClientIssueResponse]


class ClientOverviewResponse(BaseModel):
    """High-level status for a client."""
    client_id: UUID
    client_name: str
    # Counts
    missing_docs_count: int = 0
    error_count: int = 0
    warning_count: int = 0
    # Upcoming deadlines (placeholder for now)
    upcoming_deadlines: List[dict] = []
    # Summary stats
    total_journal_entries: int = 0
    draft_entries_count: int = 0
    posted_entries_count: int = 0
    total_open_receivables: Decimal = Decimal("0.00")
    total_open_payables: Decimal = Decimal("0.00")
    

class ValidationRunResponse(BaseModel):
    """Response for a validation run."""
    id: UUID
    administration_id: UUID
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str
    issues_found: Optional[int] = None
    issues_resolved: Optional[int] = None
    error_message: Optional[str] = None
    
    class Config:
        from_attributes = True


class RecalculateRequest(BaseModel):
    """Request to trigger recalculation."""
    force: bool = Field(default=False, description="Force recalculation even if recently run")


class RecalculateResponse(BaseModel):
    """Response from recalculation."""
    success: bool
    validation_run_id: UUID
    issues_found: int
    message: str
