# Core Ledger API Documentation

This document describes the API endpoints for the Core Ledger + Consistency Engine.

## Overview

The Core Ledger API provides accountant-only endpoints to support:
- Client overview with status counts
- Issues list from consistency engine
- Trigger recalculation/validation
- Financial reports (Balance Sheet, P&L, AR, AP)

All endpoints require authentication and accountant role.

## Base URL

```
/api/v1/accountant
```

## Authentication

All endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## Endpoints

### GET /clients/{client_id}/overview

Get high-level status for a client.

**Response:**
```json
{
  "client_id": "uuid",
  "client_name": "Example BV",
  "missing_docs_count": 2,
  "error_count": 1,
  "warning_count": 3,
  "upcoming_deadlines": [],
  "total_journal_entries": 150,
  "draft_entries_count": 5,
  "posted_entries_count": 145,
  "total_open_receivables": 5000.00,
  "total_open_payables": 3200.00
}
```

---

### GET /clients/{client_id}/issues

Get all issues from the consistency engine.

**Query Parameters:**
- `include_resolved` (boolean, default: false) - Include resolved issues

**Response:**
```json
{
  "client_id": "uuid",
  "client_name": "Example BV",
  "total_issues": 4,
  "red_count": 1,
  "yellow_count": 3,
  "issues": [
    {
      "id": "uuid",
      "issue_code": "AR_RECON_MISMATCH",
      "severity": "RED",
      "title": "Accounts Receivable reconciliation mismatch",
      "description": "Control account balance (€5000.00) does not match open items total (€4800.00). Difference: €200.00",
      "why": "This could be due to manual entries to control accounts without matching open items.",
      "suggested_action": "Review recent debiteuren transactions.",
      "document_id": null,
      "journal_entry_id": null,
      "account_id": "uuid",
      "fixed_asset_id": null,
      "party_id": null,
      "open_item_id": null,
      "amount_discrepancy": 200.00,
      "is_resolved": false,
      "resolved_at": null,
      "created_at": "2024-01-26T10:00:00Z"
    }
  ]
}
```

**Issue Codes:**
| Code | Severity | Description |
|------|----------|-------------|
| `JOURNAL_UNBALANCED` | RED | Journal entry debit ≠ credit |
| `ORPHAN_LINE` | RED | Journal line without parent entry |
| `MISSING_ACCOUNT` | RED | Line references non-existent account |
| `AR_RECON_MISMATCH` | RED | AR control account ≠ open items |
| `AP_RECON_MISMATCH` | RED | AP control account ≠ open items |
| `OVERDUE_RECEIVABLE` | YELLOW/RED | Receivable past due date |
| `OVERDUE_PAYABLE` | YELLOW/RED | Payable past due date |
| `DEPRECIATION_NOT_POSTED` | YELLOW | Unposted depreciation schedule |
| `DEPRECIATION_MISMATCH` | RED | Asset depreciation out of sync |
| `VAT_RATE_MISMATCH` | YELLOW | VAT amount doesn't match rate |
| `VAT_NEGATIVE` | YELLOW | Unexpected negative VAT |

---

### POST /clients/{client_id}/journal/recalculate

Trigger recalculation/validation for a client. Idempotent and safe.

**Request Body:**
```json
{
  "force": false
}
```

**Response:**
```json
{
  "success": true,
  "validation_run_id": "uuid",
  "issues_found": 4,
  "message": "Validation completed. Found 4 issues."
}
```

---

### GET /clients/{client_id}/reports/balance-sheet

Get Balance Sheet (Activa/Passiva) report.

**Query Parameters:**
- `as_of_date` (date, optional) - Date for the report (default: today)

