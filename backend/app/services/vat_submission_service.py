"""
VAT Submission Service

Handles VAT/ICP submission preparation, validation, and queueing for Digipoort.
This is the foundation for Phase B (Digipoort integration).

Phase A: Manual submission with package generation
Phase B: Automated submission via Digipoort (future)
"""
import uuid
import hashlib
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Dict, Optional, Tuple
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vat_submission import VatSubmission
from app.models.ledger import AccountingPeriod, PeriodStatus
from app.services.vat.report import VatReportService, BTWAangifteReport, VatReportError
from app.services.vat.submission import BTWSubmissionPackageGenerator


class VatSubmissionError(Exception):
    """Base exception for VAT submission operations."""
    pass


class VatSubmissionService:
    """
    Service for managing VAT/ICP submissions.
    
    Handles:
    - Building submission payloads (XML generation)
    - Validating payloads
    - Creating draft submissions
    - Queueing submissions for Digipoort
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def build_payload(
        self,
        period_id: uuid.UUID,
        kind: str = "VAT"
    ) -> str:
        """
        Build XML payload for VAT or ICP submission.
        
        Reuses existing BTW computation engine and ICP reporting.
        
        Args:
            period_id: The accounting period UUID
            kind: "VAT" (BTW) or "ICP"
        
        Returns:
            XML string ready for submission
            
        Raises:
            VatSubmissionError: If payload generation fails
        """
        if kind not in ["VAT", "ICP"]:
            raise VatSubmissionError(f"Invalid submission kind: {kind}. Must be VAT or ICP.")
        
        if kind == "VAT":
            return await self._build_vat_payload(period_id)
        else:
            return await self._build_icp_payload(period_id)
    
    async def _build_vat_payload(self, period_id: uuid.UUID) -> str:
        """Build BTW (VAT) XML payload."""
        # Use existing VAT report service
        vat_service = VatReportService(self.db, self.administration_id)
        
        try:
            report = await vat_service.generate_vat_report(period_id, allow_draft=False)
        except VatReportError as e:
            raise VatSubmissionError(f"Failed to generate VAT report: {str(e)}")
        
        # Verify period and administration
        period_result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.id == period_id)
            .where(AccountingPeriod.administration_id == self.administration_id)
        )
        period = period_result.scalar_one_or_none()
        if not period:
            raise VatSubmissionError("Period not found")
        
        # Get administration
        from app.models.administration import Administration
        admin_result = await self.db.execute(
            select(Administration).where(Administration.id == self.administration_id)
        )
        administration = admin_result.scalar_one_or_none()
        if not administration:
            raise VatSubmissionError("Administration not found")
        
        # Generate XML using existing package generator
        generator = BTWSubmissionPackageGenerator(administration, report)
        xml_content = generator.generate_xml()
        
        return xml_content
    
    async def _build_icp_payload(self, period_id: uuid.UUID) -> str:
        """
        Build ICP (Intra-Community Performance) XML payload.
        
        Stub implementation for now - interface ready for future implementation.
        """
        # Use existing VAT report service to get ICP data
        vat_service = VatReportService(self.db, self.administration_id)
        
        try:
            report = await vat_service.generate_vat_report(period_id, allow_draft=False)
        except VatReportError as e:
            raise VatSubmissionError(f"Failed to generate ICP report: {str(e)}")
        
        # Get period info
        period_result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.id == period_id)
            .where(AccountingPeriod.administration_id == self.administration_id)
        )
        period = period_result.scalar_one_or_none()
        if not period:
            raise VatSubmissionError("Period not found")
        
        # Get administration
        from app.models.administration import Administration
        admin_result = await self.db.execute(
            select(Administration).where(Administration.id == self.administration_id)
        )
        administration = admin_result.scalar_one_or_none()
        if not administration:
            raise VatSubmissionError("Administration not found")
        
        # Generate basic ICP XML structure
        # TODO: Enhance with full ICP reporting logic when available
        xml_lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<icp-aangifte xmlns="http://www.belastingdienst.nl/icp/aangifte/v1">',
            '  <metadata>',
            f'    <period-id>{period.id}</period-id>',
            f'    <period-name>{period.name}</period-name>',
            f'    <start-date>{period.start_date.isoformat()}</start-date>',
            f'    <end-date>{period.end_date.isoformat()}</end-date>',
            f'    <generated-at>{datetime.now(timezone.utc).isoformat()}</generated-at>',
            '  </metadata>',
            '  <administration>',
            f'    <id>{administration.id}</id>',
            f'    <name>{administration.name}</name>',
        ]
        
        if administration.vat_number:
            xml_lines.append(f'    <vat-number>{administration.vat_number}</vat-number>')
        
        xml_lines.extend([
            '  </administration>',
            '  <icp-entries>',
        ])
        
        # Add ICP entries from report
        for entry in report.icp_entries:
            xml_lines.extend([
                '    <entry>',
                f'      <customer-vat-number>{entry.customer_vat_number}</customer-vat-number>',
                f'      <country-code>{entry.country_code}</country-code>',
                f'      <taxable-base>{entry.taxable_base}</taxable-base>',
                '    </entry>',
            ])
        
        xml_lines.extend([
            '  </icp-entries>',
            f'  <total-icp-supplies>{report.total_icp_supplies}</total-icp-supplies>',
            '</icp-aangifte>',
        ])
        
        return '\n'.join(xml_lines)
    
    def validate_payload(self, xml: str) -> List[str]:
        """
        Validate XML payload for basic schema compliance.
        
        Performs basic checks:
        - XML is well-formed
        - Required root elements exist
        - Required fields are present
        
        Args:
            xml: The XML string to validate
        
        Returns:
            List of human-readable error messages (empty if valid)
        """
        errors = []
        
        # Check if empty
        if not xml or not xml.strip():
            errors.append("Payload is empty")
            return errors
        
        # Try parsing XML
        import xml.etree.ElementTree as ET
        try:
            root = ET.fromstring(xml)
        except ET.ParseError as e:
            errors.append(f"XML parsing error: {str(e)}")
            return errors
        
        # Check root element
        root_tag = root.tag.split('}')[-1] if '}' in root.tag else root.tag
        if root_tag not in ['btw-aangifte', 'icp-aangifte']:
            errors.append(f"Invalid root element: {root_tag}. Expected 'btw-aangifte' or 'icp-aangifte'")
        
        # Check for metadata section
        metadata = root.find('.//{http://www.belastingdienst.nl/btw/aangifte/v1}metadata') or \
                   root.find('.//{http://www.belastingdienst.nl/icp/aangifte/v1}metadata') or \
                   root.find('.//metadata')
        
        if metadata is None:
            errors.append("Missing required metadata section")
        
        # Check for administration section
        admin = root.find('.//{http://www.belastingdienst.nl/btw/aangifte/v1}administration') or \
                root.find('.//{http://www.belastingdienst.nl/icp/aangifte/v1}administration') or \
                root.find('.//administration')
        
        if admin is None:
            errors.append("Missing required administration section")
        
        # For BTW, check for vat-boxes or totals
        if root_tag == 'btw-aangifte':
            boxes = root.find('.//{http://www.belastingdienst.nl/btw/aangifte/v1}vat-boxes') or \
                    root.find('.//vat-boxes')
            totals = root.find('.//{http://www.belastingdienst.nl/btw/aangifte/v1}totals') or \
                     root.find('.//totals')
            
            if boxes is None and totals is None:
                errors.append("Missing required vat-boxes or totals section")
        
        # For ICP, check for icp-entries
        if root_tag == 'icp-aangifte':
            entries = root.find('.//{http://www.belastingdienst.nl/icp/aangifte/v1}icp-entries') or \
                      root.find('.//icp-entries')
            
            if entries is None:
                errors.append("Missing required icp-entries section")
        
        return errors
    
    async def sign_payload(
        self, 
        xml: str, 
        certificate_id: Optional[uuid.UUID] = None
    ) -> Tuple[str, dict]:
        """
        Sign XML payload for submission with PKIoverheid certificate.
        
        Implements actual XML signing using the SigningService.
        
        Args:
            xml: The XML payload to sign
            certificate_id: ID of certificate to use for signing
        
        Returns:
            Tuple of (signed_xml, signature_info)
            
        Raises:
            VatSubmissionError: If signing fails or certificate not found
        """
        if not certificate_id:
            raise VatSubmissionError(
                "Certificate ID is required for signing. "
                "Please register a PKIoverheid certificate first."
            )
        
        try:
            from app.services.signing_service import SigningService, SigningError
            from app.services.certificate_service import CertificateError
            
            # Use signing service to sign the XML
            signing_service = SigningService(self.db)
            signed_xml, signature_info = await signing_service.sign_xml(
                xml_content=xml,
                certificate_id=certificate_id,
                administration_id=self.administration_id,
            )
            
            return signed_xml, signature_info
        
        except CertificateError as e:
            raise VatSubmissionError(f"Certificate error: {str(e)}")
        except SigningError as e:
            raise VatSubmissionError(f"Signing error: {str(e)}")
        except Exception as e:
            raise VatSubmissionError(f"Failed to sign payload: {str(e)}")
    
    async def create_draft_submission(
        self,
        period_id: uuid.UUID,
        kind: str,
        user_id: uuid.UUID,
        validate: bool = True
    ) -> Tuple[VatSubmission, List[str]]:
        """
        Create a draft submission with generated payload.
        
        Args:
            period_id: The accounting period UUID
            kind: "VAT" (BTW) or "ICP"
            user_id: User creating the submission
            validate: Whether to validate the payload
        
        Returns:
            Tuple of (VatSubmission, validation_errors)
            
        Raises:
            VatSubmissionError: If submission creation fails
        """
        # Check if draft already exists for this period and kind
        existing_result = await self.db.execute(
            select(VatSubmission)
            .where(VatSubmission.administration_id == self.administration_id)
            .where(VatSubmission.period_id == period_id)
            .where(VatSubmission.submission_type == kind)
            .where(VatSubmission.status == "DRAFT")
        )
        existing = existing_result.scalar_one_or_none()
        
        # Build payload
        try:
            payload_xml = await self.build_payload(period_id, kind)
        except VatSubmissionError as e:
            raise VatSubmissionError(f"Failed to build payload: {str(e)}")
        
        # Calculate payload hash
        payload_hash = hashlib.sha256(payload_xml.encode('utf-8')).hexdigest()
        
        # Validate if requested
        validation_errors = []
        if validate:
            validation_errors = self.validate_payload(payload_xml)
        
        # Update existing or create new
        if existing:
            existing.payload_xml = payload_xml
            existing.payload_hash = payload_hash
            existing.updated_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(existing)
            return existing, validation_errors
        
        # Create new submission
        submission = VatSubmission(
            id=uuid.uuid4(),
            administration_id=self.administration_id,
            period_id=period_id,
            submission_type=kind,
            created_by=user_id,
            method="DIGIPOORT",
            status="DRAFT",
            payload_xml=payload_xml,
            payload_hash=payload_hash,
        )
        
        self.db.add(submission)
        await self.db.commit()
        await self.db.refresh(submission)
        
        return submission, validation_errors
    
    async def queue_submission(
        self,
        submission_id: uuid.UUID,
        certificate_id: Optional[uuid.UUID] = None
    ) -> VatSubmission:
        """
        Queue a draft submission for Digipoort submission.
        
        Signs the payload with PKIoverheid certificate and moves status to QUEUED.
        If Digipoort is enabled in sandbox mode, immediately simulates submission.
        
        Args:
            submission_id: The submission UUID
            certificate_id: Certificate ID to use for signing
        
        Returns:
            Updated VatSubmission
            
        Raises:
            VatSubmissionError: If queueing fails
        """
        from app.core.config import settings
        from app.services.logging import accounting_logger
        
        # Get submission
        result = await self.db.execute(
            select(VatSubmission)
            .where(VatSubmission.id == submission_id)
            .where(VatSubmission.administration_id == self.administration_id)
        )
        submission = result.scalar_one_or_none()
        
        if not submission:
            raise VatSubmissionError("Submission not found")
        
        if submission.status != "DRAFT":
            raise VatSubmissionError(f"Cannot queue submission with status {submission.status}")
        
        if not submission.payload_xml:
            raise VatSubmissionError("Submission has no payload")
        
        # Validate payload before queueing
        validation_errors = self.validate_payload(submission.payload_xml)
        if validation_errors:
            raise VatSubmissionError(f"Payload validation failed: {', '.join(validation_errors)}")
        
        # Sign payload with PKIoverheid certificate
        signed_xml, signature_info = await self.sign_payload(
            submission.payload_xml, 
            certificate_id
        )
        
        # Generate correlation ID for tracking
        correlation_id = str(uuid.uuid4())
        
        # Update submission to QUEUED
        submission.signed_xml = signed_xml
        submission.correlation_id = correlation_id
        submission.certificate_id = certificate_id
        submission.status = "QUEUED"
        submission.updated_at = datetime.now(timezone.utc)
        
        # Store signature info in connector_response for audit trail
        if not submission.connector_response:
            submission.connector_response = {}
        submission.connector_response['signature_info'] = signature_info
        
        await self.db.commit()
        await self.db.refresh(submission)
        
        # Log queued event
        accounting_logger.digipoort_queued(
            submission_id=submission.id,
            client_id=self.administration_id,
            period_id=submission.period_id,
            correlation_id=correlation_id,
            submission_type=submission.submission_type,
        )
        
        # If Digipoort is enabled, immediately submit in sandbox mode
        if settings.digipoort_enabled:
            try:
                from app.services.digipoort_service import DigipoortService
                
                # Initialize Digipoort service in sandbox mode
                digipoort_service = DigipoortService(
                    sandbox_mode=settings.digipoort_sandbox_mode
                )
                
                # Submit to Digipoort (sandbox simulates response)
                result = await digipoort_service.submit_to_digipoort(
                    signed_xml=signed_xml,
                    submission_type=submission.submission_type,
                    administration_id=self.administration_id,
                    period_id=submission.period_id,
                    correlation_id=correlation_id,
                )
                
                # Update submission with Digipoort response
                submission.digipoort_message_id = result.message_id
                submission.status = result.status.value  # SENT or ACCEPTED in sandbox
                submission.last_status_check_at = datetime.now(timezone.utc)
                
                # Store full response in connector_response
                submission.connector_response['digipoort_response'] = result.to_dict()
                
                # If there's an error, store it
                if result.error_code:
                    submission.error_code = result.error_code
                    submission.error_message = result.error_message
                
                await self.db.commit()
                await self.db.refresh(submission)
                
                # Log status updates
                accounting_logger.digipoort_sent(
                    submission_id=submission.id,
                    client_id=self.administration_id,
                    period_id=submission.period_id,
                    correlation_id=correlation_id,
                    message_id=result.message_id,
                    submission_type=submission.submission_type,
                    sandbox_mode=settings.digipoort_sandbox_mode,
                )
                
                if result.status.value == "ACCEPTED":
                    accounting_logger.digipoort_accepted(
                        submission_id=submission.id,
                        client_id=self.administration_id,
                        period_id=submission.period_id,
                        correlation_id=correlation_id,
                        message_id=result.message_id,
                        submission_type=submission.submission_type,
                    )
                elif result.status.value == "REJECTED":
                    accounting_logger.digipoort_rejected(
                        submission_id=submission.id,
                        client_id=self.administration_id,
                        period_id=submission.period_id,
                        correlation_id=correlation_id,
                        message_id=result.message_id,
                        submission_type=submission.submission_type,
                        error_code=result.error_code,
                        error_message=result.error_message,
                    )
            
            except Exception as e:
                # Log error but don't fail the queueing
                accounting_logger.digipoort_error(
                    submission_id=submission.id,
                    client_id=self.administration_id,
                    period_id=submission.period_id,
                    correlation_id=correlation_id,
                    submission_type=submission.submission_type,
                    error=str(e),
                )
                # Update submission with error - use consistent status from existing flow
                submission.status = "FAILED"
                submission.error_code = "SUBMISSION_ERROR"
                submission.error_message = str(e)
                await self.db.commit()
                await self.db.refresh(submission)
        
        return submission
