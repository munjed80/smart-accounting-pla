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
from app.models.bank import BankTransaction, BankTransactionStatus, ReconciliationAction
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
)
from app.services.bank_reconciliation import BankReconciliationService
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
