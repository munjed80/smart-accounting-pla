"""
Work Queue, Reminders, and Evidence Pack API Endpoints

Provides endpoints for:
- Work queue with unified work items
- SLA summary
- Reminder send/schedule/history
- Evidence pack generation and download
"""
from datetime import datetime, timezone, date
from typing import Annotated, Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import io

from app.core.database import get_db
from app.models.user import User
from app.schemas.work_queue import (
    WorkQueueResponse,
    WorkQueueItem,
    SLASummaryResponse,
    ReminderSendRequest,
    ReminderScheduleRequest,
    ReminderResponse,
    ReminderHistoryResponse,
    EvidencePackCreateRequest,
    EvidencePackResponse,
    EvidencePackListResponse,
)
from app.services.work_queue import WorkQueueService, SLAService
from app.services.reminders import ReminderService, RateLimitExceededError as ReminderRateLimitError
from app.services.evidence_pack import EvidencePackService, EvidencePackServiceError, RateLimitExceededError as EvidenceRateLimitError
from app.api.v1.deps import CurrentUser

router = APIRouter()


def verify_accountant_role(current_user: User) -> None:
    """Verify user has accountant or admin role."""
    if current_user.role not in ["accountant", "admin"]:
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only available for accountants"
        )


def get_client_info(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Extract client IP and user agent from request."""
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return ip_address, user_agent


# ============ Work Queue Endpoints ============

@router.get("/work-queue", response_model=WorkQueueResponse)
async def get_work_queue(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    queue: Optional[str] = Query(
        "all",
        description="Queue filter: red, review, vat_due, stale, all"
    ),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
    cursor: Optional[str] = Query(None, description="Pagination cursor"),
    sort: Optional[str] = Query(
        "readiness_score",
        description="Sort field: readiness_score, due_date, severity"
    ),
    order: Optional[str] = Query("asc", description="Sort order: asc or desc"),
):
    """
    Get unified work queue for accountant dashboard.
    
    Returns normalized work items across all assigned clients, including:
    - Issues (RED/YELLOW)
    - Document backlogs
    - VAT deadlines
    - Stale clients
    - Critical alerts
    
    Each item includes readiness score and suggested next action.
    """
    verify_accountant_role(current_user)
    
    service = WorkQueueService(db, current_user.id)
    result = await service.get_work_queue(
        queue_type=queue,
        limit=limit,
        cursor=cursor,
        sort_by=sort,
        sort_order=order,
    )
    
    return WorkQueueResponse(
        items=[
            WorkQueueItem(
                client_id=UUID(item["client_id"]),
                client_name=item["client_name"],
                period_id=UUID(item["period_id"]) if item.get("period_id") else None,
                period_status=item.get("period_status"),
                work_item_type=item["work_item_type"],
                severity=item.get("severity"),
                title=item["title"],
                description=item["description"],
                suggested_next_action=item["suggested_next_action"],
                due_date=item.get("due_date"),
                age_days=item.get("age_days"),
                counts=item.get("counts", {}),
                readiness_score=item["readiness_score"],
                readiness_breakdown=item.get("readiness_breakdown"),
            )
            for item in result["items"]
        ],
        total_count=result["total_count"],
        returned_count=result["returned_count"],
        queue_type=result["queue_type"],
        counts=result["counts"],
        sort_by=result["sort_by"],
        sort_order=result["sort_order"],
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/dashboard/sla-summary", response_model=SLASummaryResponse)
async def get_sla_summary(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get SLA summary for all assigned clients.
    
    Returns:
    - Total violations count
    - Violations by severity (CRITICAL, WARNING)
    - Violations by type (RED_UNRESOLVED, VAT_DEADLINE, REVIEW_STALE, BACKLOG_HIGH)
    - Escalation events created today
    - Current SLA policy thresholds
    """
    verify_accountant_role(current_user)
    
    # Get assigned client IDs
    work_queue_service = WorkQueueService(db, current_user.id)
    client_ids = await work_queue_service.get_assigned_client_ids()
    
    sla_service = SLAService(db)
    summary = await sla_service.get_sla_summary(client_ids)
    
    return SLASummaryResponse(
        total_violations=summary["total_violations"],
        critical_count=summary["critical_count"],
        warning_count=summary["warning_count"],
        by_type=summary["by_type"],
        escalation_events_today=summary["escalation_events_today"],
        policy=summary["policy"],
        generated_at=datetime.now(timezone.utc),
    )


# ============ Reminder Endpoints ============

@router.post("/reminders/send", response_model=List[ReminderResponse])
async def send_reminders(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request_body: ReminderSendRequest,
    request: Request,
):
    """
    Send reminders immediately to selected clients.
    
    Supports channels:
    - IN_APP: Notification visible in client dashboard
    - EMAIL: Email sent via Resend (requires RESEND_API_KEY env var)
    
    If EMAIL is selected but RESEND_API_KEY is not configured, falls back to IN_APP.
    
    Rate limited to 10 reminders per minute.
    """
    verify_accountant_role(current_user)
    
    ip_address, user_agent = get_client_info(request)
    
    service = ReminderService(db, current_user.id)
    
    try:
        reminders = await service.send_reminder(
            administration_ids=[UUID(cid) for cid in request_body.client_ids],
            reminder_type=request_body.reminder_type,
            title=request_body.title,
            message=request_body.message,
            channel=request_body.channel,
            due_date=request_body.due_date,
            template_id=request_body.template_id,
            variables=request_body.variables,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        return [
            ReminderResponse(
                id=r.id,
                administration_id=r.administration_id,
                reminder_type=r.reminder_type,
                title=r.title,
                message=r.message,
                channel=r.channel,
                status=r.status,
                due_date=r.due_date,
                scheduled_at=r.scheduled_at,
                sent_at=r.sent_at,
                created_at=r.created_at,
                send_error=r.send_error,
            )
            for r in reminders
        ]
        
    except ReminderRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))


