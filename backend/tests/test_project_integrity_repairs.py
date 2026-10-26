"""Real route/service regressions for tenant isolation, payments, money and receipts."""

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from PIL import Image
from sqlalchemy import select, func, text

from app.core.config import settings
from app.core.security import create_access_token
from app.models.administration import Administration
from app.models.accounting import ChartOfAccount
from app.models.user import User
from app.models.zzp import ZZPInvoice, ZZPCustomer, ZZPDocument, ZZPExpense
from app.models.payment import ZZPPayment, ZZPPaymentAllocation
from app.models.ledger import AccountingPeriod, PeriodStatus, JournalEntry, JournalLine
from app.services.zzp_integrity import sync_invoice
from app.services.money import calculate_vat_amount
from app.models.vat_submission import VatSubmission


@pytest_asyncio.fixture
async def chart(db_session, test_administration):
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


async def pay(client, headers, invoice, cents=None, day=None):
    action = "partial-payment" if cents else "mark-paid"
    data = {"amount_cents": cents} if cents else {}
    if day:
        data["payment_date"] = day.isoformat()
    return await client.post(
        f"/api/v1/zzp/invoices/{invoice.id}/{action}", headers=headers, json=data
    )


async def test_cross_tenant_payment_actions_change_nothing(
    async_client, auth_headers, db_session, test_invoice_sent
):
    victim_admin = Administration(name="Unrelated administration", is_active=True)
    db_session.add(victim_admin)
    await db_session.flush()
    customer = ZZPCustomer(
        administration_id=victim_admin.id, name="Victim customer", status="active"
    )
    db_session.add(customer)
    await db_session.flush()
    victim = ZZPInvoice(
        administration_id=victim_admin.id,
        customer_id=customer.id,
        invoice_number="VICTIM",
        status="paid",
        issue_date=date.today(),
        seller_company_name="Fixture",
        customer_name="Fixture",
        subtotal_cents=10000,
        vat_total_cents=2100,
        total_cents=12100,
        amount_paid_cents=12100,
    )
    db_session.add(victim)
    await db_session.flush()
    payment = ZZPPayment(
        administration_id=victim_admin.id,
        amount_cents=12100,
        payment_date=datetime.now(timezone.utc),
        status="completed",
        payment_method="bank_transfer",
    )
    db_session.add(payment)
    await db_session.flush()
    allocation = ZZPPaymentAllocation(
        payment_id=payment.id, invoice_id=victim.id, allocated_amount_cents=12100
    )
    db_session.add(allocation)
    await db_session.commit()
    root = f"/api/v1/zzp/invoices/{victim.id}"
    responses = [
        await async_client.post(root + "/mark-unpaid", headers=auth_headers),
        await pay(async_client, auth_headers, victim),
        await pay(async_client, auth_headers, victim, 100),
        await async_client.get(root + "/payments", headers=auth_headers),
    ]
    assert [r.status_code for r in responses] == [404] * 4
    await db_session.refresh(victim)
    assert victim.status == "paid" and victim.amount_paid_cents == 12100
    assert (
        await db_session.scalar(
            select(ZZPPaymentAllocation.id).where(
                ZZPPaymentAllocation.id == allocation.id
            )
        )
        == allocation.id
    )
    foreign_customer = await async_client.post(
        "/api/v1/zzp/payments",
        headers=auth_headers,
        json={
            "customer_id": str(customer.id),
            "amount_cents": 100,
            "payment_date": date.today().isoformat(),
        },
    )
    assert foreign_customer.status_code == 404


@pytest.mark.parametrize("state", [PeriodStatus.LOCKED, PeriodStatus.FINALIZED])
async def test_closed_period_blocks_full_and_partial_payments(
    async_client,
    auth_headers,
    db_session,
    test_administration,
    test_invoice_sent,
    state,
):
    day = date.today()
    db_session.add(
        AccountingPeriod(
            administration_id=test_administration.id,
            name="Closed",
            period_type="MONTH",
            start_date=day,
            end_date=day,
            status=state,
        )
    )
    await db_session.commit()
    assert (await pay(async_client, auth_headers, test_invoice_sent)).status_code == 409
    assert (
        await pay(async_client, auth_headers, test_invoice_sent, 100)
    ).status_code == 409
    assert await db_session.scalar(select(func.count(ZZPPayment.id))) == 0
    await db_session.refresh(test_invoice_sent)
    assert test_invoice_sent.status == "sent"


