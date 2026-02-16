# BTW/ICP Electronic Submission - Phase B Implementation Guide

## Overview
Phase B will implement the Digipoort connector for direct electronic submission of BTW and ICP returns to the Dutch Belastingdienst.

## Architecture

### Components

#### 1. Digipoort Worker Service (`backend/app/services/digipoort_worker.py`)
A separate async service module that handles submission queue and communication with Digipoort.

**Key responsibilities:**
- Queue management for pending submissions
- Certificate handling (PKIoverheid server certificates)
- WUS/FTP interface implementation
- Receipt storage and status tracking
- Error handling and retry logic

#### 2. Submission Queue
Redis-based queue for managing submission requests.

**States:**
- `PENDING`: Submission queued
- `IN_PROGRESS`: Being sent to Digipoort
- `SUBMITTED`: Sent, awaiting receipt
- `CONFIRMED`: Receipt received, submission confirmed
- `FAILED`: Submission failed
- `RETRYING`: Automatic retry in progress

#### 3. Certificate Management
PKIoverheid server certificates for secure communication.

**Storage:**
- Certificates stored as environment variables in Coolify
- Mounted as secrets in Docker containers
- Private keys encrypted at rest
- Certificate rotation support

#### 4. Database Tables

##### `submission_requests`
```sql
CREATE TABLE submission_requests (
    id UUID PRIMARY KEY,
    administration_id UUID NOT NULL REFERENCES administrations(id),
    period_id UUID NOT NULL REFERENCES accounting_periods(id),
    submission_type VARCHAR(10) NOT NULL CHECK (submission_type IN ('BTW', 'ICP')),
    status VARCHAR(20) NOT NULL,
    xml_content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    submitted_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    correlation_id VARCHAR(100) UNIQUE
);
```

##### `submission_receipts`
```sql
CREATE TABLE submission_receipts (
    id UUID PRIMARY KEY,
    submission_request_id UUID NOT NULL REFERENCES submission_requests(id),
    receipt_type VARCHAR(20) NOT NULL,
    receipt_content TEXT NOT NULL,
    received_at TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL
);
```

## Implementation Steps

### Step 1: Backend Service
1. Create `backend/app/services/digipoort/` module
2. Implement certificate loading and validation
3. Create WUS/FTP client
4. Implement submission queue worker
5. Add receipt parser and validator

### Step 2: Database Migrations
1. Create Alembic migration for new tables
2. Add indexes for performance
3. Add foreign key constraints

### Step 3: API Endpoints
Add new endpoints to `backend/app/api/v1/vat.py`:

```python
@router.post("/clients/{client_id}/tax/btw/submit")
async def submit_btw_return(...)
    """Submit BTW return via Digipoort."""

@router.post("/clients/{client_id}/tax/icp/submit")
async def submit_icp_return(...)
    """Submit ICP return via Digipoort."""

@router.get("/submissions/{submission_id}")
async def get_submission_status(...)
    """Get status of a submission."""

@router.get("/submissions/{submission_id}/timeline")
async def get_submission_timeline(...)
    """Get timeline of submission events."""
```

### Step 4: Frontend UI
Update `src/components/ClientVatTab.tsx`:

1. Add "Verzenden naar Belastingdienst" button
2. Add submission status timeline component
3. Add submission confirmation dialog
4. Add progress indicator during submission
5. Show receipt details when available

### Step 5: Configuration
Add environment variables in Coolify:

```bash
# Digipoort Configuration
DIGIPOORT_MODE=test|production
DIGIPOORT_ENDPOINT=https://digipoort.test.belastingdienst.nl
DIGIPOORT_CERT_PATH=/secrets/digipoort-cert.pem
DIGIPOORT_KEY_PATH=/secrets/digipoort-key.pem
DIGIPOORT_CA_PATH=/secrets/pkioverheid-ca.pem

# Retry Configuration
DIGIPOORT_MAX_RETRIES=3
DIGIPOORT_RETRY_DELAY=60  # seconds
DIGIPOORT_RETRY_BACKOFF=exponential
```