**Response:**
```json
{
  "as_of_date": "2024-01-26",
  "current_assets": {
    "name": "Vlottende Activa (Current Assets)",
    "accounts": [
      {
        "account_id": "uuid",
        "account_code": "1000",
        "account_name": "Kas",
        "account_type": "ASSET",
        "debit_total": 5000.00,
        "credit_total": 1000.00,
        "balance": 4000.00
      }
    ],
    "total": 25000.00
  },
  "fixed_assets": {
    "name": "Vaste Activa (Fixed Assets)",
    "accounts": [],
    "total": 10000.00
  },
  "total_assets": 35000.00,
  "current_liabilities": {
    "name": "Kortlopende Schulden (Current Liabilities)",
    "accounts": [],
    "total": 8000.00
  },
  "long_term_liabilities": {
    "name": "Langlopende Schulden (Long-term Liabilities)",
    "accounts": [],
    "total": 0.00
  },
  "equity": {
    "name": "Eigen Vermogen (Equity)",
    "accounts": [],
    "total": 27000.00
  },
  "total_liabilities_equity": 35000.00,
  "is_balanced": true
}
```

---

### GET /clients/{client_id}/reports/pnl

Get Profit & Loss (Winst- en verliesrekening) report.

**Query Parameters:**
- `start_date` (date, optional) - Start date (default: start of year)
- `end_date` (date, optional) - End date (default: today)

**Response:**
```json
{
  "start_date": "2024-01-01",
  "end_date": "2024-01-26",
  "revenue": {
    "name": "Omzet (Revenue)",
    "accounts": [
      {
        "account_id": "uuid",
        "account_code": "8000",
        "account_name": "Omzet diensten",
        "account_type": "REVENUE",
        "debit_total": 0.00,
        "credit_total": 50000.00,
        "balance": 50000.00
      }
    ],
    "total": 50000.00
  },
  "cost_of_goods_sold": {
    "name": "Kostprijs Omzet (Cost of Goods Sold)",
    "accounts": [],
    "total": 20000.00
  },
  "gross_profit": 30000.00,
  "operating_expenses": {
    "name": "Bedrijfskosten (Operating Expenses)",
    "accounts": [],
    "total": 15000.00
  },
  "operating_income": 15000.00,
  "other_income": {
    "name": "Overige Baten (Other Income)",
    "accounts": [],
    "total": 0.00
  },
  "other_expenses": {
    "name": "Overige Lasten (Other Expenses)",
    "accounts": [],
    "total": 500.00
  },
  "net_income": 14500.00
}
```

---

### GET /clients/{client_id}/reports/ar

Get Accounts Receivable (Debiteuren) report.

**Query Parameters:**
- `as_of_date` (date, optional) - Date for the report (default: today)

**Response:**
```json
{
  "report_type": "RECEIVABLE",
  "as_of_date": "2024-01-26",
  "items": [
    {
      "party_id": "uuid",
      "party_name": "Klant BV",
      "party_code": "K001",
      "document_number": "INV-2024-001",
      "document_date": "2024-01-15",
      "due_date": "2024-02-15",
      "original_amount": 1000.00,
      "paid_amount": 0.00,
      "open_amount": 1000.00,
      "days_overdue": 0,
      "status": "OPEN"
    }
  ],
  "total_original": 5000.00,
  "total_paid": 1000.00,
  "total_open": 4000.00,
  "overdue_amount": 500.00
}
```

---

### GET /clients/{client_id}/reports/ap

Get Accounts Payable (Crediteuren) report.

**Query Parameters:**
- `as_of_date` (date, optional) - Date for the report (default: today)

**Response:**
```json
{
  "report_type": "PAYABLE",
  "as_of_date": "2024-01-26",
  "items": [
    {
      "party_id": "uuid",
      "party_name": "Leverancier BV",
      "party_code": "L001",
      "document_number": "PINV-2024-001",
      "document_date": "2024-01-10",
      "due_date": "2024-02-10",
      "original_amount": 2500.00,
      "paid_amount": 0.00,
      "open_amount": 2500.00,
      "days_overdue": 0,
      "status": "OPEN"
    }
  ],
  "total_original": 8000.00,
  "total_paid": 3000.00,
  "total_open": 5000.00,
  "overdue_amount": 1200.00
}
```

---

## Error Responses

All endpoints return standard error responses:

**401 Unauthorized:**
```json
{
  "detail": "Not authenticated"
}
```

**403 Forbidden:**
```json
{
  "detail": "This endpoint is only available for accountants"
}
```

