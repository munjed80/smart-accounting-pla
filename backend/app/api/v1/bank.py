"""
Bank Reconciliation API Endpoints

Endpoints for:
- Bank file import (CSV)
- Bank transaction listing
- Match suggestions
- Reconciliation actions
"""
from datetime import date
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.bank import (
    BankTransaction,
    BankTransactionStatus,
    BankMatchProposal,
    BankMatchRule,
    BankTransactionSplit,
    ReconciliationAction,
)
from app.schemas.bank import (
    BankImportResponse,
    BankTransactionResponse,
    BankTransactionListResponse,
    BankTransactionStatusEnum,
    SuggestMatchResponse,
    ApplyActionRequest,
    ApplyActionResponse,
    ReconciliationActionsListResponse,
    ReconciliationActionResponse,
    GenerateProposalsRequest,
    GenerateProposalsResponse,
    MatchProposalResponse,
    ProposalsListResponse,
    AcceptProposalResponse,
    RejectProposalResponse,
    UnmatchResponse,
    SplitTransactionRequest,
    SplitTransactionResponse,
    BankMatchRuleRequest,
    BankMatchRuleResponse,
    MatchRulesListResponse,
    BankReconciliationKPI,
)
from app.services.bank_reconciliation import BankReconciliationService
from app.services.bank_matching_engine import BankMatchingEngine
from app.api.v1.deps import CurrentUser, require_assigned_accountant_client

router = APIRouter()


@router.post("/bank/import", response_model=BankImportResponse)
async def import_bank_file(
    file: Annotated[UploadFile, File(..., description="Bank statement file (CSV, CAMT.053, MT940)")],
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: UUID = Query(..., description="Administration ID"),
    bank_account_iban: Optional[str] = Form(None),
    bank_name: Optional[str] = Form(None),
):
    """
    Import a bank statement file.
    
    Supports multiple formats:
    - CSV files (with standard bank columns)
    - CAMT.053 XML (ISO 20022 standard)
    - MT940 text (SWIFT format)
    
    The format is automatically detected based on file content and extension.
    
    Transactions are imported idempotently using a hash of key fields.
    Duplicates are silently skipped.
    """
    await require_assigned_accountant_client(administration_id, current_user, db)

    service = BankReconciliationService(db, administration_id, current_user.id)
    file_bytes = await file.read()
    result = await service.import_file(file_bytes, file.filename, bank_account_iban, bank_name)
    return result


@router.get("/bank/transactions", response_model=BankTransactionListResponse)
async def list_bank_transactions(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: UUID = Query(..., description="Administration ID"),
    status: Optional[BankTransactionStatusEnum] = Query(None, description="Filter by status"),
    q: Optional[str] = Query(None, description="Search in description/counterparty"),
    date_from: Optional[date] = Query(None, description="Filter from date"),
    date_to: Optional[date] = Query(None, description="Filter to date"),
    min_amount: Optional[float] = Query(None, description="Minimum amount"),
    max_amount: Optional[float] = Query(None, description="Maximum amount"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=200, description="Results per page"),
):
    """
    List bank transactions for an administration.
    
    Supports filtering by status, search query, and date range.
    """
    await require_assigned_accountant_client(administration_id, current_user, db)
    
    # Build query
    query = (
        select(BankTransaction)
        .where(BankTransaction.administration_id == administration_id)
        .order_by(BankTransaction.booking_date.desc(), BankTransaction.created_at.desc())
    )
    
    count_query = (
        select(func.count(BankTransaction.id))
        .where(BankTransaction.administration_id == administration_id)
    )
    
    # Apply filters
    if status:
        query = query.where(BankTransaction.status == BankTransactionStatus(status.value))
        count_query = count_query.where(BankTransaction.status == BankTransactionStatus(status.value))
    
    if q:
        search_term = f"%{q}%"
        query = query.where(
            (BankTransaction.description.ilike(search_term)) |
            (BankTransaction.counterparty_name.ilike(search_term)) |
            (BankTransaction.reference.ilike(search_term))
        )
        count_query = count_query.where(
            (BankTransaction.description.ilike(search_term)) |
            (BankTransaction.counterparty_name.ilike(search_term)) |
            (BankTransaction.reference.ilike(search_term))
        )
    
    if date_from:
        query = query.where(BankTransaction.booking_date >= date_from)
        count_query = count_query.where(BankTransaction.booking_date >= date_from)
    
    if date_to:
        query = query.where(BankTransaction.booking_date <= date_to)
        count_query = count_query.where(BankTransaction.booking_date <= date_to)

    if min_amount is not None:
        query = query.where(BankTransaction.amount >= min_amount)
        count_query = count_query.where(BankTransaction.amount >= min_amount)

    if max_amount is not None:
        query = query.where(BankTransaction.amount <= max_amount)
        count_query = count_query.where(BankTransaction.amount <= max_amount)
    
    # Get total count
    count_result = await db.execute(count_query)
    total_count = count_result.scalar() or 0
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.limit(page_size).offset(offset)
    
    result = await db.execute(query)
    transactions = result.scalars().all()
    
    return BankTransactionListResponse(
        transactions=[BankTransactionResponse.model_validate(t) for t in transactions],
        total_count=total_count,
        page=page,
        page_size=page_size,
    )


