# VAT/BTW Digipoort Connector

## Overview

The VAT Digipoort Connector provides a pluggable backend abstraction for submitting BTW (VAT) and ICP (Intra-Community supplies) declarations to the Dutch tax authority (Belastingdienst) via Digipoort.

This implementation supports two modes:
1. **PACKAGE_ONLY** (default): Safe mode that stores XML packages locally without making network calls
2. **DIGIPOORT** (optional): Placeholder skeleton for future Digipoort API integration

## Architecture

### Components

```
┌─────────────────────────────────────────────────────┐
│              VAT API Endpoints                      │
│  POST /api/accountant/clients/{id}/tax/btw/submit  │
│  POST /api/accountant/clients/{id}/tax/icp/submit  │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│         Tax Submission Connector Factory            │
│           get_tax_connector()                       │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌─────────────────┐       ┌─────────────────────┐
│ PackageOnly     │       │ Digipoort           │
│ Connector       │       │ Connector           │
│ (Default)       │       │ (Optional)          │
└─────────────────┘       └─────────────────────┘
```

### Interface: TaxSubmissionConnector

All connectors implement the abstract `TaxSubmissionConnector` interface:

```python
class TaxSubmissionConnector(ABC):
    @abstractmethod
    async def submit_btw(
        xml_content: str,
        administration_id: UUID,
        period_id: UUID,
        submission_id: UUID,
    ) -> SubmissionResult
    
    @abstractmethod
    async def submit_icp(
        xml_content: str,
        administration_id: UUID,
        period_id: UUID,
        submission_id: UUID,
    ) -> SubmissionResult
    
    @abstractmethod
    async def get_status(reference: str) -> Dict[str, Any]
```

## Connectors

### 1. PackageOnlyConnector (Default)

**Purpose:** Safe default for manual submission workflows.

**Behavior:**
- Does NOT make any network calls
- Stores XML package information
- Generates a local reference ID (e.g., `BTW-PKG-{submission_id}`)
- Returns status=DRAFT
- Accountants download the package and submit manually via tax authority portal

**Use Case:** Production use when Digipoort integration is not available or desired.

**Configuration:** No configuration required. This is the default mode.

**Example Flow:**
1. Accountant calls `/api/accountant/clients/{id}/tax/btw/submit`
2. System generates BTW XML package
3. PackageOnlyConnector stores package locally
4. Returns: `{ submission_id, reference: "BTW-PKG-xxx", status: "DRAFT" }`
5. Accountant can later download the XML and submit manually
6. Accountant marks submission as "SUBMITTED" via separate endpoint

### 2. DigipoortConnector (Placeholder/Skeleton)

**Purpose:** Placeholder for future Digipoort API integration.

**Current Status:** 
- Skeleton implementation only
- Validates configuration
- Does NOT make actual API calls yet
- Returns placeholder responses

**Future Implementation:** Will make real network calls to Digipoort service.

**Configuration:** Set the following environment variables:

```bash
# Enable Digipoort mode
DIGIPOORT_ENABLED=true

# Digipoort API endpoint
DIGIPOORT_ENDPOINT=https://digipoort.belastingdienst.nl/api/v1

# Authentication credentials
DIGIPOORT_CLIENT_ID=your_client_id
DIGIPOORT_CLIENT_SECRET=your_client_secret

# Optional: Path to client certificate
DIGIPOORT_CERT_PATH=/path/to/client/certificate.pem
```

**Use Case:** Future production use when Digipoort integration is fully implemented.

## API Endpoints

### POST /api/accountant/clients/{client_id}/tax/btw/submit

Submit BTW (VAT) declaration via configured connector.

**Request:**
```json
{
  "period_id": "uuid"
}
```

**Permissions:**
- Requires accountant access to the client
- Period must be in `READY_FOR_FILING` status

**Response:**
```json
{
  "id": "uuid",
  "administration_id": "uuid",
  "period_id": "uuid",
  "submission_type": "BTW",
  "created_at": "2026-02-17T15:57:00Z",
  "created_by": "uuid",
  "method": "PACKAGE",
  "status": "DRAFT",
  "reference_text": "BTW-PKG-{submission_id}",
  "connector_response": {
    "mode": "PACKAGE_ONLY",
    "message": "Package generated. Ready for manual submission.",
    "xml_size": 12345
  },
  "submitted_at": null,
  "updated_at": "2026-02-17T15:57:00Z"
}
```

### POST /api/accountant/clients/{client_id}/tax/icp/submit

Submit ICP (Intra-Community supplies) declaration via configured connector.

**Request:**
```json
{
  "period_id": "uuid"
}
```

**Permissions:**
- Requires accountant access to the client
- Period must be in `READY_FOR_FILING` status

**Response:** Same structure as BTW submit, with `submission_type: "ICP"`

## Database Schema

### VatSubmission Model

```sql
CREATE TABLE vat_submissions (
    id UUID PRIMARY KEY,
    administration_id UUID NOT NULL REFERENCES administrations(id) ON DELETE CASCADE,
    period_id UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE CASCADE,
    submission_type VARCHAR(20) NOT NULL DEFAULT 'BTW', -- BTW or ICP
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL DEFAULT 'PACKAGE', -- PACKAGE or DIGIPOORT
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, SUBMITTED, CONFIRMED, REJECTED
    reference_text TEXT, -- Reference ID from connector
    attachment_url VARCHAR(500), -- Optional proof/receipt URL
    connector_response JSONB, -- Connector response data (NEW FIELD)
    submitted_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_vat_submissions_admin ON vat_submissions(administration_id);
CREATE INDEX ix_vat_submissions_period ON vat_submissions(period_id);
CREATE INDEX ix_vat_submissions_status ON vat_submissions(status);
CREATE INDEX ix_vat_submissions_admin_period ON vat_submissions(administration_id, period_id);
```

