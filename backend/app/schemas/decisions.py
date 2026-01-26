"""
Decision Engine Schemas

Pydantic schemas for the Accountant Decision Engine API.
"""
from datetime import datetime
from typing import Optional, List, Any
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


class ActionType(str, Enum):
    """Types of actions that can be suggested."""
    RECLASSIFY_TO_ASSET = "RECLASSIFY_TO_ASSET"
    CREATE_DEPRECIATION = "CREATE_DEPRECIATION"
    CORRECT_VAT_RATE = "CORRECT_VAT_RATE"
    ALLOCATE_OPEN_ITEM = "ALLOCATE_OPEN_ITEM"
    FLAG_DOCUMENT_INVALID = "FLAG_DOCUMENT_INVALID"
    LOCK_PERIOD = "LOCK_PERIOD"
    REVERSE_JOURNAL_ENTRY = "REVERSE_JOURNAL_ENTRY"
    CREATE_ADJUSTMENT_ENTRY = "CREATE_ADJUSTMENT_ENTRY"


class DecisionType(str, Enum):
    """Types of decisions."""
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    OVERRIDDEN = "OVERRIDDEN"


class ExecutionStatus(str, Enum):
    """Execution status of approved actions."""
    PENDING = "PENDING"
    EXECUTED = "EXECUTED"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"


# ============ Suggested Action Schemas ============

class SuggestedActionResponse(BaseModel):
    """A single suggested action for an issue."""
    id: UUID
    issue_id: UUID
    action_type: ActionType
    title: str
    explanation: str
    parameters: Optional[dict] = None
    confidence_score: Decimal
    is_auto_suggested: bool
    priority: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class IssueSuggestionsResponse(BaseModel):
    """List of suggested actions for an issue."""
    issue_id: UUID
    issue_title: str
    issue_code: str
    suggestions: List[SuggestedActionResponse]
    total_suggestions: int


# ============ Decision Schemas ============

class DecisionRequest(BaseModel):
    """Request to make a decision on an issue."""
    suggested_action_id: Optional[UUID] = Field(
        None, 
        description="ID of the suggested action to approve. Required if decision is APPROVED."
    )
    action_type: ActionType = Field(
        ...,
        description="Type of action being decided"
    )
    decision: DecisionType = Field(
        ...,
        description="The decision: APPROVED, REJECTED, or OVERRIDDEN"
    )
    override_parameters: Optional[dict] = Field(
        None,
        description="Custom parameters when decision is OVERRIDDEN"
    )
    notes: Optional[str] = Field(
        None,
        description="Optional notes from the accountant"
    )


class DecisionResponse(BaseModel):
    """Response after making a decision."""
    id: UUID
    issue_id: UUID
    suggested_action_id: Optional[UUID]
    action_type: ActionType
    decision: DecisionType
    override_parameters: Optional[dict]
    notes: Optional[str]
    decided_by_id: UUID
    decided_at: datetime
    execution_status: ExecutionStatus
    executed_at: Optional[datetime]
    execution_error: Optional[str]
    result_journal_entry_id: Optional[UUID]
    is_reversible: bool
    
    class Config:
        from_attributes = True


class DecisionHistoryItem(BaseModel):
    """A decision in the history list."""
    id: UUID
    issue_id: UUID
    issue_title: str
    issue_code: str
    action_type: ActionType
    decision: DecisionType
    decided_by_name: str
    decided_at: datetime
    execution_status: ExecutionStatus
    is_reversible: bool
    
    class Config:
        from_attributes = True


class DecisionHistoryResponse(BaseModel):
    """Decision history for a client."""
    client_id: UUID
    client_name: str
    total_decisions: int
    decisions: List[DecisionHistoryItem]


# ============ Execution Schemas ============

class ExecutionResultResponse(BaseModel):
    """Result of executing an approved action."""
    decision_id: UUID
    execution_status: ExecutionStatus
    executed_at: Optional[datetime]
    result_journal_entry_id: Optional[UUID]
    error_message: Optional[str]
    message: str


class ReverseActionRequest(BaseModel):
    """Request to reverse an executed action."""
    reason: Optional[str] = Field(None, description="Reason for reversal")


class ReverseActionResponse(BaseModel):
    """Response after reversing an action."""
    decision_id: UUID
    reversed_at: datetime
    reversal_journal_entry_id: Optional[UUID]
    message: str


# ============ Pattern/Learning Schemas ============

class DecisionPatternResponse(BaseModel):
    """A learned decision pattern."""
    id: UUID
    issue_code: str
    action_type: ActionType
    approval_count: int
    rejection_count: int
    confidence_boost: Decimal
    last_approved_at: Optional[datetime]
    last_rejected_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class ClientPatternsResponse(BaseModel):
    """Decision patterns for a client."""
    client_id: UUID
    client_name: str
    patterns: List[DecisionPatternResponse]
