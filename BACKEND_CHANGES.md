# Backend Data Model and API Logic Changes

## Overview

This document outlines the changes made to the backend data model and API logic to:
1. Unify data access for accountants and ZZP users
2. Improve PDF generation reliability
3. Implement a proper payment tracking system

## 1. Unified Client Data Access for Accountants

### Problem
Previously, accountants could not access ZZP-specific data (invoices, customers, expenses, time entries) for their clients. This data was only accessible through ZZP-specific endpoints that enforced role-based access control without considering accountant permissions.

### Solution
Created new unified endpoints under `/api/v1/accountant/clients/{client_id}/` that:
- Respect `AccountantClientAssignment` scopes and permissions
- Enforce data isolation by `administration_id`
- Provide read-only access to client data

### New Endpoints

| Endpoint | Method | Description | Required Scope |
|----------|--------|-------------|----------------|
| `/accountant/clients/{client_id}/invoices` | GET | List all invoices for a client | `invoices` |
| `/accountant/clients/{client_id}/invoices/{invoice_id}` | GET | Get specific invoice details | `invoices` |
| `/accountant/clients/{client_id}/customers` | GET | List all customers for a client | `customers` |
| `/accountant/clients/{client_id}/expenses` | GET | List all expenses for a client | `expenses` |
| `/accountant/clients/{client_id}/time-entries` | GET | List all time entries for a client | `hours` |

### Access Control Pattern

All endpoints follow a consistent pattern:
1. Verify user is an accountant (via `require_assigned_client()`)
2. Check ACTIVE status in `AccountantClientAssignment`
3. Verify required permission scope (e.g., "invoices", "customers")
4. Filter all queries by `administration_id` for data isolation

Example:
```python
@router.get("/clients/{client_id}/invoices")
async def list_client_invoices(
    client_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession,
):
    # Verify access with 'invoices' scope
    administration = await require_assigned_client(
        client_id, current_user, db, required_scope="invoices"
    )
    
    # Query ALWAYS filters by administration_id
    query = (
        select(ZZPInvoice)
        .where(ZZPInvoice.administration_id == administration.id)
    )
    ...
```

### Benefits
- **Data Consistency**: Accountants and ZZP users now read from the same `administration_id`
- **Security**: Granular permission scopes control what data accountants can access
- **Auditability**: All access goes through centralized access control
- **Scalability**: Easy to add new data types with the same pattern

---

## 2. PDF Generation Improvements

### Problem
WeasyPrint requires system libraries (libcairo, libpango, etc.) that can be fragile in Docker environments. Mobile browsers (especially Safari iOS) need specific headers for proper PDF downloads.

### Solution
1. Implemented ReportLab as primary PDF generator (pure Python, no system dependencies)
2. Keep WeasyPrint as fallback for backward compatibility
3. Added mobile-safe headers for downloads

### Changes Made

#### New File: `backend/app/services/invoice_pdf_reportlab.py`
- Pure Python PDF generation using ReportLab
- Professional invoice layout matching original design
- No system dependencies required
- More reliable in containerized environments

#### Updated: `backend/app/api/v1/zzp_invoices.py`
```python
@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(...):
    try:
        # Try ReportLab first (pure Python, Docker-safe)
        from app.services.invoice_pdf_reportlab import generate_invoice_pdf_reportlab
        pdf_bytes = generate_invoice_pdf_reportlab(invoice)
        
    except Exception as reportlab_error:
        # Fallback to WeasyPrint
        pdf_bytes = generate_invoice_pdf(invoice)
    
    # Mobile-safe headers
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),  # Critical for iOS
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )
```

### Mobile Browser Compatibility

Added headers specifically for mobile Safari:
- **Content-Length**: Required for iOS to show download progress
- **Cache-Control**: Prevents browsers from showing stale PDFs
- **Pragma/Expires**: Additional cache prevention for older browsers

### Dependencies
Added to `requirements.txt`:
```
reportlab==4.2.5
```

---

## 3. Payment System Implementation

### Problem
The old system tracked payments using simple fields on the invoice:
- `amount_paid_cents`: Single field for total paid
- `paid_at`: Single timestamp
- `status`: Simple "paid" flag

This approach had limitations:
- **No partial payment tracking**: Can't record installment payments
- **No payment history**: Lost information about when/how payments were made
- **No reconciliation**: Hard to match bank transactions to invoices
- **Inflexible**: One invoice = one payment assumption

### Solution
Implemented a separate payment system with:
- **Payment records**: Independent payment tracking
- **Payment allocations**: Link payments to invoices (many-to-many)
- **Audit trail**: Complete payment history
- **Reconciliation support**: Link to bank transactions

### New Database Schema

#### Table: `zzp_payments`
Tracks individual payment records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `administration_id` | UUID | Links to business |
| `customer_id` | UUID | Who made the payment (nullable) |
| `amount_cents` | Integer | Total payment amount |
| `payment_date` | Timestamp | When payment was received |
| `payment_method` | String | How payment was made (bank_transfer, cash, card, ideal, other) |
| `reference` | String | Payment reference or transaction ID |
| `bank_transaction_id` | UUID | Link to bank transaction (nullable) |
| `status` | String | Payment status (pending, completed, failed, reversed, cancelled) |
| `notes` | Text | Additional information |

