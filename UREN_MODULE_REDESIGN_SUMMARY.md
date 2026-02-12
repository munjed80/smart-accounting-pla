# Uren (Time Tracking) Module Redesign - Implementation Summary

## Overview
This document summarizes the complete redesign and rebuild of the Uren (Time Tracking) module to follow real-world ZZP (freelancer) invoicing logic.

## Problem Statement
The previous system:
- Displayed daily hours without a clear invoicing flow
- Had no structured way to generate weekly invoices
- Did not track which hours had been invoiced
- Made it difficult to prevent double-billing

## Solution Implemented

### 1. Database Changes

#### Migration: `027_add_time_entry_invoice_link.py`
Added two new fields to the `zzp_time_entries` table:
- **`invoice_id`** (UUID, nullable): Foreign key linking to `zzp_invoices` table
- **`is_invoiced`** (Boolean, default false): Quick filter flag for invoiced entries

Both fields are indexed for efficient querying.

#### Model Updates
Updated `ZZPTimeEntry` model in `/backend/app/models/zzp.py`:
- Added invoice_id and is_invoiced fields
- Added relationship to ZZPInvoice
- Updated docstring to document new fields

### 2. Backend API Changes

#### New Endpoint: `/zzp/time-entries/create-invoice`
**Purpose:** Generate invoices from unbilled time entries

**Request Schema:** `CreateInvoiceFromTimeEntriesRequest`
- customer_id: Customer to invoice
- period_start: Start date of billing period
- period_end: End date of billing period  
- hourly_rate_cents: Hourly rate in cents
- issue_date: Invoice issue date
- due_date: Payment due date (optional)
- notes: Invoice notes (optional)

**Process:**
1. Validates customer exists
2. Fetches all unbilled time entries for customer within period
3. Calculates total hours
4. Generates race-safe invoice number
5. Creates invoice with seller/customer snapshots
6. Creates single invoice line with format:
   - "Week X (DD-MM-YYYY - DD-MM-YYYY) – XXh × €XX.XX"
7. Links all time entries to invoice
8. Marks entries as invoiced (is_invoiced = true)

**VAT Handling:**
- Uses configurable constant `DEFAULT_VAT_RATE_NL = 21%`
- Can be updated to support different rates

#### Updated Response Schema
`TimeEntryResponse` now includes:
- invoice_id (optional UUID)
- is_invoiced (boolean)

### 3. Frontend Changes

#### New "Facturatie deze week" Block
Added prominent invoice creation card at the top of the page:

**Features:**
- Customer dropdown selector (required)
- Period selector (auto-initialized to current week, editable)
- Hourly rate input field (euros, required)
- Live preview showing:
  - Total unbilled hours for selected customer/period
  - Hourly rate
  - Total amount (excl. VAT)
- "Maak factuur" button
- Real-time validation and preview updates

**User Flow:**
1. Select customer from dropdown
2. Adjust period if needed (defaults to current week)
3. Enter hourly rate
4. Review live preview of hours and total
5. Click "Maak factuur"
6. Success toast with link to view created invoice
7. Form resets, entries refresh automatically

#### Split Time Entries Display

**Two Separate Sections:**

1. **"Open uren" (Unbilled Entries)**
   - Shows all entries where `is_invoiced = false`
   - Entries are editable and deletable
   - Can be selected for invoicing
   
2. **"Gefactureerde uren" (Invoiced Entries)**
   - Shows all entries where `is_invoiced = true`
   - Includes "Factuur" column with clickable link to invoice
   - Editing and deletion disabled (tooltips explain why)
   - Can be duplicated (creates new unbilled entry)

#### Reusable `EntriesTable` Component
Created helper component for consistent display:
- Supports both mobile (cards) and desktop (table) views
- Configurable title, description, and empty message
- Optional invoice reference column
- Conditional edit/delete permissions

#### Updated Entry Actions
- **Edit**: Disabled for invoiced entries (tooltip: "Gefactureerde uren kunnen niet worden bewerkt")
- **Delete**: Disabled for invoiced entries (tooltip: "Gefactureerde uren kunnen niet worden verwijderd")
- **Duplicate**: Always enabled (creates new unbilled entry)

### 4. TypeScript/API Updates

#### Updated Types
- `ZZPTimeEntry` interface includes `invoice_id` and `is_invoiced`
- New `CreateInvoiceFromTimeEntriesRequest` interface
- New API method: `zzpApi.timeEntries.createInvoice()`

