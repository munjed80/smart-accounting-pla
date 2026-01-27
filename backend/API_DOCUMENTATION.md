# Smart Accounting Platform API Documentation

This document describes the API endpoints for the Smart Accounting Platform.

## Overview

The API provides:
- Authentication (registration, login, email verification, password reset)
- Client overview with status counts
- Issues list from consistency engine
- Trigger recalculation/validation
- Financial reports (Balance Sheet, P&L, AR, AP)

---

## Authentication Endpoints

Base URL: `/api/v1/auth`

### POST /register

Register a new user. Creates an unverified user and sends a verification email.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "full_name": "John Doe",
  "role": "zzp"  // Optional: "zzp" | "accountant" | "admin"
}
```

**Response (201 Created):**
```json
{
  "message": "Check your email to verify your account",
  "user_id": "uuid"
}
```

**Error Responses:**
- `400 Bad Request`: Email already registered
- `422 Unprocessable Entity`: Validation errors
- `429 Too Many Requests`: Rate limit exceeded (5/min per IP)

---

### POST /resend-verification

Resend verification email. Always returns success to prevent email enumeration.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "message": "If an account with this email exists and is not yet verified, a verification email has been sent."
}
```

**Rate Limit:** 5 requests per minute per IP

---

### GET /verify-email?token={token}

Verify user's email address.

**Query Parameters:**
- `token` (required): Verification token from email

**Response (200 OK):**
```json
{
  "message": "Email verified successfully",
  "verified": true
}
```

**Error Responses:**
- `400 Bad Request`: Invalid or expired token
- `429 Too Many Requests`: Rate limit exceeded (20/min per IP)

---

### POST /token

Login and get access token. Blocked if email is not verified.

**Request Body (form-urlencoded):**
```
username=user@example.com&password=securePassword123
```

**Response (200 OK):**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

**Error Responses:**
- `401 Unauthorized`: Incorrect email or password
- `403 Forbidden`: Email not verified
  ```json
  {
    "detail": {
      "message": "Please verify your email before logging in",
      "code": "EMAIL_NOT_VERIFIED",
      "hint": "Check your inbox for a verification email or request a new one"
    }
  }
  ```
- `429 Too Many Requests`: Rate limit exceeded (10/min per IP)

---

### POST /forgot-password

Request password reset email. Always returns success to prevent email enumeration.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "message": "If an account with this email exists, a password reset email has been sent."
}
```

**Rate Limit:** 5 requests per minute per IP

---

### POST /reset-password

Reset password with token.

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "new_password": "newSecurePass123"
}
```

**Password Requirements:**
- Minimum 10 characters
- Must contain at least one letter (A-Z, a-z)
- Must contain at least one number (0-9)

