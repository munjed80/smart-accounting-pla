"""
Payment API Endpoints

Provides payment management endpoints for ZZP users:
- Create payments
- Allocate payments to invoices
- Mark invoices as paid/unpaid
- Record partial payments
- View payment history
"""
from datetime import datetime, timezone
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.payment import ZZPPayment, PaymentStatus
from app.models.zzp import ZZPInvoice
from app.schemas.payment import (
    PaymentCreate,
    PaymentUpdate,
    PaymentResponse,
    PaymentListResponse,
    PaymentAllocationResponse,
    MarkInvoicePaidRequest,
    PartialPaymentRequest,
    InvoicePaymentSummary,
)
from app.services.payment_service import PaymentService
from app.api.v1.deps import CurrentUser, require_zzp


router = APIRouter()


async def get_user_administration_id(user_id: UUID, db: AsyncSession) -> UUID:
    """Get the administration ID for a ZZP user."""
    from app.models.administration import Administration, AdministrationMember
    
    result = await db.execute(
        select(Administration.id)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == user_id)
        .where(Administration.is_active == True)
        .order_by(Administration.created_at)
        .limit(1)
    )
    administration_id = result.scalar_one_or_none()
    
    if not administration_id:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "NO_ADMINISTRATION",
                "message": "Geen administratie gevonden."
            }
        )
    
    return administration_id


def payment_to_response(payment: ZZPPayment) -> PaymentResponse:
    """Convert payment model to response schema."""
    # Calculate allocated amount
    allocated_amount = sum(a.allocated_amount_cents for a in payment.allocations)
    unallocated_amount = payment.amount_cents - allocated_amount
    
    return PaymentResponse(
        id=payment.id,
        administration_id=payment.administration_id,
        customer_id=payment.customer_id,
        amount_cents=payment.amount_cents,
        payment_date=payment.payment_date,
        payment_method=payment.payment_method,
        reference=payment.reference,
        bank_transaction_id=payment.bank_transaction_id,
        status=payment.status,
        notes=payment.notes,
        allocations=[
            PaymentAllocationResponse.model_validate(a)
            for a in payment.allocations
        ],
        allocated_amount_cents=allocated_amount,
        unallocated_amount_cents=unallocated_amount,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
    )


@router.get("/payments", response_model=PaymentListResponse)
async def list_payments(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    customer_id: Optional[UUID] = Query(None),
    status: Optional[str] = Query(None, pattern=r'^(pending|completed|failed|reversed|cancelled)$'),
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
):
    """
    List all payments for the current user's administration.
    """
    require_zzp(current_user)
    
    administration_id = await get_user_administration_id(current_user.id, db)
    
    # Build query
    query = (
        select(ZZPPayment)
        .options(selectinload(ZZPPayment.allocations))
        .where(ZZPPayment.administration_id == administration_id)
    )
    
    # Apply filters
    if customer_id:
        query = query.where(ZZPPayment.customer_id == customer_id)
    if status:
        query = query.where(ZZPPayment.status == status)
    if from_date:
        query = query.where(ZZPPayment.payment_date >= datetime.fromisoformat(from_date))
    if to_date:
        query = query.where(ZZPPayment.payment_date <= datetime.fromisoformat(to_date))
    
    query = query.order_by(ZZPPayment.payment_date.desc())
    
    result = await db.execute(query)
    payments = result.scalars().all()
    
    return PaymentListResponse(
        payments=[payment_to_response(p) for p in payments],
        total=len(payments)
    )


