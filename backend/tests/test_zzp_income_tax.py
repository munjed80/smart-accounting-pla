"""
Tests for ZZP Inkomstenbelasting (Income Tax) Preparation API Endpoint

Tests the self-service annual income-tax preparation overview for ZZP users.
"""
import pytest
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.zzp import (
    ZZPInvoice,
    ZZPExpense,
    ZZPTimeEntry,
    BusinessProfile,
    InvoiceStatus,
)


@pytest.mark.asyncio
async def test_income_tax_no_data(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test income tax returns empty metrics when no data exists."""
    response = await async_client.get(
        "/api/v1/zzp/income-tax",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()

    # Check structure
    assert "overview" in data
    assert "available_years" in data
    assert "profile_complete" in data

    ov = data["overview"]
    assert "year" in ov
    assert "omzet_cents" in ov
    assert "kosten_cents" in ov
    assert "winst_cents" in ov
    assert "warnings" in ov
    assert "checklist" in ov
    assert "is_complete" in ov
    assert "hours_indicator" in ov

    # No data → zeroes
    assert ov["omzet_cents"] == 0
    assert ov["kosten_cents"] == 0
    assert ov["winst_cents"] == 0
    assert ov["paid_invoice_count"] == 0
    assert ov["expense_count"] == 0


@pytest.mark.asyncio
async def test_income_tax_with_paid_invoice(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
    test_customer,
):
    """Test income tax includes paid invoices in omzet calculation."""
    today = date.today()
    year_start = date(today.year, 1, 1)

    # Create a paid invoice in the current year
    invoice = ZZPInvoice()
    invoice.administration_id = test_administration.id
    invoice.customer_id = test_customer.id
    invoice.invoice_number = "INV-IB-001"
    invoice.status = InvoiceStatus.PAID.value
    invoice.invoice_date = year_start
    invoice.issue_date = year_start
    invoice.subtotal_cents = 50000  # €500
    invoice.vat_total_cents = 10500  # €105
    invoice.total_cents = 60500
    invoice.seller_company_name = "Test Co"
    invoice.customer_name = "Client"
    invoice.updated_at = datetime.now(timezone.utc)
    db_session.add(invoice)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/zzp/income-tax",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    ov = data["overview"]

    assert ov["omzet_cents"] == 50000
    assert ov["paid_invoice_count"] == 1
    assert ov["winst_cents"] == 50000  # No expenses yet


@pytest.mark.asyncio
async def test_income_tax_with_expenses(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
):
    """Test income tax includes expenses in kosten calculation."""
    today = date.today()
    year_start = date(today.year, 1, 1)

    # Create expenses in the current year
    expense1 = ZZPExpense()
    expense1.administration_id = test_administration.id
    expense1.vendor = "Staples"
    expense1.description = "Office supplies"
    expense1.category = "kantoor"
    expense1.expense_date = year_start
    expense1.amount_cents = 5000  # €50
    expense1.vat_rate = Decimal("21.00")
    expense1.vat_amount_cents = 1050
    db_session.add(expense1)

    expense2 = ZZPExpense()
    expense2.administration_id = test_administration.id
    expense2.vendor = "KPN"
    expense2.description = "Phone"
    expense2.category = "telefoon"
    expense2.expense_date = year_start
    expense2.amount_cents = 3000  # €30
    expense2.vat_rate = Decimal("21.00")
    expense2.vat_amount_cents = 630
    db_session.add(expense2)

    await db_session.commit()

    response = await async_client.get(
        "/api/v1/zzp/income-tax",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    ov = data["overview"]

    assert ov["kosten_cents"] == 8000  # €50 + €30
    assert ov["expense_count"] == 2

    # Cost breakdown should have two categories
    cats = {c["category"] for c in ov["cost_breakdown"]}
    assert "kantoor" in cats
    assert "telefoon" in cats


@pytest.mark.asyncio
async def test_income_tax_winst_calculation(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
    test_customer,
):
    """Test income tax correctly calculates winst = omzet - kosten."""
    today = date.today()
    year_start = date(today.year, 1, 1)

    # Create paid invoice
    invoice = ZZPInvoice()
    invoice.administration_id = test_administration.id
    invoice.customer_id = test_customer.id
    invoice.invoice_number = "INV-IB-002"
    invoice.status = InvoiceStatus.PAID.value
    invoice.invoice_date = year_start
    invoice.issue_date = year_start
    invoice.subtotal_cents = 100000  # €1000
    invoice.vat_total_cents = 21000
    invoice.total_cents = 121000
    invoice.seller_company_name = "Test Co"
    invoice.customer_name = "Client"
    invoice.updated_at = datetime.now(timezone.utc)
    db_session.add(invoice)

    # Create expense
    expense = ZZPExpense()
    expense.administration_id = test_administration.id
    expense.vendor = "Supplier"
    expense.description = "Materials"
    expense.category = "algemeen"
    expense.expense_date = year_start
    expense.amount_cents = 30000  # €300
    expense.vat_rate = Decimal("21.00")
    expense.vat_amount_cents = 6300
    db_session.add(expense)

    await db_session.commit()

    response = await async_client.get(
        "/api/v1/zzp/income-tax",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    ov = data["overview"]

    assert ov["omzet_cents"] == 100000
    assert ov["kosten_cents"] == 30000
    assert ov["winst_cents"] == 70000  # €1000 - €300


@pytest.mark.asyncio
async def test_income_tax_year_selector(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test income tax accepts year parameter."""
    response = await async_client.get(
        "/api/v1/zzp/income-tax",
        params={"year": 2024},
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["overview"]["year"] == 2024


@pytest.mark.asyncio
async def test_income_tax_available_years(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test income tax returns available year options."""
    response = await async_client.get(
        "/api/v1/zzp/income-tax",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()

    # Should include current year and several previous years
    assert len(data["available_years"]) > 0
    today = date.today()
    assert today.year in data["available_years"]


@pytest.mark.asyncio
async def test_income_tax_hours_indicator(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
):
    """Test income tax hours indicator with time entries."""
    today = date.today()
    year_start = date(today.year, 1, 1)

    # Add time entries
    entry = ZZPTimeEntry()
    entry.administration_id = test_administration.id
    entry.entry_date = year_start
    entry.description = "Consulting work"
    entry.hours = Decimal("8.00")
    entry.billable = True
    db_session.add(entry)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/zzp/income-tax",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    hi = data["overview"]["hours_indicator"]

    assert hi["data_available"] is True
    assert hi["total_hours"] == 8.0
    assert hi["target_hours"] == 1225
    assert hi["percentage"] > 0


@pytest.mark.asyncio
async def test_income_tax_checklist(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test income tax returns preparation checklist."""
    response = await async_client.get(
        "/api/v1/zzp/income-tax",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()

    checklist = data["overview"]["checklist"]
    assert len(checklist) > 0
    # Each item should have the right structure
    for item in checklist:
        assert "id" in item
        assert "label" in item
        assert "done" in item


@pytest.mark.asyncio
async def test_income_tax_warnings_for_drafts(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
    test_customer,
):
    """Test income tax warns about draft invoices."""
    today = date.today()
    year_start = date(today.year, 1, 1)

    # Create a draft invoice
    invoice = ZZPInvoice()
    invoice.administration_id = test_administration.id
    invoice.customer_id = test_customer.id
    invoice.invoice_number = "INV-IB-DRAFT"
    invoice.status = InvoiceStatus.DRAFT.value
    invoice.invoice_date = year_start
    invoice.issue_date = year_start
    invoice.subtotal_cents = 10000
    invoice.vat_total_cents = 2100
    invoice.total_cents = 12100
    invoice.seller_company_name = "Test Co"
    invoice.customer_name = "Client"
    invoice.updated_at = datetime.now(timezone.utc)
    db_session.add(invoice)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/zzp/income-tax",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    ov = data["overview"]

    # Draft invoice should trigger a warning
    assert ov["draft_invoice_count"] == 1
    warning_titles = [w["title"] for w in ov["warnings"]]
    assert any("conceptfactuur" in t.lower() for t in warning_titles)
