# Uren Module UI Guide - Visual Description

## Overview
This guide describes the new user interface of the redesigned Uren (Time Tracking) module.

## Page Structure (Top to Bottom)

### 1. Header Section
**Location:** Top of page

**Elements:**
- **Title:** Large heading with clock icon: "Uren" (Time Tracking)
- **Description:** Subtitle explaining the page purpose
- **Action Buttons (Right side):**
  - "Maak factuur" button (now less prominent - old dialog removed)
  - "Export" button (CSV export)
  - "Nieuwe registratie" button (Add new time entry)

---

### 2. Clock-in/Out Card (Dagstart)
**Location:** Below header

**Visual:** 
- Card with gradient background
- Displays current work session status
- Shows elapsed time if clocked in
- Buttons: "Start werkdag" or "Stop werkdag"

---

### 3. ⭐ NEW: Facturatie deze week (Invoice Creation Block)
**Location:** Below clock-in card, BEFORE week navigation

**Visual Design:**
- Gradient background (primary/accent colors)
- Icon: Receipt/invoice icon in rounded square
- More prominent than other cards

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ 📄 Facturatie deze week                             │
│ Genereer direct een factuur van ongefactureerde uren│
├─────────────────────────────────────────────────────┤
│                                                     │
│ Row 1:                                              │
│ [Klant Dropdown ▼]    [Uurtarief €  _____]         │
│                                                     │
│ Row 2:                                              │
│ [Periode van: ____]   [Periode tot: ____]          │
│                                                     │
│ ┌─ Preview Box (gray background) ─────────────┐   │
│ │ Totaal uren:          XX.XXh                 │   │
│ │ Uurtarief:            €XX.XX                 │   │
│ │ ─────────────────────────────────────────────│   │
│ │ Totaal (excl. BTW):   €XXX.XX  [bold/primary]│   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ [    📄 Maak factuur    ] (full width button)      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Interactions:**
1. Select customer → Live preview updates
2. Adjust dates → Preview recalculates hours
3. Enter rate → Preview shows total
4. Click "Maak factuur" → Success toast → Refresh

**Preview Behavior:**
- Shows "0.00h" if no unbilled hours found
- Button disabled until all fields valid
- Shows spinner when creating invoice

---

### 4. Week Navigation
**Location:** Below invoice creation block

**Visual:**
- Card with calendar icon
- Current week range displayed centrally
- Navigation arrows on sides
- "Today" button

---

### 5. Stats Cards
**Location:** Below week navigation

**Layout:** 3 cards in a row
- Total hours this week
- Billable hours
- Utilization percentage

---

### 6. Weekly Summary Bar
**Visual:** 
- Horizontal bar chart
- Shows hours per day (Monday-Sunday)
- Color-coded by billable status

---

### 7. Filters & Search
**Layout:** Row with 4 elements
- Search box (magnifying glass icon)
- Billable filter dropdown
- Sort dropdown
- (Visual filters for the entries below)

---

### 8. ⭐ NEW: Time Entries - TWO SEPARATE SECTIONS

#### Section A: "Open uren" (Unbilled Entries)
**Visual:**
```
┌─────────────────────────────────────────────────────┐
│ Open uren                                           │
│ XX uren nog niet gefactureerd                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [Table/Cards with time entries]                     │
│                                                     │
│ Desktop Table Columns:                              │
│ Date | Description | Project | Hours | Billable | Actions│
│                                                     │
│ Actions per row:                                    │
│ [✏️ Edit] [📋 Duplicate] [🗑️ Delete]                │
│ (All enabled - not invoiced yet)                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Empty State:**
"Geen open uren gevonden. Alle uren zijn gefactureerd."

#### Section B: "Gefactureerde uren" (Invoiced Entries)
**Visual:**
```
┌─────────────────────────────────────────────────────┐
│ Gefactureerde uren                                  │
│ XX uren gefactureerd                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [Table/Cards with invoiced entries]                 │
│                                                     │
│ Desktop Table Columns:                              │
│ Date | Description | Project | Hours | Billable | Factuur | Actions│
│                                                     │
│ "Factuur" Column:                                   │
│ [📄 Factuur] (clickable link to invoice)           │
│                                                     │
│ Actions per row:                                    │
│ [✏️ Edit - DISABLED] [📋 Duplicate] [🗑️ Delete - DISABLED]│
│                                                     │
│ Tooltips on disabled actions:                       │
│ "Gefactureerde uren kunnen niet worden bewerkt"    │
│ "Gefactureerde uren kunnen niet worden verwijderd" │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Conditional Display:**
- Only shown if there are invoiced entries
- Otherwise section hidden

---

## Mobile Layout

### Invoice Creation Block
- All fields stack vertically
- Preview box full width
- Button full width

### Time Entries
- Card layout instead of table
- Each entry in its own card
- Actions at bottom of each card
- Same two-section structure maintained

---

## Color Coding

