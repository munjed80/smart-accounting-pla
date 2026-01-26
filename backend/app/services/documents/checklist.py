"""
Closing Checklist Service

Provides the period closing checklist functionality:
- Document posting status
- Issue status (RED/YELLOW)
- VAT report readiness
- AR/AP reconciliation
- Asset schedule consistency
"""
import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional, List
from dataclasses import dataclass
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document, DocumentStatus
from app.models.ledger import AccountingPeriod, PeriodStatus, JournalEntry
from app.models.issues import ClientIssue, IssueSeverity, IssueCode
from app.models.subledger import OpenItem, OpenItemStatus
from app.models.assets import FixedAsset, DepreciationSchedule


@dataclass
class ChecklistItem:
    """Individual checklist item."""
    name: str
    description: str
    status: str  # PASSED, FAILED, WARNING, PENDING
    details: Optional[str] = None
    value: Optional[str] = None
    required: bool = True


@dataclass
class ClosingChecklist:
    """Complete closing checklist for a period."""
    client_id: uuid.UUID
    client_name: str
    period_id: uuid.UUID
    period_name: str
    period_status: str
    
    can_finalize: bool
    blocking_items: int
    warning_items: int
    
    items: List[ChecklistItem]
    
    documents_posted_percent: Decimal
    documents_pending_review: int
    red_issues_count: int
    yellow_issues_count: int
    unacknowledged_yellow_count: int
    vat_report_ready: bool
    ar_reconciled: bool
    ap_reconciled: bool
    assets_consistent: bool


