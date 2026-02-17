"""
Tests for Tax Submission Connector

Tests cover:
- PackageOnlyConnector behavior
- DigipoortConnector configuration validation
- Connector factory function
- Submission result structure
"""
import pytest
import uuid
from unittest.mock import patch

from app.services.tax_submission_connector import (
    TaxSubmissionConnector,
    PackageOnlyConnector,
    DigipoortConnector,
    get_tax_connector,
    SubmissionResult,
    SubmissionStatus,
)


class TestSubmissionResult:
    """Tests for SubmissionResult class."""
    
    def test_submission_result_creation(self):
        """Test creating a submission result."""
        submission_id = uuid.uuid4()
        result = SubmissionResult(
            submission_id=submission_id,
            reference="TEST-REF-123",
            status=SubmissionStatus.DRAFT,
            response_data={"key": "value"},
        )
        
        assert result.submission_id == submission_id
        assert result.reference == "TEST-REF-123"
        assert result.status == SubmissionStatus.DRAFT
        assert result.response_data == {"key": "value"}
        assert result.timestamp is not None
    
    def test_submission_result_to_dict(self):
        """Test converting submission result to dictionary."""
        submission_id = uuid.uuid4()
        result = SubmissionResult(
            submission_id=submission_id,
            reference="TEST-REF-123",
            status=SubmissionStatus.SUBMITTED,
        )
        
        data = result.to_dict()
        assert data["submission_id"] == str(submission_id)
        assert data["reference"] == "TEST-REF-123"
        assert data["status"] == "SUBMITTED"
        assert "timestamp" in data


class TestPackageOnlyConnector:
    """Tests for PackageOnlyConnector."""
    
    @pytest.mark.asyncio
    async def test_submit_btw(self):
        """Test BTW submission in package-only mode."""
        connector = PackageOnlyConnector()
        submission_id = uuid.uuid4()
        
        result = await connector.submit_btw(
            xml_content="<btw>test content</btw>",
            administration_id=uuid.uuid4(),
            period_id=uuid.uuid4(),
            submission_id=submission_id,
        )
        
        # Verify result
        assert result.submission_id == submission_id
        assert result.reference == f"BTW-PKG-{submission_id}"
        assert result.status == SubmissionStatus.DRAFT
        assert result.response_data["mode"] == "PACKAGE_ONLY"
        assert result.response_data["xml_size"] == len("<btw>test content</btw>")
        assert "Package generated" in result.response_data["message"]
    
    @pytest.mark.asyncio
    async def test_submit_icp(self):
        """Test ICP submission in package-only mode."""
        connector = PackageOnlyConnector()
        submission_id = uuid.uuid4()
        
        result = await connector.submit_icp(
            xml_content="<icp>test content</icp>",
            administration_id=uuid.uuid4(),
            period_id=uuid.uuid4(),
            submission_id=submission_id,
        )
        
        # Verify result
        assert result.submission_id == submission_id
        assert result.reference == f"ICP-PKG-{submission_id}"
        assert result.status == SubmissionStatus.DRAFT
        assert result.response_data["mode"] == "PACKAGE_ONLY"
        assert result.response_data["xml_size"] == len("<icp>test content</icp>")
    
    @pytest.mark.asyncio
    async def test_get_status(self):
        """Test getting status for package-only submission."""
        connector = PackageOnlyConnector()
        
        status = await connector.get_status("BTW-PKG-123")
        
        assert status["reference"] == "BTW-PKG-123"
        assert status["status"] == SubmissionStatus.DRAFT.value
        assert "Package-only mode" in status["message"]


