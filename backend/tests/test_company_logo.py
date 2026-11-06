"""Exercise profile logo persistence and both production invoice renderers."""

import base64
from datetime import date
from io import BytesIO
from unittest.mock import patch

import pytest
from PIL import Image
from pypdf import PdfReader


@pytest.mark.asyncio
async def test_profile_logo_appears_in_invoice_pdf_and_can_be_removed(
    async_client, auth_headers, test_customer
):
    image = BytesIO()
    Image.new("RGB", (1200, 400), "#245c4e").save(image, "JPEG")
    logo = "data:image/jpeg;base64," + base64.b64encode(image.getvalue()).decode()
    profile_url = "/api/v1/zzp/profile"
    response = await async_client.put(
        profile_url,
        headers=auth_headers,
        json={"company_name": "Logo Studio", "logo_data_url": logo},
    )
    assert response.status_code == 200, response.text
    saved_logo = response.json()["logo_data_url"]
    assert saved_logo.startswith("data:image/png;base64,")
    with Image.open(BytesIO(base64.b64decode(saved_logo.split(",", 1)[1]))) as saved:
        assert saved.size == (384, 128)

    profile = await async_client.get(profile_url, headers=auth_headers)
    assert profile.json()["logo_data_url"] == saved_logo

    invalid = await async_client.patch(
        profile_url, headers=auth_headers, json={"logo_data_url": "https://example.com/logo.svg"}
    )
    assert invalid.status_code == 422

    invoice = await async_client.post(
        "/api/v1/zzp/invoices",
        headers=auth_headers,
        json={
            "customer_id": str(test_customer.id),
            "issue_date": date.today().isoformat(),
            "lines": [{"description": "Design", "quantity": 1, "unit_price_cents": 10000, "vat_rate": 21}],
        },
    )
    assert invoice.status_code == 201, invoice.text
    invoice_url = f"/api/v1/zzp/invoices/{invoice.json()['id']}/pdf"

    pdf = await async_client.get(invoice_url, headers=auth_headers)
    assert pdf.status_code == 200, pdf.text
    assert len(PdfReader(BytesIO(pdf.content)).pages[0].images) == 1

    with patch("app.services.invoice_rendering.generate_invoice_pdf", side_effect=RuntimeError("Unavailable")):
        fallback = await async_client.get(invoice_url, headers=auth_headers)
    assert fallback.status_code == 200, fallback.text
    assert len(PdfReader(BytesIO(fallback.content)).pages[0].images) == 1

    removed = await async_client.patch(
        profile_url, headers=auth_headers, json={"logo_data_url": None}
    )
    assert removed.status_code == 200
    assert removed.json()["logo_data_url"] is None
    updated_pdf = await async_client.get(invoice_url, headers=auth_headers)
    assert updated_pdf.status_code == 200
    assert not PdfReader(BytesIO(updated_pdf.content)).pages[0].images
