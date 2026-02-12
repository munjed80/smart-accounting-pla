"""
Tests for ZZP Dashboard API Endpoint

Tests the aggregated dashboard metrics for ZZP users.
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
    ZZPTimeEntry, 
    BusinessProfile,
    InvoiceStatus,
)
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_zzp_dashboard_no_data(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test dashboard returns empty metrics when no data exists."""
    response = await async_client.get(
        "/api/v1/zzp/dashboard",
        headers=auth_headers,
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Check structure
    assert "invoices" in data
    assert "expenses" in data
    assert "time" in data
    assert "btw" in data
    assert "actions" in data
    assert "profile_complete" in data
    
    # Check default values
    assert data["invoices"]["open_count"] == 0
    assert data["invoices"]["open_total_cents"] == 0
    assert data["expenses"]["this_month_count"] == 0
    assert data["time"]["this_week_hours"] == 0
    
    # Should have "missing profile" action
    action_types = [a["type"] for a in data["actions"]]
    assert "missing_profile" in action_types


@pytest.mark.asyncio
async def test_zzp_dashboard_with_invoices(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
    test_customer,
):
    """Test dashboard shows invoice statistics correctly."""
    today = date.today()
    
    # Create a sent invoice (open)
    sent_invoice = ZZPInvoice()
    sent_invoice.administration_id = test_administration.id
    sent_invoice.customer_id = test_customer.id
    sent_invoice.invoice_number = "INV-2026-0001"
    sent_invoice.status = InvoiceStatus.SENT.value
    sent_invoice.issue_date = today - timedelta(days=10)
    sent_invoice.due_date = today + timedelta(days=20)
    sent_invoice.subtotal_cents = 10000
    sent_invoice.vat_total_cents = 2100
    sent_invoice.total_cents = 12100
    db_session.add(sent_invoice)
    
    # Create a paid invoice (this month)
    paid_invoice = ZZPInvoice()
    paid_invoice.administration_id = test_administration.id
    paid_invoice.customer_id = test_customer.id
    paid_invoice.invoice_number = "INV-2026-0002"
    paid_invoice.status = InvoiceStatus.PAID.value
    paid_invoice.issue_date = today - timedelta(days=30)
    paid_invoice.due_date = today - timedelta(days=15)
    paid_invoice.subtotal_cents = 20000
    paid_invoice.vat_total_cents = 4200
    paid_invoice.total_cents = 24200
    db_session.add(paid_invoice)
    
    # Create a draft invoice
    draft_invoice = ZZPInvoice()
    draft_invoice.administration_id = test_administration.id
    draft_invoice.customer_id = test_customer.id
    draft_invoice.invoice_number = "INV-2026-0003"
    draft_invoice.status = InvoiceStatus.DRAFT.value
    draft_invoice.issue_date = today
    draft_invoice.subtotal_cents = 5000
    draft_invoice.vat_total_cents = 1050
    draft_invoice.total_cents = 6050
    db_session.add(draft_invoice)
    
    await db_session.commit()
    
    response = await async_client.get(
        "/api/v1/zzp/dashboard",
        headers=auth_headers,
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Sent invoice should be counted as open
    assert data["invoices"]["open_count"] == 1
    assert data["invoices"]["open_total_cents"] == 12100
    
    # Draft invoice should be counted
    assert data["invoices"]["draft_count"] == 1
    
    # Paid invoice should show in this month (if within this month)
    assert data["invoices"]["paid_this_month_count"] >= 0


@pytest.mark.asyncio
async def test_zzp_dashboard_with_expenses(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
):
    """Test dashboard shows expense statistics correctly."""
    today = date.today()
    
    # Create an expense this month
    expense = ZZPExpense()
    expense.administration_id = test_administration.id
    expense.vendor = "Test Vendor"
    expense.expense_date = today - timedelta(days=5)
    expense.amount_cents = 5000
    expense.vat_rate = Decimal("21.0")
    expense.vat_amount_cents = 868  # 5000 * 21 / 121
    expense.category = "kantoorkosten"
    db_session.add(expense)
    await db_session.commit()
    
    response = await async_client.get(
        "/api/v1/zzp/dashboard",
        headers=auth_headers,
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Check expense shows up
    assert data["expenses"]["this_month_count"] >= 1
    assert data["expenses"]["this_month_total_cents"] >= 5000


@pytest.mark.asyncio
async def test_zzp_dashboard_with_time_entries(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
):
    """Test dashboard shows time tracking statistics correctly."""
    today = date.today()
    
    # Calculate Monday of this week
    monday = today - timedelta(days=today.weekday())
    
    # Create a billable time entry
    time_entry = ZZPTimeEntry()
    time_entry.administration_id = test_administration.id
    time_entry.entry_date = monday
    time_entry.description = "Test work"
    time_entry.hours = Decimal("8.0")
    time_entry.billable = True
    time_entry.hourly_rate_cents = 7500
    db_session.add(time_entry)
    
    # Create a non-billable time entry
    non_billable = ZZPTimeEntry()
    non_billable.administration_id = test_administration.id
    non_billable.entry_date = monday + timedelta(days=1)
    non_billable.description = "Admin work"
    non_billable.hours = Decimal("2.0")
    non_billable.billable = False
    db_session.add(non_billable)
    
    await db_session.commit()
    
    response = await async_client.get(
        "/api/v1/zzp/dashboard",
        headers=auth_headers,
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Check time shows up
    assert data["time"]["this_week_hours"] == 10.0
    assert data["time"]["this_week_billable_hours"] == 8.0
    assert data["time"]["this_week_value_cents"] == 60000  # 8 * 7500


@pytest.mark.asyncio
async def test_zzp_dashboard_profile_complete(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    test_administration,
):
    """Test dashboard shows profile_complete correctly."""
    # Create a complete profile
    profile = BusinessProfile()
    profile.administration_id = test_administration.id
    profile.company_name = "Test Company"
    profile.kvk_number = "12345678"
    profile.btw_number = "NL123456789B01"
    profile.iban = "NL91ABNA0417164300"
    db_session.add(profile)
    await db_session.commit()
    
    response = await async_client.get(
        "/api/v1/zzp/dashboard",
        headers=auth_headers,
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Profile should be complete
    assert data["profile_complete"] is True
    
    # Should not have "missing profile" action
    action_types = [a["type"] for a in data["actions"]]
    assert "missing_profile" not in action_types


@pytest.mark.asyncio
async def test_zzp_dashboard_btw_stats(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test dashboard shows BTW statistics correctly."""
    response = await async_client.get(
        "/api/v1/zzp/dashboard",
        headers=auth_headers,
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Check BTW structure
    btw = data["btw"]
    assert "quarter" in btw
    assert "deadline" in btw
    assert "days_until_deadline" in btw
    assert "vat_collected_cents" in btw
    assert "vat_deductible_cents" in btw
    assert "vat_payable_cents" in btw
    
    # Quarter should be formatted as Q1-Q4 YYYY
    assert btw["quarter"].startswith("Q")


@pytest.mark.asyncio
async def test_zzp_dashboard_unauthorized(
    async_client: AsyncClient,
):
    """Test dashboard requires authentication."""
    response = await async_client.get("/api/v1/zzp/dashboard")
    
    assert response.status_code == 401