class TestDigipoortConnector:
    """Tests for DigipoortConnector."""
    
    def test_connector_creation_with_valid_config(self):
        """Test creating Digipoort connector with valid configuration."""
        connector = DigipoortConnector(
            endpoint="https://test.digipoort.nl",
            client_id="test_client",
            client_secret="test_secret",
            cert_path="/path/to/cert.pem",
        )
        
        assert connector.mode == "DIGIPOORT"
        assert connector.endpoint == "https://test.digipoort.nl"
        assert connector.client_id == "test_client"
        assert connector.client_secret == "test_secret"
        assert connector.cert_path == "/path/to/cert.pem"
    
    def test_connector_creation_missing_endpoint(self):
        """Test that missing endpoint raises error."""
        with pytest.raises(ValueError, match="DIGIPOORT_ENDPOINT is required"):
            DigipoortConnector(
                endpoint="",
                client_id="test_client",
                client_secret="test_secret",
            )
    
    def test_connector_creation_missing_client_id(self):
        """Test that missing client_id raises error."""
        with pytest.raises(ValueError, match="DIGIPOORT_CLIENT_ID is required"):
            DigipoortConnector(
                endpoint="https://test.digipoort.nl",
                client_id="",
                client_secret="test_secret",
            )
    
    def test_connector_creation_missing_client_secret(self):
        """Test that missing client_secret raises error."""
        with pytest.raises(ValueError, match="DIGIPOORT_CLIENT_SECRET is required"):
            DigipoortConnector(
                endpoint="https://test.digipoort.nl",
                client_id="test_client",
                client_secret="",
            )
    
    @pytest.mark.asyncio
    async def test_submit_btw_placeholder(self):
        """Test BTW submission in Digipoort mode (placeholder)."""
        connector = DigipoortConnector(
            endpoint="https://test.digipoort.nl",
            client_id="test_client",
            client_secret="test_secret",
        )
        submission_id = uuid.uuid4()
        
        result = await connector.submit_btw(
            xml_content="<btw>test content</btw>",
            administration_id=uuid.uuid4(),
            period_id=uuid.uuid4(),
            submission_id=submission_id,
        )
        
        # Verify placeholder result
        assert result.submission_id == submission_id
        assert result.reference == f"DIGIPOORT-BTW-{submission_id}"
        assert result.status == SubmissionStatus.DRAFT  # Placeholder status
        assert result.response_data["mode"] == "DIGIPOORT"
        assert "PLACEHOLDER" in result.response_data["message"]
    
    @pytest.mark.asyncio
    async def test_submit_icp_placeholder(self):
        """Test ICP submission in Digipoort mode (placeholder)."""
        connector = DigipoortConnector(
            endpoint="https://test.digipoort.nl",
            client_id="test_client",
            client_secret="test_secret",
        )
        submission_id = uuid.uuid4()
        
        result = await connector.submit_icp(
            xml_content="<icp>test content</icp>",
            administration_id=uuid.uuid4(),
            period_id=uuid.uuid4(),
            submission_id=submission_id,
        )
        
        # Verify placeholder result
        assert result.submission_id == submission_id
        assert result.reference == f"DIGIPOORT-ICP-{submission_id}"
        assert result.status == SubmissionStatus.DRAFT  # Placeholder status


class TestConnectorFactory:
    """Tests for connector factory function."""
    
    @patch('app.services.tax_submission_connector.settings')
    def test_get_package_only_connector_by_default(self, mock_settings):
        """Test that package-only connector is returned by default."""
        # Mock settings with no Digipoort config
        mock_settings.DIGIPOORT_ENABLED = None
        
        connector = get_tax_connector()
        
        assert isinstance(connector, PackageOnlyConnector)
        assert connector.mode == "PACKAGE_ONLY"
    
    @patch('app.services.tax_submission_connector.settings')
    def test_get_package_only_connector_when_disabled(self, mock_settings):
        """Test that package-only connector is returned when Digipoort is disabled."""
        mock_settings.DIGIPOORT_ENABLED = "false"
        
        connector = get_tax_connector()
        
        assert isinstance(connector, PackageOnlyConnector)
    
    @patch('app.services.tax_submission_connector.settings')
    def test_get_digipoort_connector_when_enabled(self, mock_settings):
        """Test that Digipoort connector is returned when enabled."""
        mock_settings.DIGIPOORT_ENABLED = "true"
        mock_settings.DIGIPOORT_ENDPOINT = "https://test.digipoort.nl"
        mock_settings.DIGIPOORT_CLIENT_ID = "test_client"
        mock_settings.DIGIPOORT_CLIENT_SECRET = "test_secret"
        mock_settings.DIGIPOORT_CERT_PATH = None
        
        connector = get_tax_connector()
        
        assert isinstance(connector, DigipoortConnector)
        assert connector.mode == "DIGIPOORT"
    
    @patch('app.services.tax_submission_connector.settings')
    def test_get_digipoort_connector_raises_on_invalid_config(self, mock_settings):
        """Test that invalid Digipoort config raises error."""
        mock_settings.DIGIPOORT_ENABLED = "true"
        mock_settings.DIGIPOORT_ENDPOINT = ""  # Missing endpoint
        mock_settings.DIGIPOORT_CLIENT_ID = "test_client"
        mock_settings.DIGIPOORT_CLIENT_SECRET = "test_secret"
        
        with pytest.raises(ValueError):
            get_tax_connector()


class TestSubmissionStatus:
    """Tests for SubmissionStatus enum."""
    
    def test_status_enum_values(self):
        """Test that all status values exist."""
        assert SubmissionStatus.DRAFT.value == "DRAFT"
        assert SubmissionStatus.SUBMITTED.value == "SUBMITTED"
        assert SubmissionStatus.CONFIRMED.value == "CONFIRMED"
        assert SubmissionStatus.REJECTED.value == "REJECTED"