**Response (200 OK):**
```json
{
  "message": "Password reset successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid or expired token
- `422 Unprocessable Entity`: Password doesn't meet requirements
- `429 Too Many Requests`: Rate limit exceeded (5/min per IP)

---

### GET /me

Get current authenticated user info.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "zzp",
  "is_active": true,
  "is_email_verified": true,
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

## Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `EMAIL_NOT_VERIFIED` | 403 | User's email is not verified |
| `INVALID_TOKEN` | 400 | Token is invalid, expired, or already used |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| /register | 5/min per IP |
| /resend-verification | 5/min per IP |
| /verify-email | 20/min per IP |
| /token (login) | 10/min per IP |
| /forgot-password | 5/min per IP |
| /reset-password | 5/min per IP |

---

## Core Ledger API

Base URL: `/api/v1/accountant`

All endpoints below require authentication and accountant role.

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

## Dutch VAT/BTW Filing API

The VAT Filing API provides accountant-only endpoints for Dutch VAT returns (BTW Aangifte).

### VAT Code Categories

| Category | Description |
|----------|-------------|
| `SALES` | Standard sales VAT |
| `PURCHASES` | Standard purchase VAT (input tax) |
| `REVERSE_CHARGE` | Reverse charge mechanism |
| `INTRA_EU` | Intra-EU transactions |
| `EXEMPT` | VAT exempt transactions |
| `ZERO_RATE` | Zero-rate taxable supplies |

### Dutch VAT Return Boxes

| Box | Description |
|-----|-------------|
| 1a | Leveringen/diensten belast met hoog tarief (21%) |
| 1b | Leveringen/diensten belast met laag tarief (9%) |
| 1c | Leveringen/diensten belast met ander tarief |
| 1d | Privégebruik |
| 1e | Leveringen/diensten belast met 0% of niet bij u belast |
| 2a | Verwerving uit landen binnen de EU |
| 3a | Leveringen naar landen buiten de EU |
| 3b | Leveringen naar/diensten in landen binnen de EU (ICP) |
| 4a | Verlegde btw - diensten uit EU |
| 4b | Verlegde btw - overig |
| 5a | Verschuldigde btw (subtotaal) |
| 5b | Voorbelasting |
| 5c | Subtotaal (5a - 5b) |
| 5g | Totaal te betalen / te ontvangen |

---

### GET /clients/{client_id}/periods/{period_id}/reports/vat

Generate Dutch VAT return (BTW Aangifte) report for a period.

**Query Parameters:**
- `allow_draft` (boolean, default: false) - Allow report generation for OPEN periods

**Response:**
```json
{
  "period_id": "uuid",
  "period_name": "2024-Q1",
  "start_date": "2024-01-01",
  "end_date": "2024-03-31",
  "generated_at": "2024-01-26T15:00:00Z",
  "boxes": {
    "1a": {
      "box_code": "1a",
      "box_name": "Leveringen/diensten belast met hoog tarief (21%)",
      "turnover_amount": "10000.00",
      "vat_amount": "2100.00",
      "transaction_count": 45
    },
    "5b": {
      "box_code": "5b",
      "box_name": "Voorbelasting",
      "turnover_amount": "0.00",
      "vat_amount": "500.00",
      "transaction_count": 0
    },
    "5g": {
      "box_code": "5g",
      "box_name": "Totaal te betalen / te ontvangen",
      "turnover_amount": "0.00",
      "vat_amount": "1600.00",
      "transaction_count": 0
    }
  },
  "vat_code_summaries": [
    {
      "vat_code_id": "uuid",
      "vat_code": "NL_21",
      "vat_code_name": "BTW 21%",
      "vat_rate": "21.00",
      "category": "SALES",
      "base_amount": "10000.00",
      "vat_amount": "2100.00",
      "transaction_count": 45
    }
  ],
  "total_turnover": "10000.00",
  "total_vat_payable": "2100.00",
  "total_vat_receivable": "500.00",
  "net_vat": "1600.00",
  "anomalies": [],
  "has_red_anomalies": false,
  "has_yellow_anomalies": false,
  "icp_entries": [],
  "total_icp_supplies": "0.00"
}
```

---

### GET /clients/{client_id}/periods/{period_id}/reports/vat/icp

Get ICP (Intra-Community) supplies report for EU B2B transactions.

**Response:**
```json
{
  "period_id": "uuid",
  "period_name": "2024-Q1",
  "start_date": "2024-01-01",
  "end_date": "2024-03-31",
  "entries": [
    {
      "customer_vat_number": "DE123456789",
      "country_code": "DE",
      "customer_name": "German Customer GmbH",
      "customer_id": "uuid",
      "taxable_base": "5000.00",
      "transaction_count": 3
    },
    {
      "customer_vat_number": "BE0123456789",
      "country_code": "BE",
      "customer_name": "Belgian Company NV",
      "customer_id": "uuid",
      "taxable_base": "2500.00",
      "transaction_count": 2
    }
  ],
  "total_supplies": "7500.00",
  "total_customers": 2
}
```

---

### POST /clients/{client_id}/periods/{period_id}/vat/validate

Validate VAT data for a period and return anomalies.

**Response:**
```json
{
  "period_id": "uuid",
  "period_name": "2024-Q1",
  "anomalies": [
    {
      "id": "VAT_ANOMALY_0001",
      "code": "VAT_RATE_MISMATCH",
      "severity": "YELLOW",
      "title": "VAT rate mismatch",
      "description": "VAT amount €25.00 doesn't match expected €21.00 for base €100.00 at 21%.",
      "journal_entry_id": "uuid",
      "journal_line_id": "uuid",
      "document_id": "uuid",
      "suggested_fix": "Verify VAT calculation or correct the rate",
      "amount_discrepancy": "4.00"
    }
  ],
  "total_anomalies": 1,
  "red_count": 0,
  "yellow_count": 1,
  "is_valid": true,
  "message": "VAT data has 1 warning(s) that can be acknowledged."
}
```

**Anomaly Codes:**

| Code | Severity | Description |
|------|----------|-------------|
| `VAT_BASE_NO_AMOUNT` | YELLOW | VAT base amount without VAT amount |
| `VAT_AMOUNT_NO_BASE` | YELLOW | VAT amount without base amount |
| `VAT_RATE_MISMATCH` | YELLOW/RED | VAT amount doesn't match expected rate |
| `ICP_NO_VAT_NUMBER` | RED | ICP supply without customer VAT number |
| `RC_NO_COUNTRY` | YELLOW | Reverse charge without supplier country |
| `VAT_NEGATIVE_UNEXPECTED` | YELLOW | Unexpected negative VAT amount |

---

### GET /accountant/vat-codes

List all available Dutch VAT codes.

**Query Parameters:**
- `active_only` (boolean, default: true) - Only return active VAT codes

**Response:**
```json
{
  "vat_codes": [
    {
      "id": "uuid",
      "code": "NL_21",
      "name": "BTW 21%",
      "description": "Standaard BTW tarief 21%",
      "rate": "21.00",
      "category": "SALES",
      "box_mapping": {"turnover_box": "1a", "vat_box": "1a"},
      "eu_only": false,
      "requires_vat_number": false,
      "is_reverse_charge": false,
      "is_icp": false,
      "is_active": true
    },
    {
      "id": "uuid",
      "code": "ICP_SUPPLIES",
      "name": "ICL - Intracommunautaire levering",
      "description": "Leveringen aan EU-landen",
      "rate": "0.00",
      "category": "INTRA_EU",
      "box_mapping": {"turnover_box": "3b"},
      "eu_only": true,
      "requires_vat_number": true,
      "is_reverse_charge": false,
      "is_icp": true,
      "is_active": true
    }
  ],
  "total_count": 12
}
```

---

## Data Model Summary

### Journal Entries
- `journal_entries` - Header table with entry_number, date, description, totals
- `journal_lines` - Lines with account_id, debit/credit amounts, VAT fields
- Double-entry enforced: sum(debit) == sum(credit) per entry

### VAT/BTW
- `vat_codes` - Dutch VAT codes with category, rate, and box mapping
- `journal_lines.vat_code_id` - VAT code for each line
- `journal_lines.vat_base_amount` - Base amount for VAT calculation
- `journal_lines.vat_country` - Country code for EU transactions
- `journal_lines.vat_is_reverse_charge` - Reverse charge indicator
- `journal_lines.party_vat_number` - Customer/supplier VAT number for ICP

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
- `period_snapshots` - Immutable snapshots of financial reports at finalization (includes VAT)
- `period_audit_logs` - Complete audit trail of period control actions

---

## Document Review Queue API

The Document Review Queue API provides accountant-only endpoints for reviewing, posting, and managing documents.

### Document States

| Status | Description |
|--------|-------------|
| `UPLOADED` | Document uploaded, waiting for processing |
| `PROCESSING` | Document being processed/extracted |
| `EXTRACTED` | Fields extracted, ready for matching |
| `NEEDS_REVIEW` | Needs accountant review before posting |
| `POSTED` | Successfully posted to journal |
| `REJECTED` | Rejected by accountant |
| `FAILED` | Processing failed |

### Suggested Action Types

| Action Type | Description |
|-------------|-------------|
| `ALLOCATE_OPEN_ITEM` | Match document to an open AR/AP item |
| `RECLASSIFY_TO_ASSET` | Treat as fixed asset purchase |
| `CREATE_DEPRECIATION` | Create depreciation schedule |
| `MARK_DUPLICATE` | Flag as duplicate document |
| `POST_AS_EXPENSE` | Post as regular expense |
| `POST_AS_REVENUE` | Post as revenue |
| `NEEDS_MANUAL_REVIEW` | Requires manual review |

---

### GET /clients/{client_id}/documents

List documents for a client, optionally filtered by status.

**Query Parameters:**
- `status` (string, optional) - Filter by document status (e.g., `NEEDS_REVIEW`)

**Response:**
```json
{
  "client_id": "uuid",
  "client_name": "Example BV",
  "total_documents": 15,
  "documents": [
    {
      "id": "uuid",
      "administration_id": "uuid",
      "original_filename": "invoice_001.pdf",
      "mime_type": "application/pdf",
      "file_size": 125000,
      "status": "NEEDS_REVIEW",
      "error_message": null,
      "created_at": "2024-01-26T10:00:00Z",
      "updated_at": "2024-01-26T10:05:00Z",
      "supplier_name": "ACME Corp",
      "invoice_number": "INV-2024-001",
      "invoice_date": "2024-01-15T00:00:00Z",
      "due_date": "2024-02-15T00:00:00Z",
      "total_amount": 1210.00,
      "vat_amount": 210.00,
      "net_amount": 1000.00,
      "currency": "EUR",
      "extraction_confidence": 0.92,
      "matched_party_id": "uuid",
      "matched_party_name": "ACME Corp",
      "matched_open_item_id": null,
      "match_confidence": 0.85,
      "is_duplicate": false,
      "duplicate_of_id": null,
      "suggested_actions": [
        {
          "id": "uuid",
          "action_type": "POST_AS_EXPENSE",
          "title": "Post as expense",
          "explanation": "Document can be posted as a regular expense.",
          "confidence_score": 0.75,
          "parameters": {"amount": "1210.00"},
          "priority": 1,
          "created_at": "2024-01-26T10:05:00Z"
        }
      ],
      "extracted_fields": {}
    }
  ]
}
```

---

### GET /clients/{client_id}/documents/{document_id}

Get detailed information about a specific document.

**Response:** Same structure as document item in list response.

---

### POST /clients/{client_id}/documents/{document_id}/post

Post a document to the journal.

**Request Body:**
```json
{
  "description": "Office supplies from ACME Corp",
  "entry_date": "2024-01-15",
  "account_id": "uuid (optional - override expense account)",
  "vat_code_id": "uuid (optional - override VAT code)",
  "allocate_to_open_item_id": "uuid (optional - allocate to open item)",
  "notes": "Approved by accountant"
}
```

**Response:**
```json
{
  "document_id": "uuid",
  "status": "POSTED",
  "journal_entry_id": "uuid",
  "message": "Document successfully posted to journal",
  "posted_at": "2024-01-26T14:30:00Z",
  "posted_by_name": "Jan Accountant"
}
```

**Error Response (Period locked):**
```json
{
  "detail": "Cannot post to period Q1-2024 with status FINALIZED. Period must be OPEN or REVIEW."
}
```

---

### POST /clients/{client_id}/documents/{document_id}/reject

Reject a document.

**Request Body:**
```json
{
  "reason": "Duplicate invoice - already posted on 2024-01-10",
  "notes": "See document DOC-2024-005"
}
```

**Response:**
```json
{
  "document_id": "uuid",
  "status": "REJECTED",
  "rejection_reason": "Duplicate invoice - already posted on 2024-01-10",
  "rejected_at": "2024-01-26T14:35:00Z",
  "rejected_by_name": "Jan Accountant",
  "message": "Document rejected"
}
```

---

### POST /clients/{client_id}/documents/{document_id}/reprocess

Reprocess a document (reset for re-extraction).

**Response:**
```json
{
  "document_id": "uuid",
  "status": "UPLOADED",
  "process_count": 2,
  "message": "Document queued for reprocessing (attempt #2)"
}
```

---

### POST /clients/{client_id}/documents/{document_id}/match

Run matching logic on a document.

**Response:**
```json
{
  "document_id": "uuid",
  "status": "NEEDS_REVIEW",
  "is_duplicate": false,
  "match_confidence": "0.85",
  "matched_party_id": "uuid",
  "matched_open_item_id": null,
  "message": "Matching completed successfully"
}
```

---

## Period Closing Checklist API

### GET /clients/{client_id}/periods/{period_id}/closing-checklist

Get the closing checklist for a period.

**Response:**
```json
{
  "client_id": "uuid",
  "client_name": "Example BV",
  "period_id": "uuid",
  "period_name": "2024-Q1",
  "period_status": "REVIEW",
  "can_finalize": false,
  "blocking_items": 1,
  "warning_items": 2,
  "items": [
    {
      "name": "Documents Posted",
      "description": "All documents in period must be posted or rejected",
      "status": "PASSED",
      "details": "All documents processed",
      "value": "15/15 (100%)",
      "required": true
    },
    {
      "name": "Critical Issues",
      "description": "All RED issues must be resolved",
      "status": "FAILED",
      "details": "1 critical issue(s) require resolution",
      "value": "1",
      "required": true
    },
    {
      "name": "Warning Issues",
      "description": "All YELLOW issues must be acknowledged or resolved",
      "status": "WARNING",
      "details": "2 warning(s) need acknowledgment",
      "value": "2 unacknowledged",
      "required": false
    },
    {
      "name": "VAT Report Ready",
      "description": "VAT report must be ready with no anomalies",
      "status": "PASSED",
      "details": "No VAT anomalies detected",
      "value": "Ready",
      "required": true
    },
    {
      "name": "AR Reconciled",
      "description": "Accounts Receivable must reconcile with subledger",
      "status": "PASSED",
      "details": "AR reconciled",
      "value": "OK",
      "required": true
    },
    {
      "name": "AP Reconciled",
      "description": "Accounts Payable must reconcile with subledger",
      "status": "PASSED",
      "details": "AP reconciled",
      "value": "OK",
      "required": true
    },
    {
      "name": "Asset Schedules Consistent",
      "description": "All asset depreciation must be posted and consistent",
      "status": "PASSED",
      "details": "Asset schedules are consistent",
      "value": "OK",
      "required": false
    }
  ],
  "documents_posted_percent": 100.0,
  "documents_pending_review": 0,
  "red_issues_count": 1,
  "yellow_issues_count": 2,
  "unacknowledged_yellow_count": 2,
  "vat_report_ready": true,
  "ar_reconciled": true,
  "ap_reconciled": true,
  "assets_consistent": true
}
```

---

## Document Data Model

### Documents (Extended)

New fields added to the `documents` table:

| Field | Type | Description |
|-------|------|-------------|
| `supplier_name` | string | Extracted supplier name |
| `invoice_number` | string | Extracted invoice number |
| `invoice_date` | datetime | Extracted invoice date |
| `due_date` | datetime | Extracted due date |
| `total_amount` | decimal | Extracted total amount |
| `vat_amount` | decimal | Extracted VAT amount |
| `net_amount` | decimal | Extracted net amount |
| `currency` | string | Currency (default: EUR) |
| `extraction_confidence` | decimal | Confidence score (0.0 - 1.0) |
| `matched_party_id` | uuid | Matched supplier/customer |
| `matched_open_item_id` | uuid | Matched open item |
| `match_confidence` | decimal | Match confidence score |
| `is_duplicate` | boolean | Duplicate flag |
| `duplicate_of_id` | uuid | Reference to original document |
| `posted_at` | datetime | When document was posted |
| `posted_by_id` | uuid | Who posted the document |
| `posted_journal_entry_id` | uuid | Resulting journal entry |
| `rejected_at` | datetime | When document was rejected |
| `rejected_by_id` | uuid | Who rejected the document |
| `rejection_reason` | text | Reason for rejection |
| `process_count` | integer | Number of times processed |
| `last_processed_at` | datetime | Last processing timestamp |

### Document Suggested Actions

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `document_id` | uuid | Reference to document |
| `action_type` | enum | Type of suggested action |
| `title` | string | Action title |
| `explanation` | text | Why this action is suggested |
| `confidence_score` | decimal | Confidence (0.0 - 1.0) |
| `parameters` | jsonb | Action parameters |
| `priority` | integer | Priority (1 = highest) |

### Document Audit Logs

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `document_id` | uuid | Reference to document |
| `administration_id` | uuid | Client/administration |
| `action` | enum | Action type (POSTED, REJECTED, etc.) |
| `from_status` | string | Previous status |
| `to_status` | string | New status |
| `performed_by_id` | uuid | User who performed action |
| `performed_at` | datetime | When action was performed |
| `notes` | text | Additional notes |
| `ip_address` | string | Client IP for audit |
| `result_journal_entry_id` | uuid | Resulting journal entry (for POST) |

---

## Observability & Ops Control API

The observability API provides application health monitoring, metrics, and alerting for accountants.

### Base URL

```
/api/v1/ops
```

### GET /health (root level)

Comprehensive health check endpoint. No authentication required.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-26T10:00:00Z",
  "components": {
    "database": {
      "status": "healthy",
      "message": "Connected"
    },
    "redis": {
      "status": "healthy",
      "message": "Connected"
    },
    "migrations": {
      "status": "healthy",
      "message": "5/5 key tables present"
    },
    "background_tasks": {
      "status": "healthy",
      "message": "No background task queue configured"
    }
  }
}
```

