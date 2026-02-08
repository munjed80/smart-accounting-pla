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
        with patch('app.services.invoice_pdf.WEASYPRINT_AVAILABLE', True):
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
        
        with patch('app.services.invoice_pdf.WEASYPRINT_AVAILABLE', True):
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
        with patch('app.api.v1.zzp_invoices.WEASYPRINT_AVAILABLE', False):
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


# Pytest fixtures for test invoices
# Note: In a real test setup, these would be defined in conftest.py
# with database transactions for proper test isolation.

@pytest.fixture
def test_invoice_draft(test_user, test_administration, test_customer, db_session):
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
    db_session.commit()
    db_session.refresh(invoice)
    return invoice


@pytest.fixture
def test_invoice_sent(test_user, test_administration, test_customer, db_session):
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
    db_session.commit()
    db_session.refresh(invoice)
    return invoice


@pytest.fixture
def test_invoice_paid(test_user, test_administration, test_customer, db_session):
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
    db_session.commit()
    db_session.refresh(invoice)
    return invoice


@pytest.fixture
def test_invoice_cancelled(test_user, test_administration, test_customer, db_session):
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
    db_session.commit()
    db_session.refresh(invoice)
    return invoice


@pytest.fixture
def test_customer(test_administration, db_session):
    """Create a test customer for invoice tests."""
    customer = ZZPCustomer(
        administration_id=test_administration.id,
        name="Test Customer B.V.",
        email="customer@test.nl",
        status="active",
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    return customer
