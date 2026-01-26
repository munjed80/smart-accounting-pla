"""
Alert Service

Implements server-side alert rules for:
- RED issues unresolved for N days
- VAT anomalies detected during REVIEW
- Attempted posting into FINALIZED/LOCKED period
- Document backlog above threshold
- Failed background operations

Alerts are stored in the database and displayed in the UI.
No email/SMS - in-app only.
"""
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from uuid import UUID

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alerts import Alert, AlertSeverity, AlertCode
from app.models.issues import ClientIssue, IssueSeverity
from app.models.document import Document, DocumentStatus
from app.models.ledger import AccountingPeriod, PeriodStatus
from app.services.logging import accounting_logger


class AlertService:
    """
    Service for managing domain-specific alerts.
    
    Provides methods to:
    - Create alerts based on rules
    - Acknowledge/resolve alerts
    - Query active alerts
    - Auto-resolve alerts when conditions are met
    """
    
    # Configuration for alert rules
    RED_ISSUE_UNRESOLVED_DAYS = 7  # Days before RED issue generates alert
    DOCUMENT_BACKLOG_THRESHOLD = 20  # Documents before generating backlog alert
    STUCK_PROCESSING_MINUTES = 30  # Minutes before document is considered stuck
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_alert(
        self,
        alert_code: str,
        severity: AlertSeverity,
        title: str,
        message: str,
        administration_id: Optional[UUID] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[UUID] = None,
        context: Optional[dict] = None,
    ) -> Alert:
        """Create a new alert."""
        alert = Alert(
            alert_code=alert_code,
            severity=severity,
            title=title,
            message=message,
            administration_id=administration_id,
            entity_type=entity_type,
            entity_id=entity_id,
            context=json.dumps(context) if context else None,
        )
        self.db.add(alert)
        await self.db.flush()
        
        # Log alert creation
        accounting_logger.alert_created(
            alert_id=alert.id,
            alert_code=alert_code,
            severity=severity.value,
            client_id=administration_id
        )
        
        return alert
    
    async def acknowledge_alert(
        self,
        alert_id: UUID,
        user_id: UUID,
    ) -> Optional[Alert]:
        """Acknowledge an alert."""
        result = await self.db.execute(
            select(Alert).where(Alert.id == alert_id)
        )
        alert = result.scalar_one_or_none()
        
        if alert and not alert.acknowledged_at:
            alert.acknowledged_at = datetime.now(timezone.utc)
            alert.acknowledged_by_id = user_id
            await self.db.flush()
        
        return alert
    
    async def resolve_alert(
        self,
        alert_id: UUID,
        user_id: UUID,
        notes: Optional[str] = None,
        auto_resolved: bool = False,
    ) -> Optional[Alert]:
        """Resolve an alert."""
        result = await self.db.execute(
            select(Alert).where(Alert.id == alert_id)
        )
        alert = result.scalar_one_or_none()
        
        if alert and not alert.resolved_at:
            alert.resolved_at = datetime.now(timezone.utc)
            alert.resolved_by_id = user_id if not auto_resolved else None
            alert.resolution_notes = notes
            alert.auto_resolved = auto_resolved
            await self.db.flush()
            
            # Log alert resolution
            accounting_logger.alert_resolved(
                alert_id=alert.id,
                alert_code=alert.alert_code,
                auto_resolved=auto_resolved,
                client_id=alert.administration_id,
                user_id=user_id if not auto_resolved else None
            )
        
        return alert
    
    async def get_active_alerts(
        self,
        administration_id: Optional[UUID] = None,
        severity: Optional[AlertSeverity] = None,
        limit: int = 100,
    ) -> List[Alert]:
        """Get active (unresolved) alerts."""
        query = select(Alert).where(Alert.resolved_at.is_(None))
        
        if administration_id:
            query = query.where(
                or_(
                    Alert.administration_id == administration_id,
                    Alert.administration_id.is_(None)  # System-wide alerts
                )
            )
        
        if severity:
            query = query.where(Alert.severity == severity)
        
        query = query.order_by(
            Alert.severity.desc(),  # CRITICAL first
            Alert.created_at.desc()
        ).limit(limit)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def get_alert_by_id(self, alert_id: UUID) -> Optional[Alert]:
        """Get a single alert by ID."""
        result = await self.db.execute(
            select(Alert).where(Alert.id == alert_id)
        )
        return result.scalar_one_or_none()
    
    async def find_existing_alert(
        self,
        alert_code: str,
        administration_id: Optional[UUID] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[UUID] = None,
    ) -> Optional[Alert]:
        """Find an existing active alert with the same criteria."""
        query = select(Alert).where(
            and_(
                Alert.alert_code == alert_code,
                Alert.resolved_at.is_(None)
            )
        )
        
        if administration_id:
            query = query.where(Alert.administration_id == administration_id)
        else:
            query = query.where(Alert.administration_id.is_(None))
        
        if entity_type:
            query = query.where(Alert.entity_type == entity_type)
        if entity_id:
            query = query.where(Alert.entity_id == entity_id)
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    # Alert rule implementations
    
    async def check_red_issues_unresolved(
        self,
        administration_id: UUID,
    ) -> List[Alert]:
        """Check for RED issues unresolved for too long and create alerts."""
        alerts_created = []
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=self.RED_ISSUE_UNRESOLVED_DAYS)
        
        # Find RED issues older than threshold
        result = await self.db.execute(
            select(ClientIssue).where(
                and_(
                    ClientIssue.administration_id == administration_id,
                    ClientIssue.severity == IssueSeverity.RED,
                    ClientIssue.is_resolved == False,
                    ClientIssue.created_at < cutoff_date
                )
            )
        )
        issues = list(result.scalars().all())
        
        for issue in issues:
            # Check if alert already exists
            existing = await self.find_existing_alert(
                alert_code=AlertCode.RED_ISSUE_UNRESOLVED.value,
                administration_id=administration_id,
                entity_type="issue",
                entity_id=issue.id
            )
            
            if not existing:
                days_old = (datetime.now(timezone.utc) - issue.created_at.replace(tzinfo=timezone.utc)).days
                alert = await self.create_alert(
                    alert_code=AlertCode.RED_ISSUE_UNRESOLVED.value,
                    severity=AlertSeverity.CRITICAL,
                    title=f"RED issue unresolved for {days_old} days",
                    message=f"Issue '{issue.title}' has been unresolved for {days_old} days. Immediate action required.",
                    administration_id=administration_id,
                    entity_type="issue",
                    entity_id=issue.id,
                    context={"issue_code": issue.issue_code, "days_old": days_old}
                )
                alerts_created.append(alert)
        
        return alerts_created
    
    async def check_document_backlog(
        self,
        administration_id: UUID,
    ) -> Optional[Alert]:
        """Check for high document backlog and create alert."""
        # Count documents needing review
        result = await self.db.execute(
            select(func.count(Document.id)).where(
                and_(
                    Document.administration_id == administration_id,
                    Document.status.in_([
                        DocumentStatus.UPLOADED,
                        DocumentStatus.PROCESSING,
                        DocumentStatus.EXTRACTED,
                        DocumentStatus.NEEDS_REVIEW
                    ])
                )
            )
        )
        backlog_count = result.scalar() or 0
        
        if backlog_count >= self.DOCUMENT_BACKLOG_THRESHOLD:
            # Check if alert already exists
            existing = await self.find_existing_alert(
                alert_code=AlertCode.DOCUMENT_BACKLOG_HIGH.value,
                administration_id=administration_id
            )
            
            if not existing:
                alert = await self.create_alert(
                    alert_code=AlertCode.DOCUMENT_BACKLOG_HIGH.value,
                    severity=AlertSeverity.WARNING,
                    title=f"Document backlog: {backlog_count} documents pending",
                    message=f"There are {backlog_count} documents waiting for processing or review. Consider reviewing pending documents.",
                    administration_id=administration_id,
                    entity_type="document",
                    context={"backlog_count": backlog_count}
                )
                return alert
        else:
            # Auto-resolve if backlog is now below threshold
            existing = await self.find_existing_alert(
                alert_code=AlertCode.DOCUMENT_BACKLOG_HIGH.value,
                administration_id=administration_id
            )
            if existing:
                await self.resolve_alert(
                    alert_id=existing.id,
                    user_id=None,
                    notes=f"Backlog reduced to {backlog_count} documents",
                    auto_resolved=True
                )
        
        return None
    
    async def check_stuck_documents(
        self,
        administration_id: UUID,
    ) -> List[Alert]:
        """Check for documents stuck in processing and create alerts."""
        alerts_created = []
        cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=self.STUCK_PROCESSING_MINUTES)
        
        result = await self.db.execute(
            select(Document).where(
                and_(
                    Document.administration_id == administration_id,
                    Document.status == DocumentStatus.PROCESSING,
                    Document.updated_at < cutoff_time
                )
            )
        )
        documents = list(result.scalars().all())
        
        for doc in documents:
            existing = await self.find_existing_alert(
                alert_code=AlertCode.DOCUMENT_STUCK_PROCESSING.value,
                administration_id=administration_id,
                entity_type="document",
                entity_id=doc.id
            )
            
            if not existing:
                minutes_stuck = int((datetime.now(timezone.utc) - doc.updated_at.replace(tzinfo=timezone.utc)).total_seconds() / 60)
                alert = await self.create_alert(
                    alert_code=AlertCode.DOCUMENT_STUCK_PROCESSING.value,
                    severity=AlertSeverity.WARNING,
                    title=f"Document stuck in processing",
                    message=f"Document '{doc.original_filename}' has been processing for {minutes_stuck} minutes.",
                    administration_id=administration_id,
                    entity_type="document",
                    entity_id=doc.id,
                    context={"filename": doc.original_filename, "minutes_stuck": minutes_stuck}
                )
                alerts_created.append(alert)
        
        return alerts_created
    
    async def create_posting_blocked_alert(
        self,
        administration_id: UUID,
        period_id: UUID,
        period_name: str,
        period_status: str,
        attempted_action: str,
        user_id: Optional[UUID] = None,
    ) -> Alert:
        """Create alert for blocked posting attempt to finalized/locked period."""
        alert_code = (
            AlertCode.POSTING_TO_LOCKED_PERIOD.value 
            if period_status == "LOCKED" 
            else AlertCode.POSTING_TO_FINALIZED_PERIOD.value
        )
        
        alert = await self.create_alert(
            alert_code=alert_code,
            severity=AlertSeverity.WARNING,
            title=f"Posting blocked: period is {period_status}",
            message=f"Attempted to {attempted_action} in period '{period_name}' which is {period_status}. No changes were made.",
            administration_id=administration_id,
            entity_type="period",
            entity_id=period_id,
            context={
                "period_name": period_name,
                "period_status": period_status,
                "attempted_action": attempted_action,
                "user_id": str(user_id) if user_id else None
            }
        )
        
        # Also log this event
        accounting_logger.period_posting_blocked(
            period_id=period_id,
            client_id=administration_id,
            period_status=period_status,
            attempted_action=attempted_action,
            user_id=user_id
        )
        
        return alert
    
    async def create_vat_anomalies_alert(
        self,
        administration_id: UUID,
        period_id: UUID,
        period_name: str,
        red_count: int,
        yellow_count: int,
        user_id: Optional[UUID] = None,
    ) -> Optional[Alert]:
        """Create alert for VAT anomalies detected during REVIEW."""
        if red_count == 0 and yellow_count == 0:
            return None
        
        severity = AlertSeverity.CRITICAL if red_count > 0 else AlertSeverity.WARNING
        
        # Check if alert already exists
        existing = await self.find_existing_alert(
            alert_code=AlertCode.VAT_ANOMALIES_DETECTED.value,
            administration_id=administration_id,
            entity_type="period",
            entity_id=period_id
        )
        
        if existing:
            return existing
        
        alert = await self.create_alert(
            alert_code=AlertCode.VAT_ANOMALIES_DETECTED.value,
            severity=severity,
            title=f"VAT anomalies detected: {red_count} errors, {yellow_count} warnings",
            message=f"VAT report for period '{period_name}' has {red_count} error(s) and {yellow_count} warning(s) that need attention.",
            administration_id=administration_id,
            entity_type="period",
            entity_id=period_id,
            context={
                "period_name": period_name,
                "red_count": red_count,
                "yellow_count": yellow_count
            }
        )
        
        return alert
    
    async def create_operation_failed_alert(
        self,
        operation: str,
        error: str,
        administration_id: Optional[UUID] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[UUID] = None,
        retry_count: int = 0,
    ) -> Alert:
        """Create alert for failed background operation."""
        alert = await self.create_alert(
            alert_code=AlertCode.BACKGROUND_OPERATION_FAILED.value,
            severity=AlertSeverity.CRITICAL,
            title=f"Operation failed: {operation}",
            message=f"Background operation '{operation}' failed after {retry_count} retries. Error: {error}",
            administration_id=administration_id,
            entity_type=entity_type,
            entity_id=entity_id,
            context={
                "operation": operation,
                "error": error,
                "retry_count": retry_count
            }
        )
        
        # Also log this
        accounting_logger.operation_failed(
            operation=operation,
            error=error,
            client_id=administration_id,
            retry_count=retry_count
        )
        
        return alert
    
    async def run_all_checks(
        self,
        administration_id: UUID,
    ) -> List[Alert]:
        """Run all alert checks for an administration."""
        all_alerts = []
        
        # Check RED issues
        alerts = await self.check_red_issues_unresolved(administration_id)
        all_alerts.extend(alerts)
        
        # Check document backlog
        alert = await self.check_document_backlog(administration_id)
        if alert:
            all_alerts.append(alert)
        
        # Check stuck documents
        alerts = await self.check_stuck_documents(administration_id)
        all_alerts.extend(alerts)
        
        return all_alerts
    
    async def get_alert_counts(
        self,
        administration_id: Optional[UUID] = None,
    ) -> dict:
        """Get counts of active alerts by severity."""
        query = select(
            Alert.severity,
            func.count(Alert.id)
        ).where(Alert.resolved_at.is_(None))
        
        if administration_id:
            query = query.where(
                or_(
                    Alert.administration_id == administration_id,
                    Alert.administration_id.is_(None)
                )
            )
        
        query = query.group_by(Alert.severity)
        
        result = await self.db.execute(query)
        counts = {row[0].value: row[1] for row in result.all()}
        
        return {
            "critical": counts.get("CRITICAL", 0),
            "warning": counts.get("WARNING", 0),
            "info": counts.get("INFO", 0),
            "total": sum(counts.values())
        }
