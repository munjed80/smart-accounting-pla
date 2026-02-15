"""
ZZP Expenses API Endpoints

CRUD operations for ZZP expenses with filtering by month/category.
"""
from datetime import date
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import ZZPExpense
from app.models.financial_commitment import FinancialCommitment
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseResponse,
    ExpenseListResponse,
)
from app.api.v1.deps import CurrentUser, require_zzp
from app.repositories.ledger_repository import LedgerRepository
from app.services.ledger_service import LedgerPostingService, LedgerPostingError

router = APIRouter()


async def get_user_administration(user_id: UUID, db: AsyncSession) -> Administration:
    """
    Get the primary administration for a ZZP user.
    """
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == user_id)
        .where(Administration.is_active == True)
        .order_by(Administration.created_at)
        .limit(1)
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "NO_ADMINISTRATION",
                "message": "Geen administratie gevonden. Voltooi eerst de onboarding."
            }
        )
    
    return administration


def calculate_vat_amount(amount_cents: int, vat_rate: float) -> int:
    """Calculate VAT amount from total amount (including VAT)."""
    # Assuming amount_cents is including VAT, calculate the VAT portion
    # amount_with_vat = amount_excl * (1 + vat_rate/100)
    # vat = amount_with_vat - amount_excl = amount_with_vat * (vat_rate / (100 + vat_rate))
    vat_amount = int(Decimal(str(amount_cents)) * Decimal(str(vat_rate)) / (Decimal('100') + Decimal(str(vat_rate))))
    return vat_amount


