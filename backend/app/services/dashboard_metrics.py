"""Shared tenant-scoped dashboard cash receipts and VAT overview totals."""

from datetime import date
from sqlalchemy import select, func, case, exists, literal, union_all, extract
from app.models.zzp import ZZPInvoice, ZZPExpense
from app.models.payment import ZZPPayment, ZZPPaymentAllocation


def outstanding_cents():
    remaining = ZZPInvoice.total_cents - func.coalesce(ZZPInvoice.amount_paid_cents, 0)
    return case((remaining > 0, remaining), else_=0)


def paid_invoice_day():
    return func.coalesce(func.date(ZZPInvoice.paid_at), ZZPInvoice.issue_date)


def receipt_rows(administration_id):
    """Count a payment once, including unallocated receipts; retain status-only history."""
    allocated = exists(
        select(ZZPPaymentAllocation.id)
        .join(ZZPPayment)
        .where(
            ZZPPaymentAllocation.invoice_id == ZZPInvoice.id,
            ZZPPayment.administration_id == administration_id,
            ZZPPayment.status == "completed",
        )
    )
    payments = select(
        ZZPPayment.id.label("id"),
        literal("payment").label("source"),
        func.date(ZZPPayment.payment_date).label("day"),
        ZZPPayment.amount_cents.label("amount_cents"),
        ZZPPayment.reference.label("reference"),
    ).where(
        ZZPPayment.administration_id == administration_id,
        ZZPPayment.status == "completed",
    )
    legacy_amount = case(
        (ZZPInvoice.amount_paid_cents > 0, ZZPInvoice.amount_paid_cents),
        else_=ZZPInvoice.total_cents,
    )
    legacy = select(
        ZZPInvoice.id.label("id"),
        literal("invoice").label("source"),
        paid_invoice_day().label("day"),
        legacy_amount.label("amount_cents"),
        ZZPInvoice.invoice_number.label("reference"),
    ).where(
        ZZPInvoice.administration_id == administration_id,
        ZZPInvoice.status == "paid",
        ~allocated,
    )
    return union_all(payments, legacy).subquery()


async def receipt_months(db, administration_id, start: date, end: date):
    rows = receipt_rows(administration_id)
    result = await db.execute(
        select(
            extract("year", rows.c.day).label("year"),
            extract("month", rows.c.day).label("month"),
            func.sum(rows.c.amount_cents).label("amount"),
            func.count().label("count"),
        )
        .where(rows.c.day >= start, rows.c.day <= end)
        .group_by(extract("year", rows.c.day), extract("month", rows.c.day))
    )
    return {
        f"{int(r.year):04d}-{int(r.month):02d}": {"amount": r.amount, "count": r.count}
        for r in result
    }


async def vat_overview_totals(db, administration_id, start: date, end: date):
    """Reuse the existing self-service kasstelsel rule, including undated paid history."""
    output = await db.scalar(
        select(func.coalesce(func.sum(ZZPInvoice.vat_total_cents), 0)).where(
            ZZPInvoice.administration_id == administration_id,
            ZZPInvoice.status == "paid",
            paid_invoice_day() >= start,
            paid_invoice_day() <= end,
        )
    )
    deductible = await db.scalar(
        select(func.coalesce(func.sum(ZZPExpense.vat_amount_cents), 0)).where(
            ZZPExpense.administration_id == administration_id,
            ZZPExpense.expense_date >= start,
            ZZPExpense.expense_date <= end,
        )
    )
    return output, deductible
