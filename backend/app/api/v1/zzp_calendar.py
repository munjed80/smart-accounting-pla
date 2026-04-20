"""
ZZP Calendar Events API Endpoints

CRUD operations for ZZP calendar events with month view support.
Supports recurring events (daily/weekly/monthly) with expansion.
"""
import logging
import calendar as cal_module
from datetime import datetime, date, timedelta
from typing import Annotated, Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, extract, and_, or_
from sqlalchemy.exc import SQLAlchemyError
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

logger = logging.getLogger(__name__)

VALID_RECURRENCE_VALUES = {None, "none", "daily", "weekly", "monthly"}
VALID_COLOR_VALUES = {None, "blue", "green", "red", "orange", "purple", "pink"}

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
    rec_end = None
    if event.recurrence_end_date:
        rec_end = event.recurrence_end_date.isoformat()
    return CalendarEventResponse(
        id=event.id,
        administration_id=event.administration_id,
        title=event.title,
        start_datetime=event.start_datetime.isoformat(),
        end_datetime=event.end_datetime.isoformat(),
        location=event.location,
        notes=event.notes,
        recurrence=event.recurrence,
        recurrence_end_date=rec_end,
        color=event.color,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


def parse_datetime(dt_str: str) -> datetime:
    """Parse ISO 8601 datetime string."""
    return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))


