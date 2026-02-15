"""
Period Control API Endpoints

Provides accountant-only endpoints for period control and finalization:
- Review period (trigger validation)
- Finalize period (create immutable snapshot)
- Lock period (irreversible hard lock)
- Get period snapshot
"""
from datetime import datetime, timezone
from typing import Annotated, Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.ledger import AccountingPeriod, PeriodStatus as ModelPeriodStatus
from app.schemas.period import (
    PeriodResponse,
    PeriodWithValidationResponse,
    ValidationStatus,
    ValidationIssue,
    ReviewPeriodRequest,
    ReviewPeriodResponse,
    FinalizePeriodRequest,
    FinalizePeriodResponse,
    LockPeriodRequest,
    LockPeriodResponse,
    PeriodSnapshotResponse,
    SnapshotSummary,
    AuditLogResponse,
    PeriodAuditLogsResponse,
    PeriodsListResponse,
    FinalizationPrerequisiteErrorResponse,
    PeriodStatus,
    PeriodStatusUpdateRequest,
    PeriodStatusUpdateResponse,
)
from app.services.period import PeriodControlService, PeriodControlError
from app.services.period.control import (
    PeriodNotFoundError,
    PeriodStateError,
    FinalizationPrerequisiteError,
)
from app.api.v1.deps import CurrentUser, require_assigned_client
from app.services.vat import VatReportService

router = APIRouter()


def convert_period_to_response(period: AccountingPeriod) -> PeriodResponse:
    """Convert AccountingPeriod model to response schema."""
    return PeriodResponse(
        id=period.id,
        administration_id=period.administration_id,
        name=period.name,
        period_type=period.period_type,
        start_date=period.start_date,
        end_date=period.end_date,
        status=PeriodStatus(period.status.value),
        is_closed=period.is_closed,
        created_at=period.created_at,
        closed_at=period.closed_at,
        review_started_at=period.review_started_at,
        finalized_at=period.finalized_at,
        locked_at=period.locked_at,
        review_started_by_id=period.review_started_by_id,
        finalized_by_id=period.finalized_by_id,
        locked_by_id=period.locked_by_id,
    )


@router.get("/clients/{client_id}/periods", response_model=PeriodsListResponse)
async def list_periods(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[List[PeriodStatus]] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=100, description="Max results to return"),
):
    """
    List accounting periods for a client.
    
    Optionally filter by status (OPEN, REVIEW, FINALIZED, LOCKED).
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    service = PeriodControlService(db, client_id)
    
    status_filter = None
    if status:
        status_filter = [ModelPeriodStatus(s.value) for s in status]
    
    periods = await service.list_periods(status_filter=status_filter, limit=limit)
    
    return PeriodsListResponse(
        administration_id=client_id,
        periods=[convert_period_to_response(p) for p in periods],
        total_count=len(periods),
    )


@router.get(
    "/clients/{client_id}/periods/{period_id}",
    response_model=PeriodWithValidationResponse
)
async def get_period(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get period details with current validation status.
    
    Returns the period and its validation status (RED/YELLOW issues).
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    service = PeriodControlService(db, client_id)
    
    try:
        period, validation_status = await service.get_period_with_validation_status(period_id)
    except PeriodNotFoundError:
        raise HTTPException(status_code=404, detail="Period not found")
    
    return PeriodWithValidationResponse(
        period=convert_period_to_response(period),
        validation=ValidationStatus(
            red_issues=[ValidationIssue(**i) for i in validation_status["red_issues"]],
            yellow_issues=[ValidationIssue(**i) for i in validation_status["yellow_issues"]],
            can_finalize=validation_status["can_finalize"],
            validation_summary=validation_status["validation_summary"],
        ),
    )




@router.patch(
    "/clients/{client_id}/periods/{period_id}",
    response_model=PeriodStatusUpdateResponse,
)
async def update_period_status(
    client_id: UUID,
    period_id: UUID,
    body: PeriodStatusUpdateRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update period status for VAT filing readiness."""
    await require_assigned_client(client_id, current_user, db)

    result = await db.execute(
        select(AccountingPeriod)
        .where(AccountingPeriod.id == period_id)
        .where(AccountingPeriod.administration_id == client_id)
    )
    period = result.scalar_one_or_none()

    if not period:
        raise HTTPException(status_code=404, detail="Period not found")

    target_status = body.status.upper()
    if target_status not in {"READY_FOR_FILING", "FINALIZED"}:
        raise HTTPException(status_code=422, detail="Unsupported period status")

    vat_service = VatReportService(db, client_id)
    anomalies = await vat_service.validate_vat_return(period_id)
    red_count = sum(1 for anomaly in anomalies if anomaly.severity == "RED")
    if red_count > 0:
        raise HTTPException(
            status_code=422,
            detail=f"Kan niet afronden: {red_count} blokkerende BTW-afwijking(en).",
        )

    period.status = ModelPeriodStatus.FINALIZED
    period.is_closed = True
    period.finalized_at = datetime.now(timezone.utc)
    period.finalized_by_id = current_user.id
    period.closed_at = period.finalized_at

    await db.commit()
    await db.refresh(period)

    return PeriodStatusUpdateResponse(
        period=convert_period_to_response(period),
        message="Periode gemarkeerd als klaar voor handmatige BTW-aangifte.",
    )