@router.post("/bank/transactions/{transaction_id}/suggest", response_model=SuggestMatchResponse)
async def suggest_matches(
    transaction_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: UUID = Query(..., description="Administration ID"),
):
    """
    Get match suggestions for a bank transaction.
    
    Returns ranked suggestions based on:
    - Invoice number in description
    - Amount matching open invoices/payables
    - Counterparty IBAN matching known vendors
    """
    # Get transaction to verify access
    result = await db.execute(
        select(BankTransaction)
        .where(BankTransaction.id == transaction_id)
        .where(BankTransaction.administration_id == administration_id)
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transactie niet gevonden")
    
    await require_assigned_accountant_client(administration_id, current_user, db)
    
    # Get suggestions
    service = BankReconciliationService(db, administration_id, current_user.id)
    try:
        transaction, suggestions = await service.get_match_suggestions(transaction_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    message = (
        f"{len(suggestions)} suggestie(s) gevonden" if suggestions
        else "Geen suggesties gevonden voor deze transactie"
    )
    
    return SuggestMatchResponse(
        transaction_id=transaction_id,
        suggestions=suggestions,
        message=message,
    )


@router.post("/bank/transactions/{transaction_id}/apply", response_model=ApplyActionResponse)
async def apply_action(
    transaction_id: UUID,
    request: ApplyActionRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: UUID = Query(..., description="Administration ID"),
):
    """
    Apply a reconciliation action to a bank transaction.
    
    Actions:
    - ACCEPT_MATCH: Accept a suggested match (requires entity_id)
    - LINK_INVOICE: Link to an existing invoice (requires entity_id)
    - CREATE_EXPENSE: Create a new expense entry (optional vat_code, ledger_code)
    - IGNORE: Mark transaction as ignored
    - UNMATCH: Undo a previous match
    
    This is an atomic operation that:
    1. Updates the transaction status
    2. Creates a journal entry (for CREATE_EXPENSE)
    3. Records the action for audit trail
    """
    # Get transaction to verify access
    result = await db.execute(
        select(BankTransaction)
        .where(BankTransaction.id == transaction_id)
        .where(BankTransaction.administration_id == administration_id)
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transactie niet gevonden")
    
    await require_assigned_accountant_client(administration_id, current_user, db)
    
    # Apply action
    service = BankReconciliationService(db, administration_id, current_user.id)
    try:
        updated_transaction, journal_entry_id = await service.apply_action(transaction_id, request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Build Dutch message
    action_messages = {
        "APPLY_MATCH": "Match toegepast",
        "CREATE_EXPENSE": "Uitgave geboekt",
        "IGNORE": "Transactie genegeerd",
        "UNMATCH": "Match ongedaan gemaakt",
    }
    message = action_messages.get(request.action_type.value, "Actie uitgevoerd")

    return ApplyActionResponse(
        transaction=BankTransactionResponse.model_validate(updated_transaction),
        action_applied=request.action_type,
        journal_entry_id=journal_entry_id,
        message=message,
    )


@router.get("/bank/actions", response_model=ReconciliationActionsListResponse)
async def list_reconciliation_actions(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: UUID = Query(..., description="Administration ID"),
    action_type: Optional[str] = Query(None, description="Filter by action type"),
    date_from: Optional[date] = Query(None, description="Filter from date"),
    date_to: Optional[date] = Query(None, description="Filter to date"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=500, description="Results per page"),
):
    """
    List reconciliation actions for audit/export.
    
    Returns all actions with user information for a given administration.
    """
    await require_assigned_accountant_client(administration_id, current_user, db)
    
    # Build query to get actions for transactions in this administration
    query = (
        select(ReconciliationAction)
        .options(selectinload(ReconciliationAction.accountant))
        .where(ReconciliationAction.administration_id == administration_id)
        .order_by(ReconciliationAction.created_at.desc())
    )
    
    count_query = (
        select(func.count(ReconciliationAction.id))
        .where(ReconciliationAction.administration_id == administration_id)
    )

    if action_type:
        query = query.where(ReconciliationAction.action_type == action_type)
        count_query = count_query.where(ReconciliationAction.action_type == action_type)

    if date_from:
        query = query.where(ReconciliationAction.created_at >= date_from)
        count_query = count_query.where(ReconciliationAction.created_at >= date_from)

    if date_to:
        query = query.where(ReconciliationAction.created_at <= date_to)
        count_query = count_query.where(ReconciliationAction.created_at <= date_to)
    
    # Get total count
    count_result = await db.execute(count_query)
    total_count = count_result.scalar() or 0
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.limit(page_size).offset(offset)
    
    result = await db.execute(query)
    actions = result.scalars().all()
    
    return ReconciliationActionsListResponse(
        actions=[
            ReconciliationActionResponse(
                id=a.id,
                administration_id=a.administration_id,
                accountant_user_id=a.accountant_user_id,
                bank_transaction_id=a.bank_transaction_id,
                action_type=a.action_type,
                payload=a.payload,
                created_at=a.created_at,
            )
            for a in actions
        ],
        total_count=total_count,
    )


# ============ Matching Engine Endpoints ============

@router.post("/accountant/clients/{client_id}/bank/proposals/generate", response_model=GenerateProposalsResponse)
async def generate_proposals(
    client_id: UUID,
    request: GenerateProposalsRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Generate intelligent matching proposals for unmatched transactions.
    
    Analyzes transactions and creates proposals with confidence scores
    based on amount matching, reference matching, and pattern recognition.
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    engine = BankMatchingEngine(db, client_id, current_user.id)
    result = await engine.generate_proposals(
        transaction_id=request.transaction_id,
        date_from=request.date_from,
        date_to=request.date_to,
        limit_per_transaction=request.limit_per_transaction,
    )
    
    return GenerateProposalsResponse(
        transactions_processed=result["transactions_processed"],
        proposals_generated=result["proposals_generated"],
        message=f"{result['proposals_generated']} voorstellen gegenereerd voor {result['transactions_processed']} transacties"
    )


@router.get("/accountant/clients/{client_id}/bank/transactions/{tx_id}/proposals", response_model=ProposalsListResponse)
async def get_transaction_proposals(
    client_id: UUID,
    tx_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get all matching proposals for a transaction.
    
    Returns proposals sorted by confidence score.
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    # Verify transaction belongs to this client
    tx_result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == tx_id,
            BankTransaction.administration_id == client_id,
        )
    )
    transaction = tx_result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Get proposals
    query = (
        select(BankMatchProposal)
        .where(BankMatchProposal.bank_transaction_id == tx_id)
        .order_by(BankMatchProposal.confidence_score.desc())
    )
    
    result = await db.execute(query)
    proposals = result.scalars().all()
    
    return ProposalsListResponse(
        transaction_id=tx_id,
        proposals=[MatchProposalResponse.from_orm(p) for p in proposals],
        total_count=len(proposals),
    )


@router.post("/accountant/clients/{client_id}/bank/proposals/{proposal_id}/accept", response_model=AcceptProposalResponse)
async def accept_proposal(
    client_id: UUID,
    proposal_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Accept a matching proposal.
    
    Marks the transaction as matched and creates audit trail.
    Idempotent: if already matched to same target, returns success.
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    # Get proposal to find transaction
    proposal_result = await db.execute(
        select(BankMatchProposal).where(
            BankMatchProposal.id == proposal_id,
            BankMatchProposal.administration_id == client_id,
        )
    )
    proposal = proposal_result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    engine = BankMatchingEngine(db, client_id, current_user.id)
    result = await engine.accept_proposal(proposal.bank_transaction_id, proposal_id)
    
    return AcceptProposalResponse(**result)


@router.post("/accountant/clients/{client_id}/bank/proposals/{proposal_id}/reject", response_model=RejectProposalResponse)
async def reject_proposal(
    client_id: UUID,
    proposal_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Reject a matching proposal.
    
    Marks proposal as rejected. Transaction remains unmatched.
    Creates audit trail entry.
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    # Get proposal to find transaction
    proposal_result = await db.execute(
        select(BankMatchProposal).where(
            BankMatchProposal.id == proposal_id,
            BankMatchProposal.administration_id == client_id,
        )
    )
    proposal = proposal_result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    engine = BankMatchingEngine(db, client_id, current_user.id)
    result = await engine.reject_proposal(proposal.bank_transaction_id, proposal_id)
    
    return RejectProposalResponse(**result)


@router.post("/accountant/clients/{client_id}/bank/transactions/{tx_id}/unmatch", response_model=UnmatchResponse)
async def unmatch_transaction(
    client_id: UUID,
    tx_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Unmatch a previously matched transaction.
    
    Reverts transaction to unmatched state. Safe undo with audit trail.
    Keeps history of the previous match.
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    # Verify transaction belongs to this client
    tx_result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == tx_id,
            BankTransaction.administration_id == client_id,
        )
    )
    transaction = tx_result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    engine = BankMatchingEngine(db, client_id, current_user.id)
    result = await engine.unmatch_transaction(tx_id)
    
    return UnmatchResponse(**result)


@router.post("/accountant/clients/{client_id}/bank/transactions/{tx_id}/split", response_model=SplitTransactionResponse)
async def split_transaction(
    client_id: UUID,
    tx_id: UUID,
    request: SplitTransactionRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Split a transaction into multiple parts.
    
    Allows matching one bank transaction to multiple targets.
    Validates that sum of splits equals transaction amount.
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    # Verify transaction belongs to this client
    tx_result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == tx_id,
            BankTransaction.administration_id == client_id,
        )
    )
    transaction = tx_result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    engine = BankMatchingEngine(db, client_id, current_user.id)
    result = await engine.split_transaction(tx_id, request.splits)
    
    return SplitTransactionResponse(**result)


# ============ Rules Engine Endpoints ============

@router.get("/accountant/clients/{client_id}/bank/rules", response_model=MatchRulesListResponse)
async def list_match_rules(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    List all matching rules for a client.
    
    Returns rules sorted by priority (descending).
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    query = (
        select(BankMatchRule)
        .where(BankMatchRule.client_id == client_id)
        .order_by(BankMatchRule.priority.desc(), BankMatchRule.created_at.desc())
    )
    
    result = await db.execute(query)
    rules = result.scalars().all()
    
    return MatchRulesListResponse(
        rules=[BankMatchRuleResponse.from_orm(r) for r in rules],
        total_count=len(rules),
    )


@router.post("/accountant/clients/{client_id}/bank/rules", response_model=BankMatchRuleResponse)
async def create_match_rule(
    client_id: UUID,
    request: BankMatchRuleRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new matching rule.
    
    Rules are applied to transactions in priority order.
    Can auto-accept matches or boost confidence scores.
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    rule = BankMatchRule(
        client_id=client_id,
        name=request.name,
        enabled=request.enabled,
        priority=request.priority,
        conditions=request.conditions,
        action=request.action,
        created_by_user_id=current_user.id,
    )
    
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    
    return BankMatchRuleResponse.from_orm(rule)


@router.patch("/accountant/clients/{client_id}/bank/rules/{rule_id}", response_model=BankMatchRuleResponse)
async def update_match_rule(
    client_id: UUID,
    rule_id: UUID,
    request: BankMatchRuleRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update an existing matching rule.
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    # Get rule
    rule_result = await db.execute(
        select(BankMatchRule).where(
            BankMatchRule.id == rule_id,
            BankMatchRule.client_id == client_id,
        )
    )
    rule = rule_result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    # Update fields
    rule.name = request.name
    rule.enabled = request.enabled
    rule.priority = request.priority
    rule.conditions = request.conditions
    rule.action = request.action
    
    await db.commit()
    await db.refresh(rule)
    
    return BankMatchRuleResponse.from_orm(rule)


@router.delete("/accountant/clients/{client_id}/bank/rules/{rule_id}")
async def delete_match_rule(
    client_id: UUID,
    rule_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Delete a matching rule.
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    # Get rule
    rule_result = await db.execute(
        select(BankMatchRule).where(
            BankMatchRule.id == rule_id,
            BankMatchRule.client_id == client_id,
        )
    )
    rule = rule_result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    await db.delete(rule)
    await db.commit()
    
    return {"status": "success", "message": "Rule deleted"}


# ============ KPI Endpoints ============

@router.get("/accountant/clients/{client_id}/bank/kpi", response_model=BankReconciliationKPI)
async def get_reconciliation_kpi(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    period_days: int = Query(30, ge=1, le=365, description="Period in days for KPI calculation"),
):
    """
    Get bank reconciliation KPI metrics.
    
    Returns statistics for the specified period:
    - Match percentage
    - Transaction counts by status
    - Total inflow/outflow
    
    Requires: Active Machtiging (consent) for the client.
    """
    await require_assigned_accountant_client(client_id, current_user, db)
    
    from datetime import datetime, timedelta
    from decimal import Decimal
    
    # Calculate date range
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=period_days)
    
    # Query transactions in period
    query = select(BankTransaction).where(
        BankTransaction.administration_id == client_id,
        BankTransaction.booking_date >= start_date,
        BankTransaction.booking_date <= end_date,
    )
    
    result = await db.execute(query)
    transactions = result.scalars().all()
    
    # Calculate KPIs
    total = len(transactions)
    matched = sum(1 for t in transactions if t.status == BankTransactionStatus.MATCHED)
    unmatched = sum(1 for t in transactions if t.status == BankTransactionStatus.NEW)
    ignored = sum(1 for t in transactions if t.status == BankTransactionStatus.IGNORED)
    needs_review = sum(1 for t in transactions if t.status == BankTransactionStatus.NEEDS_REVIEW)
    
    matched_pct = (matched / total * 100) if total > 0 else 0.0
    
    inflow = sum(t.amount for t in transactions if t.amount > 0)
    outflow = sum(abs(t.amount) for t in transactions if t.amount < 0)
    
    return BankReconciliationKPI(
        total_transactions=total,
        matched_count=matched,
        unmatched_count=unmatched,
        ignored_count=ignored,
        needs_review_count=needs_review,
        matched_percentage=round(matched_pct, 1),
        total_inflow=inflow,
        total_outflow=outflow,
        period_days=period_days,
    )
