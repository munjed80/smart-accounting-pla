"""
Tax Submission Connector

Pluggable backend abstraction for submitting BTW and ICP declarations to the Dutch
tax authority (Belastingdienst) via Digipoort.

Provides:
- Abstract interface for submission connectors
- PACKAGE_ONLY mode: Safe default that stores XML locally (no network calls)
- DIGIPOORT mode: Placeholder for future Digipoort integration (requires env config)

Architecture:
- TaxSubmissionConnector: Abstract base class defining the interface
- PackageOnlyConnector: Default implementation (stores XML, returns ref, status=DRAFT)
- DigipoortConnector: Placeholder skeleton for future Digipoort integration
"""
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from enum import Enum

from app.core.config import settings


class SubmissionStatus(str, Enum):
    """Submission status values."""
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"


class SubmissionResult:
    """Result of a tax submission operation."""
    
    def __init__(
        self,
        submission_id: uuid.UUID,
        reference: str,
        status: SubmissionStatus,
        response_data: Optional[Dict[str, Any]] = None,
    ):
        self.submission_id = submission_id
        self.reference = reference
        self.status = status
        self.response_data = response_data or {}
        self.timestamp = datetime.now(timezone.utc)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "submission_id": str(self.submission_id),
            "reference": self.reference,
            "status": self.status.value,
            "response_data": self.response_data,
            "timestamp": self.timestamp.isoformat(),
        }


class TaxSubmissionConnector(ABC):
    """
    Abstract base class for tax submission connectors.
    
    Defines the interface that all submission connectors must implement.
    """
    
    @abstractmethod
    async def submit_btw(
        self,
        xml_content: str,
        administration_id: uuid.UUID,
        period_id: uuid.UUID,
        submission_id: uuid.UUID,
    ) -> SubmissionResult:
        """
        Submit BTW (VAT) declaration.
        
        Args:
            xml_content: The BTW XML/XBRL content to submit
            administration_id: The administration (client) ID
            period_id: The accounting period ID
            submission_id: The submission record ID
            
        Returns:
            SubmissionResult with submission details
            
        Raises:
            Exception: If submission fails
        """
        pass
    
    @abstractmethod
    async def submit_icp(
        self,
        xml_content: str,
        administration_id: uuid.UUID,
        period_id: uuid.UUID,
        submission_id: uuid.UUID,
    ) -> SubmissionResult:
        """
        Submit ICP (Intra-Community supplies) declaration.
        
        Args:
            xml_content: The ICP XML content to submit
            administration_id: The administration (client) ID
            period_id: The accounting period ID
            submission_id: The submission record ID
            
        Returns:
            SubmissionResult with submission details
            
        Raises:
            Exception: If submission fails
        """
        pass
    
    @abstractmethod
    async def get_status(
        self,
        reference: str,
    ) -> Dict[str, Any]:
        """
        Get submission status by reference.
        
        Args:
            reference: The submission reference ID
            
        Returns:
            Dictionary with status information
            
        Raises:
            Exception: If status check fails
        """
        pass


class PackageOnlyConnector(TaxSubmissionConnector):
    """
    Package-only connector (safe default).
    
    This connector does NOT make any network calls. It simply:
    1. Stores the XML package information
    2. Generates a local reference ID
    3. Returns status=DRAFT
    
    This is the default mode for manual submission workflows where accountants
    download the XML package and submit it manually via the tax authority portal.
    """
    
    def __init__(self):
        self.mode = "PACKAGE_ONLY"
    
    async def submit_btw(
        self,
        xml_content: str,
        administration_id: uuid.UUID,
        period_id: uuid.UUID,
        submission_id: uuid.UUID,
    ) -> SubmissionResult:
        """
        Store BTW package and return draft status.
        
        No network calls are made. The XML is stored locally and a reference
        is generated for tracking purposes.
        """
        # Generate a local reference for tracking
        reference = f"BTW-PKG-{submission_id}"
        
        # Return draft status (package ready for manual submission)
        return SubmissionResult(
            submission_id=submission_id,
            reference=reference,
            status=SubmissionStatus.DRAFT,
            response_data={
                "mode": self.mode,
                "message": "Package generated. Ready for manual submission to tax authority.",
                "xml_size": len(xml_content),
            }
        )
    
    async def submit_icp(
        self,
        xml_content: str,
        administration_id: uuid.UUID,
        period_id: uuid.UUID,
        submission_id: uuid.UUID,
    ) -> SubmissionResult:
        """
        Store ICP package and return draft status.
        
        No network calls are made. The XML is stored locally and a reference
        is generated for tracking purposes.
        """
        # Generate a local reference for tracking
        reference = f"ICP-PKG-{submission_id}"
        
        # Return draft status (package ready for manual submission)
        return SubmissionResult(
            submission_id=submission_id,
            reference=reference,
            status=SubmissionStatus.DRAFT,
            response_data={
                "mode": self.mode,
                "message": "Package generated. Ready for manual submission to tax authority.",
                "xml_size": len(xml_content),
            }
        )
    
    async def get_status(
        self,
        reference: str,
    ) -> Dict[str, Any]:
        """
        Get status for package-only submission.
        
        Since no network calls are made, this returns the stored status.
        """
        return {
            "reference": reference,
            "status": SubmissionStatus.DRAFT.value,
            "message": "Package-only mode. Status must be updated manually after submission.",
        }


