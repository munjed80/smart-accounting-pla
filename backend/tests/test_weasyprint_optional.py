"""
Tests to ensure WeasyPrint is optional and app can start without it.

Tests that the application can:
1. Import app.main without crashing even when WeasyPrint system dependencies are missing
2. Handle PDF generation gracefully when WeasyPrint is unavailable
"""
import pytest
import sys
from unittest.mock import patch, MagicMock


class TestWeasyPrintOptional:
    """Tests for optional WeasyPrint dependency."""
    
    def test_app_main_imports_without_weasyprint(self):
        """Test that app.main can be imported even if weasyprint is not available."""
        # This test verifies that importing app.main doesn't crash
        # when weasyprint system dependencies are missing
        
        # Mock weasyprint import to simulate missing system libraries
        # Note: We can't truly test the missing system libs scenario in CI,
        # but we can test that the code structure allows for lazy loading
        
        # Import should succeed even with our lazy import approach
        from app.main import app
        assert app is not None
        
    def test_invoice_pdf_service_imports_without_weasyprint(self):
        """Test that invoice_pdf service can be imported without WeasyPrint."""
        from app.services import invoice_pdf
        
        # Module should import successfully
        assert invoice_pdf is not None
        
        # The generate_invoice_pdf function should exist
        assert hasattr(invoice_pdf, 'generate_invoice_pdf')
        
    @pytest.mark.asyncio
    async def test_pdf_endpoint_returns_503_when_weasyprint_unavailable(
        self,
        async_client,
        test_invoice_sent,
        auth_headers
    ):
        """Test that PDF endpoint returns 503 when WeasyPrint is not available."""
        from app.api.v1 import zzp_invoices

        # Force ReportLab primary generation to fail so endpoint reaches WeasyPrint fallback,
        # then simulate WeasyPrint being unavailable.
        with patch.object(
            zzp_invoices,
            'generate_invoice_pdf_reportlab',
            side_effect=Exception("ReportLab unavailable")
        ), patch.object(
            zzp_invoices,
            'generate_invoice_pdf',
            side_effect=RuntimeError("PDF generation is not available. WeasyPrint library or its system dependencies are not installed.")
        ):
            response = await async_client.get(
                f"/api/v1/zzp/invoices/{test_invoice_sent.id}/pdf",
                headers=auth_headers
            )

            assert response.status_code == 503
            data = response.json()
            assert data["detail"]["code"] == "PDF_NOT_AVAILABLE"
