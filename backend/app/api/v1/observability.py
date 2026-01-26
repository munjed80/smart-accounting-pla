"""
Observability API Endpoints

Provides endpoints for application health, metrics, and alerts:
- GET /health - Application health check
- GET /metrics - Application metrics
- Alerts management endpoints
"""
from datetime import datetime, timezone
from typing import Annotated, Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis

from app.core.config import settings
from app.core.database import engine, get_db
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.alerts import Alert, AlertSeverity
from app.schemas.alerts import (
    AlertResponse,
    AlertListResponse,
    AlertCountsResponse,
    AcknowledgeAlertRequest,
    ResolveAlertRequest,
    AlertGroupedResponse,
)
from app.services.alerts import AlertService
from app.services.metrics import MetricsService
from app.api.v1.deps import CurrentUser

router = APIRouter()


# ============ Health Endpoint ============

@router.get("/health", tags=["health"])
async def health_check():
    """
    Comprehensive health check endpoint.
    
    Verifies:
    - Database connectivity
    - Database migrations status (basic check)
    - Redis connectivity
    - Background tasks status (placeholder)
    
    Returns structured health status.
    """
    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "components": {
            "database": {"status": "unknown", "message": None},
            "redis": {"status": "unknown", "message": None},
            "migrations": {"status": "unknown", "message": None},
            "background_tasks": {"status": "unknown", "message": None},
        }
    }
    
    all_healthy = True
    
    # Check database connectivity
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        health["components"]["database"]["status"] = "healthy"
        health["components"]["database"]["message"] = "Connected"
    except Exception as e:
        health["components"]["database"]["status"] = "unhealthy"
        health["components"]["database"]["message"] = str(e)
        all_healthy = False
    
    # Check migrations status (basic check - verify key tables exist)
    try:
        async with engine.begin() as conn:
            # Check for key tables from latest migration
            result = await conn.execute(text("""
                SELECT COUNT(*) FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'administrations', 'documents', 'journal_entries', 'alerts')
            """))
            table_count = result.scalar()
            if table_count >= 5:
                health["components"]["migrations"]["status"] = "healthy"
                health["components"]["migrations"]["message"] = "All key tables present"
            else:
                health["components"]["migrations"]["status"] = "warning"
                health["components"]["migrations"]["message"] = f"Only {table_count}/5 key tables found"
    except Exception as e:
        health["components"]["migrations"]["status"] = "unhealthy"
        health["components"]["migrations"]["message"] = str(e)
        all_healthy = False
    
    # Check Redis connectivity
    try:
        client = redis.from_url(settings.REDIS_URL)
        await client.ping()
        await client.close()
        health["components"]["redis"]["status"] = "healthy"
        health["components"]["redis"]["message"] = "Connected"
    except Exception as e:
        health["components"]["redis"]["status"] = "unhealthy"
        health["components"]["redis"]["message"] = str(e)
        # Redis is not critical for core functionality
    
    # Background tasks status (placeholder - would check actual task queue in production)
    health["components"]["background_tasks"]["status"] = "healthy"
    health["components"]["background_tasks"]["message"] = "No background task queue configured"
    
    # Set overall status
    if not all_healthy:
        health["status"] = "unhealthy"
    
    return health


# ============ Metrics Endpoint ============

@router.get("/metrics", tags=["metrics"])
async def get_metrics(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: Optional[UUID] = Query(None, description="Filter metrics by client"),
):
    """
    Get application metrics.
    
    Returns structured metrics suitable for:
    - Dashboard display
    - Health monitoring
    - Future Prometheus integration
    
    Metrics include:
    - documents_processed_today
    - issues_created_today (RED/YELLOW)
    - decisions_approved/rejected
    - postings_created
    - failed_operations_count
    - alert counts
    """
    # Verify user is an accountant for global metrics, or has access to specific client
    if current_user.role not in ["accountant", "admin"]:
        raise HTTPException(
            status_code=403,
            detail="Metrics are only available for accountants"
        )
    
    if administration_id:
        # Verify access to specific administration
        result = await db.execute(
            select(Administration)
            .join(AdministrationMember)
            .where(Administration.id == administration_id)
            .where(AdministrationMember.user_id == current_user.id)
            .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
        )
        administration = result.scalar_one_or_none()
        if not administration:
            raise HTTPException(status_code=404, detail="Client not found or access denied")
    
    metrics_service = MetricsService(db)
    metrics = await metrics_service.get_all_metrics(administration_id)
    
    return metrics


# ============ Alerts Endpoints ============

async def verify_accountant_access(
    current_user: CurrentUser,
    db: AsyncSession,
    administration_id: Optional[UUID] = None,
) -> None:
    """Verify user has accountant access."""
    if current_user.role not in ["accountant", "admin"]:
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only available for accountants"
        )
    
    if administration_id:
        result = await db.execute(
            select(Administration)
            .join(AdministrationMember)
            .where(Administration.id == administration_id)
            .where(AdministrationMember.user_id == current_user.id)
            .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
        )
        administration = result.scalar_one_or_none()
        if not administration:
            raise HTTPException(status_code=404, detail="Client not found or access denied")