class ClosingChecklistService:
    """
    Service for generating period closing checklists.
    
    Checklist items:
    1. Documents: All documents posted or rejected
    2. RED issues: Must be zero
    3. YELLOW issues: Must be acknowledged
    4. VAT report: Ready and anomalies resolved
    5. AR/AP: Reconciled
    6. Assets: Schedules consistent
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def get_checklist(
        self,
        period_id: uuid.UUID,
        administration_name: str = "Client",
    ) -> ClosingChecklist:
        """Generate the closing checklist for a period."""
        # Load period
        result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.id == period_id)
            .where(AccountingPeriod.administration_id == self.administration_id)
        )
        period = result.scalar_one_or_none()
        
        if not period:
            raise ValueError(f"Period {period_id} not found")
        
        items: List[ChecklistItem] = []
        
        # Check 1: Documents posted
        doc_item = await self._check_documents(period.start_date, period.end_date)
        items.append(doc_item)
        
        # Check 2: RED issues
        red_item = await self._check_red_issues()
        items.append(red_item)
        
        # Check 3: YELLOW issues
        yellow_item, unacknowledged = await self._check_yellow_issues()
        items.append(yellow_item)
        
        # Check 4: VAT report
        vat_item = await self._check_vat_report(period.start_date, period.end_date)
        items.append(vat_item)
        
        # Check 5: AR reconciliation
        ar_item = await self._check_ar_reconciliation()
        items.append(ar_item)
        
        # Check 6: AP reconciliation
        ap_item = await self._check_ap_reconciliation()
        items.append(ap_item)
        
        # Check 7: Asset schedules
        asset_item = await self._check_asset_schedules(period.end_date)
        items.append(asset_item)
        
        # Calculate summary
        blocking_items = sum(1 for i in items if i.status == "FAILED" and i.required)
        warning_items = sum(1 for i in items if i.status == "WARNING")
        can_finalize = blocking_items == 0
        
        # Get counts
        red_count = await self._count_red_issues()
        yellow_count = await self._count_yellow_issues()
        doc_stats = await self._get_document_stats(period.start_date, period.end_date)
        
        return ClosingChecklist(
            client_id=self.administration_id,
            client_name=administration_name,
            period_id=period_id,
            period_name=period.name,
            period_status=period.status.value,
            can_finalize=can_finalize,
            blocking_items=blocking_items,
            warning_items=warning_items,
            items=items,
            documents_posted_percent=doc_stats["posted_percent"],
            documents_pending_review=doc_stats["pending_review"],
            red_issues_count=red_count,
            yellow_issues_count=yellow_count,
            unacknowledged_yellow_count=unacknowledged,
            vat_report_ready=vat_item.status != "FAILED",
            ar_reconciled=ar_item.status == "PASSED",
            ap_reconciled=ap_item.status == "PASSED",
            assets_consistent=asset_item.status == "PASSED",
        )
    
    async def _check_documents(self, start_date: date, end_date: date) -> ChecklistItem:
        """Check if all documents in the period are posted or rejected."""
        # Count documents in period
        result = await self.db.execute(
            select(func.count(Document.id))
            .where(Document.administration_id == self.administration_id)
            .where(Document.created_at >= datetime.combine(start_date, datetime.min.time()))
            .where(Document.created_at <= datetime.combine(end_date, datetime.max.time()))
        )
        total_docs = result.scalar() or 0
        
        # Count unprocessed documents
        result = await self.db.execute(
            select(func.count(Document.id))
            .where(Document.administration_id == self.administration_id)
            .where(Document.created_at >= datetime.combine(start_date, datetime.min.time()))
            .where(Document.created_at <= datetime.combine(end_date, datetime.max.time()))
            .where(Document.status.in_([
                DocumentStatus.UPLOADED,
                DocumentStatus.PROCESSING,
                DocumentStatus.EXTRACTED,
                DocumentStatus.NEEDS_REVIEW,
                DocumentStatus.FAILED,
            ]))
        )
        pending_docs = result.scalar() or 0
        
        if total_docs == 0:
            return ChecklistItem(
                name="Documents Posted",
                description="All documents in period must be posted or rejected",
                status="PASSED",
                details="No documents uploaded in this period",
                value="0/0",
            )
        
        posted_count = total_docs - pending_docs
        percent = Decimal(posted_count * 100 / total_docs).quantize(Decimal("0.1"))
        
        if pending_docs == 0:
            status = "PASSED"
            details = "All documents processed"
        elif pending_docs <= 2:
            status = "WARNING"
            details = f"{pending_docs} document(s) still need review"
        else:
            status = "FAILED"
            details = f"{pending_docs} document(s) still need review"
        
        return ChecklistItem(
            name="Documents Posted",
            description="All documents in period must be posted or rejected",
            status=status,
            details=details,
            value=f"{posted_count}/{total_docs} ({percent}%)",
        )
    
    async def _check_red_issues(self) -> ChecklistItem:
        """Check if there are any RED issues (must be zero)."""
        count = await self._count_red_issues()
        
        if count == 0:
            return ChecklistItem(
                name="Critical Issues",
                description="All RED issues must be resolved",
                status="PASSED",
                details="No critical issues",
                value="0",
            )
        
        return ChecklistItem(
            name="Critical Issues",
            description="All RED issues must be resolved",
            status="FAILED",
            details=f"{count} critical issue(s) require resolution",
            value=str(count),
        )
    
    async def _check_yellow_issues(self) -> tuple[ChecklistItem, int]:
        """Check if all YELLOW issues are acknowledged."""
        # Count unresolved YELLOW issues
        result = await self.db.execute(
            select(func.count(ClientIssue.id))
            .where(ClientIssue.administration_id == self.administration_id)
            .where(ClientIssue.severity == IssueSeverity.YELLOW)
            .where(ClientIssue.is_resolved == False)
        )
        total_yellow = result.scalar() or 0
        
        # For now, treat all unresolved as unacknowledged
        # In a full implementation, we'd track acknowledgments separately
        unacknowledged = total_yellow
        
        if total_yellow == 0:
            return ChecklistItem(
                name="Warning Issues",
                description="All YELLOW issues must be acknowledged or resolved",
                status="PASSED",
                details="No warning issues",
                value="0",
            ), 0
        
        if unacknowledged == 0:
            return ChecklistItem(
                name="Warning Issues",
                description="All YELLOW issues must be acknowledged or resolved",
                status="PASSED",
                details=f"{total_yellow} warning(s) acknowledged",
                value=str(total_yellow),
            ), 0
        
        return ChecklistItem(
            name="Warning Issues",
            description="All YELLOW issues must be acknowledged or resolved",
            status="WARNING",
            details=f"{unacknowledged} warning(s) need acknowledgment",
            value=f"{unacknowledged} unacknowledged",
            required=False,  # Warnings don't block, but should be acknowledged
        ), unacknowledged
    
    async def _check_vat_report(self, start_date: date, end_date: date) -> ChecklistItem:
        """Check if VAT report is ready and anomalies resolved."""
        # Check for VAT-related issues
        result = await self.db.execute(
            select(func.count(ClientIssue.id))
            .where(ClientIssue.administration_id == self.administration_id)
            .where(ClientIssue.is_resolved == False)
            .where(ClientIssue.issue_code.in_([
                IssueCode.VAT_RATE_MISMATCH,
                IssueCode.VAT_NEGATIVE,
                IssueCode.VAT_MISSING,
            ]))
        )
        vat_issues = result.scalar() or 0
        
        if vat_issues == 0:
            return ChecklistItem(
                name="VAT Report Ready",
                description="VAT report must be ready with no anomalies",
                status="PASSED",
                details="No VAT anomalies detected",
                value="Ready",
            )
        
        return ChecklistItem(
            name="VAT Report Ready",
            description="VAT report must be ready with no anomalies",
            status="FAILED",
            details=f"{vat_issues} VAT anomaly/anomalies detected",
            value=f"{vat_issues} issues",
        )
    
    async def _check_ar_reconciliation(self) -> ChecklistItem:
        """Check AR reconciliation status."""
        # Check for AR reconciliation issues
        result = await self.db.execute(
            select(func.count(ClientIssue.id))
            .where(ClientIssue.administration_id == self.administration_id)
            .where(ClientIssue.is_resolved == False)
            .where(ClientIssue.issue_code == IssueCode.AR_RECON_MISMATCH)
        )
        ar_issues = result.scalar() or 0
        
        if ar_issues == 0:
            return ChecklistItem(
                name="AR Reconciled",
                description="Accounts Receivable must reconcile with subledger",
                status="PASSED",
                details="AR reconciled",
                value="OK",
            )
        
        return ChecklistItem(
            name="AR Reconciled",
            description="Accounts Receivable must reconcile with subledger",
            status="FAILED",
            details=f"{ar_issues} AR reconciliation mismatch(es)",
            value=f"{ar_issues} issues",
        )
    
    async def _check_ap_reconciliation(self) -> ChecklistItem:
        """Check AP reconciliation status."""
        # Check for AP reconciliation issues
        result = await self.db.execute(
            select(func.count(ClientIssue.id))
            .where(ClientIssue.administration_id == self.administration_id)
            .where(ClientIssue.is_resolved == False)
            .where(ClientIssue.issue_code == IssueCode.AP_RECON_MISMATCH)
        )
        ap_issues = result.scalar() or 0
        
        if ap_issues == 0:
            return ChecklistItem(
                name="AP Reconciled",
                description="Accounts Payable must reconcile with subledger",
                status="PASSED",
                details="AP reconciled",
                value="OK",
            )
        
        return ChecklistItem(
            name="AP Reconciled",
            description="Accounts Payable must reconcile with subledger",
            status="FAILED",
            details=f"{ap_issues} AP reconciliation mismatch(es)",
            value=f"{ap_issues} issues",
        )
    
    async def _check_asset_schedules(self, period_end: date) -> ChecklistItem:
        """Check if asset depreciation schedules are consistent."""
        # Check for depreciation issues
        result = await self.db.execute(
            select(func.count(ClientIssue.id))
            .where(ClientIssue.administration_id == self.administration_id)
            .where(ClientIssue.is_resolved == False)
            .where(ClientIssue.issue_code.in_([
                IssueCode.DEPRECIATION_MISMATCH,
                IssueCode.DEPRECIATION_NOT_POSTED,
            ]))
        )
        asset_issues = result.scalar() or 0
        
        if asset_issues == 0:
            return ChecklistItem(
                name="Asset Schedules Consistent",
                description="All asset depreciation must be posted and consistent",
                status="PASSED",
                details="Asset schedules are consistent",
                value="OK",
            )
        
        return ChecklistItem(
            name="Asset Schedules Consistent",
            description="All asset depreciation must be posted and consistent",
            status="WARNING",
            details=f"{asset_issues} depreciation issue(s) detected",
            value=f"{asset_issues} issues",
            required=False,  # Depreciation issues are warnings, not blockers
        )
    
    async def _count_red_issues(self) -> int:
        """Count unresolved RED issues."""
        result = await self.db.execute(
            select(func.count(ClientIssue.id))
            .where(ClientIssue.administration_id == self.administration_id)
            .where(ClientIssue.severity == IssueSeverity.RED)
            .where(ClientIssue.is_resolved == False)
        )
        return result.scalar() or 0
    
    async def _count_yellow_issues(self) -> int:
        """Count unresolved YELLOW issues."""
        result = await self.db.execute(
            select(func.count(ClientIssue.id))
            .where(ClientIssue.administration_id == self.administration_id)
            .where(ClientIssue.severity == IssueSeverity.YELLOW)
            .where(ClientIssue.is_resolved == False)
        )
        return result.scalar() or 0
    
    async def _get_document_stats(self, start_date: date, end_date: date) -> dict:
        """Get document statistics for the period."""
        # Total documents in period
        result = await self.db.execute(
            select(func.count(Document.id))
            .where(Document.administration_id == self.administration_id)
            .where(Document.created_at >= datetime.combine(start_date, datetime.min.time()))
            .where(Document.created_at <= datetime.combine(end_date, datetime.max.time()))
        )
        total = result.scalar() or 0
        
        # Posted documents
        result = await self.db.execute(
            select(func.count(Document.id))
            .where(Document.administration_id == self.administration_id)
            .where(Document.created_at >= datetime.combine(start_date, datetime.min.time()))
            .where(Document.created_at <= datetime.combine(end_date, datetime.max.time()))
            .where(Document.status.in_([DocumentStatus.POSTED, DocumentStatus.REJECTED]))
        )
        posted = result.scalar() or 0
        
        # Pending review
        result = await self.db.execute(
            select(func.count(Document.id))
            .where(Document.administration_id == self.administration_id)
            .where(Document.created_at >= datetime.combine(start_date, datetime.min.time()))
            .where(Document.created_at <= datetime.combine(end_date, datetime.max.time()))
            .where(Document.status == DocumentStatus.NEEDS_REVIEW)
        )
        pending = result.scalar() or 0
        
        posted_percent = Decimal("100.0") if total == 0 else Decimal(posted * 100 / total).quantize(Decimal("0.1"))
        
        return {
            "total": total,
            "posted": posted,
            "pending_review": pending,
            "posted_percent": posted_percent,
        }
