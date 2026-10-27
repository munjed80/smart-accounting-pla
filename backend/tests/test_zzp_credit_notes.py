"""Issued credits, real refund registrations and immutable original invoice history."""

from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from uuid import UUID, uuid4
import pytest
import pytest_asyncio
from sqlalchemy import select, func
from app.models.accounting import ChartOfAccount
from app.models.zzp import ZZPInvoice
from app.models.credit_note import ZZPCreditNote, ZZPCustomerRefund, ZZPCreditCounter
from app.models.ledger import JournalEntry, AccountingPeriod, PeriodStatus
from app.models.zzp_vat_policy import ZZPVatPolicy


@pytest_asyncio.fixture
async def credit_chart(db_session, test_administration):
    for code, kind in [
        ("1100", "ASSET"),
        ("1300", "ASSET"),
        ("1700", "LIABILITY"),
        ("8000", "REVENUE"),
    ]:
        db_session.add(
            ChartOfAccount(
                administration_id=test_administration.id,
                account_code=code,
                account_name=code,
                account_type=kind,
                is_active=True,
            )
        )
    await db_session.commit()


async def issued(client, headers, customer, *, quantity=2, day=None):
    result = await client.post(
        "/api/v1/zzp/invoices",
        headers=headers,
        json={
            "customer_id": str(customer.id),
            "issue_date": (day or date.today()).isoformat(),
            "lines": [
                {
                    "description": "Original service",
                    "quantity": quantity,
                    "unit_price_cents": 10000,
                    "vat_rate": 21,
                }
            ],
        },
    )
    assert result.status_code == 201, result.text
    invoice = result.json()
    result = await client.patch(
        "/api/v1/zzp/invoices/" + invoice["id"] + "/status",
        headers=headers,
        json={"status": "sent"},
    )
    assert result.status_code == 200, result.text
    return result.json()


async def credit(client, headers, invoice, quantity=1, key=None, day=None, **extra):
    return await client.post(
        "/api/v1/zzp/invoices/" + invoice["id"] + "/credits",
        headers={**headers, "Idempotency-Key": str(key or uuid4())},
        json={
            "issue_date": (day or date.today()).isoformat(),
            "reason": "Prijsvermindering afgesproken",
            "lines": [
                {"invoice_line_id": invoice["lines"][0]["id"], "quantity": quantity}
            ],
            **extra,
        },
    )


async def credits(client, headers, invoice):
    result = await client.get(
        "/api/v1/zzp/invoices/" + invoice["id"] + "/credits", headers=headers
    )
    assert result.status_code == 200, result.text
    return result.json()


@pytest.mark.asyncio
async def test_partial_credit_preserves_original_and_reconciles_open_totals(
    async_client, auth_headers, test_customer, db_session, credit_chart
):
    invoice = await issued(async_client, auth_headers, test_customer)
    result = await credit(async_client, auth_headers, invoice)
    assert result.status_code == 201, result.text
    summary = await credits(async_client, auth_headers, invoice)
    assert summary["credited_cents"] == 12100
    assert summary["outstanding_cents"] == 12100
    assert summary["refund_due_cents"] == 0
    original = await db_session.get(ZZPInvoice, UUID(invoice["id"]))
    assert (
        original.total_cents == 24200
        and original.subtotal_cents == 20000
        and original.vat_total_cents == 4200
    )
    assert original.amount_paid_cents == 0 and original.paid_at is None
    assert original.invoice_number == invoice["invoice_number"]
    dashboard = (
        await async_client.get("/api/v1/zzp/dashboard", headers=auth_headers)
    ).json()
    listing = (
        await async_client.get("/api/v1/zzp/invoices?status=open", headers=auth_headers)
    ).json()
    assert (
        dashboard["invoices"]["open_total_cents"]
        == listing["stats"]["openAmount"]
        == 12100
    )
    entries = (await db_session.scalars(select(JournalEntry))).all()
    assert len(entries) == 2
    assert all(entry.total_debit == entry.total_credit for entry in entries)
    assert next(
        entry for entry in entries if entry.source_type == "CREDIT_NOTE"
    ).total_debit == Decimal("121.00")


@pytest.mark.asyncio
async def test_full_unpaid_credit_does_not_invent_a_receipt(
    async_client, auth_headers, test_customer, db_session, credit_chart
):
    invoice = await issued(async_client, auth_headers, test_customer)
    assert (
        await credit(async_client, auth_headers, invoice, quantity=2)
    ).status_code == 201
    source = await db_session.get(ZZPInvoice, UUID(invoice["id"]))
    assert (
        source.status == "sent"
        and source.amount_paid_cents == 0
        and source.paid_at is None
    )
    dashboard = (
        await async_client.get("/api/v1/zzp/dashboard", headers=auth_headers)
    ).json()
    assert dashboard["invoices"]["open_total_cents"] == 0
    assert dashboard["invoices"]["paid_this_month_cents"] == 0
    assert (await credit(async_client, auth_headers, invoice)).status_code == 409


