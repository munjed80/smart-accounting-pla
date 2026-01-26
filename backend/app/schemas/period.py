"""
Period Control Schemas

Pydantic schemas for period control and finalization API.
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


class PeriodStatus(str, Enum):
    """Status of an accounting period."""
    OPEN = "OPEN"
    REVIEW = "REVIEW"
    FINALIZED = "FINALIZED"
    LOCKED = "LOCKED"


class PeriodResponse(BaseModel):
    """Response for an accounting period."""
    id: UUID
    administration_id: UUID
    name: str
    period_type: str
    start_date: date
    end_date: date
    status: PeriodStatus
    is_closed: bool
    # Timestamps
    created_at: datetime
    closed_at: Optional[datetime] = None
    review_started_at: Optional[datetime] = None
    finalized_at: Optional[datetime] = None
    locked_at: Optional[datetime] = None
    # Who performed actions
    review_started_by_id: Optional[UUID] = None
    finalized_by_id: Optional[UUID] = None
    locked_by_id: Optional[UUID] = None

    class Config:
        from_attributes = True


class ValidationIssue(BaseModel):
    """A validation issue preventing or warning about finalization."""
    id: str
    code: str
    title: str
    description: str
    suggested_action: Optional[str] = None


class ValidationStatus(BaseModel):
    """Validation status for a period."""
    red_issues: List[ValidationIssue]
    yellow_issues: List[ValidationIssue]
    can_finalize: bool
    validation_summary: Dict[str, int]


class PeriodWithValidationResponse(BaseModel):
    """Period with its validation status."""
    period: PeriodResponse
    validation: ValidationStatus


class ReviewPeriodRequest(BaseModel):
    """Request to start period review."""
    notes: Optional[str] = Field(None, description="Optional notes about the review")


class ReviewPeriodResponse(BaseModel):
    """Response from starting period review."""
    period: PeriodResponse
    validation_run_id: UUID
    issues_found: int
    message: str


class FinalizePeriodRequest(BaseModel):
    """Request to finalize a period."""
    acknowledged_yellow_issues: Optional[List[str]] = Field(
        None, 
        description="List of YELLOW issue IDs that have been acknowledged"
    )
    notes: Optional[str] = Field(None, description="Optional notes about finalization")


class FinalizePeriodResponse(BaseModel):
    """Response from finalizing a period."""
    period: PeriodResponse
    snapshot_id: UUID
    message: str


class LockPeriodRequest(BaseModel):
    """Request to lock a finalized period."""
    notes: Optional[str] = Field(
        None, 
        description="Optional notes about why the period is being locked"
    )
    confirm_irreversible: bool = Field(
        False, 
        description="Must be true to confirm understanding that locking is irreversible"
    )


class LockPeriodResponse(BaseModel):
    """Response from locking a period."""
    period: PeriodResponse
    message: str


class SnapshotSummary(BaseModel):
    """Summary metrics from a period snapshot."""
    total_assets: Optional[Decimal] = None
    total_liabilities: Optional[Decimal] = None
    total_equity: Optional[Decimal] = None
    net_income: Optional[Decimal] = None
    total_ar: Optional[Decimal] = None
    total_ap: Optional[Decimal] = None
    vat_payable: Optional[Decimal] = None
    vat_receivable: Optional[Decimal] = None


class PeriodSnapshotResponse(BaseModel):
    """Response for a period snapshot."""
    id: UUID
    period_id: UUID
    administration_id: UUID
    snapshot_type: str
    created_at: datetime
    created_by_id: Optional[UUID] = None
    # Summary metrics
    summary: SnapshotSummary
    # Full report data (JSONB)
    balance_sheet: Optional[Dict[str, Any]] = None
    profit_and_loss: Optional[Dict[str, Any]] = None
    vat_summary: Optional[Dict[str, Any]] = None
    open_ar_balances: Optional[Dict[str, Any]] = None
    open_ap_balances: Optional[Dict[str, Any]] = None
    trial_balance: Optional[List[Dict[str, Any]]] = None
    # Issue acknowledgments
    acknowledged_yellow_issues: Optional[List[str]] = None
    issue_summary: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    """Response for a period audit log entry."""
    id: UUID
    period_id: UUID
    administration_id: UUID
    action: str
    from_status: Optional[str] = None
    to_status: str
    performed_by_id: UUID
    performed_at: datetime
    notes: Optional[str] = None
    snapshot_id: Optional[UUID] = None

    class Config:
        from_attributes = True


class PeriodAuditLogsResponse(BaseModel):
    """Response for period audit logs list."""
    period_id: UUID
    logs: List[AuditLogResponse]
    total_count: int


class PeriodsListResponse(BaseModel):
    """Response for list of periods."""
    administration_id: UUID
    periods: List[PeriodResponse]
    total_count: int


class FinalizationPrerequisiteErrorResponse(BaseModel):
    """Error response when finalization prerequisites are not met."""
    detail: str
    red_issues: List[ValidationIssue]
    yellow_issues: List[ValidationIssue]
