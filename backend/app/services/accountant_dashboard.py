"""
Accountant Dashboard Service

Service layer for:
- Dashboard aggregation across multiple clients
- Bulk operations execution
- Rate limiting and audit logging
"""
import calendar
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
    AssignmentStatus,
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
        """Get all client IDs assigned to this accountant with ACTIVE consent status."""
        # First check explicit assignments - only include ACTIVE assignments
        result = await self.db.execute(
            select(AccountantClientAssignment.administration_id)
            .where(AccountantClientAssignment.accountant_id == self.accountant_id)
            .where(AccountantClientAssignment.status == AssignmentStatus.ACTIVE)
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
            async with self.db.begin_nested():
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
        alerts_by_severity = {"critical": 0, "warning": 0, "info": 0}
        try:
            async with self.db.begin_nested():
                alerts_result = await self.db.execute(
                    select(Alert.severity, func.count(Alert.id))
                    .where(or_(
                        Alert.administration_id.in_(client_ids),
                        Alert.administration_id.is_(None)
                    ))
                    .where(Alert.resolved_at.is_(None))
                    .group_by(Alert.severity)
                )
            for severity, count in alerts_result.all():
                if severity == AlertSeverity.CRITICAL:
                    alerts_by_severity["critical"] = count
                elif severity == AlertSeverity.WARNING:
                    alerts_by_severity["warning"] = count
                elif severity == AlertSeverity.INFO:
                    alerts_by_severity["info"] = count
        except Exception as exc:
            logger.warning(
                "Accountant dashboard alerts query failed; returning 0s. error=%s", exc
            )

        # Calculate VAT deadlines
        today = date.today()
        try:
            async with self.db.begin_nested():
                vat_deadlines = await self._get_vat_deadlines(client_ids, today)
        except Exception as exc:
            logger.warning(
                "Accountant dashboard VAT deadline calculation failed; returning empty list. error=%s",
                exc,
            )
            vat_deadlines = []
        
        upcoming_7d = sum(1 for d in vat_deadlines if d.get("days_remaining", 0) <= 7)
        upcoming_14d = sum(1 for d in vat_deadlines if d.get("days_remaining", 0) <= 14)
        upcoming_30d = sum(1 for d in vat_deadlines if d.get("days_remaining", 0) <= 30)
        
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
        search: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
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
        
        now = datetime.now(timezone.utc)
        def inactive_days(card):
            return (now - datetime.fromisoformat(card['last_activity_at'])).days if card['last_activity_at'] else None
        def risk(card):
            return (30 * (card['red_issue_count'] > 0)
                    + 20 * (card['documents_needing_review_count'] > 0)
                    + 20 * (card['days_to_vat_deadline'] is not None and card['days_to_vat_deadline'] <= 7)
                    + 10 * ((card['backlog_age_max_days'] or 0) > 0)
                    + 5 * (inactive_days(card) is not None and inactive_days(card) > 14))
        priority_clients = sorted(clients, key=lambda c: (-risk(c), c['id']))[:10]
        portfolio_counts = {
            'documents': sum(c['documents_needing_review_count'] for c in clients),
            'vat_due': sum(c['days_to_vat_deadline'] is not None and c['days_to_vat_deadline'] <= 7 for c in clients),
            'inactive': sum(inactive_days(c) is None or inactive_days(c) >= 30 for c in clients),
        }
        # Apply filters
        filtered_clients = list(clients)
        applied_filters = []
        if search and search.strip():
            term = search.strip().casefold()
            filtered_clients = [c for c in filtered_clients if any(
                term in str(c.get(field) or '').casefold()
                for field in ('name', 'kvk_number', 'btw_number')
            )]
        
        if filters:
            for filter_type in filters:
                if filter_type == "has_red":
                    filtered_clients = [c for c in filtered_clients if c["red_issue_count"] > 0]
                    applied_filters.append("has_red")
                elif filter_type == "has_yellow":
                    filtered_clients = [c for c in filtered_clients if c["yellow_issue_count"] > 0 and c["red_issue_count"] == 0]
                    applied_filters.append(filter_type)
                elif filter_type == "ok":
                    filtered_clients = [c for c in filtered_clients if c["red_issue_count"] == 0 and c["yellow_issue_count"] == 0]
                    applied_filters.append(filter_type)
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
                                       if c["last_activity_at"] is None or datetime.fromisoformat(c["last_activity_at"]) < thirty_days_ago]
                    applied_filters.append("stale_30d")
        
        # Stable secondary order prevents page overlap when scores tie.
        filtered_clients.sort(key=lambda c: c["id"])
        # Apply sorting
        reverse = sort_order.lower() == "desc"
        
        if sort_by == "readiness_score":
            filtered_clients.sort(key=lambda x: x["readiness_score"], reverse=reverse)
        elif sort_by == "red_issues":
            filtered_clients.sort(key=lambda x: x["red_issue_count"], reverse=reverse)
        elif sort_by == "backlog":
            filtered_clients.sort(key=lambda x: x["backlog_age_max_days"] or 0, reverse=reverse)
        elif sort_by in ("deadline", "last_activity"):
            field = "days_to_vat_deadline" if sort_by == "deadline" else "last_activity_at"
            with_value = [c for c in filtered_clients if c[field] is not None]
            without_value = [c for c in filtered_clients if c[field] is None]
            filtered_clients = sorted(with_value, key=lambda c: c[field], reverse=reverse) + without_value
        elif sort_by == "name":
            filtered_clients.sort(key=lambda x: x["name"].lower(), reverse=reverse)
        
        return {
            "priority_clients": priority_clients,
            "portfolio_counts": portfolio_counts,
            "clients": filtered_clients[offset:offset + limit] if limit is not None else filtered_clients[offset:],
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
            .order_by(AccountingPeriod.end_date.asc())
        )
        period_info = {}
        for period in periods_result.scalars().all():
            if period.administration_id not in period_info:
                # Calculate VAT deadline
                deadline_year = period.end_date.year + (period.end_date.month == 12)
                deadline_month = period.end_date.month % 12 + 1
                deadline = date(deadline_year, deadline_month, calendar.monthrange(deadline_year, deadline_month)[1])

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


from app.services.accountant_dashboard_bulk import BulkOperationsService
