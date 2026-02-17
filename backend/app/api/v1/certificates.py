"""
Certificate Management API Endpoints

Provides endpoints for accountants to manage PKI certificates for signing VAT submissions.
These endpoints are restricted to accountants only.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import CurrentUser, require_assigned_client
from app.models.user import UserRole
from app.schemas.certificate import (
    CertificateRegisterRequest,
    CertificateRegisterResponse,
    CertificateResponse,
    CertificateListResponse,
    CertificateDeleteResponse,
)
from app.services.certificate_service import (
    CertificateService,
    CertificateError,
    CertificateNotFoundError,
    CertificateLoadError,
    CertificateValidationError,
)

router = APIRouter()


def require_accountant(current_user: CurrentUser) -> None:
    """Ensure current user is an accountant."""
    if current_user.role not in [UserRole.ACCOUNTANT, UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only accountants can manage certificates"
        )


@router.post(
    "/clients/{client_id}/certificates/register",
    response_model=CertificateRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_certificate(
    client_id: UUID,
    request: CertificateRegisterRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Register a new PKI certificate for signing VAT submissions.
    
    This endpoint:
    1. Verifies the accountant has access to the client
    2. Loads and validates the certificate from the provided storage_ref
    3. Extracts certificate metadata (fingerprint, subject, issuer, validity)
    4. Stores metadata in database (NOT the certificate/key itself)
    
    **Security:**
    - Private keys and certificates are NEVER stored in the database
    - Only metadata is stored for tracking and validation
    - Actual certificates must be provided via:
      - Environment variables (e.g., $PKI_CERT_PATH)
      - Coolify secrets (e.g., coolify://pki-cert)
      - Direct filesystem paths (e.g., /secrets/pki-cert.pfx)
    
    **Requirements:**
    - User must be an accountant
    - User must have access to the client
    - Certificate must be valid PKIoverheid format
    - Certificate must not be expired
    - Certificate must not already be registered (duplicate fingerprint check)
    
    **Example Request:**
    ```json
    {
      "type": "PKI_OVERHEID",
      "storage_ref": "$PKI_CERT_PATH",
      "passphrase_ref": "$PKI_CERT_PASSPHRASE",
      "friendly_name": "Belastingdienst BTW Certificaat 2026",
      "purpose": "BTW_SUBMISSION"
    }
    ```
    """
    # Verify accountant role
    require_accountant(current_user)
    
    # Verify access to client
    administration = await require_assigned_client(client_id, current_user, db)
    
    # Register certificate
    cert_service = CertificateService(db)
    try:
        certificate = await cert_service.register_certificate(
            administration_id=administration.id,
            user_id=current_user.id,
            cert_type=request.type,
            storage_ref=request.storage_ref,
            passphrase_ref=request.passphrase_ref,
            friendly_name=request.friendly_name,
            purpose=request.purpose,
        )
        
        # Build response
        cert_response = CertificateResponse(
            id=certificate.id,
            administration_id=certificate.administration_id,
            type=certificate.type,
            storage_ref=certificate.storage_ref,
            has_passphrase=certificate.passphrase_ref is not None,
            fingerprint=certificate.fingerprint,
            subject=certificate.subject,
            issuer=certificate.issuer,
            serial_number=certificate.serial_number,
            valid_from=certificate.valid_from,
            valid_to=certificate.valid_to,
            friendly_name=certificate.friendly_name,
            purpose=certificate.purpose,
            created_at=certificate.created_at,
            created_by=certificate.created_by,
            updated_at=certificate.updated_at,
            is_active=certificate.is_active,
            is_valid=certificate.is_valid(),
            days_until_expiry=certificate.days_until_expiry(),
        )
        
        return CertificateRegisterResponse(
            certificate=cert_response,
            message="Certificate registered successfully"
        )
    
    except CertificateLoadError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to load certificate: {str(e)}"
        )
    except CertificateValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Certificate validation failed: {str(e)}"
        )
    except CertificateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get(
    "/clients/{client_id}/certificates",
    response_model=CertificateListResponse,
)
async def list_certificates(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    include_expired: bool = False,
):
    """
    List all certificates registered for a client.
    
    Returns a list of certificate metadata (not the actual certificates).
    
    **Query Parameters:**
    - include_expired: Whether to include expired certificates (default: false)
    
    **Requirements:**
    - User must be an accountant
    - User must have access to the client
    """
    # Verify accountant role
    require_accountant(current_user)
    
    # Verify access to client
    administration = await require_assigned_client(client_id, current_user, db)
    
    # Get certificates
    cert_service = CertificateService(db)
    certificates = await cert_service.list_certificates(
        administration_id=administration.id,
        include_expired=include_expired,
    )
    
    # Build response
    cert_responses = [
        CertificateResponse(
            id=cert.id,
            administration_id=cert.administration_id,
            type=cert.type,
            storage_ref=cert.storage_ref,
            has_passphrase=cert.passphrase_ref is not None,
            fingerprint=cert.fingerprint,
            subject=cert.subject,
            issuer=cert.issuer,
            serial_number=cert.serial_number,
            valid_from=cert.valid_from,
            valid_to=cert.valid_to,
            friendly_name=cert.friendly_name,
            purpose=cert.purpose,
            created_at=cert.created_at,
            created_by=cert.created_by,
            updated_at=cert.updated_at,
            is_active=cert.is_active,
            is_valid=cert.is_valid(),
            days_until_expiry=cert.days_until_expiry(),
        )
        for cert in certificates
    ]
    
    return CertificateListResponse(
        certificates=cert_responses,
        total=len(cert_responses),
    )


