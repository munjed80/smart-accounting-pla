"""
Accountant Dashboard Service

Service layer for:
- Dashboard aggregation across multiple clients
- Bulk operations execution
- Rate limiting and audit logging
"""
import logging
import uuid
import hashlib
from datetime import datetime, timezone, date, timedelta
from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal
from sqlalchemy import select, func, and_, or_, case, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.document import Document, DocumentStatus
from app.models.ledger import AccountingPeriod, PeriodStatus, JournalEntry, JournalEntryStatus
from app.models.issues import ClientIssue, IssueSeverity, ValidationRun
from app.models.alerts import Alert, AlertSeverity, AlertCode
from app.models.accountant_dashboard import (
    AccountantClientAssignment, 
    BulkOperation, 
    BulkOperationType,
    BulkOperationStatus,
    BulkOperationResult,
    ClientReminder,
)
from app.services.validation import ConsistencyEngine
from app.services.vat.report import VatReportService
from app.services.period import PeriodControlService


logger = logging.getLogger(__name__)


class DashboardServiceError(Exception):
    """Base exception for dashboard service operations."""
    pass


class RateLimitExceededError(DashboardServiceError):
    """Raised when rate limit is exceeded."""
    pass


class UnauthorizedClientError(DashboardServiceError):
    """Raised when trying to access unassigned client."""
    pass


