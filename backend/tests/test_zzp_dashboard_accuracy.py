"""Dashboard figures must reconcile to their drilldowns without tenant leakage."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from app.models.administration import Administration
from app.models.payment import ZZPPayment, ZZPPaymentAllocation
from app.models.zzp import (
    ZZPInvoice,
    ZZPExpense,
    ZZPTimeEntry,
    ZZPDocument,
    ZZPDocType,
    ZZPDocStatus,
)


def at(day):
    return datetime.combine(day, datetime.min.time(), timezone.utc)


async def get(client, headers, path, **params):
    response = await client.get("/api/v1/zzp/" + path, headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def payment(admin_id, cents, day, **kw):
    return ZZPPayment(
        administration_id=admin_id, amount_cents=cents, payment_date=at(day), **kw
    )


@pytest.mark.asyncio
async def test_partial_receipts_reconcile_to_cash_and_open_invoice_drilldowns(
    async_client, db_session, auth_headers, test_invoice_sent
):
    invoice = test_invoice_sent
    today = date.today()
    previous = today.replace(day=1) - timedelta(days=1)
    invoice.issue_date = previous
    invoice.due_date = today - timedelta(days=1)
    invoice.amount_paid_cents = 5000
    receipt = payment(invoice.administration_id, 5000, today, reference="Part payment")
    db_session.add(receipt)
    await db_session.flush()
    db_session.add(
        ZZPPaymentAllocation(
            payment_id=receipt.id, invoice_id=invoice.id, allocated_amount_cents=5000
        )
    )
    await db_session.commit()

    summary = await get(async_client, auth_headers, "dashboard")
    assert summary["invoices"]["paid_this_month_cents"] == 5000
    assert (
        summary["invoices"]["open_total_cents"]
        == summary["invoices"]["overdue_total_cents"]
        == 7100
    )
    for status in ["open", "overdue"]:
        listing = await get(async_client, auth_headers, "invoices", status=status)
        assert listing["total"] == 1
        assert listing["stats"]["openAmount"] == 7100
    months = (await get(async_client, auth_headers, "dashboard/monthly-invoices"))[
        "months"
    ]
    assert len(months) == 6
    assert months[-1]["received_total"] == 5000
    assert months[-1]["sent_total"] == 0
    assert months[-2]["sent_total"] == 12100
    assert months[-2]["received_total"] == 0
    drilldown = await get(
        async_client,
        auth_headers,
        "dashboard/receipts",
        year=today.year,
        month=today.month,
    )
    assert drilldown["total_amount_cents"] == 5000
    assert drilldown["receipts"][0]["invoices"] == [
        {"id": str(invoice.id), "invoice_number": invoice.invoice_number}
    ]


@pytest.mark.asyncio
async def test_receipts_count_payments_once_include_unallocated_and_legacy_but_exclude_reversals_future_and_other_tenants(
    async_client, db_session, auth_headers, test_invoice_sent
):
    today = date.today()
    invoice = test_invoice_sent
    invoice.status = "paid"
    invoice.amount_paid_cents = invoice.total_cents
    invoice.paid_at = at(today)
    native = payment(invoice.administration_id, 12100, today, reference="Native")
    other = Administration(name="Other tenant", is_active=True)
    db_session.add_all([native, other])
    await db_session.flush()
    # One payment allocated twice is still a single receipt.
    db_session.add_all(
        [
            ZZPPaymentAllocation(
                payment_id=native.id, invoice_id=invoice.id, allocated_amount_cents=6000
            ),
            ZZPPaymentAllocation(
                payment_id=native.id, invoice_id=invoice.id, allocated_amount_cents=6100
            ),
        ]
    )
    legacy = ZZPInvoice(
        administration_id=invoice.administration_id,
        customer_id=invoice.customer_id,
        invoice_number="LEGACY",
        status="paid",
        issue_date=today,
        total_cents=2000,
        subtotal_cents=2000,
        vat_total_cents=0,
        seller_company_name="Seller",
        customer_name="Customer",
    )
    db_session.add_all(
        [
            legacy,
            payment(invoice.administration_id, 3000, today, reference="Unallocated"),
            payment(invoice.administration_id, 999999, today, status="reversed"),
            payment(invoice.administration_id, 999999, today + timedelta(days=1)),
            payment(other.id, 999999, today),
        ]
    )
    await db_session.commit()
    summary = await get(async_client, auth_headers, "dashboard")
    assert summary["invoices"]["paid_this_month_cents"] == 17100
    assert summary["invoices"]["paid_this_month_count"] == 3
    assert summary["invoices"]["open_total_cents"] == 0
    all_ids = []
    for offset in range(3):
        page = await get(
            async_client,
            auth_headers,
            "dashboard/receipts",
            year=today.year,
            month=today.month,
            limit=1,
            offset=offset,
        )
        assert page["total"] == 3
        assert page["total_amount_cents"] == 17100
        assert page["administration_id"] == str(invoice.administration_id)
        all_ids.append(page["receipts"][0]["id"])
    assert len(set(all_ids)) == 3
    month = (
        await get(
            async_client,
            auth_headers,
            "dashboard/monthly-invoices",
            period="this_month",
        )
    )["months"][0]
    assert month["received_total"] == 17100
    assert month["received_count"] == 3


@pytest.mark.asyncio
async def test_signed_vat_matches_detail_including_undated_paid_history(
    async_client, db_session, auth_headers, test_invoice_sent
):
    today = date.today()
    test_invoice_sent.status = "paid"
    test_invoice_sent.paid_at = None
    test_invoice_sent.issue_date = today
    db_session.add(
        ZZPExpense(
            administration_id=test_invoice_sent.administration_id,
            vendor="Supplier",
            expense_date=today,
            amount_cents=24200,
            vat_amount_cents=4200,
            vat_rate=21,
            category="algemeen",
        )
    )
    await db_session.commit()
    summary = await get(async_client, auth_headers, "dashboard")
    detail = await get(async_client, auth_headers, "btw-aangifte")
    assert summary["btw"]["basis"] == "kasstelsel"
    assert (
        summary["btw"]["vat_collected_cents"]
        == detail["current_quarter"]["output_vat_cents"]
        == 2100
    )
    assert (
        summary["btw"]["net_vat_cents"]
        == detail["current_quarter"]["net_vat_cents"]
        == -2100
    )
    assert (
        summary["btw"]["vat_payable_cents"] == 0
    )  # backwards-compatible unsigned field


@pytest.mark.asyncio
async def test_attention_queue_shared_sorted_and_zero_vat_not_flagged(
    async_client, db_session, auth_headers, test_invoice_sent
):
    admin_id = test_invoice_sent.administration_id
    today = date.today()
    db_session.add_all(
        [
            ZZPTimeEntry(
                administration_id=admin_id,
                entry_date=today,
                description="Work",
                hours=Decimal("1.5"),
                billable=True,
                hourly_rate_cents=5000,
                is_invoiced=False,
            ),
            ZZPTimeEntry(
                administration_id=admin_id,
                entry_date=today + timedelta(days=7),
                description="Planned",
                hours=Decimal("20"),
                billable=True,
                hourly_rate_cents=5000,
                is_invoiced=False,
            ),
            ZZPExpense(
                administration_id=admin_id,
                vendor="Exempt",
                expense_date=today,
                amount_cents=1000,
                vat_amount_cents=0,
                vat_rate=0,
                category="algemeen",
            ),
            ZZPDocument(
                administration_id=admin_id,
                filename="check.pdf",
                mime_type="application/pdf",
                storage_ref="check",
                doc_type=ZZPDocType.BON,
                status=ZZPDocStatus.REVIEW,
            ),
        ]
    )
    await db_session.commit()
    summary = await get(async_client, auth_headers, "dashboard")
    actions = summary["actions"]
    standalone = await get(async_client, auth_headers, "dashboard/actions")
    assert standalone["actions"] == actions
    assert len({item["id"] for item in actions}) == len(actions)
    assert all(item["type"] != "missing_btw_on_expense" for item in actions)
    assert (
        next(item for item in actions if item["id"] == "review-documents")["count"] == 1
    )
    unbilled = next(item for item in actions if item["id"] == "unbilled-hours")
    assert unbilled["amount_cents"] == 7500  # planned entries are not worked hours
    assert summary["time"]["this_week_hours"] == 1.5
    assert summary["time"]["this_week_value_cents"] == 7500
    ranks = [
        {"error": 0, "warning": 1, "info": 2}[item["severity"]] for item in actions
    ]
    assert ranks == sorted(ranks)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "params",
    [
        {"year": 2026, "month": 0},
        {"year": 2026, "month": 13},
        {"year": 2026, "month": 1, "limit": 101},
        {"year": 2026, "month": 1, "offset": -1},
    ],
)
async def test_receipt_parameters_are_bounded(
    async_client, auth_headers, test_administration, params
):
    response = await async_client.get(
        "/api/v1/zzp/dashboard/receipts", headers=auth_headers, params=params
    )
    assert response.status_code == 422
