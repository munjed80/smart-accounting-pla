"""
Bookkeeping API Endpoints

Provides accountant endpoints for journal entry management:
- List journal entries
- Create manual journal entry
- Edit draft entries
- Post entries (with period lock enforcement)
- Delete draft entries
- Audit log access
"""
from datetime import datetime, timezone, date
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.ledger import (
    JournalEntry,
    JournalLine,
    AccountingPeriod,
    PeriodStatus,
    JournalEntryStatus as ModelJournalEntryStatus,
    BookkeepingAuditLog,
    BookkeepingAuditAction,
)
from app.models.accounting import ChartOfAccount, VatCode
from app.schemas.ledger import (
    JournalEntryCreate,
    JournalEntryUpdate,
    JournalEntryResponse,
    JournalEntryListItem,
    JournalEntryListResponse,
    JournalLineResponse,
    JournalEntryPostResponse,
    JournalEntryStatus,
    PeriodLockCheckResponse,
    AuditLogEntry,
    AuditLogListResponse,
)
from app.api.v1.deps import CurrentUser, require_assigned_client

router = APIRouter()


# ============ Helper Functions ============

async def generate_entry_number(db: AsyncSession, administration_id: UUID) -> str:
    """
    Generate a sequential entry number for a new journal entry.
    Format: JE-YYYY-0001
    """
    current_year = datetime.now().year
    
    # Count existing entries for this year
    result = await db.execute(
        select(func.count(JournalEntry.id))
        .where(JournalEntry.administration_id == administration_id)
        .where(func.extract('year', JournalEntry.created_at) == current_year)
    )
    count = result.scalar() or 0
    
    return f"JE-{current_year}-{str(count + 1).zfill(4)}"


async def check_period_lock(
    db: AsyncSession,
    administration_id: UUID,
    entry_date: date,
) -> tuple[bool, Optional[AccountingPeriod]]:
    """
    Check if the given date falls within a locked or finalized period.
    
    Returns:
        Tuple of (is_locked, period if locked else None)
    """
    result = await db.execute(
        select(AccountingPeriod)
        .where(AccountingPeriod.administration_id == administration_id)
        .where(AccountingPeriod.start_date <= entry_date)
        .where(AccountingPeriod.end_date >= entry_date)
        .where(AccountingPeriod.status.in_([PeriodStatus.FINALIZED, PeriodStatus.LOCKED]))
    )
    period = result.scalar_one_or_none()
    
    if period:
        return True, period
    return False, None


async def log_audit_action(
    db: AsyncSession,
    administration_id: UUID,
    actor_id: UUID,
    actor_name: str,
    action: str,
    entity_type: str,
    entity_id: Optional[UUID],
    entity_description: Optional[str],
    payload: Optional[dict] = None,
    request: Optional[Request] = None,
):
    """Log an action to the bookkeeping audit log."""
    ip_address = None
    user_agent = None
    
    if request:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
    
    log_entry = BookkeepingAuditLog(
        administration_id=administration_id,
        actor_id=actor_id,
        actor_name=actor_name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_description=entity_description,
        payload=payload,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log_entry)


def convert_entry_to_response(entry: JournalEntry) -> JournalEntryResponse:
    """Convert JournalEntry model to response schema."""
    lines = []
    for line in entry.lines:
        lines.append(JournalLineResponse(
            id=line.id,
            line_number=line.line_number,
            account_id=line.account_id,
            account_code=line.account.account_code if line.account else None,
            account_name=line.account.account_name if line.account else None,
            description=line.description,
            debit_amount=line.debit_amount,
            credit_amount=line.credit_amount,
            vat_code_id=line.vat_code_id,
            vat_code=line.vat_code.code if line.vat_code else None,
            vat_amount=line.vat_amount,
            taxable_amount=line.taxable_amount,
            party_type=line.party_type,
            party_id=line.party_id,
        ))
    
    return JournalEntryResponse(
        id=entry.id,
        administration_id=entry.administration_id,
        entry_number=entry.entry_number,
        entry_date=entry.entry_date,
        description=entry.description,
        reference=entry.reference,
        status=JournalEntryStatus(entry.status.value),
        total_debit=entry.total_debit,
        total_credit=entry.total_credit,
        is_balanced=entry.is_balanced,
        source_type=entry.source_type,
        document_id=entry.document_id,
        posted_at=entry.posted_at,
        posted_by_name=entry.posted_by.full_name if entry.posted_by else None,
        created_by_name=entry.created_by.full_name if entry.created_by else None,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        lines=lines,
    )


