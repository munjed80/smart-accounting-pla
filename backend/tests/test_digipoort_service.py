"""
Tests for DigipoortService

Tests cover:
- SOAP envelope building
- Signed XML attachment as MIME multipart
- Sandbox submission simulation
- Response parsing
"""
import pytest
import uuid
from datetime import datetime


class TestDigipoortServiceImport:
    """Test that DigipoortService can be imported."""
    
    def test_service_can_be_imported(self):
        """Test that DigipoortService can be imported."""
        from app.services.digipoort_service import DigipoortService
        assert DigipoortService is not None
    
    def test_submission_result_can_be_imported(self):
        """Test that SubmissionResult can be imported."""
        from app.services.digipoort_service import SubmissionResult
        assert SubmissionResult is not None
    
    def test_digipoort_status_enum_exists(self):
        """Test that DigipoortStatus enum exists."""
        from app.services.digipoort_service import DigipoortStatus
        assert DigipoortStatus.QUEUED.value == "QUEUED"
        assert DigipoortStatus.SENT.value == "SENT"
        assert DigipoortStatus.ACCEPTED.value == "ACCEPTED"
        assert DigipoortStatus.REJECTED.value == "REJECTED"


class TestSoapEnvelopeBuilding:
    """Test SOAP envelope construction."""
    
    def test_build_soap_envelope_basic(self):
        """Test basic SOAP envelope building."""
        from app.services.digipoort_service import DigipoortService
        
        service = DigipoortService(sandbox_mode=True)
        
        administration_id = uuid.uuid4()
        period_id = uuid.uuid4()
        correlation_id = str(uuid.uuid4())
        
        envelope = service.build_soap_envelope(
            submission_type="BTW",
            administration_id=administration_id,
            period_id=period_id,
            correlation_id=correlation_id,
        )
        
        # Check that it's valid XML
        assert envelope.startswith('<?xml version="1.0"')
        assert 'soap:Envelope' in envelope or 'Envelope' in envelope
        assert correlation_id in envelope
        assert str(administration_id) in envelope
        assert str(period_id) in envelope
    
    def test_soap_envelope_has_required_namespaces(self):
        """Test that SOAP envelope has required namespaces."""
        from app.services.digipoort_service import DigipoortService
        
        service = DigipoortService(sandbox_mode=True)
        
        envelope = service.build_soap_envelope(
            submission_type="BTW",
            administration_id=uuid.uuid4(),
            period_id=uuid.uuid4(),
            correlation_id=str(uuid.uuid4()),
        )
        
        # Check for SOAP 1.2 namespace
        assert 'http://www.w3.org/2003/05/soap-envelope' in envelope
        # Check for WS-Addressing
        assert 'http://www.w3.org/2005/08/addressing' in envelope
        # Check for Digipoort namespace
        assert 'belastingdienst.nl/digipoort' in envelope
    
    def test_soap_envelope_has_ws_addressing_headers(self):
        """Test that SOAP envelope has WS-Addressing headers."""
        from app.services.digipoort_service import DigipoortService
        
        service = DigipoortService(sandbox_mode=True)
        
        correlation_id = str(uuid.uuid4())
        envelope = service.build_soap_envelope(
            submission_type="BTW",
            administration_id=uuid.uuid4(),
            period_id=uuid.uuid4(),
            correlation_id=correlation_id,
        )
        
        # Check for WS-Addressing headers
        assert 'Action' in envelope
        assert 'MessageID' in envelope
        assert 'To' in envelope
        assert f'urn:uuid:{correlation_id}' in envelope


class TestMimeAttachment:
    """Test MIME multipart attachment of signed XML."""
    
    def test_attach_signed_xml_creates_multipart(self):
        """Test that signed XML is attached as MIME multipart."""
        from app.services.digipoort_service import DigipoortService
        
        service = DigipoortService(sandbox_mode=True)
        
        soap_envelope = '<?xml version="1.0"?><soap:Envelope></soap:Envelope>'
        signed_xml = '<?xml version="1.0"?><signed-xml></signed-xml>'
        
        mime_message, content_type = service.attach_signed_xml(
            soap_envelope=soap_envelope,
            signed_xml=signed_xml,
        )
        
        # Check content type
        assert 'multipart/related' in content_type
        assert 'boundary=' in content_type
        
        # Check MIME structure
        assert '--' in mime_message
        assert 'Content-Type: application/soap+xml' in mime_message
        assert 'Content-Type: application/xml' in mime_message
        assert soap_envelope in mime_message
        assert signed_xml in mime_message
    
    def test_mime_parts_have_content_ids(self):
        """Test that MIME parts have Content-ID headers."""
        from app.services.digipoort_service import DigipoortService
        
        service = DigipoortService(sandbox_mode=True)
        
        mime_message, _ = service.attach_signed_xml(
            soap_envelope='<soap/>',
            signed_xml='<signed/>',
        )
        
        # Check for Content-ID headers
        assert 'Content-ID: <soap-envelope>' in mime_message
        assert 'Content-ID: <signed-xml-attachment>' in mime_message


