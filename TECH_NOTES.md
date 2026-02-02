# Technical Notes: Accountant Closed-Loop Workflow

## Phase 0 Assessment — Current Capabilities

### Backend: Bulk Operations (✅ COMPLETE)

**Tables Present:**
- `bulk_operations` - Main operation tracking table
  - Fields: `id`, `operation_type`, `status`, `initiated_by_id`, `created_at`, `started_at`, `completed_at`, `parameters`, `target_client_ids`, `total_clients`, `processed_clients`, `successful_clients`, `failed_clients`, `error_message`, `idempotency_key`
- `bulk_operation_results` - Per-client results
  - Fields: `id`, `bulk_operation_id`, `administration_id`, `status`, `processed_at`, `result_data`, `error_message`
- `client_reminders` - Reminders created via bulk operations
- Migration: `010_accountant_dashboard_bulk_ops.py`

**Status Model:**
- PENDING, IN_PROGRESS, COMPLETED, COMPLETED_WITH_ERRORS, FAILED, CANCELLED

**Operation Types:**
- BULK_RECALCULATE, BULK_ACK_YELLOW, BULK_GENERATE_VAT_DRAFT, BULK_SEND_CLIENT_REMINDERS, BULK_LOCK_PERIOD

### Backend: Endpoints (✅ COMPLETE)

**Bulk Action Endpoints:**
- POST `/api/v1/accountant/bulk/recalculate` - Returns BulkOperationResponse with operation_id
- POST `/api/v1/accountant/bulk/ack-yellow` - Returns BulkOperationResponse
- POST `/api/v1/accountant/bulk/generate-vat-draft` - Returns BulkOperationResponse
- POST `/api/v1/accountant/bulk/send-reminders` - Returns BulkOperationResponse
- POST `/api/v1/accountant/bulk/lock-period` - Returns BulkOperationResponse

**History Endpoints:**
- GET `/api/v1/accountant/bulk/operations` - List recent operations (limit, operation_type filters)
- GET `/api/v1/accountant/bulk/operations/{operation_id}` - Get details with per-client results

**Dashboard Endpoints:**
- GET `/api/v1/accountant/dashboard/summary` - Aggregated KPIs
- GET `/api/v1/accountant/dashboard/clients` - Client list with filters/sorting

### Frontend: Dashboard Components (✅ COMPLETE)

**Pages:**
- `AccountantHomePage.tsx` - Main dashboard with KPIs, filters, sorting, pagination
- `BulkOperationsHistoryPage.tsx` - History page shell (fetches from API)
- `ClientDossierPage.tsx` - Client dossier container with tabs
- `ClientIssuesTab.tsx` - Issues display with suggestions/approve/reject
- `ClientPeriodsTab.tsx` - Period control
- `ClientDecisionsTab.tsx` - Decision history

**Bulk Operation Components:**
- `BulkActionBar.tsx` - Sticky bar with action buttons
- `BulkOperationModal.tsx` - Modal with progress/results display

**Panels:**
- `TodayCommandPanel.tsx` - "Vandaag" task overview
- `PriorityClientsPanel.tsx` - Priority clients display
- `RecentActionsPanel.tsx` - Recent actions log

### Frontend: API Client (✅ COMPLETE)

**accountantMasterDashboardApi methods:**
- `bulkRecalculate(request)` - Returns BulkOperationResponse
- `bulkAckYellow(request)` - Returns BulkOperationResponse
- `bulkGenerateVatDraft(request)` - Returns BulkOperationResponse
- `bulkSendReminders(request)` - Returns BulkOperationResponse
- `bulkLockPeriod(request)` - Returns BulkOperationResponse
- `getBulkOperation(operationId)` - Get operation details
- `listBulkOperations(limit, operationType)` - List operations

### Multi-Tenant Safety (✅ IMPLEMENTED)

- `AccountantDashboardService.get_assigned_client_ids()` - Gets only assigned clients
- `BulkOperationsService.get_target_clients()` - Filters to assigned clients only
- All bulk operations filter requested client_ids to assigned clients

### i18n: Dutch Translations (✅ COMPLETE)

- `src/i18n/nl.ts` - Complete Dutch translations for:
  - bulkOps: Modal and action labels
  - bulkHistory: History page labels
  - Status badges: Bezig / Voltooid / Mislukt

---

## What's Already Working

