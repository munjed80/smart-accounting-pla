"""Real bank endpoint contracts, one cash posting and preserved matching history."""

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID, uuid4
import pytest
import pytest_asyncio
from sqlalchemy import select, func, inspect
from app.models.bank import BankAccount, BankTransaction, BankTransactionStatus
from app.models.accounting import ChartOfAccount
from app.models.payment import ZZPPayment, ZZPPaymentAllocation
from app.models.zzp import ZZPInvoice, ZZPBankTransactionMatch
from app.models.ledger import JournalEntry, JournalLine, AccountingPeriod, PeriodStatus
from tests.test_zzp_credit_notes import issued, credit, credit_chart


@pytest_asyncio.fixture
async def bank_receipt(db_session, test_administration, credit_chart):
    db_session.add(
        ChartOfAccount(
            administration_id=test_administration.id,
            account_code="9999",
            account_name="Unallocated bank receipts",
            account_type="LIABILITY",
            is_active=True,
        )
    )
    account = BankAccount(
        administration_id=test_administration.id,
        iban="NL91ABNA0417164300",
        currency="EUR",
    )
    db_session.add(account)
    await db_session.flush()
    transaction = BankTransaction(
        administration_id=test_administration.id,
        bank_account_id=account.id,
        booking_date=date.today(),
        amount=Decimal("121.00"),
        currency="EUR",
        description="Customer receipt",
        reference="Bank-42",
        import_hash=uuid4().hex,
    )
    db_session.add(transaction)
    await db_session.commit()
    return transaction


async def match(client, headers, transaction, invoice, key=None, **extra):
    return await client.post(
        f"/api/v1/zzp/bank/transactions/{inspect(transaction).identity[0]}/match",
        headers={**headers, "Idempotency-Key": str(key or uuid4())},
        json={"invoice_id": invoice["id"], **extra},
    )


async def unmatch(client, headers, transaction, match_id):
    return await client.post(
        f"/api/v1/zzp/bank/transactions/{inspect(transaction).identity[0]}/unmatch",
        headers=headers,
        params={"match_id": match_id},
    )


async def net_account(db, code):
    rows = (
        await db.execute(
            select(JournalLine.debit_amount, JournalLine.credit_amount)
            .join(ChartOfAccount, ChartOfAccount.id == JournalLine.account_id)
            .where(ChartOfAccount.account_code == code)
        )
    ).all()
    return sum((debit - credit for debit, credit in rows), Decimal(0))


@pytest.mark.asyncio
async def test_bank_partial_receipt_has_one_cash_posting_and_real_contracts(
    async_client, auth_headers, test_customer, db_session, bank_receipt
):
    invoice = await issued(async_client, auth_headers, test_customer)
    bank_receipt.reference = invoice["invoice_number"]
    await db_session.commit()
    for path in [
        "/bank/accounts",
        "/bank/transactions",
        f"/bank/transactions/{bank_receipt.id}/suggestions",
    ]:
        response = await async_client.get("/api/v1/zzp" + path, headers=auth_headers)
        assert response.status_code == 200, response.text
    response = await match(async_client, auth_headers, bank_receipt, invoice)
    assert response.status_code == 200, response.text
    assert response.json()["invoice_amount_paid_cents"] == 12100
    assert response.json()["invoice_new_status"] == "sent"
    payment = await db_session.scalar(select(ZZPPayment))
    assert payment.bank_transaction_id == bank_receipt.id
    assert payment.payment_date.date() == bank_receipt.booking_date
    assert await net_account(db_session, "1100") == Decimal("121.00")
    assert await net_account(db_session, "9999") == 0
    assert await net_account(db_session, "1300") == Decimal("121.00")
    history = (
        await async_client.get("/api/v1/zzp/bank/matches", headers=auth_headers)
    ).json()
    assert history["total"] == 1 and history["matches"][0]["active"]
    listing = (
        await async_client.get("/api/v1/zzp/bank/transactions", headers=auth_headers)
    ).json()
    assert listing["transactions"][0]["match_id"] == response.json()["match_id"]
    assert (
        listing["page"] == 1
        and listing["transactions"][0]["booking_date"] == date.today().isoformat()
    )
    summary = (
        await async_client.get(
            f"/api/v1/zzp/invoices/{invoice['id']}/payments", headers=auth_headers
        )
    ).json()
    assert summary["total_paid_cents"] == summary["total_outstanding_cents"] == 12100


