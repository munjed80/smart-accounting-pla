from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from app.repositories.ledger_repository import LedgerRepository


class LedgerPostingError(Exception):
    pass


@dataclass
class PostingLine:
    account_id: uuid.UUID
    debit_amount: Decimal = Decimal("0.00")
    credit_amount: Decimal = Decimal("0.00")
    description: str | None = None


class LedgerPostingService:
    """Domain service for automatic double-entry postings from operational events."""

    def __init__(self, repository: LedgerRepository):
        self.repository = repository

    async def post_invoice(self, invoice_id: uuid.UUID) -> None:
        invoice = await self.repository.get_invoice(invoice_id)
        if not invoice:
            raise LedgerPostingError("Invoice not found")

        already_posted = await self.repository.has_posted_entry_for_reference("INVOICE", invoice.id)
        if already_posted:
            return

        ar = await self._require_account("1300")
        revenue = await self._require_account("8000")
        vat_payable = await self._require_account("1700")

        gross = self._cents_to_decimal(invoice.total_cents)
        net = self._cents_to_decimal(invoice.subtotal_cents)
        vat = self._cents_to_decimal(invoice.vat_total_cents)

        lines = [
            PostingLine(account_id=ar.id, debit_amount=gross, description=f"Factuur {invoice.invoice_number} debiteur"),
            PostingLine(account_id=revenue.id, credit_amount=net, description=f"Factuur {invoice.invoice_number} omzet"),
        ]
        if vat > Decimal("0.00"):
            lines.append(
                PostingLine(account_id=vat_payable.id, credit_amount=vat, description=f"Factuur {invoice.invoice_number} btw")
            )

        self._validate_balanced(lines)

        await self.repository.create_journal_entry(
            entry_date=invoice.issue_date,
            description=f"Automatische boeking factuur {invoice.invoice_number}",
            reference=invoice.invoice_number,
            source_type="INVOICE",
            source_id=invoice.id,
            lines=[line.__dict__ for line in lines],
        )

    async def post_invoice_payment(self, invoice_id: uuid.UUID) -> None:
        invoice = await self.repository.get_invoice(invoice_id)
        if not invoice:
            raise LedgerPostingError("Invoice not found")

        already_posted = await self.repository.has_posted_entry_for_reference("INVOICE_PAYMENT", invoice.id)
        if already_posted:
            return

        bank = await self._require_account("1100")
        ar = await self._require_account("1300")

        amount = self._cents_to_decimal(invoice.amount_paid_cents or invoice.total_cents)
        if amount <= Decimal("0.00"):
            raise LedgerPostingError("Cannot post payment with zero amount")

        lines = [
            PostingLine(account_id=bank.id, debit_amount=amount, description=f"Ontvangst factuur {invoice.invoice_number}"),
            PostingLine(account_id=ar.id, credit_amount=amount, description=f"Afboeking debiteur {invoice.invoice_number}"),
        ]
        self._validate_balanced(lines)

        payment_date = invoice.paid_at.date() if invoice.paid_at else invoice.issue_date
        await self.repository.create_journal_entry(
            entry_date=payment_date,
            description=f"Automatische betaling factuur {invoice.invoice_number}",
            reference=invoice.invoice_number,
            source_type="INVOICE_PAYMENT",
            source_id=invoice.id,
            lines=[line.__dict__ for line in lines],
        )

    async def post_expense(self, expense_id: uuid.UUID) -> None:
        expense = await self.repository.get_expense(expense_id)
        if not expense:
            raise LedgerPostingError("Expense not found")

        already_posted = await self.repository.has_posted_entry_for_reference("EXPENSE", expense.id)
        if already_posted:
            return

        expense_account = await self._require_account("4500")
        vat_receivable = await self._require_account("1800")
        bank = await self._require_account("1100")

        gross = self._cents_to_decimal(expense.amount_cents)
        vat = self._cents_to_decimal(expense.vat_amount_cents)
        net = gross - vat

        lines = [
            PostingLine(account_id=expense_account.id, debit_amount=net, description=f"Kosten {expense.vendor}"),
        ]
        if vat > Decimal("0.00"):
            lines.append(PostingLine(account_id=vat_receivable.id, debit_amount=vat, description=f"BTW {expense.vendor}"))

        lines.append(PostingLine(account_id=bank.id, credit_amount=gross, description=f"Betaling {expense.vendor}"))

        self._validate_balanced(lines)

        await self.repository.create_journal_entry(
            entry_date=expense.expense_date,
            description=f"Automatische boeking uitgave {expense.vendor}",
            reference=str(expense.id),
            source_type="EXPENSE",
            source_id=expense.id,
            lines=[line.__dict__ for line in lines],
        )

    async def post_bank_transaction(self, transaction_id: uuid.UUID) -> None:
        transaction = await self.repository.get_bank_transaction(transaction_id)
        if not transaction:
            raise LedgerPostingError("Bank transaction not found")

        already_posted = await self.repository.has_posted_entry_for_reference("BANK", transaction.id)
        if already_posted:
            return

        bank = await self._require_account("1100")
        suspense = await self._require_account("9999")

        amount = Decimal(str(transaction.amount))
        if amount == Decimal("0.00"):
            raise LedgerPostingError("Cannot post zero bank transaction")

        if amount > 0:
            lines = [
                PostingLine(account_id=bank.id, debit_amount=amount, description=transaction.description),
                PostingLine(account_id=suspense.id, credit_amount=amount, description=transaction.description),
            ]
        else:
            absolute = abs(amount)
            lines = [
                PostingLine(account_id=suspense.id, debit_amount=absolute, description=transaction.description),
                PostingLine(account_id=bank.id, credit_amount=absolute, description=transaction.description),
            ]

        self._validate_balanced(lines)

        await self.repository.create_journal_entry(
            entry_date=transaction.booking_date,
            description=f"Automatische bankboeking: {transaction.description}",
            reference=transaction.reference,
            source_type="BANK",
            source_id=transaction.id,
            lines=[line.__dict__ for line in lines],
        )

    async def _require_account(self, code: str):
        account = await self.repository.get_account_by_code(code)
        if not account:
            raise LedgerPostingError(f"Required account {code} is missing or inactive")
        return account

    @staticmethod
    def _cents_to_decimal(value: int) -> Decimal:
        return (Decimal(value) / Decimal("100")).quantize(Decimal("0.01"))

    @staticmethod
    def _validate_balanced(lines: Iterable[PostingLine]) -> None:
        total_debit = sum((line.debit_amount for line in lines), Decimal("0.00"))
        total_credit = sum((line.credit_amount for line in lines), Decimal("0.00"))
        if total_debit != total_credit:
            raise LedgerPostingError(
                f"Unbalanced posting detected: debit={total_debit}, credit={total_credit}"
            )