@router.post("/reminders/schedule", response_model=List[ReminderResponse])
async def schedule_reminders(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request_body: ReminderScheduleRequest,
    request: Request,
):
    """
    Schedule reminders for future sending.
    
    Scheduled reminders will be sent at the specified time by a background job.
    
    Rate limited to 10 reminders per minute.
    """
    verify_accountant_role(current_user)
    
    ip_address, user_agent = get_client_info(request)
    
    service = ReminderService(db, current_user.id)
    
    try:
        reminders = await service.schedule_reminder(
            administration_ids=[UUID(cid) for cid in request_body.client_ids],
            reminder_type=request_body.reminder_type,
            title=request_body.title,
            message=request_body.message,
            scheduled_at=request_body.scheduled_at,
            channel=request_body.channel,
            due_date=request_body.due_date,
            template_id=request_body.template_id,
            variables=request_body.variables,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        return [
            ReminderResponse(
                id=r.id,
                administration_id=r.administration_id,
                reminder_type=r.reminder_type,
                title=r.title,
                message=r.message,
                channel=r.channel,
                status=r.status,
                due_date=r.due_date,
                scheduled_at=r.scheduled_at,
                sent_at=r.sent_at,
                created_at=r.created_at,
                send_error=r.send_error,
            )
            for r in reminders
        ]
        
    except ReminderRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))


