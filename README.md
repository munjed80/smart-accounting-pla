# Smart Accounting Platform

An intelligent accounting platform with AI-powered document processing. Upload invoices, and the system automatically extracts data, predicts ledger accounts, and creates draft transactions.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend   │────▶│  PostgreSQL │
│   (React)   │     │  (FastAPI)  │     │   Database  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │    Redis    │
                    │   Streams   │
                    └──────┬──────┘
                          │
                          ▼
                    ┌─────────────┐
                    │   Worker    │
                    │ (OCR + AI)  │
                    └─────────────┘
```

## Tech Stack

- **Frontend**: React + Vite + TypeScript + TailwindCSS + shadcn/ui
- **Backend**: FastAPI + SQLAlchemy 2.0 + Alembic
- **Database**: PostgreSQL 15
- **Queue**: Redis Streams
- **Worker**: Python with pdfplumber + Tesseract OCR
- **Containerization**: Docker Compose

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Run with Docker Compose

1. **Clone and setup environment**:
   ```bash
   cp .env.example .env
   # Edit .env and set a secure SECRET_KEY
   ```

2. **Start all services**:
   ```bash
   docker compose up --build
   ```

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### How Docker Compose Networking Works

The docker-compose setup uses the following networking model:

```
┌──────────────────────────────────────────────────────────────────┐
│                        Docker Network                              │
│                                                                    │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐       │
│  │   db    │    │  redis  │    │ backend │    │ worker  │       │
│  │ :5432   │    │ :6379   │    │ :8000   │    │         │       │
│  └────┬────┘    └────┬────┘    └────┬────┘    └─────────┘       │
│       │              │              │                             │
│       └──────────────┴──────┬───────┘                             │
│                             │ (container-to-container)            │
│                     ┌───────┴───────┐                             │
│                     │   frontend    │                             │
│                     │    :80        │                             │
│                     └───────────────┘                             │
└──────────────────────────────────────────────────────────────────┘
            │              │              │
            │              │              │
         :5432          :6379          :8000          :3000
            │              │              │              │
┌───────────┴──────────────┴──────────────┴──────────────┴─────────┐
│                        Host Machine                                │
└──────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Browser                                  │
│                                                                   │
│   Frontend (localhost:3000) ──────► Backend (localhost:8000)      │
│   React App                        FastAPI                        │
│                                                                   │
│   The browser makes API calls to localhost:8000 directly.         │
│   VITE_API_URL=http://localhost:8000 is baked in at build time.   │
└─────────────────────────────────────────────────────────────────┘
```

**Key points:**
- **Frontend container** serves static files via nginx on port 80 (mapped to 3000)
- **Backend container** runs on port 8000, exposed to the host
- **Browser** loads the React app from frontend, but API calls go directly to backend via `localhost:8000`
- **CORS** is configured to allow requests from `localhost:3000` and `localhost:5173`
- **Worker** connects to Redis and PostgreSQL using Docker internal networking (`db:5432`, `redis:6379`)

**Environment Variables:**

| Variable | Where Used | Type | Description |
|----------|------------|------|-------------|
| `VITE_API_URL` | Frontend | Build-time | URL browser uses to call backend API |
| `VITE_BUILD_VERSION` | Frontend | Build-time | Git commit SHA for version tracking |
| `VITE_BUILD_TIMESTAMP` | Frontend | Build-time | Auto-generated build timestamp |
| `FRONTEND_URL` | Backend | Runtime | Frontend URL for CORS and redirects |
| `CORS_ORIGINS` | Backend | Runtime | Allowed origins for CORS requests |
| `DATABASE_URL` | Backend/Worker | Runtime | PostgreSQL connection (uses `db` hostname) |
| `REDIS_URL` | Backend/Worker | Runtime | Redis connection (uses `redis` hostname) |
| `SECRET_KEY` | Backend | Runtime | JWT signing secret |

> **Important**: Frontend variables (`VITE_*`) must be set at **build time** (as Docker build args). Backend variables are set at **runtime** (as container env vars). See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for detailed Coolify configuration.

### Production Environment Setup

For production deployments, the following environment variable must be set at **build time**:

```bash
VITE_API_URL=https://api.zzpershub.nl
```

> **Important:** 
> - The URL should include the `https://` scheme (e.g., `https://api.zzpershub.nl`), but if omitted, the frontend will automatically prefix it with `https://` during production builds.
> - The frontend appends `/api/v1` to this base URL when making API calls (e.g., `https://api.zzpershub.nl/api/v1/auth/register`).
> - Do NOT include a trailing slash in `VITE_API_URL`.

## Demo Flow

1. **Register a new user**:
   - Go to http://localhost:3000
   - Click "Register" tab
   - Create an account (e.g., `demo@example.com`)

2. **Login**:
   - Login with your credentials

3. **Create an Administration**:
   - The system will prompt you to create one on first login
   - Or use the API directly:
   ```bash
   curl -X POST http://localhost:8000/api/v1/administrations \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "My Company", "description": "Demo administration"}'
   ```

4. **Upload a document**:
   - Go to "AI Upload" tab
   - Drag and drop an invoice (PNG, JPG, or PDF)
   - The document will be uploaded and queued for processing

5. **Worker processes the document**:
   - The worker service picks up the job from Redis
   - Extracts text using OCR (if needed)
   - Predicts the ledger account using keyword matching
   - Creates a DRAFT transaction

6. **Review draft transaction**:
   - Go to "Smart Transactions" tab
   - Find the draft transaction
   - Review and edit if needed

7. **Post the transaction**:
   - Verify debit equals credit
   - Click "Post" to finalize

## API Endpoints

