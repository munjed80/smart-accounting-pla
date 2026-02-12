"""
ZZP Time Tracking API Endpoints

CRUD operations for ZZP time entries with weekly view support and invoice generation.
"""
from datetime import date, timedelta, datetime
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, extract, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import (
    ZZPTimeEntry, 
    ZZPCustomer, 
    ZZPInvoice, 
    ZZPInvoiceLine,
    ZZPInvoiceCounter,
    BusinessProfile,
)
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    TimeEntryCreate,
    TimeEntryUpdate,
    TimeEntryResponse,
    TimeEntryListResponse,
    WeeklyTimeSummary,
    CreateInvoiceFromTimeEntriesRequest,
    InvoiceResponse,
)
from app.api.v1.deps import CurrentUser, require_zzp

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


def entry_to_response(entry: ZZPTimeEntry) -> TimeEntryResponse:
    """Convert time entry model to response schema."""
    return TimeEntryResponse(
        id=entry.id,
        administration_id=entry.administration_id,
        entry_date=entry.entry_date.isoformat(),
        description=entry.description,
        hours=float(entry.hours),
        project_name=entry.project_name,
        customer_id=entry.customer_id,
        hourly_rate_cents=entry.hourly_rate_cents,
        billable=entry.billable,
        invoice_id=entry.invoice_id,
        is_invoiced=entry.is_invoiced,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def get_week_bounds(target_date: date) -> tuple[date, date]:
    """Get Monday and Sunday of the week containing the target date."""
    # Monday is 0, Sunday is 6
    monday = target_date - timedelta(days=target_date.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


@router.get("/time-entries", response_model=TimeEntryListResponse)
async def list_time_entries(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    project_name: Optional[str] = Query(None, max_length=255),
    customer_id: Optional[UUID] = Query(None),
    billable: Optional[bool] = Query(None),
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
):
    """
    List all time entries for the current user's administration.
    
    Supports filtering by project, customer, billable status, and date range.
    Returns totals for the filtered set.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Build query
    query = select(ZZPTimeEntry).where(
        ZZPTimeEntry.administration_id == administration.id
    )
    
    # Apply filters
    if project_name:
        query = query.where(ZZPTimeEntry.project_name == project_name)
    
    if customer_id:
        query = query.where(ZZPTimeEntry.customer_id == customer_id)
    
    if billable is not None:
        query = query.where(ZZPTimeEntry.billable == billable)
    
    if from_date:
        query = query.where(ZZPTimeEntry.entry_date >= date.fromisoformat(from_date))
    
    if to_date:
        query = query.where(ZZPTimeEntry.entry_date <= date.fromisoformat(to_date))
    
    query = query.order_by(ZZPTimeEntry.entry_date.desc())
    
    result = await db.execute(query)
    entries = result.scalars().all()
    
    # Calculate totals
    total_hours = sum(float(e.hours) for e in entries)
    billable_hours = sum(float(e.hours) for e in entries if e.billable)
    
    return TimeEntryListResponse(
        entries=[entry_to_response(e) for e in entries],
        total=len(entries),
        total_hours=total_hours,
        total_billable_hours=billable_hours,
    )


@router.get("/time-entries/weekly", response_model=WeeklyTimeSummary)
async def get_weekly_summary(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    week_of: Optional[str] = Query(None, description="Any date in the week (YYYY-MM-DD), defaults to current week"),
):
    """
    Get weekly time summary for a specific week.
    
    Returns total hours, billable hours, and hours by day.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Determine week bounds
    target_date = date.fromisoformat(week_of) if week_of else date.today()
    week_start, week_end = get_week_bounds(target_date)
    
    # Query entries for the week
    result = await db.execute(
        select(ZZPTimeEntry).where(
            ZZPTimeEntry.administration_id == administration.id,
            ZZPTimeEntry.entry_date >= week_start,
            ZZPTimeEntry.entry_date <= week_end,
        ).order_by(ZZPTimeEntry.entry_date)
    )
    entries = result.scalars().all()
    
    # Calculate totals and group by day
    total_hours = 0.0
    billable_hours = 0.0
    entries_by_day = {}
    
    # Initialize all days of the week
    current = week_start
    while current <= week_end:
        entries_by_day[current.isoformat()] = 0.0
        current += timedelta(days=1)
    
    for entry in entries:
        hours = float(entry.hours)
        total_hours += hours
        if entry.billable:
            billable_hours += hours
        entries_by_day[entry.entry_date.isoformat()] = (
            entries_by_day.get(entry.entry_date.isoformat(), 0.0) + hours
        )
    
    return WeeklyTimeSummary(
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        total_hours=total_hours,
        billable_hours=billable_hours,
        entries_by_day=entries_by_day,
    )


@router.post("/time-entries", response_model=TimeEntryResponse, status_code=201)
async def create_time_entry(
    entry_in: TimeEntryCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new time entry.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Validate customer if provided
    if entry_in.customer_id:
        customer_result = await db.execute(
            select(ZZPCustomer).where(
                ZZPCustomer.id == entry_in.customer_id,
                ZZPCustomer.administration_id == administration.id
            )
        )
        customer = customer_result.scalar_one_or_none()
        if not customer:
            raise HTTPException(
                status_code=404,
                detail={"code": "CUSTOMER_NOT_FOUND", "message": "Klant niet gevonden."}
            )
    
    entry = ZZPTimeEntry(
        administration_id=administration.id,
        entry_date=date.fromisoformat(entry_in.entry_date),
        description=entry_in.description,
        hours=Decimal(str(entry_in.hours)),
        project_name=entry_in.project_name,
        customer_id=entry_in.customer_id,
        hourly_rate_cents=entry_in.hourly_rate_cents,
        billable=entry_in.billable,
    )
    
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    
    return entry_to_response(entry)


@router.get("/time-entries/{entry_id}", response_model=TimeEntryResponse)
async def get_time_entry(
    entry_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get a specific time entry by ID.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(ZZPTimeEntry).where(
            ZZPTimeEntry.id == entry_id,
            ZZPTimeEntry.administration_id == administration.id
        )
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={"code": "TIME_ENTRY_NOT_FOUND", "message": "Uren niet gevonden."}
        )
    
    return entry_to_response(entry)


@router.put("/time-entries/{entry_id}", response_model=TimeEntryResponse)
async def update_time_entry(
    entry_id: UUID,
    entry_in: TimeEntryUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update a time entry.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(ZZPTimeEntry).where(
            ZZPTimeEntry.id == entry_id,
            ZZPTimeEntry.administration_id == administration.id
        )
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={"code": "TIME_ENTRY_NOT_FOUND", "message": "Uren niet gevonden."}
        )
    
    # Validate customer if being changed
    if entry_in.customer_id:
        customer_result = await db.execute(
            select(ZZPCustomer).where(
                ZZPCustomer.id == entry_in.customer_id,
                ZZPCustomer.administration_id == administration.id
            )
        )
        customer = customer_result.scalar_one_or_none()
        if not customer:
            raise HTTPException(
                status_code=404,
                detail={"code": "CUSTOMER_NOT_FOUND", "message": "Klant niet gevonden."}
            )
    
    # Update fields
    update_data = entry_in.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        if field == 'entry_date' and value:
            setattr(entry, field, date.fromisoformat(value))
        elif field == 'hours' and value is not None:
            setattr(entry, field, Decimal(str(value)))
        else:
            setattr(entry, field, value)
    
    await db.commit()
    await db.refresh(entry)
    
    return entry_to_response(entry)


@router.delete("/time-entries/{entry_id}", status_code=204)
async def delete_time_entry(
    entry_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Delete a time entry.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(ZZPTimeEntry).where(
            ZZPTimeEntry.id == entry_id,
            ZZPTimeEntry.administration_id == administration.id
        )
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={"code": "TIME_ENTRY_NOT_FOUND", "message": "Uren niet gevonden."}
        )
    
    await db.delete(entry)
    await db.commit()
    
    return None


async def generate_invoice_number(admin_id: UUID, db: AsyncSession) -> str:
    """
    Generate a sequential invoice number for an administration.
    
    Uses SELECT FOR UPDATE to prevent race conditions.
    Format: INV-YYYY-0001
    """
    current_year = datetime.now().year
    
    # Try to get or create counter with lock
    result = await db.execute(
        select(ZZPInvoiceCounter)
        .where(ZZPInvoiceCounter.administration_id == admin_id)
        .with_for_update()
    )
    counter = result.scalar_one_or_none()
    
    if counter:
        # Reset counter if year changed
        if counter.year != current_year:
            counter.year = current_year
            counter.counter = 1
        else:
            counter.counter += 1
    else:
        # Create new counter
        counter = ZZPInvoiceCounter(
            administration_id=admin_id,
            year=current_year,
            counter=1
        )
        db.add(counter)
    
    await db.flush()
    
    # Format: INV-2024-0001
    return f"INV-{current_year}-{counter.counter:04d}"


@router.post("/time-entries/create-invoice", response_model=InvoiceResponse)
async def create_invoice_from_time_entries(
    request: CreateInvoiceFromTimeEntriesRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create an invoice from unbilled time entries.
    
    This endpoint:
    1. Fetches all unbilled time entries for the specified customer and period
    2. Creates an invoice with a single line item summarizing the time
    3. Links the time entries to the invoice
    4. Marks the time entries as invoiced
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Parse dates
    period_start_date = date.fromisoformat(request.period_start)
    period_end_date = date.fromisoformat(request.period_end)
    issue_date = date.fromisoformat(request.issue_date)
    due_date = date.fromisoformat(request.due_date) if request.due_date else None
    
    # Validate customer exists
    customer_result = await db.execute(
        select(ZZPCustomer).where(
            ZZPCustomer.id == request.customer_id,
            ZZPCustomer.administration_id == administration.id
        )
    )
    customer = customer_result.scalar_one_or_none()
    
    if not customer:
        raise HTTPException(
            status_code=404,
            detail={"code": "CUSTOMER_NOT_FOUND", "message": "Klant niet gevonden."}
        )
    
    # Fetch unbilled time entries for this customer and period
    entries_result = await db.execute(
        select(ZZPTimeEntry).where(
            and_(
                ZZPTimeEntry.administration_id == administration.id,
                ZZPTimeEntry.customer_id == request.customer_id,
                ZZPTimeEntry.invoice_id.is_(None),
                ZZPTimeEntry.entry_date >= period_start_date,
                ZZPTimeEntry.entry_date <= period_end_date
            )
        )
    )
    time_entries = entries_result.scalars().all()
    
    if not time_entries:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "NO_UNBILLED_TIME_ENTRIES",
                "message": "Geen ongefactureerde uren gevonden voor deze periode en klant."
            }
        )
    
    # Calculate total hours
    total_hours = sum(float(entry.hours) for entry in time_entries)
    
    # Get business profile for seller info
    profile_result = await db.execute(
        select(BusinessProfile).where(
            BusinessProfile.administration_id == administration.id
        )
    )
    profile = profile_result.scalar_one_or_none()
    
    # Generate invoice number
    invoice_number = await generate_invoice_number(administration.id, db)
    
    # Calculate week number from period start
    week_number = period_start_date.isocalendar()[1]
    
    # Create invoice line description
    line_description = f"Week {week_number} ({period_start_date.strftime('%d-%m-%Y')} - {period_end_date.strftime('%d-%m-%Y')}) – {total_hours:.2f}h × €{request.hourly_rate_cents / 100:.2f}"
    
    # Calculate amounts (assuming 21% VAT)
    vat_rate = Decimal("21")
    line_total_cents = int(Decimal(total_hours) * Decimal(request.hourly_rate_cents))
    vat_amount_cents = int(line_total_cents * vat_rate / 100)
    
    # Create invoice
    invoice = ZZPInvoice(
        administration_id=administration.id,
        customer_id=customer.id,
        invoice_number=invoice_number,
        status="draft",
        issue_date=issue_date,
        due_date=due_date,
        # Seller snapshot
        seller_company_name=profile.company_name if profile else None,
        seller_trading_name=profile.trading_name if profile else None,
        seller_address_street=profile.address_street if profile else None,
        seller_address_postal_code=profile.address_postal_code if profile else None,
        seller_address_city=profile.address_city if profile else None,
        seller_address_country=profile.address_country if profile else None,
        seller_kvk_number=profile.kvk_number if profile else None,
        seller_btw_number=profile.btw_number if profile else None,
        seller_iban=profile.iban if profile else None,
        seller_email=profile.email if profile else None,
        seller_phone=profile.phone if profile else None,
        # Customer snapshot
        customer_name=customer.name,
        customer_address_street=customer.address_street,
        customer_address_postal_code=customer.address_postal_code,
        customer_address_city=customer.address_city,
        customer_address_country=customer.address_country,
        customer_kvk_number=customer.kvk_number,
        customer_btw_number=customer.btw_number,
        # Totals
        subtotal_cents=line_total_cents,
        vat_total_cents=vat_amount_cents,
        total_cents=line_total_cents + vat_amount_cents,
        notes=request.notes,
    )
    
    db.add(invoice)
    await db.flush()
    
    # Create invoice line
    invoice_line = ZZPInvoiceLine(
        invoice_id=invoice.id,
        line_number=1,
        description=line_description,
        quantity=Decimal(total_hours),
        unit_price_cents=request.hourly_rate_cents,
        vat_rate=vat_rate,
        line_total_cents=line_total_cents,
        vat_amount_cents=vat_amount_cents,
    )
    
    db.add(invoice_line)
    
    # Update time entries
    for entry in time_entries:
        entry.invoice_id = invoice.id
        entry.is_invoiced = True
    
    await db.commit()
    await db.refresh(invoice)
    
    # Build response
    return InvoiceResponse(
        id=invoice.id,
        administration_id=invoice.administration_id,
        customer_id=invoice.customer_id,
        invoice_number=invoice.invoice_number,
        status=invoice.status,
        issue_date=invoice.issue_date.isoformat(),
        due_date=invoice.due_date.isoformat() if invoice.due_date else None,
        seller_company_name=invoice.seller_company_name,
        seller_trading_name=invoice.seller_trading_name,
        seller_address_street=invoice.seller_address_street,
        seller_address_postal_code=invoice.seller_address_postal_code,
        seller_address_city=invoice.seller_address_city,
        seller_address_country=invoice.seller_address_country,
        seller_kvk_number=invoice.seller_kvk_number,
        seller_btw_number=invoice.seller_btw_number,
        seller_iban=invoice.seller_iban,
        seller_email=invoice.seller_email,
        seller_phone=invoice.seller_phone,
        customer_name=invoice.customer_name,
        customer_address_street=invoice.customer_address_street,
        customer_address_postal_code=invoice.customer_address_postal_code,
        customer_address_city=invoice.customer_address_city,
        customer_address_country=invoice.customer_address_country,
        customer_kvk_number=invoice.customer_kvk_number,
        customer_btw_number=invoice.customer_btw_number,
        subtotal_cents=invoice.subtotal_cents,
        vat_total_cents=invoice.vat_total_cents,
        total_cents=invoice.total_cents,
        notes=invoice.notes,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        paid_at=invoice.paid_at,
    )