**404 Not Found:**
```json
{
  "detail": "Client not found or access denied"
}
```

**500 Internal Server Error:**
```json
{
  "detail": "Internal server error message"
}
```

---

## Decision Engine API

The Decision Engine allows accountants to approve, reject, or override suggested actions for detected issues.

### GET /issues/{issue_id}/suggestions

Get suggested actions for an issue.

**Response:**
```json
{
  "issue_id": "uuid",
  "issue_title": "Unposted depreciation: Laptop",
  "issue_code": "DEPRECIATION_NOT_POSTED",
  "suggestions": [
    {
      "id": "uuid",
      "issue_id": "uuid",
      "action_type": "CREATE_DEPRECIATION",
      "title": "Post depreciation entry for Laptop",
      "explanation": "Depreciation for this period has not been posted...",
      "parameters": {
        "fixed_asset_id": "uuid",
        "amount": "333.33"
      },
      "confidence_score": 0.85,
      "is_auto_suggested": false,
      "priority": 1,
      "created_at": "2024-01-26T10:00:00Z"
    }
  ],
  "total_suggestions": 1
}
```

**Action Types:**
| Action Type | Description |
|------------|-------------|
| `RECLASSIFY_TO_ASSET` | Reclassify expense to fixed asset |
| `CREATE_DEPRECIATION` | Create depreciation schedule entry |
| `CORRECT_VAT_RATE` | Correct VAT rate calculation |
| `ALLOCATE_OPEN_ITEM` | Allocate payment to AR/AP item |
| `FLAG_DOCUMENT_INVALID` | Flag document as invalid/missing |
| `LOCK_PERIOD` | Lock accounting period |
| `REVERSE_JOURNAL_ENTRY` | Reverse a journal entry |
| `CREATE_ADJUSTMENT_ENTRY` | Create adjustment entry |

---

### POST /issues/{issue_id}/decide

Make a decision on an issue.

**Request Body:**
```json
{
  "suggested_action_id": "uuid",
  "action_type": "CREATE_DEPRECIATION",
  "decision": "APPROVED",
  "override_parameters": null,
  "notes": "Approved monthly depreciation"
}
```

**Query Parameters:**
- `auto_execute` (boolean, default: true) - Execute immediately after approval

**Decision Types:**
- `APPROVED` - Accept and execute the suggestion
- `REJECTED` - Reject the suggestion (remembered for learning)
- `OVERRIDDEN` - Approve with custom parameters

**Response:**
```json
{
  "id": "uuid",
  "issue_id": "uuid",
  "suggested_action_id": "uuid",
  "action_type": "CREATE_DEPRECIATION",
  "decision": "APPROVED",
  "override_parameters": null,
  "notes": "Approved monthly depreciation",
  "decided_by_id": "uuid",
  "decided_at": "2024-01-26T10:30:00Z",
  "execution_status": "EXECUTED",
  "executed_at": "2024-01-26T10:30:01Z",
  "execution_error": null,
  "result_journal_entry_id": "uuid",
  "is_reversible": true
}
```

**Execution Status:**
- `PENDING` - Awaiting execution
- `EXECUTED` - Successfully executed
- `FAILED` - Execution failed
- `ROLLED_BACK` - Action was reversed

---

### POST /decisions/{decision_id}/execute

Execute a previously approved decision (if auto_execute was false).

**Response:**
```json
{
  "decision_id": "uuid",
  "execution_status": "EXECUTED",
  "executed_at": "2024-01-26T10:30:01Z",
  "result_journal_entry_id": "uuid",
  "error_message": null,
  "message": "Execution successful"
}
```

---

### POST /decisions/{decision_id}/reverse

Reverse an executed decision.

**Request Body:**
```json
{
  "reason": "Incorrect depreciation amount"
}
```

**Response:**
```json
{
  "decision_id": "uuid",
  "reversed_at": "2024-01-26T11:00:00Z",
  "reversal_journal_entry_id": "uuid",
  "message": "Decision reversed successfully. Issue has been re-opened."
}
```

---

### GET /clients/{client_id}/decision-history

Get decision history for a client.