@pytest.mark.asyncio
async def test_credit_and_refund_retries_are_idempotent_and_payments_remain_intact(
    async_client, auth_headers, test_customer, db_session, credit_chart
):
    invoice = await issued(async_client, auth_headers, test_customer)
    paid = await async_client.patch(
        "/api/v1/zzp/invoices/" + invoice["id"] + "/status",
        headers=auth_headers,
        json={"status": "paid"},
    )
    assert paid.status_code == 200, paid.text
    key = uuid4()
    a = await credit(async_client, auth_headers, invoice, key=key)
    b = await credit(async_client, auth_headers, invoice, key=key)
    assert a.status_code == b.status_code == 201 and a.json() == b.json()
    assert (
        await credit(async_client, auth_headers, invoice, key=key, quantity=2)
    ).status_code == 409
    note_id = a.json()["id"]
    key = uuid4()
    payload = {
        "refund_date": date.today().isoformat(),
        "amount_cents": 12100,
        "reference": "Bank transfer 123",
    }
    path = "/api/v1/zzp/credit-notes/" + note_id + "/refunds"
    a = await async_client.post(
        path, headers={**auth_headers, "Idempotency-Key": str(key)}, json=payload
    )
    b = await async_client.post(
        path, headers={**auth_headers, "Idempotency-Key": str(key)}, json=payload
    )
    assert a.status_code == b.status_code == 201, a.text
    assert a.json() == b.json() and a.json()["registered_only"]
    summary = await credits(async_client, auth_headers, invoice)
    assert (
        summary["refund_due_cents"] == 0
        and summary["refunded_cents"] == 12100
        and summary["outstanding_cents"] == 0
    )
    source = await db_session.get(ZZPInvoice, UUID(invoice["id"]))
    assert source.amount_paid_cents == 24200 and source.status == "paid"
    assert await db_session.scalar(select(func.count(ZZPCreditNote.id))) == 1
    assert await db_session.scalar(select(func.count(ZZPCustomerRefund.id))) == 1
    assert (
        await async_client.post(
            path,
            headers={**auth_headers, "Idempotency-Key": str(uuid4())},
            json=payload,
        )
    ).status_code == 409
    assert all(
        e.total_debit == e.total_credit
        for e in (await db_session.scalars(select(JournalEntry))).all()
    )


@pytest.mark.asyncio
async def test_remaining_payment_after_credit_is_limited_to_net_due(
    async_client, auth_headers, test_customer, credit_chart
):
    invoice = await issued(async_client, auth_headers, test_customer)
    assert (await credit(async_client, auth_headers, invoice)).status_code == 201
    paid = await async_client.patch(
        "/api/v1/zzp/invoices/" + invoice["id"] + "/status",
        headers=auth_headers,
        json={"status": "paid"},
    )
    assert paid.status_code == 200, paid.text
    assert paid.json()["amount_paid_cents"] == 12100
    assert (
        paid.json()["outstanding_cents"] == 0 and paid.json()["credited_cents"] == 12100
    )
    assert (
        await async_client.post(
            "/api/v1/zzp/invoices/" + invoice["id"] + "/mark-unpaid",
            headers=auth_headers,
        )
    ).status_code == 409


@pytest.mark.asyncio
async def test_locked_original_can_be_credited_in_later_open_period(
    async_client,
    auth_headers,
    test_customer,
    test_administration,
    db_session,
    credit_chart,
):
    old = date.today().replace(day=1) - timedelta(days=1)
    invoice = await issued(async_client, auth_headers, test_customer, day=old)
    db_session.add(
        AccountingPeriod(
            administration_id=test_administration.id,
            name="Closed original",
            period_type="MONTH",
            start_date=old.replace(day=1),
            end_date=old,
            status=PeriodStatus.LOCKED,
        )
    )
    await db_session.commit()
    assert (await credit(async_client, auth_headers, invoice)).status_code == 201
    assert (
        await credit(async_client, auth_headers, invoice, day=old)
    ).status_code == 409


