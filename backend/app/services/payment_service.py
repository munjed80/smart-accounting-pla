"""Tenant-scoped payment allocations and ledger synchronization in one transaction."""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.administration import Administration
from app.models.payment import ZZPPayment, ZZPPaymentAllocation, PaymentStatus
from app.models.zzp import ZZPInvoice, ZZPCustomer
from app.repositories.ledger_repository import LedgerRepository
from app.services.zzp_integrity import (
    require_open_dates,
    sync_invoice,
    sync_payment_allocation,
)


class PaymentService:
    def __init__(self, db: AsyncSession, administration_id: UUID):
        self.db = db
        self.administration_id = administration_id

    async def _invoice(self, invoice_id: UUID, *, lock: bool = False) -> ZZPInvoice:
        if lock:
            # Match invoice/ledger mutation lock order and serialize competing payments.
            await self.db.execute(
                select(Administration.id)
                .where(Administration.id == self.administration_id)
                .with_for_update()
            )
        query = select(ZZPInvoice).where(
            ZZPInvoice.id == invoice_id,
            ZZPInvoice.administration_id == self.administration_id,
        )
        if lock:
            query = query.with_for_update().execution_options(populate_existing=True)
        invoice = await self.db.scalar(query)
        if invoice is None:
            raise HTTPException(
                404,
                detail={
                    "code": "INVOICE_NOT_FOUND",
                    "message": "Factuur niet gevonden.",
                },
            )
        return invoice

    @staticmethod
    def _date(value: datetime | None) -> datetime:
        value = value or datetime.now(timezone.utc)
        return (
            value.replace(tzinfo=timezone.utc)
            if value.tzinfo is None
            else value.astimezone(timezone.utc)
        )

    async def require_receipt_period(self, invoice, payment_date):
        paid = await self.db.scalar(
            select(
                func.coalesce(func.sum(ZZPPaymentAllocation.allocated_amount_cents), 0)
            )
            .join(ZZPPayment)
            .where(
                ZZPPaymentAllocation.invoice_id == invoice.id,
                ZZPPayment.administration_id == self.administration_id,
                ZZPPayment.status == "completed",
            )
        )
        if paid != (invoice.amount_paid_cents or 0):
            raise HTTPException(
                409,
                detail={
                    "code": "ORIGINAL_RECEIPTS_UNRECONCILED",
                    "message": "De historische ontvangsten sluiten niet aan op de factuur. Laat deze eerst controleren.",
                },
            )
        posted = await LedgerRepository(
            self.db, self.administration_id
        ).has_posted_entry_for_reference("INVOICE", invoice.id)
        await require_open_dates(
            self.db,
            self.administration_id,
            payment_date,
            None if posted else invoice.issue_date,
        )

    async def create_payment(
        self,
        amount_cents: int,
        payment_date: datetime,
        customer_id: Optional[UUID] = None,
        payment_method: str = "bank_transfer",
        reference: Optional[str] = None,
        notes: Optional[str] = None,
        bank_transaction_id: Optional[UUID] = None,
    ) -> ZZPPayment:
        if amount_cents <= 0 or payment_method not in (
            "bank_transfer",
            "cash",
            "card",
            "ideal",
            "other",
        ):
            raise ValueError("Ongeldig bedrag of betaalmethode.")
        payment_date = self._date(payment_date)
        await require_open_dates(self.db, self.administration_id, payment_date.date())
        if customer_id and not await self.db.scalar(
            select(ZZPCustomer.id).where(
                ZZPCustomer.id == customer_id,
                ZZPCustomer.administration_id == self.administration_id,
            )
        ):
            raise HTTPException(
                404,
                detail={
                    "code": "CUSTOMER_NOT_FOUND",
                    "message": "Klant niet gevonden.",
                },
            )
        payment = ZZPPayment(
            administration_id=self.administration_id,
            customer_id=customer_id,
            amount_cents=amount_cents,
            payment_date=payment_date,
            payment_method=payment_method,
            reference=reference,
            notes=notes,
            bank_transaction_id=bank_transaction_id,
            status=PaymentStatus.COMPLETED.value,
        )
        self.db.add(payment)
        await self.db.flush()
        return payment

    async def allocate_payment_to_invoice(
        self,
        payment_id: UUID,
        invoice_id: UUID,
        allocated_amount_cents: int,
        notes: Optional[str] = None,
    ):
        invoice = await self._invoice(invoice_id, lock=True)
        if invoice.status not in ("sent", "overdue"):
            raise ValueError(
                "Alleen een verzonden of vervallen factuur kan worden betaald."
            )
        payment = await self.db.scalar(
            select(ZZPPayment)
            .where(
                ZZPPayment.id == payment_id,
                ZZPPayment.administration_id == self.administration_id,
            )
            .with_for_update()
        )
        if payment is None or payment.status != PaymentStatus.COMPLETED.value:
            raise ValueError("Betaling niet gevonden of niet actief.")
        await self.require_receipt_period(invoice, payment.payment_date.date())
        if payment.customer_id and payment.customer_id != invoice.customer_id:
            raise ValueError("De betaling hoort bij een andere klant.")
        used = await self.db.scalar(
            select(
                func.coalesce(func.sum(ZZPPaymentAllocation.allocated_amount_cents), 0)
            ).where(ZZPPaymentAllocation.payment_id == payment.id)
        )
        outstanding = invoice.total_cents - (invoice.credited_cents or 0) + (invoice.refunded_cents or 0) - await self.get_invoice_paid_amount(
            invoice_id
        )
        if allocated_amount_cents <= 0 or allocated_amount_cents > min(
            payment.amount_cents - used, outstanding
        ):
            raise ValueError(
                "Het bedrag overschrijdt het beschikbare of openstaande bedrag."
            )
        allocation = ZZPPaymentAllocation(
            payment_id=payment_id,
            invoice_id=invoice_id,
            allocated_amount_cents=allocated_amount_cents,
            notes=notes,
        )
        self.db.add(allocation)
        await self.db.flush()
        await self.update_invoice_payment_status(invoice_id)
        await sync_payment_allocation(
            self.db, self.administration_id, invoice, payment, allocation
        )
        return allocation

    async def get_invoice_paid_amount(self, invoice_id: UUID) -> int:
        invoice = await self._invoice(invoice_id)
        count, paid = (
            await self.db.execute(
                select(
                    func.count(ZZPPaymentAllocation.id),
                    func.coalesce(
                        func.sum(ZZPPaymentAllocation.allocated_amount_cents), 0
                    ),
                )
                .join(ZZPPayment)
                .where(
                    ZZPPaymentAllocation.invoice_id == invoice_id,
                    ZZPPayment.administration_id == self.administration_id,
                    ZZPPayment.status == PaymentStatus.COMPLETED.value,
                )
            )
        ).one()
        # Preserve historical status-only payments until they are explicitly reversed.
        return (
            paid
            if count
            else (invoice.amount_paid_cents if invoice.status == "paid" else 0)
        )

    async def update_invoice_payment_status(self, invoice_id: UUID) -> None:
        invoice = await self._invoice(invoice_id)
        paid = await self.get_invoice_paid_amount(invoice_id)
        invoice.amount_paid_cents = paid
        if paid > 0 and paid + (invoice.credited_cents or 0) - (invoice.refunded_cents or 0) >= invoice.total_cents and invoice.total_cents > 0:
            invoice.status = "paid"
            latest = await self.db.scalar(
                select(func.max(ZZPPayment.payment_date))
                .join(ZZPPaymentAllocation)
                .where(
                    ZZPPaymentAllocation.invoice_id == invoice_id,
                    ZZPPayment.administration_id == self.administration_id,
                    ZZPPayment.status == PaymentStatus.COMPLETED.value,
                )
            )
            invoice.paid_at = latest or invoice.paid_at or datetime.now(timezone.utc)
        else:
            if invoice.status == "paid":
                invoice.status = "sent"
            invoice.paid_at = None
        await self.db.flush()
        await sync_invoice(self.db, self.administration_id, invoice)

    async def mark_invoice_paid(
        self,
        invoice_id: UUID,
        payment_date: Optional[datetime] = None,
        payment_method: str = "bank_transfer",
        reference: Optional[str] = None,
        notes: Optional[str] = None,
    ):
        invoice = await self._invoice(invoice_id, lock=True)
        outstanding = invoice.total_cents - (invoice.credited_cents or 0) + (invoice.refunded_cents or 0) - await self.get_invoice_paid_amount(
            invoice_id
        )
        if outstanding <= 0:
            raise ValueError("Deze factuur is al volledig betaald.")
        return await self.record_partial_payment(
            invoice_id, outstanding, payment_date, payment_method, reference, notes
        )

    async def record_partial_payment(
        self,
        invoice_id: UUID,
        amount_cents: int,
        payment_date: Optional[datetime] = None,
        payment_method: str = "bank_transfer",
        reference: Optional[str] = None,
        notes: Optional[str] = None,
    ):
        invoice = await self._invoice(invoice_id, lock=True)
        if invoice.status not in ("sent", "overdue"):
            raise ValueError(
                "Alleen een verzonden of vervallen factuur kan worden betaald."
            )
        payment_date = self._date(payment_date)
        await self.require_receipt_period(invoice, payment_date.date())
        outstanding = invoice.total_cents - (invoice.credited_cents or 0) + (invoice.refunded_cents or 0) - await self.get_invoice_paid_amount(
            invoice_id
        )
        if amount_cents <= 0 or amount_cents > outstanding:
            raise ValueError("Het bedrag overschrijdt het openstaande bedrag.")
        payment = await self.create_payment(
            amount_cents,
            payment_date,
            invoice.customer_id,
            payment_method,
            reference or f"Betaling {invoice.invoice_number}",
            notes,
        )
        allocation = await self.allocate_payment_to_invoice(
            payment.id, invoice_id, amount_cents, notes
        )
        return payment, allocation

    async def mark_invoice_unpaid(self, invoice_id: UUID) -> None:
        invoice = await self._invoice(invoice_id, lock=True)
        if invoice.credited_cents or invoice.refunded_cents:
            raise HTTPException(409,detail={'code':'CREDIT_HISTORY_EXISTS','message':'Deze factuur heeft credit- of terugbetalingshistorie. Laat betalingscorrecties door je boekhouder aansluiten.'})
        result = await self.db.execute(
            select(ZZPPaymentAllocation, ZZPPayment)
            .join(ZZPPayment)
            .where(
                ZZPPaymentAllocation.invoice_id == invoice.id,
                ZZPPayment.administration_id == self.administration_id,
            )
            .order_by(ZZPPayment.id)
            .with_for_update()
        )
        rows = result.all()
        if any(payment.bank_transaction_id for _, payment in rows):
            raise HTTPException(409, detail={"code":"BANK_MATCH_EXISTS", "message":"Maak de bankkoppeling ongedaan vanuit de bankhistorie. De ontvangst blijft bewaard."})
        await require_open_dates(
            self.db,
            self.administration_id,
            invoice.issue_date,
            invoice.paid_at.date() if invoice.paid_at else None,
            *(payment.payment_date.date() for _, payment in rows),
        )
        for allocation, payment in rows:
            await sync_payment_allocation(
                self.db,
                self.administration_id,
                invoice,
                payment,
                allocation,
                reverse=True,
            )
            await self.db.delete(allocation)
        # Clear legacy status-only payments before recalculating from remaining allocations.
        invoice.status = "sent" if invoice.status == "paid" else invoice.status
        invoice.amount_paid_cents = 0
        invoice.paid_at = None
        await self.db.flush()
        for payment in {payment.id: payment for _, payment in rows}.values():
            remaining = await self.db.scalar(
                select(func.count(ZZPPaymentAllocation.id)).where(
                    ZZPPaymentAllocation.payment_id == payment.id
                )
            )
            if not remaining:
                payment.status = PaymentStatus.REVERSED.value
        await self.update_invoice_payment_status(invoice_id)

    async def get_invoice_payment_summary(self, invoice_id: UUID) -> dict:
        invoice = await self._invoice(invoice_id)
        payments = (
            (
                await self.db.execute(
                    select(ZZPPayment)
                    .join(ZZPPaymentAllocation)
                    .options(selectinload(ZZPPayment.allocations))
                    .where(
                        ZZPPaymentAllocation.invoice_id == invoice_id,
                        ZZPPayment.administration_id == self.administration_id,
                        ZZPPayment.status == PaymentStatus.COMPLETED.value,
                    )
                    .order_by(ZZPPayment.payment_date.desc())
                )
            )
            .scalars()
            .unique()
            .all()
        )
        paid = await self.get_invoice_paid_amount(invoice_id)
        return dict(
            invoice_id=invoice.id,
            invoice_number=invoice.invoice_number,
            invoice_total_cents=invoice.total_cents,
            total_paid_cents=paid,
            total_outstanding_cents=max(0, invoice.total_cents - (invoice.credited_cents or 0) - paid + (invoice.refunded_cents or 0)),
            is_fully_paid=paid + (invoice.credited_cents or 0) - (invoice.refunded_cents or 0) >= invoice.total_cents,
            payments=payments,
        )
