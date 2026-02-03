# ZZP Feature Map

**Last Updated:** 2026-02-03  
**Purpose:** Document existing backend endpoints and frontend pages for ZZP product MVP

---

## Backend Endpoints (api/v1)

### 1. Administrations (`/administrations`)
- `POST /administrations` - Create new administration
- `GET /administrations` - List user's administrations
- `GET /administrations/{admin_id}` - Get administration details
- `PATCH /administrations/{admin_id}` - Update administration
- `DELETE /administrations/{admin_id}` - Soft delete administration
- `POST /administrations/{admin_id}/documents/{doc_id}/reprocess` - Reprocess failed document

### 2. Documents (`/documents`)
- `POST /documents/upload` - Upload document (requires `administration_id` form field)
- `GET /documents` - List documents (optional `administration_id`, `status` filters)
- `GET /documents/{document_id}` - Get document details
- `POST /documents/{document_id}/reprocess` - Reprocess failed document

**Document Statuses:** `UPLOADED`, `PROCESSING`, `DRAFT_READY`, `FAILED`

### 3. Transactions (`/transactions`)
- `GET /transactions/stats` - Get transaction statistics (optional `administration_id`)
- `GET /transactions` - List transactions (optional `administration_id`, `status`, pagination)
- `GET /transactions/{transaction_id}` - Get transaction details
- `PUT /transactions/{transaction_id}` - Update draft transaction
- `POST /transactions/{transaction_id}/post` - Post transaction
- `POST /transactions/{transaction_id}/approve` - Alias for post
- `POST /transactions/{transaction_id}/reject` - Delete draft transaction
- `DELETE /transactions/{transaction_id}` - Alias for reject

**Transaction Statuses:** `DRAFT`, `POSTED`

### 4. ZZP Links (`/zzp`)
- `GET /zzp/links` - Get pending accountant link requests
- `POST /zzp/links/{assignment_id}/approve` - Approve accountant access
- `POST /zzp/links/{assignment_id}/reject` - Reject accountant access

### 5. Auth (`/auth`)
- `POST /auth/register` - Register new user
- `POST /auth/token` - Login
- `GET /auth/me` - Get current user info
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token
- `GET /auth/verify-email` - Verify email address
- `POST /auth/resend-verification` - Resend verification email

---

## Frontend Pages/Components

### ZZP Pages
| Page | Route | Component | Status | Notes |
|------|-------|-----------|--------|-------|
| Dashboard | `/dashboard` | `SmartDashboard.tsx` | ✅ Working | Shows stats, recent transactions |
| Slimme transacties | `/transactions` | `SmartTransactionList.tsx` | ✅ Working | List with search/filter |
| AI Upload | `/ai-upload` | `IntelligentUploadPortal.tsx` | ✅ Working | Upload + document list |
| Boekhouder | `/dashboard/boekhouder` | `ZZPAccountantLinksPage.tsx` | ✅ Working | Consent workflow |
| Instellingen | `/settings` | `SettingsPage.tsx` | ✅ Working | Profile + notifications |
| Ondersteuning | `/support` | `SupportPage.tsx` | ✅ Working | Help page |
| Onboarding | `/onboarding` | `OnboardingPage.tsx` | ✅ Working | Creates first administration |

### Shared Components
- `AppShell.tsx` - Main layout with sidebar navigation
- `EmptyState.tsx` - Empty state components with CTAs
- `ApiErrorState.tsx` - Error display component

---

## ZZP MVP Navigation (Proposed)

**Current ZZP sidebar items:**
1. Dashboard
2. Slimme transacties
3. AI Upload
4. Boekhouder
5. Instellingen
6. Ondersteuning

**Proposed ZZP MVP sidebar (Dutch-first, minimal):**
1. **Overzicht** (Dashboard) - `/dashboard`
2. **Documenten** (AI Upload + document list) - `/ai-upload`
3. **Boekingen** (Transactions + stats) - `/transactions`
4. **Boekhouder** (Consent/links) - `/dashboard/boekhouder`
5. **Instellingen** - `/settings`
6. **Uitloggen** (Logout button)

**Hidden/Removed:**
- Ondersteuning (can be accessed via Instellingen or footer link)

---

## Active Administration Context

**Problem:** ZZP users can't do anything meaningful unless an administration exists/is selected.

**Solution:**
1. Check if user has administration on app load (already done in App.tsx)
2. Auto-redirect to `/onboarding` if no administrations
3. Store `activeAdministrationId` in context + localStorage
4. Pass `administration_id` to all API calls that need it

**Current Implementation:**
- App.tsx already checks administrations and redirects to onboarding
- Documents API auto-selects first administration if none specified
- Transaction stats API auto-filters to user's administrations

**Enhancement Needed:**
- Create `ActiveAdministrationContext` similar to `ActiveClientContext`
- Add guard component `RequireActiveAdministration`

---

## Missing Endpoints

**None identified** - All necessary endpoints for ZZP MVP exist:
- ✅ Create/list administrations
- ✅ Upload documents
- ✅ List documents with status
- ✅ Reprocess failed documents
- ✅ List transactions
- ✅ Get transaction stats
- ✅ Manage accountant links

---

## Dutch Translation Keys Needed

The following new translation keys should be added to `nl.ts`:
- `sidebar.overzicht` - "Overzicht"
- `sidebar.documenten` - "Documenten"  
- `sidebar.boekingen` - "Boekingen"
- `sidebar.boekhouderLinks` - "Boekhouder"

---

## Verification Checklist

- [ ] Register/login as ZZP user
- [ ] Onboarding creates/selects administratie
- [ ] Documenten page shows upload + list
- [ ] Boekingen shows stats/list
- [ ] Boekhouder-koppelingen page works
- [ ] Logout works
- [ ] Accountant flow unaffected