@pytest.mark.asyncio
async def test_original_posting_is_required_and_failure_rolls_back_everything(
    async_client, auth_headers, test_invoice_sent, db_session
):
    invoice = {"id": str(test_invoice_sent.id), "lines": [{"id": str(uuid4())}]}
    # The source fixture has no lines/posting. No note or number may survive.
    result = await credit(async_client, auth_headers, invoice)
    assert result.status_code in (404, 409)
    assert await db_session.scalar(select(func.count(ZZPCreditNote.id))) == 0
    assert await db_session.scalar(select(func.count(ZZPCreditCounter.year))) == 0


@pytest.mark.asyncio
async def test_invoice_basis_credit_is_negative_in_its_own_period_and_not_deducted_twice_by_refund(
    async_client,
    auth_headers,
    test_customer,
    test_administration,
    test_user,
    db_session,
    credit_chart,
):
    invoice = await issued(
        async_client, auth_headers, test_customer, day=date(2026, 1, 1)
    )
    db_session.add(
        ZZPVatPolicy(
            administration_id=test_administration.id,
            basis="factuurstelsel",
            effective_from=date(2026, 1, 1),
            confirmed_by=test_user.id,
        )
    )
    await db_session.commit()
    paid = await async_client.post(
        "/api/v1/zzp/invoices/" + invoice["id"] + "/mark-paid",
        headers=auth_headers,
        json={
            "payment_date": "2026-01-02T12:00:00Z",
            "payment_method": "bank_transfer",
        },
    )
    assert paid.status_code == 200, paid.text
    result = await credit(async_client, auth_headers, invoice, day=date(2026, 4, 1))
    assert result.status_code == 201, result.text
    refund = await async_client.post(
        "/api/v1/zzp/credit-notes/" + result.json()["id"] + "/refunds",
        headers={**auth_headers, "Idempotency-Key": str(uuid4())},
        json={
            "refund_date": "2026-04-02",
            "amount_cents": 12100,
            "reference": "Bank return",
        },
    )
    assert refund.status_code == 201, refund.text
    q1 = (
        await async_client.get(
            "/api/v1/zzp/btw-aangifte?year=2026&quarter=1", headers=auth_headers
        )
    ).json()["current_quarter"]
    q2 = (
        await async_client.get(
            "/api/v1/zzp/btw-aangifte?year=2026&quarter=2", headers=auth_headers
        )
    ).json()["current_quarter"]
    assert q1["output_vat_cents"] == 4200
    assert q2["output_vat_cents"] == -2100 and q2["omzet_cents"] == -10000
    assert q2["credit_note_count"] == 1 and q2["is_ready"]
    assert sum(line["vat_cents"] for line in q2["vat_rate_breakdown"]) == -2100


@pytest.mark.asyncio
async def test_cumulative_rounding_recovers_every_original_cent(
    async_client, auth_headers, test_customer, db_session, credit_chart
):
    invoice = await issued(async_client, auth_headers, test_customer, quantity=3)
    # Three fractional credits must add up exactly, including the final VAT cent.
    amounts = []
    for quantity in ["0.333", "0.333", "2.334"]:
        result = await credit(async_client, auth_headers, invoice, quantity=quantity)
        assert result.status_code == 201, result.text
        note = await db_session.get(ZZPCreditNote, UUID(result.json()["id"]))
        amounts.append((note.subtotal_cents, note.vat_cents))
    assert sum(n for n, v in amounts) == invoice["subtotal_cents"]
    assert sum(v for n, v in amounts) == invoice["vat_total_cents"]
    summary = await credits(async_client, auth_headers, invoice)
    assert summary["outstanding_cents"] == 0
    assert Decimal(summary["available_lines"][0]["available_quantity"]) == 0


@pytest.mark.asyncio
async def test_tenant_boundary_and_foreign_line_do_not_disclose_records(
    async_client,
    auth_headers,
    test_customer,
    test_administration,
    db_session,
    credit_chart,
):
    from app.services.credit_notes import CreditNoteService
    from fastapi import HTTPException

    invoice = await issued(async_client, auth_headers, test_customer)
    response = await credit(async_client, auth_headers, invoice)
    note_id = UUID(response.json()["id"])
    for operation in [
        CreditNoteService(db_session, uuid4()).invoice(UUID(invoice["id"])),
        CreditNoteService(db_session, uuid4()).note(note_id),
    ]:
        with pytest.raises(HTTPException) as exc:
            await operation
        assert exc.value.status_code == 404
    bad = await credit(
        async_client,
        auth_headers,
        invoice,
        lines=[{"invoice_line_id": str(uuid4()), "quantity": 1}],
    )
    assert bad.status_code == 404
    assert await db_session.scalar(select(func.count(ZZPCreditNote.id))) == 1


