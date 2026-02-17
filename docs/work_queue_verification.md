# Work Queue Verification Guide

This document provides step-by-step instructions to create test data and verify that the work queue summary endpoint returns correct counts for each section.

## Prerequisites

- A running instance of the application (backend + frontend)
- An accountant user logged in
- At least one active client assignment

## Test Data Setup

### 1. Document Review Section

To create documents needing review:

```bash
# Via API or database seed script
# Add documents with status = NEEDS_REVIEW

# Example SQL:
INSERT INTO documents (
  id,
  administration_id,
  original_filename,
  storage_path,
  mime_type,
  file_size,
  status,
  supplier_name,
  invoice_date,
  total_amount,
  created_at
) VALUES (
  gen_random_uuid(),
  '<CLIENT_ADMINISTRATION_ID>',
  'invoice_001.pdf',
  '/uploads/invoice_001.pdf',
  'application/pdf',
  50000,
  'NEEDS_REVIEW',
  'Test Leverancier BV',
  CURRENT_DATE - INTERVAL '5 days',
  150.00,
  NOW()
);
```

**Expected Result:** 
- `document_review.count` should increase by 1
- Document should appear in `document_review.top_items` with:
  - `vendor_customer`: "Test Leverancier BV"
  - `amount`: 150.00
  - `link`: Contains `/accountant/review-queue?document_id=...`

### 2. Bank Reconciliation Section

To create unmatched bank transactions:

```bash
# Create bank account first if not exists
INSERT INTO bank_accounts (id, administration_id, iban, bank_name, created_at)
VALUES (
  gen_random_uuid(),
  '<CLIENT_ADMINISTRATION_ID>',
  'NL91ABNA0417164300',
  'ABN AMRO',
  NOW()
);

# Add unmatched bank transaction (last 30 days)
INSERT INTO bank_transactions (
  id,
  administration_id,
  bank_account_id,
  booking_date,
  amount,
  counterparty_name,
  description,
  import_hash,
  status,
  created_at
) VALUES (
  gen_random_uuid(),
  '<CLIENT_ADMINISTRATION_ID>',
  '<BANK_ACCOUNT_ID>',
  CURRENT_DATE - INTERVAL '10 days',
  -85.50,
  'Supplier XYZ',
  'Payment for services',
  encode(sha256('test_hash_1'::bytea), 'hex'),
  'NEW',
  NOW()
);
```

**Expected Result:**
- `bank_reconciliation.count` should increase by 1
- Transaction should appear in `bank_reconciliation.top_items` with:
  - `description`: "Payment for services"
  - `amount`: -85.50
  - `link`: Contains `/accountant/clients/{client_id}/bank-reconciliation?tx_id=...`

### 3. VAT Actions Section

To create VAT periods needing action:

```bash
# Create accounting period in OPEN status
INSERT INTO accounting_periods (
  id,
  administration_id,
  name,
  period_type,
  start_date,
  end_date,
  status,
  created_at
) VALUES (
  gen_random_uuid(),
  '<CLIENT_ADMINISTRATION_ID>',
  '2025 Q1',
  'QUARTER',
  '2025-01-01',
  '2025-03-31',
  'OPEN',
  NOW()
);

# OR create VAT submission in DRAFT status
INSERT INTO vat_submissions (
  id,
  administration_id,
  period_id,
  created_by,
  status,
  method,
  created_at
) VALUES (
  gen_random_uuid(),
  '<CLIENT_ADMINISTRATION_ID>',
  '<PERIOD_ID>',
  '<USER_ID>',
  'DRAFT',
  'PACKAGE',
  NOW()
);
```

**Expected Result:**
- `vat_actions.periods_needing_action_count` should increase by 1
- `vat_actions.current_period_status` should show the latest period status (e.g., "OPEN")
- `vat_actions.btw_link` should contain `/accountant/clients/{client_id}/vat`

### 4. Reminders/Overdue Section

To create overdue invoices:

```bash
# Create a ZZP customer first
INSERT INTO zzp_customers (
  id,
  administration_id,
  name,
  status,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '<CLIENT_ADMINISTRATION_ID>',
  'Test Klant BV',
  'active',
  NOW(),
  NOW()
);

# Create overdue invoice
INSERT INTO zzp_invoices (
  id,
  administration_id,
  customer_id,
  customer_name,
  invoice_number,
  invoice_date,
  due_date,
  status,
  subtotal,
  tax_amount,
  total_amount,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '<CLIENT_ADMINISTRATION_ID>',
  '<CUSTOMER_ID>',
  'Test Klant BV',
  'INV-2025-001',
  CURRENT_DATE - INTERVAL '45 days',
  CURRENT_DATE - INTERVAL '15 days',  -- 15 days overdue
  'SENT',
  200.00,
  42.00,
  242.00,
  NOW(),
  NOW()
);
```

**Expected Result:**
- `reminders.count` should increase by 1
- Invoice should appear in `reminders.top_items` with:
  - `customer`: "Test Klant BV"
  - `amount`: 242.00
  - `due_date`: Date 15 days ago
  - `link`: Contains `/accountant/clients/{client_id}/invoices/...`

### 5. Integrity Warnings Section

To create active alerts:

```bash
INSERT INTO alerts (
  id,
  administration_id,
  alert_code,
  severity,
  title,
  message,
  entity_type,
  created_at
) VALUES (
  gen_random_uuid(),
  '<CLIENT_ADMINISTRATION_ID>',
  'RED_ISSUE_UNRESOLVED',
  'CRITICAL',
  'Kritieke issue onopgelost',
  'Er is een rode issue die al 7 dagen onopgelost is',
  'issue',
  NOW()
);
```

