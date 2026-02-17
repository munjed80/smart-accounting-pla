# Audit Trail Verification Guide

This document provides steps to verify that the automatic audit logging system is working correctly.

## Overview

The audit logging system automatically captures:
- **CREATE** operations: When entities are created (invoices, expenses, journal entries, etc.)
- **UPDATE** operations: When entity fields are modified (status changes, amount updates, etc.)
- **DELETE** operations: When entities are removed

All audit logs include:
- Tenant isolation (client_id)
- User information (user_id, user_role)
- Request metadata (IP address)
- Old/new values (sanitized)
- Timestamps

## Prerequisites

- Backend server running
- Database migrations applied (including 039_audit_log_engine)
- Valid authentication token

## Verification Steps

### 1. Verify Audit Log Table Exists

```bash
# Connect to PostgreSQL
psql -h localhost -U postgres -d smart_accounting

# Check if audit_log table exists
\dt audit_log

# View table structure
\d audit_log
```

Expected output should show columns:
- id (UUID)
- client_id (UUID, not null)
- entity_type (VARCHAR)
- entity_id (UUID)
- action (VARCHAR)
- user_id (UUID, nullable)
- user_role (VARCHAR)
- old_value (JSONB)
- new_value (JSONB)
- ip_address (VARCHAR)
- created_at (TIMESTAMP WITH TIME ZONE)

### 2. Test Invoice CREATE Operation

```bash
# Create an invoice via API
curl -X POST http://localhost:8000/api/v1/zzp/invoices \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Selected-Client-Id: YOUR_CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUSTOMER_UUID",
    "invoice_number": "INV-TEST-001",
    "status": "draft",
    "issue_date": "2026-02-17",
    "due_date": "2026-03-17",
    "seller_company_name": "Test Company",
    "seller_kvk_number": "12345678",
    "customer_name": "Test Customer",
    "subtotal_cents": 10000,
    "vat_total_cents": 2100,
    "total_cents": 12100
  }'

# Query audit_log to verify entry was created
psql -h localhost -U postgres -d smart_accounting -c "
SELECT 
    entity_type,
    action,
    user_role,
    new_value->>'invoice_number' as invoice_number,
    new_value->>'status' as status,
    created_at
FROM audit_log
WHERE entity_type = 'invoice'
ORDER BY created_at DESC
LIMIT 5;
"
```

Expected output:
```
entity_type | action | user_role | invoice_number | status | created_at
------------+--------+-----------+----------------+--------+------------
invoice     | create | zzp       | INV-TEST-001   | draft  | 2026-02-17...
```

### 3. Test Invoice UPDATE Operation

```bash
# Update the invoice status
curl -X PATCH http://localhost:8000/api/v1/zzp/invoices/INVOICE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Selected-Client-Id: YOUR_CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "sent"}'

# Query audit_log to verify update was logged
psql -h localhost -U postgres -d smart_accounting -c "
SELECT 
    entity_type,
    action,
    user_role,
    old_value->>'status' as old_status,
    new_value->>'status' as new_status,
    created_at
FROM audit_log
WHERE entity_type = 'invoice'
  AND action = 'update'
ORDER BY created_at DESC
LIMIT 5;
"
```

Expected output:
```
entity_type | action | user_role | old_status | new_status | created_at
------------+--------+-----------+------------+------------+------------
invoice     | update | zzp       | draft      | sent       | 2026-02-17...
```

### 4. Test Expense CREATE Operation

```bash
# Create an expense
curl -X POST http://localhost:8000/api/v1/zzp/expenses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Selected-Client-Id: YOUR_CLIENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor": "Office Supplies Inc",
    "expense_date": "2026-02-17",
    "amount_cents": 5000,
    "vat_rate": "21.00",
    "vat_amount_cents": 1050,
    "category": "kantoor"
  }'

# Query audit_log
psql -h localhost -U postgres -d smart_accounting -c "
SELECT 
    entity_type,
    action,
    user_role,
    new_value->>'vendor' as vendor,
    new_value->>'amount_cents' as amount,
    created_at
FROM audit_log
WHERE entity_type = 'expense'
ORDER BY created_at DESC
LIMIT 5;
"
```

### 5. Verify Sanitization

Test that sensitive fields are properly redacted:

```bash
# Query audit logs and check for sensitive data
psql -h localhost -U postgres -d smart_accounting -c "
SELECT 
    entity_type,
    new_value ? 'password' as has_password,
    new_value ? 'token' as has_token,
    new_value ? 'api_key' as has_api_key,
    new_value->>'iban' as iban_value
FROM audit_log
WHERE new_value IS NOT NULL
LIMIT 10;
"
```