class DigipoortConnector(TaxSubmissionConnector):
    """
    Digipoort connector (placeholder/skeleton for future implementation).
    
    This connector is a skeleton implementation that will eventually make real
    network calls to the Digipoort service. Currently, it validates configuration
    and provides a structure for future implementation.
    
    Environment variables required:
    - DIGIPOORT_ENABLED: Set to "true" to enable
    - DIGIPOORT_ENDPOINT: API endpoint URL
    - DIGIPOORT_CLIENT_ID: Client ID for authentication
    - DIGIPOORT_CLIENT_SECRET: Client secret for authentication
    - DIGIPOORT_CERT_PATH: Path to client certificate (optional)
    """
    
    def __init__(
        self,
        endpoint: str,
        client_id: str,
        client_secret: str,
        cert_path: Optional[str] = None,
    ):
        self.mode = "DIGIPOORT"
        self.endpoint = endpoint
        self.client_id = client_id
        self.client_secret = client_secret
        self.cert_path = cert_path
        
        # Validate configuration
        if not self.endpoint:
            raise ValueError("DIGIPOORT_ENDPOINT is required when DIGIPOORT mode is enabled")
        if not self.client_id:
            raise ValueError("DIGIPOORT_CLIENT_ID is required when DIGIPOORT mode is enabled")
        if not self.client_secret:
            raise ValueError("DIGIPOORT_CLIENT_SECRET is required when DIGIPOORT mode is enabled")
    
    async def submit_btw(
        self,
        xml_content: str,
        administration_id: uuid.UUID,
        period_id: uuid.UUID,
        submission_id: uuid.UUID,
    ) -> SubmissionResult:
        """
        Submit BTW to Digipoort (placeholder).
        
        TODO: Implement actual Digipoort API calls:
        1. Authenticate with Digipoort using credentials
        2. Submit XML package
        3. Parse response and extract reference
        4. Return appropriate status
        """
        # Placeholder implementation
        reference = f"DIGIPOORT-BTW-{submission_id}"
        
        # TODO: Make actual API call to Digipoort
        # response = await self._call_digipoort_api(
        #     submission_type="btw",
        #     xml_content=xml_content,
        #     administration_id=administration_id,
        # )
        
        return SubmissionResult(
            submission_id=submission_id,
            reference=reference,
            status=SubmissionStatus.DRAFT,  # TODO: Update based on API response
            response_data={
                "mode": self.mode,
                "message": "PLACEHOLDER: Digipoort submission not yet implemented",
                "endpoint": self.endpoint,
            }
        )
    
    async def submit_icp(
        self,
        xml_content: str,
        administration_id: uuid.UUID,
        period_id: uuid.UUID,
        submission_id: uuid.UUID,
    ) -> SubmissionResult:
        """
        Submit ICP to Digipoort (placeholder).
        
        TODO: Implement actual Digipoort API calls:
        1. Authenticate with Digipoort using credentials
        2. Submit XML package
        3. Parse response and extract reference
        4. Return appropriate status
        """
        # Placeholder implementation
        reference = f"DIGIPOORT-ICP-{submission_id}"
        
        # TODO: Make actual API call to Digipoort
        # response = await self._call_digipoort_api(
        #     submission_type="icp",
        #     xml_content=xml_content,
        #     administration_id=administration_id,
        # )
        
        return SubmissionResult(
            submission_id=submission_id,
            reference=reference,
            status=SubmissionStatus.DRAFT,  # TODO: Update based on API response
            response_data={
                "mode": self.mode,
                "message": "PLACEHOLDER: Digipoort submission not yet implemented",
                "endpoint": self.endpoint,
            }
        )
    
    async def get_status(
        self,
        reference: str,
    ) -> Dict[str, Any]:
        """
        Get submission status from Digipoort (placeholder).
        
        TODO: Implement actual status check API call.
        """
        # TODO: Make actual API call to check status
        # response = await self._check_digipoort_status(reference)
        
        return {
            "reference": reference,
            "status": SubmissionStatus.DRAFT.value,
            "message": "PLACEHOLDER: Digipoort status check not yet implemented",
        }
    
    # TODO: Implement helper methods for Digipoort API interaction
    # async def _call_digipoort_api(self, ...):
    #     """Make API call to Digipoort."""
    #     pass
    #
    # async def _check_digipoort_status(self, reference: str):
    #     """Check submission status via Digipoort API."""
    #     pass


def get_tax_connector() -> TaxSubmissionConnector:
    """
    Factory function to get the appropriate tax submission connector.
    
    Returns the connector based on environment configuration:
    - If DIGIPOORT_ENABLED=true: Returns DigipoortConnector (with validation)
    - Otherwise: Returns PackageOnlyConnector (safe default)
    
    Returns:
        TaxSubmissionConnector instance
        
    Raises:
        ValueError: If Digipoort is enabled but configuration is invalid
    """
    # Check if Digipoort mode is enabled
    digipoort_enabled = getattr(settings, 'DIGIPOORT_ENABLED', False)
    
    if digipoort_enabled and str(digipoort_enabled).lower() == 'true':
        # Digipoort mode - validate configuration and return connector
        endpoint = getattr(settings, 'DIGIPOORT_ENDPOINT', '')
        client_id = getattr(settings, 'DIGIPOORT_CLIENT_ID', '')
        client_secret = getattr(settings, 'DIGIPOORT_CLIENT_SECRET', '')
        cert_path = getattr(settings, 'DIGIPOORT_CERT_PATH', None)
        
        return DigipoortConnector(
            endpoint=endpoint,
            client_id=client_id,
            client_secret=client_secret,
            cert_path=cert_path,
        )
    else:
        # Default: Package-only mode (safe, no network calls)
        return PackageOnlyConnector()
