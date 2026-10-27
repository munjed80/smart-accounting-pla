"""Cross-period VAT recognition, basis confirmation and safe reference exports."""

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4
import pytest
from sqlalchemy import select, func
from app.models.zzp import ZZPInvoice, ZZPInvoiceLine
from app.models.payment import ZZPPayment, ZZPPaymentAllocation
from app.models.zzp_vat_policy import ZZPVatPolicy
from app.models.administration import Administration
from app.models.ledger import AccountingPeriod, PeriodStatus
from app.services.zzp_vat_calculation import calculate_vat


async def invoice(
    db,
    admin,
    customer,
    *,
    status="sent",
    day=date(2026, 1, 15),
    nets=(10000,),
    rates=(21,)
):
    vats = [
        int((Decimal(net) * Decimal(rate) / 100).quantize(Decimal("1")))
        for net, rate in zip(nets, rates)
    ]
    row = ZZPInvoice(
        administration_id=admin.id,
        customer_id=customer.id,
        invoice_number=str(uuid4()),
        issue_date=day,
        status=status,
        seller_company_name="Seller",
        customer_name="Client",
        subtotal_cents=sum(nets),
        vat_total_cents=sum(vats),
        total_cents=sum(nets) + sum(vats),
    )
    db.add(row)
    await db.flush()
    for net, rate, vat in zip(nets, rates, vats):
        db.add(
            ZZPInvoiceLine(
                invoice_id=row.id,
                description="Work",
                quantity=1,
                unit_price_cents=net,
                vat_rate=rate,
                line_total_cents=net,
                vat_amount_cents=vat,
            )
        )
    await db.flush()
    return row


async def receipt(
    db, row, cents, day, *, status="completed", allocate=True, admin_id=None
):
    payment = ZZPPayment(
        administration_id=admin_id or row.administration_id,
        amount_cents=cents,
        payment_date=datetime.combine(day, datetime.min.time(), timezone.utc),
        status=status,
    )
    db.add(payment)
    await db.flush()
    if allocate:
        db.add(
            ZZPPaymentAllocation(
                payment_id=payment.id, invoice_id=row.id, allocated_amount_cents=cents
            )
        )
    await db.flush()
    return payment


async def confirm(client, headers, *, basis="factuurstelsel", day="2026-01-01"):
    return await client.put(
        "/api/v1/zzp/btw-policy",
        headers=headers,
        json={"basis": basis, "effective_from": day, "acknowledge": True},
    )


async def overview(client, headers, quarter=1):
    response = await client.get(
        "/api/v1/zzp/btw-aangifte",
        headers=headers,
        params={"year": 2026, "quarter": quarter},
    )
    assert response.status_code == 200, response.text
    return response.json()["current_quarter"]


