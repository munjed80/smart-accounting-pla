"""
Tests for ZZP Invoice API endpoints.

Tests invoice status updates and PDF generation endpoints.
"""
import pytest
from datetime import date
from uuid import uuid4
from unittest.mock import patch, MagicMock

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models.user import User
from app.models.administration import Administration, AdministrationMember
from app.models.zzp import ZZPInvoice, ZZPInvoiceLine, ZZPCustomer, InvoiceStatus


class TestInvoiceStatusTransitions:
    """Tests for PATCH /zzp/invoices/{id}/status - status transitions."""
    
    @pytest.mark.asyncio
    async def test_status_draft_to_sent(
        self,
        async_client: AsyncClient,
        test_invoice_draft: ZZPInvoice,
        auth_headers: dict
    ):
        """Draft invoice can be marked as sent."""
        response = await async_client.patch(
            f"/api/v1/zzp/invoices/{test_invoice_draft.id}/status",
            json={"status": "sent"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "sent"
    
    @pytest.mark.asyncio
    async def test_status_sent_to_paid(
        self,
        async_client: AsyncClient,
        test_invoice_sent: ZZPInvoice,
        auth_headers: dict
    ):
        """Sent invoice can be marked as paid."""
        response = await async_client.patch(
            f"/api/v1/zzp/invoices/{test_invoice_sent.id}/status",
            json={"status": "paid"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "paid"
    
    @pytest.mark.asyncio
    async def test_status_paid_to_sent_mark_unpaid(
        self,
        async_client: AsyncClient,
        test_invoice_paid: ZZPInvoice,
        auth_headers: dict
    ):
        """Paid invoice can be marked as unpaid (back to sent)."""
        response = await async_client.patch(
            f"/api/v1/zzp/invoices/{test_invoice_paid.id}/status",
            json={"status": "sent"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "sent"
    
    @pytest.mark.asyncio
    async def test_status_sent_to_cancelled(
        self,
        async_client: AsyncClient,
        test_invoice_sent: ZZPInvoice,
        auth_headers: dict
    ):
        """Sent invoice can be cancelled."""
        response = await async_client.patch(
            f"/api/v1/zzp/invoices/{test_invoice_sent.id}/status",
            json={"status": "cancelled"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "cancelled"
    
    @pytest.mark.asyncio
    async def test_invalid_status_transition_draft_to_paid(
        self,
        async_client: AsyncClient,
        test_invoice_draft: ZZPInvoice,
        auth_headers: dict
    ):
        """Draft cannot be directly marked as paid (must be sent first)."""
        response = await async_client.patch(
            f"/api/v1/zzp/invoices/{test_invoice_draft.id}/status",
            json={"status": "paid"},
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "INVALID_STATUS_TRANSITION"
    
    @pytest.mark.asyncio
    async def test_invalid_status_transition_cancelled_to_paid(
        self,
        async_client: AsyncClient,
        test_invoice_cancelled: ZZPInvoice,
        auth_headers: dict
    ):
        """Cancelled invoice cannot be marked as paid."""
        response = await async_client.patch(
            f"/api/v1/zzp/invoices/{test_invoice_cancelled.id}/status",
            json={"status": "paid"},
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "INVALID_STATUS_TRANSITION"
    
    @pytest.mark.asyncio
    async def test_status_update_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict
    ):
        """Status update for non-existent invoice returns 404."""
        fake_id = uuid4()
        response = await async_client.patch(
            f"/api/v1/zzp/invoices/{fake_id}/status",
            json={"status": "sent"},
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["code"] == "INVOICE_NOT_FOUND"


class TestInvoicePdfEndpoint:
    """Tests for GET /zzp/invoices/{id}/pdf - PDF generation."""
    
    @pytest.mark.asyncio
    async def test_pdf_download_success(
        self,
        async_client: AsyncClient,
        test_invoice_sent: ZZPInvoice,
        auth_headers: dict
    ):
        """PDF can be downloaded for an existing invoice."""
        # Mock WeasyPrint to avoid dependency issues in tests
        with patch('app.services.invoice_pdf.generate_invoice_pdf') as mock_pdf:
            mock_pdf.return_value = b'%PDF-1.4 fake pdf content'
            
            response = await async_client.get(
                f"/api/v1/zzp/invoices/{test_invoice_sent.id}/pdf",
                headers=auth_headers
            )
            
            assert response.status_code == 200
            assert response.headers["content-type"] == "application/pdf"
            assert "attachment" in response.headers["content-disposition"]
            assert test_invoice_sent.invoice_number in response.headers["content-disposition"]
    
    @pytest.mark.asyncio
    async def test_pdf_download_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict
    ):
        """PDF download for non-existent invoice returns 404."""
        fake_id = uuid4()
        
        response = await async_client.get(
            f"/api/v1/zzp/invoices/{fake_id}/pdf",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["code"] == "INVOICE_NOT_FOUND"
    
    @pytest.mark.asyncio
    async def test_pdf_unavailable_when_library_not_installed(
        self,
        async_client: AsyncClient,
        test_invoice_sent: ZZPInvoice,
        auth_headers: dict
    ):
        """PDF endpoint returns 503 when WeasyPrint is not available."""
        # Mock generate_invoice_pdf to raise RuntimeError (WeasyPrint unavailable)
        with patch('app.services.invoice_pdf.generate_invoice_pdf') as mock_gen:
            mock_gen.side_effect = RuntimeError(
                "PDF generation is not available. WeasyPrint library or its system dependencies are not installed."
            )
            
            response = await async_client.get(
                f"/api/v1/zzp/invoices/{test_invoice_sent.id}/pdf",
                headers=auth_headers
            )
            
            assert response.status_code == 503
            data = response.json()
            assert data["detail"]["code"] == "PDF_NOT_AVAILABLE"


class TestInvoiceDelete:
    """Tests for DELETE /zzp/invoices/{id}."""
    
    @pytest.mark.asyncio
    async def test_delete_draft_invoice_success(
        self,
        async_client: AsyncClient,
        test_invoice_draft: ZZPInvoice,
        auth_headers: dict
    ):
        """Draft invoice can be deleted."""
        response = await async_client.delete(
            f"/api/v1/zzp/invoices/{test_invoice_draft.id}",
            headers=auth_headers
        )
        
        assert response.status_code == 204
    
    @pytest.mark.asyncio
    async def test_delete_sent_invoice_fails(
        self,
        async_client: AsyncClient,
        test_invoice_sent: ZZPInvoice,
        auth_headers: dict
    ):
        """Sent invoice cannot be deleted."""
        response = await async_client.delete(
            f"/api/v1/zzp/invoices/{test_invoice_sent.id}",
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "INVOICE_NOT_DELETABLE"
    
    @pytest.mark.asyncio
    async def test_delete_paid_invoice_fails(
        self,
        async_client: AsyncClient,
        test_invoice_paid: ZZPInvoice,
        auth_headers: dict
    ):
        """Paid invoice cannot be deleted."""
        response = await async_client.delete(
            f"/api/v1/zzp/invoices/{test_invoice_paid.id}",
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "INVOICE_NOT_DELETABLE"
    
    @pytest.mark.asyncio
    async def test_delete_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict
    ):
        """Delete for non-existent invoice returns 404."""
        fake_id = uuid4()
        response = await async_client.delete(
            f"/api/v1/zzp/invoices/{fake_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["code"] == "INVOICE_NOT_FOUND"


class TestInvoiceSendEmail:
    """Tests for POST /zzp/invoices/{id}/send - send invoice via email."""
    
    @pytest.mark.asyncio
    async def test_send_invoice_success(
        self,
        async_client: AsyncClient,
        test_invoice_draft: ZZPInvoice,
        auth_headers: dict
    ):
        """Draft invoice can be sent via email."""
        # Mock the email service and PDF generation
        with patch('app.api.v1.zzp_invoices.email_service') as mock_email, \
             patch('app.api.v1.zzp_invoices.generate_invoice_pdf_reportlab') as mock_pdf, \
             patch('app.api.v1.zzp_invoices.get_invoice_pdf_filename') as mock_filename:
            
            # Setup mocks
            mock_pdf.return_value = b'fake-pdf-content'
            mock_filename.return_value = 'INV-2026-0001.pdf'
            mock_email.client = MagicMock()
            mock_email.client.Emails = MagicMock()
            mock_email.client.Emails.send = MagicMock()
            
            # Call the endpoint
            response = await async_client.post(
                f"/api/v1/zzp/invoices/{test_invoice_draft.id}/send",
                headers=auth_headers
            )
            
            # Verify response
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "sent"
            assert data["id"] == str(test_invoice_draft.id)
            
            # Verify email was sent
            assert mock_email.client.Emails.send.called
    
    @pytest.mark.asyncio
    async def test_send_invoice_no_customer_email(
        self,
        async_client: AsyncClient,
        test_invoice_draft: ZZPInvoice,
        test_customer,
        db_session: AsyncSession,
        auth_headers: dict
    ):
        """Sending invoice fails if customer has no email."""
        # Remove customer email
        test_customer.email = None
        await db_session.commit()
        
        response = await async_client.post(
            f"/api/v1/zzp/invoices/{test_invoice_draft.id}/send",
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "NO_CUSTOMER_EMAIL"
    
    @pytest.mark.asyncio
    async def test_send_invoice_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict
    ):
        """Send endpoint returns 404 for non-existent invoice."""
        fake_id = uuid4()
        response = await async_client.post(
            f"/api/v1/zzp/invoices/{fake_id}/send",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["code"] == "INVOICE_NOT_FOUND"


# Pytest fixtures for test invoices
# Note: These fixtures require the conftest.py to provide:
# - test_user, test_administration, auth_headers
# - async_client (httpx AsyncClient)
# - db_session (async SQLAlchemy session)
#
# These fixtures are async-compatible and should be used with async tests.
# In a full integration test setup, ensure conftest.py provides async fixtures.

@pytest.fixture
async def test_invoice_draft(test_user, test_administration, test_customer, db_session):
    """Create a draft invoice for testing."""
    invoice = ZZPInvoice(
        administration_id=test_administration.id,
        customer_id=test_customer.id,
        invoice_number="INV-2026-0001",
        status=InvoiceStatus.DRAFT.value,
        issue_date=date.today(),
        seller_company_name="Test Company",
        customer_name="Test Customer",
        subtotal_cents=10000,
        vat_total_cents=2100,
        total_cents=12100,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


@pytest.fixture
async def test_invoice_sent(test_user, test_administration, test_customer, db_session):
    """Create a sent invoice for testing."""
    invoice = ZZPInvoice(
        administration_id=test_administration.id,
        customer_id=test_customer.id,
        invoice_number="INV-2026-0002",
        status=InvoiceStatus.SENT.value,
        issue_date=date.today(),
        seller_company_name="Test Company",
        customer_name="Test Customer",
        subtotal_cents=10000,
        vat_total_cents=2100,
        total_cents=12100,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


@pytest.fixture
async def test_invoice_paid(test_user, test_administration, test_customer, db_session):
    """Create a paid invoice for testing."""
    invoice = ZZPInvoice(
        administration_id=test_administration.id,
        customer_id=test_customer.id,
        invoice_number="INV-2026-0003",
        status=InvoiceStatus.PAID.value,
        issue_date=date.today(),
        seller_company_name="Test Company",
        customer_name="Test Customer",
        subtotal_cents=10000,
        vat_total_cents=2100,
        total_cents=12100,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


@pytest.fixture
async def test_invoice_cancelled(test_user, test_administration, test_customer, db_session):
    """Create a cancelled invoice for testing."""
    invoice = ZZPInvoice(
        administration_id=test_administration.id,
        customer_id=test_customer.id,
        invoice_number="INV-2026-0004",
        status=InvoiceStatus.CANCELLED.value,
        issue_date=date.today(),
        seller_company_name="Test Company",
        customer_name="Test Customer",
        subtotal_cents=10000,
        vat_total_cents=2100,
        total_cents=12100,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


@pytest.fixture
async def test_customer(test_administration, db_session):
    """Create a test customer for invoice tests."""
    customer = ZZPCustomer(
        administration_id=test_administration.id,
        name="Test Customer B.V.",
        email="customer@test.nl",
        status="active",
    )
    db_session.add(customer)
    await db_session.commit()
    await db_session.refresh(customer)
    return customer


class TestInvoicePdfContent:
    """Tests for invoice PDF content correctness."""
    
    def test_reportlab_pdf_totals_no_html_tags(self):
        """ReportLab PDF totals should not contain escaped HTML tags."""
        from app.services.invoice_pdf_reportlab import generate_invoice_pdf_reportlab
        from decimal import Decimal
        from datetime import date
        
        # Create minimal mock invoice
        class MockInvoice:
            id = "test-id"
            invoice_number = "INV-TEST-001"
            issue_date = date.today()
            due_date = date.today()
            seller_company_name = "Test Co"
            seller_trading_name = None
            seller_address_street = "Street 1"
            seller_address_postal_code = "1234AB"
            seller_address_city = "City"
            seller_address_country = "Nederland"
            seller_kvk_number = "12345678"
            seller_btw_number = "NL123456789B01"
            seller_iban = "NL00BANK0000000000"
            seller_email = "test@test.nl"
            seller_phone = None
            customer_name = "Customer"
            customer_address_street = None
            customer_address_postal_code = None
            customer_address_city = None
            customer_address_country = None
            customer_kvk_number = None
            customer_btw_number = None
            subtotal_cents = 100000
            vat_total_cents = 21000
            total_cents = 121000
            notes = None
            lines = []
        
        class MockLine:
            description = "Test item"
            quantity = Decimal("1")
            unit_price_cents = 100000
            vat_rate = Decimal("21")
            line_total_cents = 100000
            vat_amount_cents = 21000
        
        invoice = MockInvoice()
        invoice.lines = [MockLine()]
        
        # Generate PDF
        pdf_bytes = generate_invoice_pdf_reportlab(invoice)
        
        # Convert to string (with latin-1 encoding for binary data)
        pdf_str = pdf_bytes.decode('latin-1', errors='ignore')
        
        # Verify no escaped HTML tags
        assert "<b>Totaal</b>" not in pdf_str, "PDF contains escaped HTML tags in totals"
        assert "&lt;b&gt;" not in pdf_str, "PDF contains HTML entity-encoded tags"
        
    def test_weasyprint_html_kvk_in_payment_section(self):
        """WeasyPrint HTML should have KvK in payment details, not footer."""
        from app.services.invoice_pdf import generate_invoice_html
        from decimal import Decimal
        from datetime import date
        
        # Create minimal mock invoice
        class MockInvoice:
            id = "test-id"
            invoice_number = "INV-TEST-001"
            issue_date = date.today()
            due_date = date.today()
            seller_company_name = "Test Co"
            seller_trading_name = None
            seller_address_street = "Street 1"
            seller_address_postal_code = "1234AB"
            seller_address_city = "City"
            seller_address_country = "Nederland"
            seller_kvk_number = "12345678"
            seller_btw_number = "NL123456789B01"
            seller_iban = "NL00BANK0000000000"
            seller_email = "test@test.nl"
            seller_phone = None
            customer_name = "Customer"
            customer_address_street = None
            customer_address_postal_code = None
            customer_address_city = None
            customer_address_country = None
            customer_kvk_number = None
            customer_btw_number = None
            subtotal_cents = 100000
            vat_total_cents = 21000
            total_cents = 121000
            notes = None
            lines = []
        
        class MockLine:
            description = "Test item"
            quantity = Decimal("1")
            unit_price_cents = 100000
            vat_rate = Decimal("21")
            line_total_cents = 100000
            vat_amount_cents = 21000
        
        invoice = MockInvoice()
        invoice.lines = [MockLine()]
        
        # Generate HTML
        html = generate_invoice_html(invoice)
        
        # Extract payment section - find matching closing div
        payment_start = html.find('<div class="payment-info">')
        if payment_start > 0:
            # Find the closing div for payment-info section
            # We need to track nested divs to find the correct closing tag
            depth = 0
            i = payment_start
            while i < len(html):
                if html[i:i+4] == '<div':
                    depth += 1
                elif html[i:i+6] == '</div>':
                    depth -= 1
                    if depth == 0:
                        payment_end = i + 6
                        break
                i += 1
            payment_section = html[payment_start:payment_end]
        else:
            payment_section = ""
        
        # Verify KvK is in payment section
        assert "12345678" in payment_section, "KvK number should be in payment details section"
        assert "KvK" in payment_section, "KvK label should be in payment details section"
        
        # Verify there's no separate business-ids footer div
        assert '<div class="business-ids">' not in html, "Should not have separate business-ids footer"
        
    def test_weasyprint_html_totals_use_css_not_inline_html(self):
        """WeasyPrint HTML should use CSS classes for totals, not inline HTML tags."""
        from app.services.invoice_pdf import generate_invoice_html
        from decimal import Decimal
        from datetime import date
        
        # Create minimal mock invoice
        class MockInvoice:
            id = "test-id"
            invoice_number = "INV-TEST-001"
            issue_date = date.today()
            due_date = date.today()
            seller_company_name = "Test Co"
            seller_trading_name = None
            seller_address_street = None
            seller_address_postal_code = None
            seller_address_city = None
            seller_address_country = None
            seller_kvk_number = None
            seller_btw_number = None
            seller_iban = None
            seller_email = None
            seller_phone = None
            customer_name = "Customer"
            customer_address_street = None
            customer_address_postal_code = None
            customer_address_city = None
            customer_address_country = None
            customer_kvk_number = None
            customer_btw_number = None
            subtotal_cents = 100000
            vat_total_cents = 21000
            total_cents = 121000
            notes = None
            lines = []
        
        class MockLine:
            description = "Test item"
            quantity = Decimal("1")
            unit_price_cents = 100000
            vat_rate = Decimal("21")
            line_total_cents = 100000
            vat_amount_cents = 21000
        
        invoice = MockInvoice()
        invoice.lines = [MockLine()]
        
        # Generate HTML
        html = generate_invoice_html(invoice)
        
        # Verify totals use proper HTML structure with CSS classes
        assert '<div class="totals-row total">' in html, "Totals should use CSS class"
        assert '<span>Totaal</span>' in html, "Total label should be plain text in span"
        
        # Verify no escaped or inline HTML in values
        assert "<b>Totaal</b>" not in html, "Should not have inline <b> tags in total label"
        assert "&lt;b&gt;" not in html, "Should not have HTML-encoded tags"

