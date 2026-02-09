"""
Accountant Master Dashboard Schemas

Schemas for:
- Dashboard summary aggregation
- Client status cards
- Bulk operations
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


# ============ Dashboard Summary Schemas ============

class VATDeadlineInfo(BaseModel):
    """VAT deadline information for a client."""
    client_id: UUID
    client_name: str
    period_name: str
    deadline_date: date
    days_remaining: int
    status: str  # ON_TRACK, APPROACHING, OVERDUE


class AlertSeverityCounts(BaseModel):
    """Alert counts by severity."""
    critical: int = 0
    warning: int = 0
    info: int = 0


class DashboardSummaryResponse(BaseModel):
    """
    Aggregated summary across all assigned clients.
    
    Endpoint: GET /api/v1/accountant/dashboard/summary
    """
    total_clients: int = Field(..., description="Total clients assigned to this accountant")
    clients_with_red_issues: int = Field(..., description="Clients with RED severity issues")
    clients_in_review: int = Field(..., description="Clients with periods in REVIEW status")
    upcoming_vat_deadlines_7d: int = Field(..., description="VAT deadlines in next 7 days")
    upcoming_vat_deadlines_14d: int = Field(..., description="VAT deadlines in next 14 days")
    upcoming_vat_deadlines_30d: int = Field(..., description="VAT deadlines in next 30 days")
    document_backlog_total: int = Field(..., description="Total documents needing review")
    alerts_by_severity: AlertSeverityCounts = Field(..., description="Alert counts by severity")
    vat_deadlines: List[VATDeadlineInfo] = Field(default_factory=list, description="Upcoming VAT deadlines")
    generated_at: datetime


# ============ Client Status Card Schemas ============

class ClientSortField(str, Enum):
    """Sort fields for client list."""
    READINESS_SCORE = "readiness_score"
    RED_ISSUES = "red_issues"
    BACKLOG = "backlog"
    DEADLINE = "deadline"
    NAME = "name"
    LAST_ACTIVITY = "last_activity"


class ClientFilterType(str, Enum):
    """Filter types for client list."""
    HAS_RED = "has_red"
    NEEDS_REVIEW = "needs_review"
    DEADLINE_7D = "deadline_7d"
    STALE_30D = "stale_30d"


class ClientStatusCard(BaseModel):
    """
    Computed status card for a single client.
    
    All fields are pre-computed for fast display.
    """
    id: UUID
    name: str
    kvk_number: Optional[str] = None
    btw_number: Optional[str] = None
    
    # Activity
    last_activity_at: Optional[datetime] = None
    
    # Period status
    open_period_status: Optional[str] = None  # OPEN, REVIEW, FINALIZED, LOCKED
    open_period_name: Optional[str] = None
    
    # Issue counts
    red_issue_count: int = 0
    yellow_issue_count: int = 0
    
    # Document status
    documents_needing_review_count: int = 0
    backlog_age_max_days: Optional[int] = None  # Max age of pending doc in days
    
    # VAT status
    vat_anomaly_count: int = 0
    next_vat_deadline: Optional[date] = None
    days_to_vat_deadline: Optional[int] = None
    
    # Overall health score (0-100)
    readiness_score: int = Field(..., ge=0, le=100, description="Client readiness score 0-100")
    
    # Quick status flags
    has_critical_alerts: bool = False
    needs_immediate_attention: bool = False

    class Config:
        from_attributes = True


class ClientsListResponse(BaseModel):
    """
    Response for GET /api/v1/accountant/dashboard/clients
    """
    clients: List[ClientStatusCard]
    total_count: int
    filtered_count: int
    sort_by: str
    sort_order: str
    filters_applied: List[str]
    generated_at: datetime


# ============ Bulk Operation Schemas ============

class BulkOperationType(str, Enum):
    """Types of bulk operations."""
    BULK_RECALCULATE = "BULK_RECALCULATE"
    BULK_ACK_YELLOW = "BULK_ACK_YELLOW"
    BULK_GENERATE_VAT_DRAFT = "BULK_GENERATE_VAT_DRAFT"
    BULK_SEND_CLIENT_REMINDERS = "BULK_SEND_CLIENT_REMINDERS"
    BULK_LOCK_PERIOD = "BULK_LOCK_PERIOD"


class BulkOperationStatus(str, Enum):
    """Status of a bulk operation."""
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    COMPLETED_WITH_ERRORS = "COMPLETED_WITH_ERRORS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class BulkOperationRequest(BaseModel):
    """Base request for bulk operations."""
    client_ids: Optional[List[UUID]] = Field(
        None,
        description="Specific client IDs to process. If not provided, will use filters."
    )
    filters: Optional[Dict[str, Any]] = Field(
        None,
        description="Filter criteria to select clients (e.g., has_red, needs_review)"
    )
    idempotency_key: Optional[str] = Field(
        None, 
        max_length=255,
        description="Idempotency key to prevent duplicate operations"
    )


class BulkRecalculateRequest(BulkOperationRequest):
    """Request for BULK_RECALCULATE operation."""
    force: bool = Field(False, description="Force recalculation even if recently run")
    stale_only: bool = Field(False, description="Only recalculate clients with stale validation")


class BulkAckYellowRequest(BulkOperationRequest):
    """Request for BULK_ACK_YELLOW operation."""
    issue_codes: Optional[List[str]] = Field(
        None,
        description="Specific issue codes to acknowledge. If not provided, all YELLOW issues."
    )
    notes: Optional[str] = Field(None, description="Acknowledgment notes")


class BulkGenerateVatDraftRequest(BulkOperationRequest):
    """Request for BULK_GENERATE_VAT_DRAFT operation."""
    period_year: int = Field(..., description="Year for VAT period")
    period_quarter: int = Field(..., ge=1, le=4, description="Quarter (1-4) for VAT period")


class BulkSendRemindersRequest(BulkOperationRequest):
    """Request for BULK_SEND_CLIENT_REMINDERS operation."""
    reminder_type: str = Field(..., description="Type of reminder to send")
    title: str = Field(..., max_length=255, description="Reminder title")
    message: str = Field(..., description="Reminder message")
    due_date: Optional[date] = Field(None, description="Optional due date")


class BulkLockPeriodRequest(BulkOperationRequest):
    """Request for BULK_LOCK_PERIOD operation."""
    period_year: int = Field(..., description="Year for period to lock")
    period_quarter: int = Field(..., ge=1, le=4, description="Quarter (1-4) for period to lock")
    confirm_irreversible: bool = Field(
        False, 
        description="Must be true to confirm the irreversible lock"
    )


class BulkOperationResultItem(BaseModel):
    """Result for a single client in a bulk operation."""
    client_id: UUID
    client_name: str
    status: str  # SUCCESS, FAILED, SKIPPED
    result_data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    processed_at: datetime


class BulkOperationResponse(BaseModel):
    """Response for a bulk operation."""
    id: UUID
    operation_type: BulkOperationType
    status: BulkOperationStatus
    initiated_by_id: UUID
    initiated_by_name: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_clients: int
    processed_clients: int
    successful_clients: int
    failed_clients: int
    error_message: Optional[str] = None
    results: List[BulkOperationResultItem] = Field(default_factory=list)
    message: str


class BulkOperationListResponse(BaseModel):
    """Response for listing bulk operations."""
    operations: List[BulkOperationResponse]
    total_count: int


# ============ Assignment Schemas ============

class AccountantAssignmentCreate(BaseModel):
    """Request to assign an accountant to a client."""
    accountant_id: UUID
    administration_id: UUID
    is_primary: bool = True
    notes: Optional[str] = None


class AccountantAssignmentByEmailRequest(BaseModel):
    """Request to assign a client by their email address."""
    client_email: str = Field(..., description="Email of the ZZP client to assign")


class AccountantAssignmentResponse(BaseModel):
    """Response for an accountant-client assignment."""
    id: UUID
    accountant_id: UUID
    accountant_name: str
    administration_id: UUID
    administration_name: str
    is_primary: bool
    assigned_at: datetime
    assigned_by_name: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class AccountantClientListItem(BaseModel):
    """
    Client list item for accountant's assignment list.
    
    Includes client info and status counts.
    """
    id: UUID
    email: str
    name: str
    status: str = "active"
    last_activity: Optional[datetime] = None
    open_red_count: int = 0
    open_yellow_count: int = 0
    administration_id: Optional[UUID] = None
    administration_name: Optional[str] = None


class AccountantClientListResponse(BaseModel):
    """Response for listing assigned clients."""
    clients: List[AccountantClientListItem]
    total_count: int


class AccountantAssignmentsListResponse(BaseModel):
    """Response for listing assignments."""
    assignments: List[AccountantAssignmentResponse]
    total_count: int


# ============ Client Consent Workflow Schemas ============

class InviteClientRequest(BaseModel):
    """Request to invite a client by email (accountant self-serve)."""
    email: str = Field(..., description="Email of the ZZP client to invite")


class InviteClientResponse(BaseModel):
    """Response after inviting a client."""
    assignment_id: UUID
    status: str  # PENDING or ACTIVE
    client_name: str
    client_email: str
    message: str


class ClientLinkItem(BaseModel):
    """
    Client link item for accountant's client list.
    
    Represents a single accountant-client relationship with consent status.
    """
    assignment_id: UUID
    client_user_id: UUID
    client_email: str
    client_name: str
    administration_id: UUID
    administration_name: str
    status: str  # PENDING, ACTIVE, REVOKED
    invited_by: str  # ACCOUNTANT, ADMIN
    assigned_at: datetime
    approved_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    open_red_count: int = 0
    open_yellow_count: int = 0


class AccountantClientLinksResponse(BaseModel):
    """Response for listing accountant's client links with consent status."""
    links: List[ClientLinkItem]
    pending_count: int
    active_count: int
    total_count: int


