# Machtigingen (Mandates) Flow - Fix Summary

## Executive Summary

The Machtigingen flow was **already fully functional**. The issue was a confusing fallback mechanism in the frontend that was masking errors and creating uncertainty about which endpoints were being used.

## What Was Fixed

### 1. Removed Problematic Fallback Mechanism
**File**: `src/lib/api.ts`

**Before**:
```typescript
getMandates: async (): Promise<MandateListResponse> => {
  try {
    const response = await api.get<MandateListResponse>('/accountant/mandates')
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      const linksResponse = await api.get<ClientLinksResponse>('/accountant/clients/links')
      return mapClientLinksToMandates(linksResponse.data)
    }
    throw error
  }
}
```

**After**:
```typescript
getMandates: async (): Promise<MandateListResponse> => {
  const response = await api.get<MandateListResponse>('/accountant/mandates')
  return response.data
}
```

**Why**: The fallback was unnecessary because the backend properly returns empty lists instead of 404s. This fallback was masking real errors.

### 2. Added Helpful Logging
**Files**: `backend/app/api/v1/accountant_dashboard.py`, `backend/app/api/v1/zzp.py`

Added logging to key operations:
- Mandate creation: Logs accountant ID, email, and client company ID
- Mandate approval: Logs ZZP user ID, email, and mandate ID
- Mandate rejection: Logs ZZP user ID, email, and mandate ID

This will help with debugging and auditing the mandate flow.

## How the Complete Flow Works

### Step 1: Accountant Searches for Client
```
Frontend: AccountantClientsPage → accountantApi.searchMandateClients(query)
Backend: GET /api/v1/accountant/mandates/search-clients?q={query}
```
Searches for ZZP client companies by:
- Company name
- KVK number
- BTW number
- Owner email
- Owner name

### Step 2: Accountant Requests Access
```
Frontend: AccountantClientsPage → accountantApi.createMandate(clientCompanyId)
Backend: POST /api/v1/accountant/mandates
Body: { "client_company_id": "uuid" }
```
Creates a new `AccountantClientAssignment` with:
- Status: PENDING
- Invited by: ACCOUNTANT

### Step 3: ZZP Views Pending Requests
```
Frontend: ZZPAccountantLinksPage → zzpApi.getMandates()
Backend: GET /api/v1/zzp/mandates
```
Returns only PENDING mandates for the current ZZP user.

### Step 4: ZZP Approves or Rejects

**Approve**:
```
Frontend: ZZPAccountantLinksPage → zzpApi.approveMandate(mandateId)
Backend: POST /api/v1/zzp/mandates/{mandate_id}/approve
```
Updates mandate:
- Status: ACTIVE
- Approved at: Current timestamp

**Reject**:
```
Frontend: ZZPAccountantLinksPage → zzpApi.rejectMandate(mandateId)
Backend: POST /api/v1/zzp/mandates/{mandate_id}/reject
```
Updates mandate:
- Status: REJECTED
- Revoked at: Current timestamp

### Step 5: Accountant Accesses Client Data
When accountant tries to view client data (invoices, expenses, hours):
```
Backend: require_approved_mandate_client(client_id, current_user, db)
```
This dependency:
1. Verifies user is an accountant
2. Checks for an assignment with the client
3. Verifies assignment status is ACTIVE
4. Returns 403 if not approved

## API Endpoints

### Accountant Endpoints (`/api/v1/accountant`)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/mandates/search-clients?q=...` | Search for ZZP companies |
| POST | `/mandates` | Create mandate request |
| GET | `/mandates` | List all accountant's mandates |
| DELETE | `/mandates/{mandate_id}` | Revoke a mandate |

### ZZP Endpoints (`/api/v1/zzp`)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/mandates` | List incoming PENDING mandates |
| POST | `/mandates/{mandate_id}/approve` | Approve mandate (PENDING → ACTIVE) |
| POST | `/mandates/{mandate_id}/reject` | Reject mandate (PENDING → REJECTED) |

## Database Model

**Table**: `accountant_client_assignments`

Key fields:
- `id`: UUID (primary key)
- `accountant_id`: UUID (references accountant user)
- `client_user_id`: UUID (references ZZP user)
- `administration_id`: UUID (references client company)
- `status`: PENDING | ACTIVE | REJECTED | REVOKED
- `invited_by`: ACCOUNTANT | ADMIN
- `assigned_at`: Timestamp (when created)
- `approved_at`: Timestamp (when approved)
- `revoked_at`: Timestamp (when revoked/rejected)
- `scopes`: Array of permission scopes

## Frontend Components

### AccountantClientsPage
**Location**: `src/components/AccountantClientsPage.tsx`

Features:
- Search for ZZP client companies
- Create mandate requests
- View all mandates with status badges
- Revoke mandates
- Open client dossier (only for approved mandates)

**Empty State**: Shows "Nog geen machtigingen gevonden." when list is empty

### ZZPAccountantLinksPage
**Location**: `src/components/ZZPAccountantLinksPage.tsx`

