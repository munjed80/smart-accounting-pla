# Client Linking & Consent Workflow - Implementation Summary

## ✅ COMPLETED WORK

### Backend Implementation (100% Complete)

#### 1. Database Schema & Models ✅
**File:** `backend/alembic/versions/013_client_consent_workflow.py`
- Added consent workflow fields to `AccountantClientAssignment` table:
  - `client_user_id` - References the ZZP user
  - `status` - ENUM (PENDING, ACTIVE, REVOKED)
  - `invited_by` - ENUM (ACCOUNTANT, ADMIN)
  - `approved_at`, `revoked_at` - Timestamps
- Migration backfills existing records as ACTIVE for backward compatibility
- Adds necessary indexes and foreign keys

**File:** `backend/app/models/accountant_dashboard.py`
- Updated `AccountantClientAssignment` model with new enums
- Added comprehensive docstrings explaining workflow
- Clear separation of IDs: accountant_id, client_user_id, administration_id

#### 2. API Endpoints ✅
**File:** `backend/app/api/v1/accountant_dashboard.py`
- `POST /api/v1/accountant/clients/invite` - Accountant invites ZZP by email (idempotent)
- `GET /api/v1/accountant/clients/links` - List PENDING + ACTIVE clients with status

**File:** `backend/app/api/v1/zzp.py` (NEW)
- `GET /api/v1/zzp/links` - ZZP views pending requests
- `POST /api/v1/zzp/links/{assignment_id}/approve` - ZZP approves link
- `POST /api/v1/zzp/links/{assignment_id}/reject` - ZZP rejects link

**File:** `backend/app/main.py`
- Registered ZZP router at `/api/v1/zzp`

#### 3. Security Enforcement ✅
**File:** `backend/app/api/v1/deps.py`
- Updated `require_assigned_client()` to check ACTIVE status
- Only ACTIVE assignments grant access to client data
- PENDING assignments return `PENDING_APPROVAL` error (403)
- REVOKED assignments return `ACCESS_REVOKED` error (403)

#### 4. Schemas ✅
**File:** `backend/app/schemas/accountant_dashboard.py`
- `InviteClientRequest`, `InviteClientResponse`
- `ClientLinkItem`, `AccountantClientLinksResponse`
- `PendingLinkRequest`, `ZZPLinksResponse`
- `ApproveLinkResponse`, `RejectLinkResponse`

#### 5. Tests ✅
**File:** `backend/tests/test_consent_workflow.py`
- 20 comprehensive tests covering:
  - Idempotent invitations
  - ZZP approve/reject workflows
  - Access control with consent status
  - Bulk operations validation
  - Error scenarios
- **All tests passing** ✅

### Frontend Foundation (80% Complete)

#### 1. ActiveClientContext ✅
**File:** `src/lib/ActiveClientContext.tsx`
- Manages accountant's active client selection
- Auto-selects first ACTIVE client on login
- Validates client is still ACTIVE
- localStorage persistence
- Provides: activeClient, activeClients, pendingCount, setActiveClient, refreshLinks

#### 2. API Client ✅
**File:** `src/lib/api.ts`
- Added TypeScript interfaces for all new endpoints
- `accountantApi.inviteClient()`
- `accountantApi.getClientLinks()`
- `zzpApi.getPendingLinks()`
- `zzpApi.approveLink()`
- `zzpApi.rejectLink()`

#### 3. App Integration ✅
**File:** `src/App.tsx`
- Wrapped `AppContent` with `ActiveClientProvider`
- Context available throughout the app

---

## 🔧 REMAINING WORK (Frontend UI Components)

### STEP F: Accountant Client Management UI

**What's needed:**
1. **New page:** `/accountant/clients` 
   - Create `src/components/AccountantClientsPage.tsx`
   - Two tabs: "Actief" and "In afwachting"
   - Show client links from `useActiveClient().allLinks`
   - Filter by status for each tab

2. **Add Client Form:**
   - Email input field
   - Call `accountantApi.inviteClient({ email })`
   - Show success/error toasts
   - Refresh list after invite

3. **Client Selection:**
   - Click on ACTIVE client → `setActiveClient(client)`
   - Navigate to `/accountant/review-queue` or dashboard

4. **Active Client Indicator:**
   - Add to AppShell/Header: "Actieve klant: {activeClient.name}"
   - Button to change → navigate to `/accountant/clients`

