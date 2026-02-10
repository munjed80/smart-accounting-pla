# ZZP Invoice Status Workflow Diagram

## Status Transition Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ZZP Invoice Status Workflow                         │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │                  │
                    │  1. DRAFT        │
                    │  (Concept)       │
                    │                  │
                    └────────┬─────────┘
                             │
                             │ Action: "Verzenden" (Send)
                             │ API: updateStatus(id, 'sent')
                             │ Handler: handleSendInvoice()
                             │
                             ▼
                    ┌──────────────────┐
                    │                  │
                    │  2. SENT         │◄─────────────────┐
                    │  (Verzonden)     │                  │
                    │                  │                  │
                    └────────┬─────────┘                  │
                             │                            │
                             │                            │
                             │ Action: "Markeer als       │ Action: "Markeer als
                             │ betaald" (Mark Paid)       │ onbetaald" (Mark Unpaid)
                             │ API: markPaid(id, data)    │ API: markUnpaid(id)
                             │ Handler: handleMarkPaid()  │ Handler: handleMarkUnpaid()
                             │                            │
                             ▼                            │
                    ┌──────────────────┐                  │
                    │                  │                  │
                    │  3. PAID         │──────────────────┘
                    │  (Betaald)       │
                    │                  │
                    └──────────────────┘


                    ┌──────────────────┐       ┌──────────────────┐
                    │                  │       │                  │
                    │  OVERDUE         │       │  CANCELLED       │
                    │  (Verlopen)      │       │  (Geannuleerd)   │
                    │                  │       │                  │
                    └────────┬─────────┘       └──────────────────┘
                             │
                             │ Same actions as SENT
                             │ (Can mark as paid)
                             │
                             ▼
                    ┌──────────────────┐
                    │                  │
                    │  PAID            │
                    │  (Betaald)       │
                    │                  │
                    └──────────────────┘
