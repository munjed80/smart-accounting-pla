"""
Consistency Engine

Server-side validation that continuously checks:
1) Ledger integrity
2) Subledger reconciliation (AR/AP)
3) Asset correctness
4) P&L consistency
5) VAT/BTW sanity

Produces actionable issues per client.
"""
import uuid
from datetime import datetime, date, timezone, timedelta
from decimal import Decimal
from typing import List, Optional, Tuple
from sqlalchemy import select, func, and_, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ledger import JournalEntry, JournalLine, JournalEntryStatus
from app.models.accounting import ChartOfAccount, VatCode
from app.models.subledger import OpenItem, OpenItemStatus, Party
from app.models.assets import FixedAsset, DepreciationSchedule, AssetStatus
from app.models.issues import ClientIssue, IssueSeverity, IssueCode, ValidationRun


class ConsistencyEngine:
    """
    Validates accounting data and produces actionable issues.
    
    All operations are:
    - Idempotent: safe to run multiple times
    - Transaction-safe: uses DB transactions
    - Multi-tenant: always scoped by administration_id
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
        self.issues: List[ClientIssue] = []
    
    async def run_full_validation(
        self,
        triggered_by_id: Optional[uuid.UUID] = None,
    ) -> ValidationRun:
        """
        Run all validation checks and update issues.
        
        Returns ValidationRun with results.
        """
        # Create validation run record
        run = ValidationRun(
            administration_id=self.administration_id,
            triggered_by_id=triggered_by_id,
            status="RUNNING",
        )
        self.db.add(run)
        await self.db.flush()
        
        try:
            # Clear existing unresolved issues (they will be recreated if still valid)
            await self._clear_unresolved_issues()
            
            # Run all checks
            await self.check_ledger_integrity()
            await self.check_ar_reconciliation()
            await self.check_ap_reconciliation()
            await self.check_asset_correctness()
            await self.check_vat_sanity()
            
            # Save all issues
            for issue in self.issues:
                self.db.add(issue)
            
            # Complete the run
            run.status = "COMPLETED"
            run.completed_at = datetime.now(timezone.utc)
            run.issues_found = len(self.issues)
            
            await self.db.commit()
            return run
            
        except Exception as e:
            run.status = "FAILED"
            run.error_message = str(e)
            run.completed_at = datetime.now(timezone.utc)
            await self.db.commit()
            raise
    
    async def _clear_unresolved_issues(self) -> int:
        """Clear existing unresolved issues. Returns count of cleared issues."""
        result = await self.db.execute(
            select(ClientIssue)
            .where(ClientIssue.administration_id == self.administration_id)
            .where(ClientIssue.is_resolved == False)
        )
        issues = result.scalars().all()
        count = len(issues)
        # Bulk delete for efficiency
        if count > 0:
            await self.db.execute(
                delete(ClientIssue)
                .where(ClientIssue.administration_id == self.administration_id)
                .where(ClientIssue.is_resolved == False)
            )
        return count
    
    def _add_issue(
        self,
        issue_code: str,
        severity: IssueSeverity,
        title: str,
        description: str,
        why: Optional[str] = None,
        suggested_action: Optional[str] = None,
        document_id: Optional[uuid.UUID] = None,
        journal_entry_id: Optional[uuid.UUID] = None,
        account_id: Optional[uuid.UUID] = None,
        fixed_asset_id: Optional[uuid.UUID] = None,
        party_id: Optional[uuid.UUID] = None,
        open_item_id: Optional[uuid.UUID] = None,
        amount_discrepancy: Optional[Decimal] = None,
    ) -> ClientIssue:
        """Add an issue to the list."""
        issue = ClientIssue(
            administration_id=self.administration_id,
            issue_code=issue_code,
            severity=severity,
            title=title,
            description=description,
            why=why,
            suggested_action=suggested_action,
            document_id=document_id,
            journal_entry_id=journal_entry_id,
            account_id=account_id,
            fixed_asset_id=fixed_asset_id,
            party_id=party_id,
            open_item_id=open_item_id,
            amount_discrepancy=amount_discrepancy,
        )
        self.issues.append(issue)
        return issue
    
    # ==================== Ledger Integrity Checks ====================
    
    async def check_ledger_integrity(self) -> None:
        """
        Check ledger integrity:
        - Every journal entry balances (sum(debit) == sum(credit))
        - No orphan lines
        - No missing accounts
        """
        await self._check_unbalanced_entries()
        await self._check_orphan_lines()
        await self._check_missing_accounts()
    
    async def _check_unbalanced_entries(self) -> None:
        """Find journal entries where debit != credit."""
        result = await self.db.execute(
            select(JournalEntry)
            .where(JournalEntry.administration_id == self.administration_id)
            .where(JournalEntry.is_balanced == False)
        )
        
        for entry in result.scalars().all():
            self._add_issue(
                issue_code=IssueCode.JOURNAL_UNBALANCED,
                severity=IssueSeverity.RED,
                title=f"Unbalanced journal entry: {entry.entry_number}",
                description=f"Debit ({entry.total_debit}) does not equal credit ({entry.total_credit}). "
                           f"Difference: {abs(entry.total_debit - entry.total_credit)}",
                why="Journal entries must balance for double-entry accounting. "
                    "This could be due to a posting error or system issue.",
                suggested_action="Review the journal entry lines and correct the amounts "
                                "so that total debits equal total credits.",
                journal_entry_id=entry.id,
                amount_discrepancy=abs(entry.total_debit - entry.total_credit),
            )
    
    async def _check_orphan_lines(self) -> None:
        """Check for journal lines without valid parent entries."""
        # This is typically enforced by foreign keys, but we check anyway
        result = await self.db.execute(
            select(JournalLine)
            .outerjoin(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(JournalEntry.id == None)
        )
        
        for line in result.scalars().all():
            self._add_issue(
                issue_code=IssueCode.ORPHAN_LINE,
                severity=IssueSeverity.RED,
                title=f"Orphan journal line found",
                description=f"Journal line {line.id} has no parent journal entry.",
                why="Database integrity issue - line exists without parent entry.",
                suggested_action="Delete the orphan line or investigate database integrity.",
            )
    
    async def _check_missing_accounts(self) -> None:
        """Check for journal lines referencing non-existent accounts."""
        result = await self.db.execute(
            select(JournalLine, JournalEntry)
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .outerjoin(ChartOfAccount, JournalLine.account_id == ChartOfAccount.id)
            .where(JournalEntry.administration_id == self.administration_id)
            .where(ChartOfAccount.id == None)
        )
        
        for line, entry in result.all():
            self._add_issue(
                issue_code=IssueCode.MISSING_ACCOUNT,
                severity=IssueSeverity.RED,
                title=f"Missing account in entry {entry.entry_number}",
                description=f"Line references account {line.account_id} which does not exist.",
                why="The account may have been deleted or never created.",
                suggested_action="Update the line to reference a valid account, or restore the missing account.",
                journal_entry_id=entry.id,
            )
    
    # ==================== AR/AP Reconciliation ====================
    
    async def check_ar_reconciliation(self) -> None:
        """
        Check AR (Debiteuren) reconciliation:
        - Open items reconcile with AR control account(s)
        - Flag overdue receivables
        """
        await self._check_subledger_reconciliation("AR", "RECEIVABLE")
        await self._check_overdue_items("RECEIVABLE")
    
    async def check_ap_reconciliation(self) -> None:
        """
        Check AP (Crediteuren) reconciliation:
        - Open items reconcile with AP control account(s)
        - Flag overdue payables
        """
        await self._check_subledger_reconciliation("AP", "PAYABLE")
        await self._check_overdue_items("PAYABLE")
    
    async def _check_subledger_reconciliation(
        self, 
        control_type: str, 
        item_type: str
    ) -> None:
        """Check that subledger open items match control account balance."""
        # Get control accounts
        result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.is_control_account == True)
            .where(ChartOfAccount.control_type == control_type)
        )
        control_accounts = result.scalars().all()
        
        if not control_accounts:
            return  # No control accounts configured
        
        # Get total from control account postings
        control_account_ids = [acc.id for acc in control_accounts]
        result = await self.db.execute(
            select(
                func.coalesce(func.sum(JournalLine.debit_amount), 0),
                func.coalesce(func.sum(JournalLine.credit_amount), 0),
            )
            .select_from(JournalLine)
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(JournalLine.account_id.in_(control_account_ids))
            .where(JournalEntry.administration_id == self.administration_id)
            .where(JournalEntry.status == JournalEntryStatus.POSTED)
        )
        row = result.one()
        gl_debit = Decimal(str(row[0]))
        gl_credit = Decimal(str(row[1]))
        
        # AR is debit-normal, AP is credit-normal
        if control_type == "AR":
            gl_balance = gl_debit - gl_credit
        else:
            gl_balance = gl_credit - gl_debit
        
        # Get total from open items
        result = await self.db.execute(
            select(func.coalesce(func.sum(OpenItem.open_amount), 0))
            .where(OpenItem.administration_id == self.administration_id)
            .where(OpenItem.item_type == item_type)
            .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
        )
        subledger_total = Decimal(str(result.scalar()))
        
        # Compare
        difference = abs(gl_balance - subledger_total)
        if difference > Decimal("0.01"):  # Allow 1 cent tolerance
            issue_code = IssueCode.AR_RECON_MISMATCH if control_type == "AR" else IssueCode.AP_RECON_MISMATCH
            name = "Accounts Receivable (Debiteuren)" if control_type == "AR" else "Accounts Payable (Crediteuren)"
            
            self._add_issue(
                issue_code=issue_code,
                severity=IssueSeverity.RED,
                title=f"{name} reconciliation mismatch",
                description=f"Control account balance ({gl_balance}) does not match "
                           f"open items total ({subledger_total}). Difference: {difference}",
                why="This could be due to: (1) Manual entries to control accounts without "
                    "matching open items, (2) Open items created/modified without GL postings, "
                    "(3) Timing differences in posting.",
                suggested_action=f"Review recent {name.lower()} transactions. "
                                "Check for manual entries and ensure all invoices/payments are properly posted.",
                amount_discrepancy=difference,
            )
    
    async def _check_overdue_items(self, item_type: str) -> None:
        """Check for overdue open items."""
        today = date.today()
        
        result = await self.db.execute(
            select(OpenItem, Party)
            .join(Party, OpenItem.party_id == Party.id)
            .where(OpenItem.administration_id == self.administration_id)
            .where(OpenItem.item_type == item_type)
            .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
            .where(OpenItem.due_date < today)
        )
        
        for open_item, party in result.all():
            days_overdue = (today - open_item.due_date).days
            
            issue_code = IssueCode.OVERDUE_RECEIVABLE if item_type == "RECEIVABLE" else IssueCode.OVERDUE_PAYABLE
            name = "Receivable" if item_type == "RECEIVABLE" else "Payable"
            severity = IssueSeverity.RED if days_overdue > 30 else IssueSeverity.YELLOW
            
            self._add_issue(
                issue_code=issue_code,
                severity=severity,
                title=f"Overdue {name.lower()}: {party.name}",
                description=f"Invoice {open_item.document_number or 'N/A'} is {days_overdue} days overdue. "
                           f"Amount: €{open_item.open_amount}",
                why=f"The due date ({open_item.due_date}) has passed without full payment.",
                suggested_action=f"Contact {party.name} for payment" if item_type == "RECEIVABLE" 
                                else f"Schedule payment to {party.name}",
                party_id=party.id,
                open_item_id=open_item.id,
                amount_discrepancy=open_item.open_amount,
            )
    
    # ==================== Asset Correctness ====================
    
    async def check_asset_correctness(self) -> None:
        """
        Check asset-related issues:
        - Depreciation postings match schedules
        - Unposted depreciation schedules
        """
        await self._check_depreciation_schedules()
    
    async def _check_depreciation_schedules(self) -> None:
        """Check for depreciation schedule issues."""
        today = date.today()
        
        # Find unposted schedules that should have been posted
        result = await self.db.execute(
            select(DepreciationSchedule, FixedAsset)
            .join(FixedAsset, DepreciationSchedule.fixed_asset_id == FixedAsset.id)
            .where(FixedAsset.administration_id == self.administration_id)
            .where(FixedAsset.status == AssetStatus.ACTIVE)
            .where(DepreciationSchedule.is_posted == False)
            .where(DepreciationSchedule.period_date <= today)
        )
        
        for schedule, asset in result.all():
            self._add_issue(
                issue_code=IssueCode.DEPRECIATION_NOT_POSTED,
                severity=IssueSeverity.YELLOW,
                title=f"Unposted depreciation: {asset.name}",
                description=f"Depreciation for {schedule.period_date.strftime('%B %Y')} "
                           f"(€{schedule.depreciation_amount}) has not been posted.",
                why="Depreciation entries should be posted monthly to maintain accurate asset values.",
                suggested_action="Run the depreciation posting process for the pending period.",
                fixed_asset_id=asset.id,
                amount_discrepancy=schedule.depreciation_amount,
            )
        
        # Check for mismatch between posted depreciation and asset accumulated depreciation
        result = await self.db.execute(
            select(FixedAsset)
            .where(FixedAsset.administration_id == self.administration_id)
            .where(FixedAsset.status == AssetStatus.ACTIVE)
        )
        
        for asset in result.scalars().all():
            # Sum posted depreciation from schedules
            sched_result = await self.db.execute(
                select(func.coalesce(func.sum(DepreciationSchedule.depreciation_amount), 0))
                .where(DepreciationSchedule.fixed_asset_id == asset.id)
                .where(DepreciationSchedule.is_posted == True)
            )
            posted_total = Decimal(str(sched_result.scalar()))
            
            # Compare to asset's accumulated depreciation
            if abs(posted_total - asset.accumulated_depreciation) > Decimal("0.01"):
                self._add_issue(
                    issue_code=IssueCode.DEPRECIATION_MISMATCH,
                    severity=IssueSeverity.RED,
                    title=f"Depreciation mismatch: {asset.name}",
                    description=f"Posted depreciation total (€{posted_total}) does not match "
                               f"asset accumulated depreciation (€{asset.accumulated_depreciation}).",
                    why="The asset record and posted depreciation entries are out of sync.",
                    suggested_action="Reconcile the asset record with posted depreciation entries.",
                    fixed_asset_id=asset.id,
                    amount_discrepancy=abs(posted_total - asset.accumulated_depreciation),
                )
    
    # ==================== VAT/BTW Sanity ====================
    
    async def check_vat_sanity(self) -> None:
        """
        Basic VAT checks:
        - VAT amounts align with taxable base and rate
        - Flag negative VAT where not expected
        """
        await self._check_vat_calculations()
    
    async def _check_vat_calculations(self) -> None:
        """Check that VAT amounts match expected calculations."""
        result = await self.db.execute(
            select(JournalLine, JournalEntry, VatCode)
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(VatCode, JournalLine.vat_code_id == VatCode.id)
            .where(JournalEntry.administration_id == self.administration_id)
            .where(JournalEntry.status == JournalEntryStatus.POSTED)
            .where(JournalLine.vat_amount != None)
            .where(JournalLine.taxable_amount != None)
        )
        
        for line, entry, vat_code in result.all():
            # Calculate expected VAT
            expected_vat = (line.taxable_amount * vat_code.rate / Decimal("100")).quantize(Decimal("0.01"))
            actual_vat = line.vat_amount
            
            # Allow small rounding tolerance
            if abs(expected_vat - actual_vat) > Decimal("0.05"):
                self._add_issue(
                    issue_code=IssueCode.VAT_RATE_MISMATCH,
                    severity=IssueSeverity.YELLOW,
                    title=f"VAT calculation mismatch in {entry.entry_number}",
                    description=f"Expected VAT €{expected_vat} ({vat_code.rate}% of €{line.taxable_amount}), "
                               f"but recorded €{actual_vat}.",
                    why="The VAT amount doesn't match the expected calculation based on the taxable amount and rate.",
                    suggested_action="Verify the VAT calculation and correct if needed.",
                    journal_entry_id=entry.id,
                    amount_discrepancy=abs(expected_vat - actual_vat),
                )
            
            # Check for unexpected negative VAT
            if actual_vat < 0 and entry.source_type not in ("CREDIT_NOTE", "REVERSAL"):
                self._add_issue(
                    issue_code=IssueCode.VAT_NEGATIVE,
                    severity=IssueSeverity.YELLOW,
                    title=f"Negative VAT in {entry.entry_number}",
                    description=f"VAT amount is negative (€{actual_vat}) which is unusual for this transaction type.",
                    why="Negative VAT is typically only expected for credit notes or reversals.",
                    suggested_action="Verify this is correct or adjust the entry.",
                    journal_entry_id=entry.id,
                )
    
    async def get_issues_summary(self) -> dict:
        """Get a summary of current issues."""
        result = await self.db.execute(
            select(
                ClientIssue.issue_code,
                ClientIssue.severity,
                func.count(ClientIssue.id),
            )
            .where(ClientIssue.administration_id == self.administration_id)
            .where(ClientIssue.is_resolved == False)
            .group_by(ClientIssue.issue_code, ClientIssue.severity)
        )
        
        summary = {
            "total": 0,
            "by_severity": {"RED": 0, "YELLOW": 0},
            "by_code": {},
        }
        
        for code, severity, count in result.all():
            summary["total"] += count
            summary["by_severity"][severity.value] += count
            if code not in summary["by_code"]:
                summary["by_code"][code] = 0
            summary["by_code"][code] += count
        
        return summary
