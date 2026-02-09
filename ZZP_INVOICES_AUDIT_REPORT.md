# ZZP Invoices Flow - Technical Audit Report

**Date**: 2026-02-09  
**Purpose**: Audit the ZZP Invoices flow and identify why changes do not reflect in the UI

---

## 1. Flow Diagram (UI → API → DB)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           ZZP INVOICES FLOW                                    │
└────────────────────────────────────────────────────────────────────────────────┘

FRONTEND (React)
================
                         ┌──────────────────────────┐
                         │   src/App.tsx            │
                         │   Route: /zzp/invoices   │
                         │   Tab: 'invoices'        │
                         └───────────┬──────────────┘
                                     │
                                     ▼
                         ┌──────────────────────────┐
                         │  ZZPInvoicesPage.tsx     │
                         │  (src/components/)       │
                         │  - Stats cards           │
                         │  - Search/filter         │
                         │  - Invoice table         │
                         │  - Form dialogs          │
                         └───────────┬──────────────┘
                                     │
                   ┌─────────────────┼─────────────────┐
                   ▼                 ▼                 ▼
           ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
           │  LIST       │   │  SAVE       │   │  DOWNLOAD   │
           │  loadData() │   │  handleSave │   │  handlePdf  │
           └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
                  │                 │                 │
                  ▼                 ▼                 ▼

API CLIENT (TypeScript)
=======================
                         ┌──────────────────────────┐
                         │  src/lib/api.ts          │
                         │  zzpApi.invoices.*       │
                         │                          │
                         │  Methods:                │
                         │  - list()                │
                         │  - get(id)               │
                         │  - create(data)          │
                         │  - update(id, data)      │
                         │  - updateStatus(id, st)  │
                         │  - delete(id)            │
                         │  - downloadPdf(id)       │
                         └───────────┬──────────────┘
                                     │
                                     ▼

BACKEND API (FastAPI)
=====================
                         ┌──────────────────────────┐
                         │  backend/app/main.py     │
                         │  prefix: /api/v1/zzp     │
                         └───────────┬──────────────┘
                                     │
                                     ▼
                         ┌──────────────────────────┐
                         │  zzp_invoices.py         │
                         │  (backend/app/api/v1/)   │
                         │                          │
                         │  Endpoints:              │
                         │  GET  /invoices          │
                         │  POST /invoices          │
                         │  GET  /invoices/{id}     │
                         │  PUT  /invoices/{id}     │
                         │  PATCH /invoices/{id}/st │
                         │  DELETE /invoices/{id}   │
                         │  GET  /invoices/{id}/pdf │
                         └───────────┬──────────────┘
                                     │
                                     ▼

DATABASE (PostgreSQL)
=====================
                         ┌──────────────────────────┐
                         │  Models (SQLAlchemy)     │
                         │  backend/app/models/zzp.py│
                         │                          │
                         │  Tables:                 │
                         │  - zzp_invoices          │
                         │  - zzp_invoice_lines     │
                         │  - zzp_invoice_counters  │
                         └──────────────────────────┘
