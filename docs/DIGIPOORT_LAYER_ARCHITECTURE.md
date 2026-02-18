# Digipoort Layer Architecture

## Overview

The Digipoort integration layer provides a production-ready architecture for submitting Dutch VAT (BTW) and ICP declarations to the Belastingdienst via Digipoort. **Phase 2** focuses on sandbox mode only—no real network calls are made to Belastingdienst.

### Current State: Sandbox Mode Only

- ✅ Full SOAP envelope construction
- ✅ PKI signing integration (reuses existing infrastructure)
- ✅ Sandbox simulation with realistic responses
- ✅ Audit trail integration
- ✅ Status tracking and polling
- ✅ Strong tenant isolation
- ❌ Real network calls to Digipoort (Phase 3)

## Architecture Components

### 1. DigipoortService

**Location:** `backend/app/services/digipoort_service.py`

The core service handling all Digipoort-related operations:

```python
class DigipoortService:
    def __init__(self, sandbox_mode: bool = True)
    
    # SOAP message construction
    def build_soap_envelope(...) -> str
    def attach_signed_xml(...) -> Tuple[str, str]
    
    # Submission handling
    def simulate_sandbox_submission(...) -> SubmissionResult
    async def submit_to_digipoort(...) -> SubmissionResult
    
    # Response processing
    def parse_sandbox_response(...) -> Dict[str, Any]
```

#### Key Features:

- **SOAP 1.2 Envelope:** Builds standards-compliant SOAP envelopes with WS-Addressing headers
- **MIME Multipart:** Attaches signed XML as multipart/related content
- **Sandbox Simulation:** Generates realistic Digipoort responses without network calls
- **Production Ready:** Architecture ready for real SOAP calls (Phase 3)

### 2. Status Flow

```
DRAFT
  ↓ (prepare submission)
QUEUED
  ↓ (queue_submission with PKI signing)
SENT (if DIGIPOORT_ENABLED=true, sandbox immediately sends)
  ↓ (sandbox auto-processes)
ACCEPTED (successful)
  or
REJECTED (validation errors)
```

In sandbox mode, the flow from QUEUED → SENT → ACCEPTED happens immediately.

### 3. Integration Points

#### A. VAT Submission Service

**Location:** `backend/app/services/vat_submission_service.py`

The `queue_submission` method now:
1. Signs payload with PKI certificate
2. Generates correlation_id
3. Updates status to QUEUED
4. If `DIGIPOORT_ENABLED=true`, immediately calls DigipoortService
5. Logs all events to audit trail

```python
async def queue_submission(
    submission_id: UUID,
    certificate_id: Optional[UUID] = None
) -> VatSubmission:
    # ... signing logic ...
    
    if settings.digipoort_enabled:
        digipoort_service = DigipoortService(
            sandbox_mode=settings.digipoort_sandbox_mode
        )
        result = await digipoort_service.submit_to_digipoort(...)
        # Update submission with result
```

#### B. Audit Logging

**Location:** `backend/app/services/logging.py`

New event types:
- `digipoort.queued` - Submission queued for sending
- `digipoort.sent` - Submission sent to Digipoort
- `digipoort.accepted` - Submission accepted by Belastingdienst
- `digipoort.rejected` - Submission rejected by Belastingdienst
- `digipoort.error` - Technical error during submission

All events include:
- `correlation_id` for tracking
- `submission_id`, `client_id`, `period_id` for context
- `message_id` from Digipoort (when available)

#### C. Status Polling API

**Endpoint:** `GET /api/v1/accountant/clients/{client_id}/vat/submissions/{id}/status`

Returns:
```json
{
  "submission_id": "uuid",
  "status": "ACCEPTED",
  "digipoort_message_id": "DGP-XXXXXXXXXXXX",
  "correlation_id": "uuid",
  "last_checked_at": "2026-02-18T10:30:00Z",
  "status_message": "Geaccepteerd door Belastingdienst",
  "error_code": null,
  "error_message": null,
  "metadata": {
    "mode": "SANDBOX",
    "ontvangstbevestiging": {...},
    "verwerkingsstatus": {...}
  }
}
```

## Configuration

### Environment Variables

```bash
# Enable Digipoort integration (default: false)
DIGIPOORT_ENABLED=false

# Use sandbox mode - simulates responses without network calls (default: true)
DIGIPOORT_SANDBOX_MODE=true

# Production credentials (only needed when DIGIPOORT_SANDBOX_MODE=false)
DIGIPOORT_ENDPOINT=https://test.digipoort.belastingdienst.nl/api/v1
DIGIPOORT_CLIENT_ID=your_client_id
DIGIPOORT_CLIENT_SECRET=your_client_secret
DIGIPOORT_CERT_PATH=/path/to/client/certificate.pem  # optional
```

### Feature Flag Logic