async def test_partial_payments_post_on_receipt_dates_and_reverse_atomically(
    async_client, auth_headers, db_session, test_invoice_sent, chart
):
    first_day = date.today() - timedelta(days=2)
    first = await pay(async_client, auth_headers, test_invoice_sent, 5000, first_day)
    assert first.status_code == 200, first.text
    assert first.json()["allocated_amount_cents"] == 5000
    second = await pay(async_client, auth_headers, test_invoice_sent, day=date.today())
    assert second.status_code == 200, second.text
    summary = (
        await async_client.get(
            f"/api/v1/zzp/invoices/{test_invoice_sent.id}/payments",
            headers=auth_headers,
        )
    ).json()
    assert (
        summary["total_paid_cents"] == 12100 and summary["total_outstanding_cents"] == 0
    )
    assert len(summary["payments"]) == 2
    receipts = (
        await db_session.scalars(
            select(JournalEntry).where(
                JournalEntry.source_type == "PAYMENT_ALLOCATION",
                JournalEntry.reversed_by_id.is_(None),
            )
        )
    ).all()
    assert {r.entry_date for r in receipts} == {first_day, date.today()}
    assert sum(r.total_debit for r in receipts) == Decimal("121.00")
    assert not await db_session.scalar(
        select(JournalEntry.id).where(JournalEntry.source_type == "INVOICE_PAYMENT")
    )
    duplicate = await pay(async_client, auth_headers, test_invoice_sent)
    assert duplicate.status_code == 400
    assert await db_session.scalar(select(func.count(ZZPPayment.id))) == 2
    response = await async_client.post(
        f"/api/v1/zzp/invoices/{test_invoice_sent.id}/mark-unpaid", headers=auth_headers
    )
    assert response.status_code == 204, response.text
    await db_session.refresh(test_invoice_sent)
    assert (
        test_invoice_sent.status == "sent" and test_invoice_sent.amount_paid_cents == 0
    )
    assert all(
        p == "reversed"
        for p in (await db_session.scalars(select(ZZPPayment.status))).all()
    )
    assert (
        await db_session.scalar(
            select(func.count(JournalEntry.id)).where(
                JournalEntry.source_type == "REVERSAL"
            )
        )
        == 2
    )
    assert all(
        e.total_debit == e.total_credit
        for e in (await db_session.scalars(select(JournalEntry))).all()
    )
    assert (await pay(async_client, auth_headers, test_invoice_sent)).status_code == 200


async def test_locked_receipt_cannot_be_reversed(
    async_client,
    auth_headers,
    db_session,
    test_administration,
    test_invoice_sent,
    chart,
):
    assert (await pay(async_client, auth_headers, test_invoice_sent)).status_code == 200
    day = date.today()
    db_session.add(
        AccountingPeriod(
            administration_id=test_administration.id,
            name="Locked",
            period_type="MONTH",
            start_date=day,
            end_date=day,
            status=PeriodStatus.LOCKED,
        )
    )
    await db_session.commit()
    response = await async_client.post(
        f"/api/v1/zzp/invoices/{test_invoice_sent.id}/mark-unpaid", headers=auth_headers
    )
    assert response.status_code == 409
    assert await db_session.scalar(select(func.count(ZZPPaymentAllocation.id))) == 1
    await db_session.refresh(test_invoice_sent)
    assert test_invoice_sent.status == "paid"


async def test_missing_bank_account_rolls_back_payment(
    async_client,
    auth_headers,
    db_session,
    test_invoice_sent,
    test_administration,
    chart,
):
    await sync_invoice(db_session, test_administration.id, test_invoice_sent)
    bank = await db_session.scalar(
        select(ChartOfAccount).where(ChartOfAccount.account_code == "1100")
    )
    bank.is_active = False
    await db_session.commit()
    response = await pay(async_client, auth_headers, test_invoice_sent)
    assert response.status_code == 409, response.text
    assert await db_session.scalar(select(func.count(ZZPPayment.id))) == 0
    await db_session.refresh(test_invoice_sent)
    assert (
        test_invoice_sent.status == "sent" and test_invoice_sent.amount_paid_cents == 0
    )


@pytest.mark.parametrize("state", ["draft", "cancelled"])
async def test_non_receivable_invoice_rejects_payment(
    async_client, auth_headers, db_session, test_invoice_sent, state
):
    test_invoice_sent.status = state
    await db_session.commit()
    assert (await pay(async_client, auth_headers, test_invoice_sent)).status_code == 400
    assert await db_session.scalar(select(func.count(ZZPPayment.id))) == 0


