# Digipoort Submission Foundation - Verification Guide

## Overview

This document provides verification steps for the Digipoort-ready VAT/ICP submission foundation implementation. This is **Phase A** - the foundation for automated submission without making external API calls yet.

## Implementation Summary

### Backend Components

1. **Database Model Updates** (`VatSubmission`)
   - Added Digipoort-specific fields:
     - `payload_hash`: SHA256 hash of XML payload
     - `payload_xml`: Generated XML content
     - `signed_xml`: Signed XML for submission (Phase B)
     - `digipoort_message_id`: Digipoort tracking ID (Phase B)
     - `correlation_id`: Internal tracking ID
     - `last_status_check_at`: Last status poll timestamp
     - `error_code`, `error_message`: Error tracking
   - Extended status enum: DRAFT → QUEUED → SUBMITTED → RECEIVED → ACCEPTED/REJECTED/FAILED

2. **Database Migration** (`042_add_digipoort_fields.py`)
   - Adds new columns to existing `vat_submissions` table
   - Creates index on `digipoort_message_id` for efficient lookups

3. **Service Layer** (`vat_submission_service.py`)
   - `build_payload(period_id, kind)`: Generates XML from VAT report
   - `validate_payload(xml)`: Basic XML schema validation
   - `sign_payload(xml, cert_ref)`: Placeholder for Phase B signing
   - `create_draft_submission(...)`: Creates DRAFT submission with payload
   - `queue_submission(submission_id, cert_ref)`: Moves to QUEUED status

4. **API Endpoints**
   - `POST /api/accountant/clients/{client_id}/vat/{period_id}/submit/prepare?kind=VAT|ICP`
     - Generates XML, validates, creates/updates DRAFT
     - Returns: submission_id, status, validation_errors, payload_hash
   - `POST /api/accountant/clients/{client_id}/vat/submissions/{submission_id}/queue`
     - Validates and queues submission
     - Returns: submission_id, status, correlation_id
   - `GET /api/accountant/clients/{client_id}/vat/submissions?period_id=&kind=`
     - Lists submissions with filters
     - Returns: paginated list, newest first

### Frontend Components

1. **BTWAangiftePage Updates**
   - New "Indienen via Digipoort" section
   - "Voorbereiden" button (VAT and ICP)
   - Validation error display
   - Status badge (DRAFT/QUEUED/etc.)
   - "In wachtrij zetten" button (enabled only for valid DRAFT)
   - Mobile-responsive design

## Verification Steps

### 1. Database Migration

```bash
cd backend
alembic upgrade head
```

**Expected:**
- Migration `042_add_digipoort_fields` runs successfully
- New columns added to `vat_submissions` table
- Index created on `digipoort_message_id`

**Verify in PostgreSQL:**
```sql
\d vat_submissions
```

Should show:
- `payload_hash` (varchar 64)
- `payload_xml` (text)
- `signed_xml` (text)
- `digipoort_message_id` (varchar 255)
- `correlation_id` (varchar 255)
- `last_status_check_at` (timestamp with time zone)
- `error_code` (varchar 50)
- `error_message` (text)

### 2. Service Layer Tests

```bash
cd backend
pytest tests/test_digipoort_submission_service.py -v
```

**Expected:**
- All tests pass
- Service methods exist and are callable
- Validation logic works correctly
- Placeholder signing returns unsigned XML

### 3. API Endpoint Tests

```bash
cd backend
pytest tests/test_digipoort_endpoints.py -v
```

**Expected:**
- All endpoints are registered
- Authorization checks are in place (`require_assigned_client`)
- Response models are correct
- Error handling is implemented

### 4. Backend Integration Test

Start the backend server:

```bash
cd backend
uvicorn app.main:app --reload
```

Test with curl (replace tokens and IDs):

```bash
# Prepare VAT submission
curl -X POST "http://localhost:8000/api/accountant/clients/{client_id}/vat/{period_id}/submit/prepare?kind=VAT" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind": "VAT"}'

# Expected response:
{
  "submission_id": "uuid...",
  "status": "DRAFT",
  "validation_errors": [],
  "payload_hash": "sha256..."
}

# Queue submission
curl -X POST "http://localhost:8000/api/accountant/clients/{client_id}/vat/submissions/{submission_id}/queue" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected response:
{
  "submission_id": "uuid...",
  "status": "QUEUED",
  "correlation_id": "uuid..."
}

# List submissions
curl "http://localhost:8000/api/accountant/clients/{client_id}/vat/submissions?kind=VAT" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected response:
{
  "submissions": [...],
  "total_count": 1
}
```

### 5. Frontend Integration Test

Start the frontend:

```bash
npm run dev
```

Navigate to BTW Aangifte page for a client:

1. **Check UI Elements:**
   - "Indienen via Digipoort" section is visible
   - "Voorbereiden" button is present
   - If ICP entries exist, "ICP Voorbereiden" button appears

