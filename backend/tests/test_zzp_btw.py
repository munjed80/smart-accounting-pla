"""
Tests for ZZP BTW Aangifte API Endpoint

Tests the self-service BTW (VAT) overview for ZZP users.
"""
import pytest
import uuid
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.zzp import (
    ZZPInvoice,
    ZZPInvoiceLine,
    ZZPExpense,
    BusinessProfile,
    InvoiceStatus,
)


@pytest.mark.asyncio
async def test_btw_aangifte_no_data(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test BTW aangifte returns empty metrics when no data exists."""
    response = await async_client.get(
        "/api/v1/zzp/btw-aangifte",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()

    # Check structure
    assert "current_quarter" in data
    assert "previous_quarters" in data
    assert "profile_complete" in data
    assert "btw_number" in data

    cq = data["current_quarter"]
    assert "quarter" in cq
    assert "omzet_cents" in cq
    assert "output_vat_cents" in cq
    assert "input_vat_cents" in cq
    assert "net_vat_cents" in cq
    assert "warnings" in cq
    assert "is_ready" in cq

    # No data → not ready
    assert cq["omzet_cents"] == 0
    assert cq["output_vat_cents"] == 0
    assert cq["input_vat_cents"] == 0
    assert cq["net_vat_cents"] == 0


@pytest.mark.asyncio
async def test_btw_aangifte_with_paid_invoice(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
    test_customer,
):
    """Test BTW aangifte includes paid invoices in calculation."""
    today = date.today()
    q_start = date(today.year, ((today.month - 1) // 3) * 3 + 1, 1)

    # Create a paid invoice in the current quarter
    invoice = ZZPInvoice()
    invoice.administration_id = test_administration.id
    invoice.customer_id = test_customer.id
    invoice.invoice_number = "INV-BTW-001"
    invoice.status = InvoiceStatus.PAID.value
    invoice.invoice_date = q_start
    invoice.issue_date = q_start
    invoice.subtotal_cents = 10000  # €100
    invoice.vat_total_cents = 2100  # €21
    invoice.total_cents = 12100
    invoice.seller_company_name = "Test Co"
    invoice.customer_name = "Client"
    invoice.updated_at = datetime.now(timezone.utc)
    db_session.add(invoice)
    await db_session.flush()

    # Add invoice line
    line = ZZPInvoiceLine()
    line.invoice_id = invoice.id
    line.description = "Consulting"
    line.quantity = Decimal("1")
    line.unit_price_cents = 10000
    line.vat_rate = Decimal("21.00")
    line.line_total_cents = 10000
    line.vat_amount_cents = 2100
    db_session.add(line)

    await db_session.commit()

    response = await async_client.get(
        "/api/v1/zzp/btw-aangifte",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    cq = data["current_quarter"]

    assert cq["omzet_cents"] == 10000
    assert cq["output_vat_cents"] == 2100
    assert cq["invoice_summary"]["paid_count"] == 1


@pytest.mark.asyncio
async def test_btw_aangifte_with_expenses(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
):
    """Test BTW aangifte deducts input VAT from expenses."""
    today = date.today()
    q_start = date(today.year, ((today.month - 1) // 3) * 3 + 1, 1)

    # Create an expense in the current quarter
    expense = ZZPExpense()
    expense.administration_id = test_administration.id
    expense.description = "Office supplies"
    expense.vendor = "Staples"
    expense.category = "kantoor"
    expense.expense_date = q_start
    expense.amount_cents = 5000  # €50
    expense.vat_rate = Decimal("21.00")
    expense.vat_amount_cents = 1050  # €10.50
    db_session.add(expense)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/zzp/btw-aangifte",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    cq = data["current_quarter"]

    assert cq["input_vat_cents"] == 1050
    assert cq["expense_summary"]["total_count"] == 1


@pytest.mark.asyncio
async def test_btw_aangifte_net_vat_calculation(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
    test_customer,
):
    """Test BTW aangifte correctly calculates net VAT (output - input)."""
    today = date.today()
    q_start = date(today.year, ((today.month - 1) // 3) * 3 + 1, 1)

    # Paid invoice: €100 + €21 VAT
    invoice = ZZPInvoice()
    invoice.administration_id = test_administration.id
    invoice.customer_id = test_customer.id
    invoice.invoice_number = "INV-BTW-NET-001"
    invoice.status = InvoiceStatus.PAID.value
    invoice.invoice_date = q_start
    invoice.issue_date = q_start
    invoice.subtotal_cents = 10000
    invoice.vat_total_cents = 2100
    invoice.total_cents = 12100
    invoice.seller_company_name = "Test Co"
    invoice.customer_name = "Client"
    invoice.updated_at = datetime.now(timezone.utc)
    db_session.add(invoice)

    # Expense: €50 + €10.50 VAT
    expense = ZZPExpense()
    expense.administration_id = test_administration.id
    expense.description = "Supplies"
    expense.vendor = "Vendor"
    expense.category = "kantoor"
    expense.expense_date = q_start
    expense.amount_cents = 5000
    expense.vat_rate = Decimal("21.00")
    expense.vat_amount_cents = 1050
    db_session.add(expense)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/zzp/btw-aangifte",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    cq = data["current_quarter"]

    # Net: 2100 - 1050 = 1050
    assert cq["output_vat_cents"] == 2100
    assert cq["input_vat_cents"] == 1050
    assert cq["net_vat_cents"] == 1050


@pytest.mark.asyncio
async def test_btw_aangifte_shows_warnings(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test BTW aangifte produces warnings for empty data."""
    response = await async_client.get(
        "/api/v1/zzp/btw-aangifte",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    cq = data["current_quarter"]

    # Should have warnings about no invoices/expenses
    warning_titles = [w["title"] for w in cq["warnings"]]
    assert any("facturen" in t.lower() for t in warning_titles)


@pytest.mark.asyncio
async def test_btw_aangifte_profile_info(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
):
    """Test BTW aangifte shows profile and BTW number."""
    # Create a complete profile
    profile = BusinessProfile()
    profile.administration_id = test_administration.id
    profile.company_name = "Test B.V."
    profile.kvk_number = "12345678"
    profile.btw_number = "NL123456789B01"
    profile.iban = "NL91ABNA0417164300"
    db_session.add(profile)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/zzp/btw-aangifte",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()

    assert data["profile_complete"] is True
    assert data["btw_number"] == "NL123456789B01"


@pytest.mark.asyncio
async def test_btw_aangifte_excludes_draft_invoices(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
    test_customer,
):
    """Test that draft invoices are excluded from BTW calculation."""
    today = date.today()
    q_start = date(today.year, ((today.month - 1) // 3) * 3 + 1, 1)

    # Draft invoice should not be counted
    draft_invoice = ZZPInvoice()
    draft_invoice.administration_id = test_administration.id
    draft_invoice.customer_id = test_customer.id
    draft_invoice.invoice_number = "INV-DRAFT-001"
    draft_invoice.status = InvoiceStatus.DRAFT.value
    draft_invoice.invoice_date = q_start
    draft_invoice.issue_date = q_start
    draft_invoice.subtotal_cents = 20000
    draft_invoice.vat_total_cents = 4200
    draft_invoice.total_cents = 24200
    draft_invoice.seller_company_name = "Test Co"
    draft_invoice.customer_name = "Client"
    db_session.add(draft_invoice)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/zzp/btw-aangifte",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    cq = data["current_quarter"]

    # Draft should not count towards omzet or output VAT
    assert cq["omzet_cents"] == 0
    assert cq["output_vat_cents"] == 0
    assert cq["invoice_summary"]["draft_count"] == 1

    # Should have a warning about draft invoices
    warning_titles = [w["title"] for w in cq["warnings"]]
    assert any("concept" in t.lower() for t in warning_titles)


@pytest.mark.asyncio
async def test_btw_aangifte_previous_quarters(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test BTW aangifte includes previous quarters."""
    response = await async_client.get(
        "/api/v1/zzp/btw-aangifte",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()

    # Should include up to 3 previous quarters
    assert isinstance(data["previous_quarters"], list)
    assert len(data["previous_quarters"]) <= 3
