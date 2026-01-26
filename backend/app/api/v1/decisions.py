"""
Accountant Decision Engine API Endpoints

Provides endpoints for the decision workflow:
- GET /issues/{issue_id}/suggestions - Get suggested actions for an issue
- POST /issues/{issue_id}/decide - Make a decision on an issue
- GET /clients/{client_id}/decision-history - Get decision history for a client
"""
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.issues import ClientIssue
from app.models.decisions import (
    SuggestedAction,
    AccountantDecision,
    DecisionPattern,
    ActionType,
    DecisionType,
    ExecutionStatus,
)
from app.schemas.decisions import (
    SuggestedActionResponse,
    IssueSuggestionsResponse,
    DecisionRequest,
    DecisionResponse,
    DecisionHistoryItem,
    DecisionHistoryResponse,
    DecisionPatternResponse,
    ClientPatternsResponse,
    ExecutionResultResponse,
    ReverseActionRequest,
    ReverseActionResponse,
)
from app.services.decisions import SuggestionService, DecisionService, ActionExecutor
from app.api.v1.deps import CurrentUser

router = APIRouter()


async def verify_accountant_access(
    client_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession,
) -> Administration:
    """Verify user has accountant access to the client."""
    if current_user.role not in ["accountant", "admin"]:
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only available for accountants"
        )
    
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(Administration.id == client_id)
        .where(AdministrationMember.user_id == current_user.id)
        .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(status_code=404, detail="Client not found or access denied")
    
    return administration


async def verify_issue_access(
    issue_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession,
) -> ClientIssue:
    """Verify user has access to the issue's client."""
    result = await db.execute(
        select(ClientIssue)
        .where(ClientIssue.id == issue_id)
    )
    issue = result.scalar_one_or_none()
    
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    # Verify access to the administration
    await verify_accountant_access(issue.administration_id, current_user, db)
    
    return issue


# ============ Suggestion Endpoints ============