**Component Statuses:**
- `healthy` - Component is functioning normally
- `unhealthy` - Component has an error
- `warning` - Component has a minor issue
- `unknown` - Component status cannot be determined

---

### GET /metrics

Get application metrics. Requires accountant role.

**Query Parameters:**
- `administration_id` (uuid, optional) - Filter metrics by client

**Response:**
```json
{
  "timestamp": "2024-01-26T10:00:00Z",
  "scope": "global",
  "administration_id": null,
  "documents": {
    "documents_processed_today": 15,
    "documents_uploaded_today": 20,
    "documents_failed_today": 2,
    "documents_by_status": {
      "UPLOADED": 5,
      "PROCESSING": 3,
      "POSTED": 100,
      "REJECTED": 10
    },
    "documents_pending_review": 8,
    "documents_in_processing": 3
  },
  "issues": {
    "issues_created_today": {
      "red": 1,
      "yellow": 3,
      "total": 4
    },
    "active_issues": {
      "red": 5,
      "yellow": 12,
      "total": 17
    },
    "issues_resolved_today": 6
  },
  "decisions": {
    "decisions_today": {
      "approved": 8,
      "rejected": 2,
      "overridden": 1,
      "total": 11
    },
    "execution_today": {
      "executed": 9,
      "failed": 1,
      "pending": 1
    }
  },
  "postings": {
    "postings_created_today": 12,
    "draft_entries": 5,
    "entries_by_status": {
      "DRAFT": 5,
      "POSTED": 200,
      "REVERSED": 3
    }
  },
  "alerts": {
    "active_alerts": {
      "critical": 2,
      "warning": 5,
      "info": 3,
      "total": 10
    },
    "alerts_created_today": 4,
    "alerts_resolved_today": 2
  },
  "summary": {
    "documents_processed_today": 15,
    "issues_created_today": 4,
    "red_issues_active": 5,
    "decisions_approved_today": 8,
    "decisions_rejected_today": 2,
    "postings_created_today": 12,
    "failed_operations_count": 3,
    "active_critical_alerts": 2
  }
}
```