@pytest.mark.asyncio
async def test_retry_unmatch_rematch_never_duplicates_cash_or_erases_history(
    async_client, auth_headers, test_customer, db_session, bank_receipt
):
    invoice = await issued(async_client, auth_headers, test_customer, quantity=1)
    key = uuid4()
    a = await match(async_client, auth_headers, bank_receipt, invoice, key)
    b = await match(async_client, auth_headers, bank_receipt, invoice, key)
    assert a.status_code == b.status_code == 200 and a.json() == b.json()
    assert (
        await match(
            async_client,
            auth_headers,
            bank_receipt,
            invoice,
            key,
            notes="Changed request",
        )
    ).status_code == 409
    assert (
        await async_client.post(
            f"/api/v1/zzp/invoices/{invoice['id']}/mark-unpaid", headers=auth_headers
        )
    ).status_code == 409
    match_id = a.json()["match_id"]
    a = await unmatch(async_client, auth_headers, bank_receipt, match_id)
    b = await unmatch(async_client, auth_headers, bank_receipt, match_id)
    assert a.status_code == b.status_code == 200 and a.json() == b.json()
    payment = await db_session.scalar(select(ZZPPayment))
    assert payment.status == "completed"
    assert await db_session.scalar(select(func.count(ZZPPaymentAllocation.id))) == 0
    assert await net_account(db_session, "1100") == Decimal("121.00")
    assert await net_account(db_session, "9999") == Decimal("-121.00")
    c = await match(async_client, auth_headers, bank_receipt, invoice)
    assert c.status_code == 200, c.text
    # An old unlink retry cannot undo the newer match.
    assert (
        await unmatch(async_client, auth_headers, bank_receipt, match_id)
    ).status_code == 200
    source = await db_session.get(ZZPInvoice, UUID(invoice["id"]))
    assert source.amount_paid_cents == 12100 and source.status == "paid"
    assert await db_session.scalar(select(func.count(ZZPPayment.id))) == 1
    assert await db_session.scalar(select(func.count(ZZPBankTransactionMatch.id))) == 2
    assert await net_account(db_session, "1100") == Decimal("121.00")
    assert await net_account(db_session, "9999") == 0
    old_retry = await match(async_client, auth_headers, bank_receipt, invoice, key)
    assert old_retry.status_code == 200 and not old_retry.json()["active"]


@pytest.mark.asyncio
async def test_credited_invoice_accepts_only_remaining_cash_and_blocks_unlink(
    async_client, auth_headers, test_customer, db_session, bank_receipt
):
    invoice = await issued(async_client, auth_headers, test_customer)
    assert (await credit(async_client, auth_headers, invoice)).status_code == 201
    response = await match(async_client, auth_headers, bank_receipt, invoice)
    assert response.status_code == 200, response.text
    source = await db_session.get(ZZPInvoice, UUID(invoice["id"]))
    assert source.amount_paid_cents == source.credited_cents == 12100
    assert source.total_cents == 24200 and source.status == "paid"
    assert (
        await unmatch(
            async_client, auth_headers, bank_receipt, response.json()["match_id"]
        )
    ).status_code == 409
    assert await net_account(db_session, "1300") == 0