**Expected Result:**
- `integrity_warnings.count` should increase by 1
- Alert should appear in `integrity_warnings.top_items` with:
  - `severity`: "CRITICAL"
  - `message`: "Er is een rode issue die al 7 dagen onopgelost is"
  - `link`: Contains `/accountant/clients/{client_id}/alerts/...`

## Verification Steps

### Step 1: Create Test Data
Execute the SQL statements above or use the application's UI/API to create test data for each section.

### Step 2: Access the Work Queue
1. Log in as an accountant
2. Select the test client from the client switcher
3. Navigate to the "Te beoordelen" (Review Queue) page at `/accountant/review-queue`

### Step 3: Verify Counts
Check that each card shows the correct count:
- ✅ Documents needing review: Should match the number of documents with `status = 'NEEDS_REVIEW'`
- ✅ Unmatched bank transactions: Should match transactions with `status = 'NEW'` from the last 30 days
- ✅ VAT actions: Should match periods in OPEN/REVIEW status or submissions in DRAFT/QUEUED status
- ✅ Overdue invoices: Should match invoices with `status IN ('SENT', 'OVERDUE')` and `due_date < today`
- ✅ Integrity warnings: Should match alerts with `resolved_at IS NULL`

### Step 4: Verify Top Items
Expand each section and verify:
- ✅ Each section shows up to 10 items
- ✅ Items are ordered correctly (most recent, earliest due date, etc.)
- ✅ All data fields are populated correctly
- ✅ Amounts are formatted in EUR
- ✅ Dates are formatted as "dd MMM yyyy"

### Step 5: Verify Deep Links
Click on each item and verify:
- ✅ Document items navigate to `/accountant/review-queue?document_id={id}`
- ✅ Bank transaction items navigate to `/accountant/clients/{client_id}/bank-reconciliation?tx_id={id}`
- ✅ VAT section button navigates to `/accountant/clients/{client_id}/vat`
- ✅ Invoice items navigate to `/accountant/clients/{client_id}/invoices/{id}`
- ✅ Alert items navigate to `/accountant/clients/{client_id}/alerts/{id}`

### Step 6: Verify Empty State
1. Resolve or delete all test data
2. Reload the work queue page
3. Verify that it shows: "Geen openstaande taken voor deze klant" with a green checkmark

### Step 7: Verify Real-Time Updates
1. Create a new document with `status = 'NEEDS_REVIEW'`
2. Click "Vernieuwen" (Refresh) button in the work queue
3. Verify the count increases and the new item appears

## API Testing

You can also test the endpoint directly using curl or Postman:

```bash
# Get work queue summary
curl -X GET \
  'http://localhost:8000/api/v1/accountant/clients/{client_id}/work-queue/summary' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Expected response structure:
{
  "document_review": {
    "count": 5,
    "top_items": [
      {
        "id": "uuid",
        "date": "2025-01-15",
        "type": "Invoice",
        "status": "NEEDS_REVIEW",
        "vendor_customer": "Test Leverancier BV",
        "amount": 150.00,
        "link": "/accountant/review-queue?document_id=uuid"
      }
    ]
  },
  "bank_reconciliation": {
    "count": 3,
    "top_items": [...]
  },
  "vat_actions": {
    "current_period_status": "OPEN",
    "periods_needing_action_count": 1,
    "btw_link": "/accountant/clients/{client_id}/vat"
  },
  "reminders": {
    "count": 2,
    "top_items": [...]
  },
  "integrity_warnings": {
    "count": 1,
    "top_items": [...]
  },
  "generated_at": "2025-01-17T12:00:00Z"
}
```

## Common Issues

### Issue 1: No data appearing
- **Cause:** Client assignment is not ACTIVE
- **Solution:** Check `accountant_client_assignments` table and ensure `status = 'ACTIVE'`

### Issue 2: Bank transactions not showing
- **Cause:** Transactions are older than 30 days
- **Solution:** Create transactions with `booking_date` within the last 30 days

### Issue 3: VAT count is 0 despite having periods
- **Cause:** Periods are in FINALIZED or LOCKED status
- **Solution:** Create periods with status OPEN or REVIEW, or submissions with status DRAFT/QUEUED

### Issue 4: 403 Forbidden error
- **Cause:** Accountant not assigned to the client or assignment is PENDING
- **Solution:** Ensure the accountant-client assignment exists and has `status = 'ACTIVE'`

## Success Criteria

✅ All sections show correct counts  
✅ Top 10 items appear in each section  
✅ Deep links navigate to correct pages  
✅ Empty state displays when no work items exist  
✅ Refresh button updates counts  
✅ Mobile-responsive card layout works  
✅ Expandable/collapsible sections work smoothly  

## Clean Up

After verification, clean up test data:

```sql
-- Delete test documents
DELETE FROM documents WHERE supplier_name = 'Test Leverancier BV';

-- Delete test bank transactions  
DELETE FROM bank_transactions WHERE description = 'Payment for services';

-- Delete test invoices
DELETE FROM zzp_invoices WHERE customer_name = 'Test Klant BV';

-- Delete test customers
DELETE FROM zzp_customers WHERE name = 'Test Klant BV';

-- Delete test alerts
DELETE FROM alerts WHERE title = 'Kritieke issue onopgelost';
```