```python
# In config.py
@property
def digipoort_enabled(self) -> bool:
    return bool(self.DIGIPOORT_ENABLED and 
                str(self.DIGIPOORT_ENABLED).lower() == 'true')

@property
def digipoort_sandbox_mode(self) -> bool:
    return str(self.DIGIPOORT_SANDBOX_MODE).lower() != 'false'
```

**Default behavior (no env vars set):**
- `DIGIPOORT_ENABLED` → False (Digipoort integration disabled)
- `DIGIPOORT_SANDBOX_MODE` → True (safe default)

**To enable sandbox mode:**
```bash
DIGIPOORT_ENABLED=true
DIGIPOORT_SANDBOX_MODE=true  # or omit (defaults to true)
```

## SOAP Message Structure

### Envelope Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope 
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsa="http://www.w3.org/2005/08/addressing"
  xmlns:dp="http://www.belastingdienst.nl/digipoort/v1">
  
  <soap:Header>
    <!-- WS-Addressing headers -->
    <wsa:Action>http://www.belastingdienst.nl/digipoort/v1/SubmitBTW</wsa:Action>
    <wsa:MessageID>urn:uuid:{correlation_id}</wsa:MessageID>
    <wsa:To>https://digipoort.belastingdienst.nl/wus/submit</wsa:To>
    
    <!-- Digipoort headers -->
    <dp:SubmissionHeader>
      <dp:CorrelationID>{correlation_id}</dp:CorrelationID>
      <dp:SubmissionType>BTW</dp:SubmissionType>
      <dp:ClientID>{administration_id}</dp:ClientID>
      <dp:PeriodID>{period_id}</dp:PeriodID>
      <dp:Timestamp>{iso_timestamp}</dp:Timestamp>
    </dp:SubmissionHeader>
  </soap:Header>
  
  <soap:Body>
    <dp:SubmitRequest>
      <dp:AttachmentReference>cid:signed-xml-attachment</dp:AttachmentReference>
    </dp:SubmitRequest>
  </soap:Body>
</soap:Envelope>
```

### MIME Multipart Structure

```
Content-Type: multipart/related; boundary="----=_Part_xxxx"; type="application/soap+xml"

------=_Part_xxxx
Content-Type: application/soap+xml; charset=UTF-8
Content-Transfer-Encoding: 8bit
Content-ID: <soap-envelope>

[SOAP Envelope XML]

------=_Part_xxxx
Content-Type: application/xml; charset=UTF-8
Content-Transfer-Encoding: 8bit
Content-ID: <signed-xml-attachment>

[PKI-Signed BTW/ICP XML]

------=_Part_xxxx--
```

## Sandbox Response Simulation

### Simulated Response Metadata

```json
{
  "mode": "SANDBOX",
  "message_size_bytes": 12345,
  "message_hash": "a1b2c3d4e5f6...",
  "submission_type": "BTW",
  "simulated_at": "2026-02-18T10:30:00Z",
  "ontvangstbevestiging": {
    "berichtnummer": "DGP-1234567890ABCDEF",
    "tijdstempel": "2026-02-18T10:30:00Z",
    "status": "ONTVANGEN"
  },
  "verwerkingsstatus": {
    "status": "GEACCEPTEERD",
    "statuscode": "OK",
    "omschrijving": "Aangifte succesvol verwerkt (sandbox simulatie)"
  }
}
```

## Sequence Diagram (Sandbox Mode)

```
User (Accountant)
    |
    | 1. Prepare VAT submission (generate XML)
    v
VatSubmissionService
    |
    | 2. Create draft submission (status=DRAFT)
    |
    | 3. Queue submission with certificate_id
    v
VatSubmissionService.queue_submission()
    |
    | 4. Sign XML with PKI certificate
    v
SigningService (existing)
    |
    | 5. Return signed XML
    v
VatSubmissionService
    |
    | 6. Update status=QUEUED
    |
    | 7. Log DIGIPOORT_QUEUED event
    |
    | 8. If DIGIPOORT_ENABLED=true
    v
DigipoortService
    |
    | 9. Build SOAP envelope
    |
    | 10. Attach signed XML as MIME multipart
    |
    | 11. simulate_sandbox_submission()
    |     (In sandbox: generates fake response immediately)
    |     (In production: would POST to Digipoort API)
    |
    | 12. Return SubmissionResult (status=ACCEPTED)
    v
VatSubmissionService
    |
    | 13. Update submission:
    |     - status=ACCEPTED
    |     - digipoort_message_id=DGP-xxx
    |     - last_status_check_at=now
    |     - connector_response (stores full metadata)
    |
    | 14. Log DIGIPOORT_SENT event
    | 15. Log DIGIPOORT_ACCEPTED event
    v
Database
    |
    | 16. Submission stored with full audit trail
    v