```

## Status Details

### 1. DRAFT (Concept)
**Characteristics:**
- Editable
- Not sent to customer
- Can be deleted
- Shown in "Concept" stats

**Available Actions:**
- ✅ Edit
- ✅ Delete
- ✅ View
- ✅ Verzenden (Send) → Changes to SENT
- ✅ Download PDF
- ✅ Copy Link
- ✅ Share

**Menu Structure:**
```
⋮ More Actions
├─ Download PDF
├─ Copy Invoice Link
├─ Share
├─ ─────────────────
├─ Verzenden (Send) ← NEW
├─ ─────────────────
└─ Delete
```

### 2. SENT (Verzonden)
**Characteristics:**
- Read-only (view only)
- Sent to customer
- Cannot be deleted
- Shown in "Openstaand" stats

**Available Actions:**
- ✅ View (read-only)
- ✅ Markeer als betaald (Mark Paid) → Changes to PAID
- ✅ Download PDF
- ✅ Copy Link
- ✅ Share

**Menu Structure:**
```
⋮ More Actions
├─ Download PDF
├─ Copy Invoice Link
├─ Share
├─ ─────────────────
└─ Markeer als betaald (Mark Paid)
```

### 3. PAID (Betaald)
**Characteristics:**
- Read-only (view only)
- Payment recorded
- Cannot be deleted
- Shown in "Betaald" stats

**Available Actions:**
- ✅ View (read-only)
- ✅ Markeer als onbetaald (Mark Unpaid) → Changes to SENT
- ✅ Download PDF
- ✅ Copy Link
- ✅ Share

**Menu Structure:**
```
⋮ More Actions
├─ Download PDF
├─ Copy Invoice Link
├─ Share
├─ ─────────────────
└─ Markeer als onbetaald (Mark Unpaid)
```

### 4. OVERDUE (Verlopen)
**Characteristics:**
- Auto-calculated based on due_date
- Read-only (view only)
- Cannot be deleted
- Shown in "Openstaand" stats (highlighted)

**Available Actions:**
- Same as SENT status
- ✅ Markeer als betaald → Changes to PAID

**Menu Structure:**
```
⋮ More Actions
├─ Download PDF
├─ Copy Invoice Link
├─ Share
├─ ─────────────────
└─ Markeer als betaald (Mark Paid)
```

### 5. CANCELLED (Geannuleerd)
**Characteristics:**
- Read-only (view only)
- Cannot be edited or deleted
- No status actions available

**Available Actions:**
- ✅ View (read-only)
- ✅ Download PDF
- ✅ Copy Link
- ✅ Share

**Menu Structure:**
```
⋮ More Actions
├─ Download PDF
├─ Copy Invoice Link
└─ Share
```

## Action Handlers

### handleSendInvoice()
```typescript
Purpose: Send draft invoice to customer
API Call: zzpApi.invoices.updateStatus(id, 'sent')
Toast: "Factuur verzonden"
Reload: Yes
```

### handleMarkPaid()
```typescript
Purpose: Mark invoice as paid
API Call: zzpApi.invoices.markPaid(id, data)
Toast: "Factuur gemarkeerd als betaald"
Reload: Yes
```

### handleMarkUnpaid()
```typescript
Purpose: Revert paid invoice to sent
API Call: zzpApi.invoices.markUnpaid(id)
Toast: "Factuur gemarkeerd als onbetaald"
Reload: Yes
```

## UI Behavior

### Status Badge (Draft)
- Shown as simple badge
- Cannot be clicked/changed
- Must use "Verzenden" action to change

### Status Selector (Non-Draft)
- Shown as dropdown selector
- Can quick-change between: Sent, Paid, Cancelled
- Uses handleStatusChange()

### Immediate Updates
- All status changes reload data: `await loadData()`
- UI updates without full page refresh
- Toast notifications confirm actions
- Loading states prevent double-clicks

## Share/Copy Link Behavior

### Before (WRONG ❌)
```
Link: https://example.com/zzp/invoices?view={id}
Type: Internal page route
Issue: Not customer-usable, requires login
```

### After (CORRECT ✅)
```
Link: https://example.com/api/v1/zzp/invoices/{id}/pdf
Type: Direct PDF download URL
Benefit: Customer-usable invoice link
```

## PDF Download Behavior

### Desktop Browsers
```
Method: Anchor element with download attribute
Flow: Blob → createObjectURL → click anchor
Result: Downloads to Downloads folder
Filename: {invoice_number}.pdf
```

### iOS Safari
```
Method: window.open with blob URL
Flow: Blob → createObjectURL → window.open → PDF Viewer
Result: Opens in built-in PDF viewer
User: Can save/share from viewer
Why: iOS ignores download attribute
```

### Android Chrome
```
Method: Anchor element (with fallback)
Flow: Blob → createObjectURL → click anchor
Fallback: window.open if blob fails
Result: Downloads or opens based on settings
```

### Popup Blocked
```
Detection: window.open returns null
Message: "Pop-up geblokkeerd. Sta pop-ups toe..."
Action: User allows popups → retry works
```

## Memory Management

### Blob URL Cleanup
```typescript
// Desktop
setTimeout(() => URL.revokeObjectURL(url), 30000) // 30s

// Mobile
setTimeout(() => URL.revokeObjectURL(url), 60000) // 60s

// iOS (after window.open)
setTimeout(() => URL.revokeObjectURL(url), 60000) // 60s
```

**Why Different Delays:**
- Mobile networks slower
- iOS needs time to load PDF in viewer
- Desktop can revoke sooner (direct download)

## Testing Matrix

| Status    | Verzenden | Mark Paid | Mark Unpaid | Edit | Delete | View |
|-----------|-----------|-----------|-------------|------|--------|------|
| Draft     | ✅        | ❌        | ❌          | ✅   | ✅     | ✅   |
| Sent      | ❌        | ✅        | ❌          | ❌   | ❌     | ✅   |
| Paid      | ❌        | ❌        | ✅          | ❌   | ❌     | ✅   |
| Overdue   | ❌        | ✅        | ❌          | ❌   | ❌     | ✅   |
| Cancelled | ❌        | ❌        | ❌          | ❌   | ❌     | ✅   |

✅ = Action available
❌ = Action not available
