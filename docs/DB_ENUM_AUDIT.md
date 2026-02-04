# Database Enum Audit

## Overview
This document audits the mismatch between PostgreSQL database enum values and SQLAlchemy model enum values for the `documentstatus` type.

## Production Error
```
invalid input value for enum documentstatus: "NEEDS_REVIEW"
Query filters: documents.status = 'NEEDS_REVIEW'
```

## SQL to Audit DB Enum Values
```sql
SELECT unnest(enum_range(NULL::documentstatus)) AS value;
```

## Current State

### DB Enum Values (from migration 001_initial.py)
The PostgreSQL `documentstatus` enum was created with:
```sql
CREATE TYPE documentstatus AS ENUM ('UPLOADED', 'PROCESSING', 'DRAFT_READY', 'FAILED')
```

Current DB values:
1. `UPLOADED`
2. `PROCESSING`
3. `DRAFT_READY`
4. `FAILED`

### Code Enum Values (from app/models/document.py)
The SQLAlchemy `DocumentStatus` enum expects:
```python
class DocumentStatus(str, enum.Enum):
    UPLOADED = "UPLOADED"           # Just uploaded, waiting for processing
    PROCESSING = "PROCESSING"       # Being processed/extracted
    EXTRACTED = "EXTRACTED"         # Fields extracted, ready for matching
    NEEDS_REVIEW = "NEEDS_REVIEW"   # Needs accountant review
    POSTED = "POSTED"               # Successfully posted to journal
    REJECTED = "REJECTED"           # Rejected by accountant
    DRAFT_READY = "DRAFT_READY"     # Legacy: Draft transaction created
    FAILED = "FAILED"               # Processing failed
```

Code values:
1. `UPLOADED`
2. `PROCESSING`
3. `EXTRACTED` ⚠️ **MISSING IN DB**
4. `NEEDS_REVIEW` ⚠️ **MISSING IN DB**
5. `POSTED` ⚠️ **MISSING IN DB**
6. `REJECTED` ⚠️ **MISSING IN DB**
7. `DRAFT_READY`
8. `FAILED`

## Diff Analysis

| Value | In DB | In Code | Status |
|-------|-------|---------|--------|
| UPLOADED | ✅ | ✅ | OK |
| PROCESSING | ✅ | ✅ | OK |
| DRAFT_READY | ✅ | ✅ | OK (Legacy) |
| FAILED | ✅ | ✅ | OK |
| EXTRACTED | ❌ | ✅ | **MISSING** |
| NEEDS_REVIEW | ❌ | ✅ | **MISSING** |
| POSTED | ❌ | ✅ | **MISSING** |
| REJECTED | ❌ | ✅ | **MISSING** |

## NEEDS_REVIEW Usage in Codebase

### Backend Usage
- `backend/app/models/document.py` - Enum definition
- `backend/app/services/accountant_dashboard.py` - Dashboard backlog count
- `backend/app/services/work_queue.py` - Work queue queries
- `backend/app/services/documents/matching.py` - Document status transitions
- `backend/app/services/documents/posting.py` - Posting prerequisites
- `backend/app/services/documents/checklist.py` - Review checklist
- `backend/app/services/alerts.py` - Alert generation
- `backend/app/services/metrics.py` - Metrics collection
- `backend/app/api/v1/review_queue.py` - Review queue filtering

### Frontend Usage
- `src/components/ReviewQueue.tsx` - Filter by NEEDS_REVIEW status
- `src/components/BankReconciliationPage.tsx` - Status display

### Test Files
- `backend/tests/test_accountant_dashboard.py`
- `backend/tests/test_document_intake.py`
- `backend/tests/test_observability.py`

## Decision

**Action: ADD MISSING ENUM VALUES TO DATABASE**

Rationale:
1. `NEEDS_REVIEW` is a legitimate status used throughout the codebase for the document intake pipeline workflow
2. The migration 008_document_intake_pipeline.py added document intake fields but **forgot to expand the enum**
3. There is no equivalent value in the DB (no "TO_REVIEW" or "PENDING_REVIEW")
4. Multiple services depend on these status values

## Resolution

Create a new Alembic migration to safely add the missing enum values:
- `EXTRACTED`
- `NEEDS_REVIEW`
- `POSTED`
- `REJECTED`

The migration will be idempotent, checking `pg_enum` before attempting to add values.

## Validation Commands

### Verify enum values after migration
```sql
SELECT unnest(enum_range(NULL::documentstatus)) AS value;
```

Expected output:
```
UPLOADED
PROCESSING
DRAFT_READY
FAILED
EXTRACTED
NEEDS_REVIEW
POSTED
REJECTED
```

### Verify via curl (production)
```bash
# Test dashboard summary endpoint (uses NEEDS_REVIEW)
curl -X GET "https://api.example.com/api/v1/accountant/dashboard/summary" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"

# Test bank transactions endpoint (verifies routing)
curl -X GET "https://api.example.com/api/v1/accountant/bank/transactions?administration_id=<uuid>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

## Related Files Changed
- `backend/alembic/versions/015_add_document_status_enum_values.py` (new migration)
- `backend/app/main.py` (startup logging)
- `backend/tests/test_accountant_dashboard.py` (new tests)
- `docs/DB_ENUM_AUDIT.md` (this file)