**Example Implementation:**
```typescript
// src/components/AccountantClientsPage.tsx
import { useActiveClient } from '@/lib/ActiveClientContext'
import { accountantApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export const AccountantClientsPage = () => {
  const { allLinks, setActiveClient, refreshLinks, activeClient } = useActiveClient()
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  const activeLinks = allLinks.filter(l => l.status === 'ACTIVE')
  const pendingLinks = allLinks.filter(l => l.status === 'PENDING')

  const handleInvite = async () => {
    setInviting(true)
    try {
      const result = await accountantApi.inviteClient({ email })
      toast.success(result.message)
      setEmail('')
      await refreshLinks()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setInviting(false)
    }
  }

  const handleSelectClient = (link: ClientLink) => {
    setActiveClient({
      id: link.client_user_id,
      name: link.client_name,
      email: link.client_email,
      administrationId: link.administration_id,
      administrationName: link.administration_name,
    })
    navigateTo('/accountant/review-queue')
  }

  return (
    <div>
      <h1>Klanten Beheer</h1>
      
      {/* Invite Form */}
      <div className="mb-4">
        <Input 
          value={email} 
          onChange={e => setEmail(e.target.value)}
          placeholder="E-mail van ZZP klant"
        />
        <Button onClick={handleInvite} disabled={inviting}>
          Klant toevoegen
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Actief ({activeLinks.length})</TabsTrigger>
          <TabsTrigger value="pending">In afwachting ({pendingLinks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {activeLinks.map(link => (
            <div key={link.assignment_id} onClick={() => handleSelectClient(link)}>
              <h3>{link.client_name}</h3>
              <p>{link.client_email}</p>
              <p>Rood: {link.open_red_count}, Geel: {link.open_yellow_count}</p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="pending">
          {pendingLinks.map(link => (
            <div key={link.assignment_id}>
              <h3>{link.client_name}</h3>
              <p>Wacht op goedkeuring...</p>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### STEP G: ZZP Consent UI

**What's needed:**
1. **New page:** `/zzp/links` or add to ZZP sidebar
   - Create `src/components/ZZPAccountantLinksPage.tsx`
   - Show pending requests from `zzpApi.getPendingLinks()`
   - Display accountant name, email
   - Approve/Reject buttons

**Example Implementation:**
```typescript
// src/components/ZZPAccountantLinksPage.tsx
import { zzpApi } from '@/lib/api'
import { Button } from '@/components/ui/button'

