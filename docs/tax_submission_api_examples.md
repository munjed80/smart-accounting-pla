# Tax Submission API Usage Examples

This document provides practical examples of using the new tax submission endpoints.

## Prerequisites

- Authenticated as an accountant user
- Access to a client/administration
- Period must be in `READY_FOR_FILING` status

## Authentication

All requests require a valid JWT token in the Authorization header:

```bash
Authorization: Bearer <your_jwt_token>
```

## 1. Submit BTW (VAT) Declaration

### Endpoint
```
POST /api/accountant/clients/{client_id}/tax/btw/submit
```

### Request

```bash
curl -X POST https://api.example.com/api/accountant/clients/123e4567-e89b-12d3-a456-426614174000/tax/btw/submit \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "period_id": "987e6543-e21b-43d2-b654-321987654321"
  }'
```

### Response (Package-only mode - default)

```json
{
  "id": "aaa11111-2222-3333-4444-555555555555",
  "administration_id": "123e4567-e89b-12d3-a456-426614174000",
  "period_id": "987e6543-e21b-43d2-b654-321987654321",
  "submission_type": "BTW",
  "created_at": "2026-02-17T15:57:00Z",
  "created_by": "bbb22222-3333-4444-5555-666666666666",
  "method": "PACKAGE",
  "status": "DRAFT",
  "reference_text": "BTW-PKG-aaa11111-2222-3333-4444-555555555555",
  "attachment_url": null,
  "connector_response": {
    "mode": "PACKAGE_ONLY",
    "message": "Package generated. Ready for manual submission to tax authority.",
    "xml_size": 12345
  },
  "submitted_at": null,
  "updated_at": "2026-02-17T15:57:00Z"
}
```

### What Happens (Package-only mode)

1. System validates period status (must be READY_FOR_FILING)
2. Generates BTW XML package
3. Stores package information locally
4. Creates submission record with status=DRAFT
5. Returns reference for tracking

**Next Steps:**
- Download the XML package using existing endpoint
- Submit manually to Belastingdienst portal
- Mark as submitted using existing endpoint

## 2. Submit ICP Declaration

### Endpoint
```
POST /api/accountant/clients/{client_id}/tax/icp/submit
```

### Request

```bash
curl -X POST https://api.example.com/api/accountant/clients/123e4567-e89b-12d3-a456-426614174000/tax/icp/submit \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "period_id": "987e6543-e21b-43d2-b654-321987654321"
  }'
```

### Response (Package-only mode - default)

```json
{
  "id": "ccc33333-4444-5555-6666-777777777777",
  "administration_id": "123e4567-e89b-12d3-a456-426614174000",
  "period_id": "987e6543-e21b-43d2-b654-321987654321",
  "submission_type": "ICP",
  "created_at": "2026-02-17T16:00:00Z",
  "created_by": "bbb22222-3333-4444-5555-666666666666",
  "method": "PACKAGE",
  "status": "DRAFT",
  "reference_text": "ICP-PKG-ccc33333-4444-5555-6666-777777777777",
  "attachment_url": null,
  "connector_response": {
    "mode": "PACKAGE_ONLY",
    "message": "Package generated. Ready for manual submission to tax authority.",
    "xml_size": 8765
  },
  "submitted_at": null,
  "updated_at": "2026-02-17T16:00:00Z"
}
```

## 3. Error Scenarios

### Period Not Found

**Response:** 404 Not Found
```json
{
  "detail": "Period not found"
}
```

### Period Not Ready for Filing

**Response:** 400 Bad Request
```json
{
  "detail": "Period must be in READY_FOR_FILING status to submit. Current status: REVIEW"
}
```

### Blocking Anomalies Present

**Response:** 400 Bad Request
```json
{
  "detail": "Cannot generate submission package: blocking anomalies present. Please resolve RED anomalies before submission."
}
```

### No ICP Entries

**Response:** 400 Bad Request
```json
{
  "detail": "No ICP entries found for this period. ICP submission is only required when there are intra-community supplies."
}
```

### Unauthorized Access

**Response:** 403 Forbidden
```json
{
  "detail": "Client not found or access denied"
}
```

## 4. Workflow Example

### Complete BTW Submission Workflow

```bash
# Step 1: Get VAT report to verify data
curl -X GET https://api.example.com/api/accountant/clients/{client_id}/periods/{period_id}/reports/vat \
  -H "Authorization: Bearer <token>"

# Step 2: Review anomalies and resolve any RED anomalies
# (use your application UI or other endpoints)

# Step 3: Submit BTW via connector
curl -X POST https://api.example.com/api/accountant/clients/{client_id}/tax/btw/submit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"period_id": "{period_id}"}'
# Response includes submission_id and reference

# Step 4: Download XML package (existing endpoint - optional)
curl -X POST https://api.example.com/api/accountant/clients/{client_id}/periods/{period_id}/submissions/btw/package \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"period_id": "{period_id}"}' \
  --output btw-package.xml

# Step 5: Submit manually to Belastingdienst portal
# (accountant performs this step outside the system)

# Step 6: Mark as submitted (existing endpoint)
curl -X POST https://api.example.com/api/accountant/clients/{client_id}/vat/submissions/{submission_id}/mark-submitted \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reference_text": "Submitted via portal on 2026-02-17",
    "attachment_url": "https://storage.example.com/proof.pdf"
  }'
```