1. **Bulk operations return operation_id** - ✅ All bulk endpoints return BulkOperationResponse
2. **History endpoint exists** - ✅ GET /accountant/bulk/operations works
3. **Details endpoint exists** - ✅ GET /accountant/bulk/operations/{id} includes per-client results
4. **Status model complete** - ✅ PENDING, IN_PROGRESS, COMPLETED, etc.
5. **Multi-tenant isolation** - ✅ Only assigned clients can be accessed
6. **Frontend modal exists** - ✅ BulkOperationModal shows results after execution
7. **History page exists** - ✅ BulkOperationsHistoryPage fetches from API

---

## Enhancements Implemented (Phases 1-4)

### Phase 1: Bulk Operation Flow ✅ COMPLETE
1. **Polling support in BulkOperationModal** - ✅ Polls operation status every 2s until terminal state
2. **Status filter on history page** - ✅ Dropdown filter by COMPLETED/FAILED/IN_PROGRESS/PENDING
3. **Improved empty states** - ✅ Clear messages with action buttons

### Phase 2: Client Dossier Enhancements ✅ COMPLETE
1. **"Actieve klant" indicator** - ✅ Visual badge in dossier header
2. **"Vandaag afgerond" counter** - ✅ Session-based counter increments on issue resolution
3. **Issue resolution callback** - ✅ Refreshes overview after action completion

### Phase 3: Differentiators ✅ COMPLETE
1. **Risk score panel** - ✅ PriorityClientsPanel shows top 10 by computed risk score
2. **Vandaag panel links** - ✅ Links apply dashboard filters (deadline_7d, has_red, etc.)
3. **BTW binnenkort filter** - ✅ New filter chip shows clients with VAT deadline ≤7 days

### Phase 4: Documentation ✅ COMPLETE
1. **README E2E checklist** - ✅ Added "Closed-Loop Workflow Verification" section
2. **Local testing instructions** - ✅ Docker compose and manual setup documented
3. **Endpoint reference** - ✅ Table of new endpoints with descriptions

---

## No Backend Changes Required For:
- Bulk operations already return operation_id ✅
- History endpoint already exists ✅
- Per-client results already stored ✅
- Multi-tenant isolation already working ✅

---

## Bank Import + Reconciliation (MVP)

### Overview
Feature to import bank statements (CSV) and reconcile transactions with invoices, expenses, and transfers.
Dutch-first UI. Accountant-only access with client assignment enforcement.

### Database Schema

**bank_accounts:**
- id (UUID PK)
- administration_id (UUID FK → administrations)
- iban (varchar)
- bank_name (varchar nullable)
- currency (varchar default 'EUR')
- created_at

**bank_transactions:**
- id (UUID PK)
- administration_id (UUID FK → administrations)
- bank_account_id (UUID FK nullable → bank_accounts)
- booking_date (date)
- amount (numeric 14,2 - positive = inbound, negative = outbound)
- counterparty_name (varchar nullable)
- counterparty_iban (varchar nullable)
- description (text)
- reference (varchar nullable)
- raw_hash (varchar unique - SHA256 for idempotency)
- status (enum: NEW, MATCHED, IGNORED, NEEDS_REVIEW)
- matched_type (enum nullable: INVOICE, EXPENSE, TRANSFER, MANUAL)
- matched_entity_id (UUID nullable)
- created_at

**reconciliation_actions:**
- id (UUID PK)
- bank_transaction_id (UUID FK → bank_transactions)
- user_id (UUID FK → users)
- action (enum: ACCEPT_MATCH, IGNORE, CREATE_EXPENSE, LINK_INVOICE, UNMATCH)
- payload (JSONB nullable)
- created_at

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/accountant/bank/import | Import CSV bank file |
| GET | /api/v1/accountant/bank/transactions | List bank transactions |
| POST | /api/v1/accountant/bank/transactions/{id}/suggest | Get match suggestions |
| POST | /api/v1/accountant/bank/transactions/{id}/apply | Apply reconciliation action |

### Matching Rules

1. **Invoice number in description** → Suggest matching invoice
2. **Amount matches open invoice (±1%)** → Suggest invoice match
3. **Counterparty IBAN matches known vendor** → Suggest expense category

### Frontend Routes

- `/accountant/bank` - Bank & Afletteren page
- Upload CSV, view transactions, apply matches

### Translation Namespaces

- bank.* - Bank-related labels
- reconciliation.* - Reconciliation actions
- import.* - Import flow
- suggestions.* - Match suggestion explanations