export const ZZPAccountantLinksPage = () => {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLinks()
  }, [])

  const loadLinks = async () => {
    const response = await zzpApi.getPendingLinks()
    setLinks(response.pending_requests)
    setLoading(false)
  }

  const handleApprove = async (assignmentId: string) => {
    try {
      const result = await zzpApi.approveLink(assignmentId)
      toast.success(result.message)
      await loadLinks()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const handleReject = async (assignmentId: string) => {
    try {
      const result = await zzpApi.rejectLink(assignmentId)
      toast.success(result.message)
      await loadLinks()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <div>
      <h1>Boekhouder Koppelingen</h1>
      
      {links.map(link => (
        <div key={link.assignment_id}>
          <h3>{link.accountant_name}</h3>
          <p>{link.accountant_email}</p>
          <p>Administratie: {link.administration_name}</p>
          
          <Button onClick={() => handleApprove(link.assignment_id)}>
            Goedkeuren
          </Button>
          <Button onClick={() => handleReject(link.assignment_id)} variant="outline">
            Afwijzen
          </Button>
        </div>
      ))}
    </div>
  )
}
```

### STEP H: Dutch UX Polish

**What's needed:**
1. **Translation file:** `src/i18n/nl.ts`
   - Add Dutch error code mappings:
   ```typescript
   {
     NOT_ASSIGNED: "Geen toegang tot deze klant.",
     PENDING_APPROVAL: "Toegang is in afwachting van goedkeuring.",
     ACCESS_REVOKED: "Toegang is ingetrokken.",
     USER_NOT_FOUND: "Geen gebruiker gevonden met dit e-mailadres.",
     NOT_ZZP_USER: "Deze gebruiker is geen ZZP klant.",
     NO_ADMINISTRATION: "Deze gebruiker heeft geen administratie.",
   }
   ```

2. **Error handler:**
   - Update `getErrorMessage()` to use Dutch translations
   - Map backend error codes to UI messages

3. **Empty states:**
   - No active client selected → "Selecteer een klant om te beginnen"
   - No pending requests → "Geen openstaande verzoeken"

---

## 📋 MANUAL TESTING CHECKLIST

Run through this workflow after completing the UI:

### Prerequisites
1. Database running with migration applied
2. Backend server running
3. Frontend dev server running

### Test Flow
1. **Create Users:**
   - [ ] Create ZZP user: email `zzp@test.com`, role `zzp`
   - [ ] Create Accountant user: email `accountant@test.com`, role `accountant`

2. **Accountant Invites ZZP:**
   - [ ] Log in as accountant
   - [ ] Navigate to `/accountant/clients`
   - [ ] Enter `zzp@test.com` and click "Klant toevoegen"
   - [ ] Verify: Toast shows success
   - [ ] Verify: ZZP appears in "In afwachting" tab

3. **ZZP Approves:**
   - [ ] Log out, log in as ZZP
   - [ ] Navigate to ZZP links page
   - [ ] Verify: Pending request from accountant shows
   - [ ] Click "Goedkeuren"
   - [ ] Verify: Toast shows success

4. **Accountant Accesses Client:**
   - [ ] Log out, log in as accountant
   - [ ] Verify: Auto-selected first ACTIVE client
   - [ ] Verify: Active client shown in header
   - [ ] Navigate to `/accountant/review-queue`
   - [ ] Verify: Can see client's data
   - [ ] Verify: client_id parameter uses administration_id

5. **Test Access Control:**
   - [ ] Create another ZZP user (not linked)
   - [ ] Try to access their data as accountant
   - [ ] Verify: 403 NOT_ASSIGNED error

6. **Test Pending Status:**
   - [ ] Invite another ZZP (creates PENDING)
   - [ ] Try to access their data before approval
   - [ ] Verify: 403 PENDING_APPROVAL error

7. **Test Idempotence:**
   - [ ] Invite same ZZP twice
   - [ ] Verify: Returns existing assignment, no duplicate

---

## 🚀 DEPLOYMENT NOTES

1. **Migration:**
   ```bash
   cd backend
   alembic upgrade head
   ```

2. **Environment:**
   - No new env vars needed
   - Uses existing Postgres connection

3. **Backward Compatibility:**
   - Existing assignments auto-migrated to ACTIVE status
   - Admin-created assignments work as before
   - No breaking changes to existing accountant workflows

---

## 📊 API ENDPOINTS SUMMARY

### Accountant Endpoints
```
POST   /api/v1/accountant/clients/invite      - Invite ZZP by email
GET    /api/v1/accountant/clients/links       - List all client links
```

### ZZP Endpoints
```
GET    /api/v1/zzp/links                      - List pending requests
POST   /api/v1/zzp/links/{id}/approve         - Approve request
POST   /api/v1/zzp/links/{id}/reject          - Reject request
```

### Updated Behavior
```
GET    /api/v1/accountant/clients/{client_id}/*
       → Now requires ACTIVE status (enforced by require_assigned_client)
```

---

## 🎯 SUCCESS CRITERIA

- [x] Accountants can invite clients without admin
- [x] ZZP clients must approve invitations
- [x] Only ACTIVE assignments grant data access
- [x] PENDING assignments blocked with clear error
- [ ] UI shows active client context
- [ ] UI provides consent approval flow
- [ ] All error messages in Dutch
- [ ] Manual testing checklist passes

---

## 🔗 FILES CHANGED

### Backend
1. `backend/alembic/versions/013_client_consent_workflow.py` (NEW)
2. `backend/app/models/accountant_dashboard.py` (MODIFIED)
3. `backend/app/schemas/accountant_dashboard.py` (MODIFIED)
4. `backend/app/api/v1/accountant_dashboard.py` (MODIFIED)
5. `backend/app/api/v1/zzp.py` (NEW)
6. `backend/app/api/v1/deps.py` (MODIFIED)
7. `backend/app/main.py` (MODIFIED)
8. `backend/tests/test_consent_workflow.py` (NEW)

### Frontend
1. `src/lib/ActiveClientContext.tsx` (NEW)
2. `src/lib/api.ts` (MODIFIED)
3. `src/App.tsx` (MODIFIED)

### To Create
1. `src/components/AccountantClientsPage.tsx` (NEW)
2. `src/components/ZZPAccountantLinksPage.tsx` (NEW)
3. Update `src/i18n/nl.ts` with error codes
4. Update AppShell/Header to show active client

---

**Implementation Status:** ~85% complete
**Remaining:** UI components for client selection and consent approval