@router.get(
    "/alerts",
    response_model=AlertListResponse,
    tags=["alerts"],
    summary="List Alerts",
    description="Get all active alerts, optionally filtered by client and severity."
)
async def list_alerts(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: Optional[UUID] = Query(None, description="Filter by client"),
    severity: Optional[str] = Query(None, description="Filter by severity (CRITICAL, WARNING, INFO)"),
    include_resolved: bool = Query(False, description="Include resolved alerts"),
    limit: int = Query(100, ge=1, le=500),
):
    """List alerts with optional filters."""
    await verify_accountant_access(current_user, db, administration_id)
    
    alert_service = AlertService(db)
    
    severity_filter = None
    if severity:
        try:
            severity_filter = AlertSeverity(severity)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid severity: {severity}")
    
    alerts = await alert_service.get_active_alerts(
        administration_id=administration_id,
        severity=severity_filter,
        limit=limit
    )
    
    # Get counts
    counts = await alert_service.get_alert_counts(administration_id)
    
    return AlertListResponse(
        alerts=[AlertResponse.model_validate(a) for a in alerts],
        total_count=len(alerts),
        active_count=sum(1 for a in alerts if not a.resolved_at),
        acknowledged_count=sum(1 for a in alerts if a.acknowledged_at and not a.resolved_at),
        critical_count=counts["critical"],
        warning_count=counts["warning"],
        info_count=counts["info"],
    )


@router.get(
    "/alerts/grouped",
    response_model=AlertGroupedResponse,
    tags=["alerts"],
    summary="Get Alerts Grouped by Severity",
    description="Get active alerts grouped by severity for dashboard display."
)
async def get_alerts_grouped(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: Optional[UUID] = Query(None, description="Filter by client"),
):
    """Get alerts grouped by severity."""
    await verify_accountant_access(current_user, db, administration_id)
    
    alert_service = AlertService(db)
    
    # Get all active alerts
    alerts = await alert_service.get_active_alerts(administration_id=administration_id)
    
    # Group by severity
    critical = [AlertResponse.model_validate(a) for a in alerts if a.severity == AlertSeverity.CRITICAL]
    warning = [AlertResponse.model_validate(a) for a in alerts if a.severity == AlertSeverity.WARNING]
    info = [AlertResponse.model_validate(a) for a in alerts if a.severity == AlertSeverity.INFO]
    
    return AlertGroupedResponse(
        critical=critical,
        warning=warning,
        info=info,
        counts=AlertCountsResponse(
            critical=len(critical),
            warning=len(warning),
            info=len(info),
            total=len(alerts)
        )
    )


@router.get(
    "/alerts/counts",
    response_model=AlertCountsResponse,
    tags=["alerts"],
    summary="Get Alert Counts",
    description="Get counts of active alerts by severity."
)
async def get_alert_counts(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: Optional[UUID] = Query(None, description="Filter by client"),
):
    """Get alert counts by severity."""
    await verify_accountant_access(current_user, db, administration_id)
    
    alert_service = AlertService(db)
    counts = await alert_service.get_alert_counts(administration_id)
    
    return AlertCountsResponse(**counts)


@router.get(
    "/alerts/{alert_id}",
    response_model=AlertResponse,
    tags=["alerts"],
    summary="Get Alert",
    description="Get a single alert by ID."
)
async def get_alert(
    alert_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a single alert by ID."""
    await verify_accountant_access(current_user, db)
    
    alert_service = AlertService(db)
    alert = await alert_service.get_alert_by_id(alert_id)
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    # Verify access to the alert's administration
    if alert.administration_id:
        await verify_accountant_access(current_user, db, alert.administration_id)
    
    return AlertResponse.model_validate(alert)


@router.post(
    "/alerts/{alert_id}/acknowledge",
    response_model=AlertResponse,
    tags=["alerts"],
    summary="Acknowledge Alert",
    description="Acknowledge an alert. Acknowledged alerts are still active but marked as seen."
)
async def acknowledge_alert(
    alert_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Acknowledge an alert."""
    await verify_accountant_access(current_user, db)
    
    alert_service = AlertService(db)
    alert = await alert_service.get_alert_by_id(alert_id)
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    # Verify access to the alert's administration
    if alert.administration_id:
        await verify_accountant_access(current_user, db, alert.administration_id)
    
    alert = await alert_service.acknowledge_alert(alert_id, current_user.id)
    await db.commit()
    
    return AlertResponse.model_validate(alert)


@router.post(
    "/alerts/{alert_id}/resolve",
    response_model=AlertResponse,
    tags=["alerts"],
    summary="Resolve Alert",
    description="Mark an alert as resolved with optional notes."
)
async def resolve_alert(
    alert_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: ResolveAlertRequest = None,
):
    """Resolve an alert."""
    await verify_accountant_access(current_user, db)
    
    alert_service = AlertService(db)
    alert = await alert_service.get_alert_by_id(alert_id)
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    # Verify access to the alert's administration
    if alert.administration_id:
        await verify_accountant_access(current_user, db, alert.administration_id)
    
    notes = request.notes if request else None
    alert = await alert_service.resolve_alert(alert_id, current_user.id, notes)
    await db.commit()
    
    return AlertResponse.model_validate(alert)


@router.post(
    "/alerts/check/{administration_id}",
    response_model=AlertListResponse,
    tags=["alerts"],
    summary="Run Alert Checks",
    description="Manually trigger all alert checks for a client."
)
async def run_alert_checks(
    administration_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Run all alert checks for a client."""
    await verify_accountant_access(current_user, db, administration_id)
    
    alert_service = AlertService(db)
    new_alerts = await alert_service.run_all_checks(administration_id)
    await db.commit()
    
    # Get counts
    counts = await alert_service.get_alert_counts(administration_id)
    
    return AlertListResponse(
        alerts=[AlertResponse.model_validate(a) for a in new_alerts],
        total_count=len(new_alerts),
        active_count=len(new_alerts),
        acknowledged_count=0,
        critical_count=counts["critical"],
        warning_count=counts["warning"],
        info_count=counts["info"],
    )
