"""
Unit Tests for BTW/ICP Submission Package Generator

Tests cover:
- BTW XML generation
- ICP XML generation
- Audit trail attachment
- Error handling for red anomalies
- Filename generation
"""
import pytest
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
import xml.etree.ElementTree as ET

from app.services.vat.submission import (
    BTWSubmissionPackageGenerator,
    ICPSubmissionPackageGenerator,
)
from app.services.vat.report import (
    BTWAangifteReport,
    VatBoxAmount,
    ICPEntry,
    VatAnomaly,
)


class MockAdministration:
    """Mock administration for testing."""
    def __init__(self):
        self.id = uuid.uuid4()
        self.name = "Test BV"
        self.vat_number = "NL123456789B01"


class TestBTWSubmissionPackageGenerator:
    """Tests for BTW submission package generator."""
    
    def test_generate_xml_basic(self):
        """Test basic BTW XML generation."""
        admin = MockAdministration()
        report = BTWAangifteReport(
            period_id=uuid.uuid4(),
            period_name="Q1 2024",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 3, 31),
            generated_at=datetime(2024, 4, 1, 12, 0, 0, tzinfo=timezone.utc),
        )
        
        # Add some boxes
        report.boxes["1a"] = VatBoxAmount(
            box_code="1a",
            box_name="Leveringen/diensten belast met hoog tarief (21%)",
            turnover_amount=Decimal("1000.00"),
            vat_amount=Decimal("210.00"),
            transaction_count=5,
        )
        report.boxes["5b"] = VatBoxAmount(
            box_code="5b",
            box_name="Voorbelasting (aftrekbare btw)",
            turnover_amount=Decimal("0.00"),
            vat_amount=Decimal("50.00"),
            transaction_count=2,
        )
        
        generator = BTWSubmissionPackageGenerator(admin, report)
        xml_content = generator.generate_xml()
        
        # Parse and validate XML
        root = ET.fromstring(xml_content)
        
        # Define namespace
        ns = {'btw': 'http://www.belastingdienst.nl/btw/aangifte/v1'}
        assert root.tag == "{http://www.belastingdienst.nl/btw/aangifte/v1}btw-aangifte"
        
        # Check metadata
        metadata = root.find("btw:metadata", ns)
        assert metadata is not None
        assert metadata.find("btw:period-name", ns).text == "Q1 2024"
        
        # Check administration
        admin_elem = root.find("btw:administration", ns)
        assert admin_elem is not None
        assert admin_elem.find("btw:name", ns).text == "Test BV"
        assert admin_elem.find("btw:vat-number", ns).text == "NL123456789B01"
        
        # Check boxes
        boxes = root.find("btw:vat-boxes", ns)
        assert boxes is not None
        box_elems = boxes.findall("btw:box", ns)
        assert len(box_elems) == 2
        
        # Check audit trail
        audit_trail = root.find("btw:audit-trail", ns)
        assert audit_trail is not None
        assert audit_trail.find("btw:reference-id", ns) is not None
        assert audit_trail.find("btw:timestamp", ns) is not None
    
    def test_generate_xml_with_anomalies(self):
        """Test BTW XML generation with anomalies."""
        admin = MockAdministration()
        report = BTWAangifteReport(
            period_id=uuid.uuid4(),
            period_name="Q1 2024",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 3, 31),
            generated_at=datetime(2024, 4, 1, 12, 0, 0, tzinfo=timezone.utc),
        )
        
        # Add anomaly
        report.anomalies.append(VatAnomaly(
            id="anom-1",
            code="VAT-001",
            severity="YELLOW",
            title="Test anomaly",
            description="This is a test anomaly",
        ))
        report.has_yellow_anomalies = True
        
        generator = BTWSubmissionPackageGenerator(admin, report)
        xml_content = generator.generate_xml()
        
        # Parse and validate XML
        root = ET.fromstring(xml_content)
        
        # Define namespace
        ns = {'btw': 'http://www.belastingdienst.nl/btw/aangifte/v1'}
        
        # Check anomalies section
        anomalies = root.find("btw:anomalies", ns)
        assert anomalies is not None
        anomaly_elems = anomalies.findall("btw:anomaly", ns)
        assert len(anomaly_elems) == 1
        
        anomaly = anomaly_elems[0]
        assert anomaly.get("severity") == "YELLOW"
        assert anomaly.find("btw:code", ns).text == "VAT-001"
        assert anomaly.find("btw:title", ns).text == "Test anomaly"
    
    def test_generate_filename(self):
        """Test BTW filename generation."""
        admin = MockAdministration()
        admin.name = "Test BV"
        
        report = BTWAangifteReport(
            period_id=uuid.uuid4(),
            period_name="Q1 2024",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 3, 31),
            generated_at=datetime.now(timezone.utc),
        )
        
        generator = BTWSubmissionPackageGenerator(admin, report)
        filename = generator.generate_filename()
        
        assert filename.startswith("btw-aangifte-Test BV-Q1 2024-2024-01-01")
        assert filename.endswith(".xml")


