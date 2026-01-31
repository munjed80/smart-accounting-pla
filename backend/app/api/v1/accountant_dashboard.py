"""
Accountant Master Dashboard API Endpoints

Provides endpoints for:
- Dashboard summary aggregation across all assigned clients
- Client list with status cards, filters, and sorting
- Bulk operations execution
- Assignment management
"""
from datetime import datetime, timezone, date
from typing import Annotated, Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.issues import ClientIssue, IssueSeverity
from app.models.accountant_dashboard import (
    AccountantClientAssignment,
    BulkOperation,
    BulkOperationType as ModelBulkOperationType,
    BulkOperationResult,
)
from app.schemas.accountant_dashboard import (
    DashboardSummaryResponse,
    ClientsListResponse,
    ClientStatusCard,
    AlertSeverityCounts,
    VATDeadlineInfo,
    ClientSortField,
    ClientFilterType,
    BulkOperationType,
    BulkOperationStatus,
    BulkOperationRequest,
    BulkRecalculateRequest,
    BulkAckYellowRequest,
    BulkGenerateVatDraftRequest,
    BulkSendRemindersRequest,
    BulkLockPeriodRequest,
    BulkOperationResponse,
    BulkOperationResultItem,
    BulkOperationListResponse,
    AccountantAssignmentCreate,
    AccountantAssignmentByEmailRequest,
    AccountantAssignmentResponse,
    AccountantAssignmentsListResponse,
    AccountantClientListItem,
    AccountantClientListResponse,
)
from app.services.accountant_dashboard import (
    AccountantDashboardService,
    BulkOperationsService,
    DashboardServiceError,
    RateLimitExceededError,
    UnauthorizedClientError,
)
from app.api.v1.deps import CurrentUser, require_accountant

router = APIRouter()


def verify_accountant_role(current_user: User) -> None:
    """
    Verify user has accountant or admin role.
    
    Uses the centralized require_accountant helper for consistent error handling.
    """
    require_accountant(current_user)


# ============ Dashboard Aggregation Endpoints ============