### New Field: connector_response

The `connector_response` JSONB field stores metadata from the connector:

**Package-only mode:**
```json
{
  "mode": "PACKAGE_ONLY",
  "message": "Package generated. Ready for manual submission.",
  "xml_size": 12345
}
```

**Digipoort mode (future):**
```json
{
  "mode": "DIGIPOORT",
  "message": "Submitted to Digipoort",
  "endpoint": "https://digipoort.belastingdienst.nl/api/v1",
  "digipoort_reference": "DGP-2026-12345",
  "response_code": "200"
}
```

## Security & Constraints

### No Breaking Changes
- Existing download package endpoints (`/clients/{id}/periods/{period_id}/submissions/btw/package`) remain unchanged
- New endpoints are additive only

### Network Call Safety
- **PACKAGE_ONLY mode (default):** Zero network calls, safe for production
- **DIGIPOORT mode:** Only makes network calls if explicitly enabled via `DIGIPOORT_ENABLED=true`
- Configuration validation ensures credentials are present before attempting network calls

### Permission Checks
All endpoints enforce:
1. **Accountant access:** User must have accountant role and access to the client
2. **Period status:** Period must be in `READY_FOR_FILING` status
3. **Multi-tenant isolation:** Administration ID is validated

## Testing

### Unit Tests

Test the connector abstraction:

```python
from app.services.tax_submission_connector import (
    get_tax_connector,
    PackageOnlyConnector,
    DigipoortConnector,
)

async def test_package_only_connector():
    connector = PackageOnlyConnector()
    result = await connector.submit_btw(
        xml_content="<xml>...</xml>",
        administration_id=uuid.uuid4(),
        period_id=uuid.uuid4(),
        submission_id=uuid.uuid4(),
    )
    assert result.status == SubmissionStatus.DRAFT
    assert "BTW-PKG-" in result.reference
```

### Integration Tests

Test the endpoints:

```python
async def test_submit_btw_via_connector(client, auth_headers):
    response = await client.post(
        f"/api/accountant/clients/{client_id}/tax/btw/submit",
        json={"period_id": str(period_id)},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["submission_type"] == "BTW"
    assert data["status"] == "DRAFT"
    assert data["method"] == "PACKAGE"
    assert "BTW-PKG-" in data["reference_text"]
```

## Verification Checklist

- [x] Abstract interface `TaxSubmissionConnector` defined
- [x] `PackageOnlyConnector` implemented (safe default)
- [x] `DigipoortConnector` skeleton implemented with env validation
- [x] Environment variables added to `config.py`
- [x] Database migration for `connector_response` field
- [x] POST `/api/accountant/clients/{id}/tax/btw/submit` endpoint added
- [x] POST `/api/accountant/clients/{id}/tax/icp/submit` endpoint added
- [x] Permission checks: accountant access + READY_FOR_FILING status
- [x] Response includes: submission_id, reference, status
- [x] No breaking changes to existing download endpoints
- [x] No network calls in PACKAGE_ONLY mode
- [x] Documentation complete

## Future Work

### Phase 2: Complete Digipoort Integration

To complete the Digipoort implementation:

1. **Authentication:**
   - Implement OAuth2 flow for Digipoort API
   - Handle certificate-based authentication if required

2. **API Calls:**
   - Implement `_call_digipoort_api()` helper method
   - Submit XML to Digipoort endpoint
   - Parse response and extract reference

3. **Status Checking:**
   - Implement `get_status()` to poll Digipoort for submission status
   - Handle status transitions: DRAFT → SUBMITTED → CONFIRMED/REJECTED

4. **Error Handling:**
   - Parse Digipoort error responses
   - Implement retry logic for transient failures
   - Log detailed error information

5. **Testing:**
   - Integration tests against Digipoort test environment
   - End-to-end workflow validation
   - Error scenario testing

## Configuration Examples

### Production (Package-only mode)

```bash
# .env
# No Digipoort configuration needed - uses safe default
```

### Development (Digipoort test mode)

```bash
# .env
DIGIPOORT_ENABLED=true
DIGIPOORT_ENDPOINT=https://test.digipoort.belastingdienst.nl/api/v1
DIGIPOORT_CLIENT_ID=test_client_id
DIGIPOORT_CLIENT_SECRET=test_client_secret
```

### Production (Digipoort enabled - future)

```bash
# .env
DIGIPOORT_ENABLED=true
DIGIPOORT_ENDPOINT=https://digipoort.belastingdienst.nl/api/v1
DIGIPOORT_CLIENT_ID=prod_client_id
DIGIPOORT_CLIENT_SECRET=prod_client_secret
DIGIPOORT_CERT_PATH=/etc/ssl/certs/digipoort_client.pem
```

## Support

For questions or issues:
1. Check this documentation
2. Review connector implementation in `backend/app/services/tax_submission_connector.py`
3. Check API endpoint implementation in `backend/app/api/v1/vat.py`
4. Review tests in `backend/tests/test_tax_submission_connector.py`