Expected:
- `has_password`, `has_token`, `has_api_key` should be `f` (false) or contain `**REDACTED**`
- `iban_value` should be masked like `NL12**MASKED**7890` if present

### 6. Verify Client Isolation

```bash
# Query audit logs for specific client
psql -h localhost -U postgres -d smart_accounting -c "
SELECT 
    client_id,
    entity_type,
    action,
    COUNT(*) as log_count
FROM audit_log
WHERE client_id = 'YOUR_CLIENT_ID'
GROUP BY client_id, entity_type, action
ORDER BY log_count DESC;
"
```

This should show audit logs only for the specified client.

### 7. Test System Operations

System operations (background jobs, migrations) should log with `user_role = 'system'` and `user_id = NULL`:

```bash
psql -h localhost -U postgres -d smart_accounting -c "
SELECT 
    entity_type,
    action,
    user_role,
    user_id,
    ip_address,
    created_at
FROM audit_log
WHERE user_role = 'system'
ORDER BY created_at DESC
LIMIT 10;
"
```

### 8. Verify Performance

Check that audit logging doesn't significantly impact performance:

```bash
# Get average audit log insertion time
psql -h localhost -U postgres -d smart_accounting -c "
SELECT 
    COUNT(*) as total_logs,
    MIN(created_at) as first_log,
    MAX(created_at) as last_log
FROM audit_log;
"
```

Audit logging should add minimal overhead (< 5ms per operation in typical scenarios).

## Expected Entity Types

The following entity types should appear in audit logs:

- `invoice` - ZZPInvoice operations
- `expense` - ZZPExpense operations
- `journal_entry` - JournalEntry operations
- `bank_transaction` - BankTransaction operations
- `btw_period` - AccountingPeriod operations (VAT periods)
- `commitment` - FinancialCommitment operations

## Common Issues

### Issue: No audit logs being created

**Possible causes:**
1. Audit hooks not registered → Check application startup logs for "Audit logging session hooks registered"
2. client_id is NULL → Audit logging requires client_id for tenant isolation
3. Entity type not mapped → Check ENTITY_TYPE_MAP in session_hooks.py

**Solution:**
- Restart the application
- Ensure X-Selected-Client-Id header is sent with requests
- Add entity type mapping if needed

### Issue: Sensitive data appearing in logs

**Possible causes:**
1. Sanitization function not catching all sensitive keys
2. New sensitive fields added to models

**Solution:**
- Update SENSITIVE_KEYS or MASK_KEYS in audit_logger.py
- Run verification query to check for sensitive data

### Issue: Duplicate audit entries

**Possible causes:**
1. Multiple flushes in same transaction
2. Event hooks registered multiple times

**Solution:**
- This is expected behavior in some cases (multiple flushes)
- Query with DISTINCT or ORDER BY created_at DESC LIMIT 1

## Security Checklist

- [ ] Sensitive fields are redacted (passwords, tokens, API keys)
- [ ] IBAN values are masked
- [ ] Large document content is truncated
- [ ] Client isolation is enforced (client_id never NULL)
- [ ] User attribution is correct (user_id, user_role)
- [ ] IP addresses are captured for accountability
- [ ] Audit logs themselves are not logged (no recursion)

## Query Examples

### Get all changes for a specific entity

```sql
SELECT 
    action,
    user_role,
    old_value,
    new_value,
    created_at
FROM audit_log
WHERE entity_type = 'invoice'
  AND entity_id = 'ENTITY_UUID'
ORDER BY created_at ASC;
```

### Get recent activity for a user

```sql
SELECT 
    entity_type,
    action,
    entity_id,
    created_at
FROM audit_log
WHERE user_id = 'USER_UUID'
ORDER BY created_at DESC
LIMIT 50;
```

### Get all changes in the last 24 hours

```sql
SELECT 
    entity_type,
    action,
    user_role,
    COUNT(*) as change_count
FROM audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY entity_type, action, user_role
ORDER BY change_count DESC;
```

## Conclusion

The audit logging system provides comprehensive tracking of all important operations in the Smart Accounting platform. It is designed to be:

- **Automatic**: No manual logging calls needed
- **Safe**: Failures don't break business logic
- **Secure**: Sensitive data is sanitized
- **Performant**: Minimal overhead
- **Tenant-isolated**: Full multi-tenant support

For production monitoring, consider setting up alerts on:
- Audit log growth rate
- Failed audit log insertions (check application logs)
- Unusual activity patterns (many deletes, status changes, etc.)