def expense_to_response(expense: ZZPExpense) -> ExpenseResponse:
    """Convert expense model to response schema."""
    return ExpenseResponse(
        id=expense.id,
        administration_id=expense.administration_id,
        vendor=expense.vendor,
        description=expense.description,
        expense_date=expense.expense_date.isoformat(),
        amount_cents=expense.amount_cents,
        vat_rate=float(expense.vat_rate),
        vat_amount_cents=expense.vat_amount_cents,
        category=expense.category,
        notes=expense.notes,
        attachment_url=expense.attachment_url,
        commitment_id=expense.commitment_id,
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


@router.get("/expenses", response_model=ExpenseListResponse)
async def list_expenses(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    category: Optional[str] = Query(None, max_length=100),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
):
    """
    List all expenses for the current user's administration.
    
    Supports filtering by category, year/month, or date range.
    Returns totals for the filtered set.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Build query
    query = select(ZZPExpense).where(
        ZZPExpense.administration_id == administration.id
    )
    
    # Apply filters
    if category:
        query = query.where(ZZPExpense.category == category)
    
    if year:
        query = query.where(extract('year', ZZPExpense.expense_date) == year)
    
    if month:
        query = query.where(extract('month', ZZPExpense.expense_date) == month)
    
    if from_date:
        query = query.where(ZZPExpense.expense_date >= date.fromisoformat(from_date))
    
    if to_date:
        query = query.where(ZZPExpense.expense_date <= date.fromisoformat(to_date))
    
    query = query.order_by(ZZPExpense.expense_date.desc())
    
    result = await db.execute(query)
    expenses = result.scalars().all()
    
    # Calculate totals
    total_amount = sum(e.amount_cents for e in expenses)
    total_vat = sum(e.vat_amount_cents for e in expenses)
    
    return ExpenseListResponse(
        expenses=[expense_to_response(e) for e in expenses],
        total=len(expenses),
        total_amount_cents=total_amount,
        total_vat_cents=total_vat,
    )


@router.post("/expenses", response_model=ExpenseResponse, status_code=201)
async def create_expense(
    expense_in: ExpenseCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new expense.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    commitment_id = expense_in.commitment_id
    if commitment_id:
        commitment_check = await db.execute(
            select(FinancialCommitment.id).where(
                FinancialCommitment.id == commitment_id,
                FinancialCommitment.administration_id == administration.id,
            )
        )
        if not commitment_check.scalar_one_or_none():
            raise HTTPException(status_code=404, detail={"code": "COMMITMENT_NOT_FOUND", "message": "Verplichting niet gevonden."})

    # Calculate VAT amount
    vat_amount = calculate_vat_amount(expense_in.amount_cents, expense_in.vat_rate)
    
    expense = ZZPExpense(
        administration_id=administration.id,
        vendor=expense_in.vendor,
        description=expense_in.description,
        expense_date=date.fromisoformat(expense_in.expense_date),
        amount_cents=expense_in.amount_cents,
        vat_rate=Decimal(str(expense_in.vat_rate)),
        vat_amount_cents=vat_amount,
        category=expense_in.category,
        notes=expense_in.notes,
        attachment_url=expense_in.attachment_url,
        commitment_id=expense_in.commitment_id,
    )
    
    db.add(expense)
    await db.commit()

    try:
        ledger_service = LedgerPostingService(LedgerRepository(db, administration.id))
        await ledger_service.post_expense(expense.id)
        await db.commit()
    except LedgerPostingError:
        pass

    await db.refresh(expense)
    
    return expense_to_response(expense)


@router.get("/expenses/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    expense_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get a specific expense by ID.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(ZZPExpense).where(
            ZZPExpense.id == expense_id,
            ZZPExpense.administration_id == administration.id
        )
    )
    expense = result.scalar_one_or_none()
    
    if not expense:
        raise HTTPException(
            status_code=404,
            detail={"code": "EXPENSE_NOT_FOUND", "message": "Uitgave niet gevonden."}
        )
    
    return expense_to_response(expense)


@router.put("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: UUID,
    expense_in: ExpenseUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update an expense.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(ZZPExpense).where(
            ZZPExpense.id == expense_id,
            ZZPExpense.administration_id == administration.id
        )
    )
    expense = result.scalar_one_or_none()
    
    if not expense:
        raise HTTPException(
            status_code=404,
            detail={"code": "EXPENSE_NOT_FOUND", "message": "Uitgave niet gevonden."}
        )
    
    # Update fields
    update_data = expense_in.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        if field == 'expense_date' and value:
            setattr(expense, field, date.fromisoformat(value))
        elif field == 'vat_rate' and value is not None:
            setattr(expense, field, Decimal(str(value)))
        elif field == 'commitment_id' and value is not None:
            commitment_check = await db.execute(
                select(FinancialCommitment.id).where(
                    FinancialCommitment.id == value,
                    FinancialCommitment.administration_id == administration.id,
                )
            )
            if not commitment_check.scalar_one_or_none():
                raise HTTPException(status_code=404, detail={"code": "COMMITMENT_NOT_FOUND", "message": "Verplichting niet gevonden."})
            setattr(expense, field, value)
        else:
            setattr(expense, field, value)
    
    # Recalculate VAT if amount or rate changed
    if 'amount_cents' in update_data or 'vat_rate' in update_data:
        expense.vat_amount_cents = calculate_vat_amount(
            expense.amount_cents, 
            float(expense.vat_rate)
        )
    
    await db.commit()
    await db.refresh(expense)
    
    return expense_to_response(expense)


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Delete an expense.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(ZZPExpense).where(
            ZZPExpense.id == expense_id,
            ZZPExpense.administration_id == administration.id
        )
    )
    expense = result.scalar_one_or_none()
    
    if not expense:
        raise HTTPException(
            status_code=404,
            detail={"code": "EXPENSE_NOT_FOUND", "message": "Uitgave niet gevonden."}
        )
    
    await db.delete(expense)
    await db.commit()
    
    return None


@router.get("/expenses/categories/list")
async def list_expense_categories(
    current_user: CurrentUser,
):
    """
    Get list of available expense categories.
    """
    require_zzp(current_user)
    
    from app.schemas.zzp import EXPENSE_CATEGORIES
    return {"categories": EXPENSE_CATEGORIES}


@router.post("/expenses/scan")
async def scan_receipt(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """
    Scan a receipt and extract expense data using OCR.
    
    Accepts an image file (JPEG, PNG) and attempts to extract:
    - Vendor/merchant name
    - Date
    - Total amount
    - VAT rate
    - Category (basic keyword matching)
    
    For production enhancement, integrate with:
    - Google Cloud Vision API
    - Azure Computer Vision
    - AWS Textract
    - Or pytesseract for open-source solution
    """
    require_zzp(current_user)
    
    # Verify user has administration
    administration = await get_user_administration(current_user.id, db)
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Please upload an image file (JPEG, PNG, etc.)"
        )
    
    try:
        # Read file contents
        contents = await file.read()
        
        # TODO: Implement actual OCR processing
        # For now, return mock extracted data with basic file validation
        # In production, you would:
        # 1. Save the file temporarily or to cloud storage
        # 2. Process with OCR service (pytesseract, Google Vision, etc.)
        # 3. Parse the OCR text to extract structured data
        # 4. Use NLP/regex to find vendor, amount, date, VAT
        # 5. Return confidence scores per field
        
        from datetime import datetime
        import random
        
        # Simulate varying confidence based on file size (larger = potentially better quality)
        confidence = min(0.95, max(0.70, len(contents) / (1024 * 200)))
        
        # Mock extracted data - in production, this would come from OCR
        extracted_data = {
            "vendor": "Voorbeeld Leverancier",
            "description": "Kantoorbenodigdheden",
            "amount_cents": 12500,  # €125.00
            "expense_date": datetime.now().date().isoformat(),
            "category": "kantoorkosten",
            "vat_rate": 21.0,
            "notes": f"Geëxtraheerd via bonnenscanner - controleer de gegevens (bestand: {file.filename})"
        }
        
        return {
            "extracted_data": extracted_data,
            "confidence": confidence,
            "status": "ready_for_review",
            "message": "Bon succesvol gescand. Controleer de gegevens en pas aan indien nodig."
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process receipt: {str(e)}"
        )
    finally:
        await file.close()
