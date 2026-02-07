# ZZP Portal Roadmap & Data Model Specification

**Last Updated:** 2026-02-07  
**Status:** Planning / Specification (No implementation yet)  
**Author:** Automated via Copilot

---

## Executive Summary

This document outlines the phased roadmap and minimal data model updates needed to complete the ZZP portal functionality in Smart Accounting. The specification covers:
1. Customer (Klant) form enhancements with optional business fields
2. Invoice (Factuur) completion with Business Profile integration
3. New ZZP modules: Expenses, Time Tracking, and Calendar

---

## Current State Analysis

### Existing Entities & Models

#### Backend Models (`backend/app/models/`)
| Model | File | Purpose | ZZP Relevance |
|-------|------|---------|---------------|
| `Administration` | `administration.py` | Company/business container | ✅ Contains KVK, BTW |
| `AdministrationMember` | `administration.py` | User-admin relationship | ✅ Ownership |
| `User` | `user.py` | User accounts | ✅ Core auth |
| `Transaction` | `transaction.py` | Financial transactions | ✅ Bookings |
| `Document` | `document.py` | Uploaded documents | ✅ AI Upload |
| `ChartOfAccount` | `accounting.py` | Ledger accounts | ⚠️ Accountant-focused |
| `VatCode` | `accounting.py` | BTW codes | ✅ Invoice VAT |
| `Party` | Ledger module | Customers/Suppliers | ❌ Not exposed to ZZP |

#### Frontend Storage (`src/lib/storage/zzp.ts`)
| Entity | Storage | Backend API | Notes |
|--------|---------|-------------|-------|
| `Customer` | localStorage | ❌ None | Frontend-only, limited fields |
| `Invoice` | localStorage | ❌ None | Frontend-only, no seller details |

#### Current Customer Fields (Frontend)
```typescript
interface Customer {
  id: string
  name: string           // Required
  email?: string         // Optional
  phone?: string         // Optional
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
}
```

**Missing fields per ZZP requirements:**
- `iban?: string` — Bank account (IBAN)
- `address?: string` — Address
- `kvk_number?: string` — KVK number
- `btw_number?: string` — BTW/VAT ID

#### Current Invoice Fields (Frontend)
```typescript
interface Invoice {
  id: string
  number: string
  customerId: string
  date: string
  dueDate?: string
  amountCents: number
  currency: 'EUR'
  status: 'draft' | 'sent' | 'paid' | 'overdue'
  notes?: string
  createdAt: string
  updatedAt: string
}
```

**Missing fields per ZZP requirements:**
- No seller/company profile snapshot
- No invoice line items
- No tax breakdown (BTW)
- No payment terms

### Existing API Endpoints

| Endpoint | Method | Purpose | ZZP Status |
|----------|--------|---------|------------|
| `/api/v1/administrations` | CRUD | Manage administrations | ✅ Used |
| `/api/v1/documents` | CRUD | Document upload/processing | ✅ Used |
| `/api/v1/transactions` | CRUD | Transaction management | ✅ Used |
| `/api/v1/zzp/links` | GET/POST | Accountant consent | ✅ Used |
| `/api/v1/auth/*` | Various | Authentication | ✅ Used |

**Missing endpoints:**
- `/api/v1/zzp/customers` — Customer CRUD
- `/api/v1/zzp/invoices` — Invoice CRUD
- `/api/v1/zzp/company-profile` — Business Profile CRUD
- `/api/v1/zzp/expenses` — Expense CRUD (Phase 3)
- `/api/v1/zzp/time-entries` — Time tracking CRUD (Phase 3)

### Existing Frontend Routes & Sidebar

**Current ZZP Sidebar Items (`AppShell.tsx`):**
1. Overzicht (Dashboard) — `/dashboard`
2. Documenten (AI Upload) — `/ai-upload`
3. Boekingen (Transactions) — `/transactions`
4. Boekhouder (Consent) — `/dashboard/boekhouder`
5. Klanten (Customers) — `/zzp/customers`
6. Facturen (Invoices) — `/zzp/invoices`
7. Instellingen (Settings) — `/settings`