### Status Indicators
- **Billable entries:** Green badge with checkmark
- **Non-billable entries:** Gray badge with X
- **Invoiced entries:** Can't be edited (dimmed action buttons)

### Invoice Creation Block
- Gradient background: primary/accent colors
- Preview box: muted gray background
- Total amount: Primary color, bold

---

## User Flow Example

### Creating an Invoice

**Step 1:** User arrives at Uren page
- Sees "Open uren" section with unbilled entries
- Sees "Facturatie deze week" block at top

**Step 2:** User selects customer
- Dropdown opens, user selects "Acme Corp"
- Preview immediately shows: "12.50h" (unbilled hours for Acme)

**Step 3:** User enters hourly rate
- Types "75.00" in rate field
- Preview updates: "Totaal (excl. BTW): €937.50"

**Step 4:** User adjusts period (optional)
- Default is current week (2024-02-12 to 2024-02-18)
- Can change dates if needed
- Preview recalculates

**Step 5:** User clicks "Maak factuur"
- Button shows spinner: "Factuur aanmaken..."
- Success toast appears: "Factuur succesvol aangemaakt"
- Toast has action button: "Bekijk factuur"
- Form resets to empty state
- Entries refresh automatically

**Step 6:** Entries move
- The 12.50h entries disappear from "Open uren"
- They appear in "Gefactureerde uren" section below
- Each shows "📄 Factuur" link in new column
- Edit/Delete actions are now disabled

**Step 7:** User can verify
- Click "📄 Factuur" link
- Opens invoice detail page
- Shows all linked time entries

---

## Visual Hierarchy

**Most Important (Top):**
1. Invoice creation block (NEW feature)
2. Week navigation
3. Stats summary

**Content (Middle):**
4. Open uren (primary section - where work happens)
5. Gefactureerde uren (archive - read-only)

**Actions (Throughout):**
- Primary: "Maak factuur" (invoice creation)
- Secondary: "Nieuwe registratie" (add entry)
- Tertiary: Edit, Duplicate, Delete (per entry)

---

## Responsive Behavior

### Desktop (> 1024px)
- Full table view
- All columns visible
- Inline action buttons

### Tablet (768px - 1024px)
- Table view
- Some columns hidden
- Action buttons responsive

### Mobile (< 768px)
- Card layout
- Stacked form fields
- Full-width buttons
- Collapsible sections

---

## Accessibility Features

### Keyboard Navigation
- All form fields keyboard accessible
- Tab order follows logical flow
- Enter submits invoice creation

### Screen Readers
- Proper ARIA labels on all inputs
- Status announcements for toast messages
- Disabled state announced for invoiced entries

### Visual Indicators
- Clear disabled state styling
- Tooltips explain why actions disabled
- Error messages for validation

---

## States & Feedback

### Loading States
- Skeleton loaders for initial data fetch
- Spinner in "Maak factuur" button during creation
- Smooth transitions

### Empty States
- "Geen uren gevonden" (no entries at all)
- "Geen open uren" (all invoiced)
- Clear call-to-action: "Voeg uren toe"

### Error States
- Toast notifications for errors
- Form validation messages
- API error messages parsed to Dutch

### Success States
- Toast: "Factuur succesvol aangemaakt"
- Toast: "Uren succesvol toegevoegd"
- Smooth data refresh

---

## Key Differences from Old Design

### Before
- Single table with all entries mixed
- "Create Invoice" opened complex dialog
- Manual entry selection required
- No clear invoicing status
- Could edit invoiced hours (risky!)

### After
- **Two separate sections** (Open vs Gefactureerd)
- **Top-level invoice creation** (no dialog)
- **Automatic entry selection** (by customer/period)
- **Clear visual separation** (invoiced vs not)
- **Protected invoiced hours** (can't edit/delete)
- **Live preview** (see total before creating)
- **Better workflow** (Track → Review → Invoice → Done)

---

## Best Practices for Users

### Daily Workflow
1. Clock in using "Dagstart" card
2. Add time entries as you work
3. Clock out at end of day

### Weekly Invoicing
1. Review "Open uren" section
2. Use "Facturatie deze week" to create invoices
3. Verify in "Gefactureerde uren" section

### Month-End Process
1. Check no unbilled hours remain
2. Export CSV if needed for accounting
3. Review "Gefactureerde uren" for audit trail

---

## Tips & Tricks

### Quick Invoice Creation
- Period auto-fills to current week
- Just select customer + rate + click!
- Most common use case = 2 clicks

### Partial Week Invoicing
- Adjust date range to invoice specific days
- Example: Monday-Wednesday only
- Remaining days stay in "Open uren"

### Multiple Customers
- Create separate invoice for each customer
- Use filters to review customer-specific hours
- Process one at a time

### Corrections Needed?
- If invoice not yet sent: Delete invoice, hours return to "Open"
- If invoice already sent: Duplicate entry, adjust, create credit note
- Never edit invoiced hours directly

---

This redesign provides a production-ready, intuitive interface for ZZP freelancers to manage their time tracking and invoicing in one streamlined workflow.