```

---

## 2. Audit Findings

### 2.1 One Invoice Page Exists - Correctly Wired

| Question | Answer |
|----------|--------|
| **Is there more than ONE invoices page?** | ✅ NO - Only `ZZPInvoicesPage.tsx` exists |
| **Which page is rendered for ZZP users?** | ✅ `ZZPInvoicesPage.tsx` via route `/zzp/invoices` |
| **Which API endpoint does LIST use?** | ✅ `GET /api/v1/zzp/invoices` via `zzpApi.invoices.list()` |
| **Which API endpoint does SAVE use?** | ✅ `POST /api/v1/zzp/invoices` (create) or `PUT /api/v1/zzp/invoices/{id}` (update) |
| **Which API endpoint does DOWNLOAD use?** | ✅ `GET /api/v1/zzp/invoices/{id}/pdf` via `zzpApi.invoices.downloadPdf()` |
| **Which API endpoint does STATUS use?** | ✅ `PATCH /api/v1/zzp/invoices/{id}/status` via `zzpApi.invoices.updateStatus()` |

### 2.2 Save Button - ✅ CORRECTLY IMPLEMENTED

**File**: `src/components/ZZPInvoicesPage.tsx`  
**Function**: `handleSaveInvoice` (line 1384-1411)

```typescript
const handleSaveInvoice = useCallback(async (data: ZZPInvoiceCreate, isEdit: boolean) => {
  try {
    if (isEdit && editingInvoice) {
      await zzpApi.invoices.update(editingInvoice.id, { ... })  // ✅ API CALL
      toast.success(t('zzpInvoices.invoiceSaved'))
    } else {
      await zzpApi.invoices.create(data)  // ✅ API CALL
      toast.success(t('zzpInvoices.invoiceSaved'))
    }
    setIsFormOpen(false)
    setEditingInvoice(undefined)
    await loadData()  // ✅ RELOADS DATA AFTER SAVE
  } catch (err) {
    toast.error(parseApiError(err))
    throw err
  }
}, [editingInvoice, loadData])
```

**Verification**:
- ✅ Save button DOES call the backend API
- ✅ Response IS handled (shows toast on success/error)
- ✅ Data IS refreshed after save via `loadData()`

### 2.3 Download Button - ✅ CORRECTLY IMPLEMENTED (Mobile-Aware)

**File**: `src/components/ZZPInvoicesPage.tsx`  
**Function**: `handleDownloadPdf` (line 1448-1526)

```typescript
const handleDownloadPdf = useCallback(async (invoice: ZZPInvoice) => {
  try {
    const blob = await zzpApi.invoices.downloadPdf(invoice.id)  // ✅ BLOB FETCH
    const pdfBlob = new Blob([blob], { type: 'application/pdf' })  // ✅ PROPER MIME
    const blobUrl = window.URL.createObjectURL(pdfBlob)  // ✅ BLOB URL
    // ... anchor click download pattern
  } catch (blobErr) {
    // ✅ MOBILE FALLBACK: window.open() with direct PDF URL
    if (isMobile()) {
      const directUrl = zzpApi.invoices.getPdfUrl(invoice.id)
      window.open(directUrl, '_blank', 'noopener,noreferrer')
    }
  }
}, [])
```

**Verification**:
- ✅ Download uses Blob + proper `application/pdf` MIME type
- ✅ Backend returns proper headers: `Content-Disposition: attachment`
- ✅ Mobile fallback exists via `window.open()` with direct URL
- ✅ iOS-specific handling with `target="_blank"`

**Why Download May Fail on Mobile**:
The mobile fallback uses `window.open()` which requires authentication headers. If the backend API requires JWT auth on the PDF endpoint, this approach won't work for unauthenticated requests. The blob approach passes auth headers but some mobile browsers struggle with blob downloads.

**Recommendation**: Consider adding a short-lived signed URL endpoint for PDF downloads that doesn't require auth headers.

### 2.4 Invoice Status Field - ✅ FULLY IMPLEMENTED

**Backend Model** (`backend/app/models/zzp.py`):
```python
class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"

class ZZPInvoice(Base):
    status: Mapped[str] = mapped_column(String(20), default=InvoiceStatus.DRAFT.value)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
```

**Backend API** (`backend/app/api/v1/zzp_invoices.py`):
```python
@router.patch("/invoices/{invoice_id}/status", response_model=InvoiceResponse)
async def update_invoice_status(...):
    # Valid transitions enforced
    valid_transitions = {
        'draft': ['sent', 'cancelled'],
        'sent': ['paid', 'cancelled'],
        'paid': ['sent'],  # Mark as unpaid
        'cancelled': [],
        'overdue': ['paid', 'sent', 'cancelled'],
    }
    invoice.status = new_status
    if new_status == 'paid':
        invoice.paid_at = datetime.now(timezone.utc)
    await db.commit()
```

**Frontend UI** (`src/components/ZZPInvoicesPage.tsx`):
```typescript
// Status change handlers exist
const handleStatusChange = useCallback(async (invoice, newStatus) => {
  await zzpApi.invoices.updateStatus(invoice.id, newStatus)  // ✅ API CALL
  await loadData()  // ✅ REFRESH
}, [loadData])

