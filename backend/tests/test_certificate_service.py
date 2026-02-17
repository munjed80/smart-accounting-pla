"""
Tests for Certificate Management

Tests the certificate service, including:
- Certificate registration
- Certificate validation
- Certificate listing
- Certificate deletion
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

from app.services.certificate_service import (
    CertificateService,
    CertificateError,
    CertificateNotFoundError,
    CertificateLoadError,
    CertificateValidationError,
)
from app.models.certificate import Certificate
from app.models.administration import Administration
from app.models.user import User
from app.core.roles import UserRole


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
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Noord-Holland"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "Amsterdam"),
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
async def test_certificate_metadata_extraction(db_session):
    """Test extracting metadata from a certificate."""
    # Create test certificate
    cert, private_key = generate_test_certificate()
    
    # Create certificate service
    service = CertificateService(db_session)
    
    # Extract metadata
    metadata = service._extract_certificate_metadata(cert)
    
    # Verify metadata
    assert 'fingerprint' in metadata
    assert len(metadata['fingerprint']) == 64  # SHA256 hex digest
    assert 'subject' in metadata
    assert 'PKIoverheid Test' in metadata['subject']
    assert 'issuer' in metadata
    assert 'serial_number' in metadata
    assert 'valid_from' in metadata
    assert 'valid_to' in metadata
    assert isinstance(metadata['valid_from'], datetime)
    assert isinstance(metadata['valid_to'], datetime)


@pytest.mark.asyncio
async def test_certificate_validation_pki_overheid(db_session):
    """Test PKIoverheid certificate validation."""
    # Create test certificate
    cert, private_key = generate_test_certificate()
    
    # Create certificate service
    service = CertificateService(db_session)
    
    # Extract metadata
    metadata = service._extract_certificate_metadata(cert)
    
    # Validate certificate (should pass because issuer contains "PKIoverheid")
    service._validate_pki_overheid(cert, metadata)


@pytest.mark.asyncio
async def test_certificate_validation_expired(db_session):
    """Test validation fails for expired certificate."""
    # Create certificate service
    service = CertificateService(db_session)
    
    # Create expired certificate (valid_to in the past)
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "PKIoverheid Test"),
        x509.NameAttribute(NameOID.COMMON_NAME, "expired.pkioverheid.nl"),
    ])
    
    # Create certificate that expired yesterday
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc) - timedelta(days=366))
        .not_valid_after(datetime.now(timezone.utc) - timedelta(days=1))
        .sign(private_key, hashes.SHA256(), backend=default_backend())
    )
    
    # Extract metadata
    metadata = service._extract_certificate_metadata(cert)
    
    # Validation should fail due to expiration
    with pytest.raises(CertificateValidationError, match="expired"):
        service._validate_pki_overheid(cert, metadata)


@pytest.mark.asyncio
async def test_certificate_validation_non_pki_issuer(db_session):
    """Test validation fails for non-PKIoverheid certificate."""
    # Create certificate service
    service = CertificateService(db_session)
    
    # Create certificate with non-PKIoverheid issuer
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Random CA"),
        x509.NameAttribute(NameOID.COMMON_NAME, "random.example.com"),
    ])
    
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
        .sign(private_key, hashes.SHA256(), backend=default_backend())
    )
    
    # Extract metadata
    metadata = service._extract_certificate_metadata(cert)
    
    # Validation should fail due to non-PKIoverheid issuer
    with pytest.raises(CertificateValidationError, match="not recognized"):
        service._validate_pki_overheid(cert, metadata)


@pytest.mark.asyncio
async def test_register_certificate_no_administration(db_session):
    """Test certificate registration fails if administration doesn't exist."""
    service = CertificateService(db_session)
    
    fake_admin_id = uuid.uuid4()
    fake_user_id = uuid.uuid4()
    
    with pytest.raises(CertificateError, match="Administration not found"):
        await service.register_certificate(
            administration_id=fake_admin_id,
            user_id=fake_user_id,
            cert_type="PKI_OVERHEID",
            storage_ref="/tmp/test-cert.pfx",
            passphrase_ref=None,
        )


