from datetime import datetime, timezone
from typing import Annotated, List, Optional
from uuid import UUID
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.administration import Administration, AdministrationMember
from app.models.transaction import Transaction, TransactionLine, TransactionStatus
from app.models.accounting import ChartOfAccount, VatCode
from app.schemas.transaction import (
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
    TransactionListItem,
    TransactionLineResponse,
    TransactionStats,
)
from app.api.v1.deps import CurrentUser

router = APIRouter()


def build_transaction_response(transaction: Transaction) -> TransactionResponse:
    """Build transaction response with computed total and line details"""
    total_debit = sum(line.debit_amount for line in transaction.lines)
    total_credit = sum(line.credit_amount for line in transaction.lines)
    total_amount = max(total_debit, total_credit)
    
    lines = []
    for line in transaction.lines:
        lines.append(TransactionLineResponse(
            id=line.id,
            account_id=line.account_id,
            vat_code_id=line.vat_code_id,
            description=line.description,
            debit_amount=line.debit_amount,
            credit_amount=line.credit_amount,
            ledger_account_code=line.account.account_code if line.account else None,
            ledger_account_name=line.account.account_name if line.account else None,
            vat_code=line.vat_code.code if line.vat_code else None,
            created_at=line.created_at,
        ))
    
    return TransactionResponse(
        id=transaction.id,
        administration_id=transaction.administration_id,
        document_id=transaction.document_id,
        booking_number=transaction.booking_number,
        transaction_date=transaction.transaction_date,
        description=transaction.description,
        status=transaction.status,
        ai_confidence_score=transaction.ai_confidence_score,
        created_at=transaction.created_at,
        updated_at=transaction.updated_at,
        posted_at=transaction.posted_at,
        total_amount=total_amount,
        lines=lines,
    )


@router.get("/stats", response_model=TransactionStats)
async def get_transaction_stats(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: Optional[UUID] = Query(None),
):
    """Get transaction statistics"""
    # Base query for user's administrations
    base_filter = (
        select(Transaction)
        .join(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == current_user.id)
    )
    
    if administration_id:
        base_filter = base_filter.where(Transaction.administration_id == administration_id)
    
    # Count totals
    result = await db.execute(base_filter)
    transactions = result.scalars().all()
    
    total_transactions = len(transactions)
    draft_count = sum(1 for t in transactions if t.status == TransactionStatus.DRAFT)
    posted_count = sum(1 for t in transactions if t.status == TransactionStatus.POSTED)
    
    # Calculate totals from lines
    total_debit = Decimal("0.00")
    total_credit = Decimal("0.00")
    
    for t in transactions:
        await db.refresh(t, ["lines"])
        for line in t.lines:
            total_debit += line.debit_amount
            total_credit += line.credit_amount
    
    # Get recent transactions
    recent_result = await db.execute(
        base_filter.options(selectinload(Transaction.lines))
        .order_by(Transaction.created_at.desc())
        .limit(5)
    )
    recent = recent_result.scalars().all()
    
    recent_transactions = []
    for t in recent:
        t_total = max(
            sum(line.debit_amount for line in t.lines),
            sum(line.credit_amount for line in t.lines)
        )
        recent_transactions.append(TransactionListItem(
            id=t.id,
            booking_number=t.booking_number,
            transaction_date=t.transaction_date,
            description=t.description,
            status=t.status,
            total_amount=t_total,
            ai_confidence_score=t.ai_confidence_score,
        ))
    
    return TransactionStats(
        total_transactions=total_transactions,
        draft_count=draft_count,
        posted_count=posted_count,
        total_debit=total_debit,
        total_credit=total_credit,
        recent_transactions=recent_transactions,
    )