@pytest.mark.asyncio
async def test_missing_account_rolls_back_match_payment_and_bank_posting(
    async_client, auth_headers, test_customer, db_session, bank_receipt
):
    invoice = await issued(async_client, auth_headers, test_customer)
    account = await db_session.scalar(
        select(ChartOfAccount).where(ChartOfAccount.account_code == "9999")
    )
    account.is_active = False
    await db_session.commit()
    response = await match(async_client, auth_headers, bank_receipt, invoice)
    assert response.status_code == 409, response.text
    assert await db_session.scalar(select(func.count(ZZPPayment.id))) == 0
    assert await db_session.scalar(select(func.count(ZZPBankTransactionMatch.id))) == 0
    assert await db_session.scalar(select(func.count(JournalEntry.id))) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("amount", [0, -1, 1, 12101])
async def test_invalid_or_split_amount_does_not_create_receipt(
    async_client, auth_headers, test_customer, db_session, bank_receipt, amount
):
    invoice = await issued(async_client, auth_headers, test_customer)
    response = await match(
        async_client, auth_headers, bank_receipt, invoice, amount_cents=amount
    )
    assert response.status_code == 422, response.text
    assert await db_session.scalar(select(func.count(ZZPPayment.id))) == 0


@pytest.mark.asyncio
async def test_later_receipt_does_not_reopen_closed_original_period(
    async_client,
    auth_headers,
    test_customer,
    test_administration,
    db_session,
    bank_receipt,
):
    old = date.today().replace(day=1) - timedelta(days=1)
    invoice = await issued(async_client, auth_headers, test_customer, day=old)
    db_session.add(
        AccountingPeriod(
            administration_id=test_administration.id,
            name="Closed source",
            period_type="MONTH",
            start_date=old.replace(day=1),
            end_date=old,
            status=PeriodStatus.LOCKED,
        )
    )
    await db_session.commit()
    response = await match(async_client, auth_headers, bank_receipt, invoice)
    assert response.status_code == 200, response.text
    assert (
        await unmatch(
            async_client, auth_headers, bank_receipt, response.json()["match_id"]
        )
    ).status_code == 200


@pytest.mark.asyncio
async def test_locked_receipt_and_foreign_transaction_are_rejected(
    async_client,
    auth_headers,
    test_customer,
    test_administration,
    db_session,
    bank_receipt,
):
    admin_id = test_administration.id
    invoice = await issued(async_client, auth_headers, test_customer)
    id = bank_receipt.id
    bank_receipt.administration_id = uuid4()
    await db_session.commit()
    assert (
        await match(async_client, auth_headers, bank_receipt, invoice)
    ).status_code == 404
    bank_receipt = await db_session.get(BankTransaction, id)
    bank_receipt.administration_id = admin_id
    bank_receipt.currency = "USD"
    await db_session.commit()
    assert (
        await match(async_client, auth_headers, bank_receipt, invoice)
    ).status_code == 422
    bank_receipt = await db_session.get(BankTransaction, id)
    bank_receipt.currency = "EUR"
    db_session.add(
        AccountingPeriod(
            administration_id=admin_id,
            name="Closed receipt",
            period_type="MONTH",
            start_date=date.today().replace(day=1),
            end_date=date.today(),
            status=PeriodStatus.LOCKED,
        )
    )
    await db_session.commit()
    assert (
        await match(async_client, auth_headers, bank_receipt, invoice)
    ).status_code == 409


@pytest.mark.asyncio
async def test_csv_import_response_and_duplicate_contract(async_client, auth_headers):
    data = b"datum,bedrag,omschrijving,iban\n2026-10-01,121.00,Customer receipt,NL91ABNA0417164300\n"
    for expected in [1, 0]:
        result = await async_client.post(
            "/api/v1/zzp/bank/import",
            headers=auth_headers,
            data={"bank_account_iban": "NL91ABNA0417164300"},
            files={"file": ("bank.csv", data, "text/csv")},
        )
        assert result.status_code == 200, result.text
        assert result.json()["imported_count"] == expected
        assert result.json()["total_in_file"] == 1


