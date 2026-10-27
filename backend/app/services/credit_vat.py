"""Ordinary price-reduction VAT on issued credits; cash exceptions require review."""

from sqlalchemy import select, or_
from app.models.credit_note import ZZPCreditNote, ZZPCustomerRefund


async def apply_credit_vat(db, admin_id, start, end, result, policy):
    notes = (
        await db.scalars(
            select(ZZPCreditNote).where(
                ZZPCreditNote.administration_id == admin_id,
                ZZPCreditNote.issue_date >= start,
                ZZPCreditNote.issue_date <= end,
            )
        )
    ).all()
    result.credit_note_count = len(notes)
    result.credit_vat_cents = sum(note.vat_cents for note in notes)
    if result.basis != "factuurstelsel":
        # Never guess cash-basis relief, the allocation of retained receipts, or
        # the treatment of refunds. Detect credits even when issued earlier.
        affected = await db.scalar(
            select(ZZPCreditNote.id)
            .where(
                ZZPCreditNote.administration_id == admin_id,
                or_(
                    ZZPCreditNote.id.in_([note.id for note in notes]),
                    ZZPCreditNote.invoice_id.in_(result.invoice_ids),
                ),
            )
            .limit(1)
        )
        refund = await db.scalar(
            select(ZZPCustomerRefund.id)
            .where(
                ZZPCustomerRefund.administration_id == admin_id,
                ZZPCustomerRefund.refund_date >= start,
                ZZPCustomerRefund.refund_date <= end,
            )
            .limit(1)
        )
        if affected or refund:
            result.issues.add("CREDIT_CASH_RECONCILIATION_REQUIRED")
        return
    for note in notes:
        if note.snapshot["original_issue_date"] < policy.effective_from.isoformat():
            result.issues.add("CREDIT_ORIGIN_REQUIRES_REVIEW")
        country = (
            (note.snapshot.get("customer_address_country") or "").strip().casefold()
        )
        if country and country not in (
            "nl",
            "nederland",
            "netherlands",
            "the netherlands",
        ):
            result.issues.add("FOREIGN_TRANSACTION_REQUIRES_REVIEW")
        result.omzet -= note.subtotal_cents
        result.output_vat -= note.vat_cents
        for line in note.lines:
            if line.vat_rate == 0:
                result.issues.add("ZERO_RATE_REQUIRES_REVIEW")
            elif line.vat_rate not in (9, 21):
                result.issues.add("UNSUPPORTED_VAT_RATE")
            bucket = result.rate_buckets.setdefault(
                str(line.vat_rate.normalize()), {"omzet": 0, "vat": 0, "count": 0}
            )
            bucket["omzet"] -= line.net_cents
            bucket["vat"] -= line.vat_cents
            bucket["count"] += 1