@pytest.mark.asyncio
async def test_list_certificates_empty(db_session):
    """Test listing certificates returns empty list when none exist."""
    # Create test administration and user
    admin = Administration(
        id=uuid.uuid4(),
        name="Test Admin",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(admin)
    await db_session.commit()
    
    service = CertificateService(db_session)
    certificates = await service.list_certificates(admin.id)
    
    assert certificates == []


@pytest.mark.asyncio
async def test_get_certificate_not_found(db_session):
    """Test getting non-existent certificate raises error."""
    # Create test administration
    admin = Administration(
        id=uuid.uuid4(),
        name="Test Admin",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(admin)
    await db_session.commit()
    
    service = CertificateService(db_session)
    fake_cert_id = uuid.uuid4()
    
    with pytest.raises(CertificateNotFoundError):
        await service.get_certificate(fake_cert_id, admin.id)


@pytest.mark.asyncio
async def test_delete_certificate_not_found(db_session):
    """Test deleting non-existent certificate raises error."""
    # Create test administration
    admin = Administration(
        id=uuid.uuid4(),
        name="Test Admin",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(admin)
    await db_session.commit()
    
    service = CertificateService(db_session)
    fake_cert_id = uuid.uuid4()
    
    with pytest.raises(CertificateNotFoundError):
        await service.delete_certificate(fake_cert_id, admin.id)


@pytest.mark.asyncio
async def test_resolve_storage_ref_direct_path(db_session):
    """Test resolving direct filesystem path."""
    service = CertificateService(db_session)
    
    path = "/secrets/cert.pfx"
    resolved = service._resolve_storage_ref(path)
    
    assert resolved == path


@pytest.mark.asyncio
async def test_resolve_storage_ref_env_var(db_session):
    """Test resolving environment variable reference."""
    service = CertificateService(db_session)
    
    # Mock environment variable
    with patch('os.getenv', return_value="/actual/path/to/cert.pfx"):
        resolved = service._resolve_storage_ref("$PKI_CERT_PATH")
        assert resolved == "/actual/path/to/cert.pfx"


@pytest.mark.asyncio
async def test_resolve_storage_ref_env_var_not_set(db_session):
    """Test resolving environment variable that's not set raises error."""
    service = CertificateService(db_session)
    
    # Mock environment variable not set
    with patch('os.getenv', return_value=None):
        with pytest.raises(CertificateLoadError, match="not set"):
            service._resolve_storage_ref("$PKI_CERT_PATH")


@pytest.mark.asyncio
async def test_certificate_is_valid(db_session):
    """Test Certificate.is_valid() method."""
    # Create certificate that's currently valid
    cert = Certificate(
        id=uuid.uuid4(),
        administration_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        type="PKI_OVERHEID",
        storage_ref="/tmp/cert.pfx",
        fingerprint="abc123",
        subject="CN=test",
        issuer="CN=PKIoverheid",
        serial_number="123",
        valid_from=datetime.now(timezone.utc) - timedelta(days=1),
        valid_to=datetime.now(timezone.utc) + timedelta(days=365),
        is_active=True,
    )
    
    assert cert.is_valid() is True


@pytest.mark.asyncio
async def test_certificate_is_not_valid_expired(db_session):
    """Test Certificate.is_valid() returns False for expired certificate."""
    # Create expired certificate
    cert = Certificate(
        id=uuid.uuid4(),
        administration_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        type="PKI_OVERHEID",
        storage_ref="/tmp/cert.pfx",
        fingerprint="abc123",
        subject="CN=test",
        issuer="CN=PKIoverheid",
        serial_number="123",
        valid_from=datetime.now(timezone.utc) - timedelta(days=366),
        valid_to=datetime.now(timezone.utc) - timedelta(days=1),
        is_active=True,
    )
    
    assert cert.is_valid() is False


@pytest.mark.asyncio
async def test_certificate_is_not_valid_inactive(db_session):
    """Test Certificate.is_valid() returns False for inactive certificate."""
    # Create inactive certificate
    cert = Certificate(
        id=uuid.uuid4(),
        administration_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        type="PKI_OVERHEID",
        storage_ref="/tmp/cert.pfx",
        fingerprint="abc123",
        subject="CN=test",
        issuer="CN=PKIoverheid",
        serial_number="123",
        valid_from=datetime.now(timezone.utc) - timedelta(days=1),
        valid_to=datetime.now(timezone.utc) + timedelta(days=365),
        is_active=False,
    )
    
    assert cert.is_valid() is False


@pytest.mark.asyncio
async def test_certificate_days_until_expiry(db_session):
    """Test Certificate.days_until_expiry() method."""
    # Create certificate that expires in 30 days
    cert = Certificate(
        id=uuid.uuid4(),
        administration_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        type="PKI_OVERHEID",
        storage_ref="/tmp/cert.pfx",
        fingerprint="abc123",
        subject="CN=test",
        issuer="CN=PKIoverheid",
        serial_number="123",
        valid_from=datetime.now(timezone.utc) - timedelta(days=1),
        valid_to=datetime.now(timezone.utc) + timedelta(days=30),
        is_active=True,
    )
    
    days = cert.days_until_expiry()
    # Should be close to 30 (within 1 day due to test timing)
    assert 29 <= days <= 30
