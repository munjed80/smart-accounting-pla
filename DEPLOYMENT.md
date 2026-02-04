# Deployment Guide for Smart Accounting Platform

This guide covers deploying the Smart Accounting Platform using Coolify.

## Required Environment Variables

### Backend (API Server)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string | `postgresql+asyncpg://user:pass@host:5432/db` |
| `DATABASE_URL_SYNC` | ✅ | Sync PostgreSQL URL for Alembic | `postgresql://user:pass@host:5432/db` |
| `SECRET_KEY` | ✅ | JWT signing key (32+ chars) | `openssl rand -hex 32` |
| `ENV` | ⚠️ | Environment name | `production` |
| `CORS_ORIGINS` | ⚠️ | Allowed CORS origins | `https://zzpershub.nl,https://www.zzpershub.nl` |
| `FRONTEND_URL` | ⚠️ | Frontend URL for email links | `https://zzpershub.nl` |
| `REDIS_URL` | ❌ | Redis connection (optional) | `redis://redis:6379/0` |
| `RESEND_API_KEY` | ❌ | Resend email API key | `re_xxxxx` |
| `GIT_SHA` | ❌ | Git commit SHA for versioning | `abc123def` |
| `BUILD_TIME` | ❌ | ISO 8601 build timestamp | `2024-01-15T10:30:00Z` |

### Frontend (Web UI)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_API_URL` | ✅ | Backend API base URL (build-time) | `https://api.zzpershub.nl` |
| `VITE_BUILD_VERSION` | ❌ | Version tag (build-time) | `v1.2.3` or `abc123` |
| `VITE_BUILD_TIMESTAMP` | ❌ | Build timestamp (build-time) | `2024-01-15T10:30:00Z` |

**Important:** `VITE_*` variables are baked into the frontend at build time. Changing them requires a rebuild.

## Coolify Build Commands

### Backend

```bash
# Build command (Coolify will run this)
docker build -t smart-accounting-api \
  --build-arg GIT_SHA=$(git rev-parse HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -f backend/Dockerfile backend/

# Run command
# Uses startup.sh which runs migrations and starts uvicorn
```

### Frontend

```bash
# Build command (Coolify will run this)
docker build -t smart-accounting-frontend \
  --build-arg VITE_API_URL=https://api.zzpershub.nl \
  --build-arg VITE_BUILD_VERSION=$(git rev-parse --short HEAD) \
  --build-arg VITE_BUILD_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -f Dockerfile.frontend .

# Run command
# Uses nginx to serve static files
```

## Coolify Configuration

### Backend Service

1. **Source:** GitHub repository
2. **Build Pack:** Dockerfile
3. **Dockerfile Path:** `backend/Dockerfile`
4. **Port:** 8000
5. **Health Check:** `GET /health`
6. **Environment Variables:** Add all required backend variables

### Frontend Service

1. **Source:** GitHub repository  
2. **Build Pack:** Dockerfile
3. **Dockerfile Path:** `Dockerfile.frontend`
4. **Port:** 80
5. **Build Arguments:**
   - `VITE_API_URL=https://api.zzpershub.nl`
   - `VITE_BUILD_VERSION=${GIT_SHA:0:8}` (or use Coolify variable)
   - `VITE_BUILD_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)`

## Verification After Deploy

### Quick Verification Checklist (5 steps)

1. **Backend Health Check**
   ```bash
   curl https://api.zzpershub.nl/health
   # Expected: {"status":"healthy",...}
   ```

2. **Backend Version Check**
   ```bash
   curl https://api.zzpershub.nl/api/v1/meta/version
   # Expected: {"git_sha":"abc123...","build_time":"...","env_name":"production"}
   ```

3. **Frontend Loads**
   - Open https://zzpershub.nl in browser
   - Check console for any 404 or CORS errors

4. **Version Match Check**
   - Log in and go to **Settings** page
   - Scroll to bottom diagnostics section
   - Verify Frontend and Backend git_sha match (same commit)

5. **API Connectivity Test**
   - Log in as accountant
   - Navigate to Work Queue or any data page
   - Should load data without errors

### Detailed Checks

**Check bank routes exist (should return 401, not 404):**
```bash
curl -I https://api.zzpershub.nl/api/v1/accountant/bank/transactions?administration_id=00000000-0000-0000-0000-000000000000
# Expected: HTTP 401 or 403 (NOT 404)
```

**Check migrations ran:**
```bash
# In backend container:
alembic current
# Should show: 015_add_document_status_enum_values (head)
```

## Troubleshooting

### "Two Portals" Effect (Frontend/Backend Version Mismatch)

**Symptom:** Settings page shows different git_sha for Frontend vs Backend

**Cause:** Frontend was rebuilt but backend wasn't (or vice versa)

**Fix:** 
1. Trigger rebuild for both services from the same commit
2. In Coolify, use "Redeploy" on both services

### Bank Routes Return 404

**Symptom:** `GET /api/v1/accountant/bank/transactions` returns 404

**Possible causes:**
1. Old backend version deployed (bank router not included)
2. Router not mounted in main.py

**Fix:** Redeploy backend from latest commit. Check startup logs for:
```
Router mount confirmed: /api/v1/accountant/bank (bank-reconciliation)
```

### Database Enum Errors

**Symptom:** Error `invalid input value for enum documentstatus: "NEEDS_REVIEW"`

**Cause:** Migration 015 hasn't run

**Fix:**
```bash
# In backend container:
alembic upgrade head
```

The backend will fail fast at startup if enum values are missing, with a clear error message.

### VITE_API_URL Not Working

**Symptom:** Frontend makes requests to wrong API URL

**Cause:** `VITE_API_URL` is a build-time variable, not runtime

**Fix:**
1. Set `VITE_API_URL` as a **build argument** in Coolify, not environment variable
2. Trigger a full rebuild (not just redeploy)
3. Verify with Settings page diagnostics

## Database Migrations

Migrations run automatically on backend startup via `startup.sh`. To run manually:

```bash
# Inside backend container
cd /app
alembic upgrade head
```

Current migrations:
- `001_initial.py` - Base tables
- ...
- `015_add_document_status_enum_values.py` - Adds NEEDS_REVIEW, EXTRACTED, POSTED, REJECTED to documentstatus enum

## Security Notes

- Never commit `SECRET_KEY` to repository
- Use Coolify's secrets management for sensitive values
- `ADMIN_WHITELIST` restricts who can have admin role
- CORS is restricted to configured origins in production
