"""
Tests for XML Signing Service

Tests the signing service, including:
- XML signing with certificates
- Signature verification
- Error handling
"""
import pytest
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, MagicMock
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
import xml.etree.ElementTree as ET

from app.services.signing_service import SigningService, SigningError
from app.services.certificate_service import CertificateError


def generate_test_certificate():
    """Generate a test self-signed certificate for testing purposes."""
    # Generate private key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    
    # Create certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "NL"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "PKIoverheid Test"),
        x509.NameAttribute(NameOID.COMMON_NAME, "test.pkioverheid.nl"),
    ])
    
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .sign(private_key, hashes.SHA256(), backend=default_backend())
    )
    
    return cert, private_key


@pytest.mark.asyncio
async def test_canonicalize_xml(db_session):
    """Test XML canonicalization."""
    service = SigningService(db_session)
    
    xml_content = """
    <root>
        <element>value</element>
    </root>
    """
    
    root = ET.fromstring(xml_content)
    canonical = service._canonicalize_xml(root)
    
    # Should be canonicalized (whitespace normalized)
    assert isinstance(canonical, str)
    assert len(canonical) > 0


@pytest.mark.asyncio
async def test_sign_xml_invalid_xml(db_session):
    """Test signing fails with invalid XML."""
    service = SigningService(db_session)
    
    invalid_xml = "not xml at all"
    cert_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    
    # Mock the certificate service to return a certificate
    with patch.object(service.cert_service, 'load_certificate_for_signing') as mock_load:
        cert, key = generate_test_certificate()
        mock_load.return_value = (cert, key)
        
        with pytest.raises(SigningError, match="Invalid XML"):
            await service.sign_xml(invalid_xml, cert_id, admin_id)


@pytest.mark.asyncio
async def test_sign_xml_certificate_error(db_session):
    """Test signing fails when certificate cannot be loaded."""
    service = SigningService(db_session)
    
    xml_content = "<root><element>value</element></root>"
    cert_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    
    # Mock the certificate service to raise error
    with patch.object(service.cert_service, 'load_certificate_for_signing') as mock_load:
        mock_load.side_effect = CertificateError("Certificate not found")
        
        with pytest.raises(CertificateError):
            await service.sign_xml(xml_content, cert_id, admin_id)


@pytest.mark.asyncio
async def test_sign_xml_success(db_session):
    """Test successful XML signing."""
    service = SigningService(db_session)
    
    xml_content = "<root><element>value</element></root>"
    cert_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    
    # Generate test certificate
    cert, key = generate_test_certificate()
    
    # Mock the certificate service
    with patch.object(service.cert_service, 'load_certificate_for_signing') as mock_load:
        mock_load.return_value = (cert, key)
        
        # Sign the XML
        signed_xml, signature_info = await service.sign_xml(xml_content, cert_id, admin_id)
        
        # Verify signature info
        assert 'algorithm' in signature_info
        assert signature_info['algorithm'] == 'RSA-SHA256'
        assert 'digest_method' in signature_info
        assert signature_info['digest_method'] == 'SHA256'
        assert 'digest_value' in signature_info
        assert 'signature_value' in signature_info
        assert 'certificate_fingerprint' in signature_info
        assert 'certificate_subject' in signature_info
        assert 'certificate_issuer' in signature_info
        assert 'signature_timestamp' in signature_info
        
        # Verify signed XML contains signature
        assert '<ds:Signature' in signed_xml or 'Signature' in signed_xml
        assert 'SignatureValue' in signed_xml
        assert 'DigestValue' in signed_xml


@pytest.mark.asyncio
async def test_embed_signature(db_session):
    """Test embedding signature in XML."""
    service = SigningService(db_session)
    
    xml_content = "<root><element>value</element></root>"
    root = ET.fromstring(xml_content)
    
    signature_b64 = "dGVzdF9zaWduYXR1cmU="  # base64 of "test_signature"
    digest_b64 = "dGVzdF9kaWdlc3Q="  # base64 of "test_digest"
    cert_b64 = "dGVzdF9jZXJ0aWZpY2F0ZQ=="  # base64 of "test_certificate"
    
    signature_info = {
        'algorithm': 'RSA-SHA256',
        'digest_method': 'SHA256',
        'signature_timestamp': datetime.now(timezone.utc).isoformat(),
        'certificate_fingerprint': 'abc123',
    }
    
    # Embed signature
    signed_xml = service._embed_signature(
        root,
        signature_b64,
        digest_b64,
        cert_b64,
        signature_info
    )
    
    # Verify signature elements are present
    assert 'Signature' in signed_xml
    assert 'SignatureValue' in signed_xml
    assert 'DigestValue' in signed_xml
    assert 'X509Certificate' in signed_xml
    assert signature_b64 in signed_xml
    assert digest_b64 in signed_xml
    assert cert_b64 in signed_xml


@pytest.mark.asyncio
async def test_verify_signature_valid(db_session):
    """Test signature verification returns True for valid signature."""
    service = SigningService(db_session)
    
    # Create a signed XML with signature elements
    signed_xml = """<?xml version="1.0"?>
    <root>
        <element>value</element>
        <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
            <ds:SignatureValue>dGVzdF9zaWduYXR1cmU=</ds:SignatureValue>
            <ds:SignedInfo>
                <ds:Reference>
                    <ds:DigestValue>dGVzdF9kaWdlc3Q=</ds:DigestValue>
                </ds:Reference>
            </ds:SignedInfo>
        </ds:Signature>
    </root>"""
    
    # Verify (basic check - just checks elements are present)
    result = service.verify_signature(signed_xml)
    assert result is True


@pytest.mark.asyncio
async def test_verify_signature_invalid_missing_signature(db_session):
    """Test signature verification returns False for missing signature."""
    service = SigningService(db_session)
    
    # XML without signature
    unsigned_xml = "<root><element>value</element></root>"
    
    result = service.verify_signature(unsigned_xml)
    assert result is False


@pytest.mark.asyncio
async def test_verify_signature_invalid_empty_signature(db_session):
    """Test signature verification returns False for empty signature values."""
    service = SigningService(db_session)
    
    # Signed XML with empty signature values
    signed_xml = """<?xml version="1.0"?>
    <root>
        <element>value</element>
        <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
            <ds:SignatureValue></ds:SignatureValue>
            <ds:SignedInfo>
                <ds:Reference>
                    <ds:DigestValue></ds:DigestValue>
                </ds:Reference>
            </ds:SignedInfo>
        </ds:Signature>
    </root>"""
    
    result = service.verify_signature(signed_xml)
    assert result is False


@pytest.mark.asyncio
async def test_verify_signature_invalid_xml(db_session):
    """Test signature verification returns False for invalid XML."""
    service = SigningService(db_session)
    
    invalid_xml = "not xml at all"
    
    result = service.verify_signature(invalid_xml)
    assert result is False
