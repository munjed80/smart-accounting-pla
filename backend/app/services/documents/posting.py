"""
Document Posting Service

Handles posting documents to the journal:
- Creates journal entries from documents
- Handles VAT calculations
- Manages period awareness
- Provides audit logging
"""
import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.document import (
    Document,
    DocumentStatus,
    DocumentAuditLog,
    DocumentAuditAction,
)
from app.models.ledger import (
    JournalEntry,
    JournalLine,
    JournalEntryStatus,
    AccountingPeriod,
    PeriodStatus,
)
from app.models.accounting import ChartOfAccount, VatCode
from app.models.subledger import OpenItem, OpenItemStatus, OpenItemAllocation
from app.models.user import User


class DocumentPostingService:
    """
    Service for posting documents to the journal.
    
    Responsibilities:
    - Create journal entries from documents
    - Handle VAT calculations
    - Respect period status (block posting to FINALIZED/LOCKED periods)
    - Create open item allocations when applicable
    - Maintain audit trail
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def post_document(
        self,
        document_id: uuid.UUID,
        user_id: uuid.UUID,
        description: Optional[str] = None,
        entry_date: Optional[datetime] = None,
        account_id: Optional[uuid.UUID] = None,
        vat_code_id: Optional[uuid.UUID] = None,
        allocate_to_open_item_id: Optional[uuid.UUID] = None,
        notes: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> JournalEntry:
        """
        Post a document to the journal.
        
        This is idempotent - if document is already posted, returns existing entry.
        """
        # Load document
        result = await self.db.execute(
            select(Document)
            .where(Document.id == document_id)
            .where(Document.administration_id == self.administration_id)
            .options(selectinload(Document.posted_journal))
        )
        document = result.scalar_one_or_none()
        
        if not document:
            raise ValueError(f"Document {document_id} not found")
        
        # Idempotency: if already posted, return existing entry
        if document.status == DocumentStatus.POSTED and document.posted_journal_entry_id:
            result = await self.db.execute(
                select(JournalEntry)
                .where(JournalEntry.id == document.posted_journal_entry_id)
                .options(selectinload(JournalEntry.lines))
            )
            return result.scalar_one()
        
        # Validate document status
        if document.status not in [DocumentStatus.NEEDS_REVIEW, DocumentStatus.EXTRACTED]:
            raise ValueError(
                f"Cannot post document with status {document.status.value}. "
                f"Document must be in NEEDS_REVIEW or EXTRACTED status."
            )
        
        # Determine posting date
        posting_date = entry_date or document.invoice_date or datetime.now(timezone.utc)
        if isinstance(posting_date, datetime):
            posting_date = posting_date.date()
        
        # Find and validate period
        period = await self._get_period_for_date(posting_date)
        if period and not period.can_accept_postings():
            raise ValueError(
                f"Cannot post to period {period.name} with status {period.status.value}. "
                f"Period must be OPEN or REVIEW."
            )
        
        # Get or validate accounts
        expense_account = await self._get_expense_account(account_id)
        vat_code = await self._get_vat_code(vat_code_id, document.vat_amount)
        bank_account = await self._get_bank_account()
        vat_account = await self._get_vat_account() if vat_code else None
        
        # Generate entry number
        entry_number = await self._generate_entry_number()
        
        # Create journal entry
        journal_entry = JournalEntry(
            administration_id=self.administration_id,
            period_id=period.id if period else None,
            document_id=document_id,
            entry_number=entry_number,
            entry_date=posting_date,
            description=description or f"Document: {document.original_filename}",
            reference=document.invoice_number,
            status=JournalEntryStatus.POSTED,
            source_type="DOCUMENT_POSTING",
            source_id=document_id,
            posted_at=datetime.now(timezone.utc),
            posted_by_id=user_id,
        )
        self.db.add(journal_entry)
        await self.db.flush()
        
        # Create journal lines
        net_amount = document.net_amount or document.total_amount or Decimal("0.00")
        vat_amount = document.vat_amount or Decimal("0.00")
        total_amount = document.total_amount or (net_amount + vat_amount)
        
        # Expense line (debit)
        expense_line = JournalLine(
            journal_entry_id=journal_entry.id,
            account_id=expense_account.id,
            line_number=1,
            description=description or document.supplier_name,
            debit_amount=net_amount,
            credit_amount=Decimal("0.00"),
            vat_code_id=vat_code.id if vat_code else None,
            taxable_amount=net_amount,
            vat_base_amount=net_amount,
            party_type="SUPPLIER" if document.matched_party_id else None,
            party_id=document.matched_party_id,
        )
        self.db.add(expense_line)
        
        # VAT line (debit) if applicable
        if vat_code and vat_amount > Decimal("0.00") and vat_account:
            vat_line = JournalLine(
                journal_entry_id=journal_entry.id,
                account_id=vat_account.id,
                line_number=2,
                description=f"VAT {vat_code.code}",
                debit_amount=vat_amount,
                credit_amount=Decimal("0.00"),
                vat_code_id=vat_code.id,
                vat_amount=vat_amount,
            )
            self.db.add(vat_line)
        
        # Bank/creditor line (credit)
        bank_line = JournalLine(
            journal_entry_id=journal_entry.id,
            account_id=bank_account.id,
            line_number=3,
            description=document.supplier_name or "Payment",
            debit_amount=Decimal("0.00"),
            credit_amount=total_amount,
            party_type="SUPPLIER" if document.matched_party_id else None,
            party_id=document.matched_party_id,
        )
        self.db.add(bank_line)
        
        # Calculate totals
        journal_entry.total_debit = net_amount + vat_amount
        journal_entry.total_credit = total_amount
        journal_entry.is_balanced = journal_entry.total_debit == journal_entry.total_credit
        
        # Handle open item allocation if specified
        if allocate_to_open_item_id:
            await self._allocate_open_item(
                allocate_to_open_item_id, 
                journal_entry.id,
                total_amount,
                posting_date
            )
        
        # Update document status
        old_status = document.status.value
        document.status = DocumentStatus.POSTED
        document.posted_at = datetime.now(timezone.utc)
        document.posted_by_id = user_id
        document.posted_journal_entry_id = journal_entry.id
        
        # Create audit log
        audit_log = DocumentAuditLog(
            document_id=document_id,
            administration_id=self.administration_id,
            action=DocumentAuditAction.POSTED,
            from_status=old_status,
            to_status=DocumentStatus.POSTED.value,
            performed_by_id=user_id,
            notes=notes,
            ip_address=ip_address,
            result_journal_entry_id=journal_entry.id,
        )
        self.db.add(audit_log)
        
        await self.db.flush()
        return journal_entry
    
    async def reject_document(
        self,
        document_id: uuid.UUID,
        user_id: uuid.UUID,
        reason: str,
        notes: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Document:
        """
        Reject a document.
        
        This is idempotent - if already rejected, updates the reason.
        """
        result = await self.db.execute(
            select(Document)
            .where(Document.id == document_id)
            .where(Document.administration_id == self.administration_id)
        )
        document = result.scalar_one_or_none()
        
        if not document:
            raise ValueError(f"Document {document_id} not found")
        
        if document.status == DocumentStatus.POSTED:
            raise ValueError("Cannot reject a document that has already been posted")
        
        # Update document
        old_status = document.status.value
        document.status = DocumentStatus.REJECTED
        document.rejected_at = datetime.now(timezone.utc)
        document.rejected_by_id = user_id
        document.rejection_reason = reason
        
        # Create audit log
        audit_log = DocumentAuditLog(
            document_id=document_id,
            administration_id=self.administration_id,
            action=DocumentAuditAction.REJECTED,
            from_status=old_status,
            to_status=DocumentStatus.REJECTED.value,
            performed_by_id=user_id,
            notes=notes or reason,
            ip_address=ip_address,
        )
        self.db.add(audit_log)
        
        await self.db.flush()
        return document
    
    async def reprocess_document(
        self,
        document_id: uuid.UUID,
        user_id: uuid.UUID,
        ip_address: Optional[str] = None,
    ) -> Document:
        """
        Reprocess a document (reset for re-extraction).
        
        This is idempotent - increments process count.
        """
        result = await self.db.execute(
            select(Document)
            .where(Document.id == document_id)
            .where(Document.administration_id == self.administration_id)
        )
        document = result.scalar_one_or_none()
        
        if not document:
            raise ValueError(f"Document {document_id} not found")
        
        if document.status == DocumentStatus.POSTED:
            raise ValueError("Cannot reprocess a document that has already been posted")
        
        # Reset document status
        old_status = document.status.value
        document.status = DocumentStatus.UPLOADED
        document.error_message = None
        document.is_duplicate = False
        document.duplicate_of_id = None
        document.match_confidence = None
        # Don't clear extracted fields - let the processor update them
        
        # Create audit log
        audit_log = DocumentAuditLog(
            document_id=document_id,
            administration_id=self.administration_id,
            action=DocumentAuditAction.REPROCESSED,
            from_status=old_status,
            to_status=DocumentStatus.UPLOADED.value,
            performed_by_id=user_id,
            notes=f"Reprocess requested (attempt #{document.process_count + 1})",
            ip_address=ip_address,
        )
        self.db.add(audit_log)
        
        await self.db.flush()
        return document
    
    async def _get_period_for_date(self, posting_date: date) -> Optional[AccountingPeriod]:
        """Get the accounting period for a given date."""
        result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.administration_id == self.administration_id)
            .where(AccountingPeriod.start_date <= posting_date)
            .where(AccountingPeriod.end_date >= posting_date)
        )
        return result.scalar_one_or_none()
    
    async def _get_expense_account(self, account_id: Optional[uuid.UUID]) -> ChartOfAccount:
        """Get expense account (specified or default)."""
        if account_id:
            result = await self.db.execute(
                select(ChartOfAccount)
                .where(ChartOfAccount.id == account_id)
                .where(ChartOfAccount.administration_id == self.administration_id)
            )
            account = result.scalar_one_or_none()
            if account:
                return account
        
        # Default: general expense account (4000 series in Dutch chart)
        result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.code.like("4%"))
            .where(ChartOfAccount.is_active == True)
            .order_by(ChartOfAccount.code)
            .limit(1)
        )
        account = result.scalar_one_or_none()
        
        if not account:
            raise ValueError("No expense account found. Please configure chart of accounts.")
        
        return account
    
    async def _get_bank_account(self) -> ChartOfAccount:
        """Get default bank/creditor account."""
        # Try creditors first (1600 series in Dutch chart)
        result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.code.like("16%"))
            .where(ChartOfAccount.is_active == True)
            .order_by(ChartOfAccount.code)
            .limit(1)
        )
        account = result.scalar_one_or_none()
        
        if not account:
            # Fall back to bank account (1100 series)
            result = await self.db.execute(
                select(ChartOfAccount)
                .where(ChartOfAccount.administration_id == self.administration_id)
                .where(ChartOfAccount.code.like("11%"))
                .where(ChartOfAccount.is_active == True)
                .order_by(ChartOfAccount.code)
                .limit(1)
            )
            account = result.scalar_one_or_none()
        
        if not account:
            raise ValueError("No bank/creditor account found. Please configure chart of accounts.")
        
        return account
    
    async def _get_vat_account(self) -> Optional[ChartOfAccount]:
        """Get VAT receivable account."""
        result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(
                ChartOfAccount.code.like("15%")  # VAT accounts in Dutch chart
            )
            .where(ChartOfAccount.is_active == True)
            .order_by(ChartOfAccount.code)
            .limit(1)
        )
        return result.scalar_one_or_none()
    
    async def _get_vat_code(
        self, 
        vat_code_id: Optional[uuid.UUID],
        vat_amount: Optional[Decimal]
    ) -> Optional[VatCode]:
        """Get VAT code (specified or inferred from amount)."""
        if vat_code_id:
            result = await self.db.execute(
                select(VatCode)
                .where(VatCode.id == vat_code_id)
                .where(VatCode.administration_id == self.administration_id)
            )
            return result.scalar_one_or_none()
        
        # If no VAT amount, return None
        if not vat_amount or vat_amount <= Decimal("0.00"):
            return None
        
        # Default to standard VAT code
        result = await self.db.execute(
            select(VatCode)
            .where(VatCode.administration_id == self.administration_id)
            .where(VatCode.is_active == True)
            .order_by(VatCode.rate.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
    
    async def _generate_entry_number(self) -> str:
        """Generate unique entry number."""
        # Get next number for this administration
        result = await self.db.execute(
            select(func.count(JournalEntry.id))
            .where(JournalEntry.administration_id == self.administration_id)
        )
        count = result.scalar() or 0
        
        year = datetime.now().year
        return f"JE-{year}-{count + 1:05d}"
    
    async def _allocate_open_item(
        self,
        open_item_id: uuid.UUID,
        journal_entry_id: uuid.UUID,
        amount: Decimal,
        allocation_date: date,
    ) -> None:
        """Allocate payment to an open item."""
        result = await self.db.execute(
            select(OpenItem)
            .where(OpenItem.id == open_item_id)
            .where(OpenItem.administration_id == self.administration_id)
        )
        open_item = result.scalar_one_or_none()
        
        if not open_item:
            return
        
        # Create allocation
        allocation = OpenItemAllocation(
            open_item_id=open_item_id,
            payment_journal_entry_id=journal_entry_id,
            allocated_amount=min(amount, open_item.open_amount),
            allocation_date=allocation_date,
        )
        self.db.add(allocation)
        
        # Update open item
        open_item.paid_amount += min(amount, open_item.open_amount)
        open_item.update_status()
