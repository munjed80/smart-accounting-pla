# BTW Rubrieken Traceability - Verification Guide

## Overview
This document describes the BTW (VAT) Rubrieken traceability feature that provides audit-friendly drilldown from VAT box totals to individual source transactions.

## Feature Description

### What It Does
For every BTW rubriek (VAT box) value shown in the BTW-aangifte page, users can:
1. Click on a rubriek row to open a detailed breakdown
2. View all underlying transactions (invoices, expenses, journal entries) that contributed to that rubriek
3. See the exact mapping reason explaining why each transaction maps to that rubriek
4. Filter by source type and search transactions
5. Navigate directly to source documents
6. Export data to CSV for external audit

### Key Components

#### Backend
- **Endpoint**: `GET /api/accountant/clients/{client_id}/btw/periods/{period_id}/boxes/{box_code}/lines`
- **Data Model**: `VatBoxLineage` table stores immutable audit trail
- **Lineage Service**: Populates lineage during VAT report generation
- **Mapping Reason**: Auto-generated based on VAT code metadata and box mapping

#### Frontend
- **BTWAangiftePage**: Main VAT return page with clickable rubrieken
- **BTWBoxDrilldown**: Mobile-friendly drawer showing transaction breakdown
- **Features**: Pagination, filtering, search, CSV export, source navigation

### Security & Permissions
- **Tenant Isolation**: All queries filtered by `administration_id`
- **Permission Check**: Only accountants with ACTIVE assignment to client
- **Machtiging Rules**: Respects accountant authorization workflow
- **No Data Leakage**: Cross-client access prevented at DB and API level

## Verification Steps

### 1. Generate VAT Period

**Prerequisites:**
- Active client with posted transactions
- Accounting period in REVIEW, FINALIZED, or LOCKED status
- Transactions have VAT codes assigned

**Steps:**
1. Log in as an accountant
2. Select a client (ensure you have ACTIVE assignment)
3. Navigate to BTW-aangifte page
4. Select a VAT period
5. Click "Genereer rapport" if needed

**Expected Result:**
- VAT report displays with all rubrieken (1a, 1b, 3b, 5b, etc.)
- Each rubriek shows turnover, VAT amount, and transaction count
- Rubrieken with transactions show a clickable caret icon (▶)

### 2. Verify Breakdown Totals Match

**Steps:**
1. Note the total amounts for a specific rubriek (e.g., rubriek 1a)
   - Example: Rubriek 1a shows €10,000 turnover, €2,100 VAT, 15 transactions
2. Click on that rubriek row to open the breakdown drawer
3. Review the summary strip at the top showing totals
4. Sum the amounts in the transaction list (all pages if paginated)

**Expected Result:**
- Breakdown summary totals EXACTLY match the rubriek totals on main page
- Transaction count matches
- No rounding discrepancies
- All transactions shown contribute to the correct box

**Test Cases:**
- Test with rubrieken that have many transactions (pagination)
- Test with rubrieken that have negative amounts (credit notes)
- Test calculation boxes (5a, 5c, 5g) - should have no direct transactions
- Test input VAT box (5b) - should show purchase transactions

### 3. Verify Mapping Reason Display

**Steps:**
1. Open any rubriek breakdown (e.g., rubriek 1a, 3b, or 5b)
2. Review each transaction in the list
3. Check the "mapping_reason" text displayed below the description

**Expected Results:**
- Each transaction shows a mapping_reason in blue text
- Reasons are clear and specific:
  - Rubriek 1a: "Binnenlandse omzet 21% → rubriek 1a"
  - Rubriek 1b: "Binnenlandse omzet 9% → rubriek 1b"
  - Rubriek 3b: "ICP levering binnen EU → rubriek 3b"
  - Rubriek 4b: "EU-verwerving → rubriek 4b"
  - Rubriek 5b (purchases): "Voorbelasting 21% → rubriek 5b"
  - Rubriek 5b (reverse charge): "Aftrekbare BTW verlegging → rubriek 5b"
- Mapping reasons explain the VAT treatment logic

**Test Specific Scenarios:**
- Domestic sales at 21% → should map to 1a with clear reason
- Domestic sales at 9% → should map to 1b with clear reason
- EU B2B sales (ICP) → should map to 3b with "ICP levering binnen EU"
- EU purchases → should map to 4b and 5b with reverse charge reasons
- Regular purchases → should map to 5b with "Voorbelasting" reason

