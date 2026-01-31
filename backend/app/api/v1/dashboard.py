"""
Accountant Dashboard API Endpoint

This endpoint provides the master dashboard view for accountants managing ZZP clients.

Design principles:
- Error-driven: show problems, not raw data
- All clients in one screen
- Status-based prioritization (RED > YELLOW > GREEN)
- Accountant only needs to click when there's a problem
"""
from datetime import datetime, timezone, date, timedelta
from typing import Annotated, List
from uuid import UUID
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.document import Document, DocumentStatus
from app.models.transaction import Transaction, TransactionStatus
from app.models.user import User
from app.models.accountant_dashboard import AccountantClientAssignment
from app.schemas.dashboard import (
    ClientStatus,
    BTWQuarterStatus,
    IssueSeverity,
    IssueCategory,
    DashboardIssue,
    ClientOverview,
    AccountantDashboardResponse,
    ClientIssuesResponse,
)
from app.api.v1.deps import CurrentUser, require_accountant

router = APIRouter()


def ensure_utc(dt: datetime) -> datetime:
    """Ensure datetime has UTC timezone, adding it if missing."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def get_current_quarter() -> tuple[str, date, date]:
    """Get current quarter string and date range."""
    today = datetime.now(timezone.utc).date()
    quarter = (today.month - 1) // 3 + 1
    year = today.year
    
    # Quarter start/end dates
    quarter_start_month = (quarter - 1) * 3 + 1
    quarter_start = date(year, quarter_start_month, 1)
    
    if quarter == 4:
        quarter_end = date(year, 12, 31)
    else:
        next_quarter_month = quarter_start_month + 3
        quarter_end = date(year, next_quarter_month, 1)
    
    return f"Q{quarter} {year}", quarter_start, quarter_end


def calculate_btw_status(
    quarter_end: date,
    has_pending_docs: bool,
    has_errors: bool
) -> BTWQuarterStatus:
    """
    Calculate BTW quarter status based on deadline proximity and document state.
    
    Dutch BTW deadlines: quarterly filing due within 1 month after quarter end
    """
    today = datetime.now(timezone.utc).date()
    
    # BTW deadline is typically 1 month after quarter end
    # For Q1 (Jan-Mar), deadline is end of April
    btw_deadline_month = quarter_end.month + 1 if quarter_end.month < 12 else 1
    btw_deadline_year = quarter_end.year if quarter_end.month < 12 else quarter_end.year + 1
    
    # Last day of deadline month
    if btw_deadline_month == 12:
        btw_deadline = date(btw_deadline_year, 12, 31)
    else:
        btw_deadline = date(btw_deadline_year, btw_deadline_month + 1, 1)
        btw_deadline = btw_deadline - timedelta(days=1)
    
    if has_errors:
        return BTWQuarterStatus.OVERDUE
    
    if today > btw_deadline:
        return BTWQuarterStatus.OVERDUE
    
    days_until_deadline = (btw_deadline - today).days
    
    if days_until_deadline <= 14 and has_pending_docs:
        return BTWQuarterStatus.DEADLINE_APPROACHING
    
    if has_pending_docs:
        return BTWQuarterStatus.PENDING_DOCS
    
    return BTWQuarterStatus.ON_TRACK


def calculate_client_status(
    error_count: int,
    warning_count: int,
    btw_status: BTWQuarterStatus
) -> ClientStatus:
    """
    Calculate client status based on error-driven logic.
    
    RED: Immediate action required
    - Any errors present
    - BTW is overdue
    
    YELLOW: Attention soon
    - Warnings present
    - BTW deadline approaching
    - Pending docs
    
    GREEN: No action required
    """
    # RED conditions
    if error_count > 0:
        return ClientStatus.RED
    if btw_status == BTWQuarterStatus.OVERDUE:
        return ClientStatus.RED
    
    # YELLOW conditions
    if warning_count > 0:
        return ClientStatus.YELLOW
    if btw_status == BTWQuarterStatus.DEADLINE_APPROACHING:
        return ClientStatus.YELLOW
    if btw_status == BTWQuarterStatus.PENDING_DOCS:
        return ClientStatus.YELLOW
    
    return ClientStatus.GREEN


async def build_client_issues(
    administration: Administration,
    documents: List[Document],
    transactions: List[Transaction],
    db: AsyncSession,
) -> List[DashboardIssue]:
    """
    Build list of issues for a client based on their data.
    
    Each issue includes:
    - What is wrong
    - Why it is wrong
    - Suggested next action
    """
    issues = []
    now = datetime.now(timezone.utc)
    
    # Check for failed documents
    failed_docs = [d for d in documents if d.status == DocumentStatus.FAILED]
    for doc in failed_docs:
        issues.append(DashboardIssue(
            id=f"doc-failed-{doc.id}",
            category=IssueCategory.PROCESSING_ERROR,
            severity=IssueSeverity.ERROR,
            title=f"Document processing failed: {doc.original_filename}",
            description=doc.error_message or "Document could not be processed. This may be due to an unreadable format or system error.",
            suggested_action="Review the document and try reprocessing. If the issue persists, upload a clearer version.",
            related_entity_id=doc.id,
            related_entity_type="document",
            created_at=doc.updated_at or doc.created_at,
        ))
    
    # Check for documents stuck in PROCESSING for too long (> 5 minutes)
    processing_docs = [d for d in documents if d.status == DocumentStatus.PROCESSING]
    for doc in processing_docs:
        doc_updated = ensure_utc(doc.updated_at) if doc.updated_at else ensure_utc(doc.created_at)
        time_diff = now - doc_updated
        if time_diff.total_seconds() > 300:  # 5 minutes
            issues.append(DashboardIssue(
                id=f"doc-stuck-{doc.id}",
                category=IssueCategory.PROCESSING_ERROR,
                severity=IssueSeverity.WARNING,
                title=f"Document processing stalled: {doc.original_filename}",
                description="Document has been processing for an unusually long time. The system may have encountered an issue.",
                suggested_action="Try reprocessing the document. If the issue persists, check system status.",
                related_entity_id=doc.id,
                related_entity_type="document",
                created_at=doc.updated_at or doc.created_at,
            ))
    
    # Check for draft transactions pending review
    draft_transactions = [t for t in transactions if t.status == TransactionStatus.DRAFT]
    if len(draft_transactions) > 0:
        # Group by age
        old_drafts = [t for t in draft_transactions if (now - ensure_utc(t.created_at)).days > 7]
        
        if len(old_drafts) > 0:
            issues.append(DashboardIssue(
                id=f"drafts-old-{administration.id}",
                category=IssueCategory.DRAFT_PENDING,
                severity=IssueSeverity.WARNING,
                title=f"{len(old_drafts)} draft transaction(s) pending for over a week",
                description="These transactions have been awaiting review for more than 7 days. Delayed posting can affect financial accuracy.",
                suggested_action="Review and post these draft transactions or reject if they are incorrect.",
                related_entity_id=None,
                related_entity_type=None,
                created_at=min(t.created_at for t in old_drafts),
            ))
        elif len(draft_transactions) > 3:
            issues.append(DashboardIssue(
                id=f"drafts-multiple-{administration.id}",
                category=IssueCategory.DRAFT_PENDING,
                severity=IssueSeverity.INFO,
                title=f"{len(draft_transactions)} draft transactions awaiting review",
                description="Multiple transactions are pending review. Regularly posting transactions keeps records up to date.",
                suggested_action="Review draft transactions and post or reject as appropriate.",
                related_entity_id=None,
                related_entity_type=None,
                created_at=min(t.created_at for t in draft_transactions),
            ))
    
    # Check for low confidence transactions
    low_confidence = [t for t in draft_transactions if t.ai_confidence_score is not None and t.ai_confidence_score < 70]
    for t in low_confidence:
        issues.append(DashboardIssue(
            id=f"low-confidence-{t.id}",
            category=IssueCategory.LOW_CONFIDENCE,
            severity=IssueSeverity.WARNING,
            title=f"Low confidence transaction: {t.booking_number}",
            description=f"AI confidence is {t.ai_confidence_score}%. This transaction may have incorrect account assignments or amounts.",
            suggested_action="Carefully review this transaction's line items and account assignments before posting.",
            related_entity_id=t.id,
            related_entity_type="transaction",
            created_at=t.created_at,
        ))
    
    return issues


@router.get("/dashboard", response_model=AccountantDashboardResponse)
async def get_accountant_dashboard(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the accountant master dashboard.
    
    This endpoint is ONLY for accountants. It provides:
    - All clients in one view
    - Error-driven status indicators
    - Issues requiring attention
    
    Clients are sorted by status: RED first, then YELLOW, then GREEN.
    """
    # Verify user is an accountant
    require_accountant(current_user)
    
    # Get administrations via direct membership
    member_result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == current_user.id)
        .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
        .where(Administration.is_active == True)
        .options(
            selectinload(Administration.documents),
            selectinload(Administration.transactions),
        )
    )
    member_administrations = member_result.scalars().all()
    
    # Also get administrations via AccountantClientAssignment
    assignment_result = await db.execute(
        select(Administration)
        .join(AccountantClientAssignment, AccountantClientAssignment.administration_id == Administration.id)
        .where(AccountantClientAssignment.accountant_id == current_user.id)
        .where(Administration.is_active == True)
        .options(
            selectinload(Administration.documents),
            selectinload(Administration.transactions),
        )
    )
    assigned_administrations = assignment_result.scalars().all()
    
    # Combine and deduplicate
    admin_ids_seen = set()
    administrations = []
    for admin in list(member_administrations) + list(assigned_administrations):
        if admin.id not in admin_ids_seen:
            admin_ids_seen.add(admin.id)
            administrations.append(admin)
    
    # Sort by name
    administrations.sort(key=lambda a: a.name)
    
    # Build client overviews
    clients = []
    current_quarter, quarter_start, quarter_end = get_current_quarter()
    
    for admin in administrations:
        # Build issues for this client
        issues = await build_client_issues(admin, admin.documents, admin.transactions, db)
        
        # Count errors and warnings
        error_count = sum(1 for i in issues if i.severity == IssueSeverity.ERROR)
        warning_count = sum(1 for i in issues if i.severity == IssueSeverity.WARNING)
        
        # Calculate BTW status
        has_pending_docs = any(
            d.status in [DocumentStatus.UPLOADED, DocumentStatus.PROCESSING]
            for d in admin.documents
        )
        has_errors = any(d.status == DocumentStatus.FAILED for d in admin.documents)
        btw_status = calculate_btw_status(quarter_end, has_pending_docs, has_errors)
        
        # Calculate overall status
        status = calculate_client_status(error_count, warning_count, btw_status)
        
        # Get last document upload
        last_upload = None
        if admin.documents:
            last_upload = max(d.created_at for d in admin.documents)
        
        # Count transactions
        total_transactions = len(admin.transactions)
        draft_transactions = sum(1 for t in admin.transactions if t.status == TransactionStatus.DRAFT)
        failed_documents = sum(1 for d in admin.documents if d.status == DocumentStatus.FAILED)
        
        # Take top 3 issues for overview (sorted by severity)
        severity_order = {IssueSeverity.ERROR: 0, IssueSeverity.WARNING: 1, IssueSeverity.INFO: 2}
        sorted_issues = sorted(issues, key=lambda i: severity_order[i.severity])
        top_issues = sorted_issues[:3]
        
        clients.append(ClientOverview(
            id=admin.id,
            name=admin.name,
            kvk_number=admin.kvk_number,
            btw_number=admin.btw_number,
            status=status,
            last_document_upload=last_upload,
            btw_quarter_status=btw_status,
            current_quarter=current_quarter,
            error_count=error_count,
            warning_count=warning_count,
            issues=top_issues,
            total_transactions=total_transactions,
            draft_transactions=draft_transactions,
            failed_documents=failed_documents,
        ))
    
    # Sort clients: RED first, then YELLOW, then GREEN
    status_order = {ClientStatus.RED: 0, ClientStatus.YELLOW: 1, ClientStatus.GREEN: 2}
    clients.sort(key=lambda c: (status_order[c.status], c.name))
    
    # Calculate summary stats
    total_clients = len(clients)
    clients_with_errors = sum(1 for c in clients if c.status == ClientStatus.RED)
    clients_needing_attention = sum(1 for c in clients if c.status in [ClientStatus.RED, ClientStatus.YELLOW])
    
    return AccountantDashboardResponse(
        total_clients=total_clients,
        clients_needing_attention=clients_needing_attention,
        clients_with_errors=clients_with_errors,
        clients=clients,
        global_issues=[],
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/dashboard/client/{client_id}/issues", response_model=ClientIssuesResponse)
async def get_client_issues(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get all issues for a specific client.
    
    This provides the full list of issues (not just top 3 from overview).
    """
    # Verify user is an accountant
    require_accountant(current_user)
    
    # Check via direct membership first
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(Administration.id == client_id)
        .where(AdministrationMember.user_id == current_user.id)
        .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
        .options(
            selectinload(Administration.documents),
            selectinload(Administration.transactions),
        )
    )
    administration = result.scalar_one_or_none()
    
    # Also check via assignment
    if not administration:
        assignment_result = await db.execute(
            select(Administration)
            .join(AccountantClientAssignment, AccountantClientAssignment.administration_id == Administration.id)
            .where(Administration.id == client_id)
            .where(AccountantClientAssignment.accountant_id == current_user.id)
            .options(
                selectinload(Administration.documents),
                selectinload(Administration.transactions),
            )
        )
        administration = assignment_result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(status_code=404, detail="Client not found or access denied")
    
    # Build all issues
    issues = await build_client_issues(
        administration,
        administration.documents,
        administration.transactions,
        db
    )
    
    # Sort by severity
    severity_order = {IssueSeverity.ERROR: 0, IssueSeverity.WARNING: 1, IssueSeverity.INFO: 2}
    issues.sort(key=lambda i: severity_order[i.severity])
    
    return ClientIssuesResponse(
        client_id=client_id,
        client_name=administration.name,
        total_issues=len(issues),
        issues=issues,
    )
