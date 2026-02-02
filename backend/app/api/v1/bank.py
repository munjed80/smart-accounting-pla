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

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.bank import BankTransaction, BankTransactionStatus, ReconciliationAction
from app.models.user import User
from app.schemas.bank import (
    BankImportRequest,
    BankImportResponse,
    BankTransactionResponse,
    BankTransactionListResponse,
    BankTransactionStatusEnum,
    SuggestMatchResponse,
    ApplyActionRequest,
    ApplyActionResponse,
    ReconciliationActionsListResponse,
    ReconciliationActionResponse,
)
from app.services.bank_reconciliation import BankReconciliationService
from app.api.v1.deps import CurrentUser, require_assigned_client

router = APIRouter()


@router.post("/bank/import", response_model=BankImportResponse)
async def import_bank_file(
    request: BankImportRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Import a bank statement CSV file.
    
    The file is expected to be base64 encoded and contain columns for:
    - date (booking date)
    - amount (positive = credit, negative = debit)
    - description
    - optionally: counterparty name, IBAN, reference
    
    Transactions are imported idempotently using a hash of key fields.
    Duplicates are silently skipped.
    """
    # Verify client access
    await require_assigned_client(request.administration_id, current_user, db)
    
    # Import the file
    service = BankReconciliationService(db, request.administration_id, current_user.id)
    result = await service.import_csv(request)
    
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
    limit: int = Query(50, ge=1, le=200, description="Results per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """
    List bank transactions for an administration.
    
    Supports filtering by status, search query, and date range.
    """
    # Verify client access
    await require_assigned_client(administration_id, current_user, db)
    
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
    
    # Get total count
    count_result = await db.execute(count_query)
    total_count = count_result.scalar() or 0
    
    # Apply pagination
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    transactions = result.scalars().all()
    
    return BankTransactionListResponse(
        transactions=[BankTransactionResponse.model_validate(t) for t in transactions],
        total_count=total_count,
        limit=limit,
        offset=offset,
    )


@router.post("/bank/transactions/{transaction_id}/suggest", response_model=SuggestMatchResponse)
async def suggest_matches(
    transaction_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
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
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transactie niet gevonden")
    
    # Verify client access
    await require_assigned_client(transaction.administration_id, current_user, db)
    
    # Get suggestions
    service = BankReconciliationService(db, transaction.administration_id, current_user.id)
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
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transactie niet gevonden")
    
    # Verify client access
    await require_assigned_client(transaction.administration_id, current_user, db)
    
    # Apply action
    service = BankReconciliationService(db, transaction.administration_id, current_user.id)
    try:
        updated_transaction, journal_entry_id = await service.apply_action(transaction_id, request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Build Dutch message
    action_messages = {
        "ACCEPT_MATCH": "Match geaccepteerd",
        "LINK_INVOICE": "Gekoppeld aan factuur",
        "CREATE_EXPENSE": "Uitgave geboekt",
        "IGNORE": "Transactie genegeerd",
        "UNMATCH": "Match ongedaan gemaakt",
    }
    message = action_messages.get(request.action.value, "Actie uitgevoerd")
    
    return ApplyActionResponse(
        transaction_id=transaction_id,
        new_status=BankTransactionStatusEnum(updated_transaction.status.value),
        action_applied=request.action,
        journal_entry_id=journal_entry_id,
        message=message,
    )


@router.get("/bank/actions", response_model=ReconciliationActionsListResponse)
async def list_reconciliation_actions(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: UUID = Query(..., description="Administration ID"),
    limit: int = Query(100, ge=1, le=500, description="Results per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """
    List reconciliation actions for audit/export.
    
    Returns all actions with user information for a given administration.
    """
    # Verify client access
    await require_assigned_client(administration_id, current_user, db)
    
    # Build query to get actions for transactions in this administration
    query = (
        select(ReconciliationAction)
        .join(BankTransaction)
        .options(selectinload(ReconciliationAction.user))
        .where(BankTransaction.administration_id == administration_id)
        .order_by(ReconciliationAction.created_at.desc())
    )
    
    count_query = (
        select(func.count(ReconciliationAction.id))
        .join(BankTransaction)
        .where(BankTransaction.administration_id == administration_id)
    )
    
    # Get total count
    count_result = await db.execute(count_query)
    total_count = count_result.scalar() or 0
    
    # Apply pagination
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    actions = result.scalars().all()
    
    return ReconciliationActionsListResponse(
        actions=[
            ReconciliationActionResponse(
                id=a.id,
                bank_transaction_id=a.bank_transaction_id,
                user_id=a.user_id,
                user_name=a.user.full_name if a.user else None,
                action=a.action.value,
                payload=a.payload,
                created_at=a.created_at,
            )
            for a in actions
        ],
        total_count=total_count,
    )
