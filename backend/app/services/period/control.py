"""
Period Control Service

Handles period state transitions and finalization workflow:
- OPEN → REVIEW → FINALIZED → LOCKED
- Validation checks before transitions
- Snapshot generation on finalization
- Audit logging for all actions

All operations are:
- Transactional: uses DB transactions
- Multi-tenant: always scoped by administration_id
- Auditable: every action is logged
"""
import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import asdict
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ledger import (
    AccountingPeriod, 
    PeriodStatus, 
    PeriodSnapshot, 
    PeriodAuditLog,
    JournalEntry,
    JournalEntryStatus,
)
from app.models.issues import ClientIssue, IssueSeverity, ValidationRun
from app.services.validation import ConsistencyEngine
from app.services.reports import ReportService


class PeriodControlError(Exception):
    """Base exception for period control operations."""
    pass


class PeriodNotFoundError(PeriodControlError):
    """Raised when a period is not found."""
    pass


class PeriodStateError(PeriodControlError):
    """Raised when a period state transition is invalid."""
    pass


class FinalizationPrerequisiteError(PeriodControlError):
    """Raised when finalization prerequisites are not met."""
    def __init__(self, message: str, red_issues: List[Dict] = None, yellow_issues: List[Dict] = None):
        super().__init__(message)
        self.red_issues = red_issues or []
        self.yellow_issues = yellow_issues or []


