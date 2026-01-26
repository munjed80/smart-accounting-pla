"""
Ledger Service

Handles journal entry posting with double-entry enforcement.
All operations are idempotent and use database transactions.
"""
import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import List, Optional, Tuple
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import JournalEntry, JournalLine, JournalEntryStatus, AccountingPeriod
from app.models.accounting import ChartOfAccount
from app.models.subledger import Party, OpenItem, OpenItemStatus
from app.models.assets import FixedAsset, DepreciationSchedule


class LedgerError(Exception):
    """Base exception for ledger operations."""
    pass


class UnbalancedEntryError(LedgerError):
    """Raised when a journal entry doesn't balance."""
    def __init__(self, total_debit: Decimal, total_credit: Decimal):
        self.total_debit = total_debit
        self.total_credit = total_credit
        super().__init__(
            f"Journal entry is unbalanced: debit={total_debit}, credit={total_credit}, "
            f"difference={abs(total_debit - total_credit)}"
        )


class LedgerService:
    """
    Service for ledger operations.
    
    Key principles:
    - Double-entry enforced: sum(debit) == sum(credit) per journal_entry
    - Idempotent operations: safe to run multiple times
    - Transaction-safe: uses DB transactions
    - Multi-tenant: always scoped by administration_id
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def get_next_entry_number(self) -> str:
        """Generate next sequential entry number for the administration."""
        result = await self.db.execute(
            select(func.count(JournalEntry.id))
            .where(JournalEntry.administration_id == self.administration_id)
        )
        count = result.scalar() or 0
        return f"JE-{count + 1:06d}"
    
    async def create_journal_entry(
        self,
        entry_date: date,
        description: str,
        lines: List[dict],
        reference: Optional[str] = None,
        document_id: Optional[uuid.UUID] = None,
        source_type: Optional[str] = None,
        source_id: Optional[uuid.UUID] = None,
        auto_post: bool = False,
        posted_by_id: Optional[uuid.UUID] = None,
    ) -> JournalEntry:
        """
        Create a journal entry with lines.
        
        Args:
            entry_date: Date of the entry
            description: Description/memo
            lines: List of dicts with account_id, debit_amount, credit_amount, etc.
            reference: External reference number
            document_id: Linked document
            source_type: Source type (MANUAL, INVOICE, ASSET_DEPRECIATION, etc.)
            source_id: ID of source entity
            auto_post: If True, post immediately after creation
            posted_by_id: User ID who posts the entry
            
        Returns:
            Created JournalEntry
            
        Raises:
            UnbalancedEntryError: If debit != credit
            LedgerError: For other validation errors
        """
        # Validate lines balance
        total_debit = sum(Decimal(str(line.get("debit_amount", 0))) for line in lines)
        total_credit = sum(Decimal(str(line.get("credit_amount", 0))) for line in lines)
        
        if total_debit != total_credit:
            raise UnbalancedEntryError(total_debit, total_credit)
        
        if not lines:
            raise LedgerError("Journal entry must have at least one line")
        
        # Find period for the entry date
        period = await self._find_period_for_date(entry_date)
        
        # Check if period is closed
        if period and period.is_closed:
            raise LedgerError(f"Period {period.name} is closed and cannot accept new entries")
        
        # Generate entry number
        entry_number = await self.get_next_entry_number()
        
        # Create journal entry
        entry = JournalEntry(
            administration_id=self.administration_id,
            period_id=period.id if period else None,
            document_id=document_id,
            entry_number=entry_number,
            entry_date=entry_date,
            description=description,
            reference=reference,
            source_type=source_type,
            source_id=source_id,
            total_debit=total_debit,
            total_credit=total_credit,
            is_balanced=True,
            status=JournalEntryStatus.DRAFT,
        )
        self.db.add(entry)
        await self.db.flush()  # Get the entry ID
        
        # Create lines
        for idx, line_data in enumerate(lines, start=1):
            line = JournalLine(
                journal_entry_id=entry.id,
                account_id=line_data["account_id"],
                line_number=idx,
                description=line_data.get("description"),
                debit_amount=Decimal(str(line_data.get("debit_amount", 0))),
                credit_amount=Decimal(str(line_data.get("credit_amount", 0))),
                vat_code_id=line_data.get("vat_code_id"),
                vat_amount=Decimal(str(line_data["vat_amount"])) if line_data.get("vat_amount") else None,
                taxable_amount=Decimal(str(line_data["taxable_amount"])) if line_data.get("taxable_amount") else None,
                party_type=line_data.get("party_type"),
                party_id=line_data.get("party_id"),
            )
            self.db.add(line)
        
        if auto_post:
            await self._post_entry(entry, posted_by_id)
        
        await self.db.commit()
        await self.db.refresh(entry)
        return entry
    
    async def post_entry(
        self, 
        entry_id: uuid.UUID, 
        posted_by_id: Optional[uuid.UUID] = None
    ) -> JournalEntry:
        """
        Post a draft journal entry.
        
        This makes the entry permanent and creates any necessary subledger records.
        """
        result = await self.db.execute(
            select(JournalEntry)
            .where(JournalEntry.id == entry_id)
            .where(JournalEntry.administration_id == self.administration_id)
        )
        entry = result.scalar_one_or_none()
        
        if not entry:
            raise LedgerError(f"Journal entry {entry_id} not found")
        
        if entry.status == JournalEntryStatus.POSTED:
            return entry  # Idempotent - already posted
        
        if entry.status == JournalEntryStatus.REVERSED:
            raise LedgerError("Cannot post a reversed entry")
        
        if not entry.is_balanced:
            raise LedgerError("Cannot post unbalanced entry")
        
        await self._post_entry(entry, posted_by_id)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry
    
    async def _post_entry(
        self, 
        entry: JournalEntry, 
        posted_by_id: Optional[uuid.UUID] = None
    ) -> None:
        """Internal method to post an entry."""
        entry.status = JournalEntryStatus.POSTED
        entry.posted_at = datetime.now(timezone.utc)
        entry.posted_by_id = posted_by_id
        
        # Create open items for AR/AP control accounts
        await self._create_open_items_for_entry(entry)
    
    async def _create_open_items_for_entry(self, entry: JournalEntry) -> None:
        """Create open items for AR/AP postings in the entry."""
        # Load lines with account info
        result = await self.db.execute(
            select(JournalLine, ChartOfAccount)
            .join(ChartOfAccount, JournalLine.account_id == ChartOfAccount.id)
            .where(JournalLine.journal_entry_id == entry.id)
            .where(ChartOfAccount.is_control_account == True)
        )
        
        for line, account in result.all():
            if account.control_type in ("AR", "AP") and line.party_id:
                # Determine item type and amount
                item_type = "RECEIVABLE" if account.control_type == "AR" else "PAYABLE"
                amount = line.debit_amount - line.credit_amount
                if account.control_type == "AP":
                    amount = -amount  # AP is credit-normal
                
                if amount != 0:
                    # Get party for payment terms
                    party_result = await self.db.execute(
                        select(Party).where(Party.id == line.party_id)
                    )
                    party = party_result.scalar_one_or_none()
                    payment_terms = party.payment_terms_days if party else 30
                    
                    open_item = OpenItem(
                        administration_id=self.administration_id,
                        party_id=line.party_id,
                        journal_entry_id=entry.id,
                        journal_line_id=line.id,
                        item_type=item_type,
                        document_number=entry.reference,
                        document_date=entry.entry_date,
                        due_date=entry.entry_date + timedelta(days=payment_terms),
                        original_amount=abs(amount),
                        open_amount=abs(amount),
                        status=OpenItemStatus.OPEN,
                    )
                    self.db.add(open_item)
    
    async def reverse_entry(
        self,
        entry_id: uuid.UUID,
        reversal_date: date,
        description: Optional[str] = None,
        posted_by_id: Optional[uuid.UUID] = None,
    ) -> JournalEntry:
        """
        Create a reversal entry for an existing posted entry.
        
        Returns the new reversal entry.
        """
        result = await self.db.execute(
            select(JournalEntry)
            .where(JournalEntry.id == entry_id)
            .where(JournalEntry.administration_id == self.administration_id)
        )
        entry = result.scalar_one_or_none()
        
        if not entry:
            raise LedgerError(f"Journal entry {entry_id} not found")
        
        if entry.status != JournalEntryStatus.POSTED:
            raise LedgerError("Can only reverse posted entries")
        
        if entry.reversed_by_id:
            raise LedgerError("Entry has already been reversed")
        
        # Create reversal lines (swap debit/credit)
        result = await self.db.execute(
            select(JournalLine).where(JournalLine.journal_entry_id == entry_id)
        )
        original_lines = result.scalars().all()
        
        reversal_lines = []
        for line in original_lines:
            reversal_lines.append({
                "account_id": line.account_id,
                "debit_amount": line.credit_amount,  # Swap
                "credit_amount": line.debit_amount,  # Swap
                "description": f"Reversal: {line.description or ''}",
                "vat_code_id": line.vat_code_id,
                "party_type": line.party_type,
                "party_id": line.party_id,
            })
        
        # Create the reversal entry
        reversal = await self.create_journal_entry(
            entry_date=reversal_date,
            description=description or f"Reversal of {entry.entry_number}",
            lines=reversal_lines,
            source_type="REVERSAL",
            source_id=entry.id,
            auto_post=True,
            posted_by_id=posted_by_id,
        )
        
        # Link entries
        reversal.reverses_id = entry.id
        entry.reversed_by_id = reversal.id
        entry.status = JournalEntryStatus.REVERSED
        
        await self.db.commit()
        return reversal
    
    async def _find_period_for_date(self, entry_date: date) -> Optional[AccountingPeriod]:
        """Find the accounting period that contains the given date."""
        result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.administration_id == self.administration_id)
            .where(AccountingPeriod.start_date <= entry_date)
            .where(AccountingPeriod.end_date >= entry_date)
        )
        return result.scalar_one_or_none()
    
    async def get_account_balance(
        self,
        account_id: uuid.UUID,
        as_of_date: Optional[date] = None,
    ) -> Tuple[Decimal, Decimal, Decimal]:
        """
        Get account balance (total debit, total credit, net).
        
        Returns:
            Tuple of (total_debit, total_credit, net_balance)
        """
        query = (
            select(
                func.coalesce(func.sum(JournalLine.debit_amount), 0),
                func.coalesce(func.sum(JournalLine.credit_amount), 0),
            )
            .select_from(JournalLine)
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(JournalLine.account_id == account_id)
            .where(JournalEntry.administration_id == self.administration_id)
            .where(JournalEntry.status == JournalEntryStatus.POSTED)
        )
        
        if as_of_date:
            query = query.where(JournalEntry.entry_date <= as_of_date)
        
        result = await self.db.execute(query)
        row = result.one()
        total_debit = Decimal(str(row[0]))
        total_credit = Decimal(str(row[1]))
        
        return total_debit, total_credit, total_debit - total_credit
    
    async def post_depreciation(
        self,
        schedule: DepreciationSchedule,
        posted_by_id: Optional[uuid.UUID] = None,
    ) -> JournalEntry:
        """
        Post a depreciation schedule entry.
        
        Creates a journal entry debiting expense, crediting accumulated depreciation.
        """
        if schedule.is_posted:
            # Idempotent - already posted
            if schedule.journal_entry_id:
                result = await self.db.execute(
                    select(JournalEntry).where(JournalEntry.id == schedule.journal_entry_id)
                )
                return result.scalar_one()
            raise LedgerError("Schedule marked as posted but no journal entry found")
        
        # Get the asset
        result = await self.db.execute(
            select(FixedAsset).where(FixedAsset.id == schedule.fixed_asset_id)
        )
        asset = result.scalar_one()
        
        # Create depreciation entry
        entry = await self.create_journal_entry(
            entry_date=schedule.period_date,
            description=f"Depreciation: {asset.name} ({schedule.period_date.strftime('%Y-%m')})",
            lines=[
                {
                    "account_id": asset.expense_account_id,
                    "debit_amount": schedule.depreciation_amount,
                    "credit_amount": Decimal("0.00"),
                    "description": f"Depreciation expense for {asset.name}",
                },
                {
                    "account_id": asset.depreciation_account_id,
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": schedule.depreciation_amount,
                    "description": f"Accumulated depreciation for {asset.name}",
                },
            ],
            source_type="ASSET_DEPRECIATION",
            source_id=asset.id,
            auto_post=True,
            posted_by_id=posted_by_id,
        )
        
        # Update schedule
        schedule.journal_entry_id = entry.id
        schedule.is_posted = True
        schedule.posted_at = datetime.now(timezone.utc)
        
        # Update asset accumulated depreciation
        asset.accumulated_depreciation += schedule.depreciation_amount
        asset.update_book_value()
        
        await self.db.commit()
        return entry


# Import at the bottom to avoid circular imports
from datetime import timedelta