class TestSandboxSubmission:
    """Test sandbox submission simulation."""
    
    def test_simulate_sandbox_submission_returns_result(self):
        """Test that sandbox submission returns SubmissionResult."""
        from app.services.digipoort_service import DigipoortService, DigipoortStatus
        
        service = DigipoortService(sandbox_mode=True)
        
        correlation_id = str(uuid.uuid4())
        result = service.simulate_sandbox_submission(
            mime_message="test message content",
            correlation_id=correlation_id,
            submission_type="BTW",
        )
        
        # Check result
        assert result is not None
        assert result.correlation_id == correlation_id
        assert result.message_id is not None
        assert result.status == DigipoortStatus.ACCEPTED
        assert result.status_code == "OK"
    
    def test_sandbox_result_has_realistic_metadata(self):
        """Test that sandbox result has realistic metadata."""
        from app.services.digipoort_service import DigipoortService
        
        service = DigipoortService(sandbox_mode=True)
        
        result = service.simulate_sandbox_submission(
            mime_message="test message",
            correlation_id=str(uuid.uuid4()),
            submission_type="BTW",
        )
        
        # Check metadata structure
        assert result.response_metadata is not None
        assert result.response_metadata['mode'] == 'SANDBOX'
        assert 'message_size_bytes' in result.response_metadata
        assert 'message_hash' in result.response_metadata
        assert 'ontvangstbevestiging' in result.response_metadata
        assert 'verwerkingsstatus' in result.response_metadata
    
    def test_sandbox_result_to_dict(self):
        """Test that SubmissionResult can be converted to dict."""
        from app.services.digipoort_service import DigipoortService
        
        service = DigipoortService(sandbox_mode=True)
        
        result = service.simulate_sandbox_submission(
            mime_message="test",
            correlation_id=str(uuid.uuid4()),
            submission_type="BTW",
        )
        
        result_dict = result.to_dict()
        
        assert isinstance(result_dict, dict)
        assert 'correlation_id' in result_dict
        assert 'message_id' in result_dict
        assert 'status' in result_dict
        assert 'timestamp' in result_dict


class TestResponseParsing:
    """Test response parsing."""
    
    def test_parse_sandbox_response(self):
        """Test parsing of sandbox response."""
        from app.services.digipoort_service import DigipoortService
        
        service = DigipoortService(sandbox_mode=True)
        
        result = service.simulate_sandbox_submission(
            mime_message="test",
            correlation_id=str(uuid.uuid4()),
            submission_type="BTW",
        )
        
        parsed = service.parse_sandbox_response(result)
        
        # Check parsed structure
        assert isinstance(parsed, dict)
        assert parsed['success'] is True
        assert parsed['error'] is False
        assert parsed['status'] == 'ACCEPTED'
        assert 'metadata' in parsed


class TestDigipoortIntegration:
    """Test full Digipoort integration flow."""
    
    @pytest.mark.asyncio
    async def test_submit_to_digipoort_sandbox_mode(self):
        """Test full submission in sandbox mode."""
        from app.services.digipoort_service import DigipoortService, DigipoortStatus
        
        service = DigipoortService(sandbox_mode=True)
        
        signed_xml = '<?xml version="1.0"?><btw-aangifte></btw-aangifte>'
        administration_id = uuid.uuid4()
        period_id = uuid.uuid4()
        correlation_id = str(uuid.uuid4())
        
        result = await service.submit_to_digipoort(
            signed_xml=signed_xml,
            submission_type="BTW",
            administration_id=administration_id,
            period_id=period_id,
            correlation_id=correlation_id,
        )
        
        # Check result
        assert result is not None
        assert result.status == DigipoortStatus.ACCEPTED
        assert result.message_id is not None
        assert result.correlation_id == correlation_id
    
    @pytest.mark.asyncio
    async def test_submit_to_digipoort_production_not_implemented(self):
        """Test that production mode raises NotImplementedError."""
        from app.services.digipoort_service import DigipoortService
        
        service = DigipoortService(sandbox_mode=False)
        
        with pytest.raises(NotImplementedError, match="Production Digipoort submission not yet implemented"):
            await service.submit_to_digipoort(
                signed_xml="<xml/>",
                submission_type="BTW",
                administration_id=uuid.uuid4(),
                period_id=uuid.uuid4(),
                correlation_id=str(uuid.uuid4()),
            )


class TestDigipoortConfiguration:
    """Test Digipoort service configuration."""
    
    def test_sandbox_mode_default_true(self):
        """Test that sandbox mode defaults to True."""
        from app.services.digipoort_service import DigipoortService
        
        service = DigipoortService()
        assert service.sandbox_mode is True
    
    def test_sandbox_mode_can_be_set(self):
        """Test that sandbox mode can be configured."""
        from app.services.digipoort_service import DigipoortService
        
        service_sandbox = DigipoortService(sandbox_mode=True)
        service_prod = DigipoortService(sandbox_mode=False)
        
        assert service_sandbox.sandbox_mode is True
        assert service_prod.sandbox_mode is False