---

### GET /alerts

List active alerts.

**Query Parameters:**
- `administration_id` (uuid, optional) - Filter by client
- `severity` (string, optional) - Filter by severity (CRITICAL, WARNING, INFO)
- `include_resolved` (boolean, default: false) - Include resolved alerts
- `limit` (integer, default: 100, max: 500) - Maximum results

**Response:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "alert_code": "RED_ISSUE_UNRESOLVED",
      "severity": "CRITICAL",
      "title": "RED issue unresolved for 10 days",
      "message": "Issue 'AR Reconciliation Mismatch' has been unresolved for 10 days. Immediate action required.",
      "entity_type": "issue",
      "entity_id": "uuid",
      "administration_id": "uuid",
      "context": "{\"issue_code\": \"AR_RECON_MISMATCH\", \"days_old\": 10}",
      "created_at": "2024-01-26T10:00:00Z",
      "acknowledged_at": null,
      "acknowledged_by_id": null,
      "resolved_at": null,
      "resolved_by_id": null,
      "resolution_notes": null,
      "auto_resolved": false
    }
  ],
  "total_count": 10,
  "active_count": 10,
  "acknowledged_count": 3,
  "critical_count": 2,
  "warning_count": 5,
  "info_count": 3
}
```

---

### GET /alerts/grouped

Get alerts grouped by severity for dashboard display.

**Query Parameters:**
- `administration_id` (uuid, optional) - Filter by client

**Response:**
```json
{
  "critical": [/* alerts array */],
  "warning": [/* alerts array */],
  "info": [/* alerts array */],
  "counts": {
    "critical": 2,
    "warning": 5,
    "info": 3,
    "total": 10
  }
}
```

---

### GET /alerts/counts

Get counts of active alerts by severity.

**Query Parameters:**
- `administration_id` (uuid, optional) - Filter by client

**Response:**
```json
{
  "critical": 2,
  "warning": 5,
  "info": 3,
  "total": 10
}
```

---

### GET /alerts/{alert_id}

Get a single alert by ID.

**Response:**
```json
{
  "id": "uuid",
  "alert_code": "DOCUMENT_BACKLOG_HIGH",
  "severity": "WARNING",
  "title": "Document backlog: 25 documents pending",
  "message": "There are 25 documents waiting for processing or review.",
  "entity_type": "document",
  "entity_id": null,
  "administration_id": "uuid",
  "context": "{\"backlog_count\": 25}",
  "created_at": "2024-01-26T10:00:00Z",
  "acknowledged_at": "2024-01-26T11:00:00Z",
  "acknowledged_by_id": "uuid",
  "resolved_at": null,
  "resolved_by_id": null,
  "resolution_notes": null,
  "auto_resolved": false
}
```

---

### POST /alerts/{alert_id}/acknowledge

Acknowledge an alert (mark as seen but still active).

**Response:** Returns the updated alert object.

---

### POST /alerts/{alert_id}/resolve

Resolve an alert.

**Request Body:**
```json
{
  "notes": "Issue fixed by reviewing documents"
}
```

**Response:** Returns the updated alert object.

---

### POST /alerts/check/{administration_id}

Manually trigger alert checks for a client.

**Response:**
```json
{
  "alerts": [/* newly created alerts */],
  "total_count": 2,
  "active_count": 2,
  "acknowledged_count": 0,
  "critical_count": 1,
  "warning_count": 1,
  "info_count": 0
}
```

---

### Alert Codes

| Code | Severity | Description |
|------|----------|-------------|
| `RED_ISSUE_UNRESOLVED` | CRITICAL | RED issue unresolved for 7+ days |
| `YELLOW_ISSUE_BACKLOG` | WARNING | Multiple unresolved YELLOW issues |
| `VAT_ANOMALIES_DETECTED` | CRITICAL/WARNING | VAT report has anomalies |
| `VAT_DEADLINE_APPROACHING` | WARNING | VAT filing deadline approaching |
| `POSTING_TO_FINALIZED_PERIOD` | WARNING | Attempted posting to FINALIZED period |
| `POSTING_TO_LOCKED_PERIOD` | WARNING | Attempted posting to LOCKED period |
| `PERIOD_LOCK_PENDING` | INFO | Period ready for locking |
| `DOCUMENT_BACKLOG_HIGH` | WARNING | Document backlog above threshold |
| `DOCUMENT_PROCESSING_FAILED` | WARNING | Document processing failed |
| `DOCUMENT_STUCK_PROCESSING` | WARNING | Document stuck in processing |
| `BACKGROUND_OPERATION_FAILED` | CRITICAL | Background operation failed after retries |
| `RATE_LIMIT_EXCEEDED` | WARNING | Rate limit exceeded for operation |
| `SYSTEM_HEALTH_DEGRADED` | CRITICAL | System health check failed |

---

### Alerts Table Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `administration_id` | uuid | Client (nullable for system alerts) |
| `alert_code` | string | Alert type code |
| `severity` | enum | CRITICAL, WARNING, INFO |
| `title` | string | Alert title |
| `message` | text | Detailed message |
| `entity_type` | string | Related entity type |
| `entity_id` | uuid | Related entity ID |
| `context` | text | JSON with additional context |
| `created_at` | datetime | When alert was created |
| `acknowledged_at` | datetime | When alert was acknowledged |
| `acknowledged_by_id` | uuid | User who acknowledged |
| `resolved_at` | datetime | When alert was resolved |
| `resolved_by_id` | uuid | User who resolved |
| `resolution_notes` | text | Resolution notes |
| `auto_resolved` | boolean | Whether auto-resolved |

---

## Ops Safeguards

The platform includes protective safeguards:

### Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| `recalculate` | 5 calls | 60 seconds |
| `vat_report` | 10 calls | 60 seconds |
| `document_reprocess` | 20 calls | 60 seconds |
| `period_finalize` | 3 calls | 300 seconds |
| `bulk_post` | 5 calls | 60 seconds |

### Exponential Backoff

Failed operations are retried with exponential backoff:
- Initial delay: 1 second
- Maximum delay: 60 seconds
- Maximum retries: 3-5 depending on operation

### Idempotency

Operations include idempotency checks to prevent duplicate processing.

---

## Structured Logging

All key events are logged with structured JSON format including:
- `timestamp` - Event timestamp
- `event` - Event type (e.g., `document.posted`)
- `severity` - INFO, WARN, ERROR
- `entity_type` - document, journal_entry, vat_report, period
- `entity_id` - Related entity ID
- `client_id` - Administration ID
- `period_id` - Accounting period ID
- `user_id` - User who triggered event
- `message` - Human-readable message

### Event Types

**Document Events:**
- `document.uploaded`
- `document.posted`
- `document.rejected`
- `document.processing_failed`

**Journal Entry Events:**
- `journal_entry.created`
- `journal_entry.reversed`

**VAT Events:**
- `vat_report.generated`

**Period Events:**
- `period.review_started`
- `period.finalized`
- `period.locked`
- `period.posting_blocked`

**Decision Events:**
- `decision.approved`
- `decision.rejected`

**Alert Events:**
- `alert.created`
- `alert.resolved`

**System Events:**
- `system.operation_failed`
- `system.rate_limit_exceeded`

---

## Work Queue API

The Work Queue API provides unified work items for the accountant dashboard.

### GET /api/v1/accountant/work-queue

Get unified work queue for accountant dashboard.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `queue` | string | "all" | Queue filter: red, review, vat_due, stale, all |
| `limit` | int | 50 | Max items to return (1-100) |
| `cursor` | string | null | Pagination cursor |
| `sort` | string | "readiness_score" | Sort field: readiness_score, due_date, severity |
| `order` | string | "asc" | Sort order: asc or desc |

**Response:**
```json
{
  "items": [
    {
      "client_id": "uuid",
      "client_name": "Example BV",
      "period_id": "uuid",
      "period_status": "REVIEW",
      "work_item_type": "ISSUE",
      "severity": "RED",
      "title": "3 RED issues requiring immediate attention",
      "description": "Client has unresolved RED severity issues",
      "suggested_next_action": "Review and resolve RED issues",
      "due_date": "2024-04-30",
      "age_days": null,
      "counts": {"red": 3, "yellow": 2, "backlog": 5},
      "readiness_score": 40,
      "readiness_breakdown": {
        "base_score": 100,
        "deductions": [
          {"reason": "red_issues", "count": 3, "penalty": 60}
        ],
        "final_score": 40
      }
    }
  ],
  "total_count": 15,
  "returned_count": 15,
  "queue_type": "all",
  "counts": {"red_issues": 5, "needs_review": 8, "vat_due": 3, "stale": 2},
  "sort_by": "readiness_score",
  "sort_order": "asc",
  "generated_at": "2024-01-26T10:00:00Z"
}
```

**Work Item Types:**
| Type | Description |
|------|-------------|
| `ISSUE` | RED or YELLOW validation issues |
| `VAT` | VAT deadline approaching |
| `BACKLOG` | Document backlog needing review |
| `ALERT` | Critical alerts |
| `PERIOD_REVIEW` | Period in REVIEW state |
| `STALE` | No activity for 30+ days |

---

### GET /api/v1/accountant/dashboard/sla-summary

Get SLA summary for all assigned clients.

**Response:**
```json
{
  "total_violations": 8,
  "critical_count": 3,
  "warning_count": 5,
  "by_type": {
    "RED_UNRESOLVED": {"critical": 2, "warning": 1},
    "VAT_DEADLINE": {"critical": 1, "warning": 2},
    "REVIEW_STALE": {"critical": 0, "warning": 1},
    "BACKLOG_HIGH": {"critical": 0, "warning": 1}
  },
  "escalation_events_today": 2,
  "policy": {
    "red_unresolved_warning_days": 5,
    "red_unresolved_critical_days": 7,
    "vat_due_warning_days": 14,
    "vat_due_critical_days": 7,
    "review_stale_warning_days": 10,
    "backlog_warning_threshold": 20
  },
  "generated_at": "2024-01-26T10:00:00Z"
}
```

---

## Readiness Score Definition

The readiness score is a deterministic 0-100 score indicating client health.

**Score Ranges:**
| Range | Status | Description |
|-------|--------|-------------|
| 80-100 | Good | Minor or no attention needed |
| 50-79 | Moderate | Review recommended |
| 20-49 | Poor | Significant issues |
| 0-19 | Critical | Immediate action required |

**Scoring Factors:**
| Factor | Penalty | Maximum |
|--------|---------|---------|
| RED issues | -20 per issue | -60 |
| YELLOW issues | -5 per issue | -20 |
| Document backlog | -3 per doc | -15 |
| Critical alerts | -20 | -20 |
| VAT deadline ≤ 7 days | -15 | -15 |
| VAT deadline ≤ 14 days | -10 | -10 |
| Staleness > 30 days | -10 | -10 |

---

## Reminders API

### POST /api/v1/accountant/reminders/send

Send reminders immediately to selected clients.

**Rate Limit:** 10 reminders per minute

**Request Body:**
```json
{
  "client_ids": ["uuid1", "uuid2"],
  "reminder_type": "ACTION_REQUIRED",
  "title": "Documents needed",
  "message": "Please upload your Q1 invoices",
  "channel": "IN_APP",
  "due_date": "2024-02-15",
  "template_id": null,
  "variables": null
}
```

**Channels:**
- `IN_APP`: Notification in client dashboard (always available)
- `EMAIL`: Email via Resend (requires `RESEND_API_KEY` env var)

**Response:**
```json
[
  {
    "id": "uuid",
    "administration_id": "uuid",
    "reminder_type": "ACTION_REQUIRED",
    "title": "Documents needed",
    "message": "Please upload your Q1 invoices",
    "channel": "IN_APP",
    "status": "SENT",
    "due_date": "2024-02-15",
    "scheduled_at": null,
    "sent_at": "2024-01-26T10:00:00Z",
    "created_at": "2024-01-26T10:00:00Z",
    "send_error": null
  }
]
```

---

### POST /api/v1/accountant/reminders/schedule

Schedule reminders for future sending.

**Rate Limit:** 10 reminders per minute

**Request Body:**
```json
{
  "client_ids": ["uuid1", "uuid2"],
  "reminder_type": "VAT_DEADLINE",
  "title": "VAT deadline reminder",
  "message": "BTW Aangifte is due in 7 days",
  "channel": "EMAIL",
  "scheduled_at": "2024-02-01T09:00:00Z",
  "due_date": "2024-02-07"
}
```

---

### GET /api/v1/accountant/reminders/history

Get reminder history.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `client_id` | uuid | null | Filter by client ID |
| `limit` | int | 50 | Max results (1-100) |
| `offset` | int | 0 | Pagination offset |

**Response:**
```json
{
  "reminders": [...],
  "total_count": 100,
  "limit": 50,
  "offset": 0
}
```

---

## Evidence Packs API

### POST /api/v1/accountant/clients/{client_id}/periods/{period_id}/evidence-pack

Generate a VAT evidence pack for compliance export.

**Rate Limit:** 5 packs per minute

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pack_type` | string | "VAT_EVIDENCE" | Pack type: VAT_EVIDENCE or AUDIT_TRAIL |

