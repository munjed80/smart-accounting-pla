"""
ZZP Calendar Events API Endpoints

CRUD operations for ZZP calendar events with month view support.
"""
from datetime import datetime, date
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, extract, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import ZZPCalendarEvent
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    CalendarEventCreate,
    CalendarEventUpdate,
    CalendarEventResponse,
    CalendarEventListResponse,
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


def event_to_response(event: ZZPCalendarEvent) -> CalendarEventResponse:
    """Convert calendar event model to response schema."""
    return CalendarEventResponse(
        id=event.id,
        administration_id=event.administration_id,
        title=event.title,
        start_datetime=event.start_datetime.isoformat(),
        end_datetime=event.end_datetime.isoformat(),
        location=event.location,
        notes=event.notes,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


def parse_datetime(dt_str: str) -> datetime:
    """Parse ISO 8601 datetime string."""
    return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))


@router.get("/calendar-events", response_model=CalendarEventListResponse)
async def list_calendar_events(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
):
    """
    List all calendar events for the current user's administration.
    
    Supports filtering by year/month or date range.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Build query
    query = select(ZZPCalendarEvent).where(
        ZZPCalendarEvent.administration_id == administration.id
    )
    
    # Apply filters
    if year:
        query = query.where(extract('year', ZZPCalendarEvent.start_datetime) == year)
    
    if month:
        query = query.where(extract('month', ZZPCalendarEvent.start_datetime) == month)
    
    if from_date:
        from_dt = datetime.fromisoformat(f"{from_date}T00:00:00")
        query = query.where(ZZPCalendarEvent.start_datetime >= from_dt)
    
    if to_date:
        to_dt = datetime.fromisoformat(f"{to_date}T23:59:59")
        query = query.where(ZZPCalendarEvent.start_datetime <= to_dt)
    
    query = query.order_by(ZZPCalendarEvent.start_datetime.asc())
    
    result = await db.execute(query)
    events = result.scalars().all()
    
    return CalendarEventListResponse(
        events=[event_to_response(e) for e in events],
        total=len(events),
    )


@router.post("/calendar-events", response_model=CalendarEventResponse, status_code=201)
async def create_calendar_event(
    event_in: CalendarEventCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new calendar event.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Parse datetimes
    start_dt = parse_datetime(event_in.start_datetime)
    end_dt = parse_datetime(event_in.end_datetime)
    
    # Validate end is after start
    if end_dt <= start_dt:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_DATES", "message": "Eindtijd moet na begintijd liggen."}
        )
    
    event = ZZPCalendarEvent(
        administration_id=administration.id,
        title=event_in.title,
        start_datetime=start_dt,
        end_datetime=end_dt,
        location=event_in.location,
        notes=event_in.notes,
    )
    
    db.add(event)
    await db.commit()
    await db.refresh(event)
    
    return event_to_response(event)


@router.get("/calendar-events/{event_id}", response_model=CalendarEventResponse)
async def get_calendar_event(
    event_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get a specific calendar event by ID.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(ZZPCalendarEvent).where(
            ZZPCalendarEvent.id == event_id,
            ZZPCalendarEvent.administration_id == administration.id
        )
    )
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(
            status_code=404,
            detail={"code": "EVENT_NOT_FOUND", "message": "Afspraak niet gevonden."}
        )
    
    return event_to_response(event)


@router.put("/calendar-events/{event_id}", response_model=CalendarEventResponse)
async def update_calendar_event(
    event_id: UUID,
    event_in: CalendarEventUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update a calendar event.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(ZZPCalendarEvent).where(
            ZZPCalendarEvent.id == event_id,
            ZZPCalendarEvent.administration_id == administration.id
        )
    )
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(
            status_code=404,
            detail={"code": "EVENT_NOT_FOUND", "message": "Afspraak niet gevonden."}
        )
    
    # Update fields
    update_data = event_in.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        if field in ('start_datetime', 'end_datetime') and value:
            setattr(event, field, parse_datetime(value))
        else:
            setattr(event, field, value)
    
    # Validate end is after start
    if event.end_datetime <= event.start_datetime:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_DATES", "message": "Eindtijd moet na begintijd liggen."}
        )
    
    await db.commit()
    await db.refresh(event)
    
    return event_to_response(event)


@router.delete("/calendar-events/{event_id}", status_code=204)
async def delete_calendar_event(
    event_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Delete a calendar event.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(ZZPCalendarEvent).where(
            ZZPCalendarEvent.id == event_id,
            ZZPCalendarEvent.administration_id == administration.id
        )
    )
    event = result.scalar_one_or_none()
    
    if not event:
        raise HTTPException(
            status_code=404,
            detail={"code": "EVENT_NOT_FOUND", "message": "Afspraak niet gevonden."}
        )
    
    await db.delete(event)
    await db.commit()
    
    return None