### 4. Test Permission Enforcement

**Test Case A: Accountant Without Machtiging**

**Steps:**
1. Log in as an accountant
2. Try to access breakdown endpoint for a client you're NOT assigned to:
   ```
   GET /api/accountant/clients/{other_client_id}/btw/periods/{period_id}/boxes/1a/lines
   ```

**Expected Result:**
- HTTP 403 Forbidden or 404 Not Found
- Error message: "Client not found or access denied"
- No data returned

**Test Case B: ZZP User Trying to Access Accountant Endpoint**

**Steps:**
1. Log in as a ZZP (end user)
2. Try to access breakdown endpoint:
   ```
   GET /api/accountant/clients/{client_id}/btw/periods/{period_id}/boxes/1a/lines
   ```

**Expected Result:**
- HTTP 403 Forbidden
- Error message: "This endpoint is only available for accountants"

**Test Case C: Accountant With Valid Machtiging**

**Steps:**
1. Log in as an accountant
2. Ensure you have ACTIVE assignment to client (check Machtigingen)
3. Access breakdown endpoint for that client

**Expected Result:**
- HTTP 200 OK
- Breakdown data returned correctly
- All transactions visible

### 5. Test Filtering & Search

**Filtering by Source Type:**
1. Open a rubriek breakdown
2. Use the "Filter op type" dropdown
3. Select "Facturen" (Invoices)

**Expected Result:**
- Only invoice lines displayed
- Count updates to show filtered count
- Can switch between: All types, Facturen, Uitgaven, Journaalposten

**Search Functionality:**
1. Open a rubriek breakdown
2. Type a search term in the search box
3. Examples: customer name, description keyword, reference number

**Expected Result:**
- Results filtered client-side in real-time
- Shows "X gefilterd" count
- Highlights matching terms (implicit through filtering)

### 6. Test Source Navigation ("Open bron")

**Steps:**
1. Open a rubriek breakdown
2. Find a transaction with a document (invoice/expense)
3. Click the document icon (if onViewDocument is wired)
4. Click the journal entry icon

**Expected Result:**
- Document icon navigates to invoice/expense detail page
- Journal entry icon navigates to journal entry detail page
- Permissions enforced on target pages
- User can view full details of source transaction

### 7. Test CSV Export

**Steps:**
1. Open a rubriek breakdown
2. Apply some filters (optional)
3. Click "Exporteer CSV" button

**Expected Result:**
- CSV file downloads: `btw-{box_code}-drilldown.csv`
- Contains columns: Datum, Type, Omschrijving, Relatie, Referentie, Netto, BTW, Document ID, Boeking ID
- All filtered rows included
- Proper CSV formatting with quoted fields
- Can be opened in Excel/Google Sheets

### 8. Test Mobile Responsiveness

**Steps:**
1. Resize browser to mobile width (< 640px) or use device emulator
2. Open BTW-aangifte page
3. Click on a rubriek to open breakdown

**Expected Result:**
- Drawer takes full screen on mobile
- No overlapping headers or UI elements
- Touch-friendly tap targets
- Scrollable transaction list
- Filters stack vertically
- All functionality works on mobile

### 9. Verify Data Consistency Across Sessions

**Steps:**
1. Generate VAT report for a period
2. Note the lineage data (transaction count, totals)
3. Close and reopen the breakdown
4. Regenerate the VAT report (if allowed)
5. Check breakdown again