@router.get("", response_model=List[TransactionListItem])
async def list_transactions(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: UUID = None,
    status: TransactionStatus = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    """List transactions for user's administrations"""
    query = (
        select(Transaction)
        .join(Administration)
        .join(AdministrationMember)
        .options(selectinload(Transaction.lines))
        .where(AdministrationMember.user_id == current_user.id)
    )
    
    if administration_id:
        query = query.where(Transaction.administration_id == administration_id)
    
    if status:
        query = query.where(Transaction.status == status)
    
    query = query.order_by(Transaction.created_at.desc()).offset(skip).limit(limit)
    
    result = await db.execute(query)
    transactions = result.scalars().all()
    
    response = []
    for t in transactions:
        t_total = max(
            sum(line.debit_amount for line in t.lines),
            sum(line.credit_amount for line in t.lines)
        )
        response.append(TransactionListItem(
            id=t.id,
            booking_number=t.booking_number,
            transaction_date=t.transaction_date,
            description=t.description,
            status=t.status,
            total_amount=t_total,
            ai_confidence_score=t.ai_confidence_score,
        ))
    
    return response


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get transaction details"""
    result = await db.execute(
        select(Transaction)
        .options(
            selectinload(Transaction.lines).selectinload(TransactionLine.account),
            selectinload(Transaction.lines).selectinload(TransactionLine.vat_code),
            selectinload(Transaction.administration).selectinload(Administration.members),
        )
        .where(Transaction.id == transaction_id)
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check access
    member = next(
        (m for m in transaction.administration.members if m.user_id == current_user.id),
        None
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not authorized to view this transaction")
    
    return build_transaction_response(transaction)


@router.put("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: UUID,
    update_data: TransactionUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a draft transaction"""
    result = await db.execute(
        select(Transaction)
        .options(
            selectinload(Transaction.lines).selectinload(TransactionLine.account),
            selectinload(Transaction.lines).selectinload(TransactionLine.vat_code),
            selectinload(Transaction.administration).selectinload(Administration.members),
        )
        .where(Transaction.id == transaction_id)
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check access
    member = next(
        (m for m in transaction.administration.members if m.user_id == current_user.id),
        None
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not authorized to edit this transaction")
    
    # Can only edit DRAFT transactions
    if transaction.status != TransactionStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Can only edit draft transactions")
    
    # Update fields
    if update_data.transaction_date is not None:
        transaction.transaction_date = update_data.transaction_date
    if update_data.description is not None:
        transaction.description = update_data.description
    
    # Update lines if provided
    if update_data.lines is not None:
        # Delete existing lines
        for line in transaction.lines:
            await db.delete(line)
        
        # Create new lines
        for line_data in update_data.lines:
            # Verify account exists and belongs to administration
            account_result = await db.execute(
                select(ChartOfAccount)
                .where(ChartOfAccount.id == line_data.account_id)
                .where(ChartOfAccount.administration_id == transaction.administration_id)
            )
            account = account_result.scalar_one_or_none()
            if not account:
                raise HTTPException(status_code=400, detail=f"Invalid account: {line_data.account_id}")
            
            line = TransactionLine(
                transaction_id=transaction.id,
                account_id=line_data.account_id,
                vat_code_id=line_data.vat_code_id,
                description=line_data.description,
                debit_amount=line_data.debit_amount,
                credit_amount=line_data.credit_amount,
            )
            db.add(line)
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(Transaction)
        .options(
            selectinload(Transaction.lines).selectinload(TransactionLine.account),
            selectinload(Transaction.lines).selectinload(TransactionLine.vat_code),
        )
        .where(Transaction.id == transaction_id)
    )
    transaction = result.scalar_one()
    
    return build_transaction_response(transaction)


@router.post("/{transaction_id}/post", response_model=TransactionResponse)
async def post_transaction(
    transaction_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Post a transaction (validate debit == credit)"""
    result = await db.execute(
        select(Transaction)
        .options(
            selectinload(Transaction.lines).selectinload(TransactionLine.account),
            selectinload(Transaction.lines).selectinload(TransactionLine.vat_code),
            selectinload(Transaction.administration).selectinload(Administration.members),
        )
        .where(Transaction.id == transaction_id)
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check access
    member = next(
        (m for m in transaction.administration.members if m.user_id == current_user.id),
        None
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not authorized to post this transaction")
    
    # Can only post DRAFT transactions
    if transaction.status != TransactionStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Transaction is already posted")
    
    # Validate debit == credit
    total_debit = sum(line.debit_amount for line in transaction.lines)
    total_credit = sum(line.credit_amount for line in transaction.lines)
    
    if total_debit != total_credit:
        raise HTTPException(
            status_code=400,
            detail=f"Transaction is not balanced. Debit: {total_debit}, Credit: {total_credit}"
        )
    
    if total_debit == 0:
        raise HTTPException(status_code=400, detail="Transaction has no amounts")
    
    # Post the transaction
    transaction.status = TransactionStatus.POSTED
    transaction.posted_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(transaction)
    
    return build_transaction_response(transaction)


@router.post("/{transaction_id}/approve", response_model=TransactionResponse)
async def approve_transaction(
    transaction_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Alias for post_transaction for frontend compatibility"""
    return await post_transaction(transaction_id, current_user, db)


@router.post("/{transaction_id}/reject")
async def reject_transaction(
    transaction_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a draft transaction"""
    result = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.administration).selectinload(Administration.members))
        .where(Transaction.id == transaction_id)
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check access
    member = next(
        (m for m in transaction.administration.members if m.user_id == current_user.id),
        None
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Can only reject DRAFT transactions
    if transaction.status != TransactionStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Can only reject draft transactions")
    
    await db.delete(transaction)
    await db.commit()
    
    return {"message": "Transaction rejected and deleted"}


@router.delete("/{transaction_id}")
async def delete_transaction(
    transaction_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a draft transaction"""
    return await reject_transaction(transaction_id, current_user, db)
