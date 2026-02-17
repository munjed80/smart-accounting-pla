"""
Certificate Service

Handles PKI certificate management for signing VAT submissions.
Certificates and private keys are stored securely on the filesystem,
never in the database.
"""
import os
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple
from uuid import UUID

from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.serialization import pkcs12
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.certificate import Certificate
from app.models.administration import Administration


class CertificateError(Exception):
    """Base exception for certificate operations."""
    pass


class CertificateNotFoundError(CertificateError):
    """Certificate not found."""
    pass


class CertificateLoadError(CertificateError):
    """Error loading certificate from filesystem."""
    pass


class CertificateValidationError(CertificateError):
    """Certificate validation failed."""
    pass


class CertificateService:
    """
    Service for managing PKI certificates.
    
    Responsibilities:
    - Loading certificates from filesystem
    - Extracting certificate metadata
    - Validating certificates
    - Managing certificate lifecycle
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def register_certificate(
        self,
        administration_id: UUID,
        user_id: UUID,
        cert_type: str,
        storage_ref: str,
        passphrase_ref: Optional[str] = None,
        friendly_name: Optional[str] = None,
        purpose: Optional[str] = None,
    ) -> Certificate:
        """
        Register a new certificate in the database.
        
        This method:
        1. Loads the certificate from the filesystem using storage_ref
        2. Extracts metadata (fingerprint, subject, issuer, validity)
        3. Validates the certificate is valid PKIoverheid format
        4. Stores metadata in database (NOT the certificate/key itself)
        
        Args:
            administration_id: Administration owning this certificate
            user_id: User registering the certificate
            cert_type: Certificate type (e.g., "PKI_OVERHEID")
            storage_ref: Reference to certificate file location
            passphrase_ref: Reference to passphrase (optional)
            friendly_name: User-friendly name (optional)
            purpose: Purpose of certificate (optional)
            
        Returns:
            Certificate: Created certificate record
            
        Raises:
            CertificateLoadError: If certificate cannot be loaded
            CertificateValidationError: If certificate is invalid
        """
        # Verify administration exists
        result = await self.db.execute(
            select(Administration).where(Administration.id == administration_id)
        )
        administration = result.scalar_one_or_none()
        if not administration:
            raise CertificateError("Administration not found")
        
        # Load and validate certificate from filesystem
        cert_data, private_key = await self._load_certificate_from_ref(
            storage_ref, passphrase_ref
        )
        
        # Extract metadata from certificate
        metadata = self._extract_certificate_metadata(cert_data)
        
        # Validate certificate is PKIoverheid format
        self._validate_pki_overheid(cert_data, metadata)
        
        # Check if certificate with same fingerprint already exists
        existing = await self.db.execute(
            select(Certificate).where(Certificate.fingerprint == metadata['fingerprint'])
        )
        if existing.scalar_one_or_none():
            raise CertificateError(f"Certificate with fingerprint {metadata['fingerprint']} already registered")
        
        # Create certificate record
        certificate = Certificate(
            administration_id=administration_id,
            created_by=user_id,
            type=cert_type,
            storage_ref=storage_ref,
            passphrase_ref=passphrase_ref,
            fingerprint=metadata['fingerprint'],
            subject=metadata['subject'],
            issuer=metadata['issuer'],
            serial_number=metadata['serial_number'],
            valid_from=metadata['valid_from'],
            valid_to=metadata['valid_to'],
            friendly_name=friendly_name,
            purpose=purpose,
            is_active=True,
        )
        
        self.db.add(certificate)
        await self.db.commit()
        await self.db.refresh(certificate)
        
        return certificate
    
    async def get_certificate(
        self,
        certificate_id: UUID,
        administration_id: UUID,
    ) -> Certificate:
        """
        Get certificate by ID.
        
        Args:
            certificate_id: Certificate ID
            administration_id: Administration ID (for tenant isolation)
            
        Returns:
            Certificate record
            
        Raises:
            CertificateNotFoundError: If certificate not found
        """
        result = await self.db.execute(
            select(Certificate)
            .where(Certificate.id == certificate_id)
            .where(Certificate.administration_id == administration_id)
            .where(Certificate.is_active == True)
        )
        certificate = result.scalar_one_or_none()
        if not certificate:
            raise CertificateNotFoundError(f"Certificate {certificate_id} not found")
        return certificate
    
    async def list_certificates(
        self,
        administration_id: UUID,
        include_expired: bool = False,
    ) -> list[Certificate]:
        """
        List all certificates for an administration.
        
        Args:
            administration_id: Administration ID
            include_expired: Whether to include expired certificates
            
        Returns:
            List of certificates
        """
        query = (
            select(Certificate)
            .where(Certificate.administration_id == administration_id)
            .where(Certificate.is_active == True)
            .order_by(Certificate.valid_to.desc())
        )
        
        if not include_expired:
            now = datetime.now(timezone.utc)
            query = query.where(Certificate.valid_to > now)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def delete_certificate(
        self,
        certificate_id: UUID,
        administration_id: UUID,
    ) -> None:
        """
        Soft delete a certificate.
        
        Args:
            certificate_id: Certificate ID
            administration_id: Administration ID (for tenant isolation)
            
        Raises:
            CertificateNotFoundError: If certificate not found
        """
        certificate = await self.get_certificate(certificate_id, administration_id)
        certificate.is_active = False
        await self.db.commit()
    
    async def load_certificate_for_signing(
        self,
        certificate_id: UUID,
        administration_id: UUID,
    ) -> Tuple[x509.Certificate, any]:
        """
        Load certificate and private key from filesystem for signing.
        
        This is used by the signing service to actually load the certificate
        and private key from secure storage for signing operations.
        
        Args:
            certificate_id: Certificate ID
            administration_id: Administration ID
            
        Returns:
            Tuple of (certificate, private_key)
            
        Raises:
            CertificateNotFoundError: If certificate not found
            CertificateLoadError: If certificate cannot be loaded from filesystem
        """
        certificate = await self.get_certificate(certificate_id, administration_id)
        
        # Verify certificate is still valid
        if not certificate.is_valid():
            raise CertificateValidationError(
                f"Certificate {certificate_id} is not valid "
                f"(expired or inactive)"
            )
        
        # Load actual certificate and key from filesystem
        cert_data, private_key = await self._load_certificate_from_ref(
            certificate.storage_ref,
            certificate.passphrase_ref
        )
        
        return cert_data, private_key
    
    async def _load_certificate_from_ref(
        self,
        storage_ref: str,
        passphrase_ref: Optional[str] = None,
    ) -> Tuple[x509.Certificate, any]:
        """
        Load certificate and private key from filesystem reference.
        
        Supports:
        - Direct file paths: "/secrets/cert.pfx"
        - Environment variables: "$PKI_CERT_PATH"
        - Coolify references: "coolify://cert-name" (maps to env var)
        
        Args:
            storage_ref: Reference to certificate file
            passphrase_ref: Reference to passphrase (optional)
            
        Returns:
            Tuple of (certificate, private_key)
            
        Raises:
            CertificateLoadError: If certificate cannot be loaded
        """
        try:
            # Resolve storage reference to actual file path
            file_path = self._resolve_storage_ref(storage_ref)
            
            # Resolve passphrase if provided
            passphrase = None
            if passphrase_ref:
                passphrase = self._resolve_passphrase_ref(passphrase_ref)
            
            # Check file exists
            if not os.path.exists(file_path):
                raise CertificateLoadError(f"Certificate file not found: {file_path}")
            
            # Read certificate file
            with open(file_path, 'rb') as f:
                cert_bytes = f.read()
            
            # Try to load as PKCS#12 (PFX) first
            try:
                private_key, certificate, _ = pkcs12.load_key_and_certificates(
                    cert_bytes,
                    passphrase.encode() if passphrase else None,
                    backend=default_backend()
                )
                return certificate, private_key
            except Exception:
                # If PKCS#12 fails, try PEM format
                try:
                    certificate = x509.load_pem_x509_certificate(
                        cert_bytes, backend=default_backend()
                    )
                    # For PEM, we need separate key file
                    # Assume key is in same directory with .key extension
                    key_path = str(Path(file_path).with_suffix('.key'))
                    if os.path.exists(key_path):
                        with open(key_path, 'rb') as kf:
                            key_bytes = kf.read()
                        private_key = serialization.load_pem_private_key(
                            key_bytes,
                            password=passphrase.encode() if passphrase else None,
                            backend=default_backend()
                        )
                        return certificate, private_key
                    else:
                        raise CertificateLoadError(
                            f"Private key file not found: {key_path}"
                        )
                except Exception as e:
                    raise CertificateLoadError(
                        f"Failed to load certificate in PEM format: {str(e)}"
                    )
        
        except CertificateLoadError:
            raise
        except Exception as e:
            raise CertificateLoadError(f"Error loading certificate: {str(e)}")
    
    def _resolve_storage_ref(self, storage_ref: str) -> str:
        """
        Resolve storage reference to actual file path.
        
        Supports:
        - Direct paths: "/secrets/cert.pfx"
        - Environment variables: "$PKI_CERT_PATH"
        - Coolify references: "coolify://cert" -> env var COOLIFY_CERT
        """
        if storage_ref.startswith('$'):
            # Environment variable reference
            env_var = storage_ref[1:]
            path = os.getenv(env_var)
            if not path:
                raise CertificateLoadError(
                    f"Environment variable {env_var} not set"
                )
            return path
        elif storage_ref.startswith('coolify://'):
            # Coolify secret reference
            secret_name = storage_ref.replace('coolify://', '')
            env_var = f"COOLIFY_{secret_name.upper().replace('-', '_')}"
            path = os.getenv(env_var)
            if not path:
                raise CertificateLoadError(
                    f"Coolify secret {secret_name} not found (env var {env_var} not set)"
                )
            return path
        else:
            # Direct file path
            return storage_ref
    
    def _resolve_passphrase_ref(self, passphrase_ref: str) -> str:
        """
        Resolve passphrase reference to actual passphrase.
        
        Similar to storage_ref resolution, supports env vars and Coolify secrets.
        """
        if passphrase_ref.startswith('$'):
            env_var = passphrase_ref[1:]
            passphrase = os.getenv(env_var)
            if not passphrase:
                raise CertificateLoadError(
                    f"Passphrase environment variable {env_var} not set"
                )
            return passphrase
        elif passphrase_ref.startswith('coolify://'):
            secret_name = passphrase_ref.replace('coolify://', '')
            env_var = f"COOLIFY_{secret_name.upper().replace('-', '_')}"
            passphrase = os.getenv(env_var)
            if not passphrase:
                raise CertificateLoadError(
                    f"Coolify passphrase secret {secret_name} not found"
                )
            return passphrase
        else:
            # Direct passphrase (not recommended but supported)
            return passphrase_ref
    
    def _extract_certificate_metadata(self, cert: x509.Certificate) -> dict:
        """
        Extract metadata from X.509 certificate.
        
        Returns:
            Dictionary with fingerprint, subject, issuer, serial_number,
            valid_from, valid_to
        """
        # Calculate SHA256 fingerprint
        fingerprint = hashlib.sha256(cert.public_bytes(
            encoding=serialization.Encoding.DER
        )).hexdigest()
        
        # Extract subject and issuer DNs
        subject = cert.subject.rfc4514_string()
        issuer = cert.issuer.rfc4514_string()
        
        # Get serial number
        serial_number = str(cert.serial_number)
        
        # Get validity dates
        valid_from = cert.not_valid_before_utc
        valid_to = cert.not_valid_after_utc
        
        return {
            'fingerprint': fingerprint,
            'subject': subject,
            'issuer': issuer,
            'serial_number': serial_number,
            'valid_from': valid_from,
            'valid_to': valid_to,
        }
    
    def _validate_pki_overheid(self, cert: x509.Certificate, metadata: dict) -> None:
        """
        Validate certificate is PKIoverheid format.
        
        PKIoverheid certificates must:
        - Be issued by a recognized Dutch CA
        - Have appropriate key usage for signing
        - Not be expired
        
        Raises:
            CertificateValidationError: If validation fails
        """
        # Check if certificate is expired
        now = datetime.now(timezone.utc)
        if metadata['valid_to'] < now:
            raise CertificateValidationError(
                f"Certificate expired on {metadata['valid_to']}"
            )
        if metadata['valid_from'] > now:
            raise CertificateValidationError(
                f"Certificate not yet valid (valid from {metadata['valid_from']})"
            )
        
        # Check issuer contains "PKIoverheid" or recognized Dutch CA
        issuer_lower = metadata['issuer'].lower()
        recognized_cas = [
            'pkioverheid',
            'logius',
            'kpn',
            'digidentity',
            'quo vadis',
        ]
        
        if not any(ca in issuer_lower for ca in recognized_cas):
            raise CertificateValidationError(
                f"Certificate issuer not recognized as PKIoverheid CA: {metadata['issuer']}"
            )
        
        # Check key usage includes digital signature
        try:
            key_usage = cert.extensions.get_extension_for_oid(
                x509.oid.ExtensionOID.KEY_USAGE
            ).value
            if not key_usage.digital_signature:
                raise CertificateValidationError(
                    "Certificate does not have digital signature capability"
                )
        except x509.ExtensionNotFound:
            # Key usage extension not found - warn but allow
            pass