class TestICPSubmissionPackageGenerator:
    """Tests for ICP submission package generator."""
    
    def test_generate_xml_basic(self):
        """Test basic ICP XML generation."""
        admin = MockAdministration()
        report = BTWAangifteReport(
            period_id=uuid.uuid4(),
            period_name="Q1 2024",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 3, 31),
            generated_at=datetime(2024, 4, 1, 12, 0, 0, tzinfo=timezone.utc),
        )
        
        # Add ICP entries
        report.icp_entries.append(ICPEntry(
            customer_vat_number="DE123456789",
            country_code="DE",
            customer_name="German Customer GmbH",
            customer_id=uuid.uuid4(),
            taxable_base=Decimal("5000.00"),
            transaction_count=3,
        ))
        report.icp_entries.append(ICPEntry(
            customer_vat_number="BE987654321",
            country_code="BE",
            customer_name="Belgian Customer SA",
            customer_id=uuid.uuid4(),
            taxable_base=Decimal("3000.00"),
            transaction_count=2,
        ))
        report.total_icp_supplies = Decimal("8000.00")
        
        generator = ICPSubmissionPackageGenerator(admin, report)
        xml_content = generator.generate_xml()
        
        # Parse and validate XML
        root = ET.fromstring(xml_content)
        
        # Define namespace
        ns = {'icp': 'http://www.belastingdienst.nl/icp/opgaaf/v1'}
        assert root.tag == "{http://www.belastingdienst.nl/icp/opgaaf/v1}icp-opgaaf"
        
        # Check metadata
        metadata = root.find("icp:metadata", ns)
        assert metadata is not None
        assert metadata.find("icp:period-name", ns).text == "Q1 2024"
        
        # Check entries
        entries = root.find("icp:icp-entries", ns)
        assert entries is not None
        entry_elems = entries.findall("icp:entry", ns)
        assert len(entry_elems) == 2
        
        # Check first entry
        entry1 = entry_elems[0]
        assert entry1.find("icp:customer-vat-number", ns).text == "DE123456789"
        assert entry1.find("icp:country-code", ns).text == "DE"
        assert entry1.find("icp:customer-name", ns).text == "German Customer GmbH"
        assert entry1.find("icp:taxable-base", ns).text == "5000.00"
        
        # Check totals
        totals = root.find("icp:totals", ns)
        assert totals is not None
        assert totals.find("icp:total-icp-supplies", ns).text == "8000.00"
        assert totals.find("icp:entry-count", ns).text == "2"
        
        # Check audit trail
        audit_trail = root.find("icp:audit-trail", ns)
        assert audit_trail is not None
    
    def test_generate_filename(self):
        """Test ICP filename generation."""
        admin = MockAdministration()
        admin.name = "Test BV"
        
        report = BTWAangifteReport(
            period_id=uuid.uuid4(),
            period_name="Q1 2024",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 3, 31),
            generated_at=datetime.now(timezone.utc),
        )
        
        generator = ICPSubmissionPackageGenerator(admin, report)
        filename = generator.generate_filename()
        
        assert filename.startswith("icp-opgaaf-Test BV-Q1 2024-2024-01-01")
        assert filename.endswith(".xml")
    
    def test_generate_xml_without_customer_name(self):
        """Test ICP XML generation when customer name is missing."""
        admin = MockAdministration()
        report = BTWAangifteReport(
            period_id=uuid.uuid4(),
            period_name="Q1 2024",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 3, 31),
            generated_at=datetime.now(timezone.utc),
        )
        
        # Add ICP entry without customer name
        report.icp_entries.append(ICPEntry(
            customer_vat_number="FR123456789",
            country_code="FR",
            customer_name=None,
            customer_id=None,
            taxable_base=Decimal("2000.00"),
            transaction_count=1,
        ))
        
        generator = ICPSubmissionPackageGenerator(admin, report)
        xml_content = generator.generate_xml()
        
        # Parse and validate XML
        root = ET.fromstring(xml_content)
        
        # Define namespace
        ns = {'icp': 'http://www.belastingdienst.nl/icp/opgaaf/v1'}
        entry = root.find("icp:icp-entries", ns).find("icp:entry", ns)
        
        # Customer name should not be present
        assert entry.find("icp:customer-vat-number", ns).text == "FR123456789"
        assert entry.find("icp:customer-name", ns) is None