@pytest.mark.asyncio
async def test_pdf_snapshot_signed_amounts_and_original_link(
    async_client, auth_headers, test_customer, db_session, credit_chart, tmp_path
):
    from app.services.credit_notes import credit_pdf_view
    from app.services.invoice_pdf_reportlab import generate_invoice_pdf_reportlab
    from pypdf import PdfReader
    from io import BytesIO

    invoice = await issued(async_client, auth_headers, test_customer)
    result = await credit(
        async_client, auth_headers, invoice, reason="Retour <script>alert(1)</script>"
    )
    assert result.status_code == 201, result.text
    note = await db_session.get(ZZPCreditNote, UUID(result.json()["id"]))
    snapshot = dict(note.snapshot)
    test_customer.name = "New customer name"
    await db_session.commit()
    response = await async_client.get(
        "/api/v1/zzp/credit-notes/" + str(note.id) + "/pdf", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    assert response.content.startswith(b"%PDF-")
    assert response.headers["cache-control"] == "no-store"
    assert note.number in response.headers["content-disposition"]
    (tmp_path / "credit.pdf").write_bytes(response.content)
    # Both production renderers must identify credits, show negative amounts,
    # preserve the issued snapshot and avoid asking the recipient to pay.
    for content in [
        response.content,
        generate_invoice_pdf_reportlab(credit_pdf_view(note)),
    ]:
        text = "\n".join(
            page.extract_text() for page in PdfReader(BytesIO(content)).pages
        )
        assert "CREDITNOTA" in text.upper()
        assert invoice["invoice_number"] in text
        assert "New customer name" not in text
        assert snapshot["customer_name"] in text
        assert "-121,00" in text or "- 121,00" in text
        assert "Geen betaalverzoek" in text
    # Keep an inspection copy outside the repository for visual QA.
    from pathlib import Path

    Path("/tmp/credit-note-inspection.pdf").write_bytes(response.content)


@pytest.mark.asyncio
async def test_ledger_failure_after_number_allocation_is_atomic(
    async_client, auth_headers, test_customer, db_session, credit_chart
):
    invoice = await issued(async_client, auth_headers, test_customer)
    revenue = await db_session.scalar(
        select(ChartOfAccount).where(ChartOfAccount.account_code == "8000")
    )
    revenue.is_active = False
    await db_session.commit()
    result = await credit(async_client, auth_headers, invoice)
    assert result.status_code == 409, result.text
    assert result.json()["detail"]["code"] == "LEDGER_ACCOUNT_MISSING"
    assert await db_session.scalar(select(func.count(ZZPCreditNote.id))) == 0
    assert await db_session.scalar(select(func.count(ZZPCreditCounter.year))) == 0
    original = await db_session.get(ZZPInvoice, UUID(invoice["id"]))
    await db_session.refresh(original)
    assert original.credited_cents == 0 and not original.credit_references


@pytest.mark.asyncio
async def test_cash_basis_credit_requires_review_and_blocks_export(
    async_client,
    auth_headers,
    test_customer,
    test_administration,
    test_user,
    db_session,
    credit_chart,
):
    invoice = await issued(async_client, auth_headers, test_customer)
    db_session.add(
        ZZPVatPolicy(
            administration_id=test_administration.id,
            basis="kasstelsel",
            effective_from=date(2026, 1, 1),
            confirmed_by=test_user.id,
        )
    )
    await db_session.commit()
    assert (await credit(async_client, auth_headers, invoice)).status_code == 201
    quarter = (date.today().month - 1) // 3 + 1
    query = f"?year={date.today().year}&quarter={quarter}"
    overview = (
        await async_client.get("/api/v1/zzp/btw-aangifte" + query, headers=auth_headers)
    ).json()["current_quarter"]
    assert not overview["is_ready"]
    assert any(
        w["id"] == "CREDIT_CASH_RECONCILIATION_REQUIRED" for w in overview["warnings"]
    )
    export = await async_client.get(
        "/api/v1/zzp/btw-aangifte/xml" + query, headers=auth_headers
    )
    assert export.status_code == 409


@pytest.mark.asyncio
async def test_legacy_paid_status_without_receipts_requires_reconciliation(
    async_client, auth_headers, test_customer, db_session, credit_chart
):
    invoice = await issued(async_client, auth_headers, test_customer)
    source = await db_session.get(ZZPInvoice, UUID(invoice["id"]))
    source.status = "paid"
    source.amount_paid_cents = 0
    await db_session.commit()
    response = await credit(async_client, auth_headers, invoice)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "ORIGINAL_RECEIPTS_UNRECONCILED"