async def test_historical_status_payment_can_be_reversed(
    async_client,
    auth_headers,
    db_session,
    test_invoice_sent,
    test_administration,
    chart,
):
    test_invoice_sent.status = "paid"
    test_invoice_sent.amount_paid_cents = 12100
    test_invoice_sent.paid_at = datetime.now(timezone.utc)
    await sync_invoice(db_session, test_administration.id, test_invoice_sent)
    await db_session.commit()
    assert await db_session.scalar(
        select(JournalEntry.id).where(JournalEntry.source_type == "INVOICE_PAYMENT")
    )
    summary = (
        await async_client.get(
            f"/api/v1/zzp/invoices/{test_invoice_sent.id}/payments",
            headers=auth_headers,
        )
    ).json()
    assert summary["total_paid_cents"] == 12100
    assert (
        await async_client.post(
            f"/api/v1/zzp/invoices/{test_invoice_sent.id}/mark-unpaid",
            headers=auth_headers,
        )
    ).status_code == 204
    assert not await db_session.scalar(
        select(JournalEntry.id).where(
            JournalEntry.source_type == "INVOICE_PAYMENT",
            JournalEntry.reversed_by_id.is_(None),
        )
    )
    assert (await pay(async_client, auth_headers, test_invoice_sent)).status_code == 200


@pytest.mark.parametrize(
    "field,value", [("payment_date", "not-a-date"), ("payment_method", "unsupported")]
)
async def test_invalid_payment_input_is_422(
    async_client, auth_headers, test_invoice_sent, field, value
):
    response = await async_client.post(
        f"/api/v1/zzp/invoices/{test_invoice_sent.id}/mark-paid",
        headers=auth_headers,
        json={field: value},
    )
    assert response.status_code == 422