# ============ Journal Entry Endpoints ============

@router.get("/clients/{client_id}/journal", response_model=JournalEntryListResponse)
async def list_journal_entries(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[JournalEntryStatus] = Query(None, description="Filter by status"),
    start_date: Optional[date] = Query(None, description="Filter entries from this date"),
    end_date: Optional[date] = Query(None, description="Filter entries up to this date"),
    limit: int = Query(50, ge=1, le=100, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """
    List journal entries for a client.
    
    Requires 'bookkeeping' scope.
    """
    administration = await require_assigned_client(client_id, current_user, db, required_scope="bookkeeping")
    
    # Build query
    query = (
        select(JournalEntry)
        .where(JournalEntry.administration_id == client_id)
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.created_at.desc())
    )
    
    # Apply filters
    if status:
        query = query.where(JournalEntry.status == ModelJournalEntryStatus(status.value))
    
    if start_date:
        query = query.where(JournalEntry.entry_date >= start_date)
    
    if end_date:
        query = query.where(JournalEntry.entry_date <= end_date)
    
    # Get total count
    count_result = await db.execute(
        select(func.count(JournalEntry.id))
        .where(JournalEntry.administration_id == client_id)
    )
    total_count = count_result.scalar() or 0
    
    # Apply pagination
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    entries = result.scalars().all()
    
    return JournalEntryListResponse(
        entries=[
            JournalEntryListItem(
                id=e.id,
                entry_number=e.entry_number,
                entry_date=e.entry_date,
                description=e.description,
                status=JournalEntryStatus(e.status.value),
                total_debit=e.total_debit,
                total_credit=e.total_credit,
                is_balanced=e.is_balanced,
                source_type=e.source_type,
                posted_at=e.posted_at,
                created_at=e.created_at,
            )
            for e in entries
        ],
        total_count=total_count,
    )


@router.post("/clients/{client_id}/journal", response_model=JournalEntryResponse)
async def create_journal_entry(
    client_id: UUID,
    request_body: JournalEntryCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    """
    Create a new manual journal entry.
    
    The entry is created in DRAFT status by default.
    Set auto_post=true to immediately post the entry.
    
    Requires 'bookkeeping' scope.
    """
    administration = await require_assigned_client(client_id, current_user, db, required_scope="bookkeeping")
    
    # Check period lock if auto_post is requested
    if request_body.auto_post:
        is_locked, locked_period = await check_period_lock(db, client_id, request_body.entry_date)
        if is_locked and locked_period:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "PERIOD_LOCKED",
                    "message": f"Kan niet boeken in afgesloten periode: {locked_period.name}",
                    "period_id": str(locked_period.id),
                    "period_name": locked_period.name,
                }
            )
    
    # Generate entry number
    entry_number = await generate_entry_number(db, client_id)
    
    # Validate accounts exist
    for line_data in request_body.lines:
        account_result = await db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.id == line_data.account_id)
            .where(ChartOfAccount.administration_id == client_id)
        )
        account = account_result.scalar_one_or_none()
        if not account:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "INVALID_ACCOUNT",
                    "message": f"Grootboekrekening niet gevonden: {line_data.account_id}",
                }
            )
    
    # Create journal entry
    entry = JournalEntry(
        administration_id=client_id,
        entry_number=entry_number,
        entry_date=request_body.entry_date,
        description=request_body.description,
        reference=request_body.reference,
        document_id=request_body.document_id,
        source_type=request_body.source_type or "MANUAL",
        source_id=request_body.source_id,
        status=ModelJournalEntryStatus.DRAFT,
        created_by_id=current_user.id,
    )
    db.add(entry)
    await db.flush()  # Get entry.id
    
    # Create lines
    for i, line_data in enumerate(request_body.lines):
        line = JournalLine(
            journal_entry_id=entry.id,
            account_id=line_data.account_id,
            line_number=i + 1,
            description=line_data.description,
            debit_amount=line_data.debit_amount,
            credit_amount=line_data.credit_amount,
            vat_code_id=line_data.vat_code_id,
            vat_amount=line_data.vat_amount,
            taxable_amount=line_data.taxable_amount,
            party_type=line_data.party_type,
            party_id=line_data.party_id,
        )
        db.add(line)
    
    # Calculate totals
    await db.flush()
    await db.refresh(entry, ["lines"])
    entry.calculate_totals()
    
    # Log audit action
    await log_audit_action(
        db=db,
        administration_id=client_id,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        action=BookkeepingAuditAction.CREATE.value,
        entity_type="journal_entry",
        entity_id=entry.id,
        entity_description=f"{entry_number}: {request_body.description[:50]}",
        payload={"entry_date": str(request_body.entry_date), "total": str(entry.total_debit)},
        request=request,
    )
    
    # Auto-post if requested
    if request_body.auto_post and entry.is_balanced:
        entry.status = ModelJournalEntryStatus.POSTED
        entry.posted_at = datetime.now(timezone.utc)
        entry.posted_by_id = current_user.id
        
        await log_audit_action(
            db=db,
            administration_id=client_id,
            actor_id=current_user.id,
            actor_name=current_user.full_name,
            action=BookkeepingAuditAction.POST.value,
            entity_type="journal_entry",
            entity_id=entry.id,
            entity_description=f"{entry_number}: {request_body.description[:50]}",
            request=request,
        )
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(JournalEntry)
        .options(
            selectinload(JournalEntry.lines).selectinload(JournalLine.account),
            selectinload(JournalEntry.lines).selectinload(JournalLine.vat_code),
            selectinload(JournalEntry.posted_by),
            selectinload(JournalEntry.created_by),
        )
        .where(JournalEntry.id == entry.id)
    )
    entry = result.scalar_one()
    
    return convert_entry_to_response(entry)