const handleMarkPaid = useCallback(async (invoice) => {
  await zzpApi.invoices.updateStatus(invoice.id, 'paid')  // ✅ Mark as Paid
  await loadData()
}, [loadData])

const handleMarkUnpaid = useCallback(async (invoice) => {
  await zzpApi.invoices.updateStatus(invoice.id, 'sent')  // ✅ Mark as Unpaid
  await loadData()
}, [loadData])
```

**Verification**:
- ✅ Status field EXISTS in database (`status` column)
- ✅ Status API endpoint EXISTS (`PATCH /invoices/{id}/status`)
- ✅ Frontend UI controls ARE wired (`handleStatusChange`, `handleMarkPaid`, `handleMarkUnpaid`)
- ✅ Status badge displays in table with proper icons

---

## 3. Dead/Duplicate Files

### 3.1 Files to REMOVE (Dead Code)

| File | Reason | Action |
|------|--------|--------|
| `src/lib/storage/zzp.ts` | ❌ **DEAD CODE** - LocalStorage-based invoice storage that is NOT imported anywhere. Was replaced by backend API. | **DELETE** |
| `src/components/DemoInvoiceGenerator.tsx` | ❌ **DEAD CODE** - Uses `@github/spark/hooks` which doesn't exist. Not imported anywhere in the app. Demo/testing artifact. | **DELETE** |

### 3.2 Files That Are Active (Keep)

| File | Purpose |
|------|---------|
| `src/components/ZZPInvoicesPage.tsx` | ✅ Main invoices UI - uses backend API |
| `src/lib/api.ts` | ✅ API client with `zzpApi.invoices.*` |
| `backend/app/api/v1/zzp_invoices.py` | ✅ Backend REST endpoints |
| `backend/app/models/zzp.py` | ✅ Database models |
| `backend/app/services/invoice_pdf.py` | ✅ PDF generation service |
| `backend/app/schemas/zzp.py` | ✅ Pydantic schemas |

---

## 4. Why Changes Might Not Reflect in UI

### 4.1 Potential Issues (Not Code Bugs)

The code audit shows the flow is correctly implemented. If changes don't reflect in UI, these are the likely causes:

| Issue | Cause | Solution |
|-------|-------|----------|
| **Backend not running** | API calls fail silently | Check network tab for errors |
| **Auth token expired** | 401 errors on API calls | Re-login |
| **No administration** | User skipped onboarding | Complete onboarding flow |
| **Database not migrated** | Tables don't exist | Run `alembic upgrade head` |
| **CORS issues** | Browser blocks cross-origin | Check backend CORS config |

### 4.2 Code Behavior Verified

- ✅ After save → `loadData()` is called → UI refreshes
- ✅ After status change → `loadData()` is called → UI refreshes
- ✅ After delete → `loadData()` is called → UI refreshes

---

## 5. Fix Strategy

### Option A: Unify Everything into One Module (RECOMMENDED: ALREADY DONE)

**Current State**: ✅ The codebase is ALREADY unified!

- ✅ ONE invoices page: `ZZPInvoicesPage.tsx`
- ✅ ONE API client: `zzpApi.invoices.*` in `api.ts`
- ✅ ONE backend route: `/api/v1/zzp/invoices` in `zzp_invoices.py`
- ✅ ONE database model: `ZZPInvoice` in `zzp.py`

### Option B: Delete Unused Files (CLEANUP)

Remove the dead code files:

```bash
# Dead localStorage-based storage (replaced by backend API)
rm src/lib/storage/zzp.ts

# Dead demo generator (uses non-existent hooks)
rm src/components/DemoInvoiceGenerator.tsx
```

---

## 6. Conclusion

**AUDIT RESULT**: The ZZP Invoices flow is **correctly implemented**.

- UI correctly calls backend API
- Save button triggers API call and refreshes data
- Download uses blob with proper MIME type + mobile fallback
- Status field exists and UI controls are wired

**If changes don't reflect in UI**, the issue is likely:
1. Backend server not running
2. Database not migrated
3. Auth token expired
4. Network/CORS issues

**Recommended Cleanup**: Delete the 2 dead files identified above.