@pytest.mark.asyncio
async def test_invoice_basis_counts_sent_on_issue_date_excludes_drafts_cancelled_and_future(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    sent = await invoice(db_session, test_administration, test_customer)
    for status in ["draft", "cancelled"]:
        await invoice(db_session, test_administration, test_customer, status=status)
    await receipt(db_session, sent, 12100, date(2026, 4, 2))
    await db_session.commit()
    assert (await confirm(async_client, auth_headers)).status_code == 200
    q1, q2 = await overview(async_client, auth_headers, 1), await overview(
        async_client, auth_headers, 2
    )
    assert q1["basis"] == "factuurstelsel" and q1["policy_confirmed"]
    assert q1["output_vat_cents"] == 2100 and q1["omzet_cents"] == 10000
    assert q1["invoice_summary"]["total_vat_cents"] == 2100
    assert sum(r["vat_cents"] for r in q1["vat_rate_breakdown"]) == 2100
    assert q1["is_ready"]  # draft warning does not exclude the actual sent invoice
    assert q2["output_vat_cents"] == 0
    assert not q1["submission_available"]


@pytest.mark.asyncio
async def test_cash_basis_partial_payments_across_quarters_reconcile_to_header(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    row = await invoice(db_session, test_administration, test_customer, status="paid")
    row.paid_at = datetime(2026, 4, 2, tzinfo=timezone.utc)
    row.amount_paid_cents = row.total_cents
    await receipt(db_session, row, 6050, date(2026, 2, 1))
    await receipt(db_session, row, 6050, date(2026, 4, 2))
    await receipt(db_session, row, 99999, date(2026, 2, 2), status="reversed")
    await db_session.commit()
    assert (
        await confirm(async_client, auth_headers, basis="kasstelsel")
    ).status_code == 200
    quarters = [await overview(async_client, auth_headers, q) for q in (1, 2)]
    assert [q["output_vat_cents"] for q in quarters] == [1050, 1050]
    assert [q["omzet_cents"] for q in quarters] == [5000, 5000]
    assert all(q["recognized_invoice_count"] == 1 and q["is_ready"] for q in quarters)
    assert all(
        sum(r["vat_cents"] for r in q["vat_rate_breakdown"]) == q["output_vat_cents"]
        for q in quarters
    )


@pytest.mark.asyncio
async def test_rounding_mixed_rates_telescopes_across_three_quarters(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    row = await invoice(
        db_session, test_administration, test_customer, nets=(101, 103), rates=(21, 9)
    )
    for amount, day in [
        (1, date(2026, 1, 2)),
        (99, date(2026, 4, 2)),
        (row.total_cents - 100, date(2026, 7, 2)),
    ]:
        await receipt(db_session, row, amount, day)
    await db_session.commit()
    assert (
        await confirm(async_client, auth_headers, basis="kasstelsel")
    ).status_code == 200
    quarters = [await overview(async_client, auth_headers, q) for q in (1, 2, 3)]
    assert sum(q["output_vat_cents"] for q in quarters) == row.vat_total_cents
    assert sum(q["omzet_cents"] for q in quarters) == row.subtotal_cents
    assert all(q["output_vat_cents"] >= 0 for q in quarters)


@pytest.mark.asyncio
async def test_unallocated_and_unreconciled_data_block_export(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    row = await invoice(db_session, test_administration, test_customer)
    await receipt(db_session, row, 1000, date(2026, 2, 2), allocate=False)
    await db_session.commit()
    await confirm(async_client, auth_headers, basis="kasstelsel")
    result = await overview(async_client, auth_headers)
    assert not result["is_ready"]
    assert "UNALLOCATED_RECEIPTS" in [w["id"] for w in result["warnings"]]
    response = await async_client.get(
        "/api/v1/zzp/btw-aangifte/xml?year=2026&quarter=1", headers=auth_headers
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_confirmation_is_idempotent_immutable_and_does_not_rewrite_earlier_quarters(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    await invoice(db_session, test_administration, test_customer)
    await db_session.commit()
    old = await overview(async_client, auth_headers)
    assert old["basis"] == "unconfirmed" and not old["is_ready"]
    for _ in range(2):
        assert (
            await confirm(async_client, auth_headers, day="2026-04-01")
        ).status_code == 200
    assert await db_session.scalar(select(func.count(ZZPVatPolicy.id))) == 1
    earlier = await overview(async_client, auth_headers)
    assert (
        earlier["basis"] == "unconfirmed"
        and earlier["output_vat_cents"] == old["output_vat_cents"]
    )
    assert (
        await confirm(async_client, auth_headers, basis="kasstelsel", day="2026-04-01")
    ).status_code == 409


@pytest.mark.asyncio
async def test_closed_history_blocks_policy_confirmation(
    async_client, db_session, auth_headers, test_administration
):
    db_session.add(
        AccountingPeriod(
            administration_id=test_administration.id,
            name="Closed",
            period_type="QUARTER",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 3, 31),
            status=PeriodStatus.LOCKED,
        )
    )
    await db_session.commit()
    response = await confirm(async_client, auth_headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "VAT_POLICY_CLOSED_HISTORY"


@pytest.mark.asyncio
async def test_cash_receipts_and_basis_are_tenant_scoped(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    row = await invoice(db_session, test_administration, test_customer)
    other = Administration(name="Other tenant", is_active=True)
    db_session.add(other)
    await db_session.flush()
    await receipt(db_session, row, 12100, date(2026, 2, 2), admin_id=other.id)
    await db_session.commit()
    await confirm(async_client, auth_headers, basis="kasstelsel")
    result = await overview(async_client, auth_headers)
    assert result["output_vat_cents"] == 0
    assert (
        await db_session.scalar(select(ZZPVatPolicy))
    ).administration_id == test_administration.id


@pytest.mark.asyncio
async def test_reference_xml_keeps_cents_and_does_not_impersonate_a_return(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    row = await invoice(
        db_session, test_administration, test_customer, nets=(1999,), rates=(21,)
    )
    await db_session.commit()
    await confirm(async_client, auth_headers)
    response = await async_client.get(
        "/api/v1/zzp/btw-aangifte/xml?year=2026&quarter=1", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    assert "ZZPBTWReference" in response.text
    assert "reference-only-not-a-tax-return" in response.text
    assert 'submitted="false"' in response.text
    assert ">4.20<" in response.text and ">19.99<" in response.text
    assert "http://www.belastingdienst.nl" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "query", ["year=2026", "quarter=2", "year=1&quarter=1", "year=2026&quarter=5"]
)
async def test_invalid_period_is_rejected(
    async_client, auth_headers, test_administration, query
):
    for route in ["btw-aangifte", "btw-aangifte/xml"]:
        response = await async_client.get(
            "/api/v1/zzp/" + route + "?" + query, headers=auth_headers
        )
        assert response.status_code == 422


def test_cumulative_rate_rounding_never_moves_a_cent_backwards():
    from app.services.zzp_vat_calculation import proportional_parts

    for values, gross in [
        ([1999, 3333], 6052),
        ([420, 300], 6052),
        ([100, 900, 1234], 2500),
    ]:
        previous = [0] * len(values)
        for paid in range(1, gross + 1):
            current = proportional_parts(values, paid, gross)
            assert all(a >= b for a, b in zip(current, previous))
            previous = current
        assert previous == values


@pytest.mark.asyncio
async def test_dashboard_and_detail_use_same_confirmed_basis(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    today = date.today()
    await invoice(db_session, test_administration, test_customer, day=today)
    await db_session.commit()
    await confirm(async_client, auth_headers)
    response = await async_client.get("/api/v1/zzp/dashboard", headers=auth_headers)
    assert response.status_code == 200, response.text
    detail = await overview(async_client, auth_headers, (today.month - 1) // 3 + 1)
    assert response.json()["btw"]["basis"] == detail["basis"] == "factuurstelsel"
    assert (
        response.json()["btw"]["vat_collected_cents"]
        == detail["output_vat_cents"]
        == 2100
    )
    assert response.json()["btw"]["policy_confirmed"]


@pytest.mark.asyncio
async def test_missing_lines_zero_rate_and_foreign_sales_are_not_declared_ready(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    row = await invoice(
        db_session, test_administration, test_customer, nets=(1000,), rates=(0,)
    )
    row.customer_address_country = "Germany"
    await db_session.commit()
    await confirm(async_client, auth_headers)
    result = await overview(async_client, auth_headers)
    assert not result["is_ready"]
    assert {
        "ZERO_RATE_REQUIRES_REVIEW",
        "FOREIGN_TRANSACTION_REQUIRES_REVIEW",
    }.issubset({w["id"] for w in result["warnings"]})


@pytest.mark.asyncio
async def test_advance_payments_block_reference_in_both_affected_quarters(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    row = await invoice(
        db_session, test_administration, test_customer, day=date(2026, 4, 2)
    )
    await receipt(db_session, row, 6050, date(2026, 3, 2))
    await db_session.commit()
    await confirm(async_client, auth_headers)
    for quarter in [1, 2]:
        result = await overview(async_client, auth_headers, quarter)
        assert not result["is_ready"]
        assert "ADVANCE_PAYMENT_REQUIRES_REVIEW" in {
            w["id"] for w in result["warnings"]
        }


@pytest.mark.asyncio
async def test_live_environment_cannot_queue_or_simulate_tax_submission():
    from unittest.mock import patch, AsyncMock
    from app.core.config import settings
    from app.services.vat_submission_service import (
        VatSubmissionService,
        VatSubmissionError,
    )

    session = AsyncMock()
    with patch.object(settings, "ENV", "production"):
        with pytest.raises(
            VatSubmissionError, match="Live Digipoort submission is not available"
        ):
            await VatSubmissionService(session, uuid4()).queue_submission(uuid4())
    session.execute.assert_not_called()
    session.commit.assert_not_called()


@pytest.mark.asyncio
async def test_late_invoice_blocks_both_due_and_issue_quarters(
    async_client, db_session, auth_headers, test_administration, test_customer
):
    row = await invoice(
        db_session, test_administration, test_customer, day=date(2026, 4, 20)
    )
    row.delivery_date = date(2026, 2, 20)  # normally due by March 15, not April
    await db_session.commit()
    await confirm(async_client, auth_headers)
    for quarter in (1, 2):
        result = await overview(async_client, auth_headers, quarter)
        assert not result["is_ready"]
        assert "LATE_INVOICE_REQUIRES_REVIEW" in {
            warning["id"] for warning in result["warnings"]
        }


@pytest.mark.asyncio
async def test_submitted_history_blocks_policy_confirmation(
    async_client, db_session, auth_headers, test_administration, test_user
):
    from app.models.vat_submission import VatSubmission

    period = AccountingPeriod(
        administration_id=test_administration.id,
        name="Filed",
        period_type="QUARTER",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 3, 31),
        status=PeriodStatus.OPEN,
    )
    db_session.add(period)
    await db_session.flush()
    db_session.add(
        VatSubmission(
            administration_id=test_administration.id,
            period_id=period.id,
            created_by=test_user.id,
            status="SUBMITTED",
        )
    )
    await db_session.commit()
    response = await confirm(async_client, auth_headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "VAT_POLICY_CLOSED_HISTORY"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {
            "basis": "factuurstelsel",
            "effective_from": "2026-01-02",
            "acknowledge": True,
        },
        {
            "basis": "factuurstelsel",
            "effective_from": "2100-01-01",
            "acknowledge": True,
        },
        {
            "basis": "factuurstelsel",
            "effective_from": "2026-01-01",
            "acknowledge": False,
        },
        {"basis": "invalid", "effective_from": "2026-01-01", "acknowledge": True},
    ],
)
async def test_policy_rejects_invalid_or_unacknowledged_changes(
    async_client, auth_headers, test_administration, payload
):
    response = await async_client.put(
        "/api/v1/zzp/btw-policy", headers=auth_headers, json=payload
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_browser_can_send_invoice_idempotency_header(async_client):
    from app.core.config import settings

    origin = settings.cors_origins_list[0]
    response = await async_client.options(
        "/api/v1/zzp/invoices",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
        },
    )
    assert response.status_code == 200, response.text
    assert "idempotency-key" in response.headers["access-control-allow-headers"].lower()
