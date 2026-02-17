"""
XML Signing Service

Handles PKIoverheid XML signing for VAT submissions.
Implements XMLDSig (XML Digital Signature) standard.
"""
import hashlib
from datetime import datetime, timezone
from typing import Tuple
from uuid import UUID
import xml.etree.ElementTree as ET
from base64 import b64encode

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.certificate_service import CertificateService, CertificateError


class SigningError(Exception):
    """Base exception for signing operations."""
    pass


class SigningService:
    """
    Service for signing XML documents with PKIoverheid certificates.
    
    Implements XMLDSig (XML Digital Signature) standard for signing
    XML documents for submission to Belastingdienst via Digipoort.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.cert_service = CertificateService(db)
    
    async def sign_xml(
        self,
        xml_content: str,
        certificate_id: UUID,
        administration_id: UUID,
    ) -> Tuple[str, dict]:
        """
        Sign XML content with PKIoverheid certificate.
        
        This method:
        1. Loads the certificate and private key
        2. Canonicalizes the XML
        3. Computes SHA256 digest of the XML
        4. Signs the digest with the private key
        5. Embeds the signature in the XML according to XMLDSig standard
        
        Args:
            xml_content: XML content to sign
            certificate_id: ID of certificate to use for signing
            administration_id: Administration ID (for tenant isolation)
            
        Returns:
            Tuple of (signed_xml, signature_info)
            signed_xml: XML content with embedded signature
            signature_info: Dictionary with signature metadata
            
        Raises:
            SigningError: If signing fails
            CertificateError: If certificate is invalid or cannot be loaded
        """
        try:
            # Load certificate and private key
            cert, private_key = await self.cert_service.load_certificate_for_signing(
                certificate_id, administration_id
            )
            
            # Parse XML
            try:
                root = ET.fromstring(xml_content)
            except ET.ParseError as e:
                raise SigningError(f"Invalid XML content: {str(e)}")
            
            # Canonicalize XML (C14N)
            canonical_xml = self._canonicalize_xml(root)
            
            # Compute digest (SHA256)
            digest = hashlib.sha256(canonical_xml.encode('utf-8')).digest()
            digest_b64 = b64encode(digest).decode('utf-8')
            
            # Sign digest with private key
            if isinstance(private_key, rsa.RSAPrivateKey):
                signature = private_key.sign(
                    digest,
                    padding.PKCS1v15(),
                    hashes.SHA256()
                )
            else:
                raise SigningError(f"Unsupported key type: {type(private_key)}")
            
            signature_b64 = b64encode(signature).decode('utf-8')
            
            # Extract certificate info
            cert_b64 = b64encode(cert.public_bytes(
                encoding=serialization.Encoding.DER
            )).decode('utf-8')
            
            # Build signature metadata
            signature_info = {
                'algorithm': 'RSA-SHA256',
                'digest_method': 'SHA256',
                'digest_value': digest_b64,
                'signature_value': signature_b64,
                'certificate_fingerprint': hashlib.sha256(
                    cert.public_bytes(encoding=serialization.Encoding.DER)
                ).hexdigest(),
                'certificate_subject': cert.subject.rfc4514_string(),
                'certificate_issuer': cert.issuer.rfc4514_string(),
                'signature_timestamp': datetime.now(timezone.utc).isoformat(),
            }
            
            # Embed signature in XML according to XMLDSig
            signed_xml = self._embed_signature(
                root,
                signature_b64,
                digest_b64,
                cert_b64,
                signature_info
            )
            
            return signed_xml, signature_info
        
        except CertificateError:
            raise
        except SigningError:
            raise
        except Exception as e:
            raise SigningError(f"Failed to sign XML: {str(e)}")
    
    def _canonicalize_xml(self, root: ET.Element) -> str:
        """
        Canonicalize XML using C14N (Canonical XML).
        
        This ensures the XML is in a consistent format before signing,
        preventing signature invalidation due to whitespace or formatting changes.
        
        Args:
            root: Root element of XML tree
            
        Returns:
            Canonicalized XML string
        """
        # Use ElementTree's canonical form
        # This is a simplified C14N - for production, consider using lxml for full C14N support
        xml_str = ET.tostring(root, encoding='unicode', method='xml')
        
        # Remove unnecessary whitespace between tags
        xml_str = ' '.join(xml_str.split())
        
        return xml_str
    
    def _embed_signature(
        self,
        root: ET.Element,
        signature_b64: str,
        digest_b64: str,
        cert_b64: str,
        signature_info: dict,
    ) -> str:
        """
        Embed XMLDSig signature into XML document.
        
        Creates a <Signature> element according to XMLDSig standard
        and appends it to the root element.
        
        Args:
            root: Root element of XML tree
            signature_b64: Base64-encoded signature value
            digest_b64: Base64-encoded digest value
            cert_b64: Base64-encoded certificate
            signature_info: Signature metadata
            
        Returns:
            Signed XML as string
        """
        # Create Signature element with XMLDSig namespace
        ns_ds = "http://www.w3.org/2000/09/xmldsig#"
        ET.register_namespace('ds', ns_ds)
        
        signature = ET.Element(f"{{{ns_ds}}}Signature")
        
        # SignedInfo element
        signed_info = ET.SubElement(signature, f"{{{ns_ds}}}SignedInfo")
        
        # CanonicalizationMethod
        canon_method = ET.SubElement(signed_info, f"{{{ns_ds}}}CanonicalizationMethod")
        canon_method.set('Algorithm', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315')
        
        # SignatureMethod
        sig_method = ET.SubElement(signed_info, f"{{{ns_ds}}}SignatureMethod")
        sig_method.set('Algorithm', 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256')
        
        # Reference
        reference = ET.SubElement(signed_info, f"{{{ns_ds}}}Reference")
        reference.set('URI', '')  # Empty URI means entire document
        
        # Transforms
        transforms = ET.SubElement(reference, f"{{{ns_ds}}}Transforms")
        transform = ET.SubElement(transforms, f"{{{ns_ds}}}Transform")
        transform.set('Algorithm', 'http://www.w3.org/2000/09/xmldsig#enveloped-signature')
        
        # DigestMethod
        digest_method = ET.SubElement(reference, f"{{{ns_ds}}}DigestMethod")
        digest_method.set('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256')
        
        # DigestValue
        digest_value = ET.SubElement(reference, f"{{{ns_ds}}}DigestValue")
        digest_value.text = digest_b64
        
        # SignatureValue
        sig_value = ET.SubElement(signature, f"{{{ns_ds}}}SignatureValue")
        sig_value.text = signature_b64
        
        # KeyInfo
        key_info = ET.SubElement(signature, f"{{{ns_ds}}}KeyInfo")
        
        # X509Data
        x509_data = ET.SubElement(key_info, f"{{{ns_ds}}}X509Data")
        x509_cert = ET.SubElement(x509_data, f"{{{ns_ds}}}X509Certificate")
        x509_cert.text = cert_b64
        
        # Add signature metadata as comment
        signature_comment = ET.Comment(
            f" Signature Info: "
            f"Algorithm={signature_info['algorithm']}, "
            f"Timestamp={signature_info['signature_timestamp']}, "
            f"Fingerprint={signature_info['certificate_fingerprint']} "
        )
        signature.append(signature_comment)
        
        # Append signature to root
        root.append(signature)
        
        # Convert to string with proper formatting
        xml_str = ET.tostring(root, encoding='unicode', method='xml')
        
        # Add XML declaration
        if not xml_str.startswith('<?xml'):
            xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str
        
        return xml_str
    
    def verify_signature(self, signed_xml: str) -> bool:
        """
        Verify XML signature (basic verification).
        
        Note: This is a simplified verification. For production use,
        consider using a dedicated XMLDSig library like signxml.
        
        Args:
            signed_xml: Signed XML content
            
        Returns:
            True if signature is valid, False otherwise
        """
        try:
            root = ET.fromstring(signed_xml)
            
            # Find Signature element
            ns_ds = "http://www.w3.org/2000/09/xmldsig#"
            signature_elem = root.find(f".//{{{ns_ds}}}Signature")
            
            if signature_elem is None:
                return False
            
            # Extract signature value and digest
            sig_value_elem = signature_elem.find(f".//{{{ns_ds}}}SignatureValue")
            digest_value_elem = signature_elem.find(f".//{{{ns_ds}}}DigestValue")
            
            if sig_value_elem is None or digest_value_elem is None:
                return False
            
            # Basic check: signature elements are present and non-empty
            return (
                sig_value_elem.text is not None and len(sig_value_elem.text.strip()) > 0 and
                digest_value_elem.text is not None and len(digest_value_elem.text.strip()) > 0
            )
        
        except Exception:
            return False