class PeriodControlService:
    """
    Service for period control and finalization workflow.
    
    Key features:
    - State machine for period status transitions
    - Validation before finalization
    - Snapshot generation for audit trail
    - Complete audit logging
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def get_period(self, period_id: uuid.UUID) -> AccountingPeriod:
        """Get a period by ID with validation."""
        result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.id == period_id)
            .where(AccountingPeriod.administration_id == self.administration_id)
        )
        period = result.scalar_one_or_none()
        
        if not period:
            raise PeriodNotFoundError(f"Period {period_id} not found")
        
        return period
    
    async def get_period_with_validation_status(
        self, 
        period_id: uuid.UUID
    ) -> Tuple[AccountingPeriod, Dict[str, Any]]:
        """
        Get a period along with its current validation status.
        
        Returns:
            Tuple of (period, validation_status)
            
        validation_status contains:
            - red_issues: list of blocking issues
            - yellow_issues: list of warnings
            - can_finalize: bool indicating if period can be finalized
            - validation_summary: dict with issue counts
        """
        period = await self.get_period(period_id)
        
        # Get unresolved issues for this period
        issues_result = await self.db.execute(
            select(ClientIssue)
            .where(ClientIssue.administration_id == self.administration_id)
            .where(ClientIssue.is_resolved == False)
        )
        issues = issues_result.scalars().all()
        
        # Filter issues that relate to this period (by date range)
        period_issues = []
        for issue in issues:
            # Check if issue's journal entry is in this period
            if issue.journal_entry_id:
                je_result = await self.db.execute(
                    select(JournalEntry)
                    .where(JournalEntry.id == issue.journal_entry_id)
                    .where(JournalEntry.period_id == period_id)
                )
                if je_result.scalar_one_or_none():
                    period_issues.append(issue)
            else:
                # Include general issues that don't have specific journal entries
                period_issues.append(issue)
        
        red_issues = [
            {
                "id": str(i.id),
                "code": i.issue_code,
                "title": i.title,
                "description": i.description,
                "suggested_action": i.suggested_action,
            }
            for i in period_issues if i.severity == IssueSeverity.RED
        ]
        
        yellow_issues = [
            {
                "id": str(i.id),
                "code": i.issue_code,
                "title": i.title,
                "description": i.description,
                "suggested_action": i.suggested_action,
            }
            for i in period_issues if i.severity == IssueSeverity.YELLOW
        ]
        
        validation_status = {
            "red_issues": red_issues,
            "yellow_issues": yellow_issues,
            "can_finalize": len(red_issues) == 0,
            "validation_summary": {
                "total_issues": len(period_issues),
                "red_count": len(red_issues),
                "yellow_count": len(yellow_issues),
            }
        }
        
        return period, validation_status
    
    async def start_review(
        self,
        period_id: uuid.UUID,
        user_id: uuid.UUID,
        notes: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[AccountingPeriod, ValidationRun]:
        """
        Start the review process for a period.
        
        Transitions: OPEN → REVIEW
        
        This triggers a full validation run and puts the period under review.
        """
        period = await self.get_period(period_id)
        
        # Validate state transition
        if period.status not in (PeriodStatus.OPEN,):
            raise PeriodStateError(
                f"Cannot start review: period is in {period.status.value} status. "
                f"Only OPEN periods can enter REVIEW."
            )
        
        from_status = period.status.value
        
        # Run full validation
        engine = ConsistencyEngine(self.db, self.administration_id)
        validation_run = await engine.run_full_validation(triggered_by_id=user_id)
        
        # Update period status
        period.status = PeriodStatus.REVIEW
        period.review_started_at = datetime.now(timezone.utc)
        period.review_started_by_id = user_id
        
        # Create audit log
        audit_log = PeriodAuditLog(
            period_id=period_id,
            administration_id=self.administration_id,
            action="REVIEW_START",
            from_status=from_status,
            to_status=PeriodStatus.REVIEW.value,
            performed_by_id=user_id,
            notes=notes,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(audit_log)
        
        await self.db.commit()
        await self.db.refresh(period)
        
        return period, validation_run
    
    async def finalize_period(
        self,
        period_id: uuid.UUID,
        user_id: uuid.UUID,
        acknowledged_yellow_issues: Optional[List[str]] = None,
        notes: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[AccountingPeriod, PeriodSnapshot]:
        """
        Finalize a period after review.
        
        Transitions: OPEN/REVIEW → FINALIZED
        
        Prerequisites:
        - All RED issues must be resolved
        - YELLOW issues must be explicitly acknowledged
        
        Actions:
        - Creates immutable snapshot of all financial reports
        - Logs the finalization action
        - Prevents further modifications (only reversals allowed)
        """
        period = await self.get_period(period_id)
        
        # Validate state transition
        if period.status not in (PeriodStatus.OPEN, PeriodStatus.REVIEW):
            raise PeriodStateError(
                f"Cannot finalize: period is in {period.status.value} status. "
                f"Only OPEN or REVIEW periods can be finalized."
            )
        
        # Check prerequisites
        period, validation_status = await self.get_period_with_validation_status(period_id)
        
        # Block if RED issues exist
        if validation_status["red_issues"]:
            raise FinalizationPrerequisiteError(
                f"Cannot finalize: {len(validation_status['red_issues'])} RED issues must be resolved first.",
                red_issues=validation_status["red_issues"],
                yellow_issues=validation_status["yellow_issues"],
            )
        
        # Check YELLOW issue acknowledgment
        yellow_issue_ids = {i["id"] for i in validation_status["yellow_issues"]}
        acknowledged_ids = set(acknowledged_yellow_issues or [])
        
        unacknowledged = yellow_issue_ids - acknowledged_ids
        if unacknowledged:
            raise FinalizationPrerequisiteError(
                f"Cannot finalize: {len(unacknowledged)} YELLOW issues require explicit acknowledgment.",
                yellow_issues=[
                    i for i in validation_status["yellow_issues"] 
                    if i["id"] in unacknowledged
                ],
            )
        
        from_status = period.status.value
        
        # Generate snapshot
        snapshot = await self._create_finalization_snapshot(
            period, user_id, acknowledged_yellow_issues, validation_status
        )
        
        # Update period status
        period.status = PeriodStatus.FINALIZED
        period.finalized_at = datetime.now(timezone.utc)
        period.finalized_by_id = user_id
        period.is_closed = True
        period.closed_at = period.finalized_at
        
        # Create audit log
        audit_log = PeriodAuditLog(
            period_id=period_id,
            administration_id=self.administration_id,
            action="FINALIZE",
            from_status=from_status,
            to_status=PeriodStatus.FINALIZED.value,
            performed_by_id=user_id,
            notes=notes,
            ip_address=ip_address,
            user_agent=user_agent,
            snapshot_id=snapshot.id,
        )
        self.db.add(audit_log)
        
        await self.db.commit()
        await self.db.refresh(period)
        await self.db.refresh(snapshot)
        
        return period, snapshot
    
    async def lock_period(
        self,
        period_id: uuid.UUID,
        user_id: uuid.UUID,
        notes: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AccountingPeriod:
        """
        Lock a finalized period (irreversible).
        
        Transitions: FINALIZED → LOCKED
        
        This is a hard lock - the period becomes completely immutable.
        Even reversals cannot be made into this period.
        """
        period = await self.get_period(period_id)
        
        # Validate state transition
        if period.status != PeriodStatus.FINALIZED:
            raise PeriodStateError(
                f"Cannot lock: period is in {period.status.value} status. "
                f"Only FINALIZED periods can be locked."
            )
        
        from_status = period.status.value
        
        # Update period status
        period.status = PeriodStatus.LOCKED
        period.locked_at = datetime.now(timezone.utc)
        period.locked_by_id = user_id
        
        # Create audit log
        audit_log = PeriodAuditLog(
            period_id=period_id,
            administration_id=self.administration_id,
            action="LOCK",
            from_status=from_status,
            to_status=PeriodStatus.LOCKED.value,
            performed_by_id=user_id,
            notes=notes,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(audit_log)
        
        await self.db.commit()
        await self.db.refresh(period)
        
        return period
    
    async def get_snapshot(self, period_id: uuid.UUID) -> Optional[PeriodSnapshot]:
        """Get the finalization snapshot for a period."""
        result = await self.db.execute(
            select(PeriodSnapshot)
            .where(PeriodSnapshot.period_id == period_id)
            .where(PeriodSnapshot.administration_id == self.administration_id)
            .where(PeriodSnapshot.snapshot_type == "FINALIZATION")
            .order_by(PeriodSnapshot.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
    
    async def get_audit_logs(
        self, 
        period_id: uuid.UUID,
        limit: int = 50,
    ) -> List[PeriodAuditLog]:
        """Get audit logs for a period."""
        result = await self.db.execute(
            select(PeriodAuditLog)
            .where(PeriodAuditLog.period_id == period_id)
            .where(PeriodAuditLog.administration_id == self.administration_id)
            .order_by(PeriodAuditLog.performed_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def get_next_open_period(
        self, 
        after_date: date
    ) -> Optional[AccountingPeriod]:
        """
        Find the next OPEN period after a given date.
        
        Used for determining where reversal entries should go.
        """
        result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.administration_id == self.administration_id)
            .where(AccountingPeriod.status.in_([PeriodStatus.OPEN, PeriodStatus.REVIEW]))
            .where(AccountingPeriod.start_date > after_date)
            .order_by(AccountingPeriod.start_date)
            .limit(1)
        )
        return result.scalar_one_or_none()
    
    async def check_period_allows_posting(
        self, 
        entry_date: date
    ) -> Tuple[bool, Optional[AccountingPeriod], Optional[str]]:
        """
        Check if posting is allowed for a given entry date.
        
        Returns:
            Tuple of (allowed, period, error_message)
        """
        # Find the period for this date
        result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.administration_id == self.administration_id)
            .where(AccountingPeriod.start_date <= entry_date)
            .where(AccountingPeriod.end_date >= entry_date)
        )
        period = result.scalar_one_or_none()
        
        if not period:
            # No period defined - allow posting
            return True, None, None
        
        if period.status == PeriodStatus.LOCKED:
            return False, period, f"Period '{period.name}' is LOCKED and cannot accept any entries."
        
        if period.status == PeriodStatus.FINALIZED:
            return False, period, (
                f"Period '{period.name}' is FINALIZED. "
                f"New entries must be posted as reversals in a subsequent open period."
            )
        
        return True, period, None
    
    async def _create_finalization_snapshot(
        self,
        period: AccountingPeriod,
        user_id: uuid.UUID,
        acknowledged_yellow_issues: Optional[List[str]],
        validation_status: Dict[str, Any],
    ) -> PeriodSnapshot:
        """Create an immutable snapshot of the period's financial state."""
        report_service = ReportService(self.db, self.administration_id)
        
        # Generate all reports as of period end date
        balance_sheet = await report_service.get_balance_sheet(period.end_date)
        pnl = await report_service.get_profit_and_loss(period.start_date, period.end_date)
        ar_report = await report_service.get_accounts_receivable(period.end_date)
        ap_report = await report_service.get_accounts_payable(period.end_date)
        trial_balance = await report_service.get_trial_balance(period.end_date)
        
        # Convert dataclasses to dicts for JSONB storage
        def convert_to_dict(obj):
            if hasattr(obj, '__dict__'):
                result = {}
                for key, value in obj.__dict__.items():
                    if isinstance(value, (Decimal,)):
                        result[key] = str(value)
                    elif isinstance(value, (date, datetime)):
                        result[key] = value.isoformat()
                    elif isinstance(value, uuid.UUID):
                        result[key] = str(value)
                    elif isinstance(value, list):
                        result[key] = [convert_to_dict(item) for item in value]
                    elif hasattr(value, '__dict__'):
                        result[key] = convert_to_dict(value)
                    else:
                        result[key] = value
                return result
            return obj
        
        balance_sheet_dict = convert_to_dict(balance_sheet)
        pnl_dict = convert_to_dict(pnl)
        ar_dict = convert_to_dict(ar_report)
        ap_dict = convert_to_dict(ap_report)
        trial_balance_dict = [convert_to_dict(tb) for tb in trial_balance]
        
        # Calculate VAT summary (simplified - would need proper VAT account logic)
        vat_summary = {
            "period_start": period.start_date.isoformat(),
            "period_end": period.end_date.isoformat(),
            "vat_payable": "0.00",  # Would be calculated from VAT accounts
            "vat_receivable": "0.00",
            "net_vat": "0.00",
        }
        
        # Create snapshot
        snapshot = PeriodSnapshot(
            period_id=period.id,
            administration_id=self.administration_id,
            snapshot_type="FINALIZATION",
            created_by_id=user_id,
            balance_sheet=balance_sheet_dict,
            profit_and_loss=pnl_dict,
            vat_summary=vat_summary,
            open_ar_balances=ar_dict,
            open_ap_balances=ap_dict,
            trial_balance=trial_balance_dict,
            total_assets=balance_sheet.total_assets,
            total_liabilities=(
                balance_sheet.current_liabilities.total + 
                balance_sheet.long_term_liabilities.total
            ),
            total_equity=balance_sheet.equity.total,
            net_income=pnl.net_income,
            total_ar=ar_report.total_open,
            total_ap=ap_report.total_open,
            acknowledged_yellow_issues=acknowledged_yellow_issues,
            issue_summary=validation_status.get("validation_summary"),
        )
        
        self.db.add(snapshot)
        await self.db.flush()
        
        return snapshot
    
    async def list_periods(
        self,
        status_filter: Optional[List[PeriodStatus]] = None,
        limit: int = 50,
    ) -> List[AccountingPeriod]:
        """List periods for the administration."""
        query = (
            select(AccountingPeriod)
            .where(AccountingPeriod.administration_id == self.administration_id)
        )
        
        if status_filter:
            query = query.where(AccountingPeriod.status.in_(status_filter))
        
        query = query.order_by(AccountingPeriod.start_date.desc()).limit(limit)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
