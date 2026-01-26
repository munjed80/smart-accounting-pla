"""
Accountant Dashboard Schemas

These schemas support the accountant master dashboard which is error-driven:
- Clients only need attention when there are problems
- Status is GREEN (no action), YELLOW (attention soon), or RED (immediate action)
"""
from datetime import datetime, date
from typing import Optional, List
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


class ClientStatus(str, Enum):
    """
    Client status based on error-driven logic:
    - GREEN: No action required
    - YELLOW: Attention soon (missing docs, upcoming deadline)
    - RED: Immediate action required (errors, invalid BTW, blocked period)
    """
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    RED = "RED"


class BTWQuarterStatus(str, Enum):
    """Current BTW (VAT) quarter status"""
    ON_TRACK = "ON_TRACK"
    PENDING_DOCS = "PENDING_DOCS"
    DEADLINE_APPROACHING = "DEADLINE_APPROACHING"
    OVERDUE = "OVERDUE"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class IssueSeverity(str, Enum):
    """Issue severity level"""
    ERROR = "ERROR"      # Must be fixed immediately
    WARNING = "WARNING"  # Should be addressed soon
    INFO = "INFO"        # Informational, low priority


class IssueCategory(str, Enum):
    """Category of the issue"""
    MISSING_DOCUMENT = "MISSING_DOCUMENT"
    PROCESSING_ERROR = "PROCESSING_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    BTW_DEADLINE = "BTW_DEADLINE"
    UNBALANCED_TRANSACTION = "UNBALANCED_TRANSACTION"
    DRAFT_PENDING = "DRAFT_PENDING"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"


class DashboardIssue(BaseModel):
    """
    A single issue requiring accountant attention.
    
    Each issue includes:
    - What is wrong
    - Why it is wrong
    - Suggested next action
    """
    id: str
    category: IssueCategory
    severity: IssueSeverity
    title: str = Field(..., description="What is wrong")
    description: str = Field(..., description="Why it is wrong")
    suggested_action: str = Field(..., description="Suggested next action")
    related_entity_id: Optional[UUID] = Field(None, description="ID of related document/transaction")
    related_entity_type: Optional[str] = Field(None, description="Type: document, transaction")
    created_at: datetime


class ClientOverview(BaseModel):
    """
    Overview of a single client (administration) for the accountant dashboard.
    
    This is designed for error-driven visibility:
    - Status indicates if action is needed
    - Issues list shows what needs attention
    - "Review issues" button only visible if status != GREEN
    """
    id: UUID
    name: str
    kvk_number: Optional[str] = None
    btw_number: Optional[str] = None
    
    # Status indicator
    status: ClientStatus
    
    # Key metrics for quick overview
    last_document_upload: Optional[datetime] = None
    btw_quarter_status: BTWQuarterStatus
    current_quarter: str = Field(..., description="e.g., Q1 2024")
    
    # Error counts (only show if > 0)
    error_count: int = 0
    warning_count: int = 0
    
    # Top issues (max 3 for overview, full list in detail view)
    issues: List[DashboardIssue] = []
    
    # Summary counts for dashboard
    total_transactions: int = 0
    draft_transactions: int = 0
    failed_documents: int = 0
    
    class Config:
        from_attributes = True


class AccountantDashboardResponse(BaseModel):
    """
    Complete accountant dashboard response.
    
    Design principles:
    - Show ALL clients in ONE screen
    - Error-driven, not data-driven
    - Accountant only clicks when there is a problem
    """
    # Summary stats across all clients
    total_clients: int
    clients_needing_attention: int  # YELLOW + RED
    clients_with_errors: int        # RED only
    
    # All clients sorted by status (RED first, then YELLOW, then GREEN)
    clients: List[ClientOverview]
    
    # Global issues that span multiple clients (if any)
    global_issues: List[DashboardIssue] = []
    
    # Timestamp
    generated_at: datetime
    
    class Config:
        from_attributes = True


class ClientIssuesResponse(BaseModel):
    """
    Response for detailed client issues endpoint.
    
    Returns all issues for a specific client, not just top 3.
    """
    client_id: UUID
    client_name: str
    total_issues: int
    issues: List[DashboardIssue]
    
    class Config:
        from_attributes = True