class AccountantDashboardService:
    """
    Service for accountant master dashboard aggregation.
    
    Key features:
    - Efficient SQL aggregation (no N+1 queries)
    - Multi-tenant safe (only assigned clients)
    - Caching-friendly design
    """
    
    def __init__(self, db: AsyncSession, accountant_id: uuid.UUID):
        self.db = db
        self.accountant_id = accountant_id
    
    async def get_assigned_client_ids(self) -> List[uuid.UUID]:
        """Get all client IDs assigned to this accountant."""
        # First check explicit assignments
        result = await self.db.execute(
            select(AccountantClientAssignment.administration_id)
            .where(AccountantClientAssignment.accountant_id == self.accountant_id)
        )
        assigned_ids = [r[0] for r in result.all()]
        
        # Also include clients where accountant is a member with appropriate role
        member_result = await self.db.execute(
            select(AdministrationMember.administration_id)
            .where(AdministrationMember.user_id == self.accountant_id)
            .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
        )
        member_ids = [r[0] for r in member_result.all()]
        
        # Combine and deduplicate
        all_ids = list(set(assigned_ids + member_ids))
        return all_ids
    
    async def verify_client_access(self, client_id: uuid.UUID) -> bool:
        """Verify accountant has access to a specific client."""
        assigned_ids = await self.get_assigned_client_ids()
        return client_id in assigned_ids
    
    async def get_dashboard_summary(self) -> Dict[str, Any]:
        """
        Get aggregated dashboard summary across all assigned clients.
        
        Uses efficient SQL aggregation to avoid N+1 queries.
        """
        client_ids = await self.get_assigned_client_ids()
        
        if not client_ids:
            return {
                "total_clients": 0,
                "clients_with_red_issues": 0,
                "clients_in_review": 0,
                "upcoming_vat_deadlines_7d": 0,
                "upcoming_vat_deadlines_14d": 0,
                "upcoming_vat_deadlines_30d": 0,
                "document_backlog_total": 0,
                "alerts_by_severity": {"critical": 0, "warning": 0, "info": 0},
                "vat_deadlines": [],
                "generated_at": datetime.now(timezone.utc),
            }
        
        total_clients = len(client_ids)
        
        # Count clients with RED issues
        red_issues_result = await self.db.execute(
            select(func.count(func.distinct(ClientIssue.administration_id)))
            .where(ClientIssue.administration_id.in_(client_ids))
            .where(ClientIssue.severity == IssueSeverity.RED)
            .where(ClientIssue.is_resolved == False)
        )
        clients_with_red = red_issues_result.scalar() or 0
        
        # Count clients in REVIEW status
        review_result = await self.db.execute(
            select(func.count(func.distinct(AccountingPeriod.administration_id)))
            .where(AccountingPeriod.administration_id.in_(client_ids))
            .where(AccountingPeriod.status == PeriodStatus.REVIEW)
        )
        clients_in_review = review_result.scalar() or 0
        
        # Document backlog (NEEDS_REVIEW status)
        try:
            doc_backlog_result = await self.db.execute(
                select(func.count(Document.id))
                .where(Document.administration_id.in_(client_ids))
                .where(Document.status == DocumentStatus.NEEDS_REVIEW)
            )
            document_backlog_total = doc_backlog_result.scalar() or 0
        except Exception as exc:
            # Defensive: if the database enum is missing NEEDS_REVIEW (production mismatch) or any other
            # unexpected error occurs, do not crash the dashboard. Return a safe default and warn.
            logger.warning(
                "Accountant dashboard backlog query failed; returning 0. error=%s", exc
            )
            document_backlog_total = 0
        
        # Alert counts by severity
        alerts_result = await self.db.execute(
            select(Alert.severity, func.count(Alert.id))
            .where(or_(
                Alert.administration_id.in_(client_ids),
                Alert.administration_id.is_(None)
            ))
            .where(Alert.resolved_at.is_(None))
            .group_by(Alert.severity)
        )
        alerts_by_severity = {"critical": 0, "warning": 0, "info": 0}
        for severity, count in alerts_result.all():
            if severity == AlertSeverity.CRITICAL:
                alerts_by_severity["critical"] = count
            elif severity == AlertSeverity.WARNING:
                alerts_by_severity["warning"] = count
            elif severity == AlertSeverity.INFO:
                alerts_by_severity["info"] = count
        
        # Calculate VAT deadlines
        today = date.today()
        vat_deadlines = await self._get_vat_deadlines(client_ids, today)
        
        upcoming_7d = sum(1 for d in vat_deadlines if d["days_remaining"] <= 7)
        upcoming_14d = sum(1 for d in vat_deadlines if d["days_remaining"] <= 14)
        upcoming_30d = sum(1 for d in vat_deadlines if d["days_remaining"] <= 30)
        
        return {
            "total_clients": total_clients,
            "clients_with_red_issues": clients_with_red,
            "clients_in_review": clients_in_review,
            "upcoming_vat_deadlines_7d": upcoming_7d,
            "upcoming_vat_deadlines_14d": upcoming_14d,
            "upcoming_vat_deadlines_30d": upcoming_30d,
            "document_backlog_total": document_backlog_total,
            "alerts_by_severity": alerts_by_severity,
            "vat_deadlines": vat_deadlines[:10],  # Top 10 nearest deadlines
            "generated_at": datetime.now(timezone.utc),
        }
    
    async def _get_vat_deadlines(
        self, 
        client_ids: List[uuid.UUID], 
        today: date
    ) -> List[Dict[str, Any]]:
        """Calculate upcoming VAT deadlines for clients."""
        deadlines = []
        
        # Get open periods for each client
        result = await self.db.execute(
            select(AccountingPeriod, Administration)
            .join(Administration, AccountingPeriod.administration_id == Administration.id)
            .where(AccountingPeriod.administration_id.in_(client_ids))
            .where(AccountingPeriod.status.in_([PeriodStatus.OPEN, PeriodStatus.REVIEW]))
            .order_by(AccountingPeriod.end_date)
        )
        
        for period, admin in result.all():
            # Dutch VAT deadline: last day of the month following the quarter end
            # Use calendar module for proper month end calculation
            import calendar
            deadline_year = period.end_date.year
            deadline_month = period.end_date.month + 1
            
            if deadline_month > 12:
                deadline_month = 1
                deadline_year += 1
            
            # Get last day of the deadline month (handles leap years correctly)
            last_day = calendar.monthrange(deadline_year, deadline_month)[1]
            deadline = date(deadline_year, deadline_month, last_day)
            
            days_remaining = (deadline - today).days
            
            if days_remaining >= 0:  # Only future/today deadlines
                status = "ON_TRACK"
                if days_remaining <= 7:
                    status = "APPROACHING"
                elif days_remaining < 0:
                    status = "OVERDUE"
                
                deadlines.append({
                    "client_id": str(admin.id),
                    "client_name": admin.name,
                    "period_name": period.name,
                    "deadline_date": deadline.isoformat(),
                    "days_remaining": days_remaining,
                    "status": status,
                })
        
        # Sort by days remaining
        deadlines.sort(key=lambda x: x["days_remaining"])
        return deadlines
    
    async def get_clients_list(
        self,
        sort_by: str = "readiness_score",
        sort_order: str = "asc",
        filters: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Get list of clients with computed status cards.
        
        Supports sorting and filtering for efficient work queue management.
        """
        client_ids = await self.get_assigned_client_ids()
        
        if not client_ids:
            return {
                "clients": [],
                "total_count": 0,
                "filtered_count": 0,
                "sort_by": sort_by,
                "sort_order": sort_order,
                "filters_applied": filters or [],
                "generated_at": datetime.now(timezone.utc),
            }
        
        # Build client status cards
        clients = await self._build_client_status_cards(client_ids)
        
        # Apply filters
        filtered_clients = clients
        applied_filters = []
        
        if filters:
            for filter_type in filters:
                if filter_type == "has_red":
                    filtered_clients = [c for c in filtered_clients if c["red_issue_count"] > 0]
                    applied_filters.append("has_red")
                elif filter_type == "needs_review":
                    filtered_clients = [c for c in filtered_clients if c["documents_needing_review_count"] > 0]
                    applied_filters.append("needs_review")
                elif filter_type == "deadline_7d":
                    filtered_clients = [c for c in filtered_clients 
                                       if c["days_to_vat_deadline"] is not None and c["days_to_vat_deadline"] <= 7]
                    applied_filters.append("deadline_7d")
                elif filter_type == "stale_30d":
                    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
                    filtered_clients = [c for c in filtered_clients 
                                       if c["last_activity_at"] is None or c["last_activity_at"] < thirty_days_ago]
                    applied_filters.append("stale_30d")
        
        # Apply sorting
        reverse = sort_order.lower() == "desc"
        
        if sort_by == "readiness_score":
            filtered_clients.sort(key=lambda x: x["readiness_score"], reverse=reverse)
        elif sort_by == "red_issues":
            filtered_clients.sort(key=lambda x: x["red_issue_count"], reverse=reverse)
        elif sort_by == "backlog":
            filtered_clients.sort(key=lambda x: x["documents_needing_review_count"], reverse=reverse)
        elif sort_by == "deadline":
            filtered_clients.sort(
                key=lambda x: x["days_to_vat_deadline"] if x["days_to_vat_deadline"] is not None else 9999,
                reverse=reverse
            )
        elif sort_by == "last_activity":
            filtered_clients.sort(
                key=lambda x: x["last_activity_at"] if x["last_activity_at"] else datetime.min.replace(tzinfo=timezone.utc),
                reverse=reverse
            )
        elif sort_by == "name":
            filtered_clients.sort(key=lambda x: x["name"].lower(), reverse=reverse)
        
        return {
            "clients": filtered_clients,
            "total_count": len(clients),
            "filtered_count": len(filtered_clients),
            "sort_by": sort_by,
            "sort_order": sort_order,
            "filters_applied": applied_filters,
            "generated_at": datetime.now(timezone.utc),
        }
    
    async def _build_client_status_cards(
        self, 
        client_ids: List[uuid.UUID]
    ) -> List[Dict[str, Any]]:
        """Build status cards for all clients using efficient aggregation."""
        cards = []
        today = date.today()
        
        # Get all administrations
        admins_result = await self.db.execute(
            select(Administration)
            .where(Administration.id.in_(client_ids))
            .where(Administration.is_active == True)
        )
        administrations = admins_result.scalars().all()
        
        # Aggregate issue counts per client
        issues_result = await self.db.execute(
            select(
                ClientIssue.administration_id,
                ClientIssue.severity,
                func.count(ClientIssue.id)
            )
            .where(ClientIssue.administration_id.in_(client_ids))
            .where(ClientIssue.is_resolved == False)
            .group_by(ClientIssue.administration_id, ClientIssue.severity)
        )
        issue_counts = {}
        for admin_id, severity, count in issues_result.all():
            if admin_id not in issue_counts:
                issue_counts[admin_id] = {"red": 0, "yellow": 0}
            if severity == IssueSeverity.RED:
                issue_counts[admin_id]["red"] = count
            elif severity == IssueSeverity.YELLOW:
                issue_counts[admin_id]["yellow"] = count
        
        # Aggregate document counts per client
        docs_result = await self.db.execute(
            select(
                Document.administration_id,
                func.count(Document.id),
                func.min(Document.created_at)
            )
            .where(Document.administration_id.in_(client_ids))
            .where(Document.status == DocumentStatus.NEEDS_REVIEW)
            .group_by(Document.administration_id)
        )
        doc_counts = {}
        for admin_id, count, oldest in docs_result.all():
            days_old = None
            if oldest:
                oldest_utc = oldest if oldest.tzinfo else oldest.replace(tzinfo=timezone.utc)
                days_old = (datetime.now(timezone.utc) - oldest_utc).days
            doc_counts[admin_id] = {"count": count, "oldest_days": days_old}
        
        # Get open period status per client
        periods_result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.administration_id.in_(client_ids))
            .where(AccountingPeriod.status.in_([PeriodStatus.OPEN, PeriodStatus.REVIEW]))
            .order_by(AccountingPeriod.end_date.desc())
        )
        period_info = {}
        for period in periods_result.scalars().all():
            if period.administration_id not in period_info:
                # Calculate VAT deadline
                if period.end_date.month == 12:
                    deadline = date(period.end_date.year + 1, 1, 31)
                else:
                    next_month = period.end_date.month + 1
                    if next_month == 12:
                        deadline = date(period.end_date.year, 12, 31)
                    elif next_month == 2:
                        deadline = date(period.end_date.year, 2, 28)
                    else:
                        deadline = date(period.end_date.year, next_month + 1, 1) - timedelta(days=1)
                
                period_info[period.administration_id] = {
                    "status": period.status.value,
                    "name": period.name,
                    "vat_deadline": deadline,
                    "days_to_deadline": (deadline - today).days,
                }
        
        # Get last activity per client (most recent journal entry or document)
        activity_result = await self.db.execute(
            select(
                JournalEntry.administration_id,
                func.max(JournalEntry.created_at)
            )
            .where(JournalEntry.administration_id.in_(client_ids))
            .group_by(JournalEntry.administration_id)
        )
        last_activity = {r[0]: r[1] for r in activity_result.all()}
        
        # Get alert counts per client
        alerts_result = await self.db.execute(
            select(
                Alert.administration_id,
                func.count(case((Alert.severity == AlertSeverity.CRITICAL, 1)))
            )
            .where(Alert.administration_id.in_(client_ids))
            .where(Alert.resolved_at.is_(None))
            .group_by(Alert.administration_id)
        )
        critical_alerts = {r[0]: r[1] for r in alerts_result.all()}
        
        # Build cards
        for admin in administrations:
            admin_id = admin.id
            
            red_count = issue_counts.get(admin_id, {}).get("red", 0)
            yellow_count = issue_counts.get(admin_id, {}).get("yellow", 0)
            doc_info = doc_counts.get(admin_id, {"count": 0, "oldest_days": None})
            period = period_info.get(admin_id, {})
            activity = last_activity.get(admin_id)
            has_critical = critical_alerts.get(admin_id, 0) > 0
            
            # Calculate readiness score (0-100)
            # Higher score = more ready, lower score = needs more attention
            score = 100
            
            # Deduct for RED issues (major penalty)
            score -= min(red_count * 20, 60)
            
            # Deduct for YELLOW issues (minor penalty)
            score -= min(yellow_count * 5, 20)
            
            # Deduct for document backlog
            score -= min(doc_info["count"] * 3, 15)
            
            # Deduct for critical alerts
            if has_critical:
                score -= 20
            
            # Deduct for approaching deadline
            days_to_deadline = period.get("days_to_deadline")
            if days_to_deadline is not None and days_to_deadline <= 7:
                score -= 15
            elif days_to_deadline is not None and days_to_deadline <= 14:
                score -= 10
            
            # Ensure score is in range
            score = max(0, min(100, score))
            
            # Convert activity to timezone-aware if needed
            activity_aware = None
            if activity:
                activity_aware = activity if activity.tzinfo else activity.replace(tzinfo=timezone.utc)
            
            card = {
                "id": str(admin_id),
                "name": admin.name,
                "kvk_number": admin.kvk_number,
                "btw_number": admin.btw_number,
                "last_activity_at": activity_aware.isoformat() if activity_aware else None,
                "open_period_status": period.get("status"),
                "open_period_name": period.get("name"),
                "red_issue_count": red_count,
                "yellow_issue_count": yellow_count,
                "documents_needing_review_count": doc_info["count"],
                "backlog_age_max_days": doc_info["oldest_days"],
                "vat_anomaly_count": 0,  # Would need separate VAT anomaly tracking
                "next_vat_deadline": period.get("vat_deadline", "").isoformat() if period.get("vat_deadline") else None,
                "days_to_vat_deadline": days_to_deadline,
                "readiness_score": score,
                "has_critical_alerts": has_critical,
                "needs_immediate_attention": red_count > 0 or has_critical or (days_to_deadline is not None and days_to_deadline <= 3),
            }
            cards.append(card)
        
        return cards


class BulkOperationsService:
    """
    Service for executing bulk operations across multiple clients.
    
    Key features:
    - Idempotent operations (duplicate detection via idempotency_key)
    - Rate limiting to prevent abuse
    - Full audit logging
    - Multi-tenant safety (only processes assigned clients)
    """
    
    # Rate limit: max operations per minute
    RATE_LIMIT_WINDOW_SECONDS = 60
    RATE_LIMIT_MAX_OPERATIONS = 5
    
    def __init__(self, db: AsyncSession, accountant_id: uuid.UUID):
        self.db = db
        self.accountant_id = accountant_id
        self.dashboard_service = AccountantDashboardService(db, accountant_id)
    
    async def check_rate_limit(self) -> bool:
        """Check if rate limit allows new operation."""
        window_start = datetime.now(timezone.utc) - timedelta(seconds=self.RATE_LIMIT_WINDOW_SECONDS)
        
        result = await self.db.execute(
            select(func.count(BulkOperation.id))
            .where(BulkOperation.initiated_by_id == self.accountant_id)
            .where(BulkOperation.created_at >= window_start)
        )
        count = result.scalar() or 0
        
        return count < self.RATE_LIMIT_MAX_OPERATIONS
    
    async def check_idempotency(self, idempotency_key: str) -> Optional[BulkOperation]:
        """Check if operation with this key already exists."""
        if not idempotency_key:
            return None
        
        result = await self.db.execute(
            select(BulkOperation)
            .where(BulkOperation.idempotency_key == idempotency_key)
        )
        return result.scalar_one_or_none()
    
    async def get_target_clients(
        self,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[uuid.UUID]:
        """Get list of client IDs to process, filtered by assignment and criteria."""
        assigned_ids = await self.dashboard_service.get_assigned_client_ids()
        
        if not assigned_ids:
            return []
        
        if client_ids:
            # Filter to only assigned clients
            target_ids = [cid for cid in client_ids if cid in assigned_ids]
        else:
            target_ids = assigned_ids
        
        # Apply filters if provided
        if filters and target_ids:
            # Get client cards to filter
            cards = await self.dashboard_service._build_client_status_cards(target_ids)
            
            if filters.get("has_red"):
                cards = [c for c in cards if c["red_issue_count"] > 0]
            if filters.get("needs_review"):
                cards = [c for c in cards if c["documents_needing_review_count"] > 0]
            if filters.get("stale"):
                threshold = filters.get("stale_days", 30)
                cutoff = datetime.now(timezone.utc) - timedelta(days=threshold)
                cards = [c for c in cards 
                        if not c["last_activity_at"] or 
                        datetime.fromisoformat(c["last_activity_at"]) < cutoff]
            
            target_ids = [uuid.UUID(c["id"]) for c in cards]
        
        return target_ids
    
    async def execute_bulk_recalculate(
        self,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
        force: bool = False,
        stale_only: bool = False,
        idempotency_key: Optional[str] = None,
    ) -> BulkOperation:
        """Execute BULK_RECALCULATE operation."""
        # Check rate limit
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before trying again.")
        
        # Check idempotency
        if idempotency_key:
            existing = await self.check_idempotency(idempotency_key)
            if existing:
                return existing
        
        # Get target clients
        target_ids = await self.get_target_clients(client_ids, filters)
        
        if not target_ids:
            raise DashboardServiceError("No clients found matching criteria")
        
        # Create bulk operation record
        bulk_op = BulkOperation(
            operation_type=BulkOperationType.BULK_RECALCULATE,
            status=BulkOperationStatus.IN_PROGRESS,
            initiated_by_id=self.accountant_id,
            parameters={"force": force, "stale_only": stale_only},
            target_client_ids=target_ids,
            total_clients=len(target_ids),
            started_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self.db.add(bulk_op)
        await self.db.flush()
        
        # Process each client
        successful = 0
        failed = 0
        
        for client_id in target_ids:
            try:
                # Run validation engine
                engine = ConsistencyEngine(self.db, client_id)
                run = await engine.run_full_validation(triggered_by_id=self.accountant_id)
                
                # Record success
                result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="SUCCESS",
                    result_data={
                        "validation_run_id": str(run.id),
                        "issues_found": run.issues_found or 0,
                    },
                )
                self.db.add(result)
                successful += 1
                
            except Exception as e:
                # Record failure
                result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="FAILED",
                    error_message=str(e),
                )
                self.db.add(result)
                failed += 1
                
                # Create alert for failure
                alert = Alert(
                    administration_id=client_id,
                    alert_code=AlertCode.BACKGROUND_OPERATION_FAILED.value,
                    severity=AlertSeverity.WARNING,
                    title="Bulk recalculation failed",
                    message=f"Validation failed during bulk operation: {str(e)}",
                    entity_type="bulk_operation",
                    entity_id=bulk_op.id,
                )
                self.db.add(alert)
        
        # Update bulk operation status
        bulk_op.processed_clients = len(target_ids)
        bulk_op.successful_clients = successful
        bulk_op.failed_clients = failed
        bulk_op.completed_at = datetime.now(timezone.utc)
        
        if failed == 0:
            bulk_op.status = BulkOperationStatus.COMPLETED
        elif successful == 0:
            bulk_op.status = BulkOperationStatus.FAILED
        else:
            bulk_op.status = BulkOperationStatus.COMPLETED_WITH_ERRORS
        
        await self.db.commit()
        return bulk_op
    
    async def execute_bulk_ack_yellow(
        self,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
        issue_codes: Optional[List[str]] = None,
        notes: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> BulkOperation:
        """Execute BULK_ACK_YELLOW operation."""
        # Check rate limit
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before trying again.")
        
        # Check idempotency
        if idempotency_key:
            existing = await self.check_idempotency(idempotency_key)
            if existing:
                return existing
        
        # Get target clients
        target_ids = await self.get_target_clients(client_ids, filters)
        
        if not target_ids:
            raise DashboardServiceError("No clients found matching criteria")
        
        # Create bulk operation record
        bulk_op = BulkOperation(
            operation_type=BulkOperationType.BULK_ACK_YELLOW,
            status=BulkOperationStatus.IN_PROGRESS,
            initiated_by_id=self.accountant_id,
            parameters={"issue_codes": issue_codes, "notes": notes},
            target_client_ids=target_ids,
            total_clients=len(target_ids),
            started_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self.db.add(bulk_op)
        await self.db.flush()
        
        # Process each client
        successful = 0
        failed = 0
        now = datetime.now(timezone.utc)
        
        for client_id in target_ids:
            try:
                # Build query for YELLOW issues
                query = (
                    select(ClientIssue)
                    .where(ClientIssue.administration_id == client_id)
                    .where(ClientIssue.severity == IssueSeverity.YELLOW)
                    .where(ClientIssue.is_resolved == False)
                )
                
                if issue_codes:
                    query = query.where(ClientIssue.issue_code.in_(issue_codes))
                
                result = await self.db.execute(query)
                issues = result.scalars().all()
                
                acked_count = 0
                for issue in issues:
                    issue.is_resolved = True
                    issue.resolved_at = now
                    issue.resolved_by_id = self.accountant_id
                    acked_count += 1
                
                # Record success
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="SUCCESS",
                    result_data={"acknowledged_count": acked_count},
                )
                self.db.add(op_result)
                successful += 1
                
            except Exception as e:
                # Record failure
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="FAILED",
                    error_message=str(e),
                )
                self.db.add(op_result)
                failed += 1
        
        # Update bulk operation status
        bulk_op.processed_clients = len(target_ids)
        bulk_op.successful_clients = successful
        bulk_op.failed_clients = failed
        bulk_op.completed_at = datetime.now(timezone.utc)
        
        if failed == 0:
            bulk_op.status = BulkOperationStatus.COMPLETED
        elif successful == 0:
            bulk_op.status = BulkOperationStatus.FAILED
        else:
            bulk_op.status = BulkOperationStatus.COMPLETED_WITH_ERRORS
        
        await self.db.commit()
        return bulk_op
    
    async def execute_bulk_generate_vat_draft(
        self,
        period_year: int,
        period_quarter: int,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> BulkOperation:
        """Execute BULK_GENERATE_VAT_DRAFT operation."""
        # Check rate limit
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before trying again.")
        
        # Check idempotency
        if idempotency_key:
            existing = await self.check_idempotency(idempotency_key)
            if existing:
                return existing
        
        # Get target clients
        target_ids = await self.get_target_clients(client_ids, filters)
        
        if not target_ids:
            raise DashboardServiceError("No clients found matching criteria")
        
        # Create bulk operation record
        bulk_op = BulkOperation(
            operation_type=BulkOperationType.BULK_GENERATE_VAT_DRAFT,
            status=BulkOperationStatus.IN_PROGRESS,
            initiated_by_id=self.accountant_id,
            parameters={"period_year": period_year, "period_quarter": period_quarter},
            target_client_ids=target_ids,
            total_clients=len(target_ids),
            started_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self.db.add(bulk_op)
        await self.db.flush()
        
        # Process each client
        successful = 0
        failed = 0
        
        for client_id in target_ids:
            try:
                # Find the period for this quarter
                quarter_start_month = (period_quarter - 1) * 3 + 1
                quarter_start = date(period_year, quarter_start_month, 1)
                if period_quarter == 4:
                    quarter_end = date(period_year, 12, 31)
                else:
                    quarter_end = date(period_year, quarter_start_month + 3, 1) - timedelta(days=1)
                
                period_result = await self.db.execute(
                    select(AccountingPeriod)
                    .where(AccountingPeriod.administration_id == client_id)
                    .where(AccountingPeriod.start_date <= quarter_start)
                    .where(AccountingPeriod.end_date >= quarter_end)
                    .limit(1)
                )
                period = period_result.scalar_one_or_none()
                
                if not period:
                    # Record skip
                    op_result = BulkOperationResult(
                        bulk_operation_id=bulk_op.id,
                        administration_id=client_id,
                        status="SKIPPED",
                        result_data={"reason": "Period not found"},
                    )
                    self.db.add(op_result)
                    continue
                
                # Generate VAT report (draft mode)
                vat_service = VatReportService(self.db, client_id)
                report = await vat_service.generate_vat_report(period.id, allow_draft=True)
                
                # Record success
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="SUCCESS",
                    result_data={
                        "period_id": str(period.id),
                        "net_vat": str(report.net_vat),
                        "has_anomalies": report.has_red_anomalies or report.has_yellow_anomalies,
                    },
                )
                self.db.add(op_result)
                successful += 1
                
            except Exception as e:
                # Record failure
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="FAILED",
                    error_message=str(e),
                )
                self.db.add(op_result)
                failed += 1
        
        # Update bulk operation status
        bulk_op.processed_clients = len(target_ids)
        bulk_op.successful_clients = successful
        bulk_op.failed_clients = failed
        bulk_op.completed_at = datetime.now(timezone.utc)
        
        if failed == 0:
            bulk_op.status = BulkOperationStatus.COMPLETED
        elif successful == 0:
            bulk_op.status = BulkOperationStatus.FAILED
        else:
            bulk_op.status = BulkOperationStatus.COMPLETED_WITH_ERRORS
        
        await self.db.commit()
        return bulk_op
    
    async def execute_bulk_send_reminders(
        self,
        reminder_type: str,
        title: str,
        message: str,
        due_date: Optional[date] = None,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> BulkOperation:
        """Execute BULK_SEND_CLIENT_REMINDERS operation."""
        # Check rate limit
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before trying again.")
        
        # Check idempotency
        if idempotency_key:
            existing = await self.check_idempotency(idempotency_key)
            if existing:
                return existing
        
        # Get target clients
        target_ids = await self.get_target_clients(client_ids, filters)
        
        if not target_ids:
            raise DashboardServiceError("No clients found matching criteria")
        
        # Create bulk operation record
        bulk_op = BulkOperation(
            operation_type=BulkOperationType.BULK_SEND_CLIENT_REMINDERS,
            status=BulkOperationStatus.IN_PROGRESS,
            initiated_by_id=self.accountant_id,
            parameters={
                "reminder_type": reminder_type,
                "title": title,
                "message": message,
                "due_date": due_date.isoformat() if due_date else None,
            },
            target_client_ids=target_ids,
            total_clients=len(target_ids),
            started_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self.db.add(bulk_op)
        await self.db.flush()
        
        # Create reminders for each client
        successful = 0
        failed = 0
        
        for client_id in target_ids:
            try:
                reminder = ClientReminder(
                    administration_id=client_id,
                    reminder_type=reminder_type,
                    title=title,
                    message=message,
                    created_by_id=self.accountant_id,
                    due_date=due_date,
                    bulk_operation_id=bulk_op.id,
                )
                self.db.add(reminder)
                
                # Record success
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="SUCCESS",
                    result_data={"reminder_id": str(reminder.id)},
                )
                self.db.add(op_result)
                successful += 1
                
            except Exception as e:
                # Record failure
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="FAILED",
                    error_message=str(e),
                )
                self.db.add(op_result)
                failed += 1
        
        # Update bulk operation status
        bulk_op.processed_clients = len(target_ids)
        bulk_op.successful_clients = successful
        bulk_op.failed_clients = failed
        bulk_op.completed_at = datetime.now(timezone.utc)
        
        if failed == 0:
            bulk_op.status = BulkOperationStatus.COMPLETED
        elif successful == 0:
            bulk_op.status = BulkOperationStatus.FAILED
        else:
            bulk_op.status = BulkOperationStatus.COMPLETED_WITH_ERRORS
        
        await self.db.commit()
        return bulk_op
    
    async def execute_bulk_lock_period(
        self,
        period_year: int,
        period_quarter: int,
        confirm_irreversible: bool,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> BulkOperation:
        """
        Execute BULK_LOCK_PERIOD operation.
        
        Prerequisites:
        - Period must be FINALIZED
        - Zero RED issues
        - confirm_irreversible must be True
        """
        # Check rate limit
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before trying again.")
        
        if not confirm_irreversible:
            raise DashboardServiceError("Must confirm_irreversible=true to lock periods")
        
        # Check idempotency
        if idempotency_key:
            existing = await self.check_idempotency(idempotency_key)
            if existing:
                return existing
        
        # Get target clients
        target_ids = await self.get_target_clients(client_ids, filters)
        
        if not target_ids:
            raise DashboardServiceError("No clients found matching criteria")
        
        # Create bulk operation record
        bulk_op = BulkOperation(
            operation_type=BulkOperationType.BULK_LOCK_PERIOD,
            status=BulkOperationStatus.IN_PROGRESS,
            initiated_by_id=self.accountant_id,
            parameters={
                "period_year": period_year,
                "period_quarter": period_quarter,
                "confirm_irreversible": confirm_irreversible,
            },
            target_client_ids=target_ids,
            total_clients=len(target_ids),
            started_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self.db.add(bulk_op)
        await self.db.flush()
        
        # Process each client
        successful = 0
        failed = 0
        
        for client_id in target_ids:
            try:
                # Find the period for this quarter
                quarter_start_month = (period_quarter - 1) * 3 + 1
                quarter_start = date(period_year, quarter_start_month, 1)
                if period_quarter == 4:
                    quarter_end = date(period_year, 12, 31)
                else:
                    quarter_end = date(period_year, quarter_start_month + 3, 1) - timedelta(days=1)
                
                period_result = await self.db.execute(
                    select(AccountingPeriod)
                    .where(AccountingPeriod.administration_id == client_id)
                    .where(AccountingPeriod.start_date <= quarter_start)
                    .where(AccountingPeriod.end_date >= quarter_end)
                    .limit(1)
                )
                period = period_result.scalar_one_or_none()
                
                if not period:
                    # Record skip
                    op_result = BulkOperationResult(
                        bulk_operation_id=bulk_op.id,
                        administration_id=client_id,
                        status="SKIPPED",
                        result_data={"reason": "Period not found"},
                    )
                    self.db.add(op_result)
                    continue
                
                # Check if period is FINALIZED
                if period.status != PeriodStatus.FINALIZED:
                    op_result = BulkOperationResult(
                        bulk_operation_id=bulk_op.id,
                        administration_id=client_id,
                        status="SKIPPED",
                        result_data={"reason": f"Period status is {period.status.value}, not FINALIZED"},
                    )
                    self.db.add(op_result)
                    continue
                
                # Check for RED issues
                red_count_result = await self.db.execute(
                    select(func.count(ClientIssue.id))
                    .where(ClientIssue.administration_id == client_id)
                    .where(ClientIssue.severity == IssueSeverity.RED)
                    .where(ClientIssue.is_resolved == False)
                )
                red_count = red_count_result.scalar() or 0
                
                if red_count > 0:
                    op_result = BulkOperationResult(
                        bulk_operation_id=bulk_op.id,
                        administration_id=client_id,
                        status="SKIPPED",
                        result_data={"reason": f"Client has {red_count} unresolved RED issues"},
                    )
                    self.db.add(op_result)
                    continue
                
                # Lock the period
                period_service = PeriodControlService(self.db, client_id)
                locked_period = await period_service.lock_period(
                    period_id=period.id,
                    user_id=self.accountant_id,
                    notes="Locked via bulk operation",
                )
                
                # Record success
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="SUCCESS",
                    result_data={"period_id": str(period.id), "locked_at": locked_period.locked_at.isoformat()},
                )
                self.db.add(op_result)
                successful += 1
                
            except Exception as e:
                # Record failure
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="FAILED",
                    error_message=str(e),
                )
                self.db.add(op_result)
                failed += 1
        
        # Update bulk operation status
        bulk_op.processed_clients = len(target_ids)
        bulk_op.successful_clients = successful
        bulk_op.failed_clients = failed
        bulk_op.completed_at = datetime.now(timezone.utc)
        
        if failed == 0:
            bulk_op.status = BulkOperationStatus.COMPLETED
        elif successful == 0:
            bulk_op.status = BulkOperationStatus.FAILED
        else:
            bulk_op.status = BulkOperationStatus.COMPLETED_WITH_ERRORS
        
        await self.db.commit()
        return bulk_op
    
    async def get_bulk_operation(self, operation_id: uuid.UUID) -> Optional[BulkOperation]:
        """Get a bulk operation with its results."""
        result = await self.db.execute(
            select(BulkOperation)
            .options(selectinload(BulkOperation.results))
            .where(BulkOperation.id == operation_id)
            .where(BulkOperation.initiated_by_id == self.accountant_id)
        )
        return result.scalar_one_or_none()
    
    async def list_bulk_operations(
        self,
        limit: int = 50,
        operation_type: Optional[BulkOperationType] = None,
    ) -> List[BulkOperation]:
        """List bulk operations for this accountant."""
        query = (
            select(BulkOperation)
            .where(BulkOperation.initiated_by_id == self.accountant_id)
            .order_by(BulkOperation.created_at.desc())
            .limit(limit)
        )
        
        if operation_type:
            query = query.where(BulkOperation.operation_type == operation_type)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