@router.get(
    "/clients/{client_id}/certificates/{certificate_id}",
    response_model=CertificateResponse,
)
async def get_certificate(
    client_id: UUID,
    certificate_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get details of a specific certificate.
    
    Returns certificate metadata (not the actual certificate).
    
    **Requirements:**
    - User must be an accountant
    - User must have access to the client
    - Certificate must exist and belong to the client
    """
    # Verify accountant role
    require_accountant(current_user)
    
    # Verify access to client
    administration = await require_assigned_client(client_id, current_user, db)
    
    # Get certificate
    cert_service = CertificateService(db)
    try:
        certificate = await cert_service.get_certificate(
            certificate_id=certificate_id,
            administration_id=administration.id,
        )
        
        return CertificateResponse(
            id=certificate.id,
            administration_id=certificate.administration_id,
            type=certificate.type,
            storage_ref=certificate.storage_ref,
            has_passphrase=certificate.passphrase_ref is not None,
            fingerprint=certificate.fingerprint,
            subject=certificate.subject,
            issuer=certificate.issuer,
            serial_number=certificate.serial_number,
            valid_from=certificate.valid_from,
            valid_to=certificate.valid_to,
            friendly_name=certificate.friendly_name,
            purpose=certificate.purpose,
            created_at=certificate.created_at,
            created_by=certificate.created_by,
            updated_at=certificate.updated_at,
            is_active=certificate.is_active,
            is_valid=certificate.is_valid(),
            days_until_expiry=certificate.days_until_expiry(),
        )
    
    except CertificateNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Certificate {certificate_id} not found"
        )


@router.delete(
    "/clients/{client_id}/certificates/{certificate_id}",
    response_model=CertificateDeleteResponse,
)
async def delete_certificate(
    client_id: UUID,
    certificate_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Delete (deactivate) a certificate.
    
    This performs a soft delete - the certificate metadata remains in the database
    but is marked as inactive and cannot be used for signing.
    
    **Requirements:**
    - User must be an accountant
    - User must have access to the client
    - Certificate must exist and belong to the client
    
    **Note:** This does not delete the actual certificate file from the filesystem.
    """
    # Verify accountant role
    require_accountant(current_user)
    
    # Verify access to client
    administration = await require_assigned_client(client_id, current_user, db)
    
    # Delete certificate
    cert_service = CertificateService(db)
    try:
        await cert_service.delete_certificate(
            certificate_id=certificate_id,
            administration_id=administration.id,
        )
        
        return CertificateDeleteResponse(
            message="Certificate deleted successfully"
        )
    
    except CertificateNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Certificate {certificate_id} not found"
        )