async def test_quotes_invoices_and_expenses_share_rounding(
    async_client, auth_headers, test_customer
):
    data = {
        "customer_id": str(test_customer.id),
        "issue_date": date.today().isoformat(),
        "lines": [
            {
                "description": "Fractional work",
                "quantity": 1.5,
                "unit_price_cents": 101,
                "vat_rate": 21,
            }
        ],
    }
    quote = await async_client.post(
        "/api/v1/zzp/quotes", headers=auth_headers, json=data
    )
    invoice = await async_client.post(
        "/api/v1/zzp/invoices", headers=auth_headers, json=data
    )
    assert quote.status_code == invoice.status_code == 201, (quote.text, invoice.text)
    assert quote.json()["total_cents"] == invoice.json()["total_cents"] == 184
    changed = await async_client.put(
        "/api/v1/zzp/quotes/" + quote.json()["id"],
        headers=auth_headers,
        json={
            "lines": [
                {
                    "description": "Changed work",
                    "quantity": 2.5,
                    "unit_price_cents": 101,
                    "vat_rate": 21,
                }
            ]
        },
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["total_cents"] == 306
    assert changed.json()["lines"][0]["line_total_cents"] == 253
    converted = await async_client.post(
        "/api/v1/zzp/quotes/" + quote.json()["id"] + "/convert", headers=auth_headers
    )
    assert converted.status_code == 200, converted.text
    converted_invoice = await async_client.get(
        "/api/v1/zzp/invoices/" + str(converted.json()["invoice_id"]),
        headers=auth_headers,
    )
    assert converted_invoice.json()["total_cents"] == 306
    expense = await async_client.post(
        "/api/v1/zzp/expenses",
        headers=auth_headers,
        json={
            "vendor": "Rounding fixture",
            "amount_cents": 1000,
            "expense_date": date.today().isoformat(),
            "category": "overig",
            "vat_rate": 21,
        },
    )
    assert expense.status_code == 201, expense.text
    assert expense.json()["vat_amount_cents"] == 174
    from app.api.v1.zzp_import import calculate_vat_amount as imported
    from app.api.v1.zzp_commitments import _calculate_vat_amount as recurring

    assert imported is recurring is calculate_vat_amount


def image_bytes():
    content = BytesIO()
    Image.new("RGB", (3, 3), "white").save(content, format="PNG")
    return content.getvalue()


async def test_receipt_survives_save_reload_and_is_tenant_protected(
    async_client, auth_headers, db_session, test_user, tmp_path, monkeypatch
):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    content = image_bytes()
    response = await async_client.post(
        "/api/v1/zzp/expenses/scan",
        headers=auth_headers,
        files={"file": ("receipt.png", content, "image/png")},
    )
    assert response.status_code == 200, response.text
    document_id = UUID(response.json()["extracted_data"]["document_id"])
    document = await db_session.get(ZZPDocument, document_id)
    assert document.user_id == test_user.id
    from pathlib import Path

    assert Path(document.storage_ref).read_bytes() == content
    saved = await async_client.post(
        "/api/v1/zzp/expenses",
        headers=auth_headers,
        json={
            "vendor": "Receipt fixture",
            "amount_cents": 1000,
            "vat_rate": 21,
            "expense_date": date.today().isoformat(),
            "category": "overig",
            "document_id": str(document_id),
        },
    )
    assert saved.status_code == 201, saved.text
    expense_id = saved.json()["id"]
    reloaded = await async_client.get(
        "/api/v1/zzp/expenses/" + expense_id, headers=auth_headers
    )
    assert reloaded.json()["document_id"] == str(document_id)
    downloaded = await async_client.get(
        f"/api/v1/zzp/documents/{document_id}/file", headers=auth_headers
    )
    assert downloaded.status_code == 200 and downloaded.content == content
    assert downloaded.headers["cache-control"] == "private, no-store"
    assert (
        await async_client.delete(
            f"/api/v1/zzp/documents/{document_id}", headers=auth_headers
        )
    ).status_code == 409
    foreign_admin = Administration(name="Other", is_active=True)
    db_session.add(foreign_admin)
    await db_session.flush()
    document.administration_id = foreign_admin.id
    await db_session.commit()
    assert (
        await async_client.get(
            f"/api/v1/zzp/documents/{document_id}/file", headers=auth_headers
        )
    ).status_code == 404
    linked = await async_client.put(
        "/api/v1/zzp/expenses/" + expense_id,
        headers=auth_headers,
        json={"document_id": str(document_id)},
    )
    assert linked.status_code == 404


async def test_invalid_and_oversized_receipts_are_rejected(
    async_client, auth_headers, db_session, monkeypatch
):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE", 64)
    invalid = await async_client.post(
        "/api/v1/zzp/expenses/scan",
        headers=auth_headers,
        files={"file": ("fake.png", b"not image", "image/png")},
    )
    assert invalid.status_code == 400
    large = await async_client.post(
        "/api/v1/zzp/expenses/scan",
        headers=auth_headers,
        files={"file": ("large.png", b"x" * 65, "image/png")},
    )
    assert large.status_code == 413
    assert await db_session.scalar(select(func.count(ZZPDocument.id))) == 0


def test_registered_routes_are_unique():
    from app.main import app

    routes = [
        (method, route.path)
        for route in app.routes
        for method in getattr(route, "methods", [])
        if method not in ("HEAD", "OPTIONS")
    ]
    assert not [key for key, count in Counter(routes).items() if count > 1]


async def test_vat_pagination_legacy_filters_and_permissions(
    async_client, db_session, test_user, test_administration
):
    accountant = User(
        email="vat-scope@example.com",
        full_name="VAT test",
        hashed_password="unused",
        role="accountant",
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(accountant)
    await db_session.flush()
    assignment_id = uuid4()
    await db_session.execute(
        text(
            """INSERT INTO accountant_client_assignments
        (id,accountant_id,client_user_id,administration_id,status,invited_by,is_primary,scopes)
        VALUES (:id,:accountant,:client,:admin,'ACTIVE','ACCOUNTANT',1,:scopes)"""
        ),
        dict(
            id=assignment_id.hex,
            accountant=accountant.id.hex,
            client=test_user.id.hex,
            admin=test_administration.id.hex,
            scopes="",
        ),
    )
    period = AccountingPeriod(
        administration_id=test_administration.id,
        name="VAT quarter",
        period_type="QUARTER",
        start_date=date.today(),
        end_date=date.today(),
        status=PeriodStatus.OPEN,
    )
    db_session.add(period)
    await db_session.flush()
    for kind in ("BTW", "VAT", "ICP"):
        db_session.add(
            VatSubmission(
                administration_id=test_administration.id,
                period_id=period.id,
                submission_type=kind,
                created_by=test_user.id,
                status="DRAFT",
                method="PACKAGE",
            )
        )
    await db_session.commit()
    headers = {
        "Authorization": "Bearer "
        + create_access_token(data={"sub": str(accountant.id)})
    }
    path = f"/api/v1/accountant/clients/{test_administration.id}/vat/submissions"
    first = await async_client.get(path, headers=headers, params={"page_size": 1})
    assert first.status_code == 200, first.text
    assert len(first.json()["submissions"]) == 1 and first.json()["total_count"] == 3
    legacy = await async_client.get(
        path, headers=headers, params={"submission_type": "BTW", "status": "DRAFT"}
    )
    assert legacy.json()["total_count"] == 2
    assert (
        await async_client.get(path, headers=headers, params={"kind": "ICP"})
    ).json()["total_count"] == 1
    assert (
        await async_client.get(
            path, headers=headers, params={"kind": "ICP", "submission_type": "VAT"}
        )
    ).status_code == 422
    # SQLite fixtures represent the ARRAY as text; a nonempty restricted value
    # has no reports scope and must fail the actual authorization guard.
    await db_session.execute(
        text("UPDATE accountant_client_assignments SET scopes=:scopes WHERE id=:id"),
        dict(scopes="invoices", id=assignment_id.hex),
    )
    await db_session.commit()
    restricted = await async_client.get(path, headers=headers)
    assert restricted.status_code == 403, restricted.text
    assert restricted.json()["detail"]["code"] == "SCOPE_MISSING"