2. **Test Prepare Flow:**
   - Click "Voorbereiden"
   - Verify loading state
   - Check status badge appears (should show "Concept")
   - Verify payload hash is displayed
   - If validation errors exist, they should be listed

3. **Test Queue Flow:**
   - If no validation errors, "In wachtrij zetten" button should be enabled
   - Click the button
   - Verify status changes to "In wachtrij"
   - Verify tracking ID is shown

4. **Test Error Handling:**
   - Test with period that has blocking (RED) anomalies
   - Verify section is hidden when RED anomalies exist

5. **Mobile Responsiveness:**
   - Test on mobile viewport (< 640px)
   - Verify buttons stack vertically
   - Verify text is readable

### 6. Authorization Tests

**Test 1: Unauthorized Access**
```bash
# Without token - should return 401
curl -X POST "http://localhost:8000/api/accountant/clients/{client_id}/vat/{period_id}/submit/prepare?kind=VAT"
```

**Test 2: Wrong Client Access**
```bash
# With accountant token for different client - should return 403
curl -X POST "http://localhost:8000/api/accountant/clients/{other_client_id}/vat/{period_id}/submit/prepare?kind=VAT" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Test 3: Missing Scope**
- Service checks for 'reports' scope in `require_assigned_client`
- Verify permission denied if scope not granted

### 7. Data Isolation Test

**Verify multi-tenant isolation:**
1. Create submissions for Client A
2. Login as accountant for Client B
3. List submissions - should NOT see Client A's submissions
4. Try to access Client A's submission by ID - should get 403

### 8. Payload Generation Test

**Verify XML generation:**
1. Create a DRAFT submission
2. Query database for `payload_xml` field
3. Verify XML structure:
   - Has `<btw-aangifte>` or `<icp-aangifte>` root
   - Has `<metadata>` section
   - Has `<administration>` section
   - Has box data / ICP entries
   - Is well-formed XML

**Validate against schema:**
```python
import xml.etree.ElementTree as ET
xml_content = submission.payload_xml
root = ET.fromstring(xml_content)
# Should not raise exception
```

## Security Considerations

### Implemented
- ✅ Multi-tenant isolation via `administration_id`
- ✅ Authorization checks with `require_assigned_client`
- ✅ Consent-based access control
- ✅ Scope checking ('reports' scope required)
- ✅ Input validation on XML payloads
- ✅ SQL injection protection (SQLAlchemy ORM)

### Phase B (Future)
- 🔄 Certificate-based XML signing
- 🔄 Secure certificate storage
- 🔄 PKIoverheid certificate validation
- 🔄 Rate limiting for Digipoort API
- 🔄 Audit logging for submission attempts

## Known Limitations (Phase A)

1. **No External API Calls**
   - Submissions are queued but not sent to Digipoort
   - Status remains QUEUED until Phase B implementation

2. **Placeholder Signing**
   - `sign_payload()` returns unsigned XML
   - TODO: Implement XMLDSig signing in Phase B

3. **No Status Polling**
   - `last_status_check_at` field exists but not used yet
   - Phase B will implement status polling worker

4. **Basic Validation**
   - Only checks XML well-formedness and required sections
   - Phase B should add XSD schema validation

## Next Steps (Phase B)

1. **Certificate Management**
   - Implement secure certificate storage
   - Add certificate validation
   - Implement XML signing with PKIoverheid cert

2. **Digipoort Integration**
   - Implement actual submission API calls
   - Add status polling worker
   - Handle submission responses
   - Implement error recovery

3. **Enhanced Validation**
   - Add XSD schema validation
   - Implement Belastingdienst-specific business rules
   - Add pre-submission checks

4. **Monitoring & Alerts**
   - Add submission success/failure metrics
   - Implement alerting for failed submissions
   - Add dashboard for submission status

## Troubleshooting

### Migration Issues
```bash
# Check current migration version
alembic current

# Show migration history
alembic history

# Downgrade if needed
alembic downgrade -1
```

### Service Errors
- Check logs for VatSubmissionError exceptions
- Verify period exists and is accessible
- Check VAT report can be generated

### Frontend Issues
- Check browser console for API errors
- Verify token is present in localStorage
- Check network tab for failed requests

### Database Issues
```sql
-- Check submissions
SELECT id, status, submission_type, error_message 
FROM vat_submissions 
WHERE administration_id = 'client-uuid';

-- Check payload
SELECT payload_hash, LENGTH(payload_xml) as xml_length
FROM vat_submissions 
WHERE id = 'submission-uuid';
```

## Success Criteria

✅ All tests pass
✅ Migration runs successfully
✅ API endpoints return expected responses
✅ Frontend UI appears correctly
✅ Authorization prevents unauthorized access
✅ Data isolation works (no cross-client leaks)
✅ Payload generation produces valid XML
✅ Validation catches malformed XML
✅ Mobile UI is responsive

## Support

For issues or questions:
1. Check application logs
2. Review this document
3. Contact development team
