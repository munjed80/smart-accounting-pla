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