**Response:**
```json
{
  "id": "uuid",
  "administration_id": "uuid",
  "period_id": "uuid",
  "pack_type": "VAT_EVIDENCE",
  "created_at": "2024-01-26T10:00:00Z",
  "file_size_bytes": 15234,
  "checksum": "sha256-hash",
  "download_count": 0,
  "metadata": {
    "administration_name": "Example BV",
    "kvk_number": "12345678",
    "period_name": "Q1-2024",
    "period_status": "FINALIZED",
    "generated_at": "2024-01-26T10:00:00Z"
  }
}
```

**Evidence Pack Contents:**
- VAT box summary
- List of relevant journal entries
- List of invoices/documents used in VAT calculation
- Validation status + acknowledged issues
- Period snapshot info

---

### GET /api/v1/accountant/evidence-packs/{pack_id}/download

Download an evidence pack file.

**Response:** JSON file download with checksum verification

---

### GET /api/v1/accountant/evidence-packs

List evidence packs.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `client_id` | uuid | null | Filter by client ID |
| `period_id` | uuid | null | Filter by period ID |
| `limit` | int | 50 | Max results (1-100) |
| `offset` | int | 0 | Pagination offset |

---

## Environment Variables

### Required for Email Reminders
```
RESEND_API_KEY=your-api-key          # Required for EMAIL channel
RESEND_FROM_EMAIL=noreply@zzphub.nl  # Optional, defaults to noreply@zzphub.nl
```