#### Table: `zzp_payment_allocations`
Links payments to invoices (many-to-many relationship).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `payment_id` | UUID | Which payment |
| `invoice_id` | UUID | Which invoice |
| `allocated_amount_cents` | Integer | How much of payment goes to this invoice |
| `allocation_date` | Timestamp | When allocation was made |
| `notes` | Text | Allocation notes |

### Payment API Endpoints

#### List Payments
```
GET /api/v1/zzp/payments
```
Query parameters:
- `customer_id`: Filter by customer
- `status`: Filter by payment status
- `from_date`, `to_date`: Date range filter

#### Create Payment
```
POST /api/v1/zzp/payments
```
Body:
```json
{
  "customer_id": "uuid",
  "amount_cents": 50000,
  "payment_date": "2026-02-10",
  "payment_method": "bank_transfer",
  "reference": "TRX-12345",
  "notes": "Payment for multiple invoices"
}
```

#### Mark Invoice as Paid
```
POST /api/v1/zzp/invoices/{invoice_id}/mark-paid
```
Body:
```json
{
  "payment_date": "2026-02-10",
  "payment_method": "bank_transfer",
  "reference": "TRX-12345",
  "notes": "Full payment received"
}
```

Creates a payment for the full outstanding amount and allocates it to the invoice.

#### Mark Invoice as Unpaid
```
POST /api/v1/zzp/invoices/{invoice_id}/mark-unpaid
```
Removes all payment allocations from the invoice.

#### Partial Payment
```
POST /api/v1/zzp/invoices/{invoice_id}/partial-payment
```
Body:
```json
{
  "amount_cents": 25000,
  "payment_date": "2026-02-10",
  "payment_method": "bank_transfer",
  "reference": "TRX-12345",
  "notes": "First installment"
}
```

Records a partial payment on an invoice.

#### Get Invoice Payment Summary
```
GET /api/v1/zzp/invoices/{invoice_id}/payments
```
Returns:
```json
{
  "invoice_id": "uuid",
  "invoice_number": "INV-2026-0001",
  "invoice_total_cents": 100000,
  "total_paid_cents": 25000,
  "total_outstanding_cents": 75000,
  "is_fully_paid": false,
  "payments": [
    {
      "id": "uuid",
      "amount_cents": 25000,
      "payment_date": "2026-02-10T10:00:00Z",
      "payment_method": "bank_transfer",
      "allocations": [...]
    }
  ]
}
```

### Payment Service Logic

The `PaymentService` class handles all payment business logic:

#### Automatic Invoice Status Updates
When payments are allocated or removed, the service automatically:
1. Calculates total paid amount from all allocations
2. Updates `invoice.amount_paid_cents`
3. Updates `invoice.status`:
   - Fully paid → `"paid"`, sets `paid_at`
   - Partially paid → keeps current status (`"sent"` or `"overdue"`)
   - No payment → resets to `"sent"`, clears `paid_at`

#### Payment Allocation Validation
The service validates:
- Payment amount not exceeded by allocations
- Invoice outstanding amount not exceeded
- Both payment and invoice belong to same administration

#### Example Flow: Partial Payment
```python
# User pays €500 on €1,000 invoice
service = PaymentService(db, administration_id)

payment, allocation = await service.record_partial_payment(
    invoice_id=invoice_id,
    amount_cents=50000,  # €500
    payment_date=datetime.now(timezone.utc),
    payment_method="bank_transfer",
    reference="TRX-001",
)

# Invoice automatically updated:
# - amount_paid_cents = 50000
# - status stays "sent" (not fully paid)
# - paid_at stays None
```

### Accuracy Improvements

The new payment system improves accuracy over simple status flags:

| Old System | New System | Benefit |
|------------|------------|---------|
| Single `amount_paid_cents` field | Payment records + allocations | Track who paid, when, and how |
| Status flag: "paid" or "unpaid" | Status derived from allocations | Automatic, always accurate |
| No partial payment support | Multiple payments per invoice | Handle installment plans |
| No payment history | Complete audit trail | Compliance and troubleshooting |
| Manual reconciliation | Link to bank transactions | Automated reconciliation |

### Dashboard Statistics Update

Dashboard statistics now use payment data:

```python
# Old approach (inaccurate for partial payments)
total_revenue = sum(invoice.total_cents for invoice in paid_invoices)

# New approach (accurate)
total_revenue = sum(
    allocation.allocated_amount_cents
    for allocation in completed_allocations
)
```

This ensures:
- Revenue counted when actually paid, not when invoice marked "paid"
- Partial payments reflected correctly
- Refunds/reversals tracked accurately

---

## Migration Guide

### Database Migration

Run the Alembic migration to create payment tables:

```bash
cd backend
alembic upgrade head
```

This creates:
- `zzp_payments` table
- `zzp_payment_allocations` table
- Appropriate indexes and foreign keys

