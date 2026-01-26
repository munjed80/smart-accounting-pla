"""
Metrics Service

Provides application metrics for observability:
- documents_processed_today
- issues_created_today (RED/YELLOW)
- decisions_approved/rejected
- postings_created
- failed_operations_count

Exposes metrics in structured JSON suitable for later Prometheus integration.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document, DocumentStatus
from app.models.issues import ClientIssue, IssueSeverity
from app.models.decisions import AccountantDecision, DecisionType, ExecutionStatus
from app.models.ledger import JournalEntry, JournalEntryStatus
from app.models.alerts import Alert, AlertSeverity


class MetricsService:
    """
    Service for collecting and exposing application metrics.
    
    Metrics are collected in real-time from the database and
    exposed in a structured JSON format suitable for:
    - Dashboard display
    - Health monitoring
    - Future Prometheus integration
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    def _get_today_start(self) -> datetime:
        """Get start of today in UTC."""
        now = datetime.now(timezone.utc)
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    async def get_document_metrics(
        self,
        administration_id: Optional[UUID] = None,
    ) -> dict:
        """Get document processing metrics."""
        today_start = self._get_today_start()
        
        # Base query conditions
        conditions = []
        if administration_id:
            conditions.append(Document.administration_id == administration_id)
        
        # Documents processed today (reached POSTED or REJECTED status)
        processed_query = select(func.count(Document.id)).where(
            and_(
                Document.status.in_([DocumentStatus.POSTED, DocumentStatus.REJECTED]),
                Document.updated_at >= today_start,
                *conditions
            )
        )
        result = await self.db.execute(processed_query)
        documents_processed_today = result.scalar() or 0
        
        # Documents uploaded today
        uploaded_query = select(func.count(Document.id)).where(
            and_(
                Document.created_at >= today_start,
                *conditions
            )
        )
        result = await self.db.execute(uploaded_query)
        documents_uploaded_today = result.scalar() or 0
        
        # Documents by status
        status_query = select(
            Document.status,
            func.count(Document.id)
        )
        if conditions:
            status_query = status_query.where(and_(*conditions))
        status_query = status_query.group_by(Document.status)
        
        result = await self.db.execute(status_query)
        status_counts = {row[0].value: row[1] for row in result.all()}
        
        # Failed documents today
        failed_query = select(func.count(Document.id)).where(
            and_(
                Document.status == DocumentStatus.FAILED,
                Document.updated_at >= today_start,
                *conditions
            )
        )
        result = await self.db.execute(failed_query)
        documents_failed_today = result.scalar() or 0
        
        return {
            "documents_processed_today": documents_processed_today,
            "documents_uploaded_today": documents_uploaded_today,
            "documents_failed_today": documents_failed_today,
            "documents_by_status": status_counts,
            "documents_pending_review": status_counts.get("NEEDS_REVIEW", 0),
            "documents_in_processing": status_counts.get("PROCESSING", 0),
        }
    
    async def get_issue_metrics(
        self,
        administration_id: Optional[UUID] = None,
    ) -> dict:
        """Get issue/consistency metrics."""
        today_start = self._get_today_start()
        
        conditions = []
        if administration_id:
            conditions.append(ClientIssue.administration_id == administration_id)
        
        # Issues created today by severity
        created_query = select(
            ClientIssue.severity,
            func.count(ClientIssue.id)
        ).where(
            and_(
                ClientIssue.created_at >= today_start,
                *conditions
            )
        ).group_by(ClientIssue.severity)
        
        result = await self.db.execute(created_query)
        created_by_severity = {row[0].value: row[1] for row in result.all()}
        
        # Active (unresolved) issues by severity
        active_query = select(
            ClientIssue.severity,
            func.count(ClientIssue.id)
        ).where(
            and_(
                ClientIssue.is_resolved == False,
                *conditions
            )
        ).group_by(ClientIssue.severity)
        
        result = await self.db.execute(active_query)
        active_by_severity = {row[0].value: row[1] for row in result.all()}
        
        # Issues resolved today
        resolved_query = select(func.count(ClientIssue.id)).where(
            and_(
                ClientIssue.is_resolved == True,
                ClientIssue.resolved_at >= today_start,
                *conditions
            )
        )
        result = await self.db.execute(resolved_query)
        issues_resolved_today = result.scalar() or 0
        
        return {
            "issues_created_today": {
                "red": created_by_severity.get("RED", 0),
                "yellow": created_by_severity.get("YELLOW", 0),
                "total": sum(created_by_severity.values())
            },
            "active_issues": {
                "red": active_by_severity.get("RED", 0),
                "yellow": active_by_severity.get("YELLOW", 0),
                "total": sum(active_by_severity.values())
            },
            "issues_resolved_today": issues_resolved_today,
        }
    
    async def get_decision_metrics(
        self,
        administration_id: Optional[UUID] = None,
    ) -> dict:
        """Get decision engine metrics."""
        today_start = self._get_today_start()
        
        # Build subquery for administration filter
        conditions = [AccountantDecision.decided_at >= today_start]
        
        # Decisions by type today
        decision_query = select(
            AccountantDecision.decision,
            func.count(AccountantDecision.id)
        ).where(and_(*conditions)).group_by(AccountantDecision.decision)
        
        result = await self.db.execute(decision_query)
        decisions_by_type = {row[0].value: row[1] for row in result.all()}
        
        # Execution status today
        execution_query = select(
            AccountantDecision.execution_status,
            func.count(AccountantDecision.id)
        ).where(and_(*conditions)).group_by(AccountantDecision.execution_status)
        
        result = await self.db.execute(execution_query)
        execution_by_status = {row[0].value: row[1] for row in result.all()}
        
        return {
            "decisions_today": {
                "approved": decisions_by_type.get("APPROVED", 0),
                "rejected": decisions_by_type.get("REJECTED", 0),
                "overridden": decisions_by_type.get("OVERRIDDEN", 0),
                "total": sum(decisions_by_type.values())
            },
            "execution_today": {
                "executed": execution_by_status.get("EXECUTED", 0),
                "failed": execution_by_status.get("FAILED", 0),
                "pending": execution_by_status.get("PENDING", 0),
            }
        }
    
    async def get_posting_metrics(
        self,
        administration_id: Optional[UUID] = None,
    ) -> dict:
        """Get journal entry/posting metrics."""
        today_start = self._get_today_start()
        
        conditions = []
        if administration_id:
            conditions.append(JournalEntry.administration_id == administration_id)
        
        # Postings created today
        posted_query = select(func.count(JournalEntry.id)).where(
            and_(
                JournalEntry.status == JournalEntryStatus.POSTED,
                JournalEntry.posted_at >= today_start,
                *conditions
            )
        )
        result = await self.db.execute(posted_query)
        postings_created_today = result.scalar() or 0
        
        # Draft entries
        draft_query = select(func.count(JournalEntry.id)).where(
            and_(
                JournalEntry.status == JournalEntryStatus.DRAFT,
                *conditions
            )
        )
        result = await self.db.execute(draft_query)
        draft_entries = result.scalar() or 0
        
        # Total entries by status
        status_query = select(
            JournalEntry.status,
            func.count(JournalEntry.id)
        )
        if conditions:
            status_query = status_query.where(and_(*conditions))
        status_query = status_query.group_by(JournalEntry.status)
        
        result = await self.db.execute(status_query)
        entries_by_status = {row[0].value: row[1] for row in result.all()}
        
        return {
            "postings_created_today": postings_created_today,
            "draft_entries": draft_entries,
            "entries_by_status": entries_by_status,
        }
    
    async def get_alert_metrics(
        self,
        administration_id: Optional[UUID] = None,
    ) -> dict:
        """Get alert metrics."""
        today_start = self._get_today_start()
        
        conditions = []
        if administration_id:
            conditions.append(Alert.administration_id == administration_id)
        
        # Active alerts by severity
        active_query = select(
            Alert.severity,
            func.count(Alert.id)
        ).where(
            and_(
                Alert.resolved_at.is_(None),
                *conditions
            )
        ).group_by(Alert.severity)
        
        result = await self.db.execute(active_query)
        active_by_severity = {row[0].value: row[1] for row in result.all()}
        
        # Alerts created today
        created_query = select(func.count(Alert.id)).where(
            and_(
                Alert.created_at >= today_start,
                *conditions
            )
        )
        result = await self.db.execute(created_query)
        alerts_created_today = result.scalar() or 0
        
        # Alerts resolved today
        resolved_query = select(func.count(Alert.id)).where(
            and_(
                Alert.resolved_at >= today_start,
                *conditions
            )
        )
        result = await self.db.execute(resolved_query)
        alerts_resolved_today = result.scalar() or 0
        
        return {
            "active_alerts": {
                "critical": active_by_severity.get("CRITICAL", 0),
                "warning": active_by_severity.get("WARNING", 0),
                "info": active_by_severity.get("INFO", 0),
                "total": sum(active_by_severity.values())
            },
            "alerts_created_today": alerts_created_today,
            "alerts_resolved_today": alerts_resolved_today,
        }
    
    async def get_all_metrics(
        self,
        administration_id: Optional[UUID] = None,
    ) -> dict:
        """Get all metrics in a structured format."""
        document_metrics = await self.get_document_metrics(administration_id)
        issue_metrics = await self.get_issue_metrics(administration_id)
        decision_metrics = await self.get_decision_metrics(administration_id)
        posting_metrics = await self.get_posting_metrics(administration_id)
        alert_metrics = await self.get_alert_metrics(administration_id)
        
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "scope": "client" if administration_id else "global",
            "administration_id": str(administration_id) if administration_id else None,
            "documents": document_metrics,
            "issues": issue_metrics,
            "decisions": decision_metrics,
            "postings": posting_metrics,
            "alerts": alert_metrics,
            # Summary metrics for quick health check
            "summary": {
                "documents_processed_today": document_metrics["documents_processed_today"],
                "issues_created_today": issue_metrics["issues_created_today"]["total"],
                "red_issues_active": issue_metrics["active_issues"]["red"],
                "decisions_approved_today": decision_metrics["decisions_today"]["approved"],
                "decisions_rejected_today": decision_metrics["decisions_today"]["rejected"],
                "postings_created_today": posting_metrics["postings_created_today"],
                "failed_operations_count": (
                    document_metrics["documents_failed_today"] +
                    decision_metrics["execution_today"]["failed"]
                ),
                "active_critical_alerts": alert_metrics["active_alerts"]["critical"],
            }
        }
