"""Atomic bank-to-invoice allocation; imported cash is recorded exactly once."""

from datetime import datetime, time, timezone, date
from sqlalchemy import select, func
from app.models.administration import Administration
from app.models.bank import BankTransaction, BankTransactionStatus
from app.models.payment import ZZPPayment, ZZPPaymentAllocation
from app.models.zzp import ZZPBankTransactionMatch
from app.services.payment_service import PaymentService
from app.services.credit_notes import digest, balance, fail
from app.services.zzp_integrity import require_open_dates
from app.services.ledger_service import LedgerPostingService, LedgerPostingError
from app.repositories.ledger_repository import LedgerRepository


class BankReceiptService:
    def __init__(self, db, admin_id):
        self.db, self.admin_id = db, admin_id
        self.payments = PaymentService(db, admin_id)
        self.ledger = LedgerPostingService(LedgerRepository(db, admin_id))

    async def transaction(self, transaction_id):
        await self.db.execute(
            select(Administration.id)
            .where(Administration.id == self.admin_id)
            .with_for_update()
        )
        transaction = await self.db.scalar(
            select(BankTransaction)
            .where(
                BankTransaction.id == transaction_id,
                BankTransaction.administration_id == self.admin_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if not transaction:
            fail("TRANSACTION_NOT_FOUND", "Transactie niet gevonden.", 404)
        return transaction

    async def match(self, transaction_id, request, key, user_id):
        transaction = await self.transaction(transaction_id)
        invoice = await self.payments._invoice(request.invoice_id, lock=True)
        payload_hash = digest(
            dict(transaction_id=str(transaction_id), **request.model_dump(mode="json"))
        )
        existing = await self.db.scalar(
            select(ZZPBankTransactionMatch).where(
                ZZPBankTransactionMatch.administration_id == self.admin_id,
                ZZPBankTransactionMatch.creation_key == key,
            )
        )
        if existing:
            if existing.payload_hash != payload_hash:
                fail(
                    "IDEMPOTENCY_CONFLICT",
                    "Dit verzoek is al met andere gegevens verwerkt.",
                )
            return existing, invoice
        if transaction.status != BankTransactionStatus.NEW:
            fail(
                "BANK_TRANSACTION_NOT_OPEN",
                "Deze transactie is al verwerkt of vraagt controle.",
            )
        if (
            transaction.currency != "EUR"
            or transaction.amount <= 0
            or transaction.booking_date > date.today()
        ):
            fail(
                "BANK_RECEIPT_UNSUPPORTED",
                "Kies een geboekte, positieve euro-ontvangst.",
                422,
            )
        if transaction.booking_date < invoice.issue_date:
            fail(
                "BANK_ADVANCE_REQUIRES_REVIEW",
                "Deze ontvangst ligt vóór de factuurdatum. Laat de vooruitbetaling aansluiten.",
            )
        amount = int(transaction.amount * 100)
        if request.amount_cents is not None and request.amount_cents != amount:
            fail(
                "BANK_SPLIT_REQUIRES_REVIEW",
                "Koppel het volledige bankbedrag. Splitsingen en overbetalingen vragen afzonderlijke aansluiting.",
                422,
            )
        if invoice.status not in ("sent", "overdue") or amount > balance(invoice):
            fail(
                "BANK_RECEIPT_EXCEEDS_DUE",
                "De ontvangst overschrijdt het openstaande factuurbedrag of de factuur is al voldaan.",
            )
        active = await self.db.scalar(
            select(ZZPBankTransactionMatch.id)
            .where(
                ZZPBankTransactionMatch.administration_id == self.admin_id,
                ZZPBankTransactionMatch.bank_transaction_id == transaction.id,
                ZZPBankTransactionMatch.active.is_(True),
            )
            .limit(1)
        )
        if active:
            fail(
                "BANK_HISTORY_REQUIRES_REVIEW",
                "Er bestaat al een bankkoppeling. Laat de historie aansluiten.",
            )
        native_paid = await self.db.scalar(
            select(
                func.coalesce(func.sum(ZZPPaymentAllocation.allocated_amount_cents), 0)
            )
            .join(ZZPPayment)
            .where(
                ZZPPayment.administration_id == self.admin_id,
                ZZPPayment.status == "completed",
                ZZPPaymentAllocation.invoice_id == invoice.id,
            )
        )
        if native_paid != (invoice.amount_paid_cents or 0):
            fail(
                "ORIGINAL_RECEIPTS_UNRECONCILED",
                "De historische ontvangsten sluiten niet aan op de factuur.",
            )
        await require_open_dates(self.db, self.admin_id, transaction.booking_date)
        if not await self.ledger.repository.has_posted_entry_for_reference(
            "INVOICE", invoice.id
        ):
            fail(
                "ORIGINAL_POSTING_REQUIRED",
                "Laat eerst de oorspronkelijke factuurboeking aansluiten.",
            )
        for code in ("1100", "1300", "9999"):
            await self.ledger._require_account(code)
        await self.ledger.post_bank_transaction(transaction.id)
        payments = (
            await self.db.scalars(
                select(ZZPPayment)
                .where(
                    ZZPPayment.administration_id == self.admin_id,
                    ZZPPayment.bank_transaction_id == transaction.id,
                )
                .with_for_update()
            )
        ).all()
        if len(payments) > 1:
            fail(
                "BANK_HISTORY_REQUIRES_REVIEW",
                "Meerdere ontvangsten gevonden voor deze banktransactie.",
            )
        if payments:
            payment = payments[0]
            used = await self.db.scalar(
                select(func.count(ZZPPaymentAllocation.id)).where(
                    ZZPPaymentAllocation.payment_id == payment.id
                )
            )
            if (
                used
                or payment.status != "completed"
                or payment.amount_cents != amount
                or payment.payment_date.date() != transaction.booking_date
            ):
                fail(
                    "BANK_HISTORY_REQUIRES_REVIEW",
                    "De bestaande bankontvangst vraagt aansluiting.",
                )
        else:
            payment = await self.payments.create_payment(
                amount,
                datetime.combine(transaction.booking_date, time.min, timezone.utc),
                payment_method="bank_transfer",
                reference=transaction.reference,
                notes=transaction.description,
                bank_transaction_id=transaction.id,
            )
        allocation = await self.payments.allocate_payment_to_invoice(
            payment.id, invoice.id, amount, request.notes
        )
        if not await self.ledger.repository.has_posted_entry_for_reference(
            "PAYMENT_ALLOCATION", allocation.id
        ):
            fail(
                "BANK_POSTING_REQUIRED",
                "De betalingsverdeling heeft geen grootboekboeking.",
            )
        match = ZZPBankTransactionMatch(
            administration_id=self.admin_id,
            bank_transaction_id=transaction.id,
            invoice_id=invoice.id,
            user_id=user_id,
            amount_cents=amount,
            match_type="manual",
            notes=request.notes,
            payment_id=payment.id,
            allocation_id=allocation.id,
            active=True,
            creation_key=key,
            payload_hash=payload_hash,
        )
        self.db.add(match)
        transaction.status = BankTransactionStatus.MATCHED
        transaction.matched_entity_type, transaction.matched_entity_id = (
            "INVOICE",
            invoice.id,
        )
        await self.db.flush()
        return match, invoice

    async def unmatch(self, transaction_id, match_id, user_id):
        transaction = await self.transaction(transaction_id)
        match = await self.db.scalar(
            select(ZZPBankTransactionMatch)
            .where(
                ZZPBankTransactionMatch.id == match_id,
                ZZPBankTransactionMatch.administration_id == self.admin_id,
                ZZPBankTransactionMatch.bank_transaction_id == transaction.id,
            )
            .with_for_update()
        )
        if not match:
            fail("MATCH_NOT_FOUND", "Bankkoppeling niet gevonden.", 404)
        invoice = await self.payments._invoice(match.invoice_id, lock=True)
        if not match.active:
            return match, invoice
        if not match.payment_id or not match.allocation_id:
            fail(
                "LEGACY_BANK_MATCH_REQUIRES_REVIEW",
                "Deze historische koppeling heeft geen ontvangstkoppeling. Laat je boekhouder deze aansluiten.",
            )
        if invoice.credited_cents or invoice.refunded_cents:
            fail(
                "CREDIT_HISTORY_EXISTS",
                "Deze factuur heeft credit- of terugbetalingshistorie. Laat de correctie door je boekhouder aansluiten.",
            )
        allocation = await self.db.get(ZZPPaymentAllocation, match.allocation_id)
        payment = await self.db.get(ZZPPayment, match.payment_id)
        if (
            not allocation
            or not payment
            or payment.administration_id != self.admin_id
            or payment.bank_transaction_id != transaction.id
            or allocation.invoice_id != invoice.id
            or allocation.payment_id != payment.id
            or allocation.allocated_amount_cents != match.amount_cents
        ):
            fail(
                "BANK_HISTORY_REQUIRES_REVIEW",
                "De betalingsverdeling sluit niet aan op de bankhistorie.",
            )
        await require_open_dates(
            self.db,
            self.admin_id,
            transaction.booking_date,
            payment.payment_date.date(),
        )
        if not await self.ledger.repository.has_posted_entry_for_reference(
            "PAYMENT_ALLOCATION", allocation.id
        ):
            fail(
                "BANK_POSTING_REQUIRED",
                "De oorspronkelijke betalingsverdeling heeft geen actieve boeking.",
            )
        await self.ledger.reverse_source("PAYMENT_ALLOCATION", allocation.id)
        await self.db.delete(allocation)
        await self.db.flush()
        # A real receipt remains completed and becomes unallocated. Never erase cash.
        invoice.status = (
            "overdue"
            if invoice.due_date and invoice.due_date < date.today()
            else "sent"
        )
        invoice.amount_paid_cents = 0
        await self.payments.update_invoice_payment_status(invoice.id)
        match.active, match.reversed_at = False, datetime.now(timezone.utc)
        match.reversed_by_id = user_id
        transaction.status = BankTransactionStatus.NEW
        transaction.matched_entity_type = transaction.matched_entity_id = None
        await self.db.flush()
        return match, invoice