### Step 6: Testing
1. Unit tests for certificate handling
2. Integration tests with Digipoort test environment
3. End-to-end tests for full submission flow
4. Error scenario testing (network failures, invalid certs, etc.)

## Digipoort Interface

### WUS (Web-Services Uitwisselingsstandaard)
SOAP-based web service for submission.

**Key operations:**
- `aanleverenBericht`: Submit a message
- `statusBericht`: Check message status
- `ontvangstBevestiging`: Receive confirmation

### FTP Interface
Alternative file-based submission method.

**Process:**
1. Upload XML file to FTP server
2. File is processed asynchronously
3. Status files are created on server
4. Client polls for status updates

## Security Considerations

### Certificate Management
- Use PKIoverheid server certificates
- Store private keys securely (Coolify secrets)
- Implement certificate expiry monitoring
- Support certificate rotation without downtime

### Data Protection
- Encrypt XML content at rest
- Use TLS 1.3 for all communications
- Sanitize error messages (no sensitive data in logs)
- Audit all submission attempts

### Access Control
- Only accountants can submit returns
- Require explicit confirmation before submission
- Log all submission attempts with user details
- Rate limit submission requests

## Error Handling

### Retry Strategy
```python
def should_retry(error_code: str) -> bool:
    """Determine if error is retryable."""
    retryable_errors = [
        "NETWORK_TIMEOUT",
        "SERVICE_UNAVAILABLE",
        "RATE_LIMIT_EXCEEDED",
    ]
    return error_code in retryable_errors

def calculate_retry_delay(attempt: int) -> int:
    """Calculate exponential backoff delay."""
    return min(60 * (2 ** attempt), 3600)  # Max 1 hour
```

### Non-Retryable Errors
- Invalid certificate
- Malformed XML
- Period already submitted
- Validation errors from Belastingdienst

## Monitoring & Observability

### Metrics to Track
- Submission success rate
- Average submission time
- Retry rate
- Certificate expiry alerts
- Queue depth

### Logging
- Log all submission attempts with correlation IDs
- Log all Digipoort responses
- Log certificate validation results
- Log retry attempts and outcomes

## Testing Strategy

### Test Mode
Use Digipoort test environment for development.

**Test environment features:**
- Separate endpoint URL
- Test certificates
- Faster processing times
- No actual filing with tax authority

### Sandbox Configuration
```python
class DigipoortConfig:
    def __init__(self, mode: str):
        self.mode = mode
        if mode == "test":
            self.endpoint = "https://digipoort.test.belastingdienst.nl"
            self.timeout = 30
        else:
            self.endpoint = "https://digipoort.belastingdienst.nl"
            self.timeout = 120
```

## Rollout Plan

### Phase 1: Infrastructure
- Set up test environment
- Configure certificates
- Create database tables

### Phase 2: Backend Development
- Implement Digipoort client
- Create submission queue
- Add API endpoints

### Phase 3: Frontend Development
- Add submission UI
- Implement status timeline
- Add confirmation dialogs

### Phase 4: Testing
- Unit tests
- Integration tests
- UAT with test environment

### Phase 5: Production Rollout
- Deploy to production
- Monitor initial submissions
- Gather user feedback

## Maintenance

### Regular Tasks
- Certificate renewal (annually)
- Monitor submission queue
- Review failed submissions
- Update API endpoints if Belastingdienst changes

### Support Procedures
- Resubmit failed submissions manually
- Contact Belastingdienst support for issues
- Debug using correlation IDs
- Review audit logs for compliance

## Future Enhancements

### Potential Features
- Batch submission support
- Automatic retry scheduling
- Email notifications for submission status
- Dashboard for submission statistics
- Integration with period closing workflow
- Automatic period submission on approval