class PendingLinkRequest(BaseModel):
    """
    Pending link request for ZZP client approval.
    
    Shows accountant requesting access to the client's administration.
    """
    assignment_id: UUID
    accountant_id: UUID
    accountant_email: str
    accountant_name: str
    administration_id: UUID
    administration_name: str
    invited_at: datetime


class ZZPLinksResponse(BaseModel):
    """Response for ZZP client's pending link requests."""
    pending_requests: List[PendingLinkRequest]
    total_count: int


class ApproveLinkResponse(BaseModel):
    """Response after approving a link."""
    assignment_id: UUID
    status: str  # ACTIVE
    approved_at: datetime
    message: str


class RejectLinkResponse(BaseModel):
    """Response after rejecting a link."""
    assignment_id: UUID
    status: str  # REVOKED
    revoked_at: datetime
    message: str


# ============ ZZP Active Links Schemas ============

class ActiveAccountantLink(BaseModel):
    """
    Active accountant link for ZZP client view.
    
    Shows an accountant with approved access to the client's administration.
    """
    assignment_id: UUID
    accountant_id: UUID
    accountant_email: str
    accountant_name: str
    administration_id: UUID
    administration_name: str
    approved_at: Optional[datetime] = None


class ZZPActiveLinksResponse(BaseModel):
    """Response for ZZP client's active accountant links."""
    active_links: List[ActiveAccountantLink]
    total_count: int