### Migrating Existing Data

Existing invoices with `amount_paid_cents > 0` should be migrated to the new payment system. Create a data migration script:

```python
# Example migration script (not included, create as needed)
from app.models import ZZPInvoice
from app.models.payment import ZZPPayment, ZZPPaymentAllocation

# For each paid invoice, create payment record
for invoice in paid_invoices:
    if invoice.amount_paid_cents > 0:
        # Create payment
        payment = ZZPPayment(
            administration_id=invoice.administration_id,
            customer_id=invoice.customer_id,
            amount_cents=invoice.amount_paid_cents,
            payment_date=invoice.paid_at or invoice.updated_at,
            payment_method="bank_transfer",
            reference=f"Migration: {invoice.invoice_number}",
            status="completed",
        )
        db.add(payment)
        
        # Create allocation
        allocation = ZZPPaymentAllocation(
            payment_id=payment.id,
            invoice_id=invoice.id,
            allocated_amount_cents=invoice.amount_paid_cents,
        )
        db.add(allocation)
```

### Frontend Changes Required

The frontend will need to be updated to:

1. **Use new payment endpoints** instead of old status update endpoints
2. **Display payment history** on invoice detail pages
3. **Support partial payment UI** for recording installment payments
4. **Show payment allocation details** when viewing payments

Example API calls to update:

```typescript
// Old approach
PUT /api/v1/zzp/invoices/{id}/status
{ "status": "paid" }

// New approach
POST /api/v1/zzp/invoices/{id}/mark-paid
{
  "payment_date": "2026-02-10",
  "payment_method": "bank_transfer",
  "reference": "TRX-12345"
}
```

---

## Security Considerations

### Data Isolation
All endpoints enforce `administration_id` filtering to prevent cross-client data leakage:

```python
# ALWAYS filter by administration_id
query = query.where(Model.administration_id == administration.id)
```

### Permission Scopes
Accountant access is controlled by granular scopes:
- `invoices`: View invoice data
- `customers`: View customer data
- `expenses`: View expense data
- `hours`: View time tracking data

Scopes are enforced via `require_assigned_client(required_scope="...")`.

### Payment Authorization
Only the invoice owner (ZZP user) can:
- Create payments
- Allocate payments
- Mark invoices as paid/unpaid

Accountants have read-only access to payment data through client endpoints.

---

## Testing Recommendations

### Unit Tests
- Payment service logic (allocation validation, status updates)
- Access control (scope enforcement, data isolation)
- PDF generation (ReportLab and WeasyPrint fallback)

### Integration Tests
- End-to-end payment flows
- Accountant client data access
- Mobile PDF downloads

### Manual Testing
1. Test PDF downloads on:
   - Safari iOS
   - Chrome Android
   - Desktop browsers
2. Test payment flows:
   - Full payment
   - Partial payments
   - Multiple payments on one invoice
   - One payment across multiple invoices
3. Test accountant access:
   - With/without appropriate scopes
   - Data isolation between clients

---

## Summary

### Tables Changed
- **New**: `zzp_payments` (payment records)
- **New**: `zzp_payment_allocations` (payment-to-invoice links)
- **Modified**: `zzp_invoices` (now computed from allocations)

### Endpoints Added
- `GET /accountant/clients/{client_id}/invoices`
- `GET /accountant/clients/{client_id}/customers`
- `GET /accountant/clients/{client_id}/expenses`
- `GET /accountant/clients/{client_id}/time-entries`
- `POST /zzp/invoices/{id}/mark-paid`
- `POST /zzp/invoices/{id}/mark-unpaid`
- `POST /zzp/invoices/{id}/partial-payment`
- `GET /zzp/invoices/{id}/payments`
- `GET /zzp/payments`
- `POST /zzp/payments`

### Files Created
- `backend/app/api/v1/client_data.py` (accountant endpoints)
- `backend/app/api/v1/zzp_payments.py` (payment endpoints)
- `backend/app/models/payment.py` (payment models)
- `backend/app/schemas/payment.py` (payment schemas)
- `backend/app/services/payment_service.py` (payment logic)
- `backend/app/services/invoice_pdf_reportlab.py` (PDF generation)
- `backend/alembic/versions/026_add_payment_system.py` (migration)

### Files Modified
- `backend/app/main.py` (router registration)
- `backend/app/models/__init__.py` (model exports)
- `backend/app/api/v1/zzp_invoices.py` (PDF endpoint)
- `backend/requirements.txt` (added ReportLab)

### Why These Changes Improve Accuracy

1. **Unified Data Access**: Accountants and ZZP users now access the same underlying data, eliminating inconsistencies

2. **Proper Payment Tracking**: Separate payment records provide:
   - Complete audit trail
   - Flexible payment scenarios (partial, split, etc.)
   - Automatic status derivation
   - Bank reconciliation support

3. **Reliable PDF Generation**: Pure Python implementation eliminates Docker dependency issues

4. **Mobile Compatibility**: Proper headers ensure downloads work on all devices

5. **Security**: Granular scopes and consistent data filtering prevent unauthorized access
