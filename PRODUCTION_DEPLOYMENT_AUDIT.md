# Production Deployment Audit Report

**Audit Date:** 2026-01-27  
**Repository:** smart-accounting-pla  
**Architecture:** Separated Frontend (Vite/React + Nginx) + Backend (FastAPI)  
**Deployment Target:** Coolify  
- **Backend URL:** https://api.zzpershub.nl
- **Frontend URL:** https://zzpershub.nl
- **Frontend Build-time ENV:** `VITE_API_URL=https://api.zzpershub.nl`

---

## 1. Frontend Codebase Scan

### 1.1 Hardcoded localhost References

#### ❌ **DETECTED ISSUES - UI Display Strings (NOT functional, but misleading)**

| File | Line | Code | Impact |
|------|------|------|--------|
| `src/components/LoginPage.tsx` | 209 | `Backend API: <code className="bg-secondary px-2 py-1 rounded">http://localhost:8000</code>` | ⚠️ **Cosmetic issue** - This is a display string shown in the UI. Will display incorrect URL in production but does NOT affect functionality. |
| `src/components/IntelligentUploadPortal.tsx` | 525 | `<strong>Backend Integration:</strong> Files are uploaded to <code className="bg-secondary px-2 py-0.5 rounded text-xs">http://localhost:8000/api/v1/documents/upload</code>` | ⚠️ **Cosmetic issue** - This is a help text shown in the UI. Will display incorrect URL in production but does NOT affect functionality. |

**Recommendation:** These are informational display strings, not functional code. They should be updated to either:
- Remove the hardcoded URL and show a generic message
- Use `import.meta.env.VITE_API_URL` dynamically

### 1.2 process.env Usage

#### ✅ **NO ISSUES DETECTED**

No instances of `process.env` found in the frontend `src/` directory. The codebase correctly uses Vite's `import.meta.env` convention.

### 1.3 API Configuration Check

#### ✅ **CONFIRMED CORRECT**

**File:** `src/lib/api.ts` (Line 3)
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
```

This is the **correct pattern**:
- Uses `import.meta.env.VITE_API_URL` as the primary source
- Falls back to `http://localhost:8000` only for local development when VITE_API_URL is not set
- The fallback will never be used in production since Coolify sets `VITE_API_URL=https://api.zzpershub.nl` at build time

---

## 2. Frontend Build Correctness

### 2.1 Vite Configuration

#### ✅ **CONFIRMED CORRECT**

**File:** `vite.config.ts`
```typescript
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, PluginOption } from "vite";
// ...
export default defineConfig({
  plugins: [react(), tailwindcss(), ...],
  resolve: { alias: { '@': resolve(projectRoot, 'src') } },
});
```

- Standard Vite configuration
- Uses React with SWC for fast compilation
- Proper alias configuration for `@/` imports

### 2.2 Environment Variable Consumption

#### ✅ **CONFIRMED CORRECT**

The `import.meta.env.VITE_API_URL` is consumed at **build time** in:
- `src/lib/api.ts` (API client configuration)
- `src/ErrorFallback.tsx` (uses `import.meta.env.DEV` for error handling)

Vite replaces all `import.meta.env.VITE_*` references during the build process, making them static strings in the production bundle. This is the correct behavior.

### 2.3 Runtime-Only Env Assumption

#### ✅ **NO ISSUES DETECTED**

No runtime-only environment variable usage detected. All environment variables are correctly consumed at build time using Vite's `import.meta.env` pattern.

---

## 3. Docker Configuration Inspection

### 3.1 Dockerfile.frontend

#### ✅ **CONFIRMED CORRECT (Updated)**