@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get aggregated summary across all clients assigned to this accountant.
    
    Returns:
    - Total clients count
    - Clients with RED issues
    - Clients in REVIEW status
    - Upcoming VAT deadlines (7/14/30 days)
    - Document backlog total
    - Alerts by severity
    """
    verify_accountant_role(current_user)
    
    service = AccountantDashboardService(db, current_user.id)
    summary = await service.get_dashboard_summary()
    
    return DashboardSummaryResponse(
        total_clients=summary["total_clients"],
        clients_with_red_issues=summary["clients_with_red_issues"],
        clients_in_review=summary["clients_in_review"],
        upcoming_vat_deadlines_7d=summary["upcoming_vat_deadlines_7d"],
        upcoming_vat_deadlines_14d=summary["upcoming_vat_deadlines_14d"],
        upcoming_vat_deadlines_30d=summary["upcoming_vat_deadlines_30d"],
        document_backlog_total=summary["document_backlog_total"],
        alerts_by_severity=AlertSeverityCounts(**summary["alerts_by_severity"]),
        vat_deadlines=[
            VATDeadlineInfo(
                client_id=UUID(d["client_id"]),
                client_name=d["client_name"],
                period_name=d["period_name"],
                deadline_date=date.fromisoformat(d["deadline_date"]),
                days_remaining=d["days_remaining"],
                status=d["status"],
            )
            for d in summary["vat_deadlines"]
        ],
        generated_at=summary["generated_at"],
    )


@router.get("/dashboard/clients", response_model=ClientsListResponse)
async def get_dashboard_clients(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    sort: Optional[str] = Query(
        "readiness_score",
        description="Sort field: readiness_score, red_issues, backlog, deadline, name, last_activity"
    ),
    order: Optional[str] = Query(
        "asc",
        description="Sort order: asc or desc"
    ),
    filter: Optional[List[str]] = Query(
        None,
        description="Filter types: has_red, needs_review, deadline_7d, stale_30d"
    ),
):
    """
    Get list of all assigned clients with computed status cards.
    
    Each client includes:
    - Last activity timestamp
    - Open period status
    - RED/YELLOW issue counts
    - Documents needing review
    - VAT deadline info
    - Readiness score (0-100)
    
    Supports sorting by:
    - readiness_score (default)
    - red_issues
    - backlog
    - deadline
    - name
    - last_activity
    
    Supports filtering by:
    - has_red: Only clients with RED issues
    - needs_review: Only clients with documents needing review
    - deadline_7d: Only clients with VAT deadline in 7 days
    - stale_30d: Only clients with no activity in 30 days
    """
    verify_accountant_role(current_user)
    
    service = AccountantDashboardService(db, current_user.id)
    result = await service.get_clients_list(
        sort_by=sort,
        sort_order=order,
        filters=filter,
    )
    
    def safe_parse_datetime(dt_str: str | None) -> datetime | None:
        """Safely parse datetime string, returning None on failure."""
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str)
        except (ValueError, TypeError):
            return None
    
    def safe_parse_date(d_str: str | None) -> date | None:
        """Safely parse date string, returning None on failure."""
        if not d_str:
            return None
        try:
            return date.fromisoformat(d_str)
        except (ValueError, TypeError):
            return None
    
    return ClientsListResponse(
        clients=[
            ClientStatusCard(
                id=UUID(c["id"]),
                name=c["name"],
                kvk_number=c["kvk_number"],
                btw_number=c["btw_number"],
                last_activity_at=safe_parse_datetime(c["last_activity_at"]),
                open_period_status=c["open_period_status"],
                open_period_name=c["open_period_name"],
                red_issue_count=c["red_issue_count"],
                yellow_issue_count=c["yellow_issue_count"],
                documents_needing_review_count=c["documents_needing_review_count"],
                backlog_age_max_days=c["backlog_age_max_days"],
                vat_anomaly_count=c["vat_anomaly_count"],
                next_vat_deadline=safe_parse_date(c["next_vat_deadline"]),
                days_to_vat_deadline=c["days_to_vat_deadline"],
                readiness_score=c["readiness_score"],
                has_critical_alerts=c["has_critical_alerts"],
                needs_immediate_attention=c["needs_immediate_attention"],
            )
            for c in result["clients"]
        ],
        total_count=result["total_count"],
        filtered_count=result["filtered_count"],
        sort_by=result["sort_by"],
        sort_order=result["sort_order"],
        filters_applied=result["filters_applied"],
        generated_at=result["generated_at"],
    )


# ============ Bulk Operations Endpoints ============

def _convert_bulk_operation_to_response(
    op: BulkOperation,
    include_results: bool = True,
) -> BulkOperationResponse:
    """Convert bulk operation model to response schema."""
    results = []
    if include_results and op.results:
        for r in op.results:
            admin_name = r.administration.name if r.administration else "Unknown"
            results.append(BulkOperationResultItem(
                client_id=r.administration_id,
                client_name=admin_name,
                status=r.status,
                result_data=r.result_data,
                error_message=r.error_message,
                processed_at=r.processed_at,
            ))
    
    return BulkOperationResponse(
        id=op.id,
        operation_type=BulkOperationType(op.operation_type.value),
        status=BulkOperationStatus(op.status.value),
        initiated_by_id=op.initiated_by_id,
        initiated_by_name=op.initiated_by.full_name if op.initiated_by else None,
        created_at=op.created_at,
        started_at=op.started_at,
        completed_at=op.completed_at,
        total_clients=op.total_clients or 0,
        processed_clients=op.processed_clients or 0,
        successful_clients=op.successful_clients or 0,
        failed_clients=op.failed_clients or 0,
        error_message=op.error_message,
        results=results,
        message=f"{op.operation_type.value} operation {op.status.value.lower()}",
    )


@router.post("/bulk/recalculate", response_model=BulkOperationResponse)
async def bulk_recalculate(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: BulkRecalculateRequest,
):
    """
    Trigger validation for selected clients or all stale clients.
    
    This operation is:
    - Idempotent (use idempotency_key to prevent duplicates)
    - Rate-limited
    - Fully audited
    
    Options:
    - force: Recalculate even if recently run
    - stale_only: Only recalculate clients with stale validation
    """
    verify_accountant_role(current_user)
    
    service = BulkOperationsService(db, current_user.id)
    
    try:
        filters = request.filters or {}
        if request.stale_only:
            filters["stale"] = True
            filters["stale_days"] = 1  # Stale if validation > 1 day old
        
        op = await service.execute_bulk_recalculate(
            client_ids=request.client_ids,
            filters=filters if filters else None,
            force=request.force,
            stale_only=request.stale_only,
            idempotency_key=request.idempotency_key,
        )
        
        return _convert_bulk_operation_to_response(op)
        
    except RateLimitExceededError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except DashboardServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/bulk/ack-yellow", response_model=BulkOperationResponse)
async def bulk_acknowledge_yellow(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: BulkAckYellowRequest,
):
    """
    Acknowledge selected YELLOW issues across clients.
    
    This operation:
    - Marks YELLOW issues as resolved
    - Can filter by specific issue codes
    - Is idempotent (acknowledging already resolved issues is a no-op)
    """
    verify_accountant_role(current_user)
    
    service = BulkOperationsService(db, current_user.id)
    
    try:
        op = await service.execute_bulk_ack_yellow(
            client_ids=request.client_ids,
            filters=request.filters,
            issue_codes=request.issue_codes,
            notes=request.notes,
            idempotency_key=request.idempotency_key,
        )
        
        return _convert_bulk_operation_to_response(op)
        
    except RateLimitExceededError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except DashboardServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/bulk/generate-vat-draft", response_model=BulkOperationResponse)
async def bulk_generate_vat_draft(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: BulkGenerateVatDraftRequest,
):
    """
    Generate VAT draft reports for selected clients for a specific period.
    
    This operation:
    - Generates draft VAT reports (BTW Aangifte)
    - Identifies anomalies that need review
    - Does not submit to tax authority
    """
    verify_accountant_role(current_user)
    
    service = BulkOperationsService(db, current_user.id)
    
    try:
        op = await service.execute_bulk_generate_vat_draft(
            period_year=request.period_year,
            period_quarter=request.period_quarter,
            client_ids=request.client_ids,
            filters=request.filters,
            idempotency_key=request.idempotency_key,
        )
        
        return _convert_bulk_operation_to_response(op)
        
    except RateLimitExceededError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except DashboardServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/bulk/send-reminders", response_model=BulkOperationResponse)
async def bulk_send_reminders(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: BulkSendRemindersRequest,
):
    """
    Create in-app reminder tasks for selected clients.
    
    This operation:
    - Creates in-app reminders (no email/SMS)
    - Reminders are visible to the client
    - Can include optional due date
    """
    verify_accountant_role(current_user)
    
    service = BulkOperationsService(db, current_user.id)
    
    try:
        op = await service.execute_bulk_send_reminders(
            reminder_type=request.reminder_type,
            title=request.title,
            message=request.message,
            due_date=request.due_date,
            client_ids=request.client_ids,
            filters=request.filters,
            idempotency_key=request.idempotency_key,
        )
        
        return _convert_bulk_operation_to_response(op)
        
    except RateLimitExceededError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except DashboardServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/bulk/lock-period", response_model=BulkOperationResponse)
async def bulk_lock_period(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: BulkLockPeriodRequest,
):
    """
    Lock periods for selected clients (IRREVERSIBLE).
    
    Prerequisites:
    - Period must be FINALIZED
    - Zero RED issues
    - confirm_irreversible must be true
    
    ⚠️ WARNING: This action is IRREVERSIBLE.
    """
    verify_accountant_role(current_user)
    
    service = BulkOperationsService(db, current_user.id)
    
    try:
        op = await service.execute_bulk_lock_period(
            period_year=request.period_year,
            period_quarter=request.period_quarter,
            confirm_irreversible=request.confirm_irreversible,
            client_ids=request.client_ids,
            filters=request.filters,
            idempotency_key=request.idempotency_key,
        )
        
        return _convert_bulk_operation_to_response(op)
        
    except RateLimitExceededError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except DashboardServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/bulk/operations", response_model=BulkOperationListResponse)
async def list_bulk_operations(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100, description="Max results to return"),
    operation_type: Optional[BulkOperationType] = Query(None, description="Filter by operation type"),
):
    """
    List recent bulk operations for this accountant.
    """
    verify_accountant_role(current_user)
    
    service = BulkOperationsService(db, current_user.id)
    
    op_type = None
    if operation_type:
        op_type = ModelBulkOperationType(operation_type.value)
    
    operations = await service.list_bulk_operations(limit=limit, operation_type=op_type)
    
    return BulkOperationListResponse(
        operations=[_convert_bulk_operation_to_response(op, include_results=False) for op in operations],
        total_count=len(operations),
    )


@router.get("/bulk/operations/{operation_id}", response_model=BulkOperationResponse)
async def get_bulk_operation(
    operation_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get details of a specific bulk operation including per-client results.
    """
    verify_accountant_role(current_user)
    
    service = BulkOperationsService(db, current_user.id)
    op = await service.get_bulk_operation(operation_id)
    
    if not op:
        raise HTTPException(status_code=404, detail="Bulk operation not found")
    
    return _convert_bulk_operation_to_response(op, include_results=True)