@router.get("/issues/{issue_id}/suggestions", response_model=IssueSuggestionsResponse)
async def get_issue_suggestions(
    issue_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get suggested actions for an issue.
    
    Returns a list of actionable suggestions with:
    - Action type and title
    - Human-readable explanation
    - Confidence score (higher = more likely to be correct)
    - Parameters for the action
    
    Suggestions are sorted by priority and confidence.
    """
    issue = await verify_issue_access(issue_id, current_user, db)
    
    # Get or create suggestions
    suggestion_service = SuggestionService(db)
    suggestions = await suggestion_service.get_or_create_suggestions(issue_id)
    
    await db.commit()
    
    return IssueSuggestionsResponse(
        issue_id=issue_id,
        issue_title=issue.title,
        issue_code=issue.issue_code,
        suggestions=[SuggestedActionResponse.model_validate(s) for s in suggestions],
        total_suggestions=len(suggestions),
    )


# ============ Decision Endpoints ============

@router.post("/issues/{issue_id}/decide", response_model=DecisionResponse)
async def make_decision(
    issue_id: UUID,
    request: DecisionRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    auto_execute: bool = Query(True, description="Automatically execute approved actions"),
):
    """
    Make a decision on an issue.
    
    Decisions can be:
    - APPROVED: Accept the suggested action and execute it
    - REJECTED: Reject the suggestion (remembered for learning)
    - OVERRIDDEN: Approve with custom parameters
    
    By default, approved actions are executed immediately.
    Set auto_execute=false to approve without execution.
    """
    issue = await verify_issue_access(issue_id, current_user, db)
    
    if issue.is_resolved:
        raise HTTPException(
            status_code=400,
            detail="Cannot make decision on resolved issue"
        )
    
    # Validate suggested_action_id if provided
    if request.suggested_action_id:
        result = await db.execute(
            select(SuggestedAction)
            .where(SuggestedAction.id == request.suggested_action_id)
            .where(SuggestedAction.issue_id == issue_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Invalid suggested_action_id for this issue"
            )
    
    # Make the decision
    decision_service = DecisionService(db)
    decision = await decision_service.make_decision(
        issue_id=issue_id,
        action_type=ActionType(request.action_type.value),
        decision=DecisionType(request.decision.value),
        decided_by_id=current_user.id,
        suggested_action_id=request.suggested_action_id,
        override_parameters=request.override_parameters,
        notes=request.notes,
    )
    
    # Auto-execute if approved and requested
    if request.decision == DecisionType.APPROVED and auto_execute:
        executor = ActionExecutor(db)
        success, result_je_id, error = await executor.execute_decision(decision)
        
        await decision_service.mark_executed(
            decision_id=decision.id,
            result_journal_entry_id=result_je_id,
            error=error,
        )
    
    await db.commit()
    
    # Refresh to get updated data
    await db.refresh(decision)
    
    return DecisionResponse.model_validate(decision)


@router.post("/decisions/{decision_id}/execute", response_model=ExecutionResultResponse)
async def execute_decision(
    decision_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Execute a previously approved decision.
    
    Use this if a decision was approved with auto_execute=false
    or if execution previously failed and needs to be retried.
    """
    # Get the decision
    result = await db.execute(
        select(AccountantDecision)
        .where(AccountantDecision.id == decision_id)
        .options(selectinload(AccountantDecision.issue))
    )
    decision = result.scalar_one_or_none()
    
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")
    
    # Verify access
    await verify_accountant_access(
        decision.issue.administration_id,
        current_user,
        db
    )
    
    if decision.decision != DecisionType.APPROVED:
        raise HTTPException(
            status_code=400,
            detail="Only approved decisions can be executed"
        )
    
    if decision.execution_status == ExecutionStatus.EXECUTED:
        raise HTTPException(
            status_code=400,
            detail="Decision has already been executed"
        )
    
    # Execute
    executor = ActionExecutor(db)
    success, result_je_id, error = await executor.execute_decision(decision)
    
    decision_service = DecisionService(db)
    await decision_service.mark_executed(
        decision_id=decision.id,
        result_journal_entry_id=result_je_id,
        error=error,
    )
    
    await db.commit()
    await db.refresh(decision)
    
    return ExecutionResultResponse(
        decision_id=decision.id,
        execution_status=decision.execution_status,
        executed_at=decision.executed_at,
        result_journal_entry_id=decision.result_journal_entry_id,
        error_message=decision.execution_error,
        message="Execution successful" if success else f"Execution failed: {error}",
    )


@router.post("/decisions/{decision_id}/reverse", response_model=ReverseActionResponse)
async def reverse_decision(
    decision_id: UUID,
    request: ReverseActionRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Reverse an executed decision.
    
    This marks the decision as reversed and re-opens the associated issue.
    
    Note: For decisions that created journal entries, the financial entries
    remain in place for audit purposes. The accountant should manually create
    a reversal journal entry if needed to undo the financial impact.
    """
    # Get the decision
    result = await db.execute(
        select(AccountantDecision)
        .where(AccountantDecision.id == decision_id)
        .options(selectinload(AccountantDecision.issue))
    )
    decision = result.scalar_one_or_none()
    
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")
    
    # Verify access
    await verify_accountant_access(
        decision.issue.administration_id,
        current_user,
        db
    )
    
    if not decision.is_reversible:
        raise HTTPException(
            status_code=400,
            detail="This decision is not reversible"
        )
    
    if decision.execution_status != ExecutionStatus.EXECUTED:
        raise HTTPException(
            status_code=400,
            detail="Can only reverse executed decisions"
        )
    
    # Reverse the decision
    decision_service = DecisionService(db)
    decision = await decision_service.mark_reversed(
        decision_id=decision.id,
        reversed_by_id=current_user.id,
    )
    
    # Note: Financial journal entries remain in place for audit trail.
    # The issue is re-opened so accountant can create manual reversal if needed.
    
    await db.commit()
    
    return ReverseActionResponse(
        decision_id=decision.id,
        reversed_at=decision.reversed_at,
        reversal_journal_entry_id=None,
        message="Decision marked as reversed. Issue has been re-opened. If financial entries were created, please manually create a reversal entry.",
    )


# ============ History Endpoints ============

@router.get("/clients/{client_id}/decision-history", response_model=DecisionHistoryResponse)
async def get_decision_history(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    Get decision history for a client.
    
    Returns all decisions made on issues for this client,
    sorted by most recent first.
    """
    administration = await verify_accountant_access(client_id, current_user, db)
    
    decision_service = DecisionService(db)
    decisions = await decision_service.get_decision_history(
        administration_id=client_id,
        limit=limit,
        offset=offset,
    )
    total = await decision_service.get_decision_count(client_id)
    
    # Build response items with user names
    items = []
    for d in decisions:
        items.append(DecisionHistoryItem(
            id=d.id,
            issue_id=d.issue_id,
            issue_title=d.issue.title if d.issue else "Unknown",
            issue_code=d.issue.issue_code if d.issue else "UNKNOWN",
            action_type=d.action_type,
            decision=d.decision,
            decided_by_name=d.decided_by.full_name if d.decided_by else "Unknown",
            decided_at=d.decided_at,
            execution_status=d.execution_status,
            is_reversible=d.is_reversible,
        ))
    
    return DecisionHistoryResponse(
        client_id=client_id,
        client_name=administration.name,
        total_decisions=total,
        decisions=items,
    )


@router.get("/clients/{client_id}/decision-patterns", response_model=ClientPatternsResponse)
async def get_decision_patterns(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get learned decision patterns for a client.
    
    Shows which issue+action combinations have been frequently
    approved or rejected, and their confidence adjustments.
    """
    administration = await verify_accountant_access(client_id, current_user, db)
    
    decision_service = DecisionService(db)
    patterns = await decision_service.get_patterns(client_id)
    
    return ClientPatternsResponse(
        client_id=client_id,
        client_name=administration.name,
        patterns=[DecisionPatternResponse.model_validate(p) for p in patterns],
    )