**Expected Result:**
- Lineage data is stable and deterministic
- Regenerating report produces identical lineage (idempotent)
- No random variations in mapping
- Timestamps preserved (created_at doesn't change on regeneration)

## Common Issues & Troubleshooting

### Issue: "Geen regels gevonden" (No lines found)
**Possible Causes:**
- VAT report not yet generated for period
- Period has no posted transactions with VAT codes
- Box is a calculation box (5a, 5c, 5g) with no direct lineage

**Solution:**
- Generate/regenerate VAT report
- Check that transactions are posted and have VAT codes
- For calculation boxes, this is expected behavior

### Issue: Totals Don't Match
**Possible Causes:**
- Lineage data out of sync with posted transactions
- Transactions modified after report generation

**Solution:**
- Regenerate VAT report to refresh lineage
- Lineage is repopulated each time report is generated

### Issue: Missing mapping_reason
**Possible Causes:**
- VAT code has no ID (orphaned lineage record)
- VAT code deleted after lineage created

**Solution:**
- This is rare; check data integrity
- Mapping reason is optional (null-safe)

### Issue: Permission Denied
**Possible Causes:**
- User not assigned to client
- Assignment not ACTIVE (e.g., PENDING, REVOKED)
- Wrong role (ZZP user trying to access accountant endpoint)

**Solution:**
- Verify user has ACTIVE assignment in AdministrationMember table
- Check Machtigingen page for accountant

## API Reference

### Get Box Breakdown Lines

```http
GET /api/accountant/clients/{client_id}/btw/periods/{period_id}/boxes/{box_code}/lines
```

**Parameters:**
- `client_id` (UUID, path): Client administration ID
- `period_id` (UUID, path): Accounting period ID
- `box_code` (string, path): VAT box code (e.g., "1a", "3b", "5b")
- `page` (int, query, default=1): Page number
- `page_size` (int, query, default=50, max=500): Items per page
- `source_type` (string, query, optional): Filter by INVOICE_LINE, EXPENSE_LINE, or JOURNAL_LINE
- `from_date` (string, query, optional): Filter from date (YYYY-MM-DD)
- `to_date` (string, query, optional): Filter to date (YYYY-MM-DD)

**Response:**
```json
{
  "period_id": "uuid",
  "period_name": "Q1 2024",
  "box_code": "1a",
  "box_name": "Leveringen/diensten belast met hoog tarief (21%)",
  "lines": [
    {
      "id": "uuid",
      "vat_box_code": "1a",
      "net_amount": "1000.00",
      "vat_amount": "210.00",
      "source_type": "INVOICE_LINE",
      "source_id": "uuid",
      "document_id": "uuid",
      "journal_entry_id": "uuid",
      "journal_line_id": "uuid",
      "vat_code_id": "uuid",
      "transaction_date": "2024-01-15",
      "reference": "INV-2024-001",
      "description": "Consultancy services",
      "party_id": "uuid",
      "party_name": "Customer B.V.",
      "party_vat_number": "NL123456789B01",
      "created_at": "2024-01-16T10:00:00Z",
      "mapping_reason": "Binnenlandse omzet 21% → rubriek 1a"
    }
  ],
  "total_count": 150,
  "page": 1,
  "page_size": 50
}
```

**Security:**
- Requires accountant role
- Enforces active client assignment
- Tenant-isolated at DB level

## Technical Notes

### Lineage Population
- Triggered during VAT report generation
- Uses `VatLineageService.populate_lineage_for_period()`
- Idempotent: deletes existing lineage for period before repopulation
- Only processes POSTED journal entries
- Handles multiple box mappings per line (e.g., reverse charge → both 4b and 5b)

### Mapping Reason Generation
- Computed at API response time (not stored in DB)
- Based on VAT code metadata:
  - `code`: VAT code identifier
  - `rate`: VAT percentage
  - `category`: SALES, PURCHASES, REVERSE_CHARGE, INTRA_EU, etc.
  - `box_mapping`: JSONB with turnover_box, vat_box, deductible_box
- Language: Dutch (for Dutch tax authorities)

### Performance
- Indexed on: (period_id, vat_box_code), (administration_id, period_id)
- Pagination prevents large result sets
- VAT code lookup batched per page
- Typical response time: < 200ms for 50 records

## Compliance & Audit Requirements

This feature satisfies Dutch tax authority (Belastingdienst) requirements for:
- **Complete Audit Trail**: Every euro in VAT return traceable to source
- **Immutable History**: Lineage records timestamped, never modified
- **Evidence Pack Support**: Can generate supporting documentation
- **Accountant Review**: Enables accountant validation before filing
- **ICP Verification**: Tracks EU customer VAT numbers for ICP declaration

## Related Documentation
- `BTW_AUDIT_TRAIL_IMPLEMENTATION.md`: Original implementation details
- `DUTCH_VAT_BOX_MAPPING_NOTES.md`: VAT box mapping rules
- `API_DOCUMENTATION.md`: Full API reference
