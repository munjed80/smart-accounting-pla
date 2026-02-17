"""
Certificate Schemas

Pydantic schemas for certificate management API.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class CertificateRegisterRequest(BaseModel):
    """Request to register a new certificate."""
    type: str = Field(..., description="Certificate type (e.g., PKI_OVERHEID)")
    storage_ref: str = Field(..., description="Path or reference to certificate file")
    passphrase_ref: Optional[str] = Field(None, description="Reference to passphrase (env var or secret)")
    friendly_name: Optional[str] = Field(None, description="User-friendly name for the certificate")
    purpose: Optional[str] = Field(None, description="Purpose of certificate (e.g., BTW_SUBMISSION)")
    
    @field_validator('type')
    @classmethod
    def validate_type(cls, v):
        allowed_types = ['PKI_OVERHEID']
        if v not in allowed_types:
            raise ValueError(f"Certificate type must be one of {allowed_types}")
        return v
    
    @field_validator('storage_ref')
    @classmethod
    def validate_storage_ref(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("storage_ref cannot be empty")
        return v


class CertificateMetadata(BaseModel):
    """Certificate metadata extracted from the certificate file."""
    fingerprint: str
    subject: str
    issuer: str
    serial_number: str
    valid_from: datetime
    valid_to: datetime


class CertificateResponse(BaseModel):
    """Response containing certificate information."""
    id: UUID
    administration_id: UUID
    type: str
    storage_ref: str
    has_passphrase: bool  # Whether passphrase_ref is set (don't expose the actual ref)
    fingerprint: str
    subject: str
    issuer: str
    serial_number: str
    valid_from: datetime
    valid_to: datetime
    friendly_name: Optional[str]
    purpose: Optional[str]
    created_at: datetime
    created_by: UUID
    updated_at: datetime
    is_active: bool
    is_valid: bool  # Computed: whether cert is currently valid
    days_until_expiry: int  # Computed: days until expiry
    
    class Config:
        from_attributes = True


class CertificateListResponse(BaseModel):
    """Response containing list of certificates."""
    certificates: list[CertificateResponse]
    total: int


class CertificateRegisterResponse(BaseModel):
    """Response after registering a certificate."""
    certificate: CertificateResponse
    message: str = "Certificate registered successfully"


class CertificateDeleteResponse(BaseModel):
    """Response after deleting a certificate."""
    message: str = "Certificate deleted successfully"


class SigningRequest(BaseModel):
    """Request to sign XML content."""
    xml_content: str = Field(..., description="XML content to sign")
    certificate_id: UUID = Field(..., description="ID of certificate to use for signing")


class SigningResponse(BaseModel):
    """Response containing signed XML."""
    signed_xml: str = Field(..., description="Signed XML content")
    signature_info: dict = Field(..., description="Information about the signature")
    certificate_fingerprint: str = Field(..., description="Fingerprint of certificate used")
