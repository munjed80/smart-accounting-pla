# Accountant ↔ ZZP Workflow

This document explains the workflow for accountants accessing ZZP client dossiers, including permissions and data flow.

## Data Model Overview

### Core Entities

```
┌─────────────────────────────────────────────────────────────────┐
│                           Users                                  │
│  id, email, role (zzp/accountant/admin)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AdministrationMember                         │
│  Links users to administrations                                  │
│  user_id, administration_id, role (OWNER/ADMIN/ACCOUNTANT)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Administrations                            │
│  Business entities containing all data (invoices, expenses,      │
│  customers, documents, journal entries, etc.)                    │
│  id, name, kvk_number, btw_number                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  AccountantClientAssignment                      │
│  Links accountants to client administrations with consent        │
│  accountant_id, client_user_id, administration_id               │
│  status: PENDING → ACTIVE → REVOKED                             │
└─────────────────────────────────────────────────────────────────┘
```

## Consent Workflow

### 1. Accountant Invites ZZP Client

```
POST /api/v1/accountant/clients/invite
{
  "email": "zzpclient@example.com"
}
```

- Creates assignment with `status: PENDING`
- ZZP client receives notification

### 2. ZZP Client Approves

```
POST /api/v1/zzp/links/{assignment_id}/approve
```

- Changes status to `ACTIVE`
- Accountant can now access client data

### 3. Access Control

Only assignments with `status: ACTIVE` grant data access:
- Dashboard shows only ACTIVE clients
- API endpoints check ACTIVE status via `require_assigned_client()`
- PENDING assignments return 403 with `PENDING_APPROVAL` error
- REVOKED assignments return 403 with `ACCESS_REVOKED` error

## Accountant Dossier Access

### Selection Flow

1. Accountant logs in → ActiveClientContext loads client links
2. First ACTIVE client auto-selected
3. Navigate to `/accountant/clients/{administration_id}/issues`

### Available Data

The accountant dossier (`ClientDossierPage`) shows:

| Tab | Data Source | API Endpoint |
|-----|-------------|--------------|
| Issues | Consistency engine validation | `GET /accountant/clients/{id}/issues` |
| Periods | Accounting periods | `GET /accountant/clients/{id}/periods` |
| Decisions | Decision history | `GET /accountant/clients/{id}/decision-history` |

### API Endpoints for Accountant

```
/api/v1/accountant/clients/{administration_id}/overview
/api/v1/accountant/clients/{administration_id}/issues
/api/v1/accountant/clients/{administration_id}/periods
/api/v1/accountant/clients/{administration_id}/decision-history
/api/v1/accountant/clients/{administration_id}/reports/balance-sheet
/api/v1/accountant/clients/{administration_id}/reports/pnl
/api/v1/accountant/clients/{administration_id}/reports/ar
/api/v1/accountant/clients/{administration_id}/reports/ap
```

## Permission Rules

### ZZP Users
- Full access to own administration(s) via `/zzp/...` endpoints
- Can approve/reject accountant link requests
- Can revoke accountant access

### Accountants
- Access only to assigned administrations with ACTIVE status
- No access to ZZP business endpoints (`/zzp/customers`, `/zzp/invoices`, etc.)
- Access is through accountant-specific endpoints (`/accountant/clients/{id}/...`)

### Access Denied Scenarios

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| No assignment exists | 403 | `NOT_ASSIGNED` |
| Assignment is PENDING | 403 | `PENDING_APPROVAL` |
| Assignment is REVOKED | 403 | `ACCESS_REVOKED` |
| Wrong user role | 403 | `FORBIDDEN_ROLE` |

## Testing

### 1. Create Test Users

```sql
-- ZZP user with administration
INSERT INTO users (id, email, hashed_password, full_name, role, is_active)
VALUES (
  gen_random_uuid(),
  'zzp@test.nl',
  '$2b$12$...',
  'Test ZZP',
  'zzp',
  true
);

-- Accountant user
INSERT INTO users (id, email, hashed_password, full_name, role, is_active)
VALUES (
  gen_random_uuid(),
  'accountant@test.nl',
  '$2b$12$...',
  'Test Accountant',
  'accountant',
  true
);
```

### 2. Test Access Control

```bash
# As accountant, try to access unassigned client → 403
curl -H "Authorization: Bearer <accountant_token>" \
  "http://localhost:8000/api/v1/accountant/clients/<unassigned_admin_id>/overview"
# Expected: {"detail": {"code": "NOT_ASSIGNED", "message": "..."}}

# Invite client, then try to access → 403 (PENDING)
curl -X POST -H "Authorization: Bearer <accountant_token>" \
  "http://localhost:8000/api/v1/accountant/clients/invite" \
  -H "Content-Type: application/json" \
  -d '{"email": "zzp@test.nl"}'

curl -H "Authorization: Bearer <accountant_token>" \
  "http://localhost:8000/api/v1/accountant/clients/<admin_id>/overview"
# Expected: {"detail": {"code": "PENDING_APPROVAL", "message": "..."}}

# As ZZP, approve → then access works
curl -X POST -H "Authorization: Bearer <zzp_token>" \
  "http://localhost:8000/api/v1/zzp/links/<assignment_id>/approve"

curl -H "Authorization: Bearer <accountant_token>" \
  "http://localhost:8000/api/v1/accountant/clients/<admin_id>/overview"
# Expected: 200 OK with client data
```

## Audit Trail

Actions are tracked in the following tables:
- `accountant_client_assignments`: Who invited, when approved/revoked
- `client_decisions`: Decision history with `decided_by_id`
- `period_audit_logs`: Period status changes with timestamps

## Troubleshooting

### "Dossier is empty"

1. Check if accountant has ACTIVE assignment:
   ```sql
   SELECT * FROM accountant_client_assignments
   WHERE accountant_id = '<accountant_user_id>'
   AND administration_id = '<admin_id>'
   AND status = 'ACTIVE';
   ```

2. Check if administration has data:
   ```sql
   SELECT COUNT(*) FROM client_issues WHERE administration_id = '<admin_id>';
   SELECT COUNT(*) FROM accounting_periods WHERE administration_id = '<admin_id>';
   SELECT COUNT(*) FROM journal_entries WHERE administration_id = '<admin_id>';
   ```

### "Access Denied"

1. Check assignment status (must be ACTIVE)
2. Check user role (must be accountant or admin)
3. Check token validity
