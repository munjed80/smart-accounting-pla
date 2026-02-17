"""
Accountant Client API Endpoints

Provides endpoints for the accountant to manage and view client data:
- Client overview with status counts
- Issues list from consistency engine
- Trigger recalculation/validation
- Financial reports (Balance Sheet, P&L, AR, AP)
"""
from datetime import datetime, timezone, date, timedelta
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.document import Document, DocumentStatus
from app.models.ledger import JournalEntry, JournalEntryStatus
from app.models.subledger import OpenItem, OpenItemStatus
from app.models.issues import ClientIssue, IssueSeverity, ValidationRun
from app.models.audit_log import AuditLog
from app.schemas.issues import (
    ClientOverviewResponse,
    ClientIssueResponse,
    ClientIssuesListResponse,
    RecalculateRequest,
    RecalculateResponse,
    ValidationRunResponse,
)
from app.schemas.reports import (
    BalanceSheetResponse,
    BalanceSheetSectionResponse,
    AccountBalanceResponse,
    ProfitAndLossResponse,
    PnLSectionResponse,
    SubledgerReportResponse,
    OpenItemResponse,
)
from app.schemas.audit import (
    ComprehensiveAuditLogEntry,
    ComprehensiveAuditLogListResponse,
)
from app.services.validation import ConsistencyEngine
from app.services.reports import ReportService
from app.api.v1.deps import CurrentUser, require_assigned_client

router = APIRouter()


