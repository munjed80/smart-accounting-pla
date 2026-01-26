"""
Work Queue and Readiness Score Service

Service layer for:
- Readiness score computation (deterministic, 0-100)
- Work queue generation with unified work items
- SLA policy enforcement and escalation events
"""
import uuid
import hashlib
import calendar
from datetime import datetime, timezone, date, timedelta
from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal
from sqlalchemy import select, func, and_, or_, case, desc, asc, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.document import Document, DocumentStatus
from app.models.ledger import AccountingPeriod, PeriodStatus, JournalEntry
from app.models.issues import ClientIssue, IssueSeverity
from app.models.alerts import Alert, AlertSeverity, AlertCode
from app.models.accountant_dashboard import AccountantClientAssignment
from app.models.work_queue import (
    ClientReadinessCache,
    EscalationEvent, 
    EscalationType,
    EscalationSeverity,
)


# SLA Policy Configuration (can be overridden via environment)
SLA_POLICY = {
    "red_unresolved_warning_days": 5,
    "red_unresolved_critical_days": 7,
    "vat_due_warning_days": 14,
    "vat_due_critical_days": 7,
    "review_stale_warning_days": 10,
    "backlog_warning_threshold": 20,
}


class WorkQueueServiceError(Exception):
    """Base exception for work queue service operations."""
    pass


class ReadinessScoreEngine:
    """
    Deterministic readiness score computation.
    
    Score ranges from 0-100 where:
    - 100 = Perfect health, no action needed
    - 80-99 = Good, minor attention needed
    - 50-79 = Moderate issues, review recommended
    - 20-49 = Poor, significant issues
    - 0-19 = Critical, immediate action required
    
    Scoring factors:
    - RED issues: -20 points each (max -60)
    - YELLOW issues: -5 points each (max -20)
    - Document backlog: -3 points per doc (max -15)
    - Critical alerts: -20 points
    - VAT deadline <= 7 days: -15 points
    - VAT deadline <= 14 days: -10 points
    - Staleness > 30 days: -10 points
    """
    
    # Score weights
    WEIGHT_RED_ISSUE = 20
    WEIGHT_RED_MAX = 60
    WEIGHT_YELLOW_ISSUE = 5
    WEIGHT_YELLOW_MAX = 20
    WEIGHT_DOC_BACKLOG = 3
    WEIGHT_BACKLOG_MAX = 15
    WEIGHT_CRITICAL_ALERT = 20
    WEIGHT_VAT_URGENT = 15
    WEIGHT_VAT_APPROACHING = 10
    WEIGHT_STALENESS = 10
    
    @classmethod
    def compute_score(
        cls,
        red_issue_count: int,
        yellow_issue_count: int,
        document_backlog: int,
        has_critical_alerts: bool,
        vat_days_remaining: Optional[int],
        staleness_days: Optional[int],
    ) -> Tuple[int, Dict[str, Any]]:
        """
        Compute readiness score with breakdown.
        
        Returns:
            Tuple of (score, breakdown_dict)
        """
        score = 100
        breakdown = {
            "base_score": 100,
            "deductions": [],
        }
        
        # RED issues penalty
        red_penalty = min(red_issue_count * cls.WEIGHT_RED_ISSUE, cls.WEIGHT_RED_MAX)
        if red_penalty > 0:
            score -= red_penalty
            breakdown["deductions"].append({
                "reason": "red_issues",
                "count": red_issue_count,
                "penalty": red_penalty,
            })
        
        # YELLOW issues penalty
        yellow_penalty = min(yellow_issue_count * cls.WEIGHT_YELLOW_ISSUE, cls.WEIGHT_YELLOW_MAX)
        if yellow_penalty > 0:
            score -= yellow_penalty
            breakdown["deductions"].append({
                "reason": "yellow_issues",
                "count": yellow_issue_count,
                "penalty": yellow_penalty,
            })
        
        # Document backlog penalty
        backlog_penalty = min(document_backlog * cls.WEIGHT_DOC_BACKLOG, cls.WEIGHT_BACKLOG_MAX)
        if backlog_penalty > 0:
            score -= backlog_penalty
            breakdown["deductions"].append({
                "reason": "document_backlog",
                "count": document_backlog,
                "penalty": backlog_penalty,
            })
        
        # Critical alerts penalty
        if has_critical_alerts:
            score -= cls.WEIGHT_CRITICAL_ALERT
            breakdown["deductions"].append({
                "reason": "critical_alerts",
                "penalty": cls.WEIGHT_CRITICAL_ALERT,
            })
        
        # VAT deadline penalty
        if vat_days_remaining is not None:
            if vat_days_remaining <= 7:
                score -= cls.WEIGHT_VAT_URGENT
                breakdown["deductions"].append({
                    "reason": "vat_deadline_urgent",
                    "days_remaining": vat_days_remaining,
                    "penalty": cls.WEIGHT_VAT_URGENT,
                })
            elif vat_days_remaining <= 14:
                score -= cls.WEIGHT_VAT_APPROACHING
                breakdown["deductions"].append({
                    "reason": "vat_deadline_approaching",
                    "days_remaining": vat_days_remaining,
                    "penalty": cls.WEIGHT_VAT_APPROACHING,
                })
        
        # Staleness penalty
        if staleness_days is not None and staleness_days > 30:
            score -= cls.WEIGHT_STALENESS
            breakdown["deductions"].append({
                "reason": "staleness",
                "days_inactive": staleness_days,
                "penalty": cls.WEIGHT_STALENESS,
            })
        
        # Ensure score is within bounds
        score = max(0, min(100, score))
        breakdown["final_score"] = score
        
        return score, breakdown