**File:** `Dockerfile.frontend`
```dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Build argument for API URL - REQUIRED, no default
ARG VITE_API_URL

# Build-time check: Fail if VITE_API_URL is not set
RUN test -n "$VITE_API_URL" || (echo "ERROR: VITE_API_URL build argument is required." && exit 1)

ENV VITE_API_URL=$VITE_API_URL

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Analysis:**
- ✅ Multi-stage build (efficient image size)
- ✅ `VITE_API_URL` is a **required** build argument (no default value)
- ✅ Build fails with clear error if `VITE_API_URL` is not set
- ✅ Production stage uses nginx:alpine
- ✅ Exposes port 80 correctly
- ✅ Copies nginx.conf to correct location

**Coolify Integration:**
When deploying on Coolify, set the build argument:
```
VITE_API_URL=https://api.zzpershub.nl
```

### 3.2 Nginx Configuration

#### ✅ **CONFIRMED CORRECT**

**File:** `nginx.conf`
```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Handle SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Don't cache HTML
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }
}
```

**Analysis:**
- ✅ Listens on port 80 (matches Dockerfile EXPOSE)
- ✅ `server_name localhost` is fine - Coolify handles domain routing externally
- ✅ SPA routing configured with `try_files $uri $uri/ /index.html`
- ✅ Proper caching for static assets
- ✅ No caching for HTML (ensures fresh content)
- ✅ Gzip compression enabled
- ✅ **NO reverse proxy conflicts** - Nginx serves static files only, API calls go directly from browser to backend

### 3.3 Port Configuration

#### ✅ **CONFIRMED CORRECT**

| Component | Port | Status |
|-----------|------|--------|
| nginx (Dockerfile) | EXPOSE 80 | ✅ |
| nginx.conf | listen 80 | ✅ |
| Coolify frontend | Maps to 80 | ✅ |

---

## 4. Backend API Route Alignment

### 4.1 Frontend API Endpoints Used

**File:** `src/lib/api.ts`

| Frontend Endpoint | Backend Route | Status |
|-------------------|---------------|--------|
| `POST /token` | `/token` (root level OAuth2) | ✅ Match |
| `POST /api/v1/auth/register` | `/api/v1/auth/register` | ✅ Match |
| `GET /api/v1/auth/me` | `/api/v1/auth/me` | ✅ Match |
| `GET /api/v1/transactions/stats` | `/api/v1/transactions/stats` | ✅ Match |
| `GET /api/v1/transactions` | `/api/v1/transactions` | ✅ Match |
| `GET /api/v1/transactions/{id}` | `/api/v1/transactions/{id}` | ✅ Match |
| `PUT /api/v1/transactions/{id}` | `/api/v1/transactions/{id}` | ✅ Match |
| `POST /api/v1/transactions/{id}/approve` | `/api/v1/transactions/{id}/approve` | ✅ Match |
| `POST /api/v1/transactions/{id}/reject` | `/api/v1/transactions/{id}/reject` | ✅ Match |
| `DELETE /api/v1/transactions/{id}` | `/api/v1/transactions/{id}` | ✅ Match |
| `POST /api/v1/transactions/{id}/post` | `/api/v1/transactions/{id}/post` | ✅ Match |
| `POST /api/v1/administrations` | `/api/v1/administrations` | ✅ Match |
| `GET /api/v1/administrations` | `/api/v1/administrations` | ✅ Match |
| `GET /api/v1/administrations/{id}` | `/api/v1/administrations/{id}` | ✅ Match |
| `POST /api/v1/documents/upload` | `/api/v1/documents/upload` | ✅ Match |
| `GET /api/v1/documents` | `/api/v1/documents` | ✅ Match |
| `GET /api/v1/documents/{id}` | `/api/v1/documents/{id}` | ✅ Match |
| `POST /api/v1/documents/{id}/reprocess` | `/api/v1/documents/{id}/reprocess` | ✅ Match |
| `GET /api/v1/accountant/dashboard` | `/api/v1/accountant/dashboard` | ✅ Match |
| `GET /api/v1/accountant/dashboard/client/{id}/issues` | `/api/v1/accountant/dashboard/client/{id}/issues` | ✅ Match |
| `GET /health` | `/health` | ✅ Match |
| All other `/api/v1/accountant/*` endpoints | Various accountant routes | ✅ Match |
| All `/api/v1/ops/*` endpoints | Observability routes | ✅ Match |

### 4.2 Backend Route Registration

**File:** `backend/app/main.py`
```python
api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_v1_router.include_router(administrations.router, prefix="/administrations", tags=["administrations"])
api_v1_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_v1_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_v1_router.include_router(dashboard.router, prefix="/accountant", tags=["accountant-dashboard"])
# ... more routes

app.include_router(api_v1_router)

# Token endpoint at root level for OAuth2 compatibility
app.include_router(auth.router, tags=["auth"])

@app.get("/health")
async def health_check():
    # ...
```

#### ✅ **ALL ROUTES ALIGNED**

---

## 5. Production Blockers Check

### 5.1 CORS Configuration

#### ⚠️ **POTENTIAL ISSUE - Default CORS Origins**

**File:** `backend/app/core/config.py`
```python
CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
```

**Analysis:**
- Default values are for local development only
- **For production**, you MUST set the `CORS_ORIGINS` environment variable to include:
  ```
  CORS_ORIGINS=https://zzpershub.nl
  ```

**Backend CORS Middleware Configuration:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Status:** 
- ✅ CORS middleware is properly configured
- ⚠️ **ACTION REQUIRED:** Ensure Coolify sets `CORS_ORIGINS=https://zzpershub.nl` for the backend service

### 5.2 Mixed HTTP/HTTPS Usage

#### ✅ **NO ISSUES DETECTED**

The only hardcoded `http://` references are:
1. **Default fallback values** for local development (will be overridden in production)
2. **UI display strings** (cosmetic only, do not affect functionality)

The actual API calls use `import.meta.env.VITE_API_URL` which will be `https://api.zzpershub.nl` in production.

### 5.3 Browser Security Issues

#### ✅ **NO ISSUES DETECTED**

- No hardcoded localhost in functional code
- No insecure origins in API configuration
- HTTPS will be used in production (via Coolify's reverse proxy and domain configuration)

---

## 6. Summary

### ✅ Confirmed Correct Items

| Item | Status |
|------|--------|
| API configuration uses `import.meta.env.VITE_API_URL` | ✅ |
| No `process.env` usage in frontend | ✅ |
| Vite build conventions followed | ✅ |
| Environment variables consumed at build time | ✅ |
| Dockerfile.frontend properly configured | ✅ |
| Nginx configuration correct | ✅ |
| Port 80 exposed and listened correctly | ✅ |
| No reverse proxy conflicts | ✅ |
| All frontend API endpoints match backend routes | ✅ |
| Backend CORS middleware configured | ✅ |
| No mixed HTTP/HTTPS in functional code | ✅ |
| No browser security issues in functional code | ✅ |

### ⚠️ Potential Risks

| Issue | File | Line | Description | Severity |
|-------|------|------|-------------|----------|
| Hardcoded localhost in UI text | `src/components/LoginPage.tsx` | 209 | Display string shows `http://localhost:8000` | Low - Cosmetic only |
| Hardcoded localhost in UI text | `src/components/IntelligentUploadPortal.tsx` | 525 | Display string shows `http://localhost:8000/api/v1/documents/upload` | Low - Cosmetic only |
| Default CORS origins | `backend/app/core/config.py` | 37 | Defaults to localhost, must be set in production | Medium - Configuration required |

### 🛑 Items That WILL Break Production (If Not Addressed)

| Issue | Resolution |
|-------|------------|
| **CORS_ORIGINS not set for production** | Set `CORS_ORIGINS=https://zzpershub.nl` in Coolify backend environment variables |
| **VITE_API_URL not set at build time** | Set `VITE_API_URL=https://api.zzpershub.nl` as a build argument in Coolify frontend configuration |

---

## 7. Production Deployment Checklist

### Coolify Frontend Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| **Domain** | `zzpershub.nl` | Enter WITHOUT `https://` prefix |
| **Domain** (www) | `www.zzpershub.nl` | Enter WITHOUT `https://` prefix |
| **Force HTTPS** | ✅ Enabled | Coolify handles SSL certificates |
| **Build Argument** | `VITE_API_URL=https://api.zzpershub.nl` | ⚠️ REQUIRED - Must be set as **Buildtime** variable |
| **Inject Build Args** | ✅ Enabled | Ensures build args are passed to Docker build |
| **Port** | `80` | Container port (Coolify maps to 443 via SSL) |

**After updating settings:**
1. Disable build cache (one-time only)
2. Trigger a new deployment
3. Re-enable build cache for future builds

### Coolify Backend Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| **Domain** | `api.zzpershub.nl` | Enter WITHOUT `https://` prefix |
| **Force HTTPS** | ✅ Enabled | Coolify handles SSL certificates |
| **Environment Variable** | `CORS_ORIGINS=https://zzpershub.nl,https://www.zzpershub.nl` | Both domains for CORS |
| **Environment Variable** | `SECRET_KEY=<secure-random-value>` | Generate with `openssl rand -hex 32` |
| **Environment Variable** | `DATABASE_URL=postgresql://...` | Your PostgreSQL connection string |
| **Environment Variable** | `REDIS_URL=redis://...` | Your Redis connection string |
| **Port** | `8000` | Container port |

### Post-Deployment Verification
- [ ] Test health endpoint: `curl https://api.zzpershub.nl/health`
- [ ] Test login flow from frontend at https://zzpershub.nl
- [ ] Verify API calls from browser (check Network tab for CORS errors)
- [ ] Verify document upload functionality
- [ ] Check browser console for any API configuration errors

---

## 8. Conclusion

The codebase is **production-ready** with proper Vite conventions and environment variable handling. The following safeguards are in place:

1. **Build-time validation:** `Dockerfile.frontend` now **requires** `VITE_API_URL` as a build argument (no default value). The build will fail with a clear error message if this is not set.

2. **Runtime validation:** The frontend JavaScript checks if `VITE_API_URL` is missing or points to localhost in production mode, displaying a prominent error banner to users if misconfigured.

3. **Configuration requirements:**
   - **Frontend:** Set `VITE_API_URL=https://api.zzpershub.nl` as a **Buildtime** variable in Coolify with "Inject Build Args" enabled.
   - **Backend:** Set `CORS_ORIGINS=https://zzpershub.nl,https://www.zzpershub.nl` as an environment variable.

**Overall Assessment:** ✅ **READY FOR PRODUCTION** (with noted configuration requirements)