@router.get("/clients/{client_id}/overview", response_model=ClientOverviewResponse)
async def get_client_overview(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get high-level status for a client.
    
    Returns counts for:
    - Missing docs
    - Errors
    - Warnings
    - Upcoming deadlines (placeholder)
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    # Count missing/failed documents
    doc_result = await db.execute(
        select(func.count(Document.id))
        .where(Document.administration_id == client_id)
        .where(Document.status == DocumentStatus.FAILED)
    )
    missing_docs_count = doc_result.scalar() or 0
    
    # Count issues by severity
    issues_result = await db.execute(
        select(ClientIssue.severity, func.count(ClientIssue.id))
        .where(ClientIssue.administration_id == client_id)
        .where(ClientIssue.is_resolved == False)
        .group_by(ClientIssue.severity)
    )
    error_count = 0
    warning_count = 0
    for severity, count in issues_result.all():
        if severity == IssueSeverity.RED:
            error_count = count
        elif severity == IssueSeverity.YELLOW:
            warning_count = count
    
    # Count journal entries
    je_result = await db.execute(
        select(JournalEntry.status, func.count(JournalEntry.id))
        .where(JournalEntry.administration_id == client_id)
        .group_by(JournalEntry.status)
    )
    total_entries = 0
    draft_count = 0
    posted_count = 0
    for status, count in je_result.all():
        total_entries += count
        if status == JournalEntryStatus.DRAFT:
            draft_count = count
        elif status == JournalEntryStatus.POSTED:
            posted_count = count
    
    # Sum open receivables and payables
    ar_result = await db.execute(
        select(func.coalesce(func.sum(OpenItem.open_amount), 0))
        .where(OpenItem.administration_id == client_id)
        .where(OpenItem.item_type == "RECEIVABLE")
        .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
    )
    total_receivables = ar_result.scalar() or 0
    
    ap_result = await db.execute(
        select(func.coalesce(func.sum(OpenItem.open_amount), 0))
        .where(OpenItem.administration_id == client_id)
        .where(OpenItem.item_type == "PAYABLE")
        .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
    )
    total_payables = ap_result.scalar() or 0
    
    return ClientOverviewResponse(
        client_id=client_id,
        client_name=administration.name,
        missing_docs_count=missing_docs_count,
        error_count=error_count,
        warning_count=warning_count,
        upcoming_deadlines=[],  # Placeholder for future implementation
        total_journal_entries=total_entries,
        draft_entries_count=draft_count,
        posted_entries_count=posted_count,
        total_open_receivables=total_receivables,
        total_open_payables=total_payables,
    )


@router.get("/clients/{client_id}/issues", response_model=ClientIssuesListResponse)
async def get_client_issues(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    include_resolved: bool = Query(False, description="Include resolved issues"),
):
    """
    Get all issues for a client from the consistency engine.
    
    Each issue includes:
    - Code (e.g., AR_RECON_MISMATCH)
    - Severity (RED/YELLOW)
    - Human-friendly message
    - Why it happened
    - Suggested action
    - References (document_id, journal_entry_id, account_id)
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    # Build query
    query = (
        select(ClientIssue)
        .where(ClientIssue.administration_id == client_id)
    )
    
    if not include_resolved:
        query = query.where(ClientIssue.is_resolved == False)
    
    query = query.order_by(ClientIssue.severity, ClientIssue.created_at.desc())
    
    result = await db.execute(query)
    issues = result.scalars().all()
    
    red_count = sum(1 for i in issues if i.severity == IssueSeverity.RED)
    yellow_count = sum(1 for i in issues if i.severity == IssueSeverity.YELLOW)
    
    return ClientIssuesListResponse(
        client_id=client_id,
        client_name=administration.name,
        total_issues=len(issues),
        red_count=red_count,
        yellow_count=yellow_count,
        issues=[ClientIssueResponse.model_validate(i) for i in issues],
    )


@router.post("/clients/{client_id}/journal/recalculate", response_model=RecalculateResponse)
async def recalculate_journal(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: RecalculateRequest = RecalculateRequest(),
):
    """
    Trigger recalculation/validation for a client.
    
    This is idempotent and safe to run multiple times.
    It runs all consistency checks and updates the issues list.
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    # Check for recent validation run (prevent spam)
    if not request.force:
        result = await db.execute(
            select(ValidationRun)
            .where(ValidationRun.administration_id == client_id)
            .where(ValidationRun.status == "COMPLETED")
            .order_by(ValidationRun.completed_at.desc())
            .limit(1)
        )
        recent_run = result.scalar_one_or_none()
        
        if recent_run and recent_run.completed_at:
            time_since = datetime.now(timezone.utc) - recent_run.completed_at.replace(tzinfo=timezone.utc)
            if time_since < timedelta(minutes=1):
                return RecalculateResponse(
                    success=True,
                    validation_run_id=recent_run.id,
                    issues_found=recent_run.issues_found or 0,
                    message="Recent validation found, returning cached results. Use force=true to rerun.",
                )
    
    # Run validation
    engine = ConsistencyEngine(db, client_id)
    run = await engine.run_full_validation(triggered_by_id=current_user.id)
    
    return RecalculateResponse(
        success=run.status == "COMPLETED",
        validation_run_id=run.id,
        issues_found=run.issues_found or 0,
        message=f"Validation completed. Found {run.issues_found or 0} issues.",
    )


@router.get("/clients/{client_id}/reports/balance-sheet", response_model=BalanceSheetResponse)
async def get_balance_sheet(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    as_of_date: Optional[date] = Query(None, description="Date for the report (default: today)"),
):
    """
    Get Balance Sheet (Activa/Passiva) report for a client.
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    report_date = as_of_date or date.today()
    report_service = ReportService(db, client_id)
    balance_sheet = await report_service.get_balance_sheet(report_date)
    
    # Convert dataclasses to response models
    def convert_accounts(accounts):
        return [
            AccountBalanceResponse(
                account_id=a.account_id,
                account_code=a.account_code,
                account_name=a.account_name,
                account_type=a.account_type,
                debit_total=a.debit_total,
                credit_total=a.credit_total,
                balance=a.balance,
            )
            for a in accounts
        ]
    
    def convert_section(section):
        return BalanceSheetSectionResponse(
            name=section.name,
            accounts=convert_accounts(section.accounts),
            total=section.total,
        )
    
    return BalanceSheetResponse(
        as_of_date=balance_sheet.as_of_date,
        current_assets=convert_section(balance_sheet.current_assets),
        fixed_assets=convert_section(balance_sheet.fixed_assets),
        total_assets=balance_sheet.total_assets,
        current_liabilities=convert_section(balance_sheet.current_liabilities),
        long_term_liabilities=convert_section(balance_sheet.long_term_liabilities),
        equity=convert_section(balance_sheet.equity),
        total_liabilities_equity=balance_sheet.total_liabilities_equity,
        is_balanced=balance_sheet.is_balanced,
    )


@router.get("/clients/{client_id}/reports/pnl", response_model=ProfitAndLossResponse)
async def get_profit_and_loss(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: Optional[date] = Query(None, description="Start date (default: start of year)"),
    end_date: Optional[date] = Query(None, description="End date (default: today)"),
):
    """
    Get Profit & Loss (Winst- en verliesrekening) report for a client.
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    today = date.today()
    report_start = start_date or date(today.year, 1, 1)
    report_end = end_date or today
    
    report_service = ReportService(db, client_id)
    pnl = await report_service.get_profit_and_loss(report_start, report_end)
    
    # Convert dataclasses to response models
    def convert_accounts(accounts):
        return [
            AccountBalanceResponse(
                account_id=a.account_id,
                account_code=a.account_code,
                account_name=a.account_name,
                account_type=a.account_type,
                debit_total=a.debit_total,
                credit_total=a.credit_total,
                balance=a.balance,
            )
            for a in accounts
        ]
    
    def convert_section(section):
        return PnLSectionResponse(
            name=section.name,
            accounts=convert_accounts(section.accounts),
            total=section.total,
        )
    
    return ProfitAndLossResponse(
        start_date=pnl.start_date,
        end_date=pnl.end_date,
        revenue=convert_section(pnl.revenue),
        cost_of_goods_sold=convert_section(pnl.cost_of_goods_sold),
        gross_profit=pnl.gross_profit,
        operating_expenses=convert_section(pnl.operating_expenses),
        operating_income=pnl.operating_income,
        other_income=convert_section(pnl.other_income),
        other_expenses=convert_section(pnl.other_expenses),
        net_income=pnl.net_income,
    )


@router.get("/clients/{client_id}/reports/ar", response_model=SubledgerReportResponse)
async def get_accounts_receivable(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    as_of_date: Optional[date] = Query(None, description="Date for the report (default: today)"),
):
    """
    Get Accounts Receivable (Debiteuren) report for a client.
    
    Shows all open items with aging information.
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    report_service = ReportService(db, client_id)
    report = await report_service.get_accounts_receivable(as_of_date)
    
    return SubledgerReportResponse(
        report_type=report.report_type,
        as_of_date=report.as_of_date,
        items=[
            OpenItemResponse(
                party_id=item.party_id,
                party_name=item.party_name,
                party_code=item.party_code,
                document_number=item.document_number,
                document_date=item.document_date,
                due_date=item.due_date,
                original_amount=item.original_amount,
                paid_amount=item.paid_amount,
                open_amount=item.open_amount,
                days_overdue=item.days_overdue,
                status=item.status,
            )
            for item in report.items
        ],
        total_original=report.total_original,
        total_paid=report.total_paid,
        total_open=report.total_open,
        overdue_amount=report.overdue_amount,
    )


@router.get("/clients/{client_id}/reports/ap", response_model=SubledgerReportResponse)
async def get_accounts_payable(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    as_of_date: Optional[date] = Query(None, description="Date for the report (default: today)"),
):
    """
    Get Accounts Payable (Crediteuren) report for a client.
    
    Shows all open items with aging information.
    """
    administration = await require_assigned_client(client_id, current_user, db)
    
    report_service = ReportService(db, client_id)
    report = await report_service.get_accounts_payable(as_of_date)
    
    return SubledgerReportResponse(
        report_type=report.report_type,
        as_of_date=report.as_of_date,
        items=[
            OpenItemResponse(
                party_id=item.party_id,
                party_name=item.party_name,
                party_code=item.party_code,
                document_number=item.document_number,
                document_date=item.document_date,
                due_date=item.due_date,
                original_amount=item.original_amount,
                paid_amount=item.paid_amount,
                open_amount=item.open_amount,
                days_overdue=item.days_overdue,
                status=item.status,
            )
            for item in report.items
        ],
        total_original=report.total_original,
        total_paid=report.total_paid,
        total_open=report.total_open,
        overdue_amount=report.overdue_amount,
    )


# ============ Comprehensive Audit Log Endpoints ============

@router.get("/clients/{client_id}/audit/logs", response_model=ComprehensiveAuditLogListResponse)
async def get_client_audit_logs(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    date_from: Optional[date] = Query(None, description="Filter by date from (inclusive)"),
    date_to: Optional[date] = Query(None, description="Filter by date to (inclusive)"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type (e.g., 'invoice', 'expense')"),
    entity_id: Optional[UUID] = Query(None, description="Filter by specific entity ID"),
    action: Optional[str] = Query(None, description="Filter by action (e.g., 'create', 'update', 'delete')"),
    user_role: Optional[str] = Query(None, description="Filter by user role (e.g., 'zzp', 'accountant', 'system')"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=100, description="Results per page"),
):
    """
    Get comprehensive audit log entries for a client.
    
    This endpoint provides full audit trail with old_value/new_value diffs
    for all entity changes in the system.
    
    Enforces machtiging/consent via require_assigned_client.
    
    Security:
    - Tenant isolation via client_id filter
    - Never leaks cross-client data
    - Requires active client assignment
    
    Filters:
    - date_from/date_to: Date range filter
    - entity_type: Type of entity (invoice, expense, journal_entry, etc.)
    - entity_id: Specific entity UUID
    - action: Action performed (create, update, delete, validate, finalize)
    - user_role: Role of user who performed action (zzp, accountant, system)
    """
    # Enforce authorization and consent
    await require_assigned_client(client_id, current_user, db)
    
    # Build base query with tenant isolation
    query = (
        select(AuditLog)
        .where(AuditLog.client_id == client_id)
        .order_by(AuditLog.created_at.desc())
    )
    
    # Apply filters
    if date_from:
        query = query.where(func.date(AuditLog.created_at) >= date_from)
    
    if date_to:
        query = query.where(func.date(AuditLog.created_at) <= date_to)
    
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
    
    if action:
        query = query.where(AuditLog.action == action)
    
    if user_role:
        query = query.where(AuditLog.user_role == user_role)
    
    # Get total count for pagination
    count_query = select(func.count(AuditLog.id)).where(AuditLog.client_id == client_id)
    
    if date_from:
        count_query = count_query.where(func.date(AuditLog.created_at) >= date_from)
    if date_to:
        count_query = count_query.where(func.date(AuditLog.created_at) <= date_to)
    if entity_type:
        count_query = count_query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        count_query = count_query.where(AuditLog.entity_id == entity_id)
    if action:
        count_query = count_query.where(AuditLog.action == action)
    if user_role:
        count_query = count_query.where(AuditLog.user_role == user_role)
    
    count_result = await db.execute(count_query)
    total_count = count_result.scalar() or 0
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.limit(page_size).offset(offset)
    
    # Execute query
    result = await db.execute(query)
    entries = result.scalars().all()
    
    return ComprehensiveAuditLogListResponse(
        entries=[
            ComprehensiveAuditLogEntry(
                id=entry.id,
                client_id=entry.client_id,
                entity_type=entry.entity_type,
                entity_id=entry.entity_id,
                action=entry.action,
                user_id=entry.user_id,
                user_role=entry.user_role,
                old_value=entry.old_value,
                new_value=entry.new_value,
                ip_address=entry.ip_address,
                created_at=entry.created_at,
            )
            for entry in entries
        ],
        total_count=total_count,
        page=page,
        page_size=page_size,
    )