@router.post(
    "/clients/{client_id}/periods/{period_id}/review",
    response_model=ReviewPeriodResponse
)
async def review_period(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
    body: ReviewPeriodRequest = ReviewPeriodRequest(),
):
    """
    Start the review process for a period.
    
    This triggers a full validation run and transitions the period from OPEN to REVIEW.
    The period will remain in REVIEW status until finalized or reopened.
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    # Get request metadata for audit
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    service = PeriodControlService(db, client_id)
    
    try:
        period, validation_run = await service.start_review(
            period_id=period_id,
            user_id=current_user.id,
            notes=body.notes,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    except PeriodNotFoundError:
        raise HTTPException(status_code=404, detail="Period not found")
    except PeriodStateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    return ReviewPeriodResponse(
        period=convert_period_to_response(period),
        validation_run_id=validation_run.id,
        issues_found=validation_run.issues_found or 0,
        message=f"Period review started. Found {validation_run.issues_found or 0} issues.",
    )


@router.post(
    "/clients/{client_id}/periods/{period_id}/finalize",
    response_model=FinalizePeriodResponse,
    responses={
        400: {"model": FinalizationPrerequisiteErrorResponse}
    }
)
async def finalize_period(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
    body: FinalizePeriodRequest = FinalizePeriodRequest(),
):
    """
    Finalize an accounting period.
    
    **Prerequisites:**
    - All RED issues must be resolved
    - All YELLOW issues must be explicitly acknowledged
    
    **Effects:**
    - Creates an immutable snapshot of all financial reports
    - Period status changes to FINALIZED
    - No new entries can be posted to this period
    - Reversals of entries in this period must go to the next OPEN period
    
    **Warning:** This action cannot be undone. The period can only be locked further.
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    # Get request metadata for audit
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    service = PeriodControlService(db, client_id)
    
    try:
        period, snapshot = await service.finalize_period(
            period_id=period_id,
            user_id=current_user.id,
            acknowledged_yellow_issues=body.acknowledged_yellow_issues,
            notes=body.notes,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    except PeriodNotFoundError:
        raise HTTPException(status_code=404, detail="Period not found")
    except PeriodStateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FinalizationPrerequisiteError as e:
        raise HTTPException(
            status_code=400, 
            detail={
                "message": str(e),
                "red_issues": e.red_issues,
                "yellow_issues": e.yellow_issues,
            }
        )
    
    return FinalizePeriodResponse(
        period=convert_period_to_response(period),
        snapshot_id=snapshot.id,
        message="Period finalized successfully. A snapshot of all financial reports has been created.",
    )


@router.post(
    "/clients/{client_id}/periods/{period_id}/lock",
    response_model=LockPeriodResponse
)
async def lock_period(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
    body: LockPeriodRequest,
):
    """
    Lock a finalized period (IRREVERSIBLE).
    
    **Prerequisites:**
    - Period must be FINALIZED
    - `confirm_irreversible` must be true
    
    **Effects:**
    - Period status changes to LOCKED
    - Period becomes completely immutable
    - Even reversals cannot target this period
    
    **⚠️ WARNING: This action is IRREVERSIBLE. Use with extreme caution.**
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    if not body.confirm_irreversible:
        raise HTTPException(
            status_code=400,
            detail="You must set confirm_irreversible=true to acknowledge that locking is irreversible."
        )
    
    # Get request metadata for audit
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    service = PeriodControlService(db, client_id)
    
    try:
        period = await service.lock_period(
            period_id=period_id,
            user_id=current_user.id,
            notes=body.notes,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    except PeriodNotFoundError:
        raise HTTPException(status_code=404, detail="Period not found")
    except PeriodStateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    return LockPeriodResponse(
        period=convert_period_to_response(period),
        message="Period locked permanently. This action cannot be undone.",
    )


@router.get(
    "/clients/{client_id}/periods/{period_id}/snapshot",
    response_model=PeriodSnapshotResponse
)
async def get_period_snapshot(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the finalization snapshot for a period.
    
    The snapshot contains immutable copies of:
    - Balance Sheet
    - Profit & Loss
    - VAT Summary
    - Open AR/AP balances
    - Trial Balance
    
    This is only available for FINALIZED or LOCKED periods.
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    service = PeriodControlService(db, client_id)
    
    try:
        period = await service.get_period(period_id)
    except PeriodNotFoundError:
        raise HTTPException(status_code=404, detail="Period not found")
    
    if period.status not in (ModelPeriodStatus.FINALIZED, ModelPeriodStatus.LOCKED):
        raise HTTPException(
            status_code=400,
            detail="Snapshot is only available for FINALIZED or LOCKED periods."
        )
    
    snapshot = await service.get_snapshot(period_id)
    
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found for this period")
    
    return PeriodSnapshotResponse(
        id=snapshot.id,
        period_id=snapshot.period_id,
        administration_id=snapshot.administration_id,
        snapshot_type=snapshot.snapshot_type,
        created_at=snapshot.created_at,
        created_by_id=snapshot.created_by_id,
        summary=SnapshotSummary(
            total_assets=snapshot.total_assets,
            total_liabilities=snapshot.total_liabilities,
            total_equity=snapshot.total_equity,
            net_income=snapshot.net_income,
            total_ar=snapshot.total_ar,
            total_ap=snapshot.total_ap,
            vat_payable=snapshot.vat_payable,
            vat_receivable=snapshot.vat_receivable,
        ),
        balance_sheet=snapshot.balance_sheet,
        profit_and_loss=snapshot.profit_and_loss,
        vat_summary=snapshot.vat_summary,
        open_ar_balances=snapshot.open_ar_balances,
        open_ap_balances=snapshot.open_ap_balances,
        trial_balance=snapshot.trial_balance,
        acknowledged_yellow_issues=snapshot.acknowledged_yellow_issues,
        issue_summary=snapshot.issue_summary,
    )


@router.get(
    "/clients/{client_id}/periods/{period_id}/audit-logs",
    response_model=PeriodAuditLogsResponse
)
async def get_period_audit_logs(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100, description="Max results to return"),
):
    """
    Get audit logs for a period.
    
    Returns a chronological log of all period control actions:
    - REVIEW_START
    - FINALIZE
    - LOCK
    
    Each log entry includes who performed the action, when, and any notes.
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    service = PeriodControlService(db, client_id)
    
    try:
        period = await service.get_period(period_id)
    except PeriodNotFoundError:
        raise HTTPException(status_code=404, detail="Period not found")
    
    logs = await service.get_audit_logs(period_id, limit=limit)
    
    return PeriodAuditLogsResponse(
        period_id=period_id,
        logs=[
            AuditLogResponse(
                id=log.id,
                period_id=log.period_id,
                administration_id=log.administration_id,
                action=log.action,
                from_status=log.from_status,
                to_status=log.to_status,
                performed_by_id=log.performed_by_id,
                performed_at=log.performed_at,
                notes=log.notes,
                snapshot_id=log.snapshot_id,
            )
            for log in logs
        ],
        total_count=len(logs),
    )
