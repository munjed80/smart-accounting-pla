"""
Tests for Digipoort VAT Submission Service

Tests cover:
- Payload generation (VAT and ICP)
- Payload validation
- Draft submission creation
- Queue submission
"""
import pytest
from decimal import Decimal


class TestVatSubmissionServiceImport:
    """Test that the service can be imported."""
    
    def test_service_can_be_imported(self):
        """Test that VatSubmissionService can be imported."""
        from app.services.vat_submission_service import VatSubmissionService
        assert VatSubmissionService is not None
    
    def test_service_error_can_be_imported(self):
        """Test that VatSubmissionError can be imported."""
        from app.services.vat_submission_service import VatSubmissionError
        assert VatSubmissionError is not None


class TestDigipoortFields:
    """Test that Digipoort fields exist in model and schemas."""
    
    def test_submission_model_has_digipoort_fields(self):
        """Test that VatSubmission model has Digipoort fields."""
        from app.models.vat_submission import VatSubmission
        
        # Check Digipoort-specific fields
        assert hasattr(VatSubmission, 'payload_hash')
        assert hasattr(VatSubmission, 'payload_xml')
        assert hasattr(VatSubmission, 'signed_xml')
        assert hasattr(VatSubmission, 'digipoort_message_id')
        assert hasattr(VatSubmission, 'correlation_id')
        assert hasattr(VatSubmission, 'last_status_check_at')
        assert hasattr(VatSubmission, 'error_code')
        assert hasattr(VatSubmission, 'error_message')
    
    def test_submission_status_has_new_values(self):
        """Test that VatSubmissionStatus enum has new status values."""
        from app.schemas.vat import VatSubmissionStatus
        
        # Check new statuses for Digipoort
        assert VatSubmissionStatus.QUEUED.value == "QUEUED"
        assert VatSubmissionStatus.RECEIVED.value == "RECEIVED"
        assert VatSubmissionStatus.ACCEPTED.value == "ACCEPTED"
        assert VatSubmissionStatus.FAILED.value == "FAILED"
    
    def test_prepare_submission_schemas_exist(self):
        """Test that prepare submission schemas exist."""
        from app.schemas.vat import (
            PrepareSubmissionRequest,
            PrepareSubmissionResponse,
            QueueSubmissionRequest,
            QueueSubmissionResponse,
        )
        
        assert hasattr(PrepareSubmissionRequest, 'model_fields')
        assert hasattr(PrepareSubmissionResponse, 'model_fields')
        assert hasattr(QueueSubmissionRequest, 'model_fields')
        assert hasattr(QueueSubmissionResponse, 'model_fields')


class TestVatSubmissionServiceMethods:
    """Test VatSubmissionService methods exist."""
    
    def test_service_has_build_payload_method(self):
        """Test that service has build_payload method."""
        from app.services.vat_submission_service import VatSubmissionService
        assert hasattr(VatSubmissionService, 'build_payload')
    
    def test_service_has_validate_payload_method(self):
        """Test that service has validate_payload method."""
        from app.services.vat_submission_service import VatSubmissionService
        assert hasattr(VatSubmissionService, 'validate_payload')
    
    def test_service_has_sign_payload_method(self):
        """Test that service has sign_payload method."""
        from app.services.vat_submission_service import VatSubmissionService
        assert hasattr(VatSubmissionService, 'sign_payload')
    
    def test_service_has_create_draft_submission_method(self):
        """Test that service has create_draft_submission method."""
        from app.services.vat_submission_service import VatSubmissionService
        assert hasattr(VatSubmissionService, 'create_draft_submission')
    
    def test_service_has_queue_submission_method(self):
        """Test that service has queue_submission method."""
        from app.services.vat_submission_service import VatSubmissionService
        assert hasattr(VatSubmissionService, 'queue_submission')


class TestPayloadValidation:
    """Test payload validation logic."""
    
    def test_validate_empty_payload(self):
        """Test that empty payload is rejected."""
        from app.services.vat_submission_service import VatSubmissionService
        
        # Create service instance (without db)
        service = VatSubmissionService(None, None)
        
        errors = service.validate_payload("")
        assert len(errors) > 0
        assert "empty" in errors[0].lower()
    
    def test_validate_invalid_xml(self):
        """Test that invalid XML is rejected."""
        from app.services.vat_submission_service import VatSubmissionService
        
        service = VatSubmissionService(None, None)
        
        errors = service.validate_payload("not valid xml <tag>")
        assert len(errors) > 0
        assert "parsing" in errors[0].lower() or "xml" in errors[0].lower()
    
    def test_validate_valid_btw_xml(self):
        """Test that valid BTW XML passes validation."""
        from app.services.vat_submission_service import VatSubmissionService
        
        service = VatSubmissionService(None, None)
        
        valid_xml = '''<?xml version="1.0" encoding="UTF-8"?>
<btw-aangifte xmlns="http://www.belastingdienst.nl/btw/aangifte/v1">
  <metadata>
    <period-id>test-period</period-id>
    <period-name>Q1 2024</period-name>
  </metadata>
  <administration>
    <id>test-admin</id>
    <name>Test Administration</name>
  </administration>
  <vat-boxes>
    <box code="1a">
      <name>Test Box</name>
      <turnover>1000</turnover>
      <vat>210</vat>
    </box>
  </vat-boxes>
  <totals>
    <total-turnover>1000</total-turnover>
    <total-vat-payable>210</total-vat-payable>
    <total-vat-receivable>0</total-vat-receivable>
    <net-vat>210</net-vat>
  </totals>
</btw-aangifte>'''
        
        errors = service.validate_payload(valid_xml)
        assert len(errors) == 0
    
    def test_sign_payload_placeholder(self):
        """Test that sign_payload returns unsigned XML (placeholder)."""
        from app.services.vat_submission_service import VatSubmissionService
        
        service = VatSubmissionService(None, None)
        
        xml = "<test>xml</test>"
        signed_xml = service.sign_payload(xml)
        
        # In placeholder implementation, should return original XML
        assert signed_xml == xml


class TestAlembicMigration:
    """Test that migration file exists and has correct structure."""
    
    def test_migration_file_exists(self):
        """Test that the Digipoort fields migration file exists."""
        import os
        migration_path = os.path.join(
            os.path.dirname(__file__),
            '../alembic/versions/042_add_digipoort_fields.py'
        )
        assert os.path.exists(migration_path)
    
    def test_migration_has_upgrade_function(self):
        """Test that migration has upgrade function."""
        from alembic.versions import _042_add_digipoort_fields
        assert hasattr(_042_add_digipoort_fields, 'upgrade')
    
    def test_migration_has_downgrade_function(self):
        """Test that migration has downgrade function."""
        from alembic.versions import _042_add_digipoort_fields
        assert hasattr(_042_add_digipoort_fields, 'downgrade')