@router.get("/reminders/history", response_model=ReminderHistoryResponse)
async def get_reminder_history(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    client_id: Optional[UUID] = Query(None, description="Filter by client ID"),
    limit: int = Query(50, ge=1, le=100, description="Max results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """
    Get reminder history.
    
    Can be filtered by client_id to see reminders for a specific client.
    Returns reminders created by the current accountant.
    """
    verify_accountant_role(current_user)
    
    service = ReminderService(db, current_user.id)
    result = await service.get_reminder_history(
        administration_id=client_id,
        limit=limit,
        offset=offset,
    )
    
    return ReminderHistoryResponse(
        reminders=[
            ReminderResponse(
                id=UUID(r["id"]),
                administration_id=UUID(r["administration_id"]),
                reminder_type=r["reminder_type"],
                title=r["title"],
                message=r["message"],
                channel=r["channel"],
                status=r["status"],
                due_date=date.fromisoformat(r["due_date"]) if r["due_date"] else None,
                scheduled_at=datetime.fromisoformat(r["scheduled_at"]) if r["scheduled_at"] else None,
                sent_at=datetime.fromisoformat(r["sent_at"]) if r["sent_at"] else None,
                created_at=datetime.fromisoformat(r["created_at"]) if r["created_at"] else None,
                send_error=r["send_error"],
            )
            for r in result["reminders"]
        ],
        total_count=result["total_count"],
        limit=result["limit"],
        offset=result["offset"],
    )


# ============ Evidence Pack Endpoints ============

@router.post("/clients/{client_id}/periods/{period_id}/evidence-pack", response_model=EvidencePackResponse)
async def create_evidence_pack(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
    pack_type: str = Query("VAT_EVIDENCE", description="Pack type: VAT_EVIDENCE or AUDIT_TRAIL"),
):
    """
    Generate a VAT evidence pack for a client and period.
    
    Evidence pack contains:
    - Summary of VAT boxes
    - List of relevant journal entries
    - List of invoices/documents used in VAT calculation
    - Validation status + acknowledged issues
    - Period snapshot info
    
    The pack is stored on the server and can be downloaded later.
    
    Rate limited to 5 packs per minute.
    """
    verify_accountant_role(current_user)
    
    ip_address, user_agent = get_client_info(request)
    
    service = EvidencePackService(db, current_user.id)
    
    try:
        pack = await service.generate_evidence_pack(
            administration_id=client_id,
            period_id=period_id,
            pack_type=pack_type,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        return EvidencePackResponse(
            id=pack.id,
            administration_id=pack.administration_id,
            period_id=pack.period_id,
            pack_type=pack.pack_type,
            created_at=pack.created_at,
            file_size_bytes=pack.file_size_bytes,
            checksum=pack.checksum,
            download_count=pack.download_count,
            metadata=pack.metadata_json,
        )
        
    except EvidenceRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except EvidencePackServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/evidence-packs/{pack_id}/download")
async def download_evidence_pack(
    pack_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    """
    Download an evidence pack.
    
    Returns the evidence pack as a JSON file download.
    Verifies checksum integrity before serving.
    """
    verify_accountant_role(current_user)
    
    ip_address, user_agent = get_client_info(request)
    
    service = EvidencePackService(db, current_user.id)
    
    try:
        content, filename, content_type = await service.download_evidence_pack(
            pack_id=pack_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        return StreamingResponse(
            io.BytesIO(content),
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(content)),
            }
        )
        
    except EvidencePackServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/evidence-packs", response_model=EvidencePackListResponse)
async def list_evidence_packs(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    client_id: Optional[UUID] = Query(None, description="Filter by client ID"),
    period_id: Optional[UUID] = Query(None, description="Filter by period ID"),
    limit: int = Query(50, ge=1, le=100, description="Max results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """
    List evidence packs.
    
    Can be filtered by client_id and/or period_id.
    """
    verify_accountant_role(current_user)
    
    service = EvidencePackService(db, current_user.id)
    result = await service.list_evidence_packs(
        administration_id=client_id,
        period_id=period_id,
        limit=limit,
        offset=offset,
    )
    
    return EvidencePackListResponse(
        packs=[
            EvidencePackResponse(
                id=UUID(p["id"]),
                administration_id=UUID(p["administration_id"]),
                period_id=UUID(p["period_id"]),
                pack_type=p["pack_type"],
                created_at=datetime.fromisoformat(p["created_at"]) if p["created_at"] else None,
                file_size_bytes=p["file_size_bytes"],
                checksum=p["checksum"],
                download_count=p["download_count"],
                metadata=p["metadata"],
            )
            for p in result["packs"]
        ],
        total_count=result["total_count"],
        limit=result["limit"],
        offset=result["offset"],
    )
