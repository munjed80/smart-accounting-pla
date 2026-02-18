"""
Structured Logging Service

Provides accounting-aware structured logging for key events:
- Document uploaded / posted / rejected
- Journal entry created / reversed
- VAT report generated
- Period review / finalize / lock
- Decision approved / auto-suggested

Each log entry includes:
- client_id
- period_id (if applicable)
- entity_type (document, journal_entry, vat_report, period)
- entity_id
- severity (INFO/WARN/ERROR)
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Any
from uuid import UUID
from enum import Enum


class LogSeverity(str, Enum):
    """Log severity levels."""
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"


class LogEntityType(str, Enum):
    """Entity types for structured logging."""
    DOCUMENT = "document"
    JOURNAL_ENTRY = "journal_entry"
    VAT_REPORT = "vat_report"
    PERIOD = "period"
    DECISION = "decision"
    ISSUE = "issue"
    ALERT = "alert"
    SYSTEM = "system"
    DIGIPOORT = "digipoort"  # Digipoort submission events


class StructuredLogger:
    """
    Structured logging service for accounting events.
    
    Logs are emitted in JSON format suitable for:
    - Application logs
    - Later Prometheus/metrics integration
    - Audit trail requirements
    """
    
    def __init__(self, logger_name: str = "accounting"):
        self.logger = logging.getLogger(logger_name)
        self._ensure_handler()
    
    def _ensure_handler(self):
        """Ensure logger has a proper handler configured."""
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter('%(message)s'))
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)
    
    def _serialize_uuid(self, value: Any) -> Any:
        """Serialize UUID values to strings."""
        if isinstance(value, UUID):
            return str(value)
        return value
    
    def _create_log_entry(
        self,
        event: str,
        severity: LogSeverity,
        entity_type: LogEntityType,
        entity_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        period_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        message: Optional[str] = None,
        **extra
    ) -> dict:
        """Create a structured log entry."""
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event": event,
            "severity": severity.value,
            "entity_type": entity_type.value,
        }
        
        if entity_id:
            entry["entity_id"] = str(entity_id)
        if client_id:
            entry["client_id"] = str(client_id)
        if period_id:
            entry["period_id"] = str(period_id)
        if user_id:
            entry["user_id"] = str(user_id)
        if message:
            entry["message"] = message
        
        # Add extra fields with UUID serialization
        for key, value in extra.items():
            entry[key] = self._serialize_uuid(value)
        
        return entry
    
    def _log(self, entry: dict, severity: LogSeverity):
        """Emit the log entry at the appropriate level."""
        log_str = json.dumps(entry)
        if severity == LogSeverity.ERROR:
            self.logger.error(log_str)
        elif severity == LogSeverity.WARN:
            self.logger.warning(log_str)
        else:
            self.logger.info(log_str)
    
    # Document events
    def document_uploaded(
        self,
        document_id: UUID,
        client_id: UUID,
        filename: str,
        file_size: int,
        user_id: Optional[UUID] = None
    ):
        """Log document upload event."""
        entry = self._create_log_entry(
            event="document.uploaded",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.DOCUMENT,
            entity_id=document_id,
            client_id=client_id,
            user_id=user_id,
            message=f"Document uploaded: {filename}",
            filename=filename,
            file_size=file_size
        )
        self._log(entry, LogSeverity.INFO)
    
    def document_posted(
        self,
        document_id: UUID,
        client_id: UUID,
        journal_entry_id: UUID,
        period_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None
    ):
        """Log document posted event."""
        entry = self._create_log_entry(
            event="document.posted",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.DOCUMENT,
            entity_id=document_id,
            client_id=client_id,
            period_id=period_id,
            user_id=user_id,
            message="Document posted to journal",
            journal_entry_id=str(journal_entry_id)
        )
        self._log(entry, LogSeverity.INFO)
    
    def document_rejected(
        self,
        document_id: UUID,
        client_id: UUID,
        reason: str,
        user_id: Optional[UUID] = None
    ):
        """Log document rejection event."""
        entry = self._create_log_entry(
            event="document.rejected",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.DOCUMENT,
            entity_id=document_id,
            client_id=client_id,
            user_id=user_id,
            message=f"Document rejected: {reason}",
            rejection_reason=reason
        )
        self._log(entry, LogSeverity.INFO)
    
    def document_processing_failed(
        self,
        document_id: UUID,
        client_id: UUID,
        error: str
    ):
        """Log document processing failure."""
        entry = self._create_log_entry(
            event="document.processing_failed",
            severity=LogSeverity.ERROR,
            entity_type=LogEntityType.DOCUMENT,
            entity_id=document_id,
            client_id=client_id,
            message=f"Document processing failed: {error}",
            error=error
        )
        self._log(entry, LogSeverity.ERROR)
    
    # Journal entry events
    def journal_entry_created(
        self,
        journal_entry_id: UUID,
        client_id: UUID,
        period_id: Optional[UUID] = None,
        entry_number: Optional[str] = None,
        total_amount: Optional[float] = None,
        user_id: Optional[UUID] = None
    ):
        """Log journal entry creation."""
        entry = self._create_log_entry(
            event="journal_entry.created",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.JOURNAL_ENTRY,
            entity_id=journal_entry_id,
            client_id=client_id,
            period_id=period_id,
            user_id=user_id,
            message=f"Journal entry created: {entry_number or journal_entry_id}",
            entry_number=entry_number,
            total_amount=total_amount
        )
        self._log(entry, LogSeverity.INFO)
    
    def journal_entry_reversed(
        self,
        journal_entry_id: UUID,
        reversal_entry_id: UUID,
        client_id: UUID,
        period_id: Optional[UUID] = None,
        reason: Optional[str] = None,
        user_id: Optional[UUID] = None
    ):
        """Log journal entry reversal."""
        entry = self._create_log_entry(
            event="journal_entry.reversed",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.JOURNAL_ENTRY,
            entity_id=journal_entry_id,
            client_id=client_id,
            period_id=period_id,
            user_id=user_id,
            message="Journal entry reversed",
            reversal_entry_id=str(reversal_entry_id),
            reason=reason
        )
        self._log(entry, LogSeverity.INFO)
    
    # VAT report events
    def vat_report_generated(
        self,
        client_id: UUID,
        period_id: UUID,
        report_type: str = "BTW_AANGIFTE",
        has_anomalies: bool = False,
        anomaly_count: int = 0,
        user_id: Optional[UUID] = None
    ):
        """Log VAT report generation."""
        severity = LogSeverity.WARN if has_anomalies else LogSeverity.INFO
        entry = self._create_log_entry(
            event="vat_report.generated",
            severity=severity,
            entity_type=LogEntityType.VAT_REPORT,
            client_id=client_id,
            period_id=period_id,
            user_id=user_id,
            message=f"VAT report generated ({report_type})" + (f" with {anomaly_count} anomalies" if has_anomalies else ""),
            report_type=report_type,
            has_anomalies=has_anomalies,
            anomaly_count=anomaly_count
        )
        self._log(entry, severity)
    
    # Period events
    def period_review_started(
        self,
        period_id: UUID,
        client_id: UUID,
        period_name: str,
        user_id: Optional[UUID] = None
    ):
        """Log period review start."""
        entry = self._create_log_entry(
            event="period.review_started",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.PERIOD,
            entity_id=period_id,
            client_id=client_id,
            user_id=user_id,
            message=f"Period review started: {period_name}",
            period_name=period_name
        )
        self._log(entry, LogSeverity.INFO)
    
    def period_finalized(
        self,
        period_id: UUID,
        client_id: UUID,
        period_name: str,
        snapshot_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None
    ):
        """Log period finalization."""
        entry = self._create_log_entry(
            event="period.finalized",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.PERIOD,
            entity_id=period_id,
            client_id=client_id,
            user_id=user_id,
            message=f"Period finalized: {period_name}",
            period_name=period_name,
            snapshot_id=str(snapshot_id) if snapshot_id else None
        )
        self._log(entry, LogSeverity.INFO)
    
    def period_locked(
        self,
        period_id: UUID,
        client_id: UUID,
        period_name: str,
        user_id: Optional[UUID] = None
    ):
        """Log period lock."""
        entry = self._create_log_entry(
            event="period.locked",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.PERIOD,
            entity_id=period_id,
            client_id=client_id,
            user_id=user_id,
            message=f"Period locked: {period_name}",
            period_name=period_name
        )
        self._log(entry, LogSeverity.INFO)
    
    def period_posting_blocked(
        self,
        period_id: UUID,
        client_id: UUID,
        period_status: str,
        attempted_action: str,
        user_id: Optional[UUID] = None
    ):
        """Log blocked posting attempt to finalized/locked period."""
        entry = self._create_log_entry(
            event="period.posting_blocked",
            severity=LogSeverity.WARN,
            entity_type=LogEntityType.PERIOD,
            entity_id=period_id,
            client_id=client_id,
            user_id=user_id,
            message=f"Posting blocked: period is {period_status}",
            period_status=period_status,
            attempted_action=attempted_action
        )
        self._log(entry, LogSeverity.WARN)
    
    # Decision events
    def decision_approved(
        self,
        decision_id: UUID,
        issue_id: UUID,
        client_id: UUID,
        action_type: str,
        is_auto_suggested: bool = False,
        user_id: Optional[UUID] = None
    ):
        """Log decision approval."""
        entry = self._create_log_entry(
            event="decision.approved",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.DECISION,
            entity_id=decision_id,
            client_id=client_id,
            user_id=user_id,
            message=f"Decision approved: {action_type}" + (" (auto-suggested)" if is_auto_suggested else ""),
            issue_id=str(issue_id),
            action_type=action_type,
            is_auto_suggested=is_auto_suggested
        )
        self._log(entry, LogSeverity.INFO)
    
    def decision_rejected(
        self,
        decision_id: UUID,
        issue_id: UUID,
        client_id: UUID,
        action_type: str,
        reason: Optional[str] = None,
        user_id: Optional[UUID] = None
    ):
        """Log decision rejection."""
        entry = self._create_log_entry(
            event="decision.rejected",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.DECISION,
            entity_id=decision_id,
            client_id=client_id,
            user_id=user_id,
            message=f"Decision rejected: {action_type}",
            issue_id=str(issue_id),
            action_type=action_type,
            reason=reason
        )
        self._log(entry, LogSeverity.INFO)
    
    # Alert events
    def alert_created(
        self,
        alert_id: UUID,
        alert_code: str,
        severity: str,
        client_id: Optional[UUID] = None
    ):
        """Log alert creation."""
        log_severity = LogSeverity.WARN if severity == "CRITICAL" else LogSeverity.INFO
        entry = self._create_log_entry(
            event="alert.created",
            severity=log_severity,
            entity_type=LogEntityType.ALERT,
            entity_id=alert_id,
            client_id=client_id,
            message=f"Alert created: {alert_code}",
            alert_code=alert_code,
            alert_severity=severity
        )
        self._log(entry, log_severity)
    
    def alert_resolved(
        self,
        alert_id: UUID,
        alert_code: str,
        auto_resolved: bool = False,
        client_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None
    ):
        """Log alert resolution."""
        entry = self._create_log_entry(
            event="alert.resolved",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.ALERT,
            entity_id=alert_id,
            client_id=client_id,
            user_id=user_id,
            message=f"Alert resolved: {alert_code}" + (" (auto)" if auto_resolved else ""),
            alert_code=alert_code,
            auto_resolved=auto_resolved
        )
        self._log(entry, LogSeverity.INFO)
    
    # System events
    def operation_failed(
        self,
        operation: str,
        error: str,
        client_id: Optional[UUID] = None,
        retry_count: int = 0
    ):
        """Log failed operation."""
        entry = self._create_log_entry(
            event="system.operation_failed",
            severity=LogSeverity.ERROR,
            entity_type=LogEntityType.SYSTEM,
            client_id=client_id,
            message=f"Operation failed: {operation}",
            operation=operation,
            error=error,
            retry_count=retry_count
        )
        self._log(entry, LogSeverity.ERROR)
    
    def rate_limit_exceeded(
        self,
        operation: str,
        client_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        limit: Optional[int] = None
    ):
        """Log rate limit exceeded."""
        entry = self._create_log_entry(
            event="system.rate_limit_exceeded",
            severity=LogSeverity.WARN,
            entity_type=LogEntityType.SYSTEM,
            client_id=client_id,
            user_id=user_id,
            message=f"Rate limit exceeded for: {operation}",
            operation=operation,
            limit=limit
        )
        self._log(entry, LogSeverity.WARN)
    
    # Digipoort events
    def digipoort_queued(
        self,
        submission_id: UUID,
        client_id: UUID,
        period_id: UUID,
        correlation_id: str,
        submission_type: str,
        user_id: Optional[UUID] = None
    ):
        """Log Digipoort submission queued event."""
        entry = self._create_log_entry(
            event="digipoort.queued",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.DIGIPOORT,
            entity_id=submission_id,
            client_id=client_id,
            period_id=period_id,
            user_id=user_id,
            message=f"Digipoort submission queued: {submission_type}",
            correlation_id=correlation_id,
            submission_type=submission_type
        )
        self._log(entry, LogSeverity.INFO)
    
    def digipoort_sent(
        self,
        submission_id: UUID,
        client_id: UUID,
        period_id: UUID,
        correlation_id: str,
        message_id: str,
        submission_type: str,
        sandbox_mode: bool = True
    ):
        """Log Digipoort submission sent event."""
        entry = self._create_log_entry(
            event="digipoort.sent",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.DIGIPOORT,
            entity_id=submission_id,
            client_id=client_id,
            period_id=period_id,
            message=f"Digipoort submission sent: {submission_type}" + (" (sandbox)" if sandbox_mode else ""),
            correlation_id=correlation_id,
            message_id=message_id,
            submission_type=submission_type,
            sandbox_mode=sandbox_mode
        )
        self._log(entry, LogSeverity.INFO)
    
    def digipoort_accepted(
        self,
        submission_id: UUID,
        client_id: UUID,
        period_id: UUID,
        correlation_id: str,
        message_id: str,
        submission_type: str
    ):
        """Log Digipoort submission accepted event."""
        entry = self._create_log_entry(
            event="digipoort.accepted",
            severity=LogSeverity.INFO,
            entity_type=LogEntityType.DIGIPOORT,
            entity_id=submission_id,
            client_id=client_id,
            period_id=period_id,
            message=f"Digipoort submission accepted: {submission_type}",
            correlation_id=correlation_id,
            message_id=message_id,
            submission_type=submission_type
        )
        self._log(entry, LogSeverity.INFO)
    
    def digipoort_rejected(
        self,
        submission_id: UUID,
        client_id: UUID,
        period_id: UUID,
        correlation_id: str,
        message_id: Optional[str],
        submission_type: str,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None
    ):
        """Log Digipoort submission rejected event."""
        entry = self._create_log_entry(
            event="digipoort.rejected",
            severity=LogSeverity.ERROR,
            entity_type=LogEntityType.DIGIPOORT,
            entity_id=submission_id,
            client_id=client_id,
            period_id=period_id,
            message=f"Digipoort submission rejected: {submission_type}",
            correlation_id=correlation_id,
            message_id=message_id,
            submission_type=submission_type,
            error_code=error_code,
            error_message=error_message
        )
        self._log(entry, LogSeverity.ERROR)
    
    def digipoort_error(
        self,
        submission_id: UUID,
        client_id: UUID,
        period_id: UUID,
        correlation_id: str,
        submission_type: str,
        error: str
    ):
        """Log Digipoort submission error event."""
        entry = self._create_log_entry(
            event="digipoort.error",
            severity=LogSeverity.ERROR,
            entity_type=LogEntityType.DIGIPOORT,
            entity_id=submission_id,
            client_id=client_id,
            period_id=period_id,
            message=f"Digipoort submission error: {submission_type}",
            correlation_id=correlation_id,
            submission_type=submission_type,
            error=error
        )
        self._log(entry, LogSeverity.ERROR)


# Global logger instance
accounting_logger = StructuredLogger()