def expand_recurring_event(
    event: ZZPCalendarEvent,
    from_dt: datetime,
    to_dt: datetime,
) -> List[CalendarEventResponse]:
    """
    Expand a recurring event into individual occurrences within [from_dt, to_dt].
    The original occurrence is always included if it falls within the range.
    """
    recurrence = event.recurrence
    if not recurrence or recurrence == 'none':
        # Non-recurring — include if it falls within the range
        if event.start_datetime <= to_dt and event.end_datetime >= from_dt:
            return [event_to_response(event)]
        return []

    # Determine recurrence end boundary
    rec_end_date = event.recurrence_end_date
    rec_end_dt = datetime(rec_end_date.year, rec_end_date.month, rec_end_date.day, 23, 59, 59) if rec_end_date else None

    duration = event.end_datetime - event.start_datetime
    occurrences: List[CalendarEventResponse] = []

    current_start = event.start_datetime
    # Advance to the first occurrence that could be >= from_dt
    if recurrence == 'daily':
        step = timedelta(days=1)
    elif recurrence == 'weekly':
        step = timedelta(weeks=1)
    elif recurrence == 'monthly':
        step = None  # handled specially
    else:
        # Unknown recurrence — treat as non-recurring
        if event.start_datetime <= to_dt:
            return [event_to_response(event)]
        return []

    iteration = 0
    # Safety limit: prevents infinite loops; allows ~2.7 years of daily events
    max_iterations = 1000

    while iteration < max_iterations:
        current_end = current_start + duration

        # Stop if we've passed the recurrence end date
        if rec_end_dt and current_start > rec_end_dt:
            break

        # Stop if we've passed the query range
        if current_start > to_dt:
            break

        # Include if within range
        if current_end >= from_dt:
            # Build a synthetic response reusing the event's ID and metadata
            rec_end_str = rec_end_date.isoformat() if rec_end_date else None
            occurrences.append(CalendarEventResponse(
                id=event.id,
                administration_id=event.administration_id,
                title=event.title,
                start_datetime=current_start.isoformat(),
                end_datetime=current_end.isoformat(),
                location=event.location,
                notes=event.notes,
                recurrence=event.recurrence,
                recurrence_end_date=rec_end_str,
                color=event.color,
                created_at=event.created_at,
                updated_at=event.updated_at,
            ))

        # Advance to next occurrence
        if recurrence == 'monthly':
            month = current_start.month + 1
            year = current_start.year
            if month > 12:
                month = 1
                year += 1
            # Clamp day to last day of the month
            last_day = cal_module.monthrange(year, month)[1]
            day = min(event.start_datetime.day, last_day)
            try:
                current_start = current_start.replace(year=year, month=month, day=day)
            except ValueError:
                break
        else:
            current_start = current_start + step

        iteration += 1

    return occurrences


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
    Recurring events are expanded into individual occurrences within the queried range.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Determine the query date range for expansion
    range_from: Optional[datetime] = None
    range_to: Optional[datetime] = None

    if from_date:
        range_from = datetime.fromisoformat(f"{from_date}T00:00:00")
    elif year and month:
        range_from = datetime(year, month, 1, 0, 0, 0)

    if to_date:
        range_to = datetime.fromisoformat(f"{to_date}T23:59:59")
    elif year and month:
        last_day = cal_module.monthrange(year, month)[1]
        range_to = datetime(year, month, last_day, 23, 59, 59)

    # Build query — for recurring events we need to fetch events that could
    # produce occurrences in the target range, so we relax the start_datetime
    # filter for recurring events.
    query = select(ZZPCalendarEvent).where(
        ZZPCalendarEvent.administration_id == administration.id
    )

    # For non-recurring events apply strict date filters.
    # For recurring events we can't filter by start_datetime alone, so we
    # fetch all recurring events and do expansion in Python.
    # We apply only an upper-bound on start_datetime for non-recurring events.
    if range_from is not None and range_to is not None:
        query = query.where(
            or_(
                # Non-recurring: start within range
                and_(
                    or_(
                        ZZPCalendarEvent.recurrence == None,
                        ZZPCalendarEvent.recurrence == 'none',
                    ),
                    ZZPCalendarEvent.start_datetime >= range_from,
                    ZZPCalendarEvent.start_datetime <= range_to,
                ),
                # Recurring: started on or before range_to (could have occurrences in range)
                and_(
                    ZZPCalendarEvent.recurrence != None,
                    ZZPCalendarEvent.recurrence != 'none',
                    ZZPCalendarEvent.start_datetime <= range_to,
                ),
            )
        )
    elif year:
        query = query.where(extract('year', ZZPCalendarEvent.start_datetime) == year)
        if month:
            query = query.where(extract('month', ZZPCalendarEvent.start_datetime) == month)
    
    query = query.order_by(ZZPCalendarEvent.start_datetime.asc())
    
    result = await db.execute(query)
    events = result.scalars().all()
    
    # Expand recurring events
    expanded: List[CalendarEventResponse] = []
    if range_from is not None and range_to is not None:
        for event in events:
            expanded.extend(expand_recurring_event(event, range_from, range_to))
    else:
        expanded = [event_to_response(e) for e in events]

    # Sort by start_datetime
    expanded.sort(key=lambda e: e.start_datetime)

    return CalendarEventListResponse(
        events=expanded,
        total=len(expanded),
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
    try:
        start_dt = parse_datetime(event_in.start_datetime)
        end_dt = parse_datetime(event_in.end_datetime)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_DATETIME_FORMAT", "message": "Ongeldige datum/tijd formaat. Gebruik ISO 8601 formaat."}
        )
    
    # Validate end is after start
    if end_dt <= start_dt:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_DATES", "message": "Eindtijd moet na begintijd liggen."}
        )
    
    # Validate recurrence value
    if event_in.recurrence is not None and event_in.recurrence not in VALID_RECURRENCE_VALUES:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_RECURRENCE", "message": f"Ongeldige herhaling: '{event_in.recurrence}'. Gebruik: daily, weekly, monthly of leeg."}
        )
    
    # Validate color value
    if event_in.color is not None and event_in.color not in VALID_COLOR_VALUES:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_COLOR", "message": f"Ongeldige kleur: '{event_in.color}'. Gebruik: blue, green, red, orange, purple, pink of leeg."}
        )
    
    # Parse recurrence end date
    recurrence_end = None
    if event_in.recurrence_end_date:
        try:
            recurrence_end = date.fromisoformat(event_in.recurrence_end_date)
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_RECURRENCE_DATE", "message": "Ongeldige einddatum herhaling. Gebruik YYYY-MM-DD formaat."}
            )
    
    try:
        event = ZZPCalendarEvent(
            administration_id=administration.id,
            title=event_in.title,
            start_datetime=start_dt,
            end_datetime=end_dt,
            location=event_in.location,
            notes=event_in.notes,
            recurrence=event_in.recurrence,
            recurrence_end_date=recurrence_end,
            color=event_in.color,
        )
        
        db.add(event)
        await db.commit()
        await db.refresh(event)
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error(f"Database error creating calendar event: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"code": "DB_ERROR", "message": "Kon de afspraak niet opslaan. Probeer het opnieuw."}
        )
    
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
    
    # Validate recurrence value if provided
    update_data = event_in.model_dump(exclude_unset=True)
    if 'recurrence' in update_data and update_data['recurrence'] is not None and update_data['recurrence'] not in VALID_RECURRENCE_VALUES:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_RECURRENCE", "message": f"Ongeldige herhaling: '{update_data['recurrence']}'. Gebruik: daily, weekly, monthly of leeg."}
        )
    
    # Validate color value if provided
    if 'color' in update_data and update_data['color'] is not None and update_data['color'] not in VALID_COLOR_VALUES:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_COLOR", "message": f"Ongeldige kleur: '{update_data['color']}'. Gebruik: blue, green, red, orange, purple, pink of leeg."}
        )
    
    try:
        for field, value in update_data.items():
            if field in ('start_datetime', 'end_datetime') and value:
                setattr(event, field, parse_datetime(value))
            elif field == 'recurrence_end_date' and value:
                setattr(event, field, date.fromisoformat(value))
            else:
                setattr(event, field, value)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_FIELD_VALUE", "message": "Ongeldige waarde in een van de velden. Controleer je invoer."}
        )
    
    # Validate end is after start
    if event.end_datetime <= event.start_datetime:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_DATES", "message": "Eindtijd moet na begintijd liggen."}
        )
    
    try:
        await db.commit()
        await db.refresh(event)
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error(f"Database error updating calendar event {event_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"code": "DB_ERROR", "message": "Kon de afspraak niet bijwerken. Probeer het opnieuw."}
        )
    
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
    
    try:
        await db.delete(event)
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error(f"Database error deleting calendar event {event_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"code": "DB_ERROR", "message": "Kon de afspraak niet verwijderen. Probeer het opnieuw."}
        )
    
    return None