Return to User
```

## How to Enable Production Mode (Future - Phase 3)

### Prerequisites

1. **Obtain Digipoort Credentials:**
   - Register with Belastingdienst
   - Obtain Client ID and Client Secret
   - Configure mTLS certificates (if required)

2. **Test Environment Setup:**
   ```bash
   DIGIPOORT_ENABLED=true
   DIGIPOORT_SANDBOX_MODE=false
   DIGIPOORT_ENDPOINT=https://test.digipoort.belastingdienst.nl/api/v1
   DIGIPOORT_CLIENT_ID=your_test_client_id
   DIGIPOORT_CLIENT_SECRET=your_test_client_secret
   DIGIPOORT_CERT_PATH=/secrets/digipoort-test-cert.pem
   ```

### Implementation Steps (Phase 3)

1. **Implement Real SOAP Client:**
   ```python
   # In DigipoortService.submit_to_digipoort()
   if not self.sandbox_mode:
       # POST MIME message to Digipoort endpoint
       async with httpx.AsyncClient(
           cert=(cert_path, key_path),
           timeout=30.0
       ) as client:
           response = await client.post(
               self.endpoint,
               content=mime_message,
               headers={
                   'Content-Type': content_type,
                   'Authorization': f'Bearer {access_token}'
               }
           )
           # Parse SOAP response
           return self._parse_digipoort_response(response.text)
   ```

2. **Add OAuth2 Authentication:**
   - Implement token acquisition
   - Handle token refresh
   - Store tokens securely

3. **Add Response Parser:**
   - Parse SOAP response envelope
   - Extract message_id and status
   - Handle errors and rejections

4. **Add Status Polling:**
   - Implement periodic status checks
   - Update submission status asynchronously
   - Handle intermediate statuses (RECEIVED, PROCESSING)

### Security Considerations

- ✅ **Never log full signed XML** (contains sensitive taxpayer data)
- ✅ **Never log private keys** (PKI certificates handled securely)
- ✅ **Store only safe response data** (message_id, status codes, timestamps)
- ✅ **Validate tenant ownership** (all endpoints check client_id)
- ✅ **Audit all actions** (full event trail in logs)
- ⚠️ **mTLS certificates** (production requires secure certificate management)
- ⚠️ **Credential rotation** (implement secret rotation for client credentials)

## Testing

### Unit Tests

**Location:** `backend/tests/test_digipoort_service.py`

Coverage:
- ✅ SOAP envelope construction
- ✅ MIME multipart attachment
- ✅ Sandbox simulation
- ✅ Response parsing
- ✅ Configuration handling
- ✅ Integration flow

Run tests:
```bash
cd backend
pytest tests/test_digipoort_service.py -v
```

### Existing Tests

**Location:** 
- `backend/tests/test_digipoort_submission_service.py` - Service integration
- `backend/tests/test_digipoort_endpoints.py` - API endpoints

## Troubleshooting

### Issue: Submission stays in QUEUED status

**Cause:** DIGIPOORT_ENABLED is not set or set to false

**Solution:** 
```bash
export DIGIPOORT_ENABLED=true
```

### Issue: "Production Digipoort submission not yet implemented"

**Cause:** DIGIPOORT_SANDBOX_MODE is set to false

**Solution:** Keep sandbox mode enabled:
```bash
export DIGIPOORT_SANDBOX_MODE=true
```

### Issue: No correlation_id in logs

**Cause:** Audit logging not capturing events

**Solution:** Check that `accounting_logger` is being called in queue_submission

### Issue: Signed XML is empty

**Cause:** PKI certificate not configured

**Solution:** Register a PKIoverheid certificate first via `/api/v1/certificates`

## Future Enhancements (Phase 3+)

1. **Real Network Integration:**
   - Implement SOAP HTTP client
   - Add OAuth2 authentication
   - Parse real Digipoort responses

2. **Asynchronous Status Polling:**
   - Background job to check submission status
   - WebSocket notifications for status updates
   - Email notifications on acceptance/rejection

3. **Retry Logic:**
   - Automatic retry on transient errors
   - Exponential backoff
   - Dead letter queue for failed submissions

4. **Enhanced Error Handling:**
   - Map Digipoort error codes to user-friendly messages
   - Suggest corrective actions
   - Validation before submission

5. **Monitoring & Metrics:**
   - Prometheus metrics for submission rates
   - Success/failure rates
   - Average processing time
   - Alert on sustained failures

## References

- [Belastingdienst Digipoort Documentation](https://www.logius.nl/diensten/digipoort)
- [PKIoverheid Certificates](https://www.logius.nl/diensten/pkioverheid)
- [SOAP 1.2 Specification](https://www.w3.org/TR/soap12/)
- [WS-Addressing Specification](https://www.w3.org/Submission/ws-addressing/)

---

**Last Updated:** 2026-02-18  
**Status:** Phase 2 Complete (Sandbox Mode Only)  
**Next Phase:** Phase 3 - Production Network Integration
