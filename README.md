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

## License

MIT License - see LICENSE file

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
