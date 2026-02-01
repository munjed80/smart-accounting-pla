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

## What Needs Enhancement (Minimal Changes)

### Phase 1: Polish Bulk Operation Flow
1. **Add polling support in BulkOperationModal** - Currently fire-and-forget for long operations
2. **Add status filter to history page** - Frontend filter dropdown
3. **Improve empty states** - Add retry buttons and clearer messages

### Phase 2: Client Dossier Enhancements
1. **Active client indicator** - Visual badge in dossier header
2. **"Vandaag afgerond" counter** - Track actions completed today
3. **Recommended next tab** - Navigate after issue resolution

### Phase 3: Differentiators
1. **Risk score panel** - Top 10 by readiness_score (data exists, just needs panel)
2. **Vandaag panel links** - Connect to dashboard filters

### Phase 4: Documentation
1. **README E2E checklist** - Document verification steps
2. **Local testing instructions** - Docker compose setup

---

## No Backend Changes Required For:
- Bulk operations already return operation_id ✅
- History endpoint already exists ✅
- Per-client results already stored ✅
- Multi-tenant isolation already working ✅
