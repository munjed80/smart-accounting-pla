"""Tenant-locked, idempotent sales credits and refunds; never rewrite the original."""

import hashlib
import json
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.models.zzp import ZZPInvoice
from app.models.payment import ZZPPayment, ZZPPaymentAllocation
from app.models.credit_note import (
    ZZPCreditNote,
    ZZPCreditLine,
    ZZPCustomerRefund,
    ZZPCreditCounter,
)
from app.models.administration import Administration
from app.services.zzp_integrity import require_open_dates
from app.services.ledger_service import LedgerPostingService, MissingLedgerAccountError
from app.repositories.ledger_repository import LedgerRepository
from app.services.money import round_cents


def fail(code, message, status=409):
    raise HTTPException(status, detail={"code": code, "message": message})


def digest(data):
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def balance(invoice):
    return (
        invoice.total_cents
        - (invoice.credited_cents or 0)
        - (invoice.amount_paid_cents or 0)
        + (invoice.refunded_cents or 0)
    )


class CreditNoteService:
    def __init__(self, db, administration_id):
        self.db, self.administration_id = db, administration_id

    async def invoice(self, invoice_id, lock=False):
        if lock:
            await self.db.scalar(
                select(Administration)
                .where(Administration.id == self.administration_id)
                .with_for_update()
            )
        query = (
            select(ZZPInvoice)
            .options(selectinload(ZZPInvoice.lines))
            .where(
                ZZPInvoice.id == invoice_id,
                ZZPInvoice.administration_id == self.administration_id,
            )
        )
        if lock:
            query = query.with_for_update().execution_options(populate_existing=True)
        invoice = await self.db.scalar(query)
        if not invoice:
            fail("INVOICE_NOT_FOUND", "Factuur niet gevonden.", 404)
        return invoice

    async def note(self, note_id):
        note = await self.db.scalar(
            select(ZZPCreditNote).where(
                ZZPCreditNote.id == note_id,
                ZZPCreditNote.administration_id == self.administration_id,
            )
        )
        if not note:
            fail("CREDIT_NOT_FOUND", "Creditnota niet gevonden.", 404)
        return note

    async def _post(self, invoice, note, refund=None):
        repository = LedgerRepository(self.db, self.administration_id)
        service = LedgerPostingService(repository)
        # Do not invent a backdated original entry when the original is already closed.
        if not await repository.has_posted_entry_for_reference("INVOICE", invoice.id):
            fail(
                "ORIGINAL_POSTING_REQUIRED",
                "De oorspronkelijke factuur heeft nog geen grootboekboeking. Laat je boekhouder deze eerst aansluiten.",
            )
        try:
            ar = await service._require_account("1300")
            amount = Decimal(refund.amount_cents if refund else note.total_cents) / 100
            if refund:
                bank = await service._require_account("1100")
                lines = [
                    dict(account_id=ar.id, debit_amount=amount),
                    dict(account_id=bank.id, credit_amount=amount),
                ]
            else:
                revenue = await service._require_account("8000")
                lines = [
                    dict(
                        account_id=revenue.id,
                        debit_amount=Decimal(note.subtotal_cents) / 100,
                    ),
                    dict(account_id=ar.id, credit_amount=amount),
                ]
                if note.vat_cents:
                    vat = await service._require_account("1700")
                    lines.append(
                        dict(
                            account_id=vat.id,
                            debit_amount=Decimal(note.vat_cents) / 100,
                        )
                    )
            await repository.create_journal_entry(
                entry_date=refund.refund_date if refund else note.issue_date,
                description=f'{"Terugbetaling" if refund else "Creditnota"} {note.number} / {invoice.invoice_number}',
                reference=refund.reference if refund else note.number,
                source_type="CUSTOMER_REFUND" if refund else "CREDIT_NOTE",
                source_id=refund.id if refund else note.id,
                lines=lines,
            )
        except MissingLedgerAccountError as error:
            fail("LEDGER_ACCOUNT_MISSING", str(error))

    async def issue(self, invoice_id, payload, key, user_id):
        invoice = await self.invoice(invoice_id, lock=True)
        normalized = {
            "invoice_id": str(invoice_id),
            "issue_date": payload.issue_date.isoformat(),
            "reason": payload.reason,
            "lines": sorted(
                [
                    (str(line.invoice_line_id), str(line.quantity.normalize()))
                    for line in payload.lines
                ]
            ),
        }
        payload_hash = digest(normalized)
        existing = await self.db.scalar(
            select(ZZPCreditNote).where(
                ZZPCreditNote.administration_id == self.administration_id,
                ZZPCreditNote.creation_key == key,
            )
        )
        if existing:
            if existing.payload_hash != payload_hash:
                fail(
                    "IDEMPOTENCY_CONFLICT",
                    "Dit verzoek is al met andere gegevens verwerkt.",
                )
            return existing
        if invoice.status not in ("sent", "overdue", "paid"):
            fail(
                "INVOICE_NOT_ISSUED",
                "Alleen een verzonden factuur kan worden gecrediteerd.",
            )
        if invoice.status == "paid" and not invoice.amount_paid_cents:
            fail(
                "ORIGINAL_RECEIPTS_UNRECONCILED",
                "De betaalstatus en ontvangsten sluiten niet aan. Laat je boekhouder deze eerst controleren.",
            )
        receipt_count, allocated = (
            await self.db.execute(
                select(
                    func.count(ZZPPaymentAllocation.id),
                    func.coalesce(
                        func.sum(ZZPPaymentAllocation.allocated_amount_cents), 0
                    ),
                )
                .join(ZZPPayment)
                .where(
                    ZZPPaymentAllocation.invoice_id == invoice.id,
                    ZZPPayment.administration_id == self.administration_id,
                    ZZPPayment.status == "completed",
                )
            )
        ).one()
        if (receipt_count and allocated != invoice.amount_paid_cents) or (
            not receipt_count and invoice.amount_paid_cents and invoice.status != "paid"
        ):
            fail(
                "ORIGINAL_RECEIPTS_UNRECONCILED",
                "De ontvangsten sluiten niet aan op de factuur. Laat je boekhouder deze eerst controleren.",
            )
        if not invoice.issue_date <= payload.issue_date <= date.today():
            fail(
                "CREDIT_DATE_INVALID",
                "Kies een datum vanaf de factuurdatum tot en met vandaag.",
                422,
            )
        await require_open_dates(self.db, self.administration_id, payload.issue_date)
        if (
            sum(line.line_total_cents for line in invoice.lines)
            != invoice.subtotal_cents
            or sum(line.vat_amount_cents for line in invoice.lines)
            != invoice.vat_total_cents
        ):
            fail(
                "ORIGINAL_LINES_UNRECONCILED",
                "De factuurregels sluiten niet aan. Laat de oorspronkelijke factuur eerst controleren.",
            )
        if invoice.total_cents != invoice.subtotal_cents + invoice.vat_total_cents:
            fail(
                "ORIGINAL_LINES_UNRECONCILED",
                "Het factuurtotaal sluit niet aan op de regels.",
            )
        used = dict(
            (
                await self.db.execute(
                    select(
                        ZZPCreditLine.invoice_line_id, func.sum(ZZPCreditLine.quantity)
                    )
                    .join(ZZPCreditNote)
                    .where(
                        ZZPCreditNote.administration_id == self.administration_id,
                        ZZPCreditNote.invoice_id == invoice.id,
                    )
                    .group_by(ZZPCreditLine.invoice_line_id)
                )
            ).all()
        )
        originals = {line.id: line for line in invoice.lines}
        rows = []
        for requested in payload.lines:
            original = originals.get(requested.invoice_line_id)
            if not original:
                fail("CREDIT_LINE_NOT_FOUND", "Factuurregel niet gevonden.", 404)
            before = Decimal(used.get(original.id, 0))
            after = before + requested.quantity
            if original.quantity <= 0 or after > original.quantity:
                fail(
                    "CREDIT_EXCEEDS_LINE",
                    "De hoeveelheid overschrijdt het nog te crediteren deel.",
                )
            net = round_cents(
                Decimal(original.line_total_cents) * after / original.quantity
            ) - round_cents(
                Decimal(original.line_total_cents) * before / original.quantity
            )
            vat = round_cents(
                Decimal(original.vat_amount_cents) * after / original.quantity
            ) - round_cents(
                Decimal(original.vat_amount_cents) * before / original.quantity
            )
            if net < 0 or vat < 0:
                fail(
                    "UNSUPPORTED_CREDIT",
                    "De oorspronkelijke bedragen vragen beoordeling.",
                )
            rows.append(
                dict(
                    invoice_line_id=original.id,
                    line_number=original.line_number,
                    description=original.description,
                    quantity=requested.quantity,
                    unit_price_cents=original.unit_price_cents,
                    vat_rate=original.vat_rate,
                    net_cents=net,
                    vat_cents=vat,
                )
            )
        net = sum(row["net_cents"] for row in rows)
        vat = sum(row["vat_cents"] for row in rows)
        if (
            net + vat <= 0
            or (invoice.credited_cents or 0) + net + vat > invoice.total_cents
        ):
            fail(
                "CREDIT_AMOUNT_INVALID",
                "Het creditbedrag is nul of overschrijdt de factuur.",
            )
        counter = await self.db.get(
            ZZPCreditCounter, (self.administration_id, payload.issue_date.year)
        )
        if not counter:
            counter = ZZPCreditCounter(
                administration_id=self.administration_id,
                year=payload.issue_date.year,
                next_number=1,
            )
            self.db.add(counter)
        number = f"CN-{counter.year}-{counter.next_number:04d}"
        counter.next_number += 1
        snapshot = {
            column.name: getattr(invoice, column.name)
            for column in ZZPInvoice.__table__.columns
            if column.name.startswith(("seller_", "customer_"))
        }
        snapshot["customer_id"] = str(invoice.customer_id)
        snapshot.update(
            original_invoice_number=invoice.invoice_number,
            original_issue_date=invoice.issue_date.isoformat(),
        )
        note = ZZPCreditNote(
            administration_id=self.administration_id,
            invoice_id=invoice.id,
            number=number,
            issue_date=payload.issue_date,
            reason=payload.reason,
            subtotal_cents=net,
            vat_cents=vat,
            total_cents=net + vat,
            snapshot=snapshot,
            creation_key=key,
            payload_hash=payload_hash,
            created_by=user_id,
        )
        self.db.add(note)
        await self.db.flush()
        for row in rows:
            self.db.add(ZZPCreditLine(credit_note_id=note.id, **row))
        await self._post(invoice, note)
        invoice.credited_cents = (invoice.credited_cents or 0) + net + vat
        invoice.credit_references = ", ".join(
            filter(None, [invoice.credit_references, number])
        )
        await self.db.flush()
        return note

    async def refund(self, note_id, payload, key, user_id):
        note = await self.note(note_id)
        invoice = await self.invoice(note.invoice_id, lock=True)
        # Reload after the administration lock before checking mutable totals.
        await self.db.refresh(note)
        payload_hash = digest(
            {"credit_note_id": str(note.id), **payload.model_dump(mode="json")}
        )
        existing = await self.db.scalar(
            select(ZZPCustomerRefund).where(
                ZZPCustomerRefund.administration_id == self.administration_id,
                ZZPCustomerRefund.creation_key == key,
            )
        )
        if existing:
            if existing.payload_hash != payload_hash:
                fail(
                    "IDEMPOTENCY_CONFLICT",
                    "Dit verzoek is al met andere gegevens verwerkt.",
                )
            return existing
        if not note.issue_date <= payload.refund_date <= date.today():
            fail(
                "REFUND_DATE_INVALID",
                "Kies een datum vanaf de creditdatum tot en met vandaag.",
                422,
            )
        await require_open_dates(self.db, self.administration_id, payload.refund_date)
        refunded = await self.db.scalar(
            select(func.coalesce(func.sum(ZZPCustomerRefund.amount_cents), 0)).where(
                ZZPCustomerRefund.credit_note_id == note.id
            )
        )
        # A historical refund cannot precede the receipt it is returning, or a later refund registration.
        latest = await self.db.scalar(
            select(func.max(ZZPPayment.payment_date))
            .join(ZZPPaymentAllocation)
            .where(
                ZZPPaymentAllocation.invoice_id == invoice.id,
                ZZPPayment.administration_id == self.administration_id,
                ZZPPayment.status == "completed",
            )
        )
        latest_refund = await self.db.scalar(
            select(func.max(ZZPCustomerRefund.refund_date)).where(
                ZZPCustomerRefund.invoice_id == invoice.id
            )
        )
        latest_day = (
            latest.date()
            if latest
            else (invoice.paid_at.date() if invoice.paid_at else None)
        )
        if invoice.amount_paid_cents and not latest_day:
            fail(
                "ORIGINAL_RECEIPTS_UNRECONCILED",
                "De ontvangstdatum ontbreekt. Laat je boekhouder de betaling eerst aansluiten.",
            )
        if (latest_day and payload.refund_date < latest_day) or (
            latest_refund and payload.refund_date < latest_refund
        ):
            fail(
                "REFUND_DATE_ORDER",
                "De terugbetaling mag niet vóór een geregistreerde ontvangst of eerdere terugbetaling liggen.",
            )
        due = max(0, -balance(invoice))
        if payload.amount_cents > min(due, note.total_cents - refunded):
            fail(
                "REFUND_EXCEEDS_DUE",
                "Het bedrag overschrijdt het nog terug te betalen bedrag.",
            )
        refund = ZZPCustomerRefund(
            administration_id=self.administration_id,
            invoice_id=invoice.id,
            credit_note_id=note.id,
            refund_date=payload.refund_date,
            amount_cents=payload.amount_cents,
            reference=payload.reference,
            creation_key=key,
            payload_hash=payload_hash,
            created_by=user_id,
        )
        self.db.add(refund)
        await self.db.flush()
        await self._post(invoice, note, refund)
        invoice.refunded_cents = (invoice.refunded_cents or 0) + refund.amount_cents
        await self.db.flush()
        return refund


def credit_pdf_view(note):
    values = dict(note.snapshot)
    values.update(
        invoice_number=note.number,
        issue_date=note.issue_date,
        due_date=None,
        delivery_date=None,
        status="credit_note",
        subtotal_cents=-note.subtotal_cents,
        vat_total_cents=-note.vat_cents,
        total_cents=-note.total_cents,
        notes=f'Creditnota bij factuur {note.snapshot["original_invoice_number"]} van {note.snapshot["original_issue_date"]}.\n{note.reason}\nEen creditnota bevestigt geen bankoverschrijving. Terugbetalingen worden apart geregistreerd.',
    )
    values["lines"] = [
        SimpleNamespace(
            id=line.id,
            line_number=line.line_number,
            description=line.description,
            quantity=-line.quantity,
            unit_price_cents=line.unit_price_cents,
            vat_rate=line.vat_rate,
            line_total_cents=-line.net_cents,
            vat_amount_cents=-line.vat_cents,
        )
        for line in note.lines
    ]
    return SimpleNamespace(**values)