**Query Parameters:**
- `limit` (integer, default: 50) - Max results to return
- `offset` (integer, default: 0) - Pagination offset

**Response:**
```json
{
  "client_id": "uuid",
  "client_name": "Example BV",
  "total_decisions": 25,
  "decisions": [
    {
      "id": "uuid",
      "issue_id": "uuid",
      "issue_title": "Unposted depreciation: Laptop",
      "issue_code": "DEPRECIATION_NOT_POSTED",
      "action_type": "CREATE_DEPRECIATION",
      "decision": "APPROVED",
      "decided_by_name": "Jan Accountant",
      "decided_at": "2024-01-26T10:30:00Z",
      "execution_status": "EXECUTED",
      "is_reversible": true
    }
  ]
}
```

---

### GET /clients/{client_id}/decision-patterns

Get learned decision patterns for a client.

**Response:**
```json
{
  "client_id": "uuid",
  "client_name": "Example BV",
  "patterns": [
    {
      "id": "uuid",
      "issue_code": "DEPRECIATION_NOT_POSTED",
      "action_type": "CREATE_DEPRECIATION",
      "approval_count": 5,
      "rejection_count": 0,
      "confidence_boost": 0.25,
      "last_approved_at": "2024-01-26T10:30:00Z",
      "last_rejected_at": null
    }
  ]
}
```

---

## Period Control & Finalization API

The Period Control API provides accountant-only endpoints for managing accounting period lifecycle.

### Period Status Model

| Status | Description | Posting Allowed | Modifications Allowed |
|--------|-------------|-----------------|----------------------|
| `OPEN` | Normal working period | ✅ Yes | ✅ Yes |
| `REVIEW` | Under review, validation triggered | ✅ Yes | ✅ Yes |
| `FINALIZED` | Closed for changes | ❌ No | ❌ No (reversals only) |
| `LOCKED` | Immutable (hard lock) | ❌ No | ❌ No |

### GET /clients/{client_id}/periods

List accounting periods for a client.

**Query Parameters:**
- `status` (array, optional) - Filter by status (OPEN, REVIEW, FINALIZED, LOCKED)
- `limit` (integer, default: 50) - Max results

**Response:**
```json
{
  "administration_id": "uuid",
  "periods": [
    {
      "id": "uuid",
      "name": "2024-Q1",
      "period_type": "QUARTER",
      "start_date": "2024-01-01",
      "end_date": "2024-03-31",
      "status": "OPEN",
      "is_closed": false,
      "created_at": "2024-01-01T00:00:00Z",
      "finalized_at": null,
      "locked_at": null
    }
  ],
  "total_count": 4
}
```

---

### GET /clients/{client_id}/periods/{period_id}

Get period details with current validation status.

**Response:**
```json
{
  "period": {
    "id": "uuid",
    "name": "2024-Q1",
    "status": "REVIEW"
  },
  "validation": {
    "red_issues": [
      {
        "id": "uuid",
        "code": "AR_RECON_MISMATCH",
        "title": "AR mismatch",
        "description": "Control account doesn't match open items"
      }
    ],
    "yellow_issues": [
      {
        "id": "uuid",
        "code": "DEPRECIATION_NOT_POSTED",
        "title": "Unposted depreciation"
      }
    ],
    "can_finalize": false,
    "validation_summary": {
      "total_issues": 2,
      "red_count": 1,
      "yellow_count": 1
    }
  }
}
```

---

### POST /clients/{client_id}/periods/{period_id}/review

Start the review process for a period. Triggers full validation.

**Request Body:**
```json
{
  "notes": "Quarterly review start"
}
```

**Response:**
```json
{
  "period": {
    "id": "uuid",
    "status": "REVIEW",
    "review_started_at": "2024-01-26T10:00:00Z"
  },
  "validation_run_id": "uuid",
  "issues_found": 5,
  "message": "Period review started. Found 5 issues."
}
```

---

### POST /clients/{client_id}/periods/{period_id}/finalize

Finalize an accounting period. Creates immutable snapshot.

**Prerequisites:**
- All RED issues must be resolved
- All YELLOW issues must be explicitly acknowledged