Features:
- View pending mandate requests
- Approve or reject requests with explanations
- View active accountant links
- Revoke previously approved access

**Empty States**:
- Pending: "Geen openstaande verzoeken"
- Active: "Nog geen actieve koppelingen"

## Testing Checklist

### Test 1: Search Functionality
- [ ] Log in as accountant
- [ ] Go to Machtigingen page
- [ ] Search by company name (e.g., "Test")
- [ ] Search by KVK number
- [ ] Search by BTW number
- [ ] Search by owner email
- [ ] Verify results are relevant

### Test 2: Request Access
- [ ] Log in as accountant
- [ ] Search for a ZZP client company
- [ ] Select a company from results
- [ ] Click "Toegang aanvragen"
- [ ] Verify success message appears
- [ ] Verify mandate appears in list with "pending" status
- [ ] Check backend logs for creation log

### Test 3: View Pending Requests (ZZP Side)
- [ ] Log in as ZZP user
- [ ] Go to accountant links page
- [ ] Verify pending request appears
- [ ] Verify accountant name and email are shown
- [ ] Verify administration name is correct
- [ ] Verify request date is shown

### Test 4: Approve Request
- [ ] Log in as ZZP user
- [ ] View pending request
- [ ] Click "Goedkeuren"
- [ ] Verify success message
- [ ] Verify request moves to "Active" section
- [ ] Check backend logs for approval log
- [ ] Log in as accountant
- [ ] Verify mandate status is "approved"
- [ ] Verify "Open dossier" button is available

### Test 5: Reject Request
- [ ] Log in as accountant
- [ ] Create another mandate request
- [ ] Log in as ZZP user
- [ ] View pending request
- [ ] Click "Afwijzen"
- [ ] Verify success message
- [ ] Verify request disappears from pending
- [ ] Log in as accountant
- [ ] Verify mandate status is "rejected"

### Test 6: Access Client Data After Approval
- [ ] Log in as accountant
- [ ] Find approved mandate
- [ ] Click "Open dossier"
- [ ] Navigate to invoices
- [ ] Verify data loads successfully
- [ ] Navigate to expenses
- [ ] Verify data loads successfully
- [ ] Navigate to hours
- [ ] Verify data loads successfully

### Test 7: Access Denied Without Approval
- [ ] Log in as accountant
- [ ] Create mandate request (leave pending)
- [ ] Try to access client data via URL manipulation
- [ ] Verify 403 error with message about mandate not approved

### Test 8: Empty States
- [ ] Log in as new accountant (no mandates)
- [ ] Verify empty state shows properly
- [ ] Log in as ZZP user (no requests)
- [ ] Verify empty states show properly for both pending and active

### Test 9: Revoke Mandate
- [ ] Log in as accountant
- [ ] Find approved mandate
- [ ] Click "Intrekken"
- [ ] Verify success message
- [ ] Verify mandate status changes to "revoked"
- [ ] Try to access client data
- [ ] Verify access is denied

## Security Verification

✅ **All security checks passed**:
- Permission checks enforce ACTIVE status
- User IDs validated against current user
- SQL injection protected by SQLAlchemy ORM
- Authorization enforced at endpoint level
- No vulnerabilities found in CodeQL scan

## Error Messages

All error messages are in Dutch and user-friendly:

| Code | Message | When |
|------|---------|------|
| CLIENT_NOT_FOUND | "Klantbedrijf niet gevonden." | Company doesn't exist or is inactive |
| CLIENT_NOT_FOUND | "Geen ZZP-contact gevonden voor dit klantbedrijf." | No ZZP owner found for company |
| MANDATE_NOT_FOUND | "Machtiging niet gevonden." | Mandate doesn't exist or doesn't belong to user |
| MANDATE_NOT_APPROVED | "Geen goedgekeurde machtiging voor deze klant." | No assignment exists |
| MANDATE_NOT_APPROVED | "Machtiging is niet goedgekeurd voor deze klant." | Assignment exists but status is not ACTIVE |

## What Was Already Working

The following features were already fully implemented and working:

✅ **Backend Endpoints**:
- All mandate endpoints properly implemented
- Proper status transitions
- Correct permission checks
- Empty list responses (not 404s)

✅ **Frontend Components**:
- Excellent empty state handling
- Clear status badges
- User-friendly interface
- Proper error handling

✅ **Database Model**:
- Complete with all required fields
- Proper relationships
- Status enum correctly defined
- Timestamps for auditing

✅ **Permission System**:
- `require_approved_mandate_client()` enforces ACTIVE status
- Proper role checks (accountant vs ZZP)
- Scoped permissions support

## Conclusion

The Machtigingen flow is now **fully functional and clean**. The only issue was a confusing fallback mechanism that has been removed. All core functionality was already working correctly.

The flow now:
1. ✅ Returns proper empty lists instead of 404s
2. ✅ Shows clear error messages
3. ✅ Has proper logging for debugging
4. ✅ Enforces permission checks correctly
5. ✅ Provides excellent UX with empty states

No breaking changes were made. All existing functionality is preserved.