class WorkQueueService:
    """
    Service for work queue management.
    
    Provides unified work items for the accountant dashboard:
    - Normalizes different types of work items (issues, VAT, backlog, alerts)
    - Supports filtering and pagination
    - Includes readiness score for prioritization
    """
    
    def __init__(self, db: AsyncSession, accountant_id: uuid.UUID):
        self.db = db
        self.accountant_id = accountant_id
    
    async def get_assigned_client_ids(self) -> List[uuid.UUID]:
        """Get all client IDs assigned to this accountant."""
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
        
        return list(set(assigned_ids + member_ids))
    
    async def get_work_queue(
        self,
        queue_type: str = "all",
        limit: int = 50,
        cursor: Optional[str] = None,
        sort_by: str = "readiness_score",
        sort_order: str = "asc",
    ) -> Dict[str, Any]:
        """
        Get unified work queue items.
        
        Args:
            queue_type: Filter type - red, review, vat_due, stale, all
            limit: Max items to return
            cursor: Pagination cursor
            sort_by: Sort field
            sort_order: asc or desc
            
        Returns:
            Dict with items, counts, and pagination info
        """
        client_ids = await self.get_assigned_client_ids()
        
        if not client_ids:
            return {
                "items": [],
                "total_count": 0,
                "queue_type": queue_type,
                "counts": {
                    "red_issues": 0,
                    "needs_review": 0,
                    "vat_due": 0,
                    "stale": 0,
                },
            }
        
        # Build work items for each client
        work_items = []
        counts = {"red_issues": 0, "needs_review": 0, "vat_due": 0, "stale": 0}
        
        # Get client data with aggregations
        client_data = await self._get_client_data(client_ids)
        
        for client in client_data:
            client_items = self._build_work_items(client)
            work_items.extend(client_items)
            
            # Update counts
            for item in client_items:
                if item["work_item_type"] == "ISSUE" and item.get("severity") == "RED":
                    counts["red_issues"] += 1
                elif item["work_item_type"] == "BACKLOG":
                    counts["needs_review"] += 1
                elif item["work_item_type"] == "VAT":
                    counts["vat_due"] += 1
        
        # Filter by queue type
        if queue_type == "red":
            work_items = [i for i in work_items if i["work_item_type"] == "ISSUE" and i.get("severity") == "RED"]
        elif queue_type == "review":
            work_items = [i for i in work_items if i["work_item_type"] == "BACKLOG"]
        elif queue_type == "vat_due":
            work_items = [i for i in work_items if i["work_item_type"] == "VAT"]
        elif queue_type == "stale":
            today = date.today()
            thirty_days_ago = today - timedelta(days=30)
            work_items = [i for i in work_items if i.get("staleness_days", 0) > 30]
        
        # Sort items
        reverse = sort_order.lower() == "desc"
        if sort_by == "readiness_score":
            work_items.sort(key=lambda x: x.get("readiness_score", 0), reverse=reverse)
        elif sort_by == "due_date":
            work_items.sort(
                key=lambda x: x.get("due_date") or date.max,
                reverse=reverse
            )
        elif sort_by == "severity":
            severity_order = {"CRITICAL": 0, "RED": 1, "WARNING": 2, "YELLOW": 3, "INFO": 4}
            work_items.sort(
                key=lambda x: severity_order.get(x.get("severity", "INFO"), 5),
                reverse=reverse
            )
        
        # Apply limit
        total_count = len(work_items)
        work_items = work_items[:limit]
        
        return {
            "items": work_items,
            "total_count": total_count,
            "returned_count": len(work_items),
            "queue_type": queue_type,
            "counts": counts,
            "sort_by": sort_by,
            "sort_order": sort_order,
        }
    
    async def _get_client_data(self, client_ids: List[uuid.UUID]) -> List[Dict[str, Any]]:
        """Fetch client data with all required aggregations."""
        clients = []
        today = date.today()
        
        # Get administrations
        admins_result = await self.db.execute(
            select(Administration)
            .where(Administration.id.in_(client_ids))
            .where(Administration.is_active == True)
        )
        administrations = admins_result.scalars().all()
        
        # Get issue counts per client
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
        
        # Get document backlog counts
        docs_result = await self.db.execute(
            select(
                Document.administration_id,
                func.count(Document.id)
            )
            .where(Document.administration_id.in_(client_ids))
            .where(Document.status == DocumentStatus.NEEDS_REVIEW)
            .group_by(Document.administration_id)
        )
        doc_counts = {r[0]: r[1] for r in docs_result.all()}
        
        # Get period info
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
                    if next_month > 12:
                        deadline = date(period.end_date.year + 1, 1, 31)
                    else:
                        last_day = calendar.monthrange(period.end_date.year, next_month)[1]
                        deadline = date(period.end_date.year, next_month, last_day)
                
                period_info[period.administration_id] = {
                    "id": str(period.id),
                    "status": period.status.value,
                    "name": period.name,
                    "vat_deadline": deadline,
                    "days_to_deadline": (deadline - today).days,
                }
        
        # Get last activity per client
        activity_result = await self.db.execute(
            select(
                JournalEntry.administration_id,
                func.max(JournalEntry.created_at)
            )
            .where(JournalEntry.administration_id.in_(client_ids))
            .group_by(JournalEntry.administration_id)
        )
        last_activity = {}
        for admin_id, activity_time in activity_result.all():
            if activity_time:
                activity_aware = activity_time if activity_time.tzinfo else activity_time.replace(tzinfo=timezone.utc)
                staleness = (datetime.now(timezone.utc) - activity_aware).days
                last_activity[admin_id] = {"time": activity_aware, "staleness_days": staleness}
        
        # Get critical alerts
        alerts_result = await self.db.execute(
            select(
                Alert.administration_id,
                func.count(case((Alert.severity == AlertSeverity.CRITICAL, 1)))
            )
            .where(Alert.administration_id.in_(client_ids))
            .where(Alert.resolved_at.is_(None))
            .group_by(Alert.administration_id)
        )
        critical_alerts = {r[0]: r[1] > 0 for r in alerts_result.all()}
        
        # Build client data
        for admin in administrations:
            admin_id = admin.id
            issues = issue_counts.get(admin_id, {"red": 0, "yellow": 0})
            docs = doc_counts.get(admin_id, 0)
            period = period_info.get(admin_id, {})
            activity = last_activity.get(admin_id, {"staleness_days": None})
            has_critical = critical_alerts.get(admin_id, False)
            
            # Compute readiness score
            score, breakdown = ReadinessScoreEngine.compute_score(
                red_issue_count=issues["red"],
                yellow_issue_count=issues["yellow"],
                document_backlog=docs,
                has_critical_alerts=has_critical,
                vat_days_remaining=period.get("days_to_deadline"),
                staleness_days=activity.get("staleness_days"),
            )
            
            clients.append({
                "id": str(admin_id),
                "name": admin.name,
                "kvk_number": admin.kvk_number,
                "btw_number": admin.btw_number,
                "red_issue_count": issues["red"],
                "yellow_issue_count": issues["yellow"],
                "document_backlog": docs,
                "period_id": period.get("id"),
                "period_status": period.get("status"),
                "period_name": period.get("name"),
                "vat_deadline": period.get("vat_deadline"),
                "vat_days_remaining": period.get("days_to_deadline"),
                "has_critical_alerts": has_critical,
                "staleness_days": activity.get("staleness_days"),
                "readiness_score": score,
                "readiness_breakdown": breakdown,
            })
        
        return clients
    
    def _build_work_items(self, client: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Build work items for a single client."""
        items = []
        base = {
            "client_id": client["id"],
            "client_name": client["name"],
            "period_id": client.get("period_id"),
            "period_status": client.get("period_status"),
            "readiness_score": client["readiness_score"],
            "readiness_breakdown": client["readiness_breakdown"],
        }
        
        # RED issues work item
        if client["red_issue_count"] > 0:
            items.append({
                **base,
                "work_item_type": "ISSUE",
                "severity": "RED",
                "title": f"{client['red_issue_count']} RED issue(s) requiring immediate attention",
                "description": f"Client has unresolved RED severity issues that must be fixed before finalization.",
                "suggested_next_action": "Review and resolve RED issues",
                "age_days": None,
                "due_date": None,
                "counts": {
                    "red": client["red_issue_count"],
                    "yellow": client["yellow_issue_count"],
                    "backlog": client["document_backlog"],
                },
            })
        
        # YELLOW issues work item  
        if client["yellow_issue_count"] > 0 and client["red_issue_count"] == 0:
            items.append({
                **base,
                "work_item_type": "ISSUE",
                "severity": "YELLOW",
                "title": f"{client['yellow_issue_count']} YELLOW issue(s) to review",
                "description": f"Client has YELLOW issues that should be reviewed or acknowledged.",
                "suggested_next_action": "Review and acknowledge or resolve YELLOW issues",
                "age_days": None,
                "due_date": None,
                "counts": {
                    "red": 0,
                    "yellow": client["yellow_issue_count"],
                    "backlog": client["document_backlog"],
                },
            })
        
        # Document backlog work item
        if client["document_backlog"] > 0:
            items.append({
                **base,
                "work_item_type": "BACKLOG",
                "severity": "WARNING" if client["document_backlog"] >= 20 else "INFO",
                "title": f"{client['document_backlog']} document(s) needing review",
                "description": f"Documents uploaded but not yet processed or posted.",
                "suggested_next_action": "Review and process pending documents",
                "age_days": None,
                "due_date": None,
                "counts": {
                    "red": client["red_issue_count"],
                    "yellow": client["yellow_issue_count"],
                    "backlog": client["document_backlog"],
                },
            })
        
        # VAT deadline work item
        if client.get("vat_days_remaining") is not None:
            days = client["vat_days_remaining"]
            if days <= 14:
                severity = "CRITICAL" if days <= 7 else "WARNING"
                items.append({
                    **base,
                    "work_item_type": "VAT",
                    "severity": severity,
                    "title": f"VAT deadline in {days} day(s)",
                    "description": f"BTW Aangifte due for {client.get('period_name', 'current period')}",
                    "suggested_next_action": "Generate VAT draft and review" if days > 7 else "Finalize and submit VAT filing",
                    "age_days": None,
                    "due_date": client.get("vat_deadline"),
                    "counts": {
                        "red": client["red_issue_count"],
                        "yellow": client["yellow_issue_count"],
                        "backlog": client["document_backlog"],
                    },
                })
        
        # Period in REVIEW work item
        if client.get("period_status") == "REVIEW":
            items.append({
                **base,
                "work_item_type": "PERIOD_REVIEW",
                "severity": "WARNING",
                "title": f"Period in REVIEW state",
                "description": f"{client.get('period_name', 'Period')} is awaiting finalization",
                "suggested_next_action": "Review validation results and finalize period",
                "age_days": None,
                "due_date": client.get("vat_deadline"),
                "counts": {
                    "red": client["red_issue_count"],
                    "yellow": client["yellow_issue_count"],
                    "backlog": client["document_backlog"],
                },
            })
        
        # Stale client work item
        staleness = client.get("staleness_days")
        if staleness is not None and staleness > 30:
            items.append({
                **base,
                "work_item_type": "STALE",
                "severity": "WARNING",
                "title": f"No activity for {staleness} days",
                "description": f"Client has had no document uploads or transactions recently.",
                "suggested_next_action": "Send reminder or check in with client",
                "age_days": staleness,
                "due_date": None,
                "staleness_days": staleness,
                "counts": {
                    "red": client["red_issue_count"],
                    "yellow": client["yellow_issue_count"],
                    "backlog": client["document_backlog"],
                },
            })
        
        # Critical alerts work item
        if client.get("has_critical_alerts"):
            items.append({
                **base,
                "work_item_type": "ALERT",
                "severity": "CRITICAL",
                "title": "Critical alerts requiring attention",
                "description": "There are unresolved CRITICAL alerts for this client.",
                "suggested_next_action": "Review and resolve critical alerts",
                "age_days": None,
                "due_date": None,
                "counts": {
                    "red": client["red_issue_count"],
                    "yellow": client["yellow_issue_count"],
                    "backlog": client["document_backlog"],
                },
            })
        
        return items


class SLAService:
    """
    Service for SLA policy enforcement and escalation.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_sla_summary(self, client_ids: List[uuid.UUID]) -> Dict[str, Any]:
        """
        Get SLA summary for given clients.
        
        Returns counts of violations by type and severity.
        """
        if not client_ids:
            return {
                "total_violations": 0,
                "critical_count": 0,
                "warning_count": 0,
                "by_type": {},
                "escalation_events_today": 0,
            }
        
        today = date.today()
        now = datetime.now(timezone.utc)
        violations = {"critical": 0, "warning": 0}
        by_type = {}
        
        # Check RED issues unresolved > threshold
        red_issues_result = await self.db.execute(
            select(
                ClientIssue.administration_id,
                func.min(ClientIssue.created_at)
            )
            .where(ClientIssue.administration_id.in_(client_ids))
            .where(ClientIssue.severity == IssueSeverity.RED)
            .where(ClientIssue.is_resolved == False)
            .group_by(ClientIssue.administration_id)
        )
        
        for admin_id, oldest_created in red_issues_result.all():
            if oldest_created:
                oldest_aware = oldest_created if oldest_created.tzinfo else oldest_created.replace(tzinfo=timezone.utc)
                age_days = (now - oldest_aware).days
                
                if age_days >= SLA_POLICY["red_unresolved_critical_days"]:
                    violations["critical"] += 1
                    by_type.setdefault("RED_UNRESOLVED", {"critical": 0, "warning": 0})
                    by_type["RED_UNRESOLVED"]["critical"] += 1
                elif age_days >= SLA_POLICY["red_unresolved_warning_days"]:
                    violations["warning"] += 1
                    by_type.setdefault("RED_UNRESOLVED", {"critical": 0, "warning": 0})
                    by_type["RED_UNRESOLVED"]["warning"] += 1
        
        # Check VAT deadlines
        periods_result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.administration_id.in_(client_ids))
            .where(AccountingPeriod.status.in_([PeriodStatus.OPEN, PeriodStatus.REVIEW]))
        )
        
        for period in periods_result.scalars().all():
            # Calculate deadline
            if period.end_date.month == 12:
                deadline = date(period.end_date.year + 1, 1, 31)
            else:
                next_month = period.end_date.month + 1
                if next_month > 12:
                    deadline = date(period.end_date.year + 1, 1, 31)
                else:
                    last_day = calendar.monthrange(period.end_date.year, next_month)[1]
                    deadline = date(period.end_date.year, next_month, last_day)
            
            days_remaining = (deadline - today).days
            
            if days_remaining <= SLA_POLICY["vat_due_critical_days"]:
                violations["critical"] += 1
                by_type.setdefault("VAT_DEADLINE", {"critical": 0, "warning": 0})
                by_type["VAT_DEADLINE"]["critical"] += 1
            elif days_remaining <= SLA_POLICY["vat_due_warning_days"]:
                violations["warning"] += 1
                by_type.setdefault("VAT_DEADLINE", {"critical": 0, "warning": 0})
                by_type["VAT_DEADLINE"]["warning"] += 1
        
        # Check REVIEW state > threshold
        review_periods = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.administration_id.in_(client_ids))
            .where(AccountingPeriod.status == PeriodStatus.REVIEW)
        )
        
        for period in review_periods.scalars().all():
            # Check how long in REVIEW state (using updated_at as proxy)
            if period.updated_at:
                updated_aware = period.updated_at if period.updated_at.tzinfo else period.updated_at.replace(tzinfo=timezone.utc)
                days_in_review = (now - updated_aware).days
                
                if days_in_review >= SLA_POLICY["review_stale_warning_days"]:
                    violations["warning"] += 1
                    by_type.setdefault("REVIEW_STALE", {"critical": 0, "warning": 0})
                    by_type["REVIEW_STALE"]["warning"] += 1
        
        # Check document backlog > threshold
        backlog_result = await self.db.execute(
            select(
                Document.administration_id,
                func.count(Document.id)
            )
            .where(Document.administration_id.in_(client_ids))
            .where(Document.status == DocumentStatus.NEEDS_REVIEW)
            .group_by(Document.administration_id)
            .having(func.count(Document.id) >= SLA_POLICY["backlog_warning_threshold"])
        )
        
        backlog_violations = len(backlog_result.all())
        if backlog_violations > 0:
            violations["warning"] += backlog_violations
            by_type.setdefault("BACKLOG_HIGH", {"critical": 0, "warning": 0})
            by_type["BACKLOG_HIGH"]["warning"] = backlog_violations
        
        # Count escalation events created today
        today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
        escalation_count_result = await self.db.execute(
            select(func.count(EscalationEvent.id))
            .where(EscalationEvent.administration_id.in_(client_ids))
            .where(EscalationEvent.created_at >= today_start)
        )
        escalation_events_today = escalation_count_result.scalar() or 0
        
        return {
            "total_violations": violations["critical"] + violations["warning"],
            "critical_count": violations["critical"],
            "warning_count": violations["warning"],
            "by_type": by_type,
            "escalation_events_today": escalation_events_today,
            "policy": SLA_POLICY,
        }
    
    async def create_escalation_event(
        self,
        administration_id: Optional[uuid.UUID],
        escalation_type: str,
        severity: str,
        trigger_reason: str,
        threshold_value: Optional[int] = None,
        actual_value: Optional[int] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[uuid.UUID] = None,
    ) -> EscalationEvent:
        """Create a new escalation event."""
        event = EscalationEvent(
            administration_id=administration_id,
            escalation_type=escalation_type,
            severity=severity,
            trigger_reason=trigger_reason,
            threshold_value=threshold_value,
            actual_value=actual_value,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        self.db.add(event)
        await self.db.commit()
        return event