## 5. Future: Digipoort Mode (When Enabled)

When Digipoort is enabled (`DIGIPOORT_ENABLED=true` in environment), the workflow is simplified:

### Request (Same as Package-only)

```bash
curl -X POST https://api.example.com/api/accountant/clients/{client_id}/tax/btw/submit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"period_id": "{period_id}"}'
```

### Response (Digipoort mode)

```json
{
  "id": "ddd44444-5555-6666-7777-888888888888",
  "administration_id": "123e4567-e89b-12d3-a456-426614174000",
  "period_id": "987e6543-e21b-43d2-b654-321987654321",
  "submission_type": "BTW",
  "created_at": "2026-02-17T16:05:00Z",
  "created_by": "bbb22222-3333-4444-5555-666666666666",
  "method": "DIGIPOORT",
  "status": "SUBMITTED",
  "reference_text": "DIGIPOORT-BTW-ddd44444-5555-6666-7777-888888888888",
  "attachment_url": null,
  "connector_response": {
    "mode": "DIGIPOORT",
    "message": "Submitted to Digipoort",
    "endpoint": "https://digipoort.belastingdienst.nl/api/v1",
    "digipoort_reference": "DGP-2026-12345",
    "response_code": "200"
  },
  "submitted_at": "2026-02-17T16:05:00Z",
  "updated_at": "2026-02-17T16:05:00Z"
}
```

**Note:** Digipoort mode is currently a placeholder. Actual implementation will include:
- Real API calls to Digipoort
- Status polling and updates
- Error handling and retry logic

## 6. Testing

### Local Development (Package-only mode)

No configuration needed. Just use the endpoints as shown above.

### Testing Digipoort Mode (Placeholder)

Set environment variables:

```bash
DIGIPOORT_ENABLED=true
DIGIPOORT_ENDPOINT=https://test.digipoort.belastingdienst.nl/api/v1
DIGIPOORT_CLIENT_ID=test_client_id
DIGIPOORT_CLIENT_SECRET=test_client_secret
```

Currently returns placeholder responses for testing the integration.

## 7. Frontend Integration Example (TypeScript)

```typescript
// Define types
interface SubmitTaxRequest {
  period_id: string;
}

interface TaxSubmissionResponse {
  id: string;
  administration_id: string;
  period_id: string;
  submission_type: 'BTW' | 'ICP';
  created_at: string;
  created_by: string;
  method: 'PACKAGE' | 'DIGIPOORT';
  status: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'REJECTED';
  reference_text: string | null;
  attachment_url: string | null;
  connector_response: Record<string, any> | null;
  submitted_at: string | null;
  updated_at: string;
}

// Submit BTW
async function submitBTW(
  clientId: string,
  periodId: string,
  token: string
): Promise<TaxSubmissionResponse> {
  const response = await fetch(
    `${API_URL}/api/accountant/clients/${clientId}/tax/btw/submit`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ period_id: periodId }),
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Submission failed');
  }
  
  return await response.json();
}

// Usage in component
try {
  const result = await submitBTW(clientId, periodId, authToken);
  console.log('Submission created:', result.id);
  console.log('Reference:', result.reference_text);
  console.log('Status:', result.status);
  
  if (result.method === 'PACKAGE') {
    // Show message to download package
    alert('Package generated. Please download and submit manually.');
  } else {
    // Digipoort mode - already submitted
    alert('Submitted to Digipoort successfully!');
  }
} catch (error) {
  console.error('Submission failed:', error);
  alert(error.message);
}
```

## 8. Security Notes

### Authentication
- All endpoints require valid JWT token
- Token must have accountant role
- Token user must have access to the specified client

### Authorization
- User must be assigned to the client as accountant
- Period must belong to the specified client
- Period must be in READY_FOR_FILING status

### Data Validation
- Period ID must be valid UUID
- Period must exist and be accessible
- XML generation validates data integrity
- Blocking anomalies prevent submission

### Network Security (Digipoort mode)
- No network calls unless explicitly enabled
- Credentials validated before making calls
- Supports certificate-based authentication
- All API calls over HTTPS

## Related Documentation

- [VAT Digipoort Connector Architecture](./vat_digipoort_connector.md)
- [VAT Report API Documentation](../backend/app/api/v1/vat.py)
- [VAT Submission Model](../backend/app/models/vat_submission.py)
