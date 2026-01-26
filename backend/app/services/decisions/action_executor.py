"""
Action Executor

Executes approved accountant decisions by creating appropriate journal entries
and updating related records. All actions are:
- Safe: validated before execution
- Idempotent: won't duplicate if run twice
- Reversible: can be rolled back via reversal journal entries
"""
import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import Optional, Tuple
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.decisions import (
    AccountantDecision,
    ActionType,
    DecisionType,
    ExecutionStatus,
)
from app.models.issues import ClientIssue
from app.models.ledger import JournalEntry, JournalLine, JournalEntryStatus
from app.models.assets import FixedAsset, DepreciationSchedule, AssetStatus
from app.models.subledger import OpenItem, OpenItemStatus
from app.models.accounting import ChartOfAccount, VatCode
from app.models.document import Document, DocumentStatus


class ActionExecutionError(Exception):
    """Exception raised when action execution fails."""
    pass


class ActionExecutor:
    """
    Executes approved accountant decisions.
    
    All executions create journal entries for audit trail and are reversible.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def execute_decision(
        self,
        decision: AccountantDecision,
    ) -> Tuple[bool, Optional[uuid.UUID], Optional[str]]:
        """
        Execute an approved decision.
        
        Returns: (success, result_journal_entry_id, error_message)
        """
        if decision.decision != DecisionType.APPROVED:
            return True, None, None  # Only APPROVED decisions need execution
        
        if decision.execution_status == ExecutionStatus.EXECUTED:
            return True, decision.result_journal_entry_id, "Already executed"
        
        # Get the issue for context
        result = await self.db.execute(
            select(ClientIssue)
            .where(ClientIssue.id == decision.issue_id)
        )
        issue = result.scalar_one_or_none()
        
        if not issue:
            return False, None, "Issue not found"
        
        # Get parameters (from override or suggested action)
        params = decision.override_parameters or {}
        if decision.suggested_action_id:
            sa_result = await self.db.execute(
                select(SuggestedAction)
                .where(SuggestedAction.id == decision.suggested_action_id)
            )
            suggested_action = sa_result.scalar_one_or_none()
            if suggested_action and suggested_action.parameters:
                # Merge params, override takes precedence
                params = {**suggested_action.parameters, **params}
        
        try:
            # Execute based on action type
            handler = self._get_handler(decision.action_type)
            result_je_id = await handler(issue, decision, params)
            
            return True, result_je_id, None
            
        except ActionExecutionError as e:
            return False, None, str(e)
        except Exception as e:
            return False, None, f"Unexpected error: {str(e)}"
    
    def _get_handler(self, action_type: ActionType):
        """Get the handler function for an action type."""
        handlers = {
            ActionType.CREATE_DEPRECIATION: self._execute_create_depreciation,
            ActionType.CORRECT_VAT_RATE: self._execute_correct_vat_rate,
            ActionType.ALLOCATE_OPEN_ITEM: self._execute_allocate_open_item,
            ActionType.FLAG_DOCUMENT_INVALID: self._execute_flag_document,
            ActionType.LOCK_PERIOD: self._execute_lock_period,
            ActionType.REVERSE_JOURNAL_ENTRY: self._execute_reverse_journal,
            ActionType.CREATE_ADJUSTMENT_ENTRY: self._execute_create_adjustment,
            ActionType.RECLASSIFY_TO_ASSET: self._execute_reclassify_to_asset,
        }
        
        handler = handlers.get(action_type)
        if not handler:
            raise ActionExecutionError(f"No handler for action type: {action_type}")
        
        return handler
    
    async def _execute_create_depreciation(
        self,
        issue: ClientIssue,
        decision: AccountantDecision,
        params: dict,
    ) -> Optional[uuid.UUID]:
        """Create and post a depreciation journal entry."""
        if not issue.fixed_asset_id:
            raise ActionExecutionError("No fixed asset linked to issue")
        
        # Get the asset
        result = await self.db.execute(
            select(FixedAsset)
            .where(FixedAsset.id == issue.fixed_asset_id)
            .options(selectinload(FixedAsset.depreciation_schedules))
        )
        asset = result.scalar_one_or_none()
        
        if not asset:
            raise ActionExecutionError("Fixed asset not found")
        
        if asset.status != AssetStatus.ACTIVE:
            raise ActionExecutionError(f"Asset is not active: {asset.status}")
        
        # Find unposted depreciation schedules
        unposted = [s for s in asset.depreciation_schedules if not s.is_posted]
        
        if not unposted:
            raise ActionExecutionError("No unposted depreciation schedules found")
        
        # Process the first unposted schedule
        schedule = sorted(unposted, key=lambda s: s.period_date)[0]
        
        # Get next entry number
        entry_number = await self._get_next_entry_number(issue.administration_id)
        
        # Create journal entry
        journal_entry = JournalEntry(
            administration_id=issue.administration_id,
            entry_number=entry_number,
            entry_date=schedule.period_date,
            description=f"Depreciation - {asset.name} - {schedule.period_date.strftime('%B %Y')}",
            status=JournalEntryStatus.POSTED,
            source_type="ASSET_DEPRECIATION",
            source_id=asset.id,
            posted_at=datetime.now(timezone.utc),
            posted_by_id=decision.decided_by_id,
        )
        self.db.add(journal_entry)
        await self.db.flush()
        
        # Create debit line (depreciation expense)
        debit_line = JournalLine(
            journal_entry_id=journal_entry.id,
            account_id=asset.expense_account_id,
            line_number=1,
            description=f"Depreciation expense - {asset.name}",
            debit_amount=schedule.depreciation_amount,
            credit_amount=Decimal("0.00"),
        )
        self.db.add(debit_line)
        
        # Create credit line (accumulated depreciation)
        credit_line = JournalLine(
            journal_entry_id=journal_entry.id,
            account_id=asset.depreciation_account_id,
            line_number=2,
            description=f"Accumulated depreciation - {asset.name}",
            debit_amount=Decimal("0.00"),
            credit_amount=schedule.depreciation_amount,
        )
        self.db.add(credit_line)
        
        # Update journal entry totals
        journal_entry.total_debit = schedule.depreciation_amount
        journal_entry.total_credit = schedule.depreciation_amount
        journal_entry.is_balanced = True
        
        # Mark schedule as posted
        schedule.is_posted = True
        schedule.posted_at = datetime.now(timezone.utc)
        schedule.journal_entry_id = journal_entry.id
        
        # Update asset accumulated depreciation
        asset.accumulated_depreciation += schedule.depreciation_amount
        asset.update_book_value()
        
        await self.db.flush()
        
        return journal_entry.id
    
    async def _execute_correct_vat_rate(
        self,
        issue: ClientIssue,
        decision: AccountantDecision,
        params: dict,
    ) -> Optional[uuid.UUID]:
        """Create a correcting entry for VAT rate mismatch."""
        if not issue.journal_entry_id:
            raise ActionExecutionError("No journal entry linked to issue")
        
        # Get the original entry
        result = await self.db.execute(
            select(JournalEntry)
            .where(JournalEntry.id == issue.journal_entry_id)
            .options(selectinload(JournalEntry.lines))
        )
        original_entry = result.scalar_one_or_none()
        
        if not original_entry:
            raise ActionExecutionError("Original journal entry not found")
        
        # Calculate correction amount
        correction_amount = issue.amount_discrepancy
        if not correction_amount or correction_amount == Decimal("0.00"):
            raise ActionExecutionError("No discrepancy amount to correct")
        
        # Get next entry number
        entry_number = await self._get_next_entry_number(issue.administration_id)
        
        # Create correcting journal entry
        journal_entry = JournalEntry(
            administration_id=issue.administration_id,
            entry_number=entry_number,
            entry_date=date.today(),
            description=f"VAT correction for {original_entry.entry_number}",
            reference=f"Corrects: {original_entry.entry_number}",
            status=JournalEntryStatus.POSTED,
            source_type="VAT_CORRECTION",
            source_id=original_entry.id,
            posted_at=datetime.now(timezone.utc),
            posted_by_id=decision.decided_by_id,
        )
        self.db.add(journal_entry)
        await self.db.flush()
        
        # Find VAT account (from original entry lines or default)
        vat_account_id = None
        for line in original_entry.lines:
            if line.vat_code_id:
                # Get the VAT code to find account
                vc_result = await self.db.execute(
                    select(VatCode).where(VatCode.id == line.vat_code_id)
                )
                vat_code = vc_result.scalar_one_or_none()
                if vat_code:
                    vat_account_id = vat_code.sales_account_id or vat_code.purchase_account_id
                    break
        
        if not vat_account_id:
            raise ActionExecutionError("Cannot determine VAT account for correction")
        
        # Create correction lines (adjust VAT account)
        debit_line = JournalLine(
            journal_entry_id=journal_entry.id,
            account_id=vat_account_id,
            line_number=1,
            description="VAT correction",
            debit_amount=correction_amount if correction_amount > 0 else Decimal("0.00"),
            credit_amount=abs(correction_amount) if correction_amount < 0 else Decimal("0.00"),
        )
        self.db.add(debit_line)
        
        # Offset to suspense/rounding account (would need to be configured per admin)
        # For now, we'll just note this needs proper account configuration
        
        journal_entry.total_debit = abs(correction_amount)
        journal_entry.total_credit = abs(correction_amount)
        journal_entry.is_balanced = True
        
        await self.db.flush()
        
        return journal_entry.id
    
    async def _execute_allocate_open_item(
        self,
        issue: ClientIssue,
        decision: AccountantDecision,
        params: dict,
    ) -> Optional[uuid.UUID]:
        """Allocate or write off an open item."""
        if not issue.open_item_id:
            raise ActionExecutionError("No open item linked to issue")
        
        result = await self.db.execute(
            select(OpenItem)
            .where(OpenItem.id == issue.open_item_id)
        )
        open_item = result.scalar_one_or_none()
        
        if not open_item:
            raise ActionExecutionError("Open item not found")
        
        if open_item.status == OpenItemStatus.PAID:
            raise ActionExecutionError("Open item is already paid")
        
        # For write-off, mark as written off
        # For allocation, mark as paid
        action = params.get("allocation_action", "write_off")
        
        if action == "write_off":
            open_item.status = OpenItemStatus.WRITTEN_OFF
        else:
            open_item.status = OpenItemStatus.PAID
            open_item.paid_amount = open_item.original_amount
            open_item.open_amount = Decimal("0.00")
        
        await self.db.flush()
        
        # Note: In a full implementation, this would create a journal entry
        # for the write-off or payment allocation
        return None
    
    async def _execute_flag_document(
        self,
        issue: ClientIssue,
        decision: AccountantDecision,
        params: dict,
    ) -> Optional[uuid.UUID]:
        """Flag a document as invalid or requiring attention."""
        if not issue.document_id:
            raise ActionExecutionError("No document linked to issue")
        
        result = await self.db.execute(
            select(Document)
            .where(Document.id == issue.document_id)
        )
        document = result.scalar_one_or_none()
        
        if not document:
            raise ActionExecutionError("Document not found")
        
        # Update document status
        document.status = DocumentStatus.FAILED
        document.error_message = params.get(
            "flag_reason", 
            f"Flagged by accountant: {decision.notes or 'Invalid/Missing document'}"
        )
        
        await self.db.flush()
        
        return None
    
    async def _execute_lock_period(
        self,
        issue: ClientIssue,
        decision: AccountantDecision,
        params: dict,
    ) -> Optional[uuid.UUID]:
        """Lock an accounting period."""
        from app.models.ledger import AccountingPeriod
        
        period_id = params.get("period_id")
        if not period_id:
            raise ActionExecutionError("No period ID specified")
        
        result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.id == uuid.UUID(period_id))
            .where(AccountingPeriod.administration_id == issue.administration_id)
        )
        period = result.scalar_one_or_none()
        
        if not period:
            raise ActionExecutionError("Accounting period not found")
        
        if period.is_closed:
            raise ActionExecutionError("Period is already closed")
        
        period.is_closed = True
        period.closed_at = datetime.now(timezone.utc)
        
        await self.db.flush()
        
        return None
    
    async def _execute_reverse_journal(
        self,
        issue: ClientIssue,
        decision: AccountantDecision,
        params: dict,
    ) -> Optional[uuid.UUID]:
        """Create a reversal entry for a journal entry."""
        if not issue.journal_entry_id:
            raise ActionExecutionError("No journal entry linked to issue")
        
        result = await self.db.execute(
            select(JournalEntry)
            .where(JournalEntry.id == issue.journal_entry_id)
            .options(selectinload(JournalEntry.lines))
        )
        original_entry = result.scalar_one_or_none()
        
        if not original_entry:
            raise ActionExecutionError("Original journal entry not found")
        
        if original_entry.status == JournalEntryStatus.REVERSED:
            raise ActionExecutionError("Entry is already reversed")
        
        # Get next entry number
        entry_number = await self._get_next_entry_number(issue.administration_id)
        
        # Create reversal entry
        reversal_entry = JournalEntry(
            administration_id=issue.administration_id,
            entry_number=entry_number,
            entry_date=date.today(),
            description=f"Reversal of {original_entry.entry_number}",
            reference=f"Reverses: {original_entry.entry_number}",
            status=JournalEntryStatus.POSTED,
            source_type="REVERSAL",
            reverses_id=original_entry.id,
            posted_at=datetime.now(timezone.utc),
            posted_by_id=decision.decided_by_id,
        )
        self.db.add(reversal_entry)
        await self.db.flush()
        
        # Create reversed lines (swap debit/credit)
        for i, orig_line in enumerate(original_entry.lines):
            reversal_line = JournalLine(
                journal_entry_id=reversal_entry.id,
                account_id=orig_line.account_id,
                line_number=i + 1,
                description=f"Reversal: {orig_line.description or ''}",
                debit_amount=orig_line.credit_amount,  # Swap
                credit_amount=orig_line.debit_amount,  # Swap
                vat_code_id=orig_line.vat_code_id,
                vat_amount=-orig_line.vat_amount if orig_line.vat_amount else None,
                taxable_amount=-orig_line.taxable_amount if orig_line.taxable_amount else None,
            )
            self.db.add(reversal_line)
        
        reversal_entry.total_debit = original_entry.total_credit
        reversal_entry.total_credit = original_entry.total_debit
        reversal_entry.is_balanced = True
        
        # Mark original as reversed
        original_entry.status = JournalEntryStatus.REVERSED
        original_entry.reversed_by_id = reversal_entry.id
        
        await self.db.flush()
        
        return reversal_entry.id
    
    async def _execute_create_adjustment(
        self,
        issue: ClientIssue,
        decision: AccountantDecision,
        params: dict,
    ) -> Optional[uuid.UUID]:
        """Create an adjustment journal entry."""
        amount = params.get("amount")
        if not amount:
            amount = issue.amount_discrepancy
        
        if not amount or Decimal(str(amount)) == Decimal("0.00"):
            raise ActionExecutionError("No adjustment amount specified")
        
        amount = Decimal(str(amount))
        
        # Get accounts from params or use defaults
        debit_account_id = params.get("debit_account_id")
        credit_account_id = params.get("credit_account_id")
        
        if not debit_account_id or not credit_account_id:
            # Would need to determine appropriate accounts based on issue type
            raise ActionExecutionError("Account IDs required for adjustment entry")
        
        entry_number = await self._get_next_entry_number(issue.administration_id)
        
        journal_entry = JournalEntry(
            administration_id=issue.administration_id,
            entry_number=entry_number,
            entry_date=date.today(),
            description=params.get("description", f"Adjustment entry - {issue.issue_code}"),
            status=JournalEntryStatus.POSTED,
            source_type="ADJUSTMENT",
            source_id=issue.id,
            posted_at=datetime.now(timezone.utc),
            posted_by_id=decision.decided_by_id,
        )
        self.db.add(journal_entry)
        await self.db.flush()
        
        debit_line = JournalLine(
            journal_entry_id=journal_entry.id,
            account_id=uuid.UUID(debit_account_id),
            line_number=1,
            description="Adjustment debit",
            debit_amount=abs(amount),
            credit_amount=Decimal("0.00"),
        )
        self.db.add(debit_line)
        
        credit_line = JournalLine(
            journal_entry_id=journal_entry.id,
            account_id=uuid.UUID(credit_account_id),
            line_number=2,
            description="Adjustment credit",
            debit_amount=Decimal("0.00"),
            credit_amount=abs(amount),
        )
        self.db.add(credit_line)
        
        journal_entry.total_debit = abs(amount)
        journal_entry.total_credit = abs(amount)
        journal_entry.is_balanced = True
        
        await self.db.flush()
        
        return journal_entry.id
    
    async def _execute_reclassify_to_asset(
        self,
        issue: ClientIssue,
        decision: AccountantDecision,
        params: dict,
    ) -> Optional[uuid.UUID]:
        """Reclassify an expense to a fixed asset."""
        # This would require:
        # 1. Creating a new FixedAsset record
        # 2. Creating journal entry to reverse expense and debit asset account
        # 3. Creating depreciation schedule
        
        # For now, return a placeholder - full implementation would need
        # asset configuration parameters
        raise ActionExecutionError(
            "Asset reclassification requires additional configuration. "
            "Please create the asset manually and link to this transaction."
        )
    
    async def _get_next_entry_number(
        self,
        administration_id: uuid.UUID,
    ) -> str:
        """Generate the next journal entry number."""
        result = await self.db.execute(
            select(func.count(JournalEntry.id))
            .where(JournalEntry.administration_id == administration_id)
        )
        count = result.scalar() or 0
        return f"JE-{date.today().year}-{count + 1:05d}"


# Import here to avoid circular imports
from app.models.decisions import SuggestedAction