**Missing ZZP Sidebar Items:**
- Uitgaven (Expenses) — `/zzp/expenses`
- Uren (Time Tracking) — `/zzp/time`
- Agenda (Calendar) — `/zzp/agenda`

---

## Phased Roadmap

### Phase 1: Customer + Invoice Completeness

**Goal:** Expand Customer entity with all optional fields and ensure invoices can fully capture customer + seller details.

#### 1.1 Customer Entity Enhancement

**New Customer Fields:**
| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| `name` | string | ✅ Yes | min 1, max 255 | Existing |
| `email` | string | No | Email format | Existing |
| `phone` | string | No | max 20 | Existing |
| `status` | enum | ✅ Yes | active/inactive | Existing |
| `iban` | string | No | IBAN format (NL00AAAA0000000000, 18 chars) | **NEW** |
| `address` | text | No | max 500 | **NEW** |
| `kvk_number` | string | No | 8 digits | **NEW** |
| `btw_number` | string | No | NL000000000B00 format (14 chars) | **NEW** |

**Files to Change:**
1. `src/lib/storage/zzp.ts` — Add new fields to Customer interface
2. `src/components/ZZPCustomersPage.tsx` — Add form fields (IBAN, address, KVK, BTW)
3. `src/i18n/nl.ts` — Add Dutch translations for new fields

#### 1.2 Invoice Entity Enhancement

**New Invoice Fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `lines` | InvoiceLine[] | ✅ Yes | Line items array |
| `subtotalCents` | number | ✅ Yes | Sum before tax |
| `vatAmountCents` | number | ✅ Yes | Total VAT |
| `vatRate` | number | ✅ Yes | Default 21% |
| `paymentTermDays` | number | No | Default 30 |
| `sellerSnapshot` | BusinessProfileSnapshot | ✅ Yes | Frozen seller details at creation |
| `customerSnapshot` | CustomerSnapshot | ✅ Yes | Frozen customer details at creation |

**InvoiceLine Type:**
```typescript
interface InvoiceLine {
  id: string
  description: string
  quantity: number
  unitPriceCents: number
  vatRate: number       // 0, 9, or 21
  totalCents: number    // quantity * unitPrice
}
```

**Snapshot Types:**
```typescript
interface BusinessProfileSnapshot {
  companyName: string
  address?: string
  kvk_number?: string
  btw_number?: string
  iban?: string
  email?: string
  phone?: string
  logoUrl?: string
}

interface CustomerSnapshot {
  name: string
  address?: string
  kvk_number?: string
  btw_number?: string
  email?: string
}
```

**Files to Change:**
1. `src/lib/storage/zzp.ts` — Add new Invoice fields, line items, snapshots
2. `src/components/ZZPInvoicesPage.tsx` — Add invoice line item UI, preview
3. `src/i18n/nl.ts` — Add Dutch translations

---

### Phase 2: Business Profile Settings

**Goal:** Add Company Profile / Business Profile section in Settings that stores seller details used on invoices.

#### 2.1 Business Profile Entity

**New Entity: BusinessProfile**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | UUID | ✅ Yes | Primary key |
| `administration_id` | UUID FK | ✅ Yes | Links to Administration |
| `company_name` | string | ✅ Yes | Business name |
| `address` | text | No | Full address |
| `city` | string | No | City |
| `postal_code` | string | No | Postcode |
| `country` | string | No | Default "Nederland" |
| `kvk_number` | string | No | KVK number |
| `btw_number` | string | No | BTW number |
| `iban` | string | No | Bank IBAN |
| `email` | string | No | Contact email |
| `phone` | string | No | Contact phone |
| `website` | string | No | Website URL |
| `logo_url` | string | No | Logo storage path |
| `default_payment_terms` | int | No | Default days (30) |
| `default_vat_rate` | decimal | No | Default VAT % (21) |
| `invoice_notes` | text | No | Default invoice footer |
| `created_at` | timestamp | ✅ Yes | |
| `updated_at` | timestamp | ✅ Yes | |