### Authentication
- `POST /token` - Login (OAuth2 form)
- `POST /api/v1/auth/register` - Register new user
- `GET /api/v1/auth/me` - Get current user

### Administrations
- `POST /api/v1/administrations` - Create administration
- `GET /api/v1/administrations` - List user's administrations
- `GET /api/v1/administrations/{id}` - Get administration details

### Documents
- `POST /api/v1/documents/upload` - Upload document
- `GET /api/v1/documents` - List documents
- `GET /api/v1/documents/{id}` - Get document details

### Transactions
- `GET /api/v1/transactions/stats` - Get statistics
- `GET /api/v1/transactions` - List transactions
- `GET /api/v1/transactions/{id}` - Get transaction details
- `PUT /api/v1/transactions/{id}` - Update draft transaction
- `POST /api/v1/transactions/{id}/post` - Post transaction (validates debit=credit)

### Bank (Accountant)
- `POST /api/v1/accountant/bank/import` - Import bank statement CSV
- `GET /api/v1/accountant/bank/transactions` - List bank transactions
- `POST /api/v1/accountant/bank/transactions/{id}/suggest` - Get match suggestions
- `POST /api/v1/accountant/bank/transactions/{id}/apply` - Apply reconciliation action
- `GET /api/v1/accountant/bank/actions` - Audit trail of reconciliation actions

### Health
- `GET /health` - Health check (DB + Redis)

## Bank Statement Import (Accountant)

### Coolify Manual E2E (Accountant)
1. Log in as an **accountant** in production.
2. Open **Bank** in the sidebar.
3. Select an **actieve klant** in the clients list if none is active.
4. Upload a **CSV bankafschrift** in the import dialog.
5. Open a transaction → apply a suggestion or book as expense.

### Security Notes
- Bank reconciliation is **accountant-only** and always scoped to the **active client**.
- Every reconciliation action is stored in an **audit trail** (reconciliation_actions).

### CSV Formats (Supported)
Required columns (case-insensitive):
- `date` or `booking_date`
- `amount`
- `description`

Optional columns:
- `iban` or `counterparty_iban`
- `counterparty_name`
- `reference`

## Project Structure

```
smart-accounting-pla/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/v1/         # API routes
│   │   ├── core/           # Config, security, database
│   │   ├── models/         # SQLAlchemy models
│   │   └── schemas/        # Pydantic schemas
│   ├── alembic/            # Database migrations
│   └── seed.py             # Seed data (VAT codes, CoA)
├── worker/                  # Document processing worker
│   └── processor.py        # Redis Streams consumer
├── src/                    # React frontend
│   ├── components/         # UI components
│   └── lib/               # API client, auth context
├── docker-compose.yml      # Container orchestration
└── .env.example           # Environment template
```

## Development

### Local Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Seed database
python seed.py

# Start server
uvicorn app.main:app --reload
```

### Local Frontend Development

```bash
npm install
npm run dev
```

### Run Tests

```bash
# Backend
cd backend
pytest

# Frontend
npm test
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_USER` | Database user | `accounting_user` |
| `POSTGRES_PASSWORD` | Database password | `change_me` |
| `POSTGRES_DB` | Database name | `accounting_db` |
| `SECRET_KEY` | JWT signing key | (change in production!) |
| `VITE_API_URL` | Backend URL for frontend | `http://localhost:8000` |

## Smoke Test Checklist

After deployment, verify the end-to-end flow works correctly:

1. **Start services**:
   ```bash
   docker compose up --build
   ```

2. **Register/Login**:
   - Go to http://localhost:3000
   - Register a new user or login

3. **Create Administration**:
   - Create a new administration if prompted

4. **Upload Document**:
   - Go to "AI Upload" tab
   - Upload an invoice (PNG, JPG, or PDF)

5. **Wait for Processing**:
   - Watch the "Processed Documents" section
   - Document status should change: UPLOADED → PROCESSING → DRAFT_READY

6. **Review Transaction**:
   - Go to "Smart Transactions" tab
   - Find the DRAFT transaction created from your document

7. **POST Transaction**:
   - Verify debit equals credit (balanced)
   - Click "Approve & Post"

8. **Verify Idempotency**:
   - Upload or reprocess the same document
   - Confirm no duplicate transactions are created (count should remain 1)

9. **Test Failed Document Flow**:
   - If a document fails processing, verify error message is shown
   - Click "Reprocess" to retry processing

## ZZP Save Verification

Manual checklist to verify all save operations work correctly with user feedback:

1. **Update company profile** (Instellingen → Bedrijfsprofiel)
   - Edit company name and save → expect "Bedrijfsprofiel opgeslagen" toast

2. **Create customer** (Klanten → Nieuwe klant)
   - Fill in customer form and save → expect success toast + confirmation dialog

3. **Create invoice** (Facturen → Nieuwe factuur)
   - Add invoice lines and save → expect "Factuur opgeslagen" toast

4. **Add hours** (Uren → Nieuwe registratie)
   - Fill in time entry and save → expect "Urenregistratie opgeslagen" toast

5. **Add agenda item** (Agenda → Nieuwe afspraak)
   - Create calendar event and save → expect "Afspraak opgeslagen" toast

### Invoice Actions Status

| Action | Status | Notes |
|--------|--------|-------|
| View/Edit | ✅ Active | Opens invoice in dialog |
| Delete | ✅ Active | Only for draft invoices |
| Download/Print | ✅ Active | Opens print dialog via browser |
| Send via Email | ⏳ Binnenkort | Email infrastructure not implemented |

## How to Test Sections

The platform includes the following pages/sections that can be accessed via URL or menu navigation:

### ZZP User Menu

| Page | URL Path | Description |
|------|----------|-------------|
| Dashboard | `/dashboard` | Overview with stats, recent transactions |
| Smart Transactions | `/transactions` | List transactions with status filter (Draft/Posted) |
| AI Upload | `/ai-upload` | Upload invoices/receipts for AI processing |
| Settings | `/settings` | Profile info, company details, notification preferences |
| Support | `/support` | Contact form and support information |

### Accountant User Menu

| Page | URL Path | Description |
|------|----------|-------------|
| Work Queue | `/accountant/review` | Review queue of pending transactions |
| Clients | `/clients` | Client management dashboard |
| Dashboard | `/dashboard` | Overview with stats |
| Smart Transactions | `/transactions` | Transaction list |
| AI Upload | `/ai-upload` | Document upload |
| Settings | `/settings` | Profile and preferences |
| Support | `/support` | Support contact form |

### Implemented API Endpoints

The frontend uses the following backend endpoints:

**Authentication:**
- `POST /api/v1/auth/token` - Login
- `POST /api/v1/auth/register` - Register
- `GET /api/v1/auth/me` - Get current user profile

**Transactions:**
- `GET /api/v1/transactions` - List transactions (supports `?status=DRAFT` or `?status=POSTED`)
- `GET /api/v1/transactions/{id}` - Get transaction details
- `GET /api/v1/transactions/stats` - Get transaction statistics
- `POST /api/v1/transactions/{id}/approve` - Approve transaction (post to ledger)
- `POST /api/v1/transactions/{id}/reject` - Reject/delete draft transaction

**Documents:**
- `POST /api/v1/documents/upload` - Upload document (multipart)
- `GET /api/v1/documents` - List documents
- `GET /api/v1/documents/{id}` - Get document details
- `POST /api/v1/documents/{id}/reprocess` - Reprocess failed document

**Administrations:**
- `POST /api/v1/administrations` - Create administration
- `GET /api/v1/administrations` - List user's administrations
- `GET /api/v1/administrations/{id}` - Get administration details

**Accountant:**
- `GET /api/v1/accountant/dashboard` - Accountant dashboard overview
- `GET /api/v1/accountant/work-queue` - Work queue items
- `GET /api/v1/accountant/clients/{id}/overview` - Client overview

**Health:**
- `GET /api/v1/ops/health` - API health check

### Testing Navigation

1. **URL-based routing:** Directly navigate to any URL (e.g., `/dashboard`, `/settings`)
2. **Menu navigation:** Use the sidebar menu - clicking items updates both URL and content
3. **Mobile:** On mobile, the drawer closes automatically after navigation
4. **Active state:** The current page is highlighted in the menu
5. **Role-based filtering:** Menu shows only items accessible to your role

### Data States

All pages implement proper loading, empty, and error states:
- **Loading:** Skeleton loaders while fetching data
- **Empty:** Clear messages with CTAs when no data exists
- **Error:** Error messages with retry buttons

## License

MIT License - see LICENSE file

## User Role Management

The platform supports three user roles:
- **zzp** - Self-employed users (default)
- **accountant** - Accountants with client management capabilities
- **admin** - System administrators

### Role Selection During Registration

Users can select their role (zzp or accountant) during registration. The admin role is not available via public registration for security reasons.

### Testing Accountant Role Flow

Follow this checklist to verify the accountant registration and login flow works correctly:

1. **Register as Accountant**
   - Go to the login page (http://localhost:3000 or your deployment URL)
   - Click the "Register" tab
   - Fill in your details
   - Select "Accountant" from the Role dropdown
   - Click "Create Account"
   - You should see "Check your email to verify your account"

2. **Verify Email**
   - Check your email for the verification link
   - Click the verification link
   - You should see "Email verified successfully"

3. **Login**
   - Go back to the login page
   - Enter your credentials
   - Click "Login"
   - **Expected**: You should be redirected to `/accountant` (Work Queue)

4. **Verify Role Badge**
   - Check the header badge shows "accountant" (not "ZZP")
   - In the sidebar, you should see: Work Queue, Clients, Dashboard, etc.

5. **Verify Navigation**
   - Click "Work Queue" → Should show the accountant work queue page
   - Click "Clients" → Should show the client management dashboard
   - All accountant-specific features should be accessible

6. **Logout**
   - Click the Logout button (header or sidebar)
   - You should be redirected to `/login`
   - localStorage should be cleared (no access_token)

### End-to-End Accountant Workflow Checklist

Follow this checklist to test the complete accountant workflow:

1. **Create ZZP User**
   ```bash
   # Register via API or UI
   curl -X POST "http://localhost:8000/api/v1/auth/register" \
     -H "Content-Type: application/json" \
     -d '{"email": "zzp@example.com", "password": "TestPass123!", "full_name": "Test ZZP", "role": "zzp"}'
   ```

2. **Create Accountant User**
   ```bash
   curl -X POST "http://localhost:8000/api/v1/auth/register" \
     -H "Content-Type: application/json" \
     -d '{"email": "accountant@example.com", "password": "TestPass123!", "full_name": "Test Accountant", "role": "accountant"}'
   ```

3. **Verify Emails** (if email verification is enabled)
   - Check both email inboxes for verification links

4. **ZZP: Complete Onboarding**
   - Login as ZZP user
   - Complete the onboarding wizard to create an administration

5. **Assign ZZP to Accountant** (for testing)
   ```bash
   # Login as accountant first, then use the assignment endpoint
   curl -X POST "http://localhost:8000/api/v1/accountant/assignments/by-email" \
     -H "Authorization: Bearer ACCOUNTANT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"client_email": "zzp@example.com"}'
   ```
   
   Or use the admin dev endpoint:
   ```bash
   curl -X POST "http://localhost:8000/api/v1/admin/dev/seed-assignments" \
     -H "Authorization: Bearer ACCOUNTANT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"accountant_email": "accountant@example.com", "client_email": "zzp@example.com"}'
   ```

6. **Accountant: View Clients**
   - Login as accountant
   - Navigate to `/accountant/clients`
   - Should see the assigned ZZP client in the list

7. **Accountant: Open Client Dossier**
   - Click "Open Dossier" on a client
   - Should navigate to `/accountant/clients/{clientId}/issues`
   - Page should load without "Not Found" error

8. **Accountant: Review Queue**
   - Navigate to `/accountant/review-queue`
   - Should load the review queue (even if empty)

9. **Logout**
   - Click logout button
   - Should redirect to login page

### Troubleshooting Role Issues

If the role badge shows "ZZP" instead of "accountant" after registering as an accountant:

1. **Check Browser Console**
   - Open Developer Tools (F12)
   - Look for `[AuthContext] ME endpoint response:` log
   - Verify the `role` field in the response

2. **Check Network Tab**
   - Look at the `/api/v1/auth/me` response
   - The `role` field should be "accountant"

3. **Check Backend Logs**
   - Look for "Role persistence check" log during registration
   - Look for "User profile fetched via /me" log during login

4. **Fix Using Admin API**
   - If role is wrong in DB, use the admin endpoint to fix it:
   ```bash
   curl -X PATCH "http://localhost:8000/api/v1/admin/users/{user_id}/role" \
     -H "Authorization: Bearer ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"role": "accountant"}'
   ```

### Fixing User Roles

If a user was created with the wrong role, administrators can fix it using one of these methods:

#### Method 1: Admin API Endpoint (Recommended)

Use the admin API to update a user's role:

```bash
# Get a list of users
curl -X GET "http://localhost:8000/api/v1/admin/users" \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Update a user's role
curl -X PATCH "http://localhost:8000/api/v1/admin/users/{user_id}/role" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "accountant"}'
```

**Requirements:**
- Must be authenticated as an admin user
- Admin must be in the `ADMIN_WHITELIST` environment variable

#### Method 2: Management Script

Use the management script for CLI-based role updates:

```bash
# Set DATABASE_URL environment variable
export DATABASE_URL=postgresql+asyncpg://user:pass@localhost/smart_accounting

# List all users
python scripts/set_user_role.py --list

# List users by role
python scripts/set_user_role.py --list --role accountant

# Update a user's role by email
python scripts/set_user_role.py --email user@example.com --role accountant

# Update a user's role by ID
python scripts/set_user_role.py --user-id 550e8400-e29b-41d4-a716-446655440000 --role accountant

# Dry run (preview changes without applying)
python scripts/set_user_role.py --email user@example.com --role accountant --dry-run
```

### Admin Whitelist

For security, admin users must be explicitly whitelisted to access admin endpoints and log in. Set the `ADMIN_WHITELIST` environment variable:

```bash
ADMIN_WHITELIST=admin@example.com,superuser@company.com
```

### Consent Workflow End-to-End Checklist

Follow this checklist to test the complete consent workflow for accountant-client linking:

**Prerequisites:**
- Database running with migration `013_client_consent_workflow` applied
- Backend server running
- Frontend dev server running

**Test Steps:**

1. **Create ZZP User**
   ```bash
   curl -X POST "http://localhost:8000/api/v1/auth/register" \
     -H "Content-Type: application/json" \
     -d '{"email": "zzp-test@example.com", "password": "TestPass123!", "full_name": "Test ZZP Client", "role": "zzp"}'
   ```
   - [ ] User created successfully
   - [ ] Complete onboarding to create an administration

2. **Create Accountant User**
   ```bash
   curl -X POST "http://localhost:8000/api/v1/auth/register" \
     -H "Content-Type: application/json" \
     -d '{"email": "accountant-test@example.com", "password": "TestPass123!", "full_name": "Test Accountant", "role": "accountant"}'
   ```
   - [ ] User created successfully

3. **Accountant: Invite ZZP Client**
   - Login as accountant
   - Navigate to `/accountant/clients`
   - Click "Klant toevoegen" button
   - Enter ZZP email: `zzp-test@example.com`
   - Click "Uitnodigen"
   - [ ] Toast shows "Uitnodiging verstuurd!"
   - [ ] Client appears in "In afwachting" tab with PENDING status

4. **ZZP: Approve Request**
   - Logout accountant
   - Login as ZZP user
   - Navigate to `/dashboard/boekhouder`
   - [ ] Pending request from accountant is visible
   - Click "Goedkeuren"
   - [ ] Toast shows success message
   - [ ] Request disappears from list

5. **Accountant: Access Approved Client**
   - Logout ZZP
   - Login as accountant
   - Navigate to `/accountant/clients`
   - [ ] Client now shows in "Actief" tab with ACTIVE status
   - Click "Selecteren" on the client
   - [ ] Client indicator in header updates
   - [ ] Navigates to `/accountant/review-queue`

6. **Accountant: Open Client Dossier**
   - From clients page, click "Open dossier"
   - [ ] Navigates to `/accountant/clients/{clientId}/issues`
   - [ ] Page loads without "Not Found" error

7. **Test Access Control**
   - Create another ZZP user (not linked)
   - As accountant, try to access their data
   - [ ] Should receive 403 NOT_ASSIGNED error

8. **Logout Test**
   - Click logout button
   - [ ] Successfully redirects to login page
   - [ ] Active client selection is preserved in localStorage for next login

**Expected Behavior:**
- Accountant can only access ACTIVE client data
- PENDING clients show "Wacht op goedkeuring" message
- Client switcher in header shows active client name
- ZZP can approve/reject accountant requests
- All UI text is in Dutch

## Operations Guide

### Running Migrations

After updating the codebase, run database migrations:

```bash
# Using Docker
docker compose exec backend alembic upgrade head

# Local development
cd backend
alembic upgrade head
```

> **Note on Alembic Version Column**: This project uses human-readable revision IDs 
> (e.g., `010_accountant_dashboard_bulk_ops`) that exceed PostgreSQL's default 
> `alembic_version.version_num` column length of VARCHAR(32). Both `alembic/env.py` 
> and the initial migration include safeguards to expand this column to VARCHAR(128), 
> ensuring fresh databases and existing databases can run migrations without truncation errors.

### Environment Variables for New Features

Add these to your `.env` file for enhanced functionality:

```bash
# Email Reminders (via Resend)
RESEND_API_KEY=your_resend_api_key  # Optional - enables EMAIL channel
RESEND_FROM_EMAIL=noreply@zzphub.nl # Default sender address

# Evidence Pack Storage
EVIDENCE_STORAGE_PATH=/data/evidence  # Where evidence packs are stored
```

### Starting the Server

```bash
# Development
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production with Docker
docker compose up -d
```

### Accountant Dashboard Features

The accountant master dashboard provides:

1. **Work Queue** - Unified work items across all clients
   - Filter by: RED issues, Needs Review, VAT Due, Stale clients
   - Sort by: Readiness score, Severity, Due date
   
2. **Readiness Score** (0-100)
   - 80-100: Good health
   - 50-79: Needs review
   - 20-49: Significant issues
   - 0-19: Critical attention required

3. **SLA Monitoring**
   - RED unresolved > 5 days = WARNING
   - RED unresolved > 7 days = CRITICAL
   - VAT due ≤ 14 days = WARNING
   - VAT due ≤ 7 days = CRITICAL

4. **Reminders**
   - IN_APP: Always available
   - EMAIL: Requires RESEND_API_KEY
   - Schedule for future sending

5. **Evidence Packs**
   - VAT compliance export
   - Includes journal entries, documents, validation status
   - SHA256 checksum verification

### API Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Reminders | 10/min | per accountant |
| Evidence Packs | 5/min | per accountant |
| Bulk Operations | 5/min | per accountant |

### Storage Requirements

Evidence packs are stored at `EVIDENCE_STORAGE_PATH` (default: `/data/evidence`).
Structure: `{client_id}/{period_id}/{filename}.json`

Ensure this directory:
- Is writable by the backend process
- Has sufficient disk space
- Is backed up regularly for compliance

---

## Bulk Operations - Manual Test Checklist (Mobile)

This checklist is for testing the accountant bulk operations feature on mobile devices (iPhone Safari).

### Pre-requisites
- [ ] Logged in as accountant role
- [ ] At least 2-3 test clients assigned
- [ ] Backend API is running and accessible

### Selection Model Tests
- [ ] **Multi-select from table**: Tap checkboxes to select multiple clients
- [ ] **Select all visible**: Tap "Selecteer alles (zichtbaar)" button
- [ ] **Clear selection**: Tap "Selectie wissen" button
- [ ] **Selection persists**: Refresh page, verify selection is maintained (localStorage)
- [ ] **Selection count**: Verify "Geselecteerd: X klanten" shows correct count

### BulkActionBar Tests (Mobile Responsive)
- [ ] **Bar visibility**: Bar appears when at least 1 client selected
- [ ] **Bar hidden**: Bar disappears when selection is cleared
- [ ] **Buttons wrap**: On narrow screens, action buttons wrap to multiple lines
- [ ] **Large selection warning**: Select >50 clients, verify warning message appears

### Bulk Operation Modal Tests
- [ ] **Open modal**: Tap any bulk action button (e.g., "Herberekenen")
- [ ] **Selection summary**: Modal shows first 5 client names + "+N meer" if more
- [ ] **Dutch text**: All modal text is in Dutch
- [ ] **Cancel button**: Tap "Annuleren" closes modal without action
- [ ] **Scroll on mobile**: Modal content is scrollable on small screens

### Reminder-specific Tests
- [ ] **Reminder type dropdown**: Can select type (Actie vereist, Document ontbreekt, etc.)
- [ ] **Default message**: Title and message have Dutch defaults
- [ ] **Deadline checkbox**: Toggle "Deadline toevoegen" shows date picker
- [ ] **Validation**: Execute button disabled if title/message empty

### VAT Draft-specific Tests
- [ ] **Year selector**: Can select year from dropdown
- [ ] **Quarter selector**: Can select Q1-Q4 from dropdown
- [ ] **Default period**: Current quarter is pre-selected

### Execution & Results Tests
- [ ] **Progress indicator**: Spinner shows "Bezig met uitvoeren…" during execution
- [ ] **Success display**: Shows Gelukt / Mislukt / Overgeslagen counts
- [ ] **Expandable details**: Can expand to see per-client results
- [ ] **Error messages**: Failed clients show error reason
- [ ] **Retry button**: "Opnieuw proberen (alleen mislukt)" button works

### Action Log Tests
- [ ] **Navigate to Actions page**: Tap "Acties" in sidebar
- [ ] **List displays**: Shows list of recent bulk operations
- [ ] **Expand details**: Can expand each entry to see client results
- [ ] **Status badges**: Shows correct status (Succesvol/Gedeeltelijk/Mislukt)
- [ ] **Recent actions on dashboard**: RecentActionsPanel shows last 3 actions

### Error Handling Tests
- [ ] **401 Unauthorized**: Token expired triggers logout and redirect to login
- [ ] **403 Forbidden**: Shows appropriate error message
- [ ] **Network error**: Shows error alert, allows retry
- [ ] **Rate limit**: Shows "Let op: Grote bewerkingen kunnen enkele minuten duren."

### Cross-browser Tests
- [ ] **iPhone Safari**: All features work correctly
- [ ] **Android Chrome**: All features work correctly
- [ ] **Desktop Chrome**: All features work correctly

### Bulk API Payload Shape

```json
// POST /accountant/bulk/recalculate
{
  "client_ids": ["uuid-1", "uuid-2"],
  "force": true
}

// POST /accountant/bulk/ack-yellow
{
  "client_ids": ["uuid-1", "uuid-2"]
}

// POST /accountant/bulk/generate-vat-draft
{
  "client_ids": ["uuid-1", "uuid-2"],
  "period_year": 2026,
  "period_quarter": 1
}

// POST /accountant/bulk/send-reminders
{
  "client_ids": ["uuid-1", "uuid-2"],
  "reminder_type": "ACTION_REQUIRED",
  "title": "Herinnering van uw boekhouder",
  "message": "Beste klant, graag uw aandacht...",
  "due_date": "2026-02-15"
}
```

---

## Master Dashboard Verification Checklist

This checklist verifies the accountant master dashboard features for managing 20-100 clients.

### Pre-requisites
- [ ] Logged in as accountant role
- [ ] At least 3-5 test clients assigned (ideally mix of RED/YELLOW/OK statuses)

### Step 1: Empty State Verification
- [ ] **Accountant with 0 clients**: Shows "Nog geen klanten" message with onboarding CTA
- [ ] **Pending only state**: If only pending invites exist, explanation is shown

### Step 2: Invite and Approve Consent
- [ ] Navigate to `/accountant/clients`
- [ ] Click "Klant uitnodigen" button
- [ ] Enter a ZZP user's email address
- [ ] Verify invite is sent and shows in "In afwachting" section
- [ ] As ZZP user: navigate to `/dashboard/boekhouder` and approve request
- [ ] As accountant: verify client appears in active list

### Step 3: Dashboard Shows Client
- [ ] Navigate to `/accountant` (main dashboard)
- [ ] Verify new client appears in client list table
- [ ] Verify KPIs update (total clients count)
- [ ] Verify "Vandaag – Overzicht" panel shows relevant tasks

### Step 4: Search/Filter/Sort Works
- [ ] **Search**: Type client name in search box, verify debounce (300ms delay)
- [ ] **Filter chips**: Click "Rood" filter, verify only red-issue clients shown
- [ ] **Filter chips**: Click "Geel" filter, verify only yellow-issue clients shown
- [ ] **Filter chips**: Click "OK" filter, verify only green clients shown
- [ ] **Filter chips**: Click "Inactief" filter, verify only 30+ days inactive shown
- [ ] **Filter chips**: Click "Alle" to reset
- [ ] **Sort dropdown**: Change sort to "Deadline", verify list reorders
- [ ] **Sort order**: Click sort direction button, verify ascending/descending toggle
- [ ] **Preferences persist**: Refresh page, verify search/filter/sort preserved

### Step 5: Pagination Works
- [ ] **Page size selector**: Change from 25 to 10, verify fewer rows shown
- [ ] **Page navigation**: Click "Volgende" button, verify next page loads
- [ ] **Page info**: Verify "X–Y van Z" display is accurate
- [ ] **First page**: On page 2, click "Vorige", returns to page 1
- [ ] **Page reset on filter**: Change filter, verify returns to page 1

### Step 6: Bulk Action Works on 5 Clients
- [ ] Select 5 clients using checkboxes
- [ ] Verify "Geselecteerd: 5 klanten" badge appears
- [ ] Click "Herberekenen" button
- [ ] Modal opens with selection summary (5 client names)
- [ ] Click "Uitvoeren" button
- [ ] Verify progress spinner shows
- [ ] Verify results display (Gelukt/Mislukt/Overgeslagen counts)
- [ ] Click "Sluiten" to close modal

### Step 7: Bulk Operation Appears in History
- [ ] Navigate to `/accountant/bulk-operations`
- [ ] Verify recent operation appears in table
- [ ] Verify status badge (Voltooid or Voltooid met fouten)
- [ ] Verify client counts are accurate

### Step 8: Details Show Per-Client Results
- [ ] Click "Details bekijken" on the operation row
- [ ] Drawer opens with operation summary
- [ ] Verify counts: Gelukt / Mislukt / Overgeslagen
- [ ] Verify per-client result list shows
- [ ] Filter by "Alleen gelukt", verify list filters
- [ ] Close drawer

### Step 9: No Regressions to ZZP Flow
- [ ] Login as ZZP user
- [ ] Navigate to `/dashboard` - works correctly
- [ ] Navigate to `/ai-upload` - works correctly
- [ ] Navigate to `/transactions` - works correctly
- [ ] Navigate to `/dashboard/boekhouder` - can manage accountant links

### Cross-Page Selection Test
- [ ] As accountant, go to dashboard
- [ ] Set page size to 10
- [ ] Select all 10 clients on page
- [ ] Verify "Selecteer alle X resultaten" banner appears
- [ ] Click to select all results
- [ ] Verify "Alle X gefilterde klanten geselecteerd" banner shows
- [ ] Navigate to page 2
- [ ] Verify clients are still selected (checkmarks shown)
- [ ] Execute a bulk action
- [ ] Verify action applies to ALL clients, not just page 1

## Closed-Loop Workflow Verification

This checklist verifies the end-to-end accountant closed-loop workflow that makes this platform beat SnelStart.

### Prerequisites
- [ ] PostgreSQL database running and migrated
- [ ] Backend running (FastAPI)
- [ ] Frontend running (Vite)
- [ ] Test accountant user created (role=accountant)
- [ ] Test ZZP user created (role=zzp) with administration

### E2E Test: Complete Workflow

#### 1. Create Accountant + ZZP Users
```bash
# Via seed.py or registration
python backend/seed.py
# Or register via UI at /register
```
- [ ] Accountant user can login at `/login`
- [ ] ZZP user can login at `/login`

#### 2. Consent Approval Flow
- [ ] Accountant navigates to `/accountant/clients`
- [ ] Clicks "Klant uitnodigen" and enters ZZP email
- [ ] ZZP user sees pending invite at `/dashboard/boekhouder`
- [ ] ZZP user approves → status becomes ACTIVE
- [ ] Accountant sees client in dashboard

#### 3. Bulk Action → Operation ID → History
- [ ] Select 1+ clients in accountant dashboard
- [ ] Click "Herberekenen" bulk action
- [ ] Modal shows "Bezig…" with polling status
- [ ] Operation completes, shows results
- [ ] Navigate to `/accountant/bulk-operations`
- [ ] Operation appears in history table
- [ ] Status badge shows Dutch label (Voltooid/Mislukt)

#### 4. Details Show Per-Client Results
- [ ] Click "Details bekijken" on operation row
- [ ] Drawer shows operation summary
- [ ] Counts display: Gelukt / Mislukt / Overgeslagen
- [ ] Per-client list shows with status badges
- [ ] Status filter dropdown works
- [ ] Can close drawer

#### 5. Open Dossier → Execute Suggestion → Audit
- [ ] Open client dossier (`/accountant/clients/:id/issues`)
- [ ] "Actieve klant" badge visible in header
- [ ] Issues grouped by Rood/Geel
- [ ] Click "Acties bekijken" on an issue
- [ ] Suggestion cards load
- [ ] Click "Goedkeuren" on a suggestion
- [ ] Success toast shows
- [ ] "Vandaag afgerond" counter increments

#### 6. Today Panel Links Apply Filters
- [ ] Dashboard shows "Vandaag – Overzicht" panel
- [ ] Click on a task (e.g., "X klanten met rode issues")
- [ ] Dashboard applies appropriate filter (e.g., "Rood")
- [ ] Click on "BTW deadline" task
- [ ] Dashboard applies deadline_7d filter + sorts by deadline

#### 7. Logout Works Everywhere
- [ ] From accountant dashboard: click logout → redirects to `/login`
- [ ] From ZZP dashboard: click logout → redirects to `/login`
- [ ] Session cleared (localStorage removed)

### How to Test Locally

```bash
# Terminal 1: Start backend
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Terminal 2: Start frontend
npm install
npm run dev

# Terminal 3: (Optional) Start worker for OCR
cd worker
python worker.py
```

### How to Test on Coolify/Production

1. **Deploy via Coolify**: Push to main branch triggers deploy
2. **Environment variables**: Ensure `DATABASE_URL`, `SECRET_KEY`, `VITE_API_URL` are set
3. **Run migrations**: `alembic upgrade head` in backend container
4. **Verify health**: Check `/api/v1/health` returns OK
5. **Test login**: Verify auth flow works with production CORS
6. **Test bulk ops**: Select clients, execute, verify history updates

### New Endpoints (Phase 1-4)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/accountant/bulk/operations` | GET | List bulk operations history |
| `/api/v1/accountant/bulk/operations/{id}` | GET | Get operation details + per-client results |
| `/api/v1/accountant/bulk/recalculate` | POST | Trigger validation, returns operation_id |
| `/api/v1/accountant/bulk/ack-yellow` | POST | Acknowledge yellow issues |
| `/api/v1/accountant/bulk/generate-vat-draft` | POST | Generate VAT drafts |
| `/api/v1/accountant/bulk/send-reminders` | POST | Send client reminders |

### Status Model

| Status | Dutch Label | Description |
|--------|-------------|-------------|
| PENDING | Wachtend | Operation created, not started |
| IN_PROGRESS | Bezig | Operation running |
| COMPLETED | Voltooid | All clients processed successfully |
| COMPLETED_WITH_ERRORS | Voltooid met fouten | Some clients failed |
| FAILED | Mislukt | All clients failed |

---

## Bank Import & Reconciliation (MVP)

### Overview
Accountants can import bank statements (CSV) and reconcile transactions with invoices, expenses, and transfers. Dutch-first UI with rules-based matching suggestions.

### E2E Verification Checklist

1. **Login as accountant** - Verify login works and role-appropriate menu is shown
2. **Select client** - Use client switcher to select a client administration
3. **Navigate to Bank** - Click "Bank" in sidebar menu → `/accountant/bank`
4. **Import CSV** - Click "Importeren", upload a CSV file with transactions
5. **Verify import** - Check toast shows imported count, transactions appear in list
6. **Test idempotency** - Import same file again, verify duplicates are skipped
7. **View NEW transactions** - Use filter tabs to show only "Nieuw" transactions
8. **Get suggestions** - Click a transaction, click "Suggesties" to load matches
9. **Apply match** - Accept a suggested match or create an expense
10. **Verify status** - Check transaction status changes to "Gematcht"
11. **Verify journal entry** - For CREATE_EXPENSE, journal entry is created
12. **Audit trail** - Reconciliation action is recorded with user/timestamp

### Bank Reconciliation Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/accountant/bank/import` | POST | Import CSV bank statement |
| `/api/v1/accountant/bank/transactions` | GET | List bank transactions with filters |
| `/api/v1/accountant/bank/transactions/{id}/suggest` | POST | Get match suggestions |
| `/api/v1/accountant/bank/transactions/{id}/apply` | POST | Apply reconciliation action |
| `/api/v1/accountant/bank/actions` | GET | List reconciliation actions for audit |

### Bank Transaction Status

| Status | Dutch Label | Description |
|--------|-------------|-------------|
| NEW | Nieuw | Just imported, awaiting reconciliation |
| MATCHED | Gematcht | Successfully matched to invoice/expense |
| IGNORED | Genegeerd | Manually ignored (e.g., internal transfers) |
| NEEDS_REVIEW | Te beoordelen | Flagged for accountant review |

### Reconciliation Actions

| Action | Dutch Label | Description |
|--------|-------------|-------------|
| ACCEPT_MATCH | Match geaccepteerd | Accept a suggested match |
| LINK_INVOICE | Gekoppeld aan factuur | Link to existing invoice |
| CREATE_EXPENSE | Uitgave geboekt | Create expense journal entry |
| IGNORE | Transactie genegeerd | Ignore this transaction |
| UNMATCH | Match ongedaan gemaakt | Undo previous match |

---

## ZZP MVP Verification Checklist

### Overview
The ZZP MVP provides a streamlined Dutch-first experience for ZZP (freelance) users to manage their bookkeeping. The navigation is simplified with 5 main menu items: Overzicht, Documenten, Boekingen, Boekhouder, and Instellingen.

### E2E Verification Steps

1. **Register/Login as ZZP**
   - [ ] Register a new account with role "ZZP"
   - [ ] Verify email
   - [ ] Login successfully
   - [ ] Sidebar shows Dutch labels: Overzicht, Documenten, Boekingen, Boekhouder, Instellingen

2. **Onboarding creates/selects administratie**
   - [ ] On first login, onboarding flow appears
   - [ ] Dutch labels shown throughout onboarding
   - [ ] Create administration with minimal required fields (name only)
   - [ ] Confirmation step shows success message in Dutch
   - [ ] Dashboard loads after onboarding completion

3. **Documenten page shows upload + list**
   - [ ] Navigate to Documenten via sidebar
   - [ ] Page title shows "Documenten"
   - [ ] Drag-and-drop upload zone visible
   - [ ] Stats cards show upload counts
   - [ ] Document list displays with Dutch status labels
   - [ ] Reprocess button available for FAILED documents
   - [ ] Dates formatted in Dutch locale

4. **Boekingen shows stats/list**
   - [ ] Navigate to Boekingen via sidebar
   - [ ] Page title shows "Boekingen"
   - [ ] Stats cards show transaction totals
   - [ ] Transaction list with search/filter
   - [ ] Dutch status labels (Concept, Geboekt)
   - [ ] AI confidence badges visible
   - [ ] Dates formatted in Dutch locale

5. **Boekhouder-koppelingen page works**
   - [ ] Navigate to Boekhouder via sidebar
   - [ ] Page title shows "Boekhouder-koppelingen"
   - [ ] Pending requests section visible
   - [ ] Empty state shows Dutch message if no requests
   - [ ] Approve/Reject buttons functional (if requests exist)

6. **Instellingen page works**
   - [ ] Navigate to Instellingen via sidebar
   - [ ] Profile information displayed
   - [ ] Company/Administration info shown (for ZZP users)
   - [ ] Notification preferences available
   - [ ] Dutch labels throughout

7. **Logout works**
   - [ ] Click Uitloggen button in header
   - [ ] User is redirected to login page
   - [ ] Session cleared properly

8. **Accountant flow unaffected**
   - [ ] Login as accountant user
   - [ ] Sidebar shows accountant-specific menu (Bank & Kas, Klanten, etc.)
   - [ ] Client switcher visible in header
   - [ ] All accountant features working as before

### ZZP Navigation Menu

| Menu Item | Route | Component | Description |
|-----------|-------|-----------|-------------|
| Overzicht | `/dashboard` | SmartDashboard | Dashboard with stats and recent transactions |
| Documenten | `/ai-upload` | IntelligentUploadPortal | Upload documents + view list |
| Boekingen | `/transactions` | SmartTransactionList | Transaction list with filtering |
| Boekhouder | `/dashboard/boekhouder` | ZZPAccountantLinksPage | Manage accountant access |
| Instellingen | `/settings` | SettingsPage | Profile and notification settings |

### API Endpoints Used

| Feature | Endpoint | Method |
|---------|----------|--------|
| List administrations | `/api/v1/administrations` | GET |
| Create administration | `/api/v1/administrations` | POST |
| Upload document | `/api/v1/documents/upload` | POST |
| List documents | `/api/v1/documents` | GET |
| Reprocess document | `/api/v1/documents/{id}/reprocess` | POST |
| Transaction stats | `/api/v1/transactions/stats` | GET |
| List transactions | `/api/v1/transactions` | GET |
| Pending accountant links | `/api/v1/zzp/links` | GET |
| Approve link | `/api/v1/zzp/links/{id}/approve` | POST |
| Reject link | `/api/v1/zzp/links/{id}/reject` | POST |

## Developer Quality Checks

Run these commands before opening a PR:

```bash
npm run lint
npm test
npm run test:backend:smoke
```

To run all three in one go:

```bash
npm run check:all
```

The backend smoke test imports the FastAPI app and verifies critical routes (`/health`, `/docs`, `/openapi.json`) are registered.