@router.post("/payments", response_model=PaymentResponse, status_code=201)
async def create_payment(
    payment_in: PaymentCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new payment record.
    """
    require_zzp(current_user)
    
    administration_id = await get_user_administration_id(current_user.id, db)
    
    service = PaymentService(db, administration_id)
    
    payment = await service.create_payment(
        amount_cents=payment_in.amount_cents,
        payment_date=datetime.fromisoformat(payment_in.payment_date),
        customer_id=payment_in.customer_id,
        payment_method=payment_in.payment_method,
        reference=payment_in.reference,
        notes=payment_in.notes,
    )
    
    await db.commit()
    
    # Reload with allocations
    result = await db.execute(
        select(ZZPPayment)
        .options(selectinload(ZZPPayment.allocations))
        .where(ZZPPayment.id == payment.id)
    )
    payment = result.scalar_one()
    
    return payment_to_response(payment)


@router.get("/payments/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get a specific payment by ID.
    """
    require_zzp(current_user)
    
    administration_id = await get_user_administration_id(current_user.id, db)
    
    result = await db.execute(
        select(ZZPPayment)
        .options(selectinload(ZZPPayment.allocations))
        .where(
            ZZPPayment.id == payment_id,
            ZZPPayment.administration_id == administration_id
        )
    )
    payment = result.scalar_one_or_none()
    
    if not payment:
        raise HTTPException(
            status_code=404,
            detail={"code": "PAYMENT_NOT_FOUND", "message": "Betaling niet gevonden."}
        )
    
    return payment_to_response(payment)


@router.post("/invoices/{invoice_id}/mark-paid", response_model=PaymentResponse)
async def mark_invoice_paid(
    invoice_id: UUID,
    request: MarkInvoicePaidRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Mark an invoice as paid by creating a payment for the full amount.
    """
    require_zzp(current_user)
    
    administration_id = await get_user_administration_id(current_user.id, db)
    
    service = PaymentService(db, administration_id)
    
    try:
        payment_date = (
            datetime.fromisoformat(request.payment_date) if request.payment_date
            else datetime.now(timezone.utc)
        )
        
        payment, allocation = await service.mark_invoice_paid(
            invoice_id=invoice_id,
            payment_date=payment_date,
            payment_method=request.payment_method,
            reference=request.reference,
            notes=request.notes,
        )
        
        await db.commit()
        
        # Reload with allocations
        result = await db.execute(
            select(ZZPPayment)
            .options(selectinload(ZZPPayment.allocations))
            .where(ZZPPayment.id == payment.id)
        )
        payment = result.scalar_one()
        
        return payment_to_response(payment)
        
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_REQUEST", "message": str(e)}
        )


@router.post("/invoices/{invoice_id}/mark-unpaid", status_code=204)
async def mark_invoice_unpaid(
    invoice_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Mark an invoice as unpaid by removing all payment allocations.
    """
    require_zzp(current_user)
    
    administration_id = await get_user_administration_id(current_user.id, db)
    
    service = PaymentService(db, administration_id)
    
    await service.mark_invoice_unpaid(invoice_id)
    await db.commit()
    
    return None


@router.post("/invoices/{invoice_id}/partial-payment", response_model=PaymentResponse)
async def record_partial_payment(
    invoice_id: UUID,
    request: PartialPaymentRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Record a partial payment on an invoice.
    """
    require_zzp(current_user)
    
    administration_id = await get_user_administration_id(current_user.id, db)
    
    service = PaymentService(db, administration_id)
    
    try:
        payment_date = (
            datetime.fromisoformat(request.payment_date) if request.payment_date
            else datetime.now(timezone.utc)
        )
        
        payment, allocation = await service.record_partial_payment(
            invoice_id=invoice_id,
            amount_cents=request.amount_cents,
            payment_date=payment_date,
            payment_method=request.payment_method,
            reference=request.reference,
            notes=request.notes,
        )
        
        await db.commit()
        
        # Reload with allocations
        result = await db.execute(
            select(ZZPPayment)
            .options(selectinload(ZZPPayment.allocations))
            .where(ZZPPayment.id == payment.id)
        )
        payment = result.scalar_one()
        
        return payment_to_response(payment)
        
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_REQUEST", "message": str(e)}
        )


@router.get("/invoices/{invoice_id}/payments", response_model=InvoicePaymentSummary)
async def get_invoice_payment_summary(
    invoice_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get payment summary for a specific invoice.
    """
    require_zzp(current_user)
    
    administration_id = await get_user_administration_id(current_user.id, db)
    
    service = PaymentService(db, administration_id)
    
    try:
        summary = await service.get_invoice_payment_summary(invoice_id)
        
        return InvoicePaymentSummary(
            invoice_id=summary["invoice_id"],
            invoice_number=summary["invoice_number"],
            invoice_total_cents=summary["invoice_total_cents"],
            total_paid_cents=summary["total_paid_cents"],
            total_outstanding_cents=summary["total_outstanding_cents"],
            is_fully_paid=summary["is_fully_paid"],
            payments=[payment_to_response(p) for p in summary["payments"]],
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail={"code": "INVOICE_NOT_FOUND", "message": str(e)}
        )