# ============ Assignment Management Endpoints ============

@router.post("/assignments", response_model=AccountantAssignmentResponse)
async def create_assignment(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: AccountantAssignmentCreate,
):
    """
    Assign an accountant to a client.
    
    Requires admin role.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create assignments")
    
    # Verify accountant exists and is an accountant
    accountant_result = await db.execute(
        select(User).where(User.id == request.accountant_id)
    )
    accountant = accountant_result.scalar_one_or_none()
    
    if not accountant or accountant.role not in ["accountant", "admin"]:
        raise HTTPException(status_code=404, detail="Accountant not found")
    
    # Verify administration exists
    admin_result = await db.execute(
        select(Administration).where(Administration.id == request.administration_id)
    )
    administration = admin_result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(status_code=404, detail="Administration not found")
    
    # Check if assignment already exists
    existing_result = await db.execute(
        select(AccountantClientAssignment)
        .where(AccountantClientAssignment.accountant_id == request.accountant_id)
        .where(AccountantClientAssignment.administration_id == request.administration_id)
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Assignment already exists")
    
    # Create assignment
    assignment = AccountantClientAssignment(
        accountant_id=request.accountant_id,
        administration_id=request.administration_id,
        is_primary=request.is_primary,
        assigned_by_id=current_user.id,
        notes=request.notes,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    
    return AccountantAssignmentResponse(
        id=assignment.id,
        accountant_id=assignment.accountant_id,
        accountant_name=accountant.full_name,
        administration_id=assignment.administration_id,
        administration_name=administration.name,
        is_primary=assignment.is_primary,
        assigned_at=assignment.assigned_at,
        assigned_by_name=current_user.full_name,
        notes=assignment.notes,
    )


@router.get("/assignments", response_model=AccountantAssignmentsListResponse)
async def list_assignments(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    accountant_id: Optional[UUID] = Query(None, description="Filter by accountant ID"),
):
    """
    List accountant-client assignments.
    
    For accountants: returns their own assignments.
    For admins: can filter by accountant_id or see all.
    """
    verify_accountant_role(current_user)
    
    query = select(AccountantClientAssignment).options(
        selectinload(AccountantClientAssignment.accountant),
        selectinload(AccountantClientAssignment.administration),
        selectinload(AccountantClientAssignment.assigned_by),
    )
    
    if current_user.role != "admin":
        # Non-admins can only see their own assignments
        query = query.where(AccountantClientAssignment.accountant_id == current_user.id)
    elif accountant_id:
        query = query.where(AccountantClientAssignment.accountant_id == accountant_id)
    
    result = await db.execute(query.order_by(AccountantClientAssignment.assigned_at.desc()))
    assignments = result.scalars().all()
    
    return AccountantAssignmentsListResponse(
        assignments=[
            AccountantAssignmentResponse(
                id=a.id,
                accountant_id=a.accountant_id,
                accountant_name=a.accountant.full_name if a.accountant else "Unknown",
                administration_id=a.administration_id,
                administration_name=a.administration.name if a.administration else "Unknown",
                is_primary=a.is_primary,
                assigned_at=a.assigned_at,
                assigned_by_name=a.assigned_by.full_name if a.assigned_by else None,
                notes=a.notes,
            )
            for a in assignments
        ],
        total_count=len(assignments),
    )


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Remove an accountant-client assignment.
    
    Accountants can delete their own assignments.
    Admins can delete any assignment.
    """
    verify_accountant_role(current_user)
    
    result = await db.execute(
        select(AccountantClientAssignment)
        .where(AccountantClientAssignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    # Accountants can only delete their own assignments
    if current_user.role != "admin" and assignment.accountant_id != current_user.id:
        raise HTTPException(
            status_code=403, 
            detail={"code": "NOT_ASSIGNMENT_OWNER", "message": "Can only delete your own assignments"}
        )
    
    await db.delete(assignment)
    await db.commit()
    
    return {"message": "Assignment deleted successfully"}


@router.post("/assignments/by-email", response_model=AccountantAssignmentResponse)
async def create_assignment_by_email(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: AccountantAssignmentByEmailRequest,
):
    """
    Assign a client to the current accountant by their email address.
    
    - Finds the user by email
    - User must be a ZZP role user
    - Finds their administration (the accountant will be assigned to it)
    - Creates assignment linking accountant to client's administration
    - Idempotent: if assignment exists, returns existing one
    
    Returns error codes:
    - USER_NOT_FOUND: if no user with that email exists
    - NOT_ZZP_USER: if user exists but is not a ZZP user
    - NO_ADMINISTRATION: if user has no administration
    """
    verify_accountant_role(current_user)
    
    # Find the user by email
    user_result = await db.execute(
        select(User).where(User.email == request.client_email.lower().strip())
    )
    client_user = user_result.scalar_one_or_none()
    
    if not client_user:
        raise HTTPException(
            status_code=404, 
            detail={"code": "USER_NOT_FOUND", "message": f"No user found with email: {request.client_email}"}
        )
    
    # Verify user is a ZZP user
    if client_user.role != "zzp":
        raise HTTPException(
            status_code=400,
            detail={"code": "NOT_ZZP_USER", "message": "This user is not a ZZP client"}
        )
    
    # Find user's administration (they should be owner of at least one)
    admin_member_result = await db.execute(
        select(AdministrationMember)
        .options(selectinload(AdministrationMember.administration))
        .where(AdministrationMember.user_id == client_user.id)
        .where(AdministrationMember.role == MemberRole.OWNER)
        .limit(1)
    )
    admin_member = admin_member_result.scalar_one_or_none()
    
    if not admin_member or not admin_member.administration:
        raise HTTPException(
            status_code=404,
            detail={"code": "NO_ADMINISTRATION", "message": "This user has no administration to assign"}
        )
    
    administration = admin_member.administration
    
    # Check if assignment already exists - return existing if so (idempotent)
    existing_result = await db.execute(
        select(AccountantClientAssignment)
        .where(AccountantClientAssignment.accountant_id == current_user.id)
        .where(AccountantClientAssignment.administration_id == administration.id)
    )
    existing_assignment = existing_result.scalar_one_or_none()
    
    if existing_assignment:
        # Return existing assignment (idempotent)
        return AccountantAssignmentResponse(
            id=existing_assignment.id,
            accountant_id=existing_assignment.accountant_id,
            accountant_name=current_user.full_name,
            administration_id=existing_assignment.administration_id,
            administration_name=administration.name,
            is_primary=existing_assignment.is_primary,
            assigned_at=existing_assignment.assigned_at,
            assigned_by_name=current_user.full_name,
            notes=existing_assignment.notes,
        )
    
    # Create new assignment
    assignment = AccountantClientAssignment(
        accountant_id=current_user.id,
        administration_id=administration.id,
        is_primary=True,
        assigned_by_id=current_user.id,
        notes=f"Self-assigned via email lookup for {request.client_email}",
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    
    return AccountantAssignmentResponse(
        id=assignment.id,
        accountant_id=assignment.accountant_id,
        accountant_name=current_user.full_name,
        administration_id=assignment.administration_id,
        administration_name=administration.name,
        is_primary=assignment.is_primary,
        assigned_at=assignment.assigned_at,
        assigned_by_name=current_user.full_name,
        notes=assignment.notes,
    )


@router.get("/clients", response_model=AccountantClientListResponse)
async def list_assigned_clients(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get list of assigned clients for the current accountant.
    
    Returns:
    - Client user info (id, email, name)
    - Status (active/pending)
    - Last activity timestamp
    - Open RED and YELLOW issue counts
    - Administration info
    """
    verify_accountant_role(current_user)
    
    # Get all assignments for current accountant
    assignments_result = await db.execute(
        select(AccountantClientAssignment)
        .options(selectinload(AccountantClientAssignment.administration))
        .where(AccountantClientAssignment.accountant_id == current_user.id)
        .order_by(AccountantClientAssignment.assigned_at.desc())
    )
    assignments = assignments_result.scalars().all()
    
    clients = []
    for assignment in assignments:
        admin = assignment.administration
        if not admin:
            continue
        
        # Find the owner of this administration (the client)
        owner_result = await db.execute(
            select(AdministrationMember)
            .options(selectinload(AdministrationMember.user))
            .where(AdministrationMember.administration_id == admin.id)
            .where(AdministrationMember.role == MemberRole.OWNER)
            .limit(1)
        )
        owner_member = owner_result.scalar_one_or_none()
        
        if not owner_member or not owner_member.user:
            continue
        
        client_user = owner_member.user
        
        # Get issue counts for this administration
        red_count_result = await db.execute(
            select(func.count(ClientIssue.id))
            .where(ClientIssue.administration_id == admin.id)
            .where(ClientIssue.severity == IssueSeverity.RED)
            .where(ClientIssue.is_resolved == False)
        )
        red_count = red_count_result.scalar() or 0
        
        yellow_count_result = await db.execute(
            select(func.count(ClientIssue.id))
            .where(ClientIssue.administration_id == admin.id)
            .where(ClientIssue.severity == IssueSeverity.YELLOW)
            .where(ClientIssue.is_resolved == False)
        )
        yellow_count = yellow_count_result.scalar() or 0
        
        clients.append(AccountantClientListItem(
            id=client_user.id,
            email=client_user.email,
            name=client_user.full_name,
            status="active",
            last_activity=client_user.last_login_at,
            open_red_count=red_count,
            open_yellow_count=yellow_count,
            administration_id=admin.id,
            administration_name=admin.name,
        ))
    
    return AccountantClientListResponse(
        clients=clients,
        total_count=len(clients),
    )