**Request Body:**
```json
{
  "acknowledged_yellow_issues": ["uuid-1", "uuid-2"],
  "notes": "Q1 2024 finalization complete"
}
```

**Response:**
```json
{
  "period": {
    "id": "uuid",
    "status": "FINALIZED",
    "finalized_at": "2024-01-26T15:00:00Z"
  },
  "snapshot_id": "uuid",
  "message": "Period finalized successfully. A snapshot of all financial reports has been created."
}
```

**Error Response (Prerequisites not met):**
```json
{
  "detail": {
    "message": "Cannot finalize: 1 RED issues must be resolved first.",
    "red_issues": [...],
    "yellow_issues": [...]
  }
}
```

---

### POST /clients/{client_id}/periods/{period_id}/lock

Lock a finalized period. **IRREVERSIBLE.**

**Request Body:**
```json
{
  "confirm_irreversible": true,
  "notes": "Locked for annual audit"
}
```

**Response:**
```json
{
  "period": {
    "id": "uuid",
    "status": "LOCKED",
    "locked_at": "2024-01-26T16:00:00Z"
  },
  "message": "Period locked permanently. This action cannot be undone."
}
```

---

### GET /clients/{client_id}/periods/{period_id}/snapshot

Get the finalization snapshot for a period.

**Response:**
```json
{
  "id": "uuid",
  "period_id": "uuid",
  "snapshot_type": "FINALIZATION",
  "created_at": "2024-01-26T15:00:00Z",
  "summary": {
    "total_assets": 50000.00,
    "total_liabilities": 20000.00,
    "total_equity": 30000.00,
    "net_income": 15000.00,
    "total_ar": 5000.00,
    "total_ap": 3000.00
  },
  "balance_sheet": { ... },
  "profit_and_loss": { ... },
  "vat_summary": { ... },
  "open_ar_balances": { ... },
  "open_ap_balances": { ... },
  "acknowledged_yellow_issues": ["uuid-1", "uuid-2"],
  "issue_summary": {
    "total_issues": 2,
    "red_count": 0,
    "yellow_count": 2
  }
}
```

---

### GET /clients/{client_id}/periods/{period_id}/audit-logs

Get audit logs for a period.

**Response:**
```json
{
  "period_id": "uuid",
  "logs": [
    {
      "id": "uuid",
      "action": "FINALIZE",
      "from_status": "REVIEW",
      "to_status": "FINALIZED",
      "performed_by_id": "uuid",
      "performed_at": "2024-01-26T15:00:00Z",
      "notes": "Q1 finalization",
      "snapshot_id": "uuid"
    },
    {
      "id": "uuid",
      "action": "REVIEW_START",
      "from_status": "OPEN",
      "to_status": "REVIEW",
      "performed_by_id": "uuid",
      "performed_at": "2024-01-26T10:00:00Z",
      "notes": null
    }
  ],
  "total_count": 2
}
```

---

## Data Model Summary

### Journal Entries
- `journal_entries` - Header table with entry_number, date, description, totals
- `journal_lines` - Lines with account_id, debit/credit amounts
- Double-entry enforced: sum(debit) == sum(credit) per entry

### Subledgers
- `parties` - Customers (CUSTOMER) and suppliers (SUPPLIER)
- `open_items` - Outstanding receivables (RECEIVABLE) and payables (PAYABLE)
- Derived from AR/AP control account postings

### Fixed Assets
- `fixed_assets` - Asset register with acquisition cost, useful life, depreciation method
- `depreciation_schedules` - Monthly depreciation entries

### Issues
- `client_issues` - Consistency issues found by validation engine
- `validation_runs` - Audit trail of validation runs

### Decision Engine
- `suggested_actions` - Suggested actions for issues with confidence scores
- `accountant_decisions` - Accountant decisions with audit trail
- `decision_patterns` - Learning patterns for confidence boosting

### Period Control
- `accounting_periods` - Extended with status (OPEN, REVIEW, FINALIZED, LOCKED)
- `period_snapshots` - Immutable snapshots of financial reports at finalization
- `period_audit_logs` - Complete audit trail of period control actions