**Storage Strategy:**
- **Phase 2A (MVP):** Frontend localStorage per user (like current Customer/Invoice)
- **Phase 4:** Backend PostgreSQL with Alembic migration

**Files to Change (Phase 2A - Frontend):**
1. `src/lib/storage/zzp.ts` — Add BusinessProfile interface and CRUD functions
2. `src/components/SettingsPage.tsx` — Add "Bedrijfsprofiel" tab/section
3. `src/i18n/nl.ts` — Add Dutch translations for business profile fields
4. `src/components/ZZPInvoicesPage.tsx` — Use business profile for seller snapshot

---

### Phase 3: New ZZP Modules (Shell Implementation)

**Goal:** Add placeholder pages and routes for Expenses, Time Tracking, and Calendar. UI shells only, no full functionality.

#### 3.1 Expenses (Uitgaven)

**Route:** `/zzp/expenses`  
**Tab Value:** `expenses`

**Shell Features:**
- Page header with title "Uitgaven"
- Empty state with CTA to "Add first expense"
- Stats cards (Total, This Month, Pending)
- Placeholder table structure

**Expense Entity (Future):**
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | UUID |
| `date` | string | Expense date |
| `description` | string | What was purchased |
| `amountCents` | number | Amount in cents |
| `category` | string | Expense category |
| `vatRate` | number | VAT rate paid |
| `documentId` | string | Optional linked receipt |
| `status` | enum | draft, submitted, approved |

#### 3.2 Time Tracking (Uren)

**Route:** `/zzp/time`  
**Tab Value:** `time`

**Shell Features:**
- Page header with title "Uren"
- Empty state with CTA to "Start tracking"
- Weekly summary card
- Placeholder timer UI

**TimeEntry Entity (Future):**
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | UUID |
| `date` | string | Entry date |
| `customerId` | string | Optional customer link |
| `projectName` | string | Project/task |
| `description` | string | Work description |
| `hours` | number | Hours worked |
| `hourlyRateCents` | number | Rate if billable |
| `isBillable` | boolean | Can be invoiced |

#### 3.3 Calendar (Agenda)

**Route:** `/zzp/agenda`  
**Tab Value:** `agenda`

**Shell Features:**
- Page header with title "Agenda"
- Monthly calendar grid (read-only)
- Placeholder event cards
- Coming soon message

**Files to Create:**
1. `src/components/ZZPExpensesPage.tsx` — Expenses shell page
2. `src/components/ZZPTimePage.tsx` — Time tracking shell page
3. `src/components/ZZPAgendaPage.tsx` — Calendar shell page

**Files to Change:**
1. `src/components/AppShell.tsx` — Add sidebar items for new modules
2. `src/App.tsx` — Add routes and tab mappings
3. `src/i18n/nl.ts` — Add translations for new modules

---

### Phase 4: Backend Integration

**Goal:** Migrate localStorage entities to PostgreSQL with full backend CRUD APIs.

#### 4.1 Database Migrations

**Migration 016: ZZP Customers**
```sql
-- 016_zzp_customers.py
CREATE TABLE zzp_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    administration_id UUID NOT NULL REFERENCES administrations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    iban VARCHAR(34),
    address TEXT,
    kvk_number VARCHAR(8),
    btw_number VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_zzp_customers_admin ON zzp_customers(administration_id);
```

