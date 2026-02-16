"""
ZZP Work Sessions API Endpoints (Clock-in/out functionality)

Provides start/stop work session endpoints for daily clock-in workflow.
On stop, automatically creates a time entry with calculated duration.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import WorkSession, ZZPTimeEntry
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    WorkSessionStart,
    WorkSessionStop,
    WorkSessionResponse,
    WorkSessionStopResponse,
    TimeEntryResponse,
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


def round_to_5_minutes(hours: float) -> float:
    """
    Round hours to nearest 5 minutes (0.0833... hours).
    
    Examples:
    - 1.02 hours (61.2 min) -> 1.0 hours (60 min)
    - 1.05 hours (63 min) -> 1.08 hours (65 min, since 1.0833... rounds to 1.08)
    - 2.75 hours (165 min) -> 2.75 hours (already aligned to 5 min)
    """
    # Convert to minutes
    minutes = hours * 60
    # Round to nearest 5 minutes
    rounded_minutes = round(minutes / 5) * 5
    # Convert back to hours with 2 decimal precision
    return round(rounded_minutes / 60, 2)


def session_to_response(session: WorkSession) -> WorkSessionResponse:
    """Convert work session model to response schema."""
    # Calculate duration in seconds if session is active
    duration_seconds = None
    if session.started_at:
        # Ensure started_at is timezone-aware for comparison
        started_at = session.started_at
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        
        # Get end time (either session end or current time)
        if session.ended_at:
            end_time = session.ended_at
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=timezone.utc)
        else:
            end_time = datetime.now(timezone.utc)
        
        duration = end_time - started_at
        duration_seconds = int(duration.total_seconds())
    
    return WorkSessionResponse(
        id=session.id,
        user_id=session.user_id,
        administration_id=session.administration_id,
        started_at=session.started_at,
        ended_at=session.ended_at,
        break_minutes=session.break_minutes,
        note=session.note,
        time_entry_id=session.time_entry_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
        duration_seconds=duration_seconds,
    )


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


@router.get("/work-sessions/active", response_model=Optional[WorkSessionResponse])
async def get_active_session(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the currently active work session for the user.
    
    Returns null if no active session exists.
    Used by frontend to restore timer state on page load/refresh.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Find active session (ended_at IS NULL)
    result = await db.execute(
        select(WorkSession).where(
            and_(
                WorkSession.user_id == current_user.id,
                WorkSession.administration_id == administration.id,
                WorkSession.ended_at.is_(None)
            )
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        return None
    
    return session_to_response(session)


@router.post("/work-sessions/start", response_model=WorkSessionResponse, status_code=201)
async def start_work_session(
    session_in: WorkSessionStart,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Start a new work session (clock-in).
    
    Creates a new work session with started_at = now.
    Only ONE active session per user per administration is allowed.
    
    Errors:
    - 409 Conflict: Active session already exists
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Check for existing active session
    result = await db.execute(
        select(WorkSession).where(
            and_(
                WorkSession.user_id == current_user.id,
                WorkSession.administration_id == administration.id,
                WorkSession.ended_at.is_(None)
            )
        )
    )
    existing_session = result.scalar_one_or_none()
    
    if existing_session:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ACTIVE_SESSION_EXISTS",
                "message": "Er is al een actieve werksessie. Klok eerst uit voordat je opnieuw inklopt."
            }
        )
    
    # Create new session
    session = WorkSession(
        user_id=current_user.id,
        administration_id=administration.id,
        started_at=datetime.now(timezone.utc),
        note=session_in.note,
    )
    
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    return session_to_response(session)


@router.post("/work-sessions/stop", response_model=WorkSessionStopResponse)
async def stop_work_session(
    session_in: WorkSessionStop,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Stop the active work session (clock-out).
    
    Ends the current session and creates a ZZPTimeEntry with:
    - Duration: (ended_at - started_at) - break_minutes, rounded to 5 minutes
    - Entry date: Date when session started
    - Description: Note from session or default "Gewerkte tijd"
    
    Errors:
    - 404 Not Found: No active session to stop
    - 400 Bad Request: Break time exceeds work duration
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Find active session
    result = await db.execute(
        select(WorkSession).where(
            and_(
                WorkSession.user_id == current_user.id,
                WorkSession.administration_id == administration.id,
                WorkSession.ended_at.is_(None)
            )
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "NO_ACTIVE_SESSION",
                "message": "Geen actieve sessie gevonden. Je moet eerst inklokken."
            }
        )
    
    # End the session
    ended_at = datetime.now(timezone.utc)
    
    # Ensure started_at is timezone-aware for comparison
    started_at = session.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    
    # Validate: ended_at must be after started_at
    if ended_at <= started_at:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_END_TIME",
                "message": "Eindtijd moet na starttijd liggen."
            }
        )
    
    # Calculate duration in minutes
    duration = ended_at - started_at
    total_minutes = duration.total_seconds() / 60
    
    # Subtract break time
    break_minutes = session_in.break_minutes
    work_minutes = total_minutes - break_minutes
    
    # Validate: break time cannot exceed total duration
    if work_minutes <= 0:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "BREAK_EXCEEDS_DURATION",
                "message": f"Pauzetijd ({break_minutes} min) overschrijdt de totale werkduur ({int(total_minutes)} min)."
            }
        )
    
    # Convert to hours and round to 5 minutes
    work_hours = work_minutes / 60
    rounded_hours = round_to_5_minutes(work_hours)
    
    # Ensure minimum of 5 minutes (0.08 hours) if there was any work
    if rounded_hours < 0.08 and work_hours > 0:
        rounded_hours = 0.08
    
    # Update session note if provided in stop request
    note = session_in.note if session_in.note else session.note
    
    # Create time entry
    entry_description = note if note else "Gewerkte tijd"
    
    time_entry = ZZPTimeEntry(
        user_id=current_user.id,
        administration_id=administration.id,
        entry_date=session.started_at.date(),
        description=entry_description,
        hours=Decimal(str(rounded_hours)),
        billable=True,
    )
    
    db.add(time_entry)
    await db.flush()  # Get the time_entry.id
    
    # Update session
    session.ended_at = ended_at
    session.break_minutes = break_minutes
    session.note = note
    session.time_entry_id = time_entry.id
    
    await db.commit()
    await db.refresh(session)
    await db.refresh(time_entry)
    
    return WorkSessionStopResponse(
        session=session_to_response(session),
        time_entry=entry_to_response(time_entry),
        hours_added=rounded_hours,
        message=f"Werk gestopt — {rounded_hours} uur toegevoegd"
    )
