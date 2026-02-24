from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.zzp import ZZPInvoice, ZZPTimeEntry


@pytest.mark.asyncio
async def test_invoice_week_marks_entries_invoiced(
    async_client: AsyncClient,
    auth_headers: dict,
    test_customer,
    db_session: AsyncSession,
):
    for day in ("2026-02-02", "2026-02-03"):
        response = await async_client.post(
            "/api/v1/zzp/time-entries",
            json={
                "entry_date": day,
                "description": "Development",
                "hours": "4.00",
                "customer_id": str(test_customer.id),
                "hourly_rate": "95.00",
                "billable": True,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201

    invoice_response = await async_client.post(
        "/api/v1/zzp/time-entries/invoice-week",
        json={
            "customer_id": str(test_customer.id),
            "period_start": "2026-02-01",
            "period_end": "2026-02-07",
            "hourly_rate": "95.00",
        },
        headers=auth_headers,
    )

    assert invoice_response.status_code == 201
    payload = invoice_response.json()
    assert payload["invoice_number"].startswith("INV-")
    assert Decimal(payload["total_hours"]) == Decimal("8.00")

    invoice = await db_session.scalar(select(ZZPInvoice).where(ZZPInvoice.id == UUID(payload["invoice_id"])))
    assert invoice is not None

    entries = (await db_session.execute(select(ZZPTimeEntry))).scalars().all()
    assert len(entries) == 2
    assert all(entry.invoice_id == invoice.id for entry in entries)
    assert all(entry.is_invoiced is True for entry in entries)


@pytest.mark.asyncio
async def test_cannot_edit_invoiced_entry(
    async_client: AsyncClient,
    auth_headers: dict,
    test_customer,
):
    create = await async_client.post(
        "/api/v1/zzp/time-entries",
        json={
            "entry_date": "2026-02-10",
            "description": "Consultancy",
            "hours": "2.00",
            "customer_id": str(test_customer.id),
            "hourly_rate": "100.00",
            "billable": True,
        },
        headers=auth_headers,
    )
    assert create.status_code == 201
    entry_id = create.json()["id"]

    invoice = await async_client.post(
        "/api/v1/zzp/time-entries/invoice-week",
        json={
            "customer_id": str(test_customer.id),
            "period_start": "2026-02-10",
            "period_end": "2026-02-10",
            "hourly_rate": "100.00",
        },
        headers=auth_headers,
    )
    assert invoice.status_code == 201

    patch = await async_client.patch(
        f"/api/v1/zzp/time-entries/{entry_id}",
        json={"description": "Updated"},
        headers=auth_headers,
    )
    assert patch.status_code == 409
    assert patch.json()["detail"]["code"] == "TIME_ENTRY_INVOICED"


@pytest.mark.asyncio
async def test_delete_time_entry_returns_204(
    async_client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
):
    """DELETE /zzp/time-entries/{id} removes the entry and returns 204."""
    create = await async_client.post(
        "/api/v1/zzp/time-entries",
        json={
            "entry_date": "2026-02-15",
            "description": "To be deleted",
            "hours": "3.00",
            "billable": False,
        },
        headers=auth_headers,
    )
    assert create.status_code == 201
    entry_id = create.json()["id"]

    response = await async_client.delete(
        f"/api/v1/zzp/time-entries/{entry_id}",
        headers=auth_headers,
    )
    assert response.status_code == 204

    remaining = await db_session.scalar(
        select(ZZPTimeEntry).where(ZZPTimeEntry.id == UUID(entry_id))
    )
    assert remaining is None


@pytest.mark.asyncio
async def test_delete_invoiced_time_entry_returns_409(
    async_client: AsyncClient,
    auth_headers: dict,
    test_customer,
):
    """DELETE on an invoiced entry returns 409 CONFLICT."""
    create = await async_client.post(
        "/api/v1/zzp/time-entries",
        json={
            "entry_date": "2026-02-16",
            "description": "Invoiced work",
            "hours": "2.00",
            "customer_id": str(test_customer.id),
            "hourly_rate": "80.00",
            "billable": True,
        },
        headers=auth_headers,
    )
    assert create.status_code == 201
    entry_id = create.json()["id"]

    invoice = await async_client.post(
        "/api/v1/zzp/time-entries/invoice-week",
        json={
            "customer_id": str(test_customer.id),
            "period_start": "2026-02-16",
            "period_end": "2026-02-16",
            "hourly_rate": "80.00",
        },
        headers=auth_headers,
    )
    assert invoice.status_code == 201

    response = await async_client.delete(
        f"/api/v1/zzp/time-entries/{entry_id}",
        headers=auth_headers,
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "TIME_ENTRY_INVOICED"


@pytest.mark.asyncio
async def test_delete_time_entry_not_found_returns_404(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """DELETE on a non-existent entry returns 404."""
    fake_id = uuid4()
    response = await async_client.delete(
        f"/api/v1/zzp/time-entries/{fake_id}",
        headers=auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "TIME_ENTRY_NOT_FOUND"