**Migration 017: Business Profiles**
```sql
-- 017_business_profiles.py
CREATE TABLE business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    administration_id UUID UNIQUE NOT NULL REFERENCES administrations(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    postal_code VARCHAR(10),
    country VARCHAR(100) DEFAULT 'Nederland',
    kvk_number VARCHAR(8),
    btw_number VARCHAR(20),
    iban VARCHAR(34),
    email VARCHAR(255),
    phone VARCHAR(20),
    website VARCHAR(255),
    logo_url TEXT,
    default_payment_terms INTEGER DEFAULT 30,
    default_vat_rate DECIMAL(5,2) DEFAULT 21.00,
    invoice_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration 018: ZZP Invoices**
```sql
-- 018_zzp_invoices.py
CREATE TABLE zzp_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    administration_id UUID NOT NULL REFERENCES administrations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES zzp_customers(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(50) NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    subtotal_cents BIGINT NOT NULL DEFAULT 0,
    vat_amount_cents BIGINT NOT NULL DEFAULT 0,
    total_cents BIGINT NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'EUR',
    payment_term_days INTEGER DEFAULT 30,
    notes TEXT,
    -- Snapshot data (JSON for flexibility)
    seller_snapshot JSONB NOT NULL,
    customer_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(administration_id, invoice_number)
);
CREATE INDEX idx_zzp_invoices_admin ON zzp_invoices(administration_id);
CREATE INDEX idx_zzp_invoices_customer ON zzp_invoices(customer_id);

CREATE TABLE zzp_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES zzp_invoices(id) ON DELETE CASCADE,
    line_order INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price_cents BIGINT NOT NULL,
    vat_rate DECIMAL(5,2) NOT NULL DEFAULT 21.00,
    line_total_cents BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_invoice_lines_invoice ON zzp_invoice_lines(invoice_id);