@pytest.mark.asyncio
async def test_failure_after_receipt_and_allocation_flush_is_atomic(
    async_client, auth_headers, test_customer, db_session, bank_receipt, monkeypatch
):
    from app.services.ledger_service import LedgerPostingService, LedgerPostingError

    invoice = await issued(async_client, auth_headers, test_customer)

    async def fail_posting(*args, **kwargs):
        raise LedgerPostingError("Posting unavailable")

    monkeypatch.setattr(LedgerPostingService, "post_payment_allocation", fail_posting)
    response = await match(async_client, auth_headers, bank_receipt, invoice)
    assert response.status_code == 409, response.text
    for model in [ZZPPayment, ZZPPaymentAllocation, ZZPBankTransactionMatch]:
        assert await db_session.scalar(select(func.count(model.id))) == 0
    assert await db_session.scalar(select(func.count(JournalEntry.id))) == 1
    transaction = await db_session.get(
        BankTransaction, inspect(bank_receipt).identity[0]
    )
    assert transaction.status == BankTransactionStatus.NEW


@pytest.mark.asyncio
async def test_legacy_match_is_preserved_for_review(
    async_client,
    auth_headers,
    test_customer,
    test_administration,
    test_user,
    db_session,
    bank_receipt,
):
    invoice = await issued(async_client, auth_headers, test_customer)
    record = ZZPBankTransactionMatch(
        administration_id=test_administration.id,
        bank_transaction_id=bank_receipt.id,
        invoice_id=UUID(invoice["id"]),
        user_id=test_user.id,
        amount_cents=12100,
        match_type="manual",
    )
    bank_receipt.status = BankTransactionStatus.MATCHED
    db_session.add(record)
    await db_session.commit()
    id = record.id
    result = await unmatch(async_client, auth_headers, bank_receipt, str(id))
    assert result.status_code == 409
    assert result.json()["detail"]["code"] == "LEGACY_BANK_MATCH_REQUIRES_REVIEW"
    rows = (
        await async_client.get("/api/v1/zzp/bank/matches", headers=auth_headers)
    ).json()
    assert (
        rows["total"] == 1
        and rows["matches"][0]["active"]
        and rows["matches"][0]["payment_id"] is None
    )


@pytest.mark.asyncio
async def test_cash_vat_uses_bank_booking_date_and_unlink_requires_review(
    async_client,
    auth_headers,
    test_customer,
    test_administration,
    test_user,
    db_session,
    bank_receipt,
):
    from app.models.zzp_vat_policy import ZZPVatPolicy

    invoice = await issued(
        async_client, auth_headers, test_customer, day=date(2026, 1, 1)
    )
    bank_receipt.booking_date = date(2026, 4, 2)
    db_session.add(
        ZZPVatPolicy(
            administration_id=test_administration.id,
            basis="kasstelsel",
            effective_from=date(2026, 1, 1),
            confirmed_by=test_user.id,
        )
    )
    await db_session.commit()
    result = await match(async_client, auth_headers, bank_receipt, invoice)
    assert result.status_code == 200, result.text
    for quarter, expected in [(1, 0), (2, 2100)]:
        overview = (
            await async_client.get(
                f"/api/v1/zzp/btw-aangifte?year=2026&quarter={quarter}",
                headers=auth_headers,
            )
        ).json()["current_quarter"]
        assert overview["output_vat_cents"] == expected
    assert (
        await unmatch(
            async_client, auth_headers, bank_receipt, result.json()["match_id"]
        )
    ).status_code == 200
    overview = (
        await async_client.get(
            "/api/v1/zzp/btw-aangifte?year=2026&quarter=2", headers=auth_headers
        )
    ).json()["current_quarter"]
    assert overview["output_vat_cents"] == 0 and not overview["is_ready"]
    assert any(w["id"] == "UNALLOCATED_RECEIPTS" for w in overview["warnings"])
