from datetime import datetime, timezone
import uuid
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.accounting import ChartOfAccount
from app.models.bank import BankTransaction
from app.models.ledger import JournalEntry, JournalLine, JournalEntryStatus
from app.models.zzp import ZZPExpense, ZZPInvoice


class LedgerRepository:
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id

    async def get_invoice(self, invoice_id: uuid.UUID) -> Optional[ZZPInvoice]:
        result = await self.db.execute(
            select(ZZPInvoice)
            .options(selectinload(ZZPInvoice.lines))
            .where(ZZPInvoice.id == invoice_id)
            .where(ZZPInvoice.administration_id == self.administration_id)
        )
        return result.scalar_one_or_none()

    async def get_expense(self, expense_id: uuid.UUID) -> Optional[ZZPExpense]:
        result = await self.db.execute(
            select(ZZPExpense)
            .where(ZZPExpense.id == expense_id)
            .where(ZZPExpense.administration_id == self.administration_id)
        )
        return result.scalar_one_or_none()

    async def get_bank_transaction(self, transaction_id: uuid.UUID) -> Optional[BankTransaction]:
        result = await self.db.execute(
            select(BankTransaction)
            .where(BankTransaction.id == transaction_id)
            .where(BankTransaction.administration_id == self.administration_id)
        )
        return result.scalar_one_or_none()

    async def get_account_by_code(self, code: str) -> Optional[ChartOfAccount]:
        result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.account_code == code)
            .where(ChartOfAccount.is_active.is_(True))
        )
        return result.scalar_one_or_none()

    async def get_next_entry_number(self) -> str:
        result = await self.db.execute(
            select(func.count(JournalEntry.id))
            .where(JournalEntry.administration_id == self.administration_id)
        )
        count = result.scalar() or 0
        return f"JE-{count + 1:06d}"

    async def has_posted_entry_for_reference(self, source_type: str, source_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(JournalEntry.id)
            .where(JournalEntry.administration_id == self.administration_id)
            .where(JournalEntry.source_type == source_type)
            .where(JournalEntry.source_id == source_id)
            .where(JournalEntry.posted.is_(True))
            .limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def create_journal_entry(
        self,
        *,
        entry_date,
        description: str,
        reference: Optional[str],
        source_type: str,
        source_id: uuid.UUID,
        lines: list[dict],
    ) -> JournalEntry:
        total_debit = sum(Decimal(str(line.get("debit_amount", 0))) for line in lines)
        total_credit = sum(Decimal(str(line.get("credit_amount", 0))) for line in lines)

        entry = JournalEntry(
            administration_id=self.administration_id,
            entry_number=await self.get_next_entry_number(),
            entry_date=entry_date,
            description=description,
            reference=reference,
            source_type=source_type,
            source_id=source_id,
            status=JournalEntryStatus.POSTED,
            posted=True,
            posted_at=datetime.now(timezone.utc),
            total_debit=total_debit,
            total_credit=total_credit,
            is_balanced=total_debit == total_credit,
        )
        self.db.add(entry)
        await self.db.flush()

        for idx, line_data in enumerate(lines, start=1):
            line = JournalLine(
                journal_entry_id=entry.id,
                account_id=line_data["account_id"],
                line_number=idx,
                description=line_data.get("description"),
                debit_amount=Decimal(str(line_data.get("debit_amount", 0))),
                credit_amount=Decimal(str(line_data.get("credit_amount", 0))),
            )
            self.db.add(line)

        return entry
