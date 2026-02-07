"""
ZZP Time Tracking API Endpoints

CRUD operations for ZZP time entries with weekly view support.
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import ZZPTimeEntry, ZZPCustomer
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    TimeEntryCreate,
    TimeEntryUpdate,
    TimeEntryResponse,
    TimeEntryListResponse,
    WeeklyTimeSummary,
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