### Evidence Pack Storage
```
EVIDENCE_STORAGE_PATH=/data/evidence  # Default storage path
```

---

## Database Tables (Migration 011)

### client_readiness_cache
Cached readiness scores for efficient querying.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `administration_id` | uuid | Client ID |
| `readiness_score` | int | Score 0-100 |
| `readiness_breakdown` | json | Score breakdown |
| `red_issue_count` | int | RED issue count |
| `yellow_issue_count` | int | YELLOW issue count |
| `document_backlog` | int | Pending documents |
| `vat_days_remaining` | int | Days to VAT deadline |
| `period_status` | string | Current period status |
| `has_critical_alerts` | bool | Has critical alerts |
| `staleness_days` | int | Days since last activity |
| `computed_at` | datetime | When score was computed |

### escalation_events
SLA violation tracking.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `administration_id` | uuid | Client ID |
| `escalation_type` | string | Type: RED_UNRESOLVED, VAT_DEADLINE, etc. |
| `severity` | string | WARNING or CRITICAL |
| `trigger_reason` | text | Why escalation was triggered |
| `threshold_value` | int | SLA threshold value |
| `actual_value` | int | Actual value that triggered |
| `created_at` | datetime | When escalation occurred |
| `acknowledged_at` | datetime | When acknowledged |
| `acknowledged_by_id` | uuid | User who acknowledged |

### evidence_packs
Generated evidence packs.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `administration_id` | uuid | Client ID |
| `period_id` | uuid | Period ID |
| `pack_type` | string | VAT_EVIDENCE or AUDIT_TRAIL |
| `storage_path` | string | File path |
| `checksum` | string | SHA256 checksum |
| `file_size_bytes` | bigint | File size |
| `download_count` | int | Download count |
| `metadata` | json | Pack metadata |

### dashboard_audit_log
Audit trail for dashboard operations.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `user_id` | uuid | User who performed action |
| `action_type` | string | REMINDER_SEND, EVIDENCE_PACK_GENERATE, etc. |
| `administration_id` | uuid | Related client |
| `entity_type` | string | Entity type |
| `entity_id` | uuid | Entity ID |
| `details` | json | Action details |
| `ip_address` | string | Client IP |
| `user_agent` | string | Client user agent |
| `created_at` | datetime | When action occurred |