```

**Migration 019: ZZP Expenses (Future)**
```sql
-- 019_zzp_expenses.py
CREATE TABLE zzp_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    administration_id UUID NOT NULL REFERENCES administrations(id) ON DELETE CASCADE,
    expense_date DATE NOT NULL,
    description VARCHAR(500) NOT NULL,
    amount_cents BIGINT NOT NULL,
    vat_rate DECIMAL(5,2),
    vat_amount_cents BIGINT,
    category VARCHAR(100),
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_zzp_expenses_admin ON zzp_expenses(administration_id);
```

**Migration 020: ZZP Time Entries (Future)**
```sql
-- 020_zzp_time_entries.py
CREATE TABLE zzp_time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    administration_id UUID NOT NULL REFERENCES administrations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES zzp_customers(id) ON DELETE SET NULL,
    entry_date DATE NOT NULL,
    project_name VARCHAR(255),
    description TEXT,
    hours DECIMAL(5,2) NOT NULL,
    hourly_rate_cents BIGINT,
    is_billable BOOLEAN DEFAULT true,
    invoice_id UUID REFERENCES zzp_invoices(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_zzp_time_entries_admin ON zzp_time_entries(administration_id);
CREATE INDEX idx_zzp_time_entries_customer ON zzp_time_entries(customer_id);
```

#### 4.2 API Endpoint Contracts

**ZZP Customers API:**
```
GET    /api/v1/zzp/customers                 → List customers
POST   /api/v1/zzp/customers                 → Create customer
GET    /api/v1/zzp/customers/{id}            → Get customer
PUT    /api/v1/zzp/customers/{id}            → Update customer
DELETE /api/v1/zzp/customers/{id}            → Delete customer (soft)
```

**Request/Response Schemas:**
```python
# CustomerCreate
{
    "name": str,           # Required, max 255
    "email": str | None,   # Optional, email format
    "phone": str | None,   # Optional, max 20
    "iban": str | None,    # Optional, IBAN format
    "address": str | None, # Optional, max 500
    "kvk_number": str | None,  # Optional, 8 digits
    "btw_number": str | None,  # Optional, NL format
    "status": "active" | "inactive"  # Default: active
}

# CustomerResponse
{
    "id": UUID,
    "administration_id": UUID,
    "name": str,
    "email": str | None,
    "phone": str | None,
    "iban": str | None,
    "address": str | None,
    "kvk_number": str | None,
    "btw_number": str | None,
    "status": str,
    "created_at": datetime,
    "updated_at": datetime
}
```

**Business Profile API:**
```
GET    /api/v1/zzp/company-profile           → Get profile (creates if not exists)
PUT    /api/v1/zzp/company-profile           → Update profile
POST   /api/v1/zzp/company-profile/logo      → Upload logo
DELETE /api/v1/zzp/company-profile/logo      → Remove logo
```

**Request/Response Schemas:**
```python
# BusinessProfileUpdate
{
    "company_name": str,         # Required, max 255
    "address": str | None,
    "city": str | None,
    "postal_code": str | None,
    "country": str | None,
    "kvk_number": str | None,
    "btw_number": str | None,
    "iban": str | None,
    "email": str | None,
    "phone": str | None,
    "website": str | None,
    "default_payment_terms": int | None,
    "default_vat_rate": Decimal | None,
    "invoice_notes": str | None
}

# BusinessProfileResponse
{
    "id": UUID,
    "administration_id": UUID,
    ...all fields...,
    "logo_url": str | None,
    "created_at": datetime,
    "updated_at": datetime
}
```

**ZZP Invoices API:**
```
GET    /api/v1/zzp/invoices                  → List invoices (paginated)
POST   /api/v1/zzp/invoices                  → Create invoice
GET    /api/v1/zzp/invoices/{id}             → Get invoice with lines
PUT    /api/v1/zzp/invoices/{id}             → Update invoice (draft only)
DELETE /api/v1/zzp/invoices/{id}             → Delete invoice (draft only)
POST   /api/v1/zzp/invoices/{id}/send        → Mark as sent
POST   /api/v1/zzp/invoices/{id}/paid        → Mark as paid
GET    /api/v1/zzp/invoices/{id}/pdf         → Generate PDF
```

**Request/Response Schemas:**
```python
# InvoiceLineCreate
{
    "description": str,
    "quantity": Decimal,
    "unit_price_cents": int,
    "vat_rate": Decimal  # 0, 9, or 21
}

# InvoiceCreate
{
    "customer_id": UUID,
    "invoice_date": date,
    "due_date": date | None,
    "payment_term_days": int | None,
    "notes": str | None,
    "lines": [InvoiceLineCreate]
}

# InvoiceResponse
{
    "id": UUID,
    "invoice_number": str,  # Auto-generated
    "customer_id": UUID,
    "invoice_date": date,
    "due_date": date,
    "status": str,
    "subtotal_cents": int,
    "vat_amount_cents": int,
    "total_cents": int,
    "currency": str,
    "payment_term_days": int,
    "notes": str | None,
    "seller_snapshot": BusinessProfileSnapshot,
    "customer_snapshot": CustomerSnapshot,
    "lines": [InvoiceLineResponse],
    "created_at": datetime,
    "updated_at": datetime
}
```

#### 4.3 Backend Files to Create

```
backend/app/models/zzp.py           # New models: ZZPCustomer, BusinessProfile, ZZPInvoice, etc.
backend/app/schemas/zzp.py          # Pydantic schemas for ZZP entities
backend/app/api/v1/zzp_customers.py # Customer CRUD endpoints
backend/app/api/v1/zzp_profile.py   # Business Profile endpoints
backend/app/api/v1/zzp_invoices.py  # Invoice CRUD endpoints
backend/app/services/zzp_invoice_service.py  # Invoice number generation, PDF generation
```

---

## Implementation Order & Risk Notes

### Recommended Implementation Sequence

| Order | Task | Dependencies | Risk Level | Notes |
|-------|------|--------------|------------|-------|
| 1 | Phase 1.1: Customer fields enhancement (frontend) | None | 🟢 Low | Non-breaking, additive |
| 2 | Phase 2A: Business Profile (frontend localStorage) | None | 🟢 Low | New entity, isolated |
| 3 | Phase 1.2: Invoice fields + line items (frontend) | Phase 2A | 🟡 Medium | Requires business profile for seller snapshot |
| 4 | Phase 3: New module shells (frontend) | None | 🟢 Low | UI only, no data |
| 5 | Phase 4.1: DB migrations | None | 🟡 Medium | Must be idempotent, backward compatible |
| 6 | Phase 4.2: Customer API | Migration 016 | 🟢 Low | Standard CRUD |
| 7 | Phase 4.3: Business Profile API | Migration 017 | 🟢 Low | Standard CRUD |
| 8 | Phase 4.4: Invoice API | Migrations 017, 018 | 🟡 Medium | Complex with snapshots, PDF generation |
| 9 | Frontend → Backend migration | All backend APIs | 🔴 High | Data migration from localStorage |

### Risk Analysis

**🟢 Low Risk Items:**
- Adding optional fields to existing entities
- Creating new shell pages without functionality
- Adding new sidebar items

**🟡 Medium Risk Items:**
- Invoice line items (complex UI)
- Snapshot mechanism (data consistency)
- Invoice number generation (uniqueness)
- PDF generation (external library needed)

**🔴 High Risk Items:**
- localStorage → PostgreSQL migration
  - Risk: Data loss if not carefully handled
  - Mitigation: Export/import flow, gradual rollout
- Invoice status transitions
  - Risk: Invalid state changes
  - Mitigation: State machine validation

### Backward Compatibility Notes

1. **All migrations use `IF NOT EXISTS`** — Safe to re-run
2. **New columns are nullable** — No breaking changes to existing data
3. **Frontend localStorage unaffected** — Backend migration is additive
4. **API versioning** — All new endpoints under `/api/v1/zzp/`

---

## Summary: Files to Change

### Frontend Files

| File | Change Type | Phase |
|------|-------------|-------|
| `src/lib/storage/zzp.ts` | Edit | 1, 2 |
| `src/components/ZZPCustomersPage.tsx` | Edit | 1 |
| `src/components/ZZPInvoicesPage.tsx` | Edit | 1 |
| `src/components/SettingsPage.tsx` | Edit | 2 |
| `src/components/ZZPExpensesPage.tsx` | Create | 3 |
| `src/components/ZZPTimePage.tsx` | Create | 3 |
| `src/components/ZZPAgendaPage.tsx` | Create | 3 |
| `src/components/AppShell.tsx` | Edit | 3 |
| `src/App.tsx` | Edit | 3 |
| `src/i18n/nl.ts` | Edit | 1, 2, 3 |

### Backend Files

| File | Change Type | Phase |
|------|-------------|-------|
| `backend/alembic/versions/016_zzp_customers.py` | Create | 4 |
| `backend/alembic/versions/017_business_profiles.py` | Create | 4 |
| `backend/alembic/versions/018_zzp_invoices.py` | Create | 4 |
| `backend/alembic/versions/019_zzp_expenses.py` | Create | 4 (future) |
| `backend/alembic/versions/020_zzp_time_entries.py` | Create | 4 (future) |
| `backend/app/models/zzp.py` | Create | 4 |
| `backend/app/schemas/zzp.py` | Create | 4 |
| `backend/app/api/v1/zzp_customers.py` | Create | 4 |
| `backend/app/api/v1/zzp_profile.py` | Create | 4 |
| `backend/app/api/v1/zzp_invoices.py` | Create | 4 |
| `backend/app/services/zzp_invoice_service.py` | Create | 4 |
| `backend/app/api/v1/__init__.py` | Edit | 4 |
| `backend/app/main.py` | Edit | 4 |

---

## Appendix: Dutch Translations Needed

```typescript
// To add to src/i18n/nl.ts

// Customer form fields (Phase 1)
zzpCustomers: {
  // ... existing ...
  formIban: "IBAN",
  formIbanPlaceholder: "NL00BANK0123456789",
  formAddress: "Adres",
  formAddressPlaceholder: "Straat, nummer, postcode, plaats",
  formKvk: "KVK-nummer",
  formKvkPlaceholder: "12345678",
  formBtw: "BTW-nummer",
  formBtwPlaceholder: "NL123456789B01",
  formIbanInvalid: "Ongeldig IBAN-formaat",
  formKvkInvalid: "KVK-nummer moet 8 cijfers zijn",
  formBtwInvalid: "Ongeldig BTW-nummerformaat",
}

// Business profile (Phase 2)
businessProfile: {
  title: "Bedrijfsprofiel",
  subtitle: "Gegevens voor je facturen",
  companyName: "Bedrijfsnaam",
  address: "Adres",
  city: "Plaats",
  postalCode: "Postcode",
  country: "Land",
  kvkNumber: "KVK-nummer",
  btwNumber: "BTW-nummer",
  iban: "IBAN",
  email: "E-mailadres",
  phone: "Telefoonnummer",
  website: "Website",
  logo: "Logo",
  uploadLogo: "Logo uploaden",
  removeLogo: "Logo verwijderen",
  defaultPaymentTerms: "Standaard betalingstermijn (dagen)",
  defaultVatRate: "Standaard BTW-tarief (%)",
  invoiceNotes: "Standaard factuurvoettekst",
  saveProfile: "Profiel opslaan",
  profileSaved: "Bedrijfsprofiel opgeslagen",
}

// Invoice enhancements (Phase 1-2)
zzpInvoices: {
  // ... existing ...
  addLine: "Regel toevoegen",
  removeLine: "Regel verwijderen",
  lineDescription: "Omschrijving",
  lineQuantity: "Aantal",
  lineUnitPrice: "Prijs per stuk",
  lineVatRate: "BTW %",
  lineTotal: "Totaal",
  subtotal: "Subtotaal",
  vatAmount: "BTW",
  totalAmount: "Totaal incl. BTW",
  paymentTerms: "Betalingstermijn",
  days: "dagen",
  sellerDetails: "Afzendergegevens",
  customerDetails: "Klantgegevens",
  previewInvoice: "Factuur bekijken",
  downloadPdf: "Download PDF",
  markAsSent: "Markeer als verzonden",
  markAsPaid: "Markeer als betaald",
}

// New modules (Phase 3)
sidebar: {
  // ... existing ...
  uitgaven: "Uitgaven",
  uren: "Uren",
  agenda: "Agenda",
}

zzpExpenses: {
  title: "Uitgaven",
  pageDescription: "Beheer je zakelijke uitgaven",
  noExpenses: "Nog geen uitgaven",
  noExpensesDescription: "Voeg je eerste uitgave toe om te beginnen.",
  addFirstExpense: "Eerste uitgave toevoegen",
  newExpense: "Nieuwe uitgave",
  comingSoon: "Binnenkort beschikbaar",
  comingSoonDescription: "De uitgavenmodule wordt momenteel ontwikkeld.",
}

zzpTime: {
  title: "Uren",
  pageDescription: "Registreer je gewerkte uren",
  noTimeEntries: "Nog geen uren geregistreerd",
  noTimeEntriesDescription: "Begin met het bijhouden van je tijd.",
  startTracking: "Start tijdregistratie",
  comingSoon: "Binnenkort beschikbaar",
  comingSoonDescription: "De urenmodule wordt momenteel ontwikkeld.",
}

zzpAgenda: {
  title: "Agenda",
  pageDescription: "Bekijk je planning",
  comingSoon: "Binnenkort beschikbaar",
  comingSoonDescription: "De agendamodule wordt momenteel ontwikkeld.",
}
```

---

## Next Steps

1. **Review this specification** with stakeholders
2. **Prioritize phases** based on business needs
3. **Begin Phase 1** — Customer field enhancements (lowest risk, immediate value)
4. **Iterate** — Each phase can be deployed independently

**Questions for Product:**
- Should expenses link to bank transactions?
- Should time entries auto-generate invoice lines?
- Calendar integration with external calendars (Google, Outlook)?
- PDF invoice template customization level?
