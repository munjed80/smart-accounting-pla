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
| Variable | Where Used | Description |
|----------|------------|-------------|
| `VITE_API_URL` | Frontend build | URL browser uses to call backend API |
| `CORS_ORIGINS` | Backend | Allowed origins for CORS requests |
| `DATABASE_URL` | Backend/Worker | PostgreSQL connection (uses `db` hostname) |
| `REDIS_URL` | Backend/Worker | Redis connection (uses `redis` hostname) |

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

### Health
- `GET /health` - Health check (DB + Redis)

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
