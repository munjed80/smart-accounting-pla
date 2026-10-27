"""One explainable ZZP VAT calculation for dashboard, quarter detail and export.

Unconfirmed history retains its old paid-invoice estimate, explicitly marked for
review. Confirmed invoice basis uses issue dates. Confirmed cash basis uses
allocated completed payments, with cumulative rounding across payment dates.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select, func, exists, and_, or_
from app.models.zzp import ZZPInvoice, ZZPInvoiceLine, ZZPExpense
from app.models.payment import ZZPPayment, ZZPPaymentAllocation
from app.models.zzp_vat_policy import ZZPVatPolicy
from app.services.money import round_cents


@dataclass
class VatCalculation:
    basis: str
    policy_confirmed: bool
    credit_note_count: int = 0
    credit_vat_cents: int = 0
    output_vat: int = 0
    omzet: int = 0
    input_vat: int = 0
    expense_amount: int = 0
    expense_count: int = 0
    invoice_ids: set = field(default_factory=set)
    quarter_invoices: list = field(default_factory=list)
    rate_buckets: dict = field(default_factory=dict)
    issues: set = field(default_factory=set)
    unpaid_vat: int = 0


def proportional_parts(
    values: list[int], numerator: int, denominator: int
) -> list[int]:
    """Round each tax-rate bucket cumulatively; monotone and exact at full payment.

    Each period takes the delta of two cumulative amounts. Never reassign a
    rounding cent between rates: that could create negative tax on a receipt.
    """
    if denominator <= 0:
        return [0] * len(values)
    return [round_cents(Decimal(value) * numerator / denominator) for value in values]


async def calculate_vat(
    db, administration_id: UUID, start: date, end: date
) -> VatCalculation:
    policy = await db.scalar(
        select(ZZPVatPolicy).where(ZZPVatPolicy.administration_id == administration_id)
    )
    confirmed = bool(policy and policy.effective_from <= start)
    basis = policy.basis if confirmed else "unconfirmed"
    result = VatCalculation(basis=basis, policy_confirmed=confirmed)
    if not confirmed:
        result.issues.add("BASIS_UNCONFIRMED")
    end = min(end, date.today())
    paid_day = func.coalesce(func.date(ZZPInvoice.paid_at), ZZPInvoice.issue_date)
    allocated = exists(
        select(ZZPPaymentAllocation.id)
        .join(ZZPPayment)
        .where(
            ZZPPaymentAllocation.invoice_id == ZZPInvoice.id,
            ZZPPayment.administration_id == administration_id,
            ZZPPayment.status == "completed",
        )
    )
    issue_range = and_(ZZPInvoice.issue_date >= start, ZZPInvoice.issue_date <= end)
    legacy_range = and_(paid_day >= start, paid_day <= end)
    if basis == "factuurstelsel":
        advance = await db.scalar(
            select(ZZPPayment.id)
            .join(
                ZZPPaymentAllocation, ZZPPaymentAllocation.payment_id == ZZPPayment.id
            )
            .join(ZZPInvoice, ZZPInvoice.id == ZZPPaymentAllocation.invoice_id)
            .where(
                ZZPPayment.administration_id == administration_id,
                ZZPInvoice.administration_id == administration_id,
                ZZPPayment.status == "completed",
                func.date(ZZPPayment.payment_date) < ZZPInvoice.issue_date,
                or_(
                    issue_range,
                    and_(
                        func.date(ZZPPayment.payment_date) >= start,
                        func.date(ZZPPayment.payment_date) <= end,
                    ),
                ),
            )
            .limit(1)
        )
        if advance:
            result.issues.add("ADVANCE_PAYMENT_REQUIRES_REVIEW")
    previous_month = (start - timedelta(days=1)).replace(day=1)
    delivery_range = and_(
        ZZPInvoice.delivery_date >= previous_month, ZZPInvoice.delivery_date <= end
    )
    # Fetch only invoice candidates relevant to this period; payments are read separately.
    candidates = (
        await db.scalars(
            select(ZZPInvoice).where(
                ZZPInvoice.administration_id == administration_id,
                or_(
                    issue_range,
                    and_(ZZPInvoice.status == "paid", legacy_range),
                    delivery_range,
                ),
            )
        )
    ).all()
    if basis == "factuurstelsel":
        for invoice in candidates:
            delivery = invoice.delivery_date
            if delivery and invoice.status in ("sent", "overdue", "paid"):
                deadline = date(
                    delivery.year + (delivery.month == 12), delivery.month % 12 + 1, 15
                )
                if invoice.issue_date > deadline and (
                    start <= deadline <= end or start <= invoice.issue_date <= end
                ):
                    result.issues.add("LATE_INVOICE_REQUIRES_REVIEW")
    result.quarter_invoices = [
        invoice
        for invoice in candidates
        if (
            start <= invoice.issue_date <= end
            if basis == "factuurstelsel" or invoice.status != "paid"
            else start
            <= (invoice.paid_at.date() if invoice.paid_at else invoice.issue_date)
            <= end
        )
    ]
    recognized = []
    cash_rows = []
    if basis == "factuurstelsel":
        recognized = [
            invoice
            for invoice in candidates
            if start <= invoice.issue_date <= end
            and invoice.status in ("sent", "overdue", "paid")
        ]
    elif basis == "unconfirmed":
        recognized = [
            invoice for invoice in result.quarter_invoices if invoice.status == "paid"
        ]
    else:
        period_ids = (
            select(ZZPPaymentAllocation.invoice_id)
            .join(ZZPPayment)
            .where(
                ZZPPayment.administration_id == administration_id,
                ZZPPayment.status == "completed",
                func.date(ZZPPayment.payment_date) >= start,
                func.date(ZZPPayment.payment_date) <= end,
            )
            .correlate(None)
        )
        # Cumulative payments before the period are needed for exact telescoping rounding.
        cash_rows = (
            await db.execute(
                select(
                    ZZPInvoice,
                    ZZPPaymentAllocation.allocated_amount_cents,
                    func.date(ZZPPayment.payment_date).label("day"),
                )
                .join(
                    ZZPPaymentAllocation,
                    ZZPPaymentAllocation.invoice_id == ZZPInvoice.id,
                )
                .join(ZZPPayment, ZZPPayment.id == ZZPPaymentAllocation.payment_id)
                .where(
                    ZZPInvoice.administration_id == administration_id,
                    ZZPInvoice.id.in_(period_ids),
                    ZZPPayment.administration_id == administration_id,
                    ZZPPayment.status == "completed",
                    func.date(ZZPPayment.payment_date) <= end,
                )
                .order_by(
                    ZZPInvoice.id,
                    ZZPPayment.payment_date,
                    ZZPPayment.id,
                    ZZPPaymentAllocation.id,
                )
            )
        ).all()
        # Legacy paid history must never also be recognized as a native payment.
        recognized = (
            await db.scalars(
                select(ZZPInvoice).where(
                    ZZPInvoice.administration_id == administration_id,
                    ZZPInvoice.status == "paid",
                    legacy_range,
                    ~allocated,
                )
            )
        ).all()
        native_ids = {
            row[0].id for row in cash_rows if str(row.day) >= start.isoformat()
        }
        visible = {invoice.id: invoice for invoice in result.quarter_invoices}
        for row in cash_rows:
            if row[0].id in native_ids:
                visible[row[0].id] = row[0]
        result.quarter_invoices = list(visible.values())
        # An unallocated receipt cannot safely be assigned a tax rate.
        allocations = (
            select(
                ZZPPaymentAllocation.payment_id,
                func.sum(ZZPPaymentAllocation.allocated_amount_cents).label("amount"),
            )
            .join(ZZPInvoice)
            .where(ZZPInvoice.administration_id == administration_id)
            .group_by(ZZPPaymentAllocation.payment_id)
            .subquery()
        )
        unallocated = await db.scalar(
            select(ZZPPayment.id)
            .outerjoin(allocations, allocations.c.payment_id == ZZPPayment.id)
            .where(
                ZZPPayment.administration_id == administration_id,
                ZZPPayment.status == "completed",
                func.date(ZZPPayment.payment_date) >= start,
                func.date(ZZPPayment.payment_date) <= end,
                ZZPPayment.amount_cents != func.coalesce(allocations.c.amount, 0),
            )
            .limit(1)
        )
        if unallocated:
            result.issues.add("UNALLOCATED_RECEIPTS")
    all_invoices = {invoice.id: invoice for invoice in recognized}
    all_invoices.update({row[0].id: row[0] for row in cash_rows})
    lines_by_invoice = {}
    if all_invoices:
        lines = (
            await db.scalars(
                select(ZZPInvoiceLine)
                .where(ZZPInvoiceLine.invoice_id.in_(all_invoices))
                .order_by(ZZPInvoiceLine.invoice_id, ZZPInvoiceLine.id)
            )
        ).all()
        for line in lines:
            lines_by_invoice.setdefault(line.invoice_id, []).append(line)

    def recognize(invoice, before: int, after: int, *, legacy=False):
        if legacy and invoice.paid_at is None:
            result.issues.add("LEGACY_PAYMENT_DATE_UNKNOWN")
        country = (invoice.customer_address_country or "").strip().casefold()
        if country and country not in (
            "nl",
            "nederland",
            "netherlands",
            "the netherlands",
        ):
            result.issues.add("FOREIGN_TRANSACTION_REQUIRES_REVIEW")
        if (
            invoice.total_cents <= 0
            or invoice.subtotal_cents < 0
            or invoice.vat_total_cents < 0
        ):
            result.issues.add("UNSUPPORTED_INVOICE")
            return
        if invoice.status not in ("sent", "overdue", "paid"):
            result.issues.add("PAYMENT_ON_INACTIVE_INVOICE")
            return
        if after > invoice.total_cents or before < 0:
            result.issues.add("ALLOCATION_EXCEEDS_INVOICE")
        before, after = min(before, invoice.total_cents), min(
            after, invoice.total_cents
        )
        if after <= before:
            return
        result.invoice_ids.add(invoice.id)
        lines = lines_by_invoice.get(invoice.id, [])
        if (
            not lines
            or sum(line.line_total_cents for line in lines) != invoice.subtotal_cents
            or sum(line.vat_amount_cents for line in lines) != invoice.vat_total_cents
            or invoice.total_cents != invoice.subtotal_cents + invoice.vat_total_cents
        ):
            result.issues.add("INVOICE_LINES_UNRECONCILED")
            result.output_vat += round_cents(
                Decimal(invoice.vat_total_cents) * after / invoice.total_cents
            ) - round_cents(
                Decimal(invoice.vat_total_cents) * before / invoice.total_cents
            )
            result.omzet += round_cents(
                Decimal(invoice.subtotal_cents) * after / invoice.total_cents
            ) - round_cents(
                Decimal(invoice.subtotal_cents) * before / invoice.total_cents
            )
            return
        groups = {}
        for line in lines:
            rate = Decimal(str(line.vat_rate))
            if rate not in (0, 9, 21):
                result.issues.add("UNSUPPORTED_VAT_RATE")
            if rate == 0:
                result.issues.add("ZERO_RATE_REQUIRES_REVIEW")
            net, vat = groups.get(rate, (0, 0))
            groups[rate] = (net + line.line_total_cents, vat + line.vat_amount_cents)
        rates = sorted(groups)
        before_vat = proportional_parts(
            [groups[r][1] for r in rates], before, invoice.total_cents
        )
        after_vat = proportional_parts(
            [groups[r][1] for r in rates], after, invoice.total_cents
        )
        before_net = proportional_parts(
            [groups[r][0] for r in rates],
            before,
            invoice.total_cents,
        )
        after_net = proportional_parts(
            [groups[r][0] for r in rates],
            after,
            invoice.total_cents,
        )
        for i, rate in enumerate(rates):
            vat, net = after_vat[i] - before_vat[i], after_net[i] - before_net[i]
            bucket = result.rate_buckets.setdefault(
                str(rate.normalize()), {"omzet": 0, "vat": 0, "count": 0}
            )
            bucket["omzet"] += net
            bucket["vat"] += vat
            bucket["count"] += 1
            result.output_vat += vat
            result.omzet += net
        if legacy and invoice.paid_at is None:
            result.issues.add("LEGACY_PAYMENT_DATE_UNKNOWN")

    for invoice in recognized:
        recognize(invoice, 0, invoice.total_cents, legacy=basis != "factuurstelsel")
    cumulative = {}
    for row in cash_rows:
        invoice, cents, day = row
        if cents <= 0:
            result.issues.add("INVALID_PAYMENT_ALLOCATION")
            continue
        before = cumulative.get(invoice.id, 0)
        cumulative[invoice.id] = before + cents
        if str(day) >= start.isoformat():
            recognize(invoice, before, before + cents)
    for invoice in result.quarter_invoices:
        if invoice.status in ("sent", "overdue") and invoice.total_cents > 0:
            paid = min(max(invoice.amount_paid_cents or 0, 0), invoice.total_cents)
            result.unpaid_vat += invoice.vat_total_cents - round_cents(
                Decimal(invoice.vat_total_cents) * paid / invoice.total_cents
            )
    expenses = (
        await db.scalars(
            select(ZZPExpense).where(
                ZZPExpense.administration_id == administration_id,
                ZZPExpense.expense_date >= start,
                ZZPExpense.expense_date <= end,
            )
        )
    ).all()
    result.expense_count = len(expenses)
    result.expense_amount = sum(expense.amount_cents for expense in expenses)
    result.input_vat = sum(expense.vat_amount_cents or 0 for expense in expenses)
    for expense in expenses:
        if (
            expense.amount_cents < 0
            or (expense.vat_amount_cents or 0) < 0
            or (expense.vat_amount_cents or 0) > expense.amount_cents
        ):
            result.issues.add("EXPENSE_VAT_REQUIRES_REVIEW")
    from app.services.credit_vat import apply_credit_vat
    await apply_credit_vat(db, administration_id, start, end, result, policy)
    return result