@router.get("/clients/{client_id}/journal/{entry_id}", response_model=JournalEntryResponse)
async def get_journal_entry(
    client_id: UUID,
    entry_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get a specific journal entry with all lines.
    
    Requires 'bookkeeping' scope.
    """
    await require_assigned_client(client_id, current_user, db, required_scope="bookkeeping")
    
    result = await db.execute(
        select(JournalEntry)
        .options(
            selectinload(JournalEntry.lines).selectinload(JournalLine.account),
            selectinload(JournalEntry.lines).selectinload(JournalLine.vat_code),
            selectinload(JournalEntry.posted_by),
            selectinload(JournalEntry.created_by),
        )
        .where(JournalEntry.id == entry_id)
        .where(JournalEntry.administration_id == client_id)
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={"code": "ENTRY_NOT_FOUND", "message": "Journaalpost niet gevonden"}
        )
    
    return convert_entry_to_response(entry)


@router.put("/clients/{client_id}/journal/{entry_id}", response_model=JournalEntryResponse)
async def update_journal_entry(
    client_id: UUID,
    entry_id: UUID,
    request_body: JournalEntryUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    """
    Update a draft journal entry.
    
    Only DRAFT entries can be edited.
    
    Requires 'bookkeeping' scope.
    """
    await require_assigned_client(client_id, current_user, db, required_scope="bookkeeping")
    
    result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.id == entry_id)
        .where(JournalEntry.administration_id == client_id)
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={"code": "ENTRY_NOT_FOUND", "message": "Journaalpost niet gevonden"}
        )
    
    if entry.status != ModelJournalEntryStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ENTRY_NOT_EDITABLE",
                "message": "Alleen concepten kunnen worden bewerkt"
            }
        )
    
    # Update fields
    if request_body.entry_date is not None:
        entry.entry_date = request_body.entry_date
    if request_body.description is not None:
        entry.description = request_body.description
    if request_body.reference is not None:
        entry.reference = request_body.reference
    
    # Update lines if provided
    if request_body.lines is not None:
        # Delete existing lines
        for line in entry.lines:
            await db.delete(line)
        
        # Add new lines
        for i, line_data in enumerate(request_body.lines):
            # Validate account exists
            account_result = await db.execute(
                select(ChartOfAccount)
                .where(ChartOfAccount.id == line_data.account_id)
                .where(ChartOfAccount.administration_id == client_id)
            )
            account = account_result.scalar_one_or_none()
            if not account:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "INVALID_ACCOUNT",
                        "message": f"Grootboekrekening niet gevonden: {line_data.account_id}",
                    }
                )
            
            line = JournalLine(
                journal_entry_id=entry.id,
                account_id=line_data.account_id,
                line_number=i + 1,
                description=line_data.description,
                debit_amount=line_data.debit_amount,
                credit_amount=line_data.credit_amount,
                vat_code_id=line_data.vat_code_id,
                vat_amount=line_data.vat_amount,
                taxable_amount=line_data.taxable_amount,
                party_type=line_data.party_type,
                party_id=line_data.party_id,
            )
            db.add(line)
    
    # Calculate totals
    await db.flush()
    await db.refresh(entry, ["lines"])
    entry.calculate_totals()
    
    # Log audit action
    await log_audit_action(
        db=db,
        administration_id=client_id,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        action=BookkeepingAuditAction.UPDATE.value,
        entity_type="journal_entry",
        entity_id=entry.id,
        entity_description=f"{entry.entry_number}: {entry.description[:50]}",
        request=request,
    )
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(JournalEntry)
        .options(
            selectinload(JournalEntry.lines).selectinload(JournalLine.account),
            selectinload(JournalEntry.lines).selectinload(JournalLine.vat_code),
            selectinload(JournalEntry.posted_by),
            selectinload(JournalEntry.created_by),
        )
        .where(JournalEntry.id == entry.id)
    )
    entry = result.scalar_one()
    
    return convert_entry_to_response(entry)


@router.post("/clients/{client_id}/journal/{entry_id}/post", response_model=JournalEntryPostResponse)
async def post_journal_entry(
    client_id: UUID,
    entry_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    """
    Post a draft journal entry.
    
    Posting is blocked if:
    - Entry is not in DRAFT status
    - Entry is not balanced (debit != credit)
    - Entry date falls within a locked/finalized period
    
    Requires 'bookkeeping' scope.
    """
    await require_assigned_client(client_id, current_user, db, required_scope="bookkeeping")
    
    result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.id == entry_id)
        .where(JournalEntry.administration_id == client_id)
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={"code": "ENTRY_NOT_FOUND", "message": "Journaalpost niet gevonden"}
        )
    
    if entry.status != ModelJournalEntryStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ALREADY_POSTED",
                "message": "Journaalpost is al geboekt"
            }
        )
    
    # Check if entry has lines
    if not entry.lines:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "NO_LINES",
                "message": "Journaalpost heeft geen regels"
            }
        )
    
    # Recalculate totals
    entry.calculate_totals()
    
    if not entry.is_balanced:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "NOT_BALANCED",
                "message": f"Journaalpost is niet in balans. Debet: {entry.total_debit}, Credit: {entry.total_credit}",
                "total_debit": str(entry.total_debit),
                "total_credit": str(entry.total_credit),
            }
        )
    
    # Check period lock
    is_locked, locked_period = await check_period_lock(db, client_id, entry.entry_date)
    if is_locked and locked_period:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PERIOD_LOCKED",
                "message": f"Kan niet boeken in afgesloten periode: {locked_period.name}",
                "period_id": str(locked_period.id),
                "period_name": locked_period.name,
            }
        )
    
    # Post the entry
    entry.status = ModelJournalEntryStatus.POSTED
    entry.posted_at = datetime.now(timezone.utc)
    entry.posted_by_id = current_user.id
    
    # Log audit action
    await log_audit_action(
        db=db,
        administration_id=client_id,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        action=BookkeepingAuditAction.POST.value,
        entity_type="journal_entry",
        entity_id=entry.id,
        entity_description=f"{entry.entry_number}: {entry.description[:50]}",
        payload={"entry_date": str(entry.entry_date), "total": str(entry.total_debit)},
        request=request,
    )
    
    await db.commit()
    
    return JournalEntryPostResponse(
        id=entry.id,
        status=JournalEntryStatus(entry.status.value),
        entry_number=entry.entry_number,
        posted_at=entry.posted_at,
        message="Journaalpost succesvol geboekt",
    )


@router.delete("/clients/{client_id}/journal/{entry_id}")
async def delete_journal_entry(
    client_id: UUID,
    entry_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    """
    Delete a draft journal entry.
    
    Only DRAFT entries can be deleted.
    
    Requires 'bookkeeping' scope.
    """
    await require_assigned_client(client_id, current_user, db, required_scope="bookkeeping")
    
    result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.id == entry_id)
        .where(JournalEntry.administration_id == client_id)
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={"code": "ENTRY_NOT_FOUND", "message": "Journaalpost niet gevonden"}
        )
    
    if entry.status != ModelJournalEntryStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ENTRY_NOT_DELETABLE",
                "message": "Alleen concepten kunnen worden verwijderd"
            }
        )
    
    entry_number = entry.entry_number
    entry_description = entry.description
    
    # Log audit action before deletion
    await log_audit_action(
        db=db,
        administration_id=client_id,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        action=BookkeepingAuditAction.DELETE.value,
        entity_type="journal_entry",
        entity_id=entry.id,
        entity_description=f"{entry_number}: {entry_description[:50]}",
        request=request,
    )
    
    await db.delete(entry)
    await db.commit()
    
    return {"message": f"Journaalpost {entry_number} verwijderd"}


# ============ Period Lock Check Endpoint ============

@router.get("/clients/{client_id}/journal/check-period", response_model=PeriodLockCheckResponse)
async def check_period_lock_status(
    client_id: UUID,
    entry_date: date,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Check if a date falls within a locked/finalized period.
    
    Useful for UI to warn user before creating an entry.
    
    Requires 'bookkeeping' scope.
    """
    await require_assigned_client(client_id, current_user, db, required_scope="bookkeeping")
    
    is_locked, period = await check_period_lock(db, client_id, entry_date)
    
    if is_locked and period:
        locked_by_name = None
        if period.locked_by:
            await db.refresh(period, ["locked_by"])
            locked_by_name = period.locked_by.full_name if period.locked_by else None
        
        return PeriodLockCheckResponse(
            is_locked=True,
            period_id=period.id,
            period_name=period.name,
            locked_at=period.locked_at or period.finalized_at,
            locked_by_name=locked_by_name,
            message=f"Datum valt in afgesloten periode: {period.name}",
        )
    
    return PeriodLockCheckResponse(
        is_locked=False,
        message="Datum is beschikbaar voor boeken",
    )


# ============ Audit Log Endpoints ============

@router.get("/clients/{client_id}/audit", response_model=AuditLogListResponse)
async def list_audit_log(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    action: Optional[str] = Query(None, description="Filter by action"),
    limit: int = Query(50, ge=1, le=100, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """
    List audit log entries for a client.
    
    Shows all bookkeeping actions (create, update, post, delete, etc.)
    
    Requires 'bookkeeping' scope.
    """
    await require_assigned_client(client_id, current_user, db, required_scope="bookkeeping")
    
    # Build query
    query = (
        select(BookkeepingAuditLog)
        .where(BookkeepingAuditLog.administration_id == client_id)
        .order_by(BookkeepingAuditLog.created_at.desc())
    )
    
    # Apply filters
    if entity_type:
        query = query.where(BookkeepingAuditLog.entity_type == entity_type)
    
    if action:
        query = query.where(BookkeepingAuditLog.action == action)
    
    # Get total count
    count_query = (
        select(func.count(BookkeepingAuditLog.id))
        .where(BookkeepingAuditLog.administration_id == client_id)
    )
    if entity_type:
        count_query = count_query.where(BookkeepingAuditLog.entity_type == entity_type)
    if action:
        count_query = count_query.where(BookkeepingAuditLog.action == action)
    
    count_result = await db.execute(count_query)
    total_count = count_result.scalar() or 0
    
    # Apply pagination
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    entries = result.scalars().all()
    
    return AuditLogListResponse(
        entries=[
            AuditLogEntry(
                id=e.id,
                administration_id=e.administration_id,
                actor_id=e.actor_id,
                actor_name=e.actor_name,
                action=e.action,
                entity_type=e.entity_type,
                entity_id=e.entity_id,
                entity_description=e.entity_description,
                payload=e.payload,
                created_at=e.created_at,
            )
            for e in entries
        ],
        total_count=total_count,
    )