### 5. UX Improvements

#### Clear Workflow
The new design follows a clear flow:
1. **Track**: Add time entries as usual
2. **Review**: View "Open uren" section
3. **Generate Invoice**: Use "Facturatie deze week" block
4. **Done**: Hours move to "Gefactureerde uren"

#### Visual Clarity
- Invoice creation block has distinct gradient background
- Sections are clearly labeled and separated
- Live preview provides immediate feedback
- Toast notifications confirm successful actions

#### Prevention of Errors
- Can't edit invoiced hours (prevents invoice inconsistencies)
- Can't delete invoiced hours (maintains audit trail)
- Can't invoice same hours twice (filtered by is_invoiced flag)
- Validation prevents incomplete invoice creation

## Technical Details

### Constants (Maintainability)
```python
DEFAULT_VAT_RATE_NL = Decimal("21")
INVOICE_LINE_DESCRIPTION_FORMAT = "Week {week} ({start} - {end}) – {hours:.2f}h × €{rate:.2f}"
```

### Security Considerations
- All endpoints require ZZP user authentication
- Multi-tenant isolation via administration_id
- Race-safe invoice number generation (SELECT FOR UPDATE)
- Input validation on all request fields
- SQL injection prevention via SQLAlchemy ORM

### Performance Optimizations
- Indexed invoice_id and is_invoiced fields
- Efficient filtering with useMemo hooks
- Separate filtered lists avoid redundant calculations
- Live preview computed only when dependencies change

## Testing Recommendations

### Database Migration
1. Run migration on test database
2. Verify indexes created successfully
3. Test upgrade and downgrade paths
4. Confirm foreign key constraints work

### Backend API
1. Test creating invoice with various date ranges
2. Test with zero unbilled hours (should error)
3. Test with non-existent customer (should error)
4. Test concurrent invoice generation (race condition)
5. Verify time entries linked correctly
6. Verify is_invoiced flag updated

### Frontend
1. Test invoice creation flow end-to-end
2. Verify live preview calculations
3. Test period selector (different weeks)
4. Verify navigation to created invoice
5. Test edit/delete permissions on invoiced entries
6. Test mobile and desktop layouts
7. Verify empty states display correctly

### Integration
1. Create time entries → Generate invoice → Verify entries moved
2. Test duplicate functionality on invoiced entries
3. Verify invoice detail page shows linked time entries
4. Test filtering and sorting across both sections

## Migration Path

### For Existing Data
All existing time entries will have:
- `invoice_id = NULL`
- `is_invoiced = false`

They will appear in "Open uren" and can be invoiced normally.

### For Existing Invoices
No changes needed. The new system creates invoices using the same tables and format.

## Future Enhancements

### Possible Improvements
1. **Multiple VAT Rates**: Support 0%, 9%, 21% per business profile
2. **Hourly Rate per Customer**: Store default rates in customer records
3. **Invoice Templates**: Multiple description formats
4. **Bulk Actions**: Select multiple weeks at once
5. **Period Presets**: "This month", "Last month", etc.
6. **Export Options**: PDF summary of unbilled hours
7. **Email Integration**: Send invoice directly to customer

### Localization
Currently uses Dutch text. Consider:
- Moving all strings to i18n translation files
- Supporting multiple date formats
- Currency symbol configuration

## Files Changed

### Backend
- `/backend/alembic/versions/027_add_time_entry_invoice_link.py` (new)
- `/backend/app/models/zzp.py`
- `/backend/app/schemas/zzp.py`
- `/backend/app/api/v1/zzp_time.py`

### Frontend
- `/src/lib/api.ts`
- `/src/components/ZZPTimeTrackingPage.tsx`

## Code Review & Security

### Code Review Results
✅ All feedback addressed:
- Fixed navigation paths to use absolute paths
- Extracted VAT rate to configurable constant
- Extracted invoice description format to constant

### Security Scan Results
✅ CodeQL Analysis: **0 alerts found**
- No Python security issues
- No JavaScript security issues

## Conclusion

The redesigned Uren module now provides a complete, production-ready ZZP invoicing workflow that:
- ✅ Prevents double-billing
- ✅ Maintains audit trail
- ✅ Provides clear UX
- ✅ Follows real-world invoicing practices
- ✅ Scales with business growth

The implementation is secure, performant, and maintainable.