# ============ Permission Scopes Schemas ============

class PermissionScopeType(str, Enum):
    """
    Permission scope types for accountant module access.
    
    Each scope grants access to a specific area of the client's data.
    """
    INVOICES = "invoices"
    CUSTOMERS = "customers"
    EXPENSES = "expenses"
    HOURS = "hours"
    DOCUMENTS = "documents"
    BOOKKEEPING = "bookkeeping"
    SETTINGS = "settings"
    VAT = "vat"
    REPORTS = "reports"


class ClientScopesResponse(BaseModel):
    """Response for getting client permission scopes."""
    client_id: UUID
    client_name: str
    scopes: List[str] = Field(default_factory=list, description="List of granted permission scopes")
    available_scopes: List[str] = Field(
        default=[s.value for s in PermissionScopeType],
        description="All available scope types"
    )


class UpdateScopesRequest(BaseModel):
    """Request to update client permission scopes."""
    scopes: List[str] = Field(..., description="List of scopes to grant")


class UpdateScopesResponse(BaseModel):
    """Response after updating client scopes."""
    client_id: UUID
    scopes: List[str]
    message: str


class ScopesSummary(BaseModel):
    """Summary of granted scopes for a client link."""
    total_scopes: int
    granted_scopes: List[str]
    missing_scopes: List[str]


class ClientLinkItemWithScopes(ClientLinkItem):
    """Client link item with scopes summary."""
    scopes: List[str] = Field(default_factory=list, description="Granted permission scopes")
    scopes_summary: Optional[ScopesSummary] = None


class AccountantClientLinksWithScopesResponse(BaseModel):
    """Response for listing accountant's client links with scopes."""
    links: List[ClientLinkItemWithScopes]
    pending_count: int
    active_count: int
    total_count: int
