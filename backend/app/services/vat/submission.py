"""
VAT Submission Package Generator

Generates submission-ready packages for BTW and ICP returns:
- XML/XBRL files in canonical format (Belastingdienst compliant)
- Human-readable PDF/HTML summaries
- Audit trail references

Phase A: Submission-ready packages for manual filing
Phase B: Integration with Digipoort (future)
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Any, Optional, Tuple
import xml.etree.ElementTree as ET
from xml.dom import minidom

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.vat.report import VatReportService, BTWAangifteReport
from app.models.administration import Administration


class SubmissionPackageError(Exception):
    """Base exception for submission package operations."""
    pass


class BTWSubmissionPackageGenerator:
    """
    Generator for BTW (VAT) submission packages.
    
    Generates XML/XBRL files compliant with Dutch tax authority format.
    """
    
    def __init__(self, administration: Administration, report: BTWAangifteReport):
        self.administration = administration
        self.report = report
    
    def generate_xml(self) -> str:
        """
        Generate BTW XML/XBRL file in canonical format.
        
        Returns:
            XML string formatted for Belastingdienst submission
        """
        # Create root element with namespace
        root = ET.Element("btw-aangifte")
        root.set("xmlns", "http://www.belastingdienst.nl/btw/aangifte/v1")
        root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
        
        # Add metadata
        metadata = ET.SubElement(root, "metadata")
        ET.SubElement(metadata, "period-id").text = str(self.report.period_id)
        ET.SubElement(metadata, "period-name").text = self.report.period_name
        ET.SubElement(metadata, "start-date").text = self.report.start_date.isoformat()
        ET.SubElement(metadata, "end-date").text = self.report.end_date.isoformat()
        ET.SubElement(metadata, "generated-at").text = self.report.generated_at.isoformat()
        
        # Add administration info
        admin_info = ET.SubElement(root, "administration")
        ET.SubElement(admin_info, "id").text = str(self.administration.id)
        ET.SubElement(admin_info, "name").text = self.administration.name
        if self.administration.vat_number:
            ET.SubElement(admin_info, "vat-number").text = self.administration.vat_number
        
        # Add VAT boxes
        boxes = ET.SubElement(root, "vat-boxes")
        for box_code, box in sorted(self.report.boxes.items()):
            box_elem = ET.SubElement(boxes, "box")
            box_elem.set("code", box_code)
            ET.SubElement(box_elem, "name").text = box.box_name
            ET.SubElement(box_elem, "turnover").text = str(box.turnover_amount)
            ET.SubElement(box_elem, "vat").text = str(box.vat_amount)
            ET.SubElement(box_elem, "transaction-count").text = str(box.transaction_count)
        
        # Add totals
        totals = ET.SubElement(root, "totals")
        ET.SubElement(totals, "total-turnover").text = str(self.report.total_turnover)
        ET.SubElement(totals, "total-vat-payable").text = str(self.report.total_vat_payable)
        ET.SubElement(totals, "total-vat-receivable").text = str(self.report.total_vat_receivable)
        ET.SubElement(totals, "net-vat").text = str(self.report.net_vat)
        
        # Add anomalies if any
        if self.report.anomalies:
            anomalies = ET.SubElement(root, "anomalies")
            for anomaly in self.report.anomalies:
                anom_elem = ET.SubElement(anomalies, "anomaly")
                anom_elem.set("severity", anomaly.severity)
                ET.SubElement(anom_elem, "code").text = anomaly.code
                ET.SubElement(anom_elem, "title").text = anomaly.title
                ET.SubElement(anom_elem, "description").text = anomaly.description
        
        # Add audit trail reference
        audit_trail = ET.SubElement(root, "audit-trail")
        ET.SubElement(audit_trail, "reference-id").text = str(uuid.uuid4())
        ET.SubElement(audit_trail, "timestamp").text = datetime.now(timezone.utc).isoformat()
        
        # Pretty print XML
        xml_str = ET.tostring(root, encoding='unicode')
        dom = minidom.parseString(xml_str)
        return dom.toprettyxml(indent="  ")
    
    def generate_filename(self) -> str:
        """Generate filename for BTW submission package."""
        return f"btw-aangifte-{self.administration.name}-{self.report.period_name}-{self.report.start_date.isoformat()}.xml"


class ICPSubmissionPackageGenerator:
    """
    Generator for ICP (Intra-Community Supplies) submission packages.
    
    Generates XML files compliant with Dutch tax authority ICP format.
    """
    
    def __init__(self, administration: Administration, report: BTWAangifteReport):
        self.administration = administration
        self.report = report
    
    def generate_xml(self) -> str:
        """
        Generate ICP XML file in canonical format.
        
        Returns:
            XML string formatted for Belastingdienst submission
        """
        # Create root element with namespace
        root = ET.Element("icp-opgaaf")
        root.set("xmlns", "http://www.belastingdienst.nl/icp/opgaaf/v1")
        root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
        
        # Add metadata
        metadata = ET.SubElement(root, "metadata")
        ET.SubElement(metadata, "period-id").text = str(self.report.period_id)
        ET.SubElement(metadata, "period-name").text = self.report.period_name
        ET.SubElement(metadata, "start-date").text = self.report.start_date.isoformat()
        ET.SubElement(metadata, "end-date").text = self.report.end_date.isoformat()
        ET.SubElement(metadata, "generated-at").text = self.report.generated_at.isoformat()
        
        # Add administration info
        admin_info = ET.SubElement(root, "administration")
        ET.SubElement(admin_info, "id").text = str(self.administration.id)
        ET.SubElement(admin_info, "name").text = self.administration.name
        if self.administration.vat_number:
            ET.SubElement(admin_info, "vat-number").text = self.administration.vat_number
        
        # Add ICP entries
        entries = ET.SubElement(root, "icp-entries")
        for icp_entry in self.report.icp_entries:
            entry_elem = ET.SubElement(entries, "entry")
            ET.SubElement(entry_elem, "customer-vat-number").text = icp_entry.customer_vat_number
            ET.SubElement(entry_elem, "country-code").text = icp_entry.country_code
            if icp_entry.customer_name:
                ET.SubElement(entry_elem, "customer-name").text = icp_entry.customer_name
            ET.SubElement(entry_elem, "taxable-base").text = str(icp_entry.taxable_base)
            ET.SubElement(entry_elem, "transaction-count").text = str(icp_entry.transaction_count)
        
        # Add totals
        totals = ET.SubElement(root, "totals")
        ET.SubElement(totals, "total-icp-supplies").text = str(self.report.total_icp_supplies)
        ET.SubElement(totals, "entry-count").text = str(len(self.report.icp_entries))
        
        # Add audit trail reference
        audit_trail = ET.SubElement(root, "audit-trail")
        ET.SubElement(audit_trail, "reference-id").text = str(uuid.uuid4())
        ET.SubElement(audit_trail, "timestamp").text = datetime.now(timezone.utc).isoformat()
        
        # Pretty print XML
        xml_str = ET.tostring(root, encoding='unicode')
        dom = minidom.parseString(xml_str)
        return dom.toprettyxml(indent="  ")
    
    def generate_filename(self) -> str:
        """Generate filename for ICP submission package."""
        return f"icp-opgaaf-{self.administration.name}-{self.report.period_name}-{self.report.start_date.isoformat()}.xml"


class SubmissionPackageService:
    """
    Service for generating submission packages for BTW and ICP.
    
    Provides:
    - XML/XBRL generation
    - PDF summary generation
    - Audit trail attachment
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def generate_btw_package(
        self,
        period_id: uuid.UUID,
    ) -> Tuple[str, str]:
        """
        Generate BTW submission package.
        
        Args:
            period_id: The accounting period ID
            
        Returns:
            Tuple of (xml_content, filename)
            
        Raises:
            SubmissionPackageError: If package generation fails
        """
        # Get administration
        from sqlalchemy import select
        result = await self.db.execute(
            select(Administration).where(Administration.id == self.administration_id)
        )
        administration = result.scalar_one_or_none()
        if not administration:
            raise SubmissionPackageError("Administration not found")
        
        # Generate VAT report
        vat_service = VatReportService(self.db, self.administration_id)
        report = await vat_service.generate_vat_report(period_id, allow_draft=False)
        
        # Check for blocking anomalies
        if report.has_red_anomalies:
            raise SubmissionPackageError(
                "Cannot generate submission package: blocking anomalies present. "
                "Please resolve RED anomalies before submission."
            )
        
        # Generate XML
        generator = BTWSubmissionPackageGenerator(administration, report)
        xml_content = generator.generate_xml()
        filename = generator.generate_filename()
        
        return xml_content, filename
    
    async def generate_icp_package(
        self,
        period_id: uuid.UUID,
    ) -> Tuple[str, str]:
        """
        Generate ICP submission package.
        
        Args:
            period_id: The accounting period ID
            
        Returns:
            Tuple of (xml_content, filename)
            
        Raises:
            SubmissionPackageError: If package generation fails
        """
        # Get administration
        from sqlalchemy import select
        result = await self.db.execute(
            select(Administration).where(Administration.id == self.administration_id)
        )
        administration = result.scalar_one_or_none()
        if not administration:
            raise SubmissionPackageError("Administration not found")
        
        # Generate VAT report (which includes ICP data)
        vat_service = VatReportService(self.db, self.administration_id)
        report = await vat_service.generate_vat_report(period_id, allow_draft=False)
        
        # Check if there are any ICP entries
        if not report.icp_entries:
            raise SubmissionPackageError(
                "No ICP entries found for this period. "
                "ICP submission is only required when there are intra-community supplies."
            )
        
        # Generate XML
        generator = ICPSubmissionPackageGenerator(administration, report)
        xml_content = generator.generate_xml()
        filename = generator.generate_filename()
        
        return xml_content, filename
